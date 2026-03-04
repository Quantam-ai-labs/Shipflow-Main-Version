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
    return overrides?.apiToken || '';
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

  async getPaymentStatus(trackingNumber: string, credentials?: { apiToken?: string }): Promise<PostExPaymentResult> {
    const token = this.getToken(credentials);

    if (!token) {
      return { success: false, trackingNumber, error: 'PostEx API token not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/payment-status/${trackingNumber}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'token': token,
        },
      });

      if (response.status === 404) {
        return { success: false, trackingNumber, error: 'Order not found' };
      }

      if (!response.ok) {
        throw new Error(`PostEx Payment API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.statusCode === '200' && data.dist) {
        return {
          success: true,
          trackingNumber: data.dist.trackingNumber || trackingNumber,
          settled: data.dist.settle === true,
          settlementDate: data.dist.settlementDate || null,
          upfrontPaymentDate: data.dist.upfrontPaymentDate || null,
          cprNumber1: data.dist.cprNumber_1 || null,
          reservePaymentDate: data.dist.reservePaymentDate || null,
          cprNumber2: data.dist.cprNumber_2 || null,
          orderRefNumber: data.dist.orderRefNumber || null,
        };
      }

      return { success: false, trackingNumber, error: data.statusMessage || 'Payment status not found' };
    } catch (error) {
      console.error('[PostEx] Payment status error:', error);
      return {
        success: false,
        trackingNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getPaymentStatusBatch(trackingNumbers: string[], credentials?: { apiToken?: string }): Promise<PostExPaymentResult[]> {
    const results: PostExPaymentResult[] = [];

    for (const tn of trackingNumbers) {
      const result = await this.getPaymentStatus(tn, credentials);
      results.push(result);
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return results;
  }

  async getTrackingWithFinancials(trackingNumber: string, credentials?: { apiToken?: string }): Promise<PostExFinancialResult> {
    const token = this.getToken(credentials);

    if (!token) {
      return { success: false, trackingNumber, error: 'PostEx API token not configured' };
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

      const data = await response.json();

      if (data.statusCode === '200' && data.dist) {
        const d = data.dist;
        return {
          success: true,
          trackingNumber: d.trackingNumber || trackingNumber,
          invoicePayment: d.invoicePayment || 0,
          transactionFee: d.transactionFee || 0,
          transactionTax: d.transactionTax || 0,
          reversalFee: d.reversalFee || 0,
          reversalTax: d.reversalTax || 0,
          upfrontPayment: d.upfrontPayment || 0,
          reservePayment: d.reservePayment || 0,
          balancePayment: d.balancePayment || 0,
          transactionStatus: d.transactionStatus || '',
        };
      }

      return { success: false, trackingNumber, error: data.statusMessage || 'Not found' };
    } catch (error) {
      console.error('[PostEx] Financial tracking error:', error);
      return {
        success: false,
        trackingNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export interface PostExPaymentResult {
  success: boolean;
  trackingNumber: string;
  settled?: boolean;
  settlementDate?: string | null;
  upfrontPaymentDate?: string | null;
  cprNumber1?: string | null;
  reservePaymentDate?: string | null;
  cprNumber2?: string | null;
  orderRefNumber?: string | null;
  error?: string;
}

export interface PostExFinancialResult {
  success: boolean;
  trackingNumber: string;
  invoicePayment?: number;
  transactionFee?: number;
  transactionTax?: number;
  reversalFee?: number;
  reversalTax?: number;
  upfrontPayment?: number;
  reservePayment?: number;
  balancePayment?: number;
  transactionStatus?: string;
  error?: string;
}

export const postexService = new PostExService();
