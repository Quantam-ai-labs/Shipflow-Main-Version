import { db } from '../db';
import { shopifyStores, merchants } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { autoMoveStalePending } from './workflowTransition';

const SYNC_INTERVAL_MS = 30_000;
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

      try {
        const shopifyService = new ShopifyService();
        const result = await shopifyService.syncOrders(store.merchantId, store.shopDomain, false);

        lastSyncResults.set(store.merchantId, {
          timestamp: new Date(),
          ordersCreated: result.synced,
          ordersUpdated: result.updated,
          totalFetched: result.total,
        });

        if (result.synced > 0 || result.updated > 0) {
          console.log(`[AutoSync] Synced ${result.synced} new, ${result.updated} updated orders for ${store.shopDomain}`);
        }
      } catch (error: any) {
        console.error(`[AutoSync] Error syncing ${store.shopDomain}:`, error.message);
        lastSyncResults.set(store.merchantId, {
          timestamp: new Date(),
          ordersCreated: 0,
          ordersUpdated: 0,
          totalFetched: 0,
          error: error.message,
        });
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
