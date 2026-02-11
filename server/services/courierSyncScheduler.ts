import { db } from '../db';
import { orders, merchants, courierAccounts } from '../../shared/schema';
import { eq, and, or, isNull, sql, desc, notInArray } from 'drizzle-orm';
import { trackShipment, type CourierCredentials } from './couriers';
import { storage } from '../storage';

const COURIER_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const LEOPARDS_BATCH_SIZE = 10;
const POSTEX_DELAY_MS = 300;
const BATCH_DELAY_MS = 500;

interface CourierSyncResult {
  timestamp: Date;
  updated: number;
  failed: number;
  skipped: number;
  total: number;
  error?: string;
}

let syncTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
const lastSyncResults = new Map<string, CourierSyncResult>();

function normalizeCourierName(raw: string): string {
  const name = raw.toLowerCase().trim();
  if (name.includes('leopard')) return 'leopards';
  if (name.includes('postex') || name.includes('post ex')) return 'postex';
  if (name.includes('tcs')) return 'tcs';
  return name;
}

async function getCourierCredentials(merchantId: string, courierName: string): Promise<{ apiKey: string | null; apiSecret: string | null } | null> {
  const normalized = normalizeCourierName(courierName);
  const accounts = await storage.getCourierAccounts(merchantId);
  const account = accounts.find(a => a.courierName === normalized);
  const settings = (account?.settings as Record<string, any>) || {};

  if (normalized === 'leopards') {
    const apiKey = settings.apiKey || process.env.LEOPARDS_API_KEY || null;
    const apiSecret = settings.apiPassword || process.env.LEOPARDS_API_PASSWORD || null;
    return { apiKey, apiSecret };
  }
  if (normalized === 'postex') {
    const apiKey = settings.apiToken || process.env.POSTEX_API_TOKEN || null;
    return { apiKey, apiSecret: null };
  }
  return null;
}

async function syncMerchantCourierStatuses(merchantId: string): Promise<CourierSyncResult> {
  const trackableOrders = await storage.getOrdersForCourierSync(merchantId, {
    forceRefresh: false,
    limit: 500,
  });

  if (trackableOrders.length === 0) {
    return { timestamp: new Date(), updated: 0, failed: 0, skipped: 0, total: 0 };
  }

  const courierCredsCache = new Map<string, { apiKey: string | null; apiSecret: string | null } | null>();
  for (const order of trackableOrders) {
    const cn = normalizeCourierName(order.courierName!);
    if (!courierCredsCache.has(cn)) {
      courierCredsCache.set(cn, await getCourierCredentials(merchantId, cn));
    }
  }

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  const leopardsOrders = trackableOrders.filter(o => normalizeCourierName(o.courierName!) === 'leopards');
  const postexOrders = trackableOrders.filter(o => normalizeCourierName(o.courierName!) === 'postex');
  const otherOrders = trackableOrders.filter(o => {
    const cn = normalizeCourierName(o.courierName!);
    return cn !== 'leopards' && cn !== 'postex';
  });

  for (let i = 0; i < leopardsOrders.length; i += LEOPARDS_BATCH_SIZE) {
    const batch = leopardsOrders.slice(i, i + LEOPARDS_BATCH_SIZE);
    const creds = courierCredsCache.get('leopards');
    if (!creds || !creds.apiKey) {
      skipped += batch.length;
      continue;
    }

    const results = await Promise.allSettled(
      batch.map(async (order) => {
        try {
          const credObj: CourierCredentials = { apiKey: creds.apiKey || undefined, apiSecret: creds.apiSecret || undefined };
          const result = await trackShipment(order.courierName!, order.courierTracking!, credObj, order.shipmentStatus);
          if (result && result.success) {
            await storage.updateOrder(merchantId, order.id, {
              shipmentStatus: result.normalizedStatus,
              courierRawStatus: result.rawCourierStatus,
              lastTrackingUpdate: new Date(),
            });
            return 'updated';
          }
          return 'failed';
        } catch {
          return 'failed';
        }
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value === 'updated') updated++;
        else failed++;
      } else {
        failed++;
      }
    }

    if (i + LEOPARDS_BATCH_SIZE < leopardsOrders.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  for (const order of postexOrders) {
    const creds = courierCredsCache.get('postex');
    if (!creds || !creds.apiKey) {
      skipped++;
      continue;
    }

    try {
      const credObj: CourierCredentials = { apiKey: creds.apiKey || undefined, apiSecret: creds.apiSecret || undefined };
      const result = await trackShipment(order.courierName!, order.courierTracking!, credObj, order.shipmentStatus);
      if (result && result.success) {
        await storage.updateOrder(merchantId, order.id, {
          shipmentStatus: result.normalizedStatus,
          courierRawStatus: result.rawCourierStatus,
          lastTrackingUpdate: new Date(),
        });
        updated++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }

    await new Promise(resolve => setTimeout(resolve, POSTEX_DELAY_MS));
  }

  skipped += otherOrders.length;

  return { timestamp: new Date(), updated, failed, skipped, total: trackableOrders.length };
}

async function runCourierSync() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const allMerchants = await db.select({ id: merchants.id }).from(merchants);

    for (const m of allMerchants) {
      try {
        const result = await syncMerchantCourierStatuses(m.id);
        lastSyncResults.set(m.id, result);

        if (result.updated > 0 || result.failed > 0) {
          console.log(`[CourierSync] Merchant ${m.id}: ${result.updated} updated, ${result.failed} failed, ${result.skipped} skipped out of ${result.total}`);
        }
      } catch (error: any) {
        console.error(`[CourierSync] Error for merchant ${m.id}:`, error.message);
        lastSyncResults.set(m.id, {
          timestamp: new Date(),
          updated: 0,
          failed: 0,
          skipped: 0,
          total: 0,
          error: error.message,
        });
      }
    }
  } catch (error: any) {
    console.error('[CourierSync] Fatal error:', error.message);
  } finally {
    isSyncing = false;
  }
}

export function getLastCourierSyncResult(merchantId: string): CourierSyncResult | null {
  return lastSyncResults.get(merchantId) || null;
}

export function isCourierSyncRunning() {
  return isSyncing;
}

export function startCourierSyncScheduler() {
  if (syncTimer) return;

  console.log(`[CourierSync] Starting courier status sync every ${COURIER_SYNC_INTERVAL_MS / 1000}s`);

  setTimeout(() => runCourierSync(), 30000);
  syncTimer = setInterval(runCourierSync, COURIER_SYNC_INTERVAL_MS);
}

export function stopCourierSyncScheduler() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  console.log('[CourierSync] Stopped courier status sync');
}

export { syncMerchantCourierStatuses };
