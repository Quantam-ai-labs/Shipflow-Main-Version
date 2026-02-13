import { storage } from '../storage';
import { decryptToken } from './encryption';

const WEBHOOK_TOPICS = [
  'orders/create',
  'orders/updated',
  'fulfillments/create',
];

function getWebhookBaseUrl(): string {
  if (process.env.SHOPIFY_APP_URL) {
    return process.env.SHOPIFY_APP_URL.replace(/\/$/, '');
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return 'http://localhost:5000';
}

function topicToEndpoint(topic: string): string {
  return topic.replace('/', '-');
}

export async function registerShopifyWebhooks(merchantId: string): Promise<{ registered: string[]; failed: string[] }> {
  const store = await storage.getShopifyStore(merchantId);
  if (!store || !store.accessToken || !store.shopDomain) {
    throw new Error('Shopify store not connected or missing credentials');
  }

  const accessToken = decryptToken(store.accessToken);
  const baseUrl = getWebhookBaseUrl();
  const registered: string[] = [];
  const failed: string[] = [];

  const existingWebhooks = await listExistingWebhooks(store.shopDomain, accessToken);

  for (const topic of WEBHOOK_TOPICS) {
    const callbackUrl = `${baseUrl}/webhooks/shopify/${topicToEndpoint(topic)}`;

    try {
      const existing = existingWebhooks.find(
        (w: any) => w.topic === topic && w.address === callbackUrl
      );

      if (existing) {
        await updateWebhook(store.shopDomain, accessToken, existing.id, callbackUrl);
        registered.push(topic);
        console.log(`[Webhooks] Updated existing webhook for ${topic}`);
      } else {
        const oldWebhook = existingWebhooks.find((w: any) => w.topic === topic);
        if (oldWebhook) {
          await deleteWebhook(store.shopDomain, accessToken, oldWebhook.id);
        }
        await createWebhook(store.shopDomain, accessToken, topic, callbackUrl);
        registered.push(topic);
        console.log(`[Webhooks] Registered webhook for ${topic}`);
      }
    } catch (error: any) {
      console.error(`[Webhooks] Failed to register ${topic}:`, error.message);
      failed.push(topic);
    }
  }

  const webhookStatus = failed.length === 0 ? 'REGISTERED' : (registered.length > 0 ? 'PARTIAL' : 'ERROR');
  await storage.updateShopifyStore(store.id, {
    webhookStatus,
    webhookSubscriptions: { registered, failed, updatedAt: new Date().toISOString() } as any,
  });

  return { registered, failed };
}

async function listExistingWebhooks(shop: string, accessToken: string): Promise<any[]> {
  const url = `https://${shop}/admin/api/2025-01/webhooks.json`;
  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`[Webhooks] Failed to list webhooks: ${response.status}`);
    return [];
  }

  const data = await response.json();
  return data.webhooks || [];
}

async function createWebhook(shop: string, accessToken: string, topic: string, callbackUrl: string): Promise<void> {
  const url = `https://${shop}/admin/api/2025-01/webhooks.json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      webhook: {
        topic,
        address: callbackUrl,
        format: 'json',
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create webhook: ${response.status} ${errorText}`);
  }
}

async function updateWebhook(shop: string, accessToken: string, webhookId: number, callbackUrl: string): Promise<void> {
  const url = `https://${shop}/admin/api/2025-01/webhooks/${webhookId}.json`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      webhook: {
        id: webhookId,
        address: callbackUrl,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update webhook: ${response.status} ${errorText}`);
  }
}

export async function checkWebhookHealth(merchantId: string): Promise<{
  status: 'healthy' | 'partial' | 'missing' | 'error';
  registered: string[];
  missing: string[];
  callbackUrl: string;
}> {
  const store = await storage.getShopifyStore(merchantId);
  if (!store || !store.accessToken || !store.shopDomain) {
    throw new Error('Shopify store not connected or missing credentials');
  }

  const accessToken = decryptToken(store.accessToken);
  const baseUrl = getWebhookBaseUrl();
  const existingWebhooks = await listExistingWebhooks(store.shopDomain, accessToken);

  const registered: string[] = [];
  const missing: string[] = [];

  for (const topic of WEBHOOK_TOPICS) {
    const callbackUrl = `${baseUrl}/webhooks/shopify/${topicToEndpoint(topic)}`;
    const found = existingWebhooks.find(
      (w: any) => w.topic === topic && w.address === callbackUrl
    );
    if (found) {
      registered.push(topic);
    } else {
      missing.push(topic);
    }
  }

  const status = missing.length === 0
    ? 'healthy'
    : registered.length === 0
      ? 'missing'
      : 'partial';

  return {
    status,
    registered,
    missing,
    callbackUrl: `${baseUrl}/webhooks/shopify/...`,
  };
}

async function deleteWebhook(shop: string, accessToken: string, webhookId: number): Promise<void> {
  const url = `https://${shop}/admin/api/2025-01/webhooks/${webhookId}.json`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.warn(`[Webhooks] Failed to delete webhook ${webhookId}: ${response.status}`);
  }
}
