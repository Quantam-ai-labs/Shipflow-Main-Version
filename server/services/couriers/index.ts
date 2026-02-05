import { leopardsService, type TrackingResult as LeopardsTrackingResult } from './leopards';
import { postexService, type TrackingResult as PostExTrackingResult } from './postex';

export type TrackingResult = LeopardsTrackingResult | PostExTrackingResult;

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

export async function trackShipment(courierName: string, trackingNumber: string): Promise<TrackingResult | null> {
  const service = getCourierService(courierName);
  
  if (!service) {
    console.log(`[Courier] Unknown courier: ${courierName}`);
    return null;
  }
  
  return service.trackShipment(trackingNumber);
}

export { leopardsService, postexService };
