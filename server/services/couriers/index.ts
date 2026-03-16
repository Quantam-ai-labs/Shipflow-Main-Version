import { leopardsService, type TrackingResult as LeopardsTrackingResult } from './leopards';
import { postexService, type TrackingResult as PostExTrackingResult } from './postex';
import { detectCourierType, resolveWorkflowStage, isFinalStatus, type WorkflowStage } from '../statusNormalization';
import { db } from '../../db';
import { courierStatusMappings } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { storage } from '../../storage';

interface CachedMappings {
  stageMappings: Record<string, string>;
  expiry: number;
}

const customMappingsCache = new Map<string, CachedMappings>();
const CACHE_TTL = 60_000;

async function loadMerchantMappings(merchantId: string, courierType: string): Promise<CachedMappings> {
  const cacheKey = `${merchantId}:${courierType}`;
  const cached = customMappingsCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached;
  }

  try {
    const rows = await db.select().from(courierStatusMappings)
      .where(and(
        eq(courierStatusMappings.merchantId, merchantId),
        eq(courierStatusMappings.courierName, courierType),
      ));

    const stageMappings: Record<string, string> = {};

    for (const row of rows) {
      const key = row.courierStatus.toLowerCase().trim();
      if (row.workflowStage) {
        stageMappings[key] = row.workflowStage;
      }
    }

    const result: CachedMappings = { stageMappings, expiry: Date.now() + CACHE_TTL };
    customMappingsCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[Courier] Error fetching custom mappings:', error);
    return { stageMappings: {}, expiry: Date.now() + CACHE_TTL };
  }
}

export function clearMappingsCache(merchantId?: string) {
  if (merchantId) {
    for (const key of customMappingsCache.keys()) {
      if (key.startsWith(`${merchantId}:`)) {
        customMappingsCache.delete(key);
      }
    }
  } else {
    customMappingsCache.clear();
  }
}

export async function getStageMappings(merchantId: string, courierType: string): Promise<Record<string, string>> {
  const { stageMappings } = await loadMerchantMappings(merchantId, courierType);
  return stageMappings;
}

export type TrackingResult = LeopardsTrackingResult | PostExTrackingResult;

export type RawTrackingResult = TrackingResult & {
  rawCourierStatus: string;
  resolvedStage: WorkflowStage | null;
};

export interface CourierCredentials {
  apiKey?: string;
  apiSecret?: string;
}

export function getCourierService(courierName: string) {
  const name = courierName.toLowerCase();
  
  if (name.includes('leopard')) {
    return leopardsService;
  }
  
  if (name.includes('postex')) {
    return postexService;
  }
  
  return null;
}

export async function trackShipment(
  courierName: string, 
  trackingNumber: string,
  credentials?: CourierCredentials,
  currentStatus?: string | null,
  workflowStatus?: string | null,
  merchantId?: string,
): Promise<RawTrackingResult | null> {
  const name = courierName.toLowerCase();
  let result: TrackingResult | null = null;
  
  if (name.includes('leopard')) {
    result = await leopardsService.trackShipment(trackingNumber, credentials ? {
      apiKey: credentials.apiKey,
      apiPassword: credentials.apiSecret,
    } : undefined);
  } else if (name.includes('postex')) {
    result = await postexService.trackShipment(trackingNumber, credentials ? {
      apiToken: credentials.apiKey,
    } : undefined);
  } else {
    console.log(`[Courier] Unknown courier: ${courierName}`);
    return null;
  }

  if (!result) return null;

  const courierType = detectCourierType(courierName);
  const rawCourierStatus = result.courierStatus || result.status || '';

  if (!courierType || !result.success) {
    return {
      ...result,
      rawCourierStatus,
      resolvedStage: null,
    };
  }

  let customStageMappings: Record<string, string> | undefined;
  if (merchantId) {
    customStageMappings = await getStageMappings(merchantId, courierType);
  }

  const resolvedStage = resolveWorkflowStage(rawCourierStatus, customStageMappings);

  if (!resolvedStage && merchantId && rawCourierStatus) {
    try {
      await storage.recordUnmappedStatus(merchantId, courierType, rawCourierStatus, trackingNumber);
    } catch (err) {
      console.warn('[Courier] Failed to record unmapped status:', err);
    }
  }

  return {
    ...result,
    rawCourierStatus,
    resolvedStage,
  };
}

export interface CancelResult {
  success: boolean;
  message: string;
  rawResponse?: any;
}

export async function cancelCourierBooking(
  courierName: string,
  trackingNumber: string,
  credentials?: CourierCredentials,
): Promise<CancelResult> {
  const name = courierName.toLowerCase();

  if (name.includes('leopard')) {
    return leopardsService.cancelBooking(
      [trackingNumber],
      credentials ? { apiKey: credentials.apiKey, apiPassword: credentials.apiSecret } : undefined,
    );
  }

  if (name.includes('postex')) {
    return postexService.cancelOrder(
      trackingNumber,
      credentials ? { apiToken: credentials.apiKey } : undefined,
    );
  }

  return { success: false, message: `Unsupported courier: ${courierName}` };
}

export { leopardsService, postexService };
export { detectCourierType, isFinalStatus, resolveWorkflowStage } from '../statusNormalization';
export type { WorkflowStage } from '../statusNormalization';
