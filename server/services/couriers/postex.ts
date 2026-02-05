interface PostExTrackingResponse {
  statusCode: string;
  message: string;
  dist?: {
    trackingNumber: string;
    transactionStatus: string;
    transactionStatusMessage: string;
    invoicePayment: number;
    customerName: string;
    cityName: string;
    transactionStatusHistory?: Array<{
      transactionStatusMessage: string;
      transactionStatusMessageCode: string;
      dateTime: string;
    }>;
  };
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

// PostEx status codes from API documentation
const STATUS_CODE_MAP: Record<string, string> = {
  '0001': 'booked',        // At Merchant's Warehouse
  '0002': 'returned',      // Returned
  '0003': 'dispatched',    // At PostEx Warehouse
  '0004': 'dispatched',    // Package on Route
  '0005': 'delivered',     // Delivered
  '0006': 'returned',      // Returned
  '0007': 'returned',      // Returned
  '0008': 'reattempt',     // Delivery Under Review
  '0013': 'failed',        // Attempt Made
};

function mapPostExStatus(statusCode: string, statusMessage?: string): string {
  const mappedStatus = STATUS_CODE_MAP[statusCode];
  if (mappedStatus) {
    return mappedStatus;
  }
  
  // Fallback to checking status message
  if (statusMessage) {
    const msg = statusMessage.toLowerCase();
    if (msg.includes('delivered')) return 'delivered';
    if (msg.includes('return')) return 'returned';
    if (msg.includes('attempt')) return 'failed';
    if (msg.includes('route') || msg.includes('transit')) return 'dispatched';
  }
  
  console.log(`[PostEx] Unknown status code: ${statusCode}`);
  return 'booked';
}

export class PostExService {
  private baseUrl: string;
  private apiToken: string;

  constructor() {
    this.baseUrl = 'https://api.postex.pk/services/integration/api/order';
    this.apiToken = process.env.POSTEX_API_TOKEN || '';
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResult> {
    if (!this.apiToken) {
      throw new Error('PostEx API token not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/track-order/${trackingNumber}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'token': this.apiToken,
        },
      });

      if (!response.ok) {
        throw new Error(`PostEx API error: ${response.status}`);
      }

      const data: PostExTrackingResponse = await response.json();

      if (data.statusCode !== '200' || !data.dist) {
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

      const history = data.dist.transactionStatusHistory || [];
      const latestStatus = history.length > 0 ? history[history.length - 1] : null;
      const statusCode = latestStatus?.transactionStatusMessageCode || '0001';
      const universalStatus = mapPostExStatus(statusCode, latestStatus?.transactionStatusMessage);

      const events = history.map(h => ({
        status: h.transactionStatusMessage,
        date: h.dateTime,
        description: h.transactionStatusMessage,
      }));

      return {
        success: true,
        trackingNumber: data.dist.trackingNumber,
        status: universalStatus,
        statusDescription: data.dist.transactionStatusMessage || data.dist.transactionStatus,
        courierStatus: data.dist.transactionStatus,
        lastUpdate: latestStatus?.dateTime || null,
        events,
      };
    } catch (error) {
      console.error('[PostEx] Track error:', error);
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

export const postexService = new PostExService();
