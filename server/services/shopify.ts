import crypto from 'crypto';
import { decryptToken } from './encryption';
import { normalizePakistaniPhone } from '../utils/phone';
import { toMerchantStartOfDay, DEFAULT_TIMEZONE } from '../utils/timezone';
import { sendOrderStatusWhatsApp } from '../utils/integrations/whatsapp';
import { initializeOrderConfirmation, logConfirmationEvent } from './confirmationEngine';
import { db } from '../db';
import { orders, merchants } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { formatPhoneForWhatsApp } from '../utils/integrations/whatsapp/sender';
import { triggerRobocallForOrder } from './robocallService';

async function handleNewOrderWaResult(
  merchantId: string,
  created: { id: string; orderNumber: string; customerPhone: string | null; customerName: string | null; totalAmount: string | null },
  waResult: any,
) {
  try {
    if (waResult?.notOnWhatsApp) {
      await db.update(orders).set({ waNotOnWhatsApp: true }).where(eq(orders.id, created.id));

      await logConfirmationEvent({
        merchantId,
        orderId: created.id,
        eventType: "WA_NOT_AVAILABLE",
        channel: "whatsapp",
        note: `Number ${created.customerPhone} not on WhatsApp — bypassing to RoboCall`,
        errorDetails: waResult.error,
      }).catch(() => {});

      await db.update(orders).set({
        workflowStatus: "PENDING",
        previousWorkflowStatus: "NEW",
        pendingReason: "Number not on WhatsApp — routed to RoboCall",
        pendingReasonType: "confirmation_pending",
        lastStatusChangedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(orders.id, created.id));

      await syncDirectRobocall(merchantId, created, "WhatsApp unavailable — direct bypass to RoboCall");
      console.log(`[Shopify Sync] Order #${created.orderNumber}: number not on WhatsApp, bypassed to RoboCall`);
    } else if (waResult?.sent) {
      await logConfirmationEvent({
        merchantId,
        orderId: created.id,
        eventType: "WA_SENT",
        channel: "whatsapp",
        note: `Confirmation WhatsApp sent to ${created.customerPhone}`,
      }).catch(() => {});

      const firstRetryDelayHours = waResult.retryAttempts?.[0]?.delayHours ?? null;
      const [merchantData] = await db.select({
        waMaxAttempts: merchants.waMaxAttempts,
        waAttempt2DelayHours: merchants.waAttempt2DelayHours,
      }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
      let nextAttempt: Date | null = null;
      if (firstRetryDelayHours != null) {
        nextAttempt = new Date(Date.now() + firstRetryDelayHours * 60 * 60 * 1000);
      } else if ((merchantData?.waMaxAttempts ?? 3) > 1) {
        const delayHours = merchantData?.waAttempt2DelayHours || 4;
        nextAttempt = new Date(Date.now() + delayHours * 60 * 60 * 1000);
      }

      await db.update(orders).set({
        waAttemptCount: 1,
        waConfirmationSentAt: new Date(),
        waNextAttemptAt: nextAttempt,
        ...(waResult.automationId ? { waAutomationId: waResult.automationId } : {}),
      }).where(eq(orders.id, created.id));
    } else {
      const errorStr = waResult?.error || "";
      const isPermanentError = /\(#100\)|\(#131008\)|\(#132000\)|\(#132001\)|\(#132018\)/.test(errorStr);

      if (isPermanentError) {
        await db.update(orders).set({
          waAttemptCount: 1,
          waNextAttemptAt: null,
          workflowStatus: "PENDING",
          previousWorkflowStatus: "NEW",
          pendingReason: "WhatsApp template error — routed to RoboCall",
          pendingReasonType: "confirmation_pending",
          lastStatusChangedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(orders.id, created.id));

        await logConfirmationEvent({
          merchantId,
          orderId: created.id,
          eventType: "WA_PERMANENT_FAILURE",
          channel: "whatsapp",
          errorDetails: errorStr,
          note: `WhatsApp send failed with permanent error — escalating to RoboCall immediately`,
        }).catch(() => {});

        await syncDirectRobocall(merchantId, created, "WhatsApp template/parameter error — immediate bypass to RoboCall");
        console.log(`[Shopify Sync] Order #${created.orderNumber}: WA permanent error, bypassed to RoboCall`);
      } else {
        const retryAt = new Date(Date.now() + 30 * 60 * 1000);
        await db.update(orders).set({
          waAttemptCount: 1,
          waNextAttemptAt: retryAt,
        }).where(eq(orders.id, created.id));

        await logConfirmationEvent({
          merchantId,
          orderId: created.id,
          eventType: "WA_SENT",
          channel: "whatsapp",
          errorDetails: errorStr || "Unknown error",
          note: `WhatsApp confirmation send failed (transient error) — will retry at ${retryAt.toISOString()}`,
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error(`[Shopify Sync] Error handling WA result for order #${created.orderNumber}:`, err);
  }
}

async function syncDirectRobocall(
  merchantId: string,
  created: { id: string; orderNumber: string; customerPhone: string | null; customerName: string | null; totalAmount: string | null },
  reason: string = "WhatsApp unavailable — bypass to RoboCall",
) {
  const [merchant] = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!merchant) return;

  const order = { id: created.id, merchantId, orderNumber: created.orderNumber, customerPhone: created.customerPhone, totalAmount: created.totalAmount };
  await triggerRobocallForOrder(order, merchant, reason);
}

interface ShopifyConfig {
  clientId: string;
  clientSecret: string;
  appUrl: string;
  redirectUrl: string;
  scopes: string;
  canonicalHost: string;
}

interface ShopifyOrderMetafield {
  key: string;
  value: string;
  namespace: string;
  type: string;
}

interface ShopifyOrder {
  id: number;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
  total_price: string;
  subtotal_price: string;
  total_shipping_price_set?: {
    shop_money: { amount: string; currency_code: string };
  };
  total_discounts: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  cancelled_at: string | null;
  landing_site: string | null;
  referring_site: string | null;
  browser_ip: string | null;
  client_details?: {
    browser_ip: string | null;
    user_agent: string | null;
  } | null;
  customer: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    default_address?: {
      name?: string;
      first_name?: string;
      last_name?: string;
      address1?: string;
      address2?: string | null;
      city?: string;
      province?: string;
      country?: string;
      zip?: string;
      phone?: string | null;
    };
  } | null;
  shipping_address: {
    first_name: string;
    last_name: string;
    name: string;
    address1: string;
    address2: string | null;
    city: string;
    province: string;
    country: string;
    zip: string;
    phone: string | null;
  } | null;
  billing_address: {
    first_name: string;
    last_name: string;
    name: string;
    address1: string;
    address2: string | null;
    city: string;
    province: string;
    country: string;
    zip: string;
    phone: string | null;
  } | null;
  line_items: Array<{
    id: number;
    title: string;
    quantity: number;
    price: string;
    sku: string;
    variant_title: string | null;
  }>;
  tags: string;
  note: string | null;
  note_attributes: Array<{ name: string; value: string }>;
  metafields?: ShopifyOrderMetafield[];
}

interface ShopifyOrdersResponse {
  orders: ShopifyOrder[];
}

export function parseUtmParams(url: string | null): {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  fbClickId: string | null;
} {
  const empty = { utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null, fbClickId: null };
  if (!url) return empty;
  try {
    const fullUrl = url.startsWith('http') ? url : `https://placeholder.com${url.startsWith('/') ? url : '/' + url}`;
    const params = new URL(fullUrl).searchParams;
    return {
      utmSource: params.get('utm_source'),
      utmMedium: params.get('utm_medium'),
      utmCampaign: params.get('utm_campaign'),
      utmContent: params.get('utm_content'),
      utmTerm: params.get('utm_term'),
      fbClickId: params.get('fbclid'),
    };
  } catch {
    return empty;
  }
}

export class ShopifyService {
  private config: ShopifyConfig;
  private hostMismatch: boolean = false;

  constructor() {
    const clientId = process.env.SHOPIFY_APP_CLIENT_ID || '';
    const clientSecret = process.env.SHOPIFY_APP_CLIENT_SECRET || '';
    const appUrl = (process.env.SHOPIFY_APP_URL || '').replace(/\/$/, '');
    const redirectUrl = process.env.SHOPIFY_APP_REDIRECT_URL || '';
    const scopes = process.env.SHOPIFY_APP_SCOPES || 'read_all_orders,read_analytics,read_customers,write_customers,write_draft_orders,read_draft_orders,read_fulfillments,write_fulfillments,read_orders,write_orders,read_order_edits,write_order_edits,read_products,write_products,read_inventory,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders';

    const missing: string[] = [];
    if (!clientId) missing.push('SHOPIFY_APP_CLIENT_ID');
    if (!clientSecret) missing.push('SHOPIFY_APP_CLIENT_SECRET');
    if (!appUrl) missing.push('SHOPIFY_APP_URL');
    if (!redirectUrl) missing.push('SHOPIFY_APP_REDIRECT_URL');
    if (missing.length > 0) {
      console.error(`[Shopify] FATAL: Missing required env vars: ${missing.join(', ')}. OAuth will not work.`);
    }

    let canonicalHost = '';
    try {
      canonicalHost = new URL(appUrl).hostname;
    } catch {
      console.error('[Shopify] SHOPIFY_APP_URL is not a valid URL');
    }

    this.config = {
      clientId,
      clientSecret,
      appUrl,
      redirectUrl,
      scopes,
      canonicalHost,
    };

    const redirectHost = (() => { try { return new URL(redirectUrl).hostname; } catch { return ''; } })();
    this.hostMismatch = false;
    if (canonicalHost && redirectHost && canonicalHost !== redirectHost) {
      console.error(`[Shopify] FATAL: SHOPIFY_APP_URL host (${canonicalHost}) does not match SHOPIFY_APP_REDIRECT_URL host (${redirectHost}). OAuth will fail!`);
      this.hostMismatch = true;
    }

    console.log(`[Shopify] OAuth config: appUrl=${appUrl}, redirectUrl=${redirectUrl}, scopes=${scopes}, canonicalHost=${canonicalHost}, clientIdSet=${!!clientId}, clientSecretSet=${!!clientSecret}`);
  }

  getCanonicalHost(): string {
    return this.config.canonicalHost;
  }

  hasHostMismatch(): boolean {
    return this.hostMismatch;
  }

  getOAuthConfig(shop?: string) {
    const result: Record<string, any> = {
      shopifyClientId: this.config.clientId,
      appUrl: this.config.appUrl,
      redirectUrl: this.config.redirectUrl,
      scopes: this.config.scopes,
      canonicalHost: this.config.canonicalHost,
      clientIdSet: !!this.config.clientId,
      clientSecretSet: !!this.config.clientSecret,
      hostMismatch: this.hostMismatch,
    };
    if (shop) {
      const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        scope: this.config.scopes,
        redirect_uri: this.config.redirectUrl,
        state: 'DEBUG_PREVIEW',
      });
      result.computedAuthorizeUrl = `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;
    }
    return result;
  }

  getInstallUrl(shop: string, state: string, merchantCredentials?: { clientId: string }): string {
    const clientId = merchantCredentials?.clientId || this.config.clientId;
    const params = new URLSearchParams({
      client_id: clientId,
      scope: this.config.scopes,
      redirect_uri: this.config.redirectUrl,
      state: state,
    });
    const authorizeUrl = `https://${shop}/admin/oauth/authorize?${params.toString()}`;
    console.log(`[Shopify OAuth] Authorize URL generated:`);
    console.log(`[Shopify OAuth]   shop=${shop}`);
    console.log(`[Shopify OAuth]   client_id=${clientId}`);
    console.log(`[Shopify OAuth]   redirect_uri=${this.config.redirectUrl}`);
    console.log(`[Shopify OAuth]   scopes=${this.config.scopes}`);
    console.log(`[Shopify OAuth]   source=${merchantCredentials ? 'merchant-specific' : 'env-default'}`);
    console.log(`[Shopify OAuth]   full_url=${authorizeUrl}`);
    return authorizeUrl;
  }

  validateHmac(query: Record<string, string>, merchantCredentials?: { clientSecret: string }): boolean {
    const { hmac, ...rest } = query;
    if (!hmac) return false;

    const secret = merchantCredentials?.clientSecret || this.config.clientSecret;
    const sortedKeys = Object.keys(rest).sort();
    const message = sortedKeys.map(key => `${key}=${rest[key]}`).join('&');
    
    const generatedHmac = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(hmac, 'hex'),
      Buffer.from(generatedHmac, 'hex')
    );
  }

  async exchangeCodeForToken(shop: string, code: string, merchantCredentials?: { clientId: string; clientSecret: string }): Promise<{ accessToken: string; scope: string }> {
    const clientId = merchantCredentials?.clientId || this.config.clientId;
    const clientSecret = merchantCredentials?.clientSecret || this.config.clientSecret;
    const url = `https://${shop}/admin/oauth/access_token`;
    
    console.log(`[Shopify OAuth] Exchanging code for token: shop=${shop}, client_id=${clientId}, source=${merchantCredentials ? 'merchant-specific' : 'env-default'}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange code for token: ${errorText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      scope: data.scope,
    };
  }

  private getAuthHeaders(accessToken: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (accessToken.includes(':')) {
      const [apiKey, apiPassword] = accessToken.split(':');
      const credentials = Buffer.from(`${apiKey}:${apiPassword}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    } else {
      headers['X-Shopify-Access-Token'] = accessToken;
    }

    return headers;
  }

  private parseNextPageUrl(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    
    const links = linkHeader.split(',');
    for (const link of links) {
      const match = link.match(/<([^>]+)>;\s*rel="next"/);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getRateLimitDelay(response: Response): number {
    const callLimit = response.headers.get('X-Shopify-Shop-Api-Call-Limit');
    if (callLimit) {
      const [current, max] = callLimit.split('/').map(Number);
      const usage = current / max;
      if (usage > 0.8) {
        return 1000;
      } else if (usage > 0.5) {
        return 500;
      }
    }
    return 250;
  }

  async fetchAllOrders(shop: string, accessToken: string, params: {
    status?: string;
    created_at_min?: string;
    updated_at_min?: string;
  } = {}): Promise<ShopifyOrder[]> {
    const allOrders: ShopifyOrder[] = [];
    const headers = this.getAuthHeaders(accessToken);
    
    const queryParams = new URLSearchParams({
      limit: '250',
      status: params.status || 'any',
      order: 'created_at asc',
    });

    if (params.created_at_min) {
      queryParams.set('created_at_min', params.created_at_min);
    }

    if (params.updated_at_min) {
      queryParams.set('updated_at_min', params.updated_at_min);
    }

    let url: string | null = `https://${shop}/admin/api/2025-01/orders.json?${queryParams.toString()}`;
    let pageCount = 0;
    let retryCount = 0;
    const maxRetries = 3;

    console.log(`[Shopify] Starting paginated fetch from ${shop}...`);

    while (url) {
      pageCount++;
      console.log(`[Shopify] Fetching page ${pageCount}... (${allOrders.length} orders so far)`);

      try {
        const response = await fetch(url, { headers });

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
          console.log(`[Shopify] Rate limited, waiting ${delay}ms before retry...`);
          await this.sleep(delay);
          retryCount++;
          if (retryCount > maxRetries) {
            throw new Error('Max retries exceeded due to rate limiting');
          }
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch orders: ${response.status} ${errorText}`);
        }

        retryCount = 0;
        const data: ShopifyOrdersResponse = await response.json();
        
        allOrders.push(...data.orders);

        const linkHeader = response.headers.get('Link');
        url = this.parseNextPageUrl(linkHeader);

        if (url) {
          const delay = this.getRateLimitDelay(response);
          await this.sleep(delay);
        }
      } catch (error) {
        console.error(`[Shopify] Error fetching page ${pageCount}:`, error);
        retryCount++;
        if (retryCount > maxRetries) {
          throw error;
        }
        await this.sleep(1000 * retryCount);
      }
    }

    console.log(`[Shopify] Fetched ${allOrders.length} total orders in ${pageCount} pages`);
    return allOrders;
  }

  async fetchOrders(shop: string, accessToken: string, params: {
    limit?: number;
    status?: string;
    since_id?: string;
    created_at_min?: string;
  } = {}): Promise<ShopifyOrder[]> {
    const queryParams = new URLSearchParams({
      limit: String(params.limit || 50),
      status: params.status || 'any',
    });

    if (params.since_id) {
      queryParams.set('since_id', params.since_id);
    }
    if (params.created_at_min) {
      queryParams.set('created_at_min', params.created_at_min);
    }

    const url = `https://${shop}/admin/api/2025-01/orders.json?${queryParams.toString()}`;
    const headers = this.getAuthHeaders(accessToken);

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch orders: ${response.status} ${errorText}`);
    }

    const data: ShopifyOrdersResponse = await response.json();
    return data.orders;
  }

  async syncOrders(merchantId: string, shopDomain: string, forceFullSync: boolean = false, onProgress?: (processed: number, total: number) => void): Promise<{ synced: number; updated: number; total: number }> {
    const { storage } = await import('../storage');
    const store = await storage.getShopifyStore(merchantId);
    
    if (!store || !store.isConnected || !store.accessToken) {
      throw new Error("Shopify store is not connected or missing access token");
    }

    const plainToken = decryptToken(store.accessToken);
    const isIncremental = !forceFullSync && store.lastSyncAt != null;
    const syncStartTime = new Date();

    const merchant = await storage.getMerchant(merchantId);
    const tz = (merchant as any)?.timezone || DEFAULT_TIMEZONE;
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const syncFromDateStr = merchant?.shopifySyncFromDate
      ? new Date(merchant.shopifySyncFromDate).toISOString().split('T')[0]
      : yearStart;
    const MIN_ORDER_DATE = toMerchantStartOfDay(syncFromDateStr, tz);

    let fetchParams: { status?: string; updated_at_min?: string; created_at_min?: string } = {
      status: 'any',
    };

    let shopifyOrders: ShopifyOrder[];

    if (isIncremental) {
      const lastSyncDate = new Date(store.lastSyncAt!);
      lastSyncDate.setHours(lastSyncDate.getHours() - 1);
      fetchParams.updated_at_min = lastSyncDate.toISOString();

      const updatedOrders = await this.fetchAllOrders(shopDomain, plainToken, fetchParams);

      const createdOrders = await this.fetchAllOrders(shopDomain, plainToken, {
        status: 'any',
        created_at_min: lastSyncDate.toISOString(),
      });

      const seenIds = new Set<number>();
      shopifyOrders = [];
      for (const o of [...updatedOrders, ...createdOrders]) {
        if (!seenIds.has(o.id)) {
          seenIds.add(o.id);
          shopifyOrders.push(o);
        }
      }
    } else {
      fetchParams.created_at_min = MIN_ORDER_DATE;
      console.log(`[Shopify] Starting FULL sync for merchant ${merchantId} from ${MIN_ORDER_DATE}...`);
      shopifyOrders = await this.fetchAllOrders(shopDomain, plainToken, fetchParams);
    }
    
    if (shopifyOrders.length === 0 && isIncremental) {
      await storage.updateShopifyStore(store.id, { lastSyncAt: syncStartTime });
      return { synced: 0, updated: 0, total: 0 };
    }
    
    if (shopifyOrders.length > 0 || !isIncremental) {
      console.log(`[Shopify] Fetched ${shopifyOrders.length} orders (${isIncremental ? 'incremental' : 'full'} sync), processing...`);
    }

    if (onProgress) onProgress(0, shopifyOrders.length);
    
    const allShopifyIds = shopifyOrders.map(o => String(o.id));
    const existingOrdersMap = await storage.getExistingOrdersByShopifyIds(merchantId, allShopifyIds);
    const courierConfirmedIds = await storage.getOrdersWithCourierStatus(merchantId, allShopifyIds);
    const managedWorkflowIds = await storage.getOrdersInManagedWorkflow(merchantId, allShopifyIds);
    
    // Build product image map for enriching line items
    const allProductIds = new Set<string>();
    for (const shopifyOrder of shopifyOrders) {
      for (const item of (shopifyOrder as any).line_items || []) {
        if (item.product_id) allProductIds.add(String(item.product_id));
      }
    }
    const productImageMap = new Map<string, string>();
    if (allProductIds.size > 0) {
      try {
        const matchedProducts = await storage.getProductsByShopifyIds(merchantId, Array.from(allProductIds));
        for (const p of matchedProducts) {
          if (p.imageUrl) productImageMap.set(p.shopifyProductId, p.imageUrl);
        }
      } catch (e) {
        // Products table may not be populated yet, continue without images
      }
    }

    let newCount = 0;
    let updatedCount = 0;
    let processedCount = 0;
    const now = new Date();

    const minOrderDate = new Date(MIN_ORDER_DATE);

    interface PendingNewOrder {
      createData: any;
      initialWorkflowStatus: string;
      tags: string[];
    }

    interface PendingUpdate {
      existingOrderId: string;
      updateData: any;
      initialWorkflowStatus: string;
      shopifyOrder: ShopifyOrder;
      transformedOrder: any;
      hasCourierStatus: boolean;
    }

    const pendingNewOrders: PendingNewOrder[] = [];
    const pendingUpdates: PendingUpdate[] = [];

    for (const shopifyOrder of shopifyOrders) {
      processedCount++;
      if (processedCount % 10 === 0 && onProgress) {
        onProgress(processedCount, shopifyOrders.length);
      }
      const orderCreatedAt = new Date(shopifyOrder.created_at);
      if (orderCreatedAt < minOrderDate) {
        continue;
      }

      const shopifyOrderId = String(shopifyOrder.id);
      (shopifyOrder as any)._shopDomain = shopDomain;
      const transformedOrder = this.transformOrderForStorage(shopifyOrder);
      
      if (transformedOrder.lineItems && Array.isArray(transformedOrder.lineItems) && productImageMap.size > 0) {
        transformedOrder.lineItems = (transformedOrder.lineItems as any[]).map((item: any) => {
          if (!item.image && item.productId && productImageMap.has(item.productId)) {
            return { ...item, image: productImageMap.get(item.productId) };
          }
          return item;
        });
      }

      const existingOrderId = existingOrdersMap.get(shopifyOrderId);
      const hasCourierStatus = courierConfirmedIds.has(shopifyOrderId);
      const isInManagedWorkflow = managedWorkflowIds.has(shopifyOrderId);
      
      const initialWorkflowStatus = this.determineWorkflowStatus(shopifyOrder);

      if (existingOrderId) {
        const updateData: any = {
          customerName: transformedOrder.customerName,
          customerEmail: transformedOrder.customerEmail,
          customerPhone: transformedOrder.customerPhone,
          shippingAddress: transformedOrder.shippingAddress,
          city: transformedOrder.city,
          province: transformedOrder.province,
          postalCode: transformedOrder.postalCode,
          country: transformedOrder.country,
          totalAmount: transformedOrder.totalAmount,
          subtotalAmount: transformedOrder.subtotalAmount,
          shippingAmount: transformedOrder.shippingAmount,
          discountAmount: transformedOrder.discountAmount,
          currency: transformedOrder.currency,
          paymentMethod: transformedOrder.paymentMethod,
          paymentStatus: transformedOrder.paymentStatus,
          fulfillmentStatus: transformedOrder.fulfillmentStatus,
          orderStatus: transformedOrder.orderStatus,
          lineItems: transformedOrder.lineItems,
          itemSummary: transformedOrder.itemSummary,
          totalQuantity: transformedOrder.totalQuantity,
          tags: transformedOrder.tags,
          notes: transformedOrder.notes,
          landingSite: transformedOrder.landingSite,
          referringSite: transformedOrder.referringSite,
          browserIp: transformedOrder.browserIp,
          rawShopifyData: transformedOrder.rawShopifyData,
          lastApiSyncAt: now,
          shopifyUpdatedAt: new Date(shopifyOrder.updated_at),
        };
        
        if (!hasCourierStatus && !isInManagedWorkflow) {
          updateData.shipmentStatus = transformedOrder.shipmentStatus;
        }

        pendingUpdates.push({
          existingOrderId,
          updateData,
          initialWorkflowStatus,
          shopifyOrder,
          transformedOrder,
          hasCourierStatus,
        });
      } else {
        const isPrepaidNew = transformedOrder.paymentMethod === 'prepaid';
        const createData: any = {
          ...transformedOrder,
          merchantId,
          workflowStatus: initialWorkflowStatus,
          lastApiSyncAt: now,
          shopifyUpdatedAt: new Date(shopifyOrder.updated_at),
          codRemaining: isPrepaidNew ? "0" : transformedOrder.totalAmount,
          prepaidAmount: isPrepaidNew ? transformedOrder.totalAmount : "0",
          codPaymentStatus: isPrepaidNew ? "PAID" : "UNPAID",
        };
        if (initialWorkflowStatus === 'CANCELLED') {
          createData.cancelledAt = shopifyOrder.cancelled_at ? new Date(shopifyOrder.cancelled_at) : now;
          createData.cancelReason = 'Cancelled in Shopify';
        }
        if (initialWorkflowStatus === 'BOOKED') {
          if (!createData.shipmentStatus || createData.shipmentStatus === 'Unfulfilled' || createData.shipmentStatus === 'pending') {
            createData.shipmentStatus = 'BOOKED';
          }
        }
        pendingNewOrders.push({ createData, initialWorkflowStatus, tags: transformedOrder.tags });
      }
    }

    const BULK_INSERT_SIZE = 50;
    for (let i = 0; i < pendingNewOrders.length; i += BULK_INSERT_SIZE) {
      const batch = pendingNewOrders.slice(i, i + BULK_INSERT_SIZE);
      const createDataBatch = batch.map(item => item.createData);
      try {
        const createdOrders = await storage.createOrdersBulk(createDataBatch);
        newCount += createdOrders.length;

        const createdByShopifyId = new Map(createdOrders.map(o => [o.shopifyOrderId, o]));
        const postCreatePromises: Promise<void>[] = [];
        for (const pending of batch) {
          const created = createdByShopifyId.get(pending.createData.shopifyOrderId);
          if (created?.id && pending.initialWorkflowStatus === 'NEW') {
            postCreatePromises.push(
              (async () => {
                try {
                  const { applyRoboTags } = await import('./workflowTransition');
                  await applyRoboTags(merchantId, created.id, pending.tags);
                } catch (e) {}
                initializeOrderConfirmation({
                  merchantId,
                  orderId: created.id,
                  orderNumber: created.orderNumber,
                }).catch(err => console.error(`[Shopify Sync] Confirmation init failed for ${created.orderNumber}:`, err));

                try {
                  const waResult = await sendOrderStatusWhatsApp({
                    merchantId,
                    orderId: created.id,
                    orderNumber: created.orderNumber,
                    customerPhone: created.customerPhone,
                    customerName: created.customerName,
                    fromStatus: '',
                    toStatus: 'NEW',
                    city: created.city,
                    shippingAddress: created.shippingAddress,
                    totalAmount: created.totalAmount,
                    itemSummary: created.itemSummary,
                    lineItems: Array.isArray(created.lineItems) ? (created.lineItems as any[]) : null,
                    shopDomain: (created as any).shopDomain || shopDomain,
                  });
                  await handleNewOrderWaResult(merchantId, created, waResult);
                } catch (e) {
                  console.error(`[Shopify Sync] WA send/handling error for order #${created.orderNumber}:`, e);
                }
              })()
            );
          }
        }
        if (postCreatePromises.length > 0) {
          await Promise.allSettled(postCreatePromises);
        }
      } catch (e) {
        console.error(`[Shopify] Error in bulk insert batch (${batch.length} orders):`, e);
        for (const item of batch) {
          try {
            const created = await storage.createOrder(item.createData);
            if (created?.id && item.initialWorkflowStatus === 'NEW') {
              try {
                const { applyRoboTags } = await import('./workflowTransition');
                await applyRoboTags(merchantId, created.id, item.tags);
              } catch (e2) {}
              initializeOrderConfirmation({
                merchantId,
                orderId: created.id,
                orderNumber: created.orderNumber,
              }).catch(err => console.error(`[Shopify Sync] Confirmation init failed for ${created.orderNumber}:`, err));

              try {
                const waResult = await sendOrderStatusWhatsApp({
                  merchantId,
                  orderId: created.id,
                  orderNumber: created.orderNumber,
                  customerPhone: created.customerPhone,
                  customerName: created.customerName,
                  fromStatus: '',
                  toStatus: 'NEW',
                  city: created.city,
                  shippingAddress: created.shippingAddress,
                  totalAmount: created.totalAmount,
                  itemSummary: created.itemSummary,
                  lineItems: Array.isArray(created.lineItems) ? (created.lineItems as any[]) : null,
                  shopDomain: (created as any).shopDomain || shopDomain,
                });
                await handleNewOrderWaResult(merchantId, created, waResult);
              } catch (e2) {
                console.error(`[Shopify Sync] WA send/handling error for order #${created.orderNumber}:`, e2);
              }
            }
            newCount++;
          } catch (e2) {
            console.error(`[Shopify] Error creating order individually:`, e2);
          }
        }
      }
      if (newCount % 100 === 0 && newCount > 0) {
        console.log(`[Shopify] Inserted ${newCount}/${pendingNewOrders.length} new orders...`);
      }
    }

    if (pendingUpdates.length > 0) {
      const existingOrderIds = pendingUpdates.map(u => u.existingOrderId);
      const existingOrdersList = await storage.getOrdersByIds(merchantId, existingOrderIds);
      const existingOrdersById = new Map<string, any>();
      for (const o of existingOrdersList) {
        existingOrdersById.set(o.id, o);
      }

      const PARALLEL_UPDATE_SIZE = 10;
      for (let i = 0; i < pendingUpdates.length; i += PARALLEL_UPDATE_SIZE) {
        const batch = pendingUpdates.slice(i, i + PARALLEL_UPDATE_SIZE);
        const updatePromises = batch.map(async (pending) => {
          const { existingOrderId, updateData, initialWorkflowStatus, shopifyOrder, transformedOrder } = pending;

          const isPrepaid = transformedOrder.paymentMethod === 'prepaid';
          const existingOrder = existingOrdersById.get(existingOrderId);
          if (isPrepaid && existingOrder && existingOrder.paymentMethod !== 'prepaid') {
            updateData.codRemaining = "0";
            updateData.prepaidAmount = transformedOrder.totalAmount;
            updateData.codPaymentStatus = "PAID";
          }

          await storage.updateOrder(merchantId, existingOrderId, updateData);

          try {
            const { transitionOrder, applyRoboTags } = await import('./workflowTransition');
            
            if (initialWorkflowStatus === 'CANCELLED') {
              await transitionOrder({
                merchantId,
                orderId: existingOrderId,
                toStatus: 'CANCELLED',
                action: 'shopify_sync',
                actorType: 'system',
                reason: 'Cancelled in Shopify',
                extraData: {
                  cancelledAt: shopifyOrder.cancelled_at ? new Date(shopifyOrder.cancelled_at) : now,
                  cancelReason: 'Cancelled in Shopify',
                },
              });
            } else if (initialWorkflowStatus === 'BOOKED') {
              const preBookedStates = ['NEW', 'PENDING', 'HOLD', 'READY_TO_SHIP'];
              if (existingOrder && preBookedStates.includes(existingOrder.workflowStatus)) {
                const bookedFields: Record<string, any> = {
                  shipmentStatus: 'BOOKED',
                  bookingStatus: 'BOOKED',
                  bookedAt: existingOrder.bookedAt || now,
                };
                await storage.updateOrder(merchantId, existingOrderId, bookedFields);

                await transitionOrder({
                  merchantId,
                  orderId: existingOrderId,
                  toStatus: 'BOOKED',
                  action: 'shopify_sync',
                  actorType: 'system',
                  reason: `Fulfilled in Shopify - moved to BOOKED (was ${existingOrder.workflowStatus} in 1SOL.AI)`,
                });
              }
            }
            
            if (initialWorkflowStatus !== 'CANCELLED') {
              await applyRoboTags(merchantId, existingOrderId, transformedOrder.tags);
            }
          } catch (e) {
            console.error(`[Shopify] Error processing workflow for order ${existingOrderId}:`, e);
          }
        });

        const results = await Promise.allSettled(updatePromises);
        for (const result of results) {
          if (result.status === 'fulfilled') {
            updatedCount++;
          } else {
            console.error(`[Shopify] Update failed:`, result.reason);
          }
        }
      }
      if (updatedCount > 0) {
        console.log(`[Shopify] Updated ${updatedCount}/${pendingUpdates.length} existing orders`);
      }
    }

    console.log(`[Shopify] ${isIncremental ? 'Incremental' : 'Full'} sync complete: ${newCount} new, ${updatedCount} updated, ${shopifyOrders.length} total fetched`);

    await storage.getDashboardStats(merchantId);
    await storage.updateShopifyStore(store.id, { lastSyncAt: syncStartTime });
    return { synced: newCount, updated: updatedCount, total: shopifyOrders.length };
  }

  determineWorkflowStatus(shopifyOrder: ShopifyOrder): string {
    if (shopifyOrder.cancelled_at) {
      return 'CANCELLED';
    }
    if (shopifyOrder.fulfillment_status === 'fulfilled') {
      return 'BOOKED';
    }
    return 'NEW';
  }

  transformOrderForStorage(shopifyOrder: ShopifyOrder): {
    shopifyOrderId: string;
    orderNumber: string;
    customerName: string;
    customerEmail: string | null;
    customerPhone: string | null;
    shippingAddress: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    country: string;
    totalAmount: string;
    subtotalAmount: string;
    shippingAmount: string;
    discountAmount: string;
    currency: string;
    paymentMethod: string;
    paymentStatus: string;
    fulfillmentStatus: string;
    orderStatus: string;
    shipmentStatus: string;
    lineItems: Array<{ name: string; quantity: number; price: number; sku?: string; variantTitle?: string }>;
    itemSummary: string;
    tags: string[];
    notes: string | null;
    orderDate: Date;
    courierName: string | null;
    courierTracking: string | null;
    totalQuantity: number;
    landingSite: string | null;
    referringSite: string | null;
    browserIp: string | null;
    rawShopifyData: Record<string, any>;
  } {
    const customer = shopifyOrder.customer;
    const shippingAddr = shopifyOrder.shipping_address;
    const billingAddr = shopifyOrder.billing_address;
    
    const getNoteAttribute = (patterns: string[]): string | null => {
      if (!shopifyOrder.note_attributes || !Array.isArray(shopifyOrder.note_attributes)) {
        return null;
      }
      for (const attr of shopifyOrder.note_attributes) {
        const name = attr.name?.toLowerCase() || '';
        for (const pattern of patterns) {
          if (name.includes(pattern.toLowerCase())) {
            return attr.value?.trim() || null;
          }
        }
      }
      return null;
    };
    
    const noteFirstName = getNoteAttribute(['first name', 'first_name']);
    const noteLastName = getNoteAttribute(['last name', 'last_name']);
    const noteFullName = noteFirstName && noteLastName 
      ? `${noteFirstName} ${noteLastName}`.trim() 
      : noteFirstName || noteLastName || null;
    const notePhone = getNoteAttribute(['mobile', 'phone', 'contact']);
    const noteAddress = getNoteAttribute(['full address', 'address', 'ایڈریس']);
    const noteCity = getNoteAttribute(['city', 'شہر']);

    const isMeaningful = (val: string | null | undefined): val is string => {
      return Boolean(val && val.trim().length > 0);
    };

    const defaultAddr = customer?.default_address;

    let customerName = 'Unknown';
    
    if (isMeaningful(shippingAddr?.name)) {
      customerName = shippingAddr.name.trim();
    } else if (isMeaningful(shippingAddr?.first_name) || isMeaningful(shippingAddr?.last_name)) {
      customerName = `${shippingAddr?.first_name || ''} ${shippingAddr?.last_name || ''}`.trim();
    } 
    else if (isMeaningful(customer?.first_name) || isMeaningful(customer?.last_name)) {
      customerName = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim();
    } 
    else if (isMeaningful(billingAddr?.name)) {
      customerName = billingAddr.name.trim();
    } else if (isMeaningful(billingAddr?.first_name) || isMeaningful(billingAddr?.last_name)) {
      customerName = `${billingAddr?.first_name || ''} ${billingAddr?.last_name || ''}`.trim();
    }
    else if (isMeaningful(defaultAddr?.name)) {
      customerName = defaultAddr.name!.trim();
    } else if (isMeaningful(defaultAddr?.first_name) || isMeaningful(defaultAddr?.last_name)) {
      customerName = `${defaultAddr?.first_name || ''} ${defaultAddr?.last_name || ''}`.trim();
    }
    else if (isMeaningful(noteFullName)) {
      customerName = noteFullName.trim();
    }

    let customerPhone: string | null = null;
    if (isMeaningful(shippingAddr?.phone)) {
      customerPhone = shippingAddr.phone.trim();
    } else if (isMeaningful(customer?.phone)) {
      customerPhone = customer.phone.trim();
    } else if (isMeaningful(billingAddr?.phone)) {
      customerPhone = billingAddr.phone.trim();
    } else if (isMeaningful(defaultAddr?.phone)) {
      customerPhone = defaultAddr.phone!.trim();
    } else if (isMeaningful((shopifyOrder as any).phone)) {
      customerPhone = (shopifyOrder as any).phone.trim();
    } else if (isMeaningful(notePhone)) {
      customerPhone = notePhone.trim();
    }
    customerPhone = normalizePakistaniPhone(customerPhone);

    const customerEmail = customer?.email?.trim() || shopifyOrder.email?.trim() || (shopifyOrder as any).contact_email?.trim() || null;

    const city = (isMeaningful(shippingAddr?.city) ? shippingAddr.city.trim() : null) 
      || (isMeaningful(billingAddr?.city) ? billingAddr.city.trim() : null) 
      || (isMeaningful(defaultAddr?.city) ? defaultAddr.city.trim() : null) 
      || (isMeaningful(noteCity) ? noteCity.trim() : null);
    const province = shippingAddr?.province || billingAddr?.province || defaultAddr?.province || null;
    const postalCode = shippingAddr?.zip || billingAddr?.zip || defaultAddr?.zip || null;
    const country = shippingAddr?.country || billingAddr?.country || defaultAddr?.country || 'Pakistan';

    let fullAddress: string | null = null;
    if (isMeaningful(shippingAddr?.address1)) {
      const addressParts = [
        shippingAddr.address1,
        shippingAddr.address2,
      ].filter(p => isMeaningful(p));
      fullAddress = addressParts.join(', ').trim() || null;
    } else if (isMeaningful(billingAddr?.address1)) {
      const addressParts = [
        billingAddr.address1,
        billingAddr.address2,
      ].filter(p => isMeaningful(p));
      fullAddress = addressParts.join(', ').trim() || null;
    } else if (isMeaningful(defaultAddr?.address1)) {
      const addressParts = [
        defaultAddr.address1,
        defaultAddr.address2,
      ].filter(p => isMeaningful(p));
      fullAddress = addressParts.join(', ').trim() || null;
    } else if (isMeaningful(noteAddress)) {
      fullAddress = noteAddress.trim();
    }

    const totalQuantity = shopifyOrder.line_items.reduce((sum, item) => sum + item.quantity, 0);

    const itemSummary = shopifyOrder.line_items
      .map(item => {
        const variant = item.variant_title ? ` - ${item.variant_title}` : "";
        return `${item.title}${variant} x ${item.quantity}`;
      })
      .join(' || ');

    const isCod = shopifyOrder.financial_status === 'pending' || 
                  shopifyOrder.tags.toLowerCase().includes('cod');

    const paymentStatus = shopifyOrder.financial_status === 'paid' ? 'paid' : 'pending';
    
    const fulfillmentStatus = shopifyOrder.fulfillment_status || 'unfulfilled';
    
    let orderStatus: string = 'pending';
    if (fulfillmentStatus === 'fulfilled') {
      orderStatus = 'delivered';
    } else if (fulfillmentStatus === 'partial') {
      orderStatus = 'processing';
    } else if (paymentStatus === 'paid') {
      orderStatus = 'confirmed';
    }

    const shippingAmount = shopifyOrder.total_shipping_price_set?.shop_money?.amount || '0';

    const landingSite = shopifyOrder.landing_site || null;
    const referringSite = shopifyOrder.referring_site || null;
    const browserIp = shopifyOrder.browser_ip || shopifyOrder.client_details?.browser_ip || null;

    const utmParams = parseUtmParams(landingSite);


    let shipmentStatus = 'Unfulfilled';
    if (shopifyOrder.cancelled_at) {
      shipmentStatus = 'CANCELLED';
    }

    return {
      shopifyOrderId: String(shopifyOrder.id),
      orderNumber: shopifyOrder.name,
      customerName,
      customerEmail,
      customerPhone,
      shippingAddress: fullAddress,
      city,
      province,
      postalCode,
      country,
      totalAmount: shopifyOrder.total_price,
      subtotalAmount: shopifyOrder.subtotal_price,
      shippingAmount,
      discountAmount: shopifyOrder.total_discounts,
      currency: shopifyOrder.currency,
      paymentMethod: isCod ? 'cod' : 'prepaid',
      courierName: null,
      courierTracking: null,
      totalQuantity,
      itemSummary,
      paymentStatus,
      fulfillmentStatus,
      orderStatus,
      shipmentStatus,
      lineItems: shopifyOrder.line_items.map((item: any) => ({
        name: item.title,
        quantity: item.quantity,
        price: parseFloat(item.price),
        sku: item.sku,
        variantTitle: item.variant_title || null,
        productId: item.product_id ? String(item.product_id) : null,
        variantId: item.variant_id ? String(item.variant_id) : null,
        image: item.image?.src || null,
      })),
      tags: shopifyOrder.tags ? shopifyOrder.tags.split(',').map(t => t.trim()) : [],
      notes: shopifyOrder.note,
      orderDate: new Date(shopifyOrder.created_at),
      landingSite,
      referringSite,
      browserIp,
      utmSource: utmParams.utmSource,
      utmMedium: utmParams.utmMedium,
      utmCampaign: utmParams.utmCampaign,
      utmContent: utmParams.utmContent,
      utmTerm: utmParams.utmTerm,
      fbClickId: utmParams.fbClickId,
      rawShopifyData: shopifyOrder as unknown as Record<string, any>,
      orderSource: (() => {
        const rawTags = (shopifyOrder as any).tags;
        const tagList: string[] = typeof rawTags === "string"
          ? rawTags.split(",").map((t: string) => t.trim())
          : Array.isArray(rawTags) ? rawTags : [];
        if (tagList.includes("Draft-1SOL")) return "shopify_draft_order";
        return shopifyOrder.source_name || null;
      })(),
      shopDomain: (shopifyOrder as any)._shopDomain || null,
    };
  }

  async fetchAllProducts(shop: string, accessToken: string): Promise<any[]> {
    const allProducts: any[] = [];
    const headers = this.getAuthHeaders(accessToken);

    let url: string | null = `https://${shop}/admin/api/2025-01/products.json?limit=250&fields=id,title,handle,vendor,product_type,status,image,images,tags,variants,body_html`;
    let pageCount = 0;
    let retryCount = 0;
    const maxRetries = 3;

    console.log(`[Shopify Products] Starting paginated product fetch from ${shop}...`);

    while (url) {
      pageCount++;
      console.log(`[Shopify Products] Fetching page ${pageCount}... (${allProducts.length} products so far)`);

      try {
        const response = await fetch(url, { headers });

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
          console.log(`[Shopify Products] Rate limited, waiting ${delay}ms...`);
          await this.sleep(delay);
          retryCount++;
          if (retryCount > maxRetries) throw new Error('Max retries exceeded due to rate limiting');
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch products: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        if (data.products && Array.isArray(data.products)) {
          allProducts.push(...data.products);
        }

        const linkHeader = response.headers.get('Link');
        url = null;
        if (linkHeader) {
          const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          if (nextMatch) {
            url = nextMatch[1];
          }
        }

        retryCount = 0;
        await this.sleep(300);
      } catch (error: any) {
        console.error(`[Shopify Products] Error on page ${pageCount}:`, error.message);
        throw error;
      }
    }

    console.log(`[Shopify Products] Fetched ${allProducts.length} products total.`);
    return allProducts;
  }

  async fetchInventoryItemCosts(shop: string, accessToken: string, inventoryItemIds: string[]): Promise<Map<string, string | null>> {
    const costMap = new Map<string, string | null>();
    if (inventoryItemIds.length === 0) return costMap;

    const headers = this.getAuthHeaders(accessToken);
    const batchSize = 50;
    let totalWithCost = 0;
    let totalWithoutCost = 0;
    let retryCount = 0;
    const maxRetries = 3;

    console.log(`[Shopify Products] Fetching costs for ${inventoryItemIds.length} inventory items in batches of ${batchSize}...`);

    for (let i = 0; i < inventoryItemIds.length; i += batchSize) {
      const batch = inventoryItemIds.slice(i, i + batchSize);
      const idsParam = batch.join(",");
      const url = `https://${shop}/admin/api/2025-01/inventory_items.json?ids=${idsParam}`;
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(inventoryItemIds.length / batchSize);

      try {
        const response = await fetch(url, { headers });

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
          console.log(`[Shopify Products] Rate limited on inventory items batch ${batchNum}/${totalBatches}, waiting ${delay}ms...`);
          await this.sleep(delay);
          retryCount++;
          if (retryCount > maxRetries) {
            console.error(`[Shopify Products] Max retries exceeded on inventory items batch ${batchNum}`);
            continue;
          }
          i -= batchSize;
          continue;
        }

        retryCount = 0;

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          console.error(`[Shopify Products] Failed to fetch inventory items batch ${batchNum}/${totalBatches}: ${response.status} ${errorBody.slice(0, 200)}`);
          continue;
        }

        const data = await response.json();
        if (data.inventory_items && Array.isArray(data.inventory_items)) {
          for (const item of data.inventory_items) {
            const cost = item.cost ?? null;
            costMap.set(String(item.id), cost);
            if (cost !== null && cost !== "0.00") {
              totalWithCost++;
            } else {
              totalWithoutCost++;
            }
          }
          if (data.inventory_items.length !== batch.length) {
            console.warn(`[Shopify Products] Batch ${batchNum}: requested ${batch.length} items but got ${data.inventory_items.length}`);
          }
        } else {
          console.warn(`[Shopify Products] Batch ${batchNum}: unexpected response structure`, Object.keys(data));
        }

        await this.sleep(300);
      } catch (error: any) {
        console.error(`[Shopify Products] Error fetching inventory items batch ${batchNum}/${totalBatches}:`, error.message);
      }
    }

    console.log(`[Shopify Products] Inventory item costs: ${costMap.size} total, ${totalWithCost} with cost values, ${totalWithoutCost} without cost`);
    return costMap;
  }
}

export async function createShopifyFulfillment(
  shopDomain: string,
  accessToken: string,
  shopifyOrderId: string,
  trackingNumber: string,
  courierName: string
): Promise<{ success: boolean; error?: string; fulfillmentId?: string }> {
  try {
    const trackingCompanyMap: Record<string, string> = {
      'Leopards': 'Leopards Courier',
      'leopards': 'Leopards Courier',
      'PostEx': 'PostEx',
      'postex': 'PostEx',
      'TCS': 'TCS',
      'tcs': 'TCS',
    };
    const trackingCompany = trackingCompanyMap[courierName] || courierName;

    const fulfillmentOrdersRes = await fetch(
      `https://${shopDomain}/admin/api/2025-01/orders/${shopifyOrderId}/fulfillment_orders.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!fulfillmentOrdersRes.ok) {
      const errText = await fulfillmentOrdersRes.text();
      console.error(`[Shopify Fulfillment] Failed to get fulfillment orders: ${fulfillmentOrdersRes.status} ${errText}`);
      return { success: false, error: `Failed to get fulfillment orders: ${fulfillmentOrdersRes.status}` };
    }

    const { fulfillment_orders } = await fulfillmentOrdersRes.json();

    if (!fulfillment_orders || fulfillment_orders.length === 0) {
      return { success: false, error: 'No fulfillment orders found' };
    }

    const openOrders = fulfillment_orders.filter(
      (fo: any) => fo.status === 'open' || fo.status === 'in_progress'
    );

    if (openOrders.length === 0) {
      console.log(`[Shopify Fulfillment] Order ${shopifyOrderId} already fulfilled or no open fulfillment orders`);
      return { success: true, error: 'Already fulfilled' };
    }

    const lineItemsByFulfillmentOrder = openOrders.map((fo: any) => ({
      fulfillment_order_id: fo.id,
      fulfillment_order_line_items: fo.line_items.map((li: any) => ({
        id: li.id,
        quantity: li.fulfillable_quantity,
      })).filter((li: any) => li.quantity > 0),
    }));

    const fulfillmentPayload = {
      fulfillment: {
        line_items_by_fulfillment_order: lineItemsByFulfillmentOrder,
        tracking_info: {
          number: trackingNumber,
          company: trackingCompany,
        },
        notify_customer: false,
      },
    };

    const fulfillmentRes = await fetch(
      `https://${shopDomain}/admin/api/2025-01/fulfillments.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fulfillmentPayload),
      }
    );

    if (!fulfillmentRes.ok) {
      const errText = await fulfillmentRes.text();
      console.error(`[Shopify Fulfillment] Failed to create fulfillment: ${fulfillmentRes.status} ${errText}`);
      return { success: false, error: `Failed to create fulfillment: ${fulfillmentRes.status}` };
    }

    const result = await fulfillmentRes.json();
    const fulfillmentId = result?.fulfillment?.id ? String(result.fulfillment.id) : undefined;
    console.log(`[Shopify Fulfillment] Created fulfillment for order ${shopifyOrderId}: tracking=${trackingNumber}, fulfillmentId=${fulfillmentId}`);
    return { success: true, fulfillmentId };
  } catch (error: any) {
    console.error(`[Shopify Fulfillment] Error creating fulfillment:`, error);
    return { success: false, error: error.message };
  }
}

export async function cancelShopifyFulfillment(
  shopDomain: string,
  accessToken: string,
  fulfillmentId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Shopify Fulfillment Cancel] Cancelling fulfillment ${fulfillmentId} on ${shopDomain}`);

    const url = `https://${shopDomain}/admin/api/2025-01/fulfillments/${fulfillmentId}/cancel.json`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Shopify Fulfillment Cancel] Failed: ${response.status} ${errText}`);
      if (response.status === 422) {
        return { success: false, error: `Fulfillment cannot be cancelled (may already be cancelled): ${errText}` };
      }
      return { success: false, error: `Shopify API error ${response.status}: ${errText}` };
    }

    console.log(`[Shopify Fulfillment Cancel] Successfully cancelled fulfillment ${fulfillmentId}`);
    return { success: true };
  } catch (error: any) {
    console.error(`[Shopify Fulfillment Cancel] Error:`, error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function cancelShopifyOrder(
  shopDomain: string,
  accessToken: string,
  shopifyOrderId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Shopify Cancel] Cancelling order ${shopifyOrderId} on ${shopDomain}`);

    const url = `https://${shopDomain}/admin/api/2025-01/orders/${shopifyOrderId}/cancel.json`;
    const body: Record<string, any> = {};
    if (reason) {
      body.reason = reason;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Shopify Cancel] Failed: ${response.status} ${errText}`);
      if (response.status === 422) {
        return { success: false, error: `Order cannot be cancelled (may already be cancelled or fulfilled): ${errText}` };
      }
      return { success: false, error: `Shopify API error ${response.status}: ${errText}` };
    }

    console.log(`[Shopify Cancel] Successfully cancelled order ${shopifyOrderId}`);
    return { success: true };
  } catch (error: any) {
    console.error(`[Shopify Cancel] Error:`, error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export const shopifyService = new ShopifyService();

export async function reopenShopifyOrder(
  shopDomain: string,
  accessToken: string,
  shopifyOrderId: string,
): Promise<{ success: boolean; order?: any; error?: string }> {
  try {
    console.log(`[Shopify Reopen] Reopening order ${shopifyOrderId} on ${shopDomain}`);

    const url = `https://${shopDomain}/admin/api/2025-01/orders/${shopifyOrderId}/open.json`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Shopify Reopen] Failed: ${response.status} ${errText}`);
      if (response.status === 422) {
        return { success: false, error: `Order cannot be reopened (may be fulfilled or in a non-reopenable state): ${errText}` };
      }
      return { success: false, error: `Shopify API error ${response.status}: ${errText}` };
    }

    const data = await response.json();
    console.log(`[Shopify Reopen] Successfully reopened order ${shopifyOrderId}`);
    return { success: true, order: data.order };
  } catch (error: any) {
    console.error(`[Shopify Reopen] Error:`, error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}
