import { db } from '../db';
import { syncState, merchants, shopifyStores, adAccounts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

type SyncType = 'shopify_orders' | 'meta_insights' | 'meta_backfill' | 'courier_status';
type Priority = 'high' | 'normal' | 'low';

interface SyncTask {
  id: string;
  type: SyncType;
  merchantId: string;
  priority: Priority;
  options?: Record<string, any>;
  enqueuedAt: number;
}

interface SyncStatus {
  type: SyncType;
  merchantId: string;
  lastSuccessfulSync: Date | null;
  backfillCompleted: boolean;
  backfillCursor: string | null;
  lastError: string | null;
  errorCount: number;
  isRunning: boolean;
}

const MEMORY_THRESHOLD = 0.85;
const MAX_HEAP_MB = 512;

let taskQueue: SyncTask[] = [];
let isProcessing = false;
let currentTask: SyncTask | null = null;
const runningTasks = new Set<string>();

const syncTimers: ReturnType<typeof setInterval>[] = [];
let isShutdown = false;

function getTaskKey(type: SyncType, merchantId: string): string {
  return `${type}:${merchantId}`;
}

function isMemoryPressure(): boolean {
  const mem = process.memoryUsage();
  const heapUsedMB = mem.heapUsed / 1024 / 1024;
  return heapUsedMB > MAX_HEAP_MB * MEMORY_THRESHOLD;
}

export function enqueueSyncTask(type: SyncType, merchantId: string, priority: Priority = 'normal', options?: Record<string, any>): boolean {
  if (isShutdown) return false;

  const key = getTaskKey(type, merchantId);
  if (runningTasks.has(key)) return false;
  if (taskQueue.some(t => getTaskKey(t.type, t.merchantId) === key)) return false;

  const task: SyncTask = {
    id: `${key}:${Date.now()}`,
    type,
    merchantId,
    priority,
    options,
    enqueuedAt: Date.now(),
  };

  taskQueue.push(task);
  taskQueue.sort((a, b) => {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return a.enqueuedAt - b.enqueuedAt;
  });

  setImmediate(() => processQueue());
  return true;
}

async function processQueue(): Promise<void> {
  if (isProcessing || isShutdown) return;
  if (taskQueue.length === 0) return;

  if (isMemoryPressure()) {
    const hasHighPriority = taskQueue.some(t => t.priority === 'high');
    if (!hasHighPriority) {
      console.log('[SyncManager] Memory pressure detected, pausing non-critical tasks');
      return;
    }
    taskQueue = taskQueue.filter(t => t.priority === 'high');
  }

  const task = taskQueue.shift();
  if (!task) return;

  const key = getTaskKey(task.type, task.merchantId);
  if (runningTasks.has(key)) {
    setImmediate(() => processQueue());
    return;
  }

  isProcessing = true;
  currentTask = task;
  runningTasks.add(key);

  try {
    await executeTask(task);
    await updateSyncState(task.merchantId, task.type, { lastSuccessfulSync: new Date(), lastError: null });
  } catch (err: any) {
    console.error(`[SyncManager] Task ${task.type} failed for merchant ${task.merchantId}:`, err.message);
    await updateSyncState(task.merchantId, task.type, {
      lastError: err.message,
      errorCount: (await getSyncStateRecord(task.merchantId, task.type))?.errorCount
        ? (await getSyncStateRecord(task.merchantId, task.type))!.errorCount! + 1
        : 1,
    });
  } finally {
    runningTasks.delete(key);
    currentTask = null;
    isProcessing = false;
    if (taskQueue.length > 0) {
      setTimeout(() => processQueue(), 2000);
    }
  }
}

async function executeTask(task: SyncTask): Promise<void> {
  switch (task.type) {
    case 'shopify_orders': {
      const { runShopifySync } = await import('./autoSync');
      await runShopifySync(task.merchantId);
      break;
    }
    case 'meta_insights': {
      const { runMetaQuickSync } = await import('./metaAds');
      await runMetaQuickSync(task.merchantId);
      break;
    }
    case 'meta_backfill': {
      const { runMetaBackfillChunk } = await import('./metaAds');
      await runMetaBackfillChunk(task.merchantId);
      break;
    }
    case 'courier_status': {
      const { runCourierSyncForMerchant } = await import('./courierSyncScheduler');
      await runCourierSyncForMerchant(task.merchantId);
      break;
    }
  }
}

export async function getSyncStateRecord(merchantId: string, syncType: string) {
  const [record] = await db.select().from(syncState)
    .where(and(eq(syncState.merchantId, merchantId), eq(syncState.syncType, syncType)));
  return record || null;
}

export async function updateSyncState(merchantId: string, syncType: string, updates: Partial<{
  lastSuccessfulSync: Date;
  backfillCompleted: boolean;
  backfillCursor: string | null;
  lastError: string | null;
  errorCount: number;
}>) {
  const existing = await getSyncStateRecord(merchantId, syncType);
  if (existing) {
    await db.update(syncState)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(syncState.merchantId, merchantId), eq(syncState.syncType, syncType)));
  } else {
    await db.insert(syncState).values({
      merchantId,
      syncType,
      ...updates,
    });
  }
}

export async function getAllSyncStatus(): Promise<SyncStatus[]> {
  const records = await db.select().from(syncState);
  return records.map(r => ({
    type: r.syncType as SyncType,
    merchantId: r.merchantId,
    lastSuccessfulSync: r.lastSuccessfulSync,
    backfillCompleted: r.backfillCompleted ?? false,
    backfillCursor: r.backfillCursor,
    lastError: r.lastError,
    errorCount: r.errorCount ?? 0,
    isRunning: runningTasks.has(getTaskKey(r.syncType as SyncType, r.merchantId)),
  }));
}

export function getSyncQueueInfo() {
  return {
    queueLength: taskQueue.length,
    isProcessing,
    currentTask: currentTask ? { type: currentTask.type, merchantId: currentTask.merchantId } : null,
    memoryPressure: isMemoryPressure(),
    heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  };
}

async function scheduleShopifySync() {
  const connectedStores = await db.select().from(shopifyStores).where(eq(shopifyStores.isConnected, true));
  for (const store of connectedStores) {
    if (store.merchantId) {
      enqueueSyncTask('shopify_orders', store.merchantId, 'normal');
    }
  }
}

async function scheduleMetaSync() {
  const accounts = await db.select().from(adAccounts);
  for (const account of accounts) {
    const state = await getSyncStateRecord(account.merchantId, 'meta_insights');
    if (!state?.backfillCompleted) {
      enqueueSyncTask('meta_backfill', account.merchantId, 'low');
    }
    enqueueSyncTask('meta_insights', account.merchantId, 'normal');
  }
}

async function scheduleCourierSync() {
  const allMerchants = await db.select({ id: merchants.id }).from(merchants);
  for (const m of allMerchants) {
    enqueueSyncTask('courier_status', m.id, 'normal');
  }
}

export async function initSyncManager() {
  console.log('[SyncManager] Initializing centralized sync manager');

  const SHOPIFY_INTERVAL = 10 * 60 * 1000;
  const META_INTERVAL = 10 * 60 * 1000;
  const COURIER_INTERVAL = 5 * 60 * 1000;
  const STALE_CHECK_INTERVAL = 5 * 60 * 1000;

  setTimeout(() => scheduleShopifySync().catch(e => console.error('[SyncManager] Shopify schedule error:', e.message)), 10000);
  const shopifyTimer = setInterval(() => scheduleShopifySync().catch(e => console.error('[SyncManager] Shopify schedule error:', e.message)), SHOPIFY_INTERVAL);
  syncTimers.push(shopifyTimer);
  console.log(`[SyncManager] Shopify sync: every ${SHOPIFY_INTERVAL / 1000}s`);

  setTimeout(() => scheduleMetaSync().catch(e => console.error('[SyncManager] Meta schedule error:', e.message)), 30000);
  const metaTimer = setInterval(() => scheduleMetaSync().catch(e => console.error('[SyncManager] Meta schedule error:', e.message)), META_INTERVAL);
  syncTimers.push(metaTimer);
  console.log(`[SyncManager] Meta Ads sync: every ${META_INTERVAL / 1000}s`);

  setTimeout(() => scheduleCourierSync().catch(e => console.error('[SyncManager] Courier schedule error:', e.message)), 45000);
  const courierTimer = setInterval(() => scheduleCourierSync().catch(e => console.error('[SyncManager] Courier schedule error:', e.message)), COURIER_INTERVAL);
  syncTimers.push(courierTimer);
  console.log(`[SyncManager] Courier sync: every ${COURIER_INTERVAL / 1000}s`);

  const { runStaleOrderCheck } = await import('./autoSync');
  setTimeout(() => runStaleOrderCheck().catch(e => console.error('[SyncManager] Stale check error:', e.message)), 60000);
  const staleTimer = setInterval(() => runStaleOrderCheck().catch(e => console.error('[SyncManager] Stale check error:', e.message)), STALE_CHECK_INTERVAL);
  syncTimers.push(staleTimer);
  console.log(`[SyncManager] Stale order check: every ${STALE_CHECK_INTERVAL / 1000}s`);
}

export function shutdownSyncManager() {
  isShutdown = true;
  for (const timer of syncTimers) {
    clearInterval(timer);
  }
  syncTimers.length = 0;
  taskQueue = [];
  console.log('[SyncManager] Shutdown complete');
}
