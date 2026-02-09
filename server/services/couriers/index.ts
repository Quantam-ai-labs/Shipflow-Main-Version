import { leopardsService, type TrackingResult as LeopardsTrackingResult } from './leopards';
import { postexService, type TrackingResult as PostExTrackingResult } from './postex';

export type TrackingResult = LeopardsTrackingResult | PostExTrackingResult;

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
): Promise<TrackingResult | null> {
  const name = courierName.toLowerCase();
  
  if (name.includes('leopard')) {
    return leopardsService.trackShipment(trackingNumber, credentials ? {
      apiKey: credentials.apiKey,
      apiPassword: credentials.apiSecret,
    } : undefined);
  }
  
  if (name.includes('postex')) {
    return postexService.trackShipment(trackingNumber, credentials ? {
      apiToken: credentials.apiKey,
    } : undefined);
  }
  
  console.log(`[Courier] Unknown courier: ${courierName}`);
  return null;
}

export { leopardsService, postexService };
