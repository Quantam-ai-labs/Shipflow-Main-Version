import crypto from 'crypto';

interface ShopifyConfig {
  clientId: string;
  clientSecret: string;
  appUrl: string;
  scopes: string;
}

interface ShopifyOrder {
  id: number;
  name: string;
  email: string;
  created_at: string;
  total_price: string;
  subtotal_price: string;
  total_shipping_price_set?: {
    shop_money: { amount: string; currency_code: string };
  };
  total_discounts: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  } | null;
  shipping_address: {
    first_name: string;
    last_name: string;
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
  }>;
  tags: string;
  note: string | null;
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
    // Check for rate limit headers
    const callLimit = response.headers.get('X-Shopify-Shop-Api-Call-Limit');
    if (callLimit) {
      const [current, max] = callLimit.split('/').map(Number);
      const usage = current / max;
      // If we're using more than 80% of the bucket, slow down
      if (usage > 0.8) {
        return 1000; // 1 second delay
      } else if (usage > 0.5) {
        return 500; // 0.5 second delay
      }
    }
    return 250; // Default delay
  }

  async fetchAllOrders(shop: string, accessToken: string, params: {
    status?: string;
    created_at_min?: string;
  } = {}): Promise<ShopifyOrder[]> {
    const allOrders: ShopifyOrder[] = [];
    const headers = this.getAuthHeaders(accessToken);
    
    // Build initial URL with max limit (250 is Shopify's max per request)
    const queryParams = new URLSearchParams({
      limit: '250',
      status: params.status || 'any',
      order: 'created_at asc', // Consistent ordering for pagination
    });

    if (params.created_at_min) {
      queryParams.set('created_at_min', params.created_at_min);
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

        // Handle rate limiting with retry
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
          console.log(`[Shopify] Rate limited, waiting ${delay}ms before retry...`);
          await this.sleep(delay);
          retryCount++;
          if (retryCount > maxRetries) {
            throw new Error('Max retries exceeded due to rate limiting');
          }
          continue; // Retry the same URL
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch orders: ${response.status} ${errorText}`);
        }

        retryCount = 0; // Reset retry count on success
        const data: ShopifyOrdersResponse = await response.json();
        allOrders.push(...data.orders);

        // Get next page URL from Link header
        const linkHeader = response.headers.get('Link');
        url = this.parseNextPageUrl(linkHeader);

        // Adaptive rate limiting based on Shopify's bucket usage
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
        await this.sleep(1000 * retryCount); // Exponential backoff
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

  async syncOrders(merchantId: string, shopDomain: string): Promise<{ synced: number; total: number }> {
    const { storage } = await import('../storage');
    const store = await storage.getShopifyStore(merchantId);
    
    if (!store || !store.isConnected || !store.accessToken) {
      throw new Error("Shopify store is not connected or missing access token");
    }

    // Fetch ALL orders using pagination (no date filter - get everything)
    console.log(`[Shopify] Starting full order sync for merchant ${merchantId}...`);
    
    const shopifyOrders = await this.fetchAllOrders(shopDomain, store.accessToken, {
      status: 'any'
    });
    
    console.log(`[Shopify] Processing ${shopifyOrders.length} orders...`);
    
    // Batch check for existing orders to reduce DB queries
    const allShopifyIds = shopifyOrders.map(o => String(o.id));
    console.log(`[Shopify] Checking ${allShopifyIds.length} orders for duplicates...`);
    const existingIds = await storage.getExistingShopifyOrderIds(merchantId, allShopifyIds);
    console.log(`[Shopify] Found ${existingIds.size} existing orders, will sync ${allShopifyIds.length - existingIds.size} new orders`);
    
    let syncedCount = 0;
    const skippedCount = existingIds.size;

    for (const shopifyOrder of shopifyOrders) {
      const shopifyOrderId = String(shopifyOrder.id);
      
      // Skip already existing orders
      if (existingIds.has(shopifyOrderId)) {
        continue;
      }

      const transformedOrder = this.transformOrderForStorage(shopifyOrder);
      await storage.createOrder({
        ...transformedOrder,
        merchantId,
      });
      syncedCount++;
      
      // Log progress every 100 orders
      if (syncedCount % 100 === 0) {
        console.log(`[Shopify] Synced ${syncedCount} new orders...`);
      }
    }

    console.log(`[Shopify] Sync complete: ${syncedCount} new, ${skippedCount} existing, ${shopifyOrders.length} total`);

    // Refresh dashboard stats after sync
    await storage.getDashboardStats(merchantId);

    await storage.updateShopifyStore(store.id, { lastSyncAt: new Date() });
    return { synced: syncedCount, total: shopifyOrders.length };
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
    lineItems: Array<{ name: string; quantity: number; price: number; sku?: string }>;
    tags: string[];
    notes: string | null;
    orderDate: Date;
  } {
    const customer = shopifyOrder.customer;
    const shippingAddr = shopifyOrder.shipping_address;

    const customerName = customer 
      ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() 
      : (shippingAddr ? `${shippingAddr.first_name || ''} ${shippingAddr.last_name || ''}`.trim() : 'Unknown');

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

    return {
      shopifyOrderId: String(shopifyOrder.id),
      orderNumber: shopifyOrder.name,
      customerName,
      customerEmail: customer?.email || shopifyOrder.email || null,
      customerPhone: customer?.phone || shippingAddr?.phone || null,
      shippingAddress: shippingAddr 
        ? [shippingAddr.address1, shippingAddr.address2].filter(Boolean).join(', ')
        : null,
      city: shippingAddr?.city || null,
      province: shippingAddr?.province || null,
      postalCode: shippingAddr?.zip || null,
      country: shippingAddr?.country || 'Pakistan',
      totalAmount: shopifyOrder.total_price,
      subtotalAmount: shopifyOrder.subtotal_price,
      shippingAmount,
      discountAmount: shopifyOrder.total_discounts,
      currency: shopifyOrder.currency,
      paymentMethod: isCod ? 'cod' : 'prepaid',
      paymentStatus,
      fulfillmentStatus,
      orderStatus,
      lineItems: shopifyOrder.line_items.map(item => ({
        name: item.title,
        quantity: item.quantity,
        price: parseFloat(item.price),
        sku: item.sku,
      })),
      tags: shopifyOrder.tags ? shopifyOrder.tags.split(',').map(t => t.trim()) : [],
      notes: shopifyOrder.note,
      orderDate: new Date(shopifyOrder.created_at),
    };
  }
}

export const shopifyService = new ShopifyService();
