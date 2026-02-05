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
  'Booked': 'booked',
  'Picked Up': 'dispatched',
  'Arrived at Origin': 'dispatched',
  'In Transit': 'dispatched',
  'Arrived at Destination': 'arrived',
  'Out for Delivery': 'out_for_delivery',
  'Delivered': 'delivered',
  'Delivery Failed': 'failed',
  'Re-Attempt': 'reattempt',
  'Returned': 'returned',
  'Return In Transit': 'returned',
};

function mapLeopardsStatus(courierStatus: string): string {
  for (const [key, value] of Object.entries(STATUS_MAP)) {
    if (courierStatus.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  return 'booked';
}

export class LeopardsService {
  private baseUrl: string;
  private apiKey: string;
  private apiPassword: string;

  constructor() {
    this.baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://merchantapi.leopardscourier.com/api'
      : 'https://merchantapistaging.leopardscourier.com/api';
    this.apiKey = process.env.LEOPARDS_API_KEY || '';
    this.apiPassword = process.env.LEOPARDS_API_PASSWORD || '';
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResult> {
    if (!this.apiKey || !this.apiPassword) {
      throw new Error('Leopards API credentials not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/trackBookedPacket/format/json/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          api_password: this.apiPassword,
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

  async trackMultiple(trackingNumbers: string[]): Promise<Map<string, TrackingResult>> {
    const results = new Map<string, TrackingResult>();
    
    for (const tn of trackingNumbers) {
      const result = await this.trackShipment(tn);
      results.set(tn, result);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return results;
  }
}

export const leopardsService = new LeopardsService();
