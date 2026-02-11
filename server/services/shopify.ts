import crypto from 'crypto';
import { decryptToken } from './encryption';

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

export class ShopifyService {
  private config: ShopifyConfig;
  private hostMismatch: boolean = false;

  constructor() {
    const clientId = process.env.SHOPIFY_APP_CLIENT_ID || '';
    const clientSecret = process.env.SHOPIFY_APP_CLIENT_SECRET || '';
    const appUrl = (process.env.SHOPIFY_APP_URL || '').replace(/\/$/, '');
    const redirectUrl = process.env.SHOPIFY_APP_REDIRECT_URL || '';
    const scopes = process.env.SHOPIFY_APP_SCOPES || 'read_orders,read_fulfillments,write_fulfillments,write_webhooks';

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

    let url: string | null = `https://${shop}/admin/api/2024-01/orders.json?${queryParams.toString()}`;
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

    const url = `https://${shop}/admin/api/2024-01/orders.json?${queryParams.toString()}`;
    const headers = this.getAuthHeaders(accessToken);

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch orders: ${response.status} ${errorText}`);
    }

    const data: ShopifyOrdersResponse = await response.json();
    return data.orders;
  }

  async syncOrders(merchantId: string, shopDomain: string, forceFullSync: boolean = false): Promise<{ synced: number; updated: number; total: number }> {
    const { storage } = await import('../storage');
    const store = await storage.getShopifyStore(merchantId);
    
    if (!store || !store.isConnected || !store.accessToken) {
      throw new Error("Shopify store is not connected or missing access token");
    }

    const plainToken = decryptToken(store.accessToken);
    const isIncremental = !forceFullSync && store.lastSyncAt != null;
    const syncStartTime = new Date();

    const MIN_ORDER_DATE = '2026-01-01T00:00:00.000Z';

    let fetchParams: { status?: string; updated_at_min?: string; created_at_min?: string } = {
      status: 'any',
    };

    if (isIncremental) {
      const lastSyncDate = new Date(store.lastSyncAt!);
      lastSyncDate.setHours(lastSyncDate.getHours() - 1);
      fetchParams.updated_at_min = lastSyncDate.toISOString();
    } else {
      fetchParams.created_at_min = MIN_ORDER_DATE;
      console.log(`[Shopify] Starting FULL sync for merchant ${merchantId} from ${MIN_ORDER_DATE}...`);
    }

    const shopifyOrders = await this.fetchAllOrders(shopDomain, plainToken, fetchParams);
    
    if (shopifyOrders.length === 0 && isIncremental) {
      await storage.updateShopifyStore(store.id, { lastSyncAt: syncStartTime });
      return { synced: 0, updated: 0, total: 0 };
    }
    
    if (shopifyOrders.length > 0 || !isIncremental) {
      console.log(`[Shopify] Fetched ${shopifyOrders.length} orders (${isIncremental ? 'incremental' : 'full'} sync), processing...`);
    }
    
    const allShopifyIds = shopifyOrders.map(o => String(o.id));
    const existingOrdersMap = await storage.getExistingOrdersByShopifyIds(merchantId, allShopifyIds);
    const courierConfirmedIds = await storage.getOrdersWithCourierStatus(merchantId, allShopifyIds);
    
    let newCount = 0;
    let updatedCount = 0;
    const now = new Date();

    const minOrderDate = new Date(MIN_ORDER_DATE);

    for (const shopifyOrder of shopifyOrders) {
      const orderCreatedAt = new Date(shopifyOrder.created_at);
      if (orderCreatedAt < minOrderDate) {
        continue;
      }

      const shopifyOrderId = String(shopifyOrder.id);
      const transformedOrder = this.transformOrderForStorage(shopifyOrder);
      const existingOrderId = existingOrdersMap.get(shopifyOrderId);
      const hasCourierStatus = courierConfirmedIds.has(shopifyOrderId);
      
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
          courierName: transformedOrder.courierName,
          courierTracking: transformedOrder.courierTracking,
          lineItems: transformedOrder.lineItems,
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
        
        if (!hasCourierStatus) {
          updateData.shipmentStatus = transformedOrder.shipmentStatus;
        }

        await storage.updateOrder(merchantId, existingOrderId, updateData);

        try {
          const { transitionOrder, applyRoboTags } = await import('./workflowTransition');
          if (initialWorkflowStatus === 'CANCELLED') {
            await transitionOrder({
              merchantId,
              orderId: existingOrderId,
              toStatus: 'CANCELLED',
              action: 'shopify_sync_cancel',
              actorType: 'system',
              reason: 'Cancelled in Shopify',
              extraData: {
                cancelledAt: shopifyOrder.cancelled_at ? new Date(shopifyOrder.cancelled_at) : now,
                cancelReason: 'Cancelled in Shopify',
              },
            });
          } else if (initialWorkflowStatus === 'FULFILLED') {
            await transitionOrder({
              merchantId,
              orderId: existingOrderId,
              toStatus: 'FULFILLED',
              action: 'shopify_sync_fulfill',
              actorType: 'system',
              reason: 'Fulfilled in Shopify',
            });
          } else {
            await applyRoboTags(merchantId, existingOrderId, transformedOrder.tags);
          }
        } catch (e) {}
        updatedCount++;
      } else {
        const createData: any = {
          ...transformedOrder,
          merchantId,
          workflowStatus: initialWorkflowStatus,
          lastApiSyncAt: now,
          shopifyUpdatedAt: new Date(shopifyOrder.updated_at),
          codRemaining: transformedOrder.totalAmount,
          prepaidAmount: "0",
          codPaymentStatus: "UNPAID",
        };
        if (initialWorkflowStatus === 'CANCELLED') {
          createData.cancelledAt = shopifyOrder.cancelled_at ? new Date(shopifyOrder.cancelled_at) : now;
          createData.cancelReason = 'Cancelled in Shopify';
        }
        const created = await storage.createOrder(createData);
        if (created?.id && initialWorkflowStatus === 'NEW') {
          try {
            const { applyRoboTags } = await import('./workflowTransition');
            await applyRoboTags(merchantId, created.id, transformedOrder.tags);
          } catch (e) {}
        }
        newCount++;
      }
      
      if ((newCount + updatedCount) % 100 === 0) {
        console.log(`[Shopify] Processed ${newCount + updatedCount}/${shopifyOrders.length} orders (${newCount} new, ${updatedCount} updated)...`);
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
      return 'FULFILLED';
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

    let courierName: string | null = null;
    let courierTracking: string | null = null;
    
    if (shopifyOrder.note_attributes && Array.isArray(shopifyOrder.note_attributes)) {
      for (const attr of shopifyOrder.note_attributes) {
        if (attr.name === 'hxs_courier_name') {
          courierName = attr.value;
        } else if (attr.name === 'hxs_courier_tracking') {
          courierTracking = attr.value;
        }
      }
    }

    const totalQuantity = shopifyOrder.line_items.reduce((sum, item) => sum + item.quantity, 0);

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

    let shipmentStatus = 'Unfulfilled';
    if (shopifyOrder.cancelled_at) {
      shipmentStatus = 'CANCELLED';
    } else if (courierTracking) {
      shipmentStatus = 'BOOKED';
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
      courierName,
      courierTracking,
      totalQuantity,
      paymentStatus,
      fulfillmentStatus,
      orderStatus,
      shipmentStatus,
      lineItems: shopifyOrder.line_items.map(item => ({
        name: item.title,
        quantity: item.quantity,
        price: parseFloat(item.price),
        sku: item.sku,
      })),
      tags: shopifyOrder.tags ? shopifyOrder.tags.split(',').map(t => t.trim()) : [],
      notes: shopifyOrder.note,
      orderDate: new Date(shopifyOrder.created_at),
      landingSite,
      referringSite,
      browserIp,
      rawShopifyData: shopifyOrder as unknown as Record<string, any>,
    };
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
      `https://${shopDomain}/admin/api/2024-01/orders/${shopifyOrderId}/fulfillment_orders.json`,
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
      `https://${shopDomain}/admin/api/2024-01/fulfillments.json`,
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

export const shopifyService = new ShopifyService();
