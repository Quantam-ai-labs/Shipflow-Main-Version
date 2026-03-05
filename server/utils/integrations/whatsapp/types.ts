export interface SendResult {
  success: boolean;
  messageId?: string;
  phone?: string;
  error?: string;
}

export interface OrderNotificationParams {
  orderId: string;
  merchantId: string;
  customerPhone: string | null | undefined;
  customerName: string;
  orderNumber: string;
  fromStatus: string;
  toStatus: string;
  city?: string | null;
  shippingAddress?: string | null;
  totalAmount?: string | null;
  courierName?: string | null;
  courierTracking?: string | null;
}
