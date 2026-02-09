import crypto from 'crypto';

interface ShopifyConfig {
  clientId: string;
  clientSecret: string;
  appUrl: string;
  scopes: string;
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

  constructor() {
    this.config = {
      clientId: process.env.SHOPIFY_CLIENT_ID || '',
      clientSecret: process.env.SHOPIFY_APP_SHARED_SECRET || '',
      appUrl: process.env.SHOPIFY_APP_URL || 'https://lala-logistics.replit.app',
      scopes: 'read_orders,read_products,read_customers,read_fulfillments,write_fulfillments',
    };
  }

  getInstallUrl(shop: string, state: string): string {
    const redirectUri = `${this.config.appUrl}/api/shopify/callback`;
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      scope: this.config.scopes,
      redirect_uri: redirectUri,
      state: state,
    });
    return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
  }

  validateHmac(query: Record<string, string>): boolean {
    const { hmac, ...rest } = query;
    if (!hmac) return false;

    const sortedKeys = Object.keys(rest).sort();
    const message = sortedKeys.map(key => `${key}=${rest[key]}`).join('&');
    
    const generatedHmac = crypto
      .createHmac('sha256', this.config.clientSecret)
      .update(message)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(hmac, 'hex'),
      Buffer.from(generatedHmac, 'hex')
    );
  }

  async exchangeCodeForToken(shop: string, code: string): Promise<{ accessToken: string; scope: string }> {
    const url = `https://${shop}/admin/oauth/access_token`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
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

    const isIncremental = !forceFullSync && store.lastSyncAt != null;
    const syncStartTime = new Date();

    let fetchParams: { status?: string; updated_at_min?: string } = {
      status: 'any',
    };

    if (isIncremental) {
      const lastSyncDate = new Date(store.lastSyncAt!);
      lastSyncDate.setHours(lastSyncDate.getHours() - 1);
      fetchParams.updated_at_min = lastSyncDate.toISOString();
      console.log(`[Shopify] Starting INCREMENTAL sync for merchant ${merchantId} (orders updated since ${fetchParams.updated_at_min})...`);
    } else {
      console.log(`[Shopify] Starting FULL sync for merchant ${merchantId}...`);
    }

    const shopifyOrders = await this.fetchAllOrders(shopDomain, store.accessToken, fetchParams);
    
    console.log(`[Shopify] Fetched ${shopifyOrders.length} orders (${isIncremental ? 'incremental' : 'full'} sync), processing...`);
    
    const allShopifyIds = shopifyOrders.map(o => String(o.id));
    const existingOrdersMap = await storage.getExistingOrdersByShopifyIds(merchantId, allShopifyIds);
    
    let newCount = 0;
    let updatedCount = 0;
    const now = new Date();

    for (const shopifyOrder of shopifyOrders) {
      const shopifyOrderId = String(shopifyOrder.id);
      const transformedOrder = this.transformOrderForStorage(shopifyOrder);
      const existingOrderId = existingOrdersMap.get(shopifyOrderId);
      
      if (existingOrderId) {
        await storage.updateOrder(merchantId, existingOrderId, {
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
          shipmentStatus: transformedOrder.shipmentStatus,
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
        });
        updatedCount++;
      } else {
        await storage.createOrder({
          ...transformedOrder,
          merchantId,
          lastApiSyncAt: now,
          shopifyUpdatedAt: new Date(shopifyOrder.updated_at),
        });
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

    let shipmentStatus = 'unfulfilled';
    if (courierTracking) {
      shipmentStatus = fulfillmentStatus === 'fulfilled' ? 'delivered' : 'booked';
    } else if (fulfillmentStatus === 'fulfilled') {
      shipmentStatus = 'delivered';
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

export const shopifyService = new ShopifyService();
