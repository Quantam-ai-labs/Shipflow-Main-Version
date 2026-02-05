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
  total_price: string;
  subtotal_price: string;
  total_shipping_price_set?: {
    shop_money: { amount: string; currency_code: string };
  };
  total_discounts: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  landing_site: string | null; // UTM landing page
  referring_site: string | null; // UTM referrer
  browser_ip: string | null; // Customer IP
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
      address1: string;
      address2: string | null;
      city: string;
      province: string;
      country: string;
      zip: string;
      phone: string | null;
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

  async fetchOrderCityViaGraphQL(shop: string, accessToken: string, orderId: string): Promise<{ city: string | null; province: string | null }> {
    const headers = this.getAuthHeaders(accessToken);
    headers['Content-Type'] = 'application/json';
    
    const graphqlUrl = `https://${shop}/admin/api/2024-01/graphql.json`;
    const gid = `gid://shopify/Order/${orderId}`;
    
    const query = `{
      order(id: "${gid}") {
        shippingAddress {
          city
          province
          country
        }
        billingAddress {
          city
          province
          country
        }
      }
    }`;
    
    try {
      const response = await fetch(graphqlUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
      });
      
      if (!response.ok) {
        return { city: null, province: null };
      }
      
      const result = await response.json();
      const data = result?.data?.order;
      
      const city = data?.shippingAddress?.city || data?.billingAddress?.city || null;
      const province = data?.shippingAddress?.province || data?.billingAddress?.province || null;
      
      return { city, province };
    } catch (error) {
      console.error('[Shopify GraphQL] Error fetching city:', error);
      return { city: null, province: null };
    }
  }

  async batchFetchOrderCitiesViaGraphQL(shop: string, accessToken: string, orderIds: string[]): Promise<Map<string, { city: string | null; province: string | null }>> {
    const results = new Map<string, { city: string | null; province: string | null }>();
    const headers = this.getAuthHeaders(accessToken);
    headers['Content-Type'] = 'application/json';
    
    const graphqlUrl = `https://${shop}/admin/api/2024-01/graphql.json`;
    
    const batchSize = 50;
    for (let i = 0; i < orderIds.length; i += batchSize) {
      const batch = orderIds.slice(i, i + batchSize);
      
      const queryParts = batch.map((id, idx) => `
        order${idx}: order(id: "gid://shopify/Order/${id}") {
          id
          shippingAddress { city province }
          billingAddress { city province }
        }
      `);
      
      const query = `{ ${queryParts.join('\n')} }`;
      
      try {
        const response = await fetch(graphqlUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query }),
        });
        
        if (response.ok) {
          const result = await response.json();
          const data = result?.data;
          
          if (data) {
            batch.forEach((orderId, idx) => {
              const orderData = data[`order${idx}`];
              if (orderData) {
                const city = orderData?.shippingAddress?.city || orderData?.billingAddress?.city || null;
                const province = orderData?.shippingAddress?.province || orderData?.billingAddress?.province || null;
                results.set(orderId, { city, province });
              }
            });
          }
        }
      } catch (error) {
        console.error('[Shopify GraphQL] Batch fetch error:', error);
      }
      
      if (i + batchSize < orderIds.length) {
        await this.sleep(500);
      }
    }
    
    console.log(`[Shopify GraphQL] Fetched city data for ${results.size}/${orderIds.length} orders`);
    return results;
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
        
        // Debug: Log raw API response for first few orders
        if (pageCount === 1 && data.orders.length > 0) {
          // Log full raw order to see all available fields
          const firstOrder = data.orders[0];
          const lastOrder = data.orders[data.orders.length - 1];
          console.log(`[Shopify RAW API DEBUG] FULL first order JSON (keys): ${Object.keys(firstOrder as any).join(', ')}`);
          console.log(`[Shopify RAW API DEBUG] shipping_address keys: ${firstOrder.shipping_address ? Object.keys(firstOrder.shipping_address).join(', ') : 'NULL'}`);
          console.log(`[Shopify RAW API DEBUG] First order shipping_address FULL: ${JSON.stringify(firstOrder.shipping_address, null, 2)}`);
          console.log(`[Shopify RAW API DEBUG] Last order on page (#${lastOrder.name}) shipping_address: ${JSON.stringify(lastOrder.shipping_address)}`);
        }
        
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

  async syncOrders(merchantId: string, shopDomain: string): Promise<{ synced: number; updated: number; total: number }> {
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
    
    // Get existing orders with their IDs for update
    const allShopifyIds = shopifyOrders.map(o => String(o.id));
    console.log(`[Shopify] Checking ${allShopifyIds.length} orders for existing records...`);
    const existingOrdersMap = await storage.getExistingOrdersByShopifyIds(merchantId, allShopifyIds);
    console.log(`[Shopify] Found ${existingOrdersMap.size} existing orders to update, ${allShopifyIds.length - existingOrdersMap.size} new orders`);
    
    let newCount = 0;
    let updatedCount = 0;

    for (const shopifyOrder of shopifyOrders) {
      const shopifyOrderId = String(shopifyOrder.id);
      
      // Debug: Log the first few orders to see what data is coming from Shopify
      if (newCount + updatedCount < 3) {
        console.log(`[Shopify DEBUG] Order ${shopifyOrder.name}:`);
        console.log(`  - customer: ${JSON.stringify(shopifyOrder.customer)}`);
        console.log(`  - shipping_address: ${JSON.stringify(shopifyOrder.shipping_address)}`);
        console.log(`  - billing_address: ${JSON.stringify(shopifyOrder.billing_address)}`);
        console.log(`  - email: ${shopifyOrder.email}`);
      }
      
      const transformedOrder = this.transformOrderForStorage(shopifyOrder);
      
      // Debug: Log transformed customer data
      if (newCount + updatedCount < 3) {
        console.log(`[Shopify DEBUG] Transformed ${shopifyOrder.name}:`);
        console.log(`  - customerName: ${transformedOrder.customerName}`);
        console.log(`  - customerPhone: ${transformedOrder.customerPhone}`);
        console.log(`  - customerEmail: ${transformedOrder.customerEmail}`);
        console.log(`  - city: ${transformedOrder.city}`);
        console.log(`  - shippingAddress: ${transformedOrder.shippingAddress}`);
      }
      
      const existingOrderId = existingOrdersMap.get(shopifyOrderId);
      
      if (existingOrderId) {
        // UPDATE existing order with fresh data from Shopify
        await storage.updateOrder(merchantId, existingOrderId, {
          customerName: transformedOrder.customerName,
          customerEmail: transformedOrder.customerEmail,
          customerPhone: transformedOrder.customerPhone,
          shippingAddress: transformedOrder.shippingAddress,
          city: transformedOrder.city,
          province: transformedOrder.province,
          postalCode: transformedOrder.postalCode,
          country: transformedOrder.country,
          courierName: transformedOrder.courierName,
          courierTracking: transformedOrder.courierTracking,
          shipmentStatus: transformedOrder.shipmentStatus,
          fulfillmentStatus: transformedOrder.fulfillmentStatus,
          tags: transformedOrder.tags,
          notes: transformedOrder.notes,
          landingSite: transformedOrder.landingSite,
          referringSite: transformedOrder.referringSite,
          browserIp: transformedOrder.browserIp,
          rawShopifyData: transformedOrder.rawShopifyData,
        });
        updatedCount++;
      } else {
        // CREATE new order
        await storage.createOrder({
          ...transformedOrder,
          merchantId,
        });
        newCount++;
      }
      
      // Log progress every 100 orders
      if ((newCount + updatedCount) % 100 === 0) {
        console.log(`[Shopify] Processed ${newCount + updatedCount} orders (${newCount} new, ${updatedCount} updated)...`);
      }
    }

    console.log(`[Shopify] Sync complete: ${newCount} new, ${updatedCount} updated, ${shopifyOrders.length} total`);

    // Phase 2: Use GraphQL to fetch city data for orders that have incomplete customer data
    // This helps on Basic Shopify plans where REST API doesn't return full address data
    // but GraphQL returns some fields like city
    const ordersNeedingCityUpdate: string[] = [];
    const shopifyIdToDbId = new Map<string, string>();
    
    for (const shopifyOrder of shopifyOrders) {
      const shopifyOrderId = String(shopifyOrder.id);
      const transformedOrder = this.transformOrderForStorage(shopifyOrder);
      
      // If REST API didn't give us city data, try GraphQL
      if (!transformedOrder.city && (transformedOrder.customerName === 'Unknown' || !transformedOrder.shippingAddress)) {
        const dbId = existingOrdersMap.get(shopifyOrderId);
        if (dbId) {
          ordersNeedingCityUpdate.push(shopifyOrderId);
          shopifyIdToDbId.set(shopifyOrderId, dbId);
        }
      }
    }
    
    if (ordersNeedingCityUpdate.length > 0) {
      console.log(`[Shopify GraphQL] Fetching city data for ${ordersNeedingCityUpdate.length} orders with incomplete addresses...`);
      
      const cityData = await this.batchFetchOrderCitiesViaGraphQL(shopDomain, store.accessToken, ordersNeedingCityUpdate);
      
      let cityUpdates = 0;
      const cityDataEntries = Array.from(cityData.entries());
      for (const entry of cityDataEntries) {
        const shopifyOrderId = entry[0];
        const data = entry[1];
        if (data.city) {
          const dbId = shopifyIdToDbId.get(shopifyOrderId);
          if (dbId) {
            await storage.updateOrder(merchantId, dbId, {
              city: data.city,
              province: data.province,
            });
            cityUpdates++;
          }
        }
      }
      
      console.log(`[Shopify GraphQL] Updated ${cityUpdates} orders with city data from GraphQL`);
    }

    // Refresh dashboard stats after sync
    await storage.getDashboardStats(merchantId);

    await storage.updateShopifyStore(store.id, { lastSyncAt: new Date() });
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
    
    // Helper to extract value from note_attributes by name patterns
    // (supports both English and Urdu labels used by custom checkout forms)
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
    
    // Extract customer data from note_attributes (used by custom checkout forms)
    const noteFirstName = getNoteAttribute(['first name', 'first_name']);
    const noteLastName = getNoteAttribute(['last name', 'last_name']);
    const noteFullName = noteFirstName && noteLastName 
      ? `${noteFirstName} ${noteLastName}`.trim() 
      : noteFirstName || noteLastName || null;
    const notePhone = getNoteAttribute(['mobile', 'phone', 'contact']);
    const noteAddress = getNoteAttribute(['full address', 'address', 'ایڈریس']);
    const noteCity = getNoteAttribute(['city', 'شہر']);

    // Helper to check if a value is meaningful (not empty, not just whitespace)
    const isMeaningful = (val: string | null | undefined): val is string => {
      return Boolean(val && val.trim().length > 0);
    };

    // Priority for customer name: 
    // 1. shipping_address.name (store checkout)
    // 2. shipping_address first+last (store checkout)
    // 3. customer first+last (customer account)
    // 4. billing_address.name (fallback)
    // 5. note_attributes (custom checkout forms like Releaseit COD)
    let customerName = 'Unknown';
    
    // Try shipping address name first
    if (isMeaningful(shippingAddr?.name)) {
      customerName = shippingAddr.name.trim();
    } else if (isMeaningful(shippingAddr?.first_name) || isMeaningful(shippingAddr?.last_name)) {
      customerName = `${shippingAddr?.first_name || ''} ${shippingAddr?.last_name || ''}`.trim();
    } 
    // Then try customer object
    else if (isMeaningful(customer?.first_name) || isMeaningful(customer?.last_name)) {
      customerName = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim();
    } 
    // Then billing address
    else if (isMeaningful(billingAddr?.name)) {
      customerName = billingAddr.name.trim();
    } else if (isMeaningful(billingAddr?.first_name) || isMeaningful(billingAddr?.last_name)) {
      customerName = `${billingAddr?.first_name || ''} ${billingAddr?.last_name || ''}`.trim();
    }
    // Finally note_attributes (Releaseit COD Form)
    else if (isMeaningful(noteFullName)) {
      customerName = noteFullName.trim();
    }

    // Priority for phone: shipping_address > customer > billing_address > note_attributes
    let customerPhone: string | null = null;
    if (isMeaningful(shippingAddr?.phone)) {
      customerPhone = shippingAddr.phone.trim();
    } else if (isMeaningful(customer?.phone)) {
      customerPhone = customer.phone.trim();
    } else if (isMeaningful(billingAddr?.phone)) {
      customerPhone = billingAddr.phone.trim();
    } else if (isMeaningful(customer?.default_address?.phone)) {
      customerPhone = customer.default_address.phone.trim();
    } else if (isMeaningful(notePhone)) {
      customerPhone = notePhone.trim();
    }

    // Get email from multiple sources
    const customerEmail = customer?.email?.trim() || shopifyOrder.email?.trim() || null;

    // Get city from shipping address, fallback to billing address, then note_attributes
    const city = (isMeaningful(shippingAddr?.city) ? shippingAddr.city.trim() : null) 
      || (isMeaningful(billingAddr?.city) ? billingAddr.city.trim() : null) 
      || (isMeaningful(customer?.default_address?.city) ? customer.default_address.city.trim() : null) 
      || (isMeaningful(noteCity) ? noteCity.trim() : null);
    const province = shippingAddr?.province || billingAddr?.province || customer?.default_address?.province || null;
    const postalCode = shippingAddr?.zip || billingAddr?.zip || customer?.default_address?.zip || null;
    const country = shippingAddr?.country || billingAddr?.country || customer?.default_address?.country || 'Pakistan';

    // Build full shipping address with fallback to note_attributes
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
    } else if (isMeaningful(noteAddress)) {
      fullAddress = noteAddress.trim();
    }

    // Extract courier info from note_attributes (hxs_courier_name, hxs_courier_tracking)
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

    // Calculate total quantity from line items
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

    // Extract UTM/marketing data
    const landingSite = shopifyOrder.landing_site || null;
    const referringSite = shopifyOrder.referring_site || null;
    const browserIp = shopifyOrder.browser_ip || shopifyOrder.client_details?.browser_ip || null;

    // Determine shipment status based on fulfillment and courier info
    let shipmentStatus = 'unfulfilled';
    if (courierTracking) {
      // If has tracking, we'll fetch real status from courier later
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
