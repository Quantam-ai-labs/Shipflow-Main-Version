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
    
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch orders: ${response.status} ${errorText}`);
    }

    const data: ShopifyOrdersResponse = await response.json();
    return data.orders;
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
