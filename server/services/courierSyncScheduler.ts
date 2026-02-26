import { db } from '../db';
import { orders, merchants, courierAccounts } from '../../shared/schema';
import { eq, and, or, isNull, sql, desc, notInArray } from 'drizzle-orm';
import { trackShipment, getWorkflowStageMapping, detectCourierType, type CourierCredentials } from './couriers';
import { leopardsService } from './couriers/leopards';
import { normalizeStatus, type UniversalStatus, DEFAULT_WORKFLOW_STAGE_MAP, isValidUniversalStatus } from './statusNormalization';
import { storage } from '../storage';
import { transitionOrder } from './workflowTransition';

const COURIER_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const LEOPARDS_BATCH_SIZE = 10;
const POSTEX_BATCH_SIZE = 10;
const POSTEX_DELAY_MS = 300;
const BATCH_DELAY_MS = 500;


interface CourierSyncResult {
  timestamp: Date;
  updated: number;
  failed: number;
  skipped: number;
  total: number;
  transitioned?: number;
  error?: string;
}

let syncTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let syncCycleCounter = 0;
const LOW_PRIORITY_CYCLE_INTERVAL = 3;
const lastSyncResults = new Map<string, CourierSyncResult>();

interface CourierSyncMetrics {
  lastSyncTime: Date | null;
  lastSyncDurationMs: number;
  totalSyncs: number;
  totalErrors: number;
  ordersProcessed: { leopards: number; postex: number; other: number };
  lastErrorMessage: string | null;
  lastErrorTime: Date | null;
}

const courierSyncMetrics = new Map<string, CourierSyncMetrics>();

function getOrCreateMetrics(merchantId: string): CourierSyncMetrics {
  let m = courierSyncMetrics.get(merchantId);
  if (!m) {
    m = {
      lastSyncTime: null,
      lastSyncDurationMs: 0,
      totalSyncs: 0,
      totalErrors: 0,
      ordersProcessed: { leopards: 0, postex: 0, other: 0 },
      lastErrorMessage: null,
      lastErrorTime: null,
    };
    courierSyncMetrics.set(merchantId, m);
  }
  return m;
}

export function getCourierSyncMetrics(): Map<string, CourierSyncMetrics> {
  return courierSyncMetrics;
}
interface ManualSyncProgress {
  status: 'running' | 'done' | 'error';
  result?: CourierSyncResult;
  error?: string;
  startedAt: Date;
  processed: number;
  total: number;
}
const manualSyncProgress = new Map<string, ManualSyncProgress>();

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

async function createShopifyFulfillmentForOrder(merchantId: string, order: any, trackingNumber: string, courierName: string): Promise<void> {
  try {
    if (!order.shopifyOrderId) return;
    if (order.shopifyFulfillmentId) return;

    const shopifyStore = await storage.getShopifyStore(merchantId);
    if (!shopifyStore?.accessToken || !shopifyStore?.shopDomain) return;

    const { decryptToken } = await import('./encryption');
    const { createShopifyFulfillment } = await import('./shopify');
    const decryptedToken = decryptToken(shopifyStore.accessToken);

    const fulfillResult = await createShopifyFulfillment(
      shopifyStore.shopDomain,
      decryptedToken,
      order.shopifyOrderId,
      trackingNumber,
      courierName
    );

    if (fulfillResult.success && fulfillResult.fulfillmentId) {
      await storage.updateOrder(merchantId, order.id, {
        shopifyFulfillmentId: fulfillResult.fulfillmentId,
      });
      console.log(`[CourierSync] Shopify fulfillment created for order ${order.orderNumber}: ${fulfillResult.fulfillmentId}`);
    } else if (!fulfillResult.success) {
      console.warn(`[CourierSync] Shopify fulfillment failed for order ${order.orderNumber}: ${fulfillResult.error}`);
    }
  } catch (err: any) {
    console.warn(`[CourierSync] Shopify fulfillment error for order ${order.orderNumber}:`, err.message);
  }
}

async function resolveTargetWorkflowStage(merchantId: string, courierName: string, normalizedStatus: string, rawCourierStatus?: string): Promise<string | null> {
  const courierType = detectCourierType(courierName || '');
  if (courierType) {
    const custom = await getWorkflowStageMapping(merchantId, courierType, normalizedStatus, rawCourierStatus);
    if (custom) {
      console.log(`[CourierSync] Custom stage mapping: ${rawCourierStatus || normalizedStatus} → ${normalizedStatus} → ${custom} (courier: ${courierType})`);
      return custom;
    }
  }
  const defaultStage = DEFAULT_WORKFLOW_STAGE_MAP[normalizedStatus];
  if (defaultStage) return defaultStage;
  console.log(`[CourierSync] No stage mapping found for status "${normalizedStatus}" — order stays in current stage`);
  return null;
}

async function cancelShopifyFulfillmentForOrder(merchantId: string, order: any): Promise<void> {
  try {
    if (!order.shopifyFulfillmentId) return;

    const shopifyStore = await storage.getShopifyStore(merchantId);
    if (!shopifyStore?.accessToken || !shopifyStore?.shopDomain) return;

    const { decryptToken } = await import('./encryption');
    const { cancelShopifyFulfillment } = await import('./shopify');
    const decryptedToken = decryptToken(shopifyStore.accessToken);

    const result = await cancelShopifyFulfillment(
      shopifyStore.shopDomain,
      decryptedToken,
      order.shopifyFulfillmentId,
    );

    if (result.success) {
      console.log(`[CourierSync] Shopify fulfillment cancelled for order ${order.orderNumber}: ${order.shopifyFulfillmentId}`);
    } else {
      console.warn(`[CourierSync] Shopify fulfillment cancel failed for order ${order.orderNumber}: ${result.error}`);
    }
  } catch (err: any) {
    console.warn(`[CourierSync] Shopify fulfillment cancel error for order ${order.orderNumber}:`, err.message);
  }
}

async function autoTransitionOrder(merchantId: string, order: any, newShipmentStatus: string, rawCourierStatus?: string): Promise<string | null> {
  const currentWorkflow = order.workflowStatus;
  const targetWorkflow = await resolveTargetWorkflowStage(merchantId, order.courierName || '', newShipmentStatus, rawCourierStatus);

  if (currentWorkflow === 'BOOKED' && newShipmentStatus === 'CANCELLED') {
    const result = await transitionOrder({
      merchantId,
      orderId: order.id,
      toStatus: 'READY_TO_SHIP',
      action: 'courier_status_sync',
      actorType: 'system',
      reason: `Courier booking cancelled — auto-reverted to Ready to Ship (was ${currentWorkflow})`,
    });

    if (result.success) {
      await cancelShopifyFulfillmentForOrder(merchantId, order);

      await storage.updateOrderWorkflow(merchantId, order.id, {
        courierName: null,
        courierTracking: null,
        courierSlipUrl: null,
        bookingStatus: null,
        bookingError: null,
        bookedAt: null,
        shipmentStatus: 'Unfulfilled',
        courierRawStatus: null,
        shopifyFulfillmentId: null,
      });

      console.log(`[CourierSync] Order ${order.orderNumber} courier-cancelled: BOOKED -> READY_TO_SHIP (courier data cleared, fulfillment cancelled)`);
      return 'READY_TO_SHIP';
    }

    console.warn(`[CourierSync] Failed to revert order ${order.orderNumber} from BOOKED -> READY_TO_SHIP after courier cancellation`);
    return null;
  }

  if (!targetWorkflow) return null;
  if (currentWorkflow === targetWorkflow) return null;

  const extraData: Record<string, any> = {};

  if (targetWorkflow === 'FULFILLED') {
    extraData.dispatchedAt = new Date();
  } else if (targetWorkflow === 'DELIVERED') {
    extraData.deliveredAt = new Date();
  } else if (targetWorkflow === 'RETURN') {
    extraData.returnedAt = new Date();
  } else if (targetWorkflow === 'CANCELLED') {
    extraData.cancelledAt = new Date();
  }

  const result = await transitionOrder({
    merchantId,
    orderId: order.id,
    toStatus: targetWorkflow,
    action: 'courier_status_sync',
    actorType: 'system',
    reason: `Courier mapping: ${newShipmentStatus} → ${targetWorkflow} (was ${currentWorkflow})`,
    extraData,
  });

  if (result.success) {
    if (targetWorkflow === 'FULFILLED' && currentWorkflow === 'BOOKED') {
      const courierDisplayName = normalizeCourierName(order.courierName || '') === 'leopards' ? 'Leopards' : 'PostEx';
      await createShopifyFulfillmentForOrder(merchantId, order, order.courierTracking, courierDisplayName);
    }
    console.log(`[CourierSync] Order ${order.orderNumber} transitioned ${currentWorkflow} -> ${targetWorkflow} (courier: ${newShipmentStatus})`);
    return targetWorkflow;
  }

  console.warn(`[CourierSync] Failed to transition order ${order.orderNumber} from ${currentWorkflow} -> ${targetWorkflow}`);
  return null;
}

async function syncMerchantCourierStatuses(merchantId: string, options?: { forceRefresh?: boolean; limit?: number; includeLowPriority?: boolean; onProgress?: (processed: number, total: number) => void }): Promise<CourierSyncResult> {
  const syncLimit = options?.limit || 2000;
  const forceRefresh = options?.forceRefresh || false;
  const includeLowPriority = options?.includeLowPriority !== false;
  const trackableOrders = await storage.getOrdersForCourierSync(merchantId, {
    forceRefresh,
    limit: syncLimit,
    includeLowPriority,
  });

  if (trackableOrders.length === 0) {
    return { timestamp: new Date(), updated: 0, failed: 0, skipped: 0, total: 0, transitioned: 0 };
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
  let transitioned = 0;
  let processedCount = 0;
  const totalCount = trackableOrders.length;
  const reportProgress = options?.onProgress;
  if (reportProgress) reportProgress(0, totalCount);

  const leopardsOrders = trackableOrders.filter(o => normalizeCourierName(o.courierName!) === 'leopards');
  const postexOrders = trackableOrders.filter(o => normalizeCourierName(o.courierName!) === 'postex');
  const otherOrders = trackableOrders.filter(o => {
    const cn = normalizeCourierName(o.courierName!);
    return cn !== 'leopards' && cn !== 'postex';
  });

  let leopardsProcessed = 0;
  let postexProcessed = 0;

  const updateCombinedProgress = () => {
    if (reportProgress) {
      reportProgress(leopardsProcessed + postexProcessed + otherOrders.length, totalCount);
    }
  };

  const syncLeopards = async (): Promise<{ updated: number; failed: number; skipped: number; transitioned: number }> => {
    let lUpdated = 0, lFailed = 0, lSkipped = 0, lTransitioned = 0;

    const leopardsCreds = courierCredsCache.get('leopards');
    if (!leopardsCreds || !leopardsCreds.apiKey) {
      lSkipped += leopardsOrders.length;
      leopardsProcessed = leopardsOrders.length;
      updateCombinedProgress();
      return { updated: lUpdated, failed: lFailed, skipped: lSkipped, transitioned: lTransitioned };
    }

    if (leopardsOrders.length === 0) {
      return { updated: 0, failed: 0, skipped: 0, transitioned: 0 };
    }

    const trackingNumbers = leopardsOrders.map(o => o.courierTracking!).filter(Boolean);
    const bulkResults = await leopardsService.trackMultiple(trackingNumbers, {
      apiKey: leopardsCreds.apiKey,
      apiPassword: leopardsCreds.apiSecret || undefined,
    });

    const courierType = detectCourierType(leopardsOrders[0].courierName || 'leopards');
    let customMappings: Record<string, string> | undefined;
    if (courierType) {
      try {
        const mappingRows = await storage.getCourierStatusMappings(merchantId, courierType);
        if (mappingRows && mappingRows.length > 0) {
          customMappings = {};
          for (const m of mappingRows) {
            customMappings[m.courierStatus] = m.normalizedStatus;
          }
        }
      } catch {}
    }

    for (const order of leopardsOrders) {
      const trackResult = bulkResults.get(order.courierTracking!);
      if (!trackResult || !trackResult.success) {
        lFailed++;
        leopardsProcessed++;
        updateCombinedProgress();
        continue;
      }

      try {
        const rawCourierStatus = trackResult.courierStatus || trackResult.status;
        const { normalizedStatus, mapped } = normalizeStatus(
          rawCourierStatus,
          courierType || 'leopards',
          order.shipmentStatus,
          trackResult.events,
          order.workflowStatus,
          customMappings,
        );

        if (!mapped && rawCourierStatus) {
          try {
            await storage.recordUnmappedStatus(merchantId, courierType || 'leopards', rawCourierStatus, order.courierTracking!);
          } catch {}
        }

        if (!isValidUniversalStatus(normalizedStatus)) {
          console.warn(`[CourierSync] Rejected invalid status "${normalizedStatus}" for order ${order.orderNumber} (raw: "${rawCourierStatus}") — keeping current status`);
          lSkipped++;
          leopardsProcessed++;
          updateCombinedProgress();
          continue;
        }

        await storage.updateOrder(merchantId, order.id, {
          shipmentStatus: normalizedStatus,
          courierRawStatus: rawCourierStatus,
          lastTrackingUpdate: new Date(),
        });

        const newWorkflow = await autoTransitionOrder(merchantId, order, normalizedStatus, rawCourierStatus);
        if (newWorkflow) lTransitioned++;

        lUpdated++;
      } catch {
        lFailed++;
      }
      leopardsProcessed++;
      updateCombinedProgress();
    }

    return { updated: lUpdated, failed: lFailed, skipped: lSkipped, transitioned: lTransitioned };
  };

  const syncPostex = async (): Promise<{ updated: number; failed: number; skipped: number; transitioned: number }> => {
    let pUpdated = 0, pFailed = 0, pSkipped = 0, pTransitioned = 0;

    const postexCreds = courierCredsCache.get('postex');
    if (!postexCreds || !postexCreds.apiKey) {
      pSkipped += postexOrders.length;
      postexProcessed = postexOrders.length;
      updateCombinedProgress();
      return { updated: pUpdated, failed: pFailed, skipped: pSkipped, transitioned: pTransitioned };
    }

    for (let i = 0; i < postexOrders.length; i += POSTEX_BATCH_SIZE) {
      const batch = postexOrders.slice(i, i + POSTEX_BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (order) => {
          try {
            const credObj: CourierCredentials = { apiKey: postexCreds.apiKey || undefined, apiSecret: postexCreds.apiSecret || undefined };
            const result = await trackShipment(order.courierName!, order.courierTracking!, credObj, order.shipmentStatus, order.workflowStatus, merchantId);
            if (result && result.success) {
              if (!isValidUniversalStatus(result.normalizedStatus)) {
                console.warn(`[CourierSync] Rejected invalid PostEx status "${result.normalizedStatus}" for order ${order.orderNumber} (raw: "${result.rawCourierStatus}") — keeping current status`);
                return 'skipped';
              }

              await storage.updateOrder(merchantId, order.id, {
                shipmentStatus: result.normalizedStatus,
                courierRawStatus: result.rawCourierStatus,
                lastTrackingUpdate: new Date(),
              });

              const newWorkflow = await autoTransitionOrder(merchantId, order, result.normalizedStatus, result.rawCourierStatus);
              if (newWorkflow) pTransitioned++;

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
          if (r.value === 'updated') pUpdated++;
          else if (r.value === 'skipped') pSkipped++;
          else pFailed++;
        } else {
          pFailed++;
        }
      }

      postexProcessed += batch.length;
      updateCombinedProgress();

      if (i + POSTEX_BATCH_SIZE < postexOrders.length) {
        await new Promise(resolve => setTimeout(resolve, POSTEX_DELAY_MS));
      }
    }

    return { updated: pUpdated, failed: pFailed, skipped: pSkipped, transitioned: pTransitioned };
  };

  const [leopardsResult, postexResult] = await Promise.allSettled([syncLeopards(), syncPostex()]);

  if (leopardsResult.status === 'fulfilled') {
    updated += leopardsResult.value.updated;
    failed += leopardsResult.value.failed;
    skipped += leopardsResult.value.skipped;
    transitioned += leopardsResult.value.transitioned;
  } else {
    console.error(`[CourierSync] Leopards sync failed for merchant ${merchantId}:`, leopardsResult.reason?.message || leopardsResult.reason);
    failed += leopardsOrders.length;
  }

  if (postexResult.status === 'fulfilled') {
    updated += postexResult.value.updated;
    failed += postexResult.value.failed;
    skipped += postexResult.value.skipped;
    transitioned += postexResult.value.transitioned;
  } else {
    console.error(`[CourierSync] PostEx sync failed for merchant ${merchantId}:`, postexResult.reason?.message || postexResult.reason);
    failed += postexOrders.length;
  }

  skipped += otherOrders.length;
  processedCount = totalCount;
  if (reportProgress) reportProgress(processedCount, totalCount);

  return { timestamp: new Date(), updated, failed, skipped, total: trackableOrders.length, transitioned };
}

async function runCourierSync() {
  if (isSyncing) {
    console.log('[CourierSync] Skipping cycle — previous sync still running');
    return;
  }
  isSyncing = true;
  syncCycleCounter++;
  const includeLowPriority = syncCycleCounter % LOW_PRIORITY_CYCLE_INTERVAL === 0;

  try {
    const allMerchants = await db.select({ id: merchants.id }).from(merchants);

    if (includeLowPriority) {
      console.log(`[CourierSync] Cycle ${syncCycleCounter}: Including low-priority orders (every ${LOW_PRIORITY_CYCLE_INTERVAL} cycles)`);
    }

    for (const m of allMerchants) {
      const metrics = getOrCreateMetrics(m.id);
      const startMs = Date.now();
      try {
        const result = await syncMerchantCourierStatuses(m.id, { includeLowPriority });
        lastSyncResults.set(m.id, result);

        metrics.lastSyncTime = new Date();
        metrics.lastSyncDurationMs = Date.now() - startMs;
        metrics.totalSyncs++;

        if (result.updated > 0 || result.failed > 0 || result.transitioned) {
          console.log(`[CourierSync] Merchant ${m.id}: ${result.updated} updated, ${result.failed} failed, ${result.skipped} skipped out of ${result.total}${result.transitioned ? `, ${result.transitioned} transitioned` : ''}`);
        }

        if (result.error) {
          metrics.totalErrors++;
          metrics.lastErrorMessage = result.error;
          metrics.lastErrorTime = new Date();
        }
      } catch (error: any) {
        console.error(`[CourierSync] Error for merchant ${m.id}:`, error.message);
        metrics.totalErrors++;
        metrics.lastErrorMessage = error.message;
        metrics.lastErrorTime = new Date();
        metrics.lastSyncTime = new Date();
        metrics.lastSyncDurationMs = Date.now() - startMs;
        metrics.totalSyncs++;
        lastSyncResults.set(m.id, {
          timestamp: new Date(),
          updated: 0,
          failed: 0,
          skipped: 0,
          total: 0,
          error: error.message,
        });
      }

      const syncLagMs = metrics.lastSyncTime ? Date.now() - metrics.lastSyncTime.getTime() : 0;
      if (syncLagMs > 15 * 60 * 1000) {
        console.warn(`[CourierSync] WARNING: Sync lag for merchant ${m.id} exceeds 15 minutes (${Math.round(syncLagMs / 60000)}m)`);
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

export function startManualCourierSync(merchantId: string): boolean {
  const existing = manualSyncProgress.get(merchantId);
  if (existing?.status === 'running') return false;

  manualSyncProgress.set(merchantId, { status: 'running', startedAt: new Date(), processed: 0, total: 0 });

  (async () => {
    try {
      const CHUNK_SIZE = 1000;
      const MAX_CHUNKS = 20;
      let totalResult: CourierSyncResult = { timestamp: new Date(), updated: 0, failed: 0, skipped: 0, total: 0, transitioned: 0 };
      let chunkCount = 0;
      let cumulativeProcessed = 0;

      while (chunkCount < MAX_CHUNKS) {
        chunkCount++;
        const chunkOffset = cumulativeProcessed;
        const result = await syncMerchantCourierStatuses(merchantId, {
          forceRefresh: false,
          limit: CHUNK_SIZE,
          includeLowPriority: true,
          onProgress: (processed, total) => {
            const progress = manualSyncProgress.get(merchantId);
            if (progress) {
              progress.processed = chunkOffset + processed;
              progress.total = chunkOffset + total;
            }
          },
        });

        totalResult.updated += result.updated;
        totalResult.failed += result.failed;
        totalResult.skipped += result.skipped;
        totalResult.total += result.total;
        totalResult.transitioned = (totalResult.transitioned || 0) + (result.transitioned || 0);
        cumulativeProcessed += result.total;

        if (result.total < CHUNK_SIZE) break;

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      totalResult.timestamp = new Date();
      manualSyncProgress.set(merchantId, { status: 'done', result: totalResult, startedAt: manualSyncProgress.get(merchantId)!.startedAt, processed: cumulativeProcessed, total: cumulativeProcessed });
      lastSyncResults.set(merchantId, totalResult);
      console.log(`[CourierSync] Manual sync done for merchant ${merchantId}: ${totalResult.updated} updated, ${totalResult.failed} failed, ${totalResult.total} total (${chunkCount} chunks)`);
    } catch (err: any) {
      manualSyncProgress.set(merchantId, { status: 'error', error: err.message, startedAt: manualSyncProgress.get(merchantId)!.startedAt, processed: 0, total: 0 });
      console.error(`[CourierSync] Manual sync error for merchant ${merchantId}:`, err.message);
    } finally {
      const progress = manualSyncProgress.get(merchantId);
      if (progress && progress.status === 'running') {
        manualSyncProgress.set(merchantId, {
          ...progress,
          status: 'error',
          error: 'Sync ended unexpectedly',
        });
      }
    }
  })();

  return true;
}

export function getManualSyncProgress(merchantId: string) {
  return manualSyncProgress.get(merchantId) || null;
}

const STALE_PROGRESS_TTL_MS = 10 * 60 * 1000;

export function cleanupStaleManualSyncProgress() {
  const now = Date.now();
  Array.from(manualSyncProgress.entries()).forEach(([merchantId, progress]) => {
    if (now - progress.startedAt.getTime() > STALE_PROGRESS_TTL_MS) {
      if (progress.status === 'running') {
        console.warn(`[CourierSync] Cleaning up stale manual sync progress for merchant ${merchantId} (started ${Math.round((now - progress.startedAt.getTime()) / 60000)}m ago)`);
        manualSyncProgress.set(merchantId, {
          ...progress,
          status: 'error',
          error: 'Sync timed out after 10 minutes',
        });
      } else {
        manualSyncProgress.delete(merchantId);
      }
    }
  });
}

export { syncMerchantCourierStatuses };
