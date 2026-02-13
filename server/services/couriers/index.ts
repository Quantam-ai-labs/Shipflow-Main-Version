import { leopardsService, type TrackingResult as LeopardsTrackingResult } from './leopards';
import { postexService, type TrackingResult as PostExTrackingResult } from './postex';
import { normalizeStatus, detectCourierType, isFinalStatus, type UniversalStatus } from '../statusNormalization';
import { db } from '../../db';
import { courierStatusMappings } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

interface CachedMappings {
  customNormalization: Record<string, string>;
  workflowStages: Record<string, string>;
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

    const customNormalization: Record<string, string> = {};
    const workflowStages: Record<string, string> = {};

    for (const row of rows) {
      const key = row.courierStatus.toLowerCase().trim();
      if (row.isCustom) {
        customNormalization[key] = row.normalizedStatus;
      }
      if (row.workflowStage) {
        workflowStages[row.normalizedStatus] = row.workflowStage;
      }
    }

    const result: CachedMappings = { customNormalization, workflowStages, expiry: Date.now() + CACHE_TTL };
    customMappingsCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[Courier] Error fetching custom mappings:', error);
    return { customNormalization: {}, workflowStages: {}, expiry: Date.now() + CACHE_TTL };
  }
}

async function getCustomMappings(merchantId: string, courierType: string): Promise<Record<string, string> | undefined> {
  const { customNormalization } = await loadMerchantMappings(merchantId, courierType);
  return Object.keys(customNormalization).length > 0 ? customNormalization : undefined;
}

export async function getWorkflowStageMapping(merchantId: string, courierType: string, normalizedStatus: string): Promise<string | null> {
  const { workflowStages } = await loadMerchantMappings(merchantId, courierType);
  return workflowStages[normalizedStatus] || null;
}

export type TrackingResult = LeopardsTrackingResult | PostExTrackingResult;

export type NormalizedTrackingResult = TrackingResult & {
  normalizedStatus: UniversalStatus;
  rawCourierStatus: string;
  wasMapped: boolean;
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
): Promise<NormalizedTrackingResult | null> {
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
  if (!courierType || !result.success) {
    return {
      ...result,
      normalizedStatus: (currentStatus as UniversalStatus) || 'BOOKED',
      rawCourierStatus: result.courierStatus || '',
      wasMapped: false,
    };
  }

  const rawCourierStatus = result.courierStatus || result.status;
  const customMappings = merchantId ? await getCustomMappings(merchantId, courierType) : undefined;
  const { normalizedStatus, mapped } = normalizeStatus(rawCourierStatus, courierType, currentStatus, result.events, workflowStatus, customMappings);

  return {
    ...result,
    normalizedStatus,
    rawCourierStatus,
    wasMapped: mapped,
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
export { normalizeStatus, detectCourierType, isFinalStatus, UNIVERSAL_STATUSES } from '../statusNormalization';
export type { UniversalStatus } from '../statusNormalization';
