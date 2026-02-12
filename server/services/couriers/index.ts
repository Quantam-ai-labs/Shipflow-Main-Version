import { leopardsService, type TrackingResult as LeopardsTrackingResult } from './leopards';
import { postexService, type TrackingResult as PostExTrackingResult } from './postex';
import { normalizeStatus, detectCourierType, isFinalStatus, type UniversalStatus } from '../statusNormalization';

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
  const { normalizedStatus, mapped } = normalizeStatus(rawCourierStatus, courierType, currentStatus, result.events, workflowStatus);

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
