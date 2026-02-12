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

export class PostExService {
  private baseUrl = 'https://api.postex.pk/services/integration/api/order';

  private getToken(overrides?: { apiToken?: string }): string {
    return overrides?.apiToken || process.env.POSTEX_API_TOKEN || '';
  }

  async trackShipment(trackingNumber: string, credentials?: { apiToken?: string }): Promise<TrackingResult> {
    const token = this.getToken(credentials);

    if (!token) {
      throw new Error('PostEx API token not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/track-order/${trackingNumber}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'token': token,
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
      const rawStatus = latestStatus?.transactionStatusMessage || data.dist.transactionStatusMessage || data.dist.transactionStatus;

      const events = history.map(h => ({
        status: h.transactionStatusMessage,
        date: h.dateTime,
        description: h.transactionStatusMessage,
      }));

      return {
        success: true,
        trackingNumber: data.dist.trackingNumber,
        status: rawStatus,
        statusDescription: rawStatus,
        courierStatus: rawStatus,
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

  async cancelOrder(trackingNumber: string, credentials?: { apiToken?: string }): Promise<{ success: boolean; message: string; rawResponse?: any }> {
    const token = this.getToken(credentials);

    if (!token) {
      return { success: false, message: 'PostEx API token not configured' };
    }

    try {
      console.log(`[PostEx] Cancelling order: ${trackingNumber}`);

      const response = await fetch(`${this.baseUrl}/v1/cancel-order`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'token': token,
        },
        body: JSON.stringify({ trackingNumber }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PostEx API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log(`[PostEx] Cancel response:`, JSON.stringify(data).substring(0, 500));

      if (data.statusCode === '200' || data.statusCode === 200) {
        return { success: true, message: data.statusMessage || data.message || 'Cancelled successfully', rawResponse: data };
      }

      return {
        success: false,
        message: data.statusMessage || data.message || 'Cancel request failed',
        rawResponse: data,
      };
    } catch (error) {
      console.error('[PostEx] Cancel error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async trackMultiple(trackingNumbers: string[], credentials?: { apiToken?: string }): Promise<Map<string, TrackingResult>> {
    const results = new Map<string, TrackingResult>();
    
    for (const tn of trackingNumbers) {
      const result = await this.trackShipment(tn, credentials);
      results.set(tn, result);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return results;
  }
}

export const postexService = new PostExService();
