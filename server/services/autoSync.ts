import { db } from '../db';
import { shopifyStores, merchants } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { autoMoveStalePending } from './workflowTransition';

const SYNC_INTERVAL_MS = 300_000;
const STALE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

interface SyncResult {
  timestamp: Date;
  ordersCreated: number;
  ordersUpdated: number;
  totalFetched: number;
  error?: string;
}

let syncTimer: ReturnType<typeof setInterval> | null = null;
let staleTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
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

async function runStaleOrderCheck() {
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

export function isSyncRunning() {
  return isSyncing;
}

async function runAutoSync() {
  if (isSyncing) {
    return;
  }

  isSyncing = true;

  try {
    const connectedStores = await db
      .select()
      .from(shopifyStores)
      .where(eq(shopifyStores.isConnected, true));

    if (connectedStores.length === 0) {
      isSyncing = false;
      return;
    }

    const { ShopifyService } = await import('./shopify');

    for (const store of connectedStores) {
      if (!store.accessToken || !store.shopDomain || !store.merchantId) {
        continue;
      }

      if (!acquireMerchantSyncLock(store.merchantId)) {
        continue;
      }

      const metrics = getOrCreateShopifyMetrics(store.merchantId);
      const startMs = Date.now();
      try {
        const shopifyService = new ShopifyService();
        const result = await shopifyService.syncOrders(store.merchantId, store.shopDomain, false);

        lastSyncResults.set(store.merchantId, {
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

        const syncLagMs = metrics.lastSyncTime ? Date.now() - metrics.lastSyncTime.getTime() : 0;
        if (syncLagMs > 15 * 60 * 1000) {
          console.warn(`[AutoSync] WARNING: Shopify sync lag for merchant ${store.merchantId} exceeds 15 minutes (${Math.round(syncLagMs / 60000)}m)`);
        }
      } catch (error: any) {
        console.error(`[AutoSync] Error syncing ${store.shopDomain}:`, error.message);
        metrics.totalErrors++;
        metrics.lastErrorMessage = error.message;
        metrics.lastErrorTime = new Date();
        metrics.lastSyncTime = new Date();
        metrics.lastSyncDurationMs = Date.now() - startMs;
        metrics.totalSyncs++;
        lastSyncResults.set(store.merchantId, {
          timestamp: new Date(),
          ordersCreated: 0,
          ordersUpdated: 0,
          totalFetched: 0,
          error: error.message,
        });
      } finally {
        releaseMerchantSyncLock(store.merchantId);
      }
    }
  } catch (error: any) {
    console.error('[AutoSync] Fatal error:', error.message);
  } finally {
    isSyncing = false;
  }
}

export function startAutoSync() {
  if (syncTimer) {
    return;
  }

  console.log(`[AutoSync] Starting automatic Shopify sync every ${SYNC_INTERVAL_MS / 1000}s`);

  setTimeout(() => runAutoSync(), 5000);
  syncTimer = setInterval(runAutoSync, SYNC_INTERVAL_MS);

  setTimeout(() => runStaleOrderCheck(), 15000);
  staleTimer = setInterval(runStaleOrderCheck, STALE_CHECK_INTERVAL_MS);
}

export function stopAutoSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  if (staleTimer) {
    clearInterval(staleTimer);
    staleTimer = null;
  }
  console.log('[AutoSync] Stopped automatic sync');
}
