interface LeopardsTrackingResponse {
  status: number;
  message: string;
  packet_list?: Array<{
    track_number: string;
    booked_packet_status: string;
    booked_packet_collect_amount: string;
    destination_city_name: string;
    consignment_name_eng: string;
    activity_date: string;
    status_remarks: string;
    Tracking_Detail?: Array<{
      Status: string;
      Activity_Date: string;
      Reason: string;
    }>;
  }>;
}

export interface TrackingResult {
  success: boolean;
  trackingNumber: string;
  status: string;
  statusDescription: string;
  courierStatus: string;
  lastUpdate: string | null;
  events: Array<{
    status: string;
    date: string;
    description: string;
  }>;
}

const STATUS_MAP: Record<string, string> = {
  'booked': 'booked',
  'pending': 'booked',
  'shipment created': 'booked',
  'dispatched': 'dispatched',
  'picked up': 'dispatched',
  'picked': 'dispatched',
  'arrived at origin': 'dispatched',
  'in transit': 'dispatched',
  'at transit hub': 'dispatched',
  'transit': 'dispatched',
  'arrived at destination': 'arrived',
  'arrived': 'arrived',
  'out for delivery': 'out_for_delivery',
  'out': 'out_for_delivery',
  'delivered': 'delivered',
  'delivery failed': 'failed',
  'failed': 'failed',
  'attempt': 'reattempt',
  're-attempt': 'reattempt',
  'reattempt': 'reattempt',
  'returned': 'returned',
  'return': 'returned',
  'cancelled': 'returned',
  'cancel': 'returned',
};

function mapLeopardsStatus(courierStatus: string): string {
  const status = courierStatus.toLowerCase().trim();
  
  if (STATUS_MAP[status]) {
    return STATUS_MAP[status];
  }
  
  for (const [key, value] of Object.entries(STATUS_MAP)) {
    if (status.includes(key)) {
      return value;
    }
  }
  
  console.log(`[Leopards] Unknown status: ${courierStatus}`);
  return 'booked';
}

export class LeopardsService {
  private baseUrl = 'https://merchantapi.leopardscourier.com/api';

  private getCredentials(overrides?: { apiKey?: string; apiPassword?: string }) {
    return {
      apiKey: overrides?.apiKey || process.env.LEOPARDS_API_KEY || '',
      apiPassword: overrides?.apiPassword || process.env.LEOPARDS_API_PASSWORD || '',
    };
  }

  async trackShipment(trackingNumber: string, credentials?: { apiKey?: string; apiPassword?: string }): Promise<TrackingResult> {
    const creds = this.getCredentials(credentials);

    if (!creds.apiKey || !creds.apiPassword) {
      throw new Error('Leopards API credentials not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/trackBookedPacket/format/json/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: creds.apiKey,
          api_password: creds.apiPassword,
          track_numbers: trackingNumber,
        }),
      });

      if (!response.ok) {
        throw new Error(`Leopards API error: ${response.status}`);
      }

      const data: LeopardsTrackingResponse = await response.json();

      if (data.status !== 1 || !data.packet_list || data.packet_list.length === 0) {
        return {
          success: false,
          trackingNumber,
          status: 'unknown',
          statusDescription: data.message || 'Tracking not found',
          courierStatus: '',
          lastUpdate: null,
          events: [],
        };
      }

      const packet = data.packet_list[0];
      const universalStatus = mapLeopardsStatus(packet.booked_packet_status);

      const events = (packet.Tracking_Detail || []).map(detail => ({
        status: detail.Status,
        date: detail.Activity_Date,
        description: detail.Reason || detail.Status,
      }));

      return {
        success: true,
        trackingNumber: packet.track_number,
        status: universalStatus,
        statusDescription: packet.status_remarks || packet.booked_packet_status,
        courierStatus: packet.booked_packet_status,
        lastUpdate: packet.activity_date || null,
        events,
      };
    } catch (error) {
      console.error('[Leopards] Track error:', error);
      return {
        success: false,
        trackingNumber,
        status: 'error',
        statusDescription: error instanceof Error ? error.message : 'Unknown error',
        courierStatus: '',
        lastUpdate: null,
        events: [],
      };
    }
  }

  async trackMultiple(trackingNumbers: string[], credentials?: { apiKey?: string; apiPassword?: string }): Promise<Map<string, TrackingResult>> {
    const results = new Map<string, TrackingResult>();
    const creds = this.getCredentials(credentials);

    if (!creds.apiKey || !creds.apiPassword) {
      for (const tn of trackingNumbers) {
        results.set(tn, {
          success: false,
          trackingNumber: tn,
          status: 'error',
          statusDescription: 'Leopards API credentials not configured',
          courierStatus: '',
          lastUpdate: null,
          events: [],
        });
      }
      return results;
    }
    
    const batchSize = 10;
    for (let i = 0; i < trackingNumbers.length; i += batchSize) {
      const batch = trackingNumbers.slice(i, i + batchSize);
      
      try {
        const response = await fetch(`${this.baseUrl}/trackBookedPacket/format/json/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: creds.apiKey,
            api_password: creds.apiPassword,
            track_numbers: batch.join(','),
          }),
        });

        if (!response.ok) {
          throw new Error(`Leopards API error: ${response.status}`);
        }

        const data: LeopardsTrackingResponse = await response.json();

        if (data.status === 1 && data.packet_list) {
          for (const packet of data.packet_list) {
            const universalStatus = mapLeopardsStatus(packet.booked_packet_status);
            const events = (packet.Tracking_Detail || []).map(detail => ({
              status: detail.Status,
              date: detail.Activity_Date,
              description: detail.Reason || detail.Status,
            }));
            results.set(packet.track_number, {
              success: true,
              trackingNumber: packet.track_number,
              status: universalStatus,
              statusDescription: packet.status_remarks || packet.booked_packet_status,
              courierStatus: packet.booked_packet_status,
              lastUpdate: packet.activity_date || null,
              events,
            });
          }
        }
      } catch (error) {
        console.error('[Leopards] Batch track error:', error);
      }

      for (const tn of batch) {
        if (!results.has(tn)) {
          results.set(tn, {
            success: false,
            trackingNumber: tn,
            status: 'unknown',
            statusDescription: 'Tracking not found in batch response',
            courierStatus: '',
            lastUpdate: null,
            events: [],
          });
        }
      }
      
      if (i + batchSize < trackingNumbers.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return results;
  }
}

export const leopardsService = new LeopardsService();
