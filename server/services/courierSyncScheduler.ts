import { db } from '../db';
import { orders, merchants, courierAccounts } from '../../shared/schema';
import { eq, and, or, isNull, sql, desc, notInArray } from 'drizzle-orm';
import { trackShipment, getWorkflowStageMapping, detectCourierType, type CourierCredentials } from './couriers';
import { storage } from '../storage';
import { transitionOrder } from './workflowTransition';
import { DEFAULT_WORKFLOW_STAGE_MAP } from './statusNormalization';

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
  transitioned?: number;
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

async function resolveTargetWorkflowStage(merchantId: string, courierName: string, normalizedStatus: string): Promise<string | null> {
  const courierType = detectCourierType(courierName || '');
  if (courierType) {
    const custom = await getWorkflowStageMapping(merchantId, courierType, normalizedStatus);
    if (custom) {
      console.log(`[CourierSync] Custom stage mapping: ${normalizedStatus} → ${custom} (courier: ${courierType})`);
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

async function autoTransitionOrder(merchantId: string, order: any, newShipmentStatus: string): Promise<string | null> {
  const currentWorkflow = order.workflowStatus;
  const targetWorkflow = await resolveTargetWorkflowStage(merchantId, order.courierName || '', newShipmentStatus);

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

async function syncMerchantCourierStatuses(merchantId: string): Promise<CourierSyncResult> {
  const trackableOrders = await storage.getOrdersForCourierSync(merchantId, {
    forceRefresh: false,
    limit: 500,
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
          const result = await trackShipment(order.courierName!, order.courierTracking!, credObj, order.shipmentStatus, order.workflowStatus, merchantId);
          if (result && result.success) {
            await storage.updateOrder(merchantId, order.id, {
              shipmentStatus: result.normalizedStatus,
              courierRawStatus: result.rawCourierStatus,
              lastTrackingUpdate: new Date(),
            });

            const newWorkflow = await autoTransitionOrder(merchantId, order, result.normalizedStatus);
            if (newWorkflow) transitioned++;

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
      const result = await trackShipment(order.courierName!, order.courierTracking!, credObj, order.shipmentStatus, order.workflowStatus, merchantId);
      if (result && result.success) {
        await storage.updateOrder(merchantId, order.id, {
          shipmentStatus: result.normalizedStatus,
          courierRawStatus: result.rawCourierStatus,
          lastTrackingUpdate: new Date(),
        });

        const newWorkflow = await autoTransitionOrder(merchantId, order, result.normalizedStatus);
        if (newWorkflow) transitioned++;

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

  return { timestamp: new Date(), updated, failed, skipped, total: trackableOrders.length, transitioned };
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

        if (result.updated > 0 || result.failed > 0 || result.transitioned) {
          console.log(`[CourierSync] Merchant ${m.id}: ${result.updated} updated, ${result.failed} failed, ${result.skipped} skipped out of ${result.total}${result.transitioned ? `, ${result.transitioned} transitioned` : ''}`);
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
