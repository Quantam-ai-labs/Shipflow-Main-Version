import { db } from '../db';
import { shopifyStores, merchants } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { autoMoveStalePending } from './workflowTransition';

interface SyncResult {
  timestamp: Date;
  ordersCreated: number;
  ordersUpdated: number;
  totalFetched: number;
  error?: string;
}

const lastSyncResults = new Map<string, SyncResult>();
const merchantSyncLocks = new Set<string>();

interface ShopifySyncMetrics {
  lastSyncTime: Date | null;
  lastSyncDurationMs: number;
  totalSyncs: number;
  totalErrors: number;
  ordersCreated: number;
  ordersUpdated: number;
  lastErrorMessage: string | null;
  lastErrorTime: Date | null;
}

const shopifySyncMetrics = new Map<string, ShopifySyncMetrics>();

function getOrCreateShopifyMetrics(merchantId: string): ShopifySyncMetrics {
  let m = shopifySyncMetrics.get(merchantId);
  if (!m) {
    m = {
      lastSyncTime: null,
      lastSyncDurationMs: 0,
      totalSyncs: 0,
      totalErrors: 0,
      ordersCreated: 0,
      ordersUpdated: 0,
      lastErrorMessage: null,
      lastErrorTime: null,
    };
    shopifySyncMetrics.set(merchantId, m);
  }
  return m;
}

export function getShopifySyncMetrics(): Map<string, ShopifySyncMetrics> {
  return shopifySyncMetrics;
}

export function acquireMerchantSyncLock(merchantId: string): boolean {
  if (merchantSyncLocks.has(merchantId)) return false;
  merchantSyncLocks.add(merchantId);
  return true;
}

export function releaseMerchantSyncLock(merchantId: string): void {
  merchantSyncLocks.delete(merchantId);
}

export function isMerchantSyncing(merchantId: string): boolean {
  return merchantSyncLocks.has(merchantId);
}

export async function waitForMerchantSyncLock(merchantId: string, timeoutMs: number = 15000): Promise<boolean> {
  if (acquireMerchantSyncLock(merchantId)) return true;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (acquireMerchantSyncLock(merchantId)) return true;
  }
  return false;
}

export async function runStaleOrderCheck() {
  try {
    const allMerchants = await db.select({ id: merchants.id }).from(merchants);
    for (const m of allMerchants) {
      const moved = await autoMoveStalePending(m.id);
      if (moved > 0) {
        console.log(`[AutoSync] Auto-moved ${moved} stale NEW orders to PENDING for merchant ${m.id}`);
      }
    }
  } catch (error: any) {
    console.error('[AutoSync] Stale order check error:', error.message);
  }
}

export function getLastSyncResult(merchantId: string): SyncResult | null {
  return lastSyncResults.get(merchantId) || null;
}

export async function runShopifySync(merchantId: string): Promise<void> {
  const store = await db.select().from(shopifyStores)
    .where(eq(shopifyStores.merchantId, merchantId))
    .then(rows => rows[0]);

  if (!store || !store.isConnected || !store.accessToken || !store.shopDomain) {
    return;
  }

  if (!acquireMerchantSyncLock(merchantId)) {
    return;
  }

  const metrics = getOrCreateShopifyMetrics(merchantId);
  const startMs = Date.now();

  try {
    const { ShopifyService } = await import('./shopify');
    const shopifyService = new ShopifyService();
    const result = await shopifyService.syncOrders(merchantId, store.shopDomain, false);

    lastSyncResults.set(merchantId, {
      timestamp: new Date(),
      ordersCreated: result.synced,
      ordersUpdated: result.updated,
      totalFetched: result.total,
    });

    metrics.lastSyncTime = new Date();
    metrics.lastSyncDurationMs = Date.now() - startMs;
    metrics.totalSyncs++;
    metrics.ordersCreated += result.synced;
    metrics.ordersUpdated += result.updated;

    if (result.synced > 0 || result.updated > 0) {
      console.log(`[AutoSync] Synced ${result.synced} new, ${result.updated} updated orders for ${store.shopDomain}`);
    }
  } catch (error: any) {
    console.error(`[AutoSync] Error syncing ${store.shopDomain}:`, error.message);
    metrics.totalErrors++;
    metrics.lastErrorMessage = error.message;
    metrics.lastErrorTime = new Date();
    metrics.lastSyncTime = new Date();
    metrics.lastSyncDurationMs = Date.now() - startMs;
    metrics.totalSyncs++;
    lastSyncResults.set(merchantId, {
      timestamp: new Date(),
      ordersCreated: 0,
      ordersUpdated: 0,
      totalFetched: 0,
      error: error.message,
    });
    throw error;
  } finally {
    releaseMerchantSyncLock(merchantId);
  }
}

export function isSyncRunning() {
  return merchantSyncLocks.size > 0;
}

export function startAutoSync() {
  console.log('[AutoSync] Auto sync is now managed by SyncManager');
}

export function stopAutoSync() {
  console.log('[AutoSync] Stopped (managed by SyncManager)');
}
