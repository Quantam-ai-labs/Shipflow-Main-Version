interface LeopardsTrackingDetail {
  Status: string;
  Activity_Date: string;
  Activity_Time?: string;
  Activity_datetime?: string;
  Reason?: string;
  Reciever_Name?: string | null;
}

interface LeopardsPacket {
  track_number: string;
  booked_packet_status: string;
  booked_packet_collect_amount: string;
  booked_packet_weight?: string;
  arival_dispatch_weight?: string;
  destination_city_name: string;
  consignment_name_eng: string;
  activity_date: string;
  status_remarks: string;
  "Tracking Detail"?: LeopardsTrackingDetail[];
  Tracking_Detail?: LeopardsTrackingDetail[];
}

interface LeopardsTrackingResponse {
  status: number;
  message: string;
  packet_list?: LeopardsPacket[];
}

export interface TrackingResult {
  success: boolean;
  trackingNumber: string;
  status: string;
  statusDescription: string;
  courierStatus: string;
  lastUpdate: string | null;
  courierWeight?: string | null;
  events: Array<{
    status: string;
    date: string;
    description: string;
  }>;
}

export class LeopardsService {
  private baseUrl = 'https://merchantapi.leopardscourier.com/api';

  private getCredentials(overrides?: { apiKey?: string; apiPassword?: string }) {
    return {
      apiKey: overrides?.apiKey || '',
      apiPassword: overrides?.apiPassword || '',
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
      const headerStatus = packet.booked_packet_status;

      const trackingDetails = packet["Tracking Detail"] || packet.Tracking_Detail || [];
      if (trackingDetails.length === 0) {
        console.log(`[Leopards] ${trackingNumber}: No Tracking Detail, using header status: "${headerStatus}"`);
      }

      const events = trackingDetails.map(detail => ({
        status: detail.Status,
        date: detail.Activity_Date,
        description: detail.Reason || detail.Status,
      }));

      const latestEvent = events.length > 0 ? events[events.length - 1] : null;
      let rawStatus = latestEvent ? latestEvent.status : headerStatus;

      if (latestEvent && latestEvent.status.toLowerCase() === 'pending' && latestEvent.description && latestEvent.description.toLowerCase() !== 'pending') {
        rawStatus = `Pending - ${latestEvent.description}`;
      }

      return {
        success: true,
        trackingNumber: packet.track_number,
        status: rawStatus,
        statusDescription: packet.status_remarks || rawStatus,
        courierStatus: rawStatus,
        lastUpdate: latestEvent?.date || packet.activity_date || null,
        courierWeight: packet.arival_dispatch_weight || null,
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
        courierWeight: null,
        events: [],
      };
    }
  }

  async cancelBooking(trackingNumbers: string[], credentials?: { apiKey?: string; apiPassword?: string }): Promise<{ success: boolean; message: string; rawResponse?: any }> {
    const creds = this.getCredentials(credentials);

    if (!creds.apiKey || !creds.apiPassword) {
      return { success: false, message: 'Leopards API credentials not configured' };
    }

    try {
      const cnNumbers = Array.isArray(trackingNumbers) ? trackingNumbers.join(',') : trackingNumbers;
      console.log(`[Leopards] Cancelling packets: ${cnNumbers}`);

      const response = await fetch(`${this.baseUrl}/cancelBookedPackets/format/json/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: creds.apiKey,
          api_password: creds.apiPassword,
          cn_numbers: cnNumbers,
        }),
      });

      if (!response.ok) {
        throw new Error(`Leopards API error: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[Leopards] Cancel response:`, JSON.stringify(data).substring(0, 500));

      if (data.status === 1 || data.status === '1') {
        const msg = typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
        return { success: true, message: msg || 'Cancelled successfully', rawResponse: data };
      }

      let errorMsg = 'Cancel request failed';
      if (typeof data.message === 'string') {
        errorMsg = data.message;
      } else if (typeof data.error === 'string') {
        errorMsg = data.error;
      } else if (data.message && typeof data.message === 'object') {
        const entries = Object.entries(data.message);
        errorMsg = entries.map(([k, v]) => `${k}: ${v}`).join(', ');
      }

      return {
        success: false,
        message: errorMsg,
        rawResponse: data,
      };
    } catch (error) {
      console.error('[Leopards] Cancel error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
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
            const headerStatus = packet.booked_packet_status;
            const trackingDetails = packet["Tracking Detail"] || packet.Tracking_Detail || [];
            const events = trackingDetails.map(detail => ({
              status: detail.Status,
              date: detail.Activity_Date,
              description: detail.Reason || detail.Status,
            }));
            const latestEvent = events.length > 0 ? events[events.length - 1] : null;
            let rawStatus = latestEvent ? latestEvent.status : headerStatus;

            if (latestEvent && latestEvent.status.toLowerCase() === 'pending' && latestEvent.description && latestEvent.description.toLowerCase() !== 'pending') {
              rawStatus = `Pending - ${latestEvent.description}`;
            }
            results.set(packet.track_number, {
              success: true,
              trackingNumber: packet.track_number,
              status: rawStatus,
              statusDescription: packet.status_remarks || rawStatus,
              courierStatus: rawStatus,
              lastUpdate: latestEvent?.date || packet.activity_date || null,
              courierWeight: packet.arival_dispatch_weight || null,
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


  async getPaymentDetails(cnNumbers: string[], credentials?: { apiKey?: string; apiPassword?: string }): Promise<LeopardsPaymentResult[]> {
    const creds = this.getCredentials(credentials);
    const results: LeopardsPaymentResult[] = [];

    if (!creds.apiKey || !creds.apiPassword) {
      return cnNumbers.map(cn => ({
        success: false,
        trackingNumber: cn,
        error: 'Leopards API credentials not configured',
      }));
    }

    const batchSize = 50;
    for (let i = 0; i < cnNumbers.length; i += batchSize) {
      const batch = cnNumbers.slice(i, i + batchSize);

      try {
        const params = new URLSearchParams({
          api_key: creds.apiKey,
          api_password: creds.apiPassword,
          cn_numbers: batch.join(','),
        });

        const response = await fetch(`${this.baseUrl}/getPaymentDetails/format/json/?${params.toString()}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`Leopards Payment API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 1 && data.payment_list) {
          for (const payment of data.payment_list) {
            results.push({
              success: true,
              trackingNumber: String(payment.booked_packet_cn),
              billingMethod: payment.billing_method || null,
              paymentStatus: payment.status || null,
              invoiceChequeNo: payment.invoice_cheque_no || null,
              invoiceChequeDate: payment.invoice_cheque_date || null,
              paymentMethod: payment.payment_method || null,
              message: payment.message || null,
              slipLink: payment.slip_link || null,
            });
          }
        } else {
          for (const cn of batch) {
            if (!results.find(r => r.trackingNumber === cn)) {
              results.push({
                success: false,
                trackingNumber: cn,
                error: data.error || 'No payment data found',
              });
            }
          }
        }
      } catch (error) {
        console.error('[Leopards] Payment details error:', error);
        for (const cn of batch) {
          if (!results.find(r => r.trackingNumber === cn)) {
            results.push({
              success: false,
              trackingNumber: cn,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }

      if (i + batchSize < cnNumbers.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    return results;
  }
}

export interface LeopardsPaymentResult {
  success: boolean;
  trackingNumber: string;
  billingMethod?: string | null;
  paymentStatus?: string | null;
  invoiceChequeNo?: string | null;
  invoiceChequeDate?: string | null;
  paymentMethod?: string | null;
  message?: string | null;
  slipLink?: string | null;
  error?: string;
}


export const leopardsService = new LeopardsService();
