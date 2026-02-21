import { storage } from '../storage';
import { decryptToken } from './encryption';
import { cancelShopifyOrder, createShopifyFulfillment } from './shopify';

const API_VERSION = '2025-01';

const recentWriteBacks = new Map<string, number>();
const WRITEBACK_COOLDOWN_MS = 10_000;
const RATE_LIMIT_DELAY_MS = 750;

type WriteBackTask = {
  fn: () => Promise<{ success: boolean; error?: string }>;
  resolve: (result: { success: boolean; error?: string }) => void;
  label: string;
};

const writeBackQueue: WriteBackTask[] = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (writeBackQueue.length > 0) {
    const task = writeBackQueue.shift()!;
    try {
      const result = await task.fn();
      task.resolve(result);
    } catch (error: any) {
      task.resolve({ success: false, error: error.message });
    }
    if (writeBackQueue.length > 0) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
    }
  }

  isProcessingQueue = false;
}

function enqueueWriteBack(label: string, fn: () => Promise<{ success: boolean; error?: string }>): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    writeBackQueue.push({ fn, resolve, label });
    processQueue();
  });
}

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

  return enqueueWriteBack(`address:${shopifyOrderId}`, async () => {
    const creds = await getShopifyCredentials(merchantId);
    if (!creds) {
      return { success: false, error: 'Shopify not connected' };
    }

    try {
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
  });
}

export async function writeBackCancel(
  merchantId: string,
  shopifyOrderId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  return enqueueWriteBack(`cancel:${shopifyOrderId}`, async () => {
    const creds = await getShopifyCredentials(merchantId);
    if (!creds) {
      return { success: false, error: 'Shopify not connected' };
    }
    markWriteBack(shopifyOrderId);
    return cancelShopifyOrder(creds.shopDomain, creds.accessToken, shopifyOrderId, reason);
  });
}

const STATUS_TAG_MAP: Record<string, string> = {
  'READY_TO_SHIP': 'Robo-Confirm',
  'PENDING': 'Robo-Pending',
  'CANCELLED': 'Robo-Cancel',
};

const ALL_ROBO_TAGS = ['Robo-Confirm', 'Robo-Pending', 'Robo-Cancel'];

export async function writeBackTags(
  merchantId: string,
  shopifyOrderId: string,
  newStatus: string,
): Promise<{ success: boolean; error?: string }> {
  const newTag = STATUS_TAG_MAP[newStatus];
  if (!newTag) {
    return { success: true };
  }

  return enqueueWriteBack(`tags:${shopifyOrderId}`, async () => {
    const creds = await getShopifyCredentials(merchantId);
    if (!creds) {
      return { success: false, error: 'Shopify not connected' };
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

      const filteredTags = existingTags.filter((t: string) => !ALL_ROBO_TAGS.includes(t));
      filteredTags.push(newTag);
      const updatedTags = filteredTags.join(', ');

      markWriteBack(shopifyOrderId);

      await new Promise(r => setTimeout(r, 550));

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
        if (putRes.status === 403) {
          console.error(`[ShopifyWriteBack] Tag sync BLOCKED by missing Shopify scopes (write_orders). Update app permissions in Shopify Admin and reconnect store.`);
        }
        return { success: false, error: `Shopify API error ${putRes.status}: ${errText}` };
      }

      console.log(`[ShopifyWriteBack] Tags updated for order ${shopifyOrderId}: ${updatedTags}`);
      return { success: true };
    } catch (error: any) {
      console.error(`[ShopifyWriteBack] Tag update error:`, error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  });
}

export async function writeBackFulfillment(
  merchantId: string,
  orderId: string,
  shopifyOrderId: string,
  trackingNumber: string,
  courierDisplayName: string,
): Promise<{ success: boolean; fulfillmentId?: string; error?: string }> {
  return enqueueWriteBack(`fulfill:${shopifyOrderId}`, async () => {
    const creds = await getShopifyCredentials(merchantId);
    if (!creds) {
      console.warn(`[ShopifyWriteBack] Fulfillment skipped for order ${orderId}: Shopify not connected`);
      return { success: false, error: 'Shopify not connected' };
    }

    const order = await storage.getOrderById(merchantId, orderId);
    if (order?.shopifyFulfillmentId) {
      console.log(`[ShopifyWriteBack] Fulfillment already exists for order ${orderId}: ${order.shopifyFulfillmentId}`);
      return { success: true, fulfillmentId: order.shopifyFulfillmentId };
    }

    markWriteBack(shopifyOrderId);

    const MAX_RETRIES = 2;
    let lastError = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = attempt * 2000;
        console.log(`[ShopifyWriteBack] Fulfillment retry ${attempt}/${MAX_RETRIES} for order ${orderId} after ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }

      try {
        const result = await createShopifyFulfillment(
          creds.shopDomain,
          creds.accessToken,
          shopifyOrderId,
          trackingNumber,
          courierDisplayName,
        );

        if (result.success) {
          if (result.fulfillmentId) {
            await storage.updateOrder(merchantId, orderId, {
              shopifyFulfillmentId: result.fulfillmentId,
              fulfillmentStatus: 'fulfilled',
            });
            console.log(`[ShopifyWriteBack] Fulfillment created for order ${orderId}: ${result.fulfillmentId}`);
          } else {
            await storage.updateOrder(merchantId, orderId, {
              fulfillmentStatus: 'fulfilled',
            });
            console.log(`[ShopifyWriteBack] Order ${orderId} already fulfilled on Shopify`);
          }
          return { success: true, fulfillmentId: result.fulfillmentId };
        }

        lastError = result.error || 'Unknown fulfillment error';

        if (result.error?.includes('403') || result.error?.includes('merchant approval') || result.error?.includes('scope')) {
          console.error(`[ShopifyWriteBack] Fulfillment BLOCKED by missing Shopify scopes for order ${orderId}: ${result.error}`);
          console.error(`[ShopifyWriteBack] Fix: Update app permissions in Shopify Admin > Settings > Apps > API access, then reconnect store`);
          try {
            await storage.updateOrder(merchantId, orderId, {
              bookingError: `Shopify fulfillment blocked: missing permissions (write_fulfillments scope). Reconnect Shopify store after updating app permissions.`,
            });
          } catch {}
          return { success: false, error: result.error };
        }

        if (result.error?.includes('429') || result.error?.includes('rate')) {
          console.warn(`[ShopifyWriteBack] Rate limited on fulfillment for order ${orderId}, will retry`);
          continue;
        }

        if (result.error?.includes('5') && result.error?.includes('00')) {
          console.warn(`[ShopifyWriteBack] Server error on fulfillment for order ${orderId}, will retry`);
          continue;
        }

        console.error(`[ShopifyWriteBack] Fulfillment failed for order ${orderId}: ${result.error}`);
        return { success: false, error: result.error };
      } catch (err: any) {
        lastError = err.message || 'Unknown error';
        console.error(`[ShopifyWriteBack] Fulfillment exception for order ${orderId} attempt ${attempt}:`, err.message);
        if (attempt < MAX_RETRIES) continue;
      }
    }

    console.error(`[ShopifyWriteBack] Fulfillment exhausted retries for order ${orderId}: ${lastError}`);
    try {
      await storage.updateOrder(merchantId, orderId, {
        bookingError: `Shopify fulfillment failed: ${lastError}`,
      });
    } catch {}
    return { success: false, error: lastError };
  }) as Promise<{ success: boolean; fulfillmentId?: string; error?: string }>;
}
