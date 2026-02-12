import { storage } from '../storage';
import { decryptToken } from './encryption';
import { cancelShopifyOrder } from './shopify';

const API_VERSION = '2024-01';

const recentWriteBacks = new Map<string, number>();
const WRITEBACK_COOLDOWN_MS = 10_000;

export function isRecentWriteBack(shopifyOrderId: string): boolean {
  const timestamp = recentWriteBacks.get(shopifyOrderId);
  if (!timestamp) return false;
  if (Date.now() - timestamp < WRITEBACK_COOLDOWN_MS) return true;
  recentWriteBacks.delete(shopifyOrderId);
  return false;
}

function markWriteBack(shopifyOrderId: string): void {
  recentWriteBacks.set(shopifyOrderId, Date.now());
  setTimeout(() => recentWriteBacks.delete(shopifyOrderId), WRITEBACK_COOLDOWN_MS + 1000);
}

async function getShopifyCredentials(merchantId: string): Promise<{ shopDomain: string; accessToken: string } | null> {
  const store = await storage.getShopifyStore(merchantId);
  if (!store || !store.accessToken || !store.shopDomain || !store.isConnected) {
    return null;
  }
  return {
    shopDomain: store.shopDomain,
    accessToken: decryptToken(store.accessToken),
  };
}

export async function writeBackAddress(
  merchantId: string,
  shopifyOrderId: string,
  updates: {
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    shippingAddress?: string;
    city?: string;
    province?: string;
    postalCode?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const creds = await getShopifyCredentials(merchantId);
  if (!creds) {
    return { success: false, error: 'Shopify not connected' };
  }

  try {
    const shippingAddress: Record<string, any> = {};

    if (updates.customerName) {
      const parts = updates.customerName.trim().split(/\s+/);
      shippingAddress.first_name = parts[0] || '';
      shippingAddress.last_name = parts.slice(1).join(' ') || '';
      shippingAddress.name = updates.customerName.trim();
    }
    if (updates.customerPhone) {
      shippingAddress.phone = updates.customerPhone;
    }
    if (updates.shippingAddress) {
      shippingAddress.address1 = updates.shippingAddress;
    }
    if (updates.city) {
      shippingAddress.city = updates.city;
    }
    if (updates.province) {
      shippingAddress.province = updates.province;
    }
    if (updates.postalCode) {
      shippingAddress.zip = updates.postalCode;
    }

    if (Object.keys(shippingAddress).length === 0 && !updates.customerEmail) {
      return { success: true };
    }

    const orderUpdate: Record<string, any> = { order: { id: shopifyOrderId } };

    if (Object.keys(shippingAddress).length > 0) {
      orderUpdate.order.shipping_address = shippingAddress;
    }
    if (updates.customerEmail) {
      orderUpdate.order.email = updates.customerEmail;
    }

    markWriteBack(shopifyOrderId);

    const url = `https://${creds.shopDomain}/admin/api/${API_VERSION}/orders/${shopifyOrderId}.json`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': creds.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderUpdate),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[ShopifyWriteBack] Address update failed: ${response.status} ${errText}`);
      return { success: false, error: `Shopify API error ${response.status}: ${errText}` };
    }

    console.log(`[ShopifyWriteBack] Address updated for order ${shopifyOrderId}`);
    return { success: true };
  } catch (error: any) {
    console.error(`[ShopifyWriteBack] Address update error:`, error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function writeBackCancel(
  merchantId: string,
  shopifyOrderId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  const creds = await getShopifyCredentials(merchantId);
  if (!creds) {
    return { success: false, error: 'Shopify not connected' };
  }

  markWriteBack(shopifyOrderId);
  return cancelShopifyOrder(creds.shopDomain, creds.accessToken, shopifyOrderId, reason);
}

const STATUS_TAG_MAP: Record<string, string> = {
  'READY_TO_SHIP': 'SF-Confirmed',
  'HOLD': 'SF-Hold',
  'CANCELLED': 'SF-Cancelled',
  'PENDING': 'SF-Pending',
  'BOOKED': 'SF-Booked',
  'FULFILLED': 'SF-Fulfilled',
  'DELIVERED': 'SF-Delivered',
  'RETURN': 'SF-Return',
};

const ALL_SF_TAGS = Object.values(STATUS_TAG_MAP);

export async function writeBackTags(
  merchantId: string,
  shopifyOrderId: string,
  newStatus: string,
): Promise<{ success: boolean; error?: string }> {
  const creds = await getShopifyCredentials(merchantId);
  if (!creds) {
    return { success: false, error: 'Shopify not connected' };
  }

  const newTag = STATUS_TAG_MAP[newStatus];
  if (!newTag) {
    return { success: true };
  }

  try {
    const getUrl = `https://${creds.shopDomain}/admin/api/${API_VERSION}/orders/${shopifyOrderId}.json?fields=id,tags`;
    const getRes = await fetch(getUrl, {
      headers: {
        'X-Shopify-Access-Token': creds.accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!getRes.ok) {
      const errText = await getRes.text();
      console.error(`[ShopifyWriteBack] Failed to get order tags: ${getRes.status} ${errText}`);
      return { success: false, error: `Failed to get order: ${getRes.status}` };
    }

    const orderData = await getRes.json();
    const existingTags = (orderData.order?.tags || '')
      .split(',')
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0);

    const filteredTags = existingTags.filter((t: string) => !ALL_SF_TAGS.includes(t));
    filteredTags.push(newTag);
    const updatedTags = filteredTags.join(', ');

    markWriteBack(shopifyOrderId);

    const putUrl = `https://${creds.shopDomain}/admin/api/${API_VERSION}/orders/${shopifyOrderId}.json`;
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': creds.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order: { id: shopifyOrderId, tags: updatedTags },
      }),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      console.error(`[ShopifyWriteBack] Tag update failed: ${putRes.status} ${errText}`);
      return { success: false, error: `Shopify API error ${putRes.status}: ${errText}` };
    }

    console.log(`[ShopifyWriteBack] Tags updated for order ${shopifyOrderId}: ${updatedTags}`);
    return { success: true };
  } catch (error: any) {
    console.error(`[ShopifyWriteBack] Tag update error:`, error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}
