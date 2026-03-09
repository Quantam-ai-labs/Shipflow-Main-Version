import crypto from 'crypto';
import { storage } from '../storage';
import { shopifyService } from './shopify';
import { isRecentWriteBack } from './shopifyWriteBack';
import { sendOrderStatusWhatsApp } from '../utils/integrations/whatsapp';

interface WebhookProcessResult {
  success: boolean;
  action: 'created' | 'updated' | 'skipped_duplicate' | 'failed';
  orderId?: string;
  error?: string;
}

export class WebhookHandler {
  private webhookSecrets: string[];

  constructor() {
    const candidates = [
      process.env.SHOPIFY_WEBHOOK_SECRET,
      process.env.SHOPIFY_APP_CLIENT_SECRET,
      process.env.SHOPIFY_CLIENT_SECRET,
      process.env.SHOPIFY_APP_SHARED_SECRET,
      process.env.SHOPIFY_APP_SHARED_SECRET_2,
    ];
    this.webhookSecrets = candidates.filter((s): s is string => !!s);
  }

  verifyHmac(rawBody: Buffer, hmacHeader: string): boolean {
    if (!this.webhookSecrets.length || !hmacHeader) return false;

    const hmacBuf = Buffer.from(hmacHeader, 'base64');

    for (const secret of this.webhookSecrets) {
      try {
        const generated = crypto
          .createHmac('sha256', secret)
          .update(rawBody)
          .digest('base64');
        const generatedBuf = Buffer.from(generated, 'base64');
        if (
          hmacBuf.length === generatedBuf.length &&
          crypto.timingSafeEqual(hmacBuf, generatedBuf)
        ) {
          return true;
        }
      } catch {
        // try next secret
      }
    }
    return false;
  }

  computePayloadHash(rawBody: Buffer): string {
    return crypto.createHash('sha256').update(rawBody).digest('hex');
  }

  async processOrderWebhook(
    topic: string,
    shopDomain: string,
    rawBody: Buffer,
    webhookId?: string
  ): Promise<WebhookProcessResult> {
    const payloadHash = this.computePayloadHash(rawBody);

    const storeInfo = await storage.getMerchantByShopDomain(shopDomain);
    if (!storeInfo) {
      console.error(`[Webhook] Unknown shop domain: ${shopDomain}`);
      return { success: false, action: 'failed', error: 'Unknown shop domain' };
    }

    const { merchantId } = storeInfo;

    if (webhookId) {
      const existing = await storage.getWebhookEventByWebhookId(merchantId, webhookId);
      if (existing) {
        console.log(`[Webhook] Duplicate webhook ID ${webhookId}, skipping`);
        return { success: true, action: 'skipped_duplicate' };
      }
    }

    const isDup = await storage.isDuplicateWebhook(merchantId, topic, payloadHash);
    if (isDup) {
      console.log(`[Webhook] Duplicate payload hash for ${topic}, skipping`);
      return { success: true, action: 'skipped_duplicate' };
    }

    const webhookEvent = await storage.createWebhookEvent({
      merchantId,
      topic,
      shopifyWebhookId: webhookId || null,
      shopDomain,
      payloadHash,
      processingStatus: 'received',
    });

    try {
      const payload = JSON.parse(rawBody.toString());
      const shopifyOrderId = String(payload.id);

      if (topic === 'orders/updated' && isRecentWriteBack(shopifyOrderId)) {
        console.log(`[Webhook] Skipping orders/updated for ${shopifyOrderId} - recent 1SOL.AI write-back`);
        await storage.updateWebhookEventStatus(webhookEvent.id, 'processed');
        return { success: true, action: 'skipped_duplicate' };
      }

      await storage.updateWebhookEventStatus(webhookEvent.id, 'processing');

      const existingOrder = await storage.getOrderByShopifyId(merchantId, shopifyOrderId);

      if (existingOrder?.shopifyUpdatedAt && payload.updated_at) {
        const incomingUpdatedAt = new Date(payload.updated_at);
        if (incomingUpdatedAt < existingOrder.shopifyUpdatedAt) {
          console.log(`[Webhook] Out-of-order event for ${shopifyOrderId}, skipping field updates`);
          await storage.updateWebhookEventStatus(webhookEvent.id, 'processed');
          return { success: true, action: 'skipped_duplicate', orderId: existingOrder.id };
        }
      }

      const hasUpdatedAt = !!payload.updated_at;

      const resolvedFields = resolveOrderFields(
        payload,
        existingOrder?.rawShopifyData as Record<string, any> | null,
        existingOrder
      );

      const transformedOrder = shopifyService.transformOrderForStorage(payload);

      const orderData: any = {
        ...transformedOrder,
        customerName: resolvedFields.customerName || transformedOrder.customerName,
        customerPhone: resolvedFields.customerPhone || transformedOrder.customerPhone,
        customerEmail: resolvedFields.customerEmail || transformedOrder.customerEmail,
        shippingAddress: resolvedFields.shippingAddress || transformedOrder.shippingAddress,
        city: resolvedFields.city || transformedOrder.city,
        province: resolvedFields.province || transformedOrder.province,
        postalCode: resolvedFields.postalCode || transformedOrder.postalCode,
        rawWebhookData: payload,
        lastWebhookAt: new Date(),
        shopifyUpdatedAt: hasUpdatedAt ? new Date(payload.updated_at) : undefined,
        resolvedSource: resolvedFields.sources,
        dataQualityFlags: resolvedFields.qualityFlags,
      };

      let resultOrderId: string;

      if (existingOrder) {
        const safeUpdate: any = {};
        for (const [key, value] of Object.entries(orderData)) {
          if (key === 'merchantId' || key === 'id' || key === 'shopifyOrderId' || key === 'orderNumber') continue;
          if (key === 'customerName' && value === 'Unknown' && existingOrder.customerName !== 'Unknown') continue;
          if (typeof value === 'string' && value === '' && (existingOrder as any)[key]) continue;
          if (value === null && (existingOrder as any)[key]) continue;
          safeUpdate[key] = value;
        }
        await storage.updateOrder(merchantId, existingOrder.id, safeUpdate);
        resultOrderId = existingOrder.id;
        console.log(`[Webhook] Updated order ${existingOrder.orderNumber} (${topic})`);
      } else {
        const created = await storage.createOrder({
          ...orderData,
          merchantId,
          codRemaining: orderData.totalAmount,
          prepaidAmount: "0",
          codPaymentStatus: "UNPAID",
        });
        resultOrderId = created.id;
        console.log(`[Webhook] Created new order ${transformedOrder.orderNumber} (${topic})`);
        try {
          await sendOrderStatusWhatsApp({
            merchantId,
            orderId: created.id,
            orderNumber: created.orderNumber,
            customerPhone: created.customerPhone,
            customerName: created.customerName,
            fromStatus: '',
            toStatus: 'NEW',
            city: created.city,
            shippingAddress: created.shippingAddress,
            totalAmount: created.totalAmount,
            itemSummary: created.itemSummary,
            lineItems: Array.isArray(created.lineItems) ? (created.lineItems as any[]) : null,
            shopDomain: (created as any).shopDomain || null,
          });
        } catch (waErr) {
          console.error(`[Webhook] WhatsApp notification failed for order ${created.orderNumber}:`, waErr);
        }
      }

      await storage.updateWebhookEventStatus(webhookEvent.id, 'processed');
      return { success: true, action: existingOrder ? 'updated' : 'created', orderId: resultOrderId };
    } catch (error: any) {
      console.error(`[Webhook] Error processing ${topic}:`, error);
      await storage.updateWebhookEventStatus(webhookEvent.id, 'failed', error.message);
      return { success: false, action: 'failed', error: error.message };
    }
  }

  async processFulfillmentWebhook(
    topic: string,
    shopDomain: string,
    rawBody: Buffer,
    webhookId?: string
  ): Promise<WebhookProcessResult> {
    const payloadHash = this.computePayloadHash(rawBody);

    const storeInfo = await storage.getMerchantByShopDomain(shopDomain);
    if (!storeInfo) {
      return { success: false, action: 'failed', error: 'Unknown shop domain' };
    }

    const { merchantId } = storeInfo;

    if (webhookId) {
      const existing = await storage.getWebhookEventByWebhookId(merchantId, webhookId);
      if (existing) {
        return { success: true, action: 'skipped_duplicate' };
      }
    }

    const webhookEvent = await storage.createWebhookEvent({
      merchantId,
      topic,
      shopifyWebhookId: webhookId || null,
      shopDomain,
      payloadHash,
      processingStatus: 'received',
    });

    try {
      const payload = JSON.parse(rawBody.toString());
      const shopifyOrderId = String(payload.order_id);

      const existingOrder = await storage.getOrderByShopifyId(merchantId, shopifyOrderId);
      if (!existingOrder) {
        await storage.updateWebhookEventStatus(webhookEvent.id, 'processed');
        console.log(`[Webhook] Fulfillment for unknown order ${shopifyOrderId}, skipping`);
        return { success: true, action: 'skipped_duplicate' };
      }

      const fulfillmentStatus = payload.status || 'fulfilled';
      let shipmentStatus = existingOrder.shipmentStatus;

      if (fulfillmentStatus === 'success' || fulfillmentStatus === 'fulfilled') {
        shipmentStatus = 'DELIVERED';
      } else if (fulfillmentStatus === 'in_transit') {
        shipmentStatus = 'IN_TRANSIT';
      } else if (fulfillmentStatus === 'out_for_delivery') {
        shipmentStatus = 'OUT_FOR_DELIVERY';
      } else if (fulfillmentStatus === 'failure') {
        shipmentStatus = 'DELIVERY_FAILED';
      }

      const trackingNumber = payload.tracking_number || payload.tracking_numbers?.[0] || null;
      const trackingCompany = payload.tracking_company || null;

      await storage.updateOrder(merchantId, existingOrder.id, {
        fulfillmentStatus: fulfillmentStatus === 'success' ? 'fulfilled' : fulfillmentStatus,
        shipmentStatus,
        courierTracking: trackingNumber || existingOrder.courierTracking,
        courierName: trackingCompany || existingOrder.courierName,
        lastWebhookAt: new Date(),
      });

      await storage.updateWebhookEventStatus(webhookEvent.id, 'processed');
      console.log(`[Webhook] Updated fulfillment for order ${existingOrder.orderNumber}`);
      return { success: true, action: 'updated', orderId: existingOrder.id };
    } catch (error: any) {
      console.error(`[Webhook] Fulfillment error:`, error);
      await storage.updateWebhookEventStatus(webhookEvent.id, 'failed', error.message);
      return { success: false, action: 'failed', error: error.message };
    }
  }
}

interface ResolvedFields {
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  shippingAddress: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  sources: Record<string, string>;
  qualityFlags: Record<string, boolean>;
}

function resolveOrderFields(
  webhookPayload: any,
  apiPayload: any | null,
  existingOrder: any | null
): ResolvedFields {
  const sources: Record<string, string> = {};
  const qualityFlags: Record<string, boolean> = {};

  const isMeaningful = (val: string | null | undefined): val is string => {
    return Boolean(val && val.trim().length > 0);
  };

  const getNoteAttribute = (noteAttrs: any[], patterns: string[]): string | null => {
    if (!noteAttrs || !Array.isArray(noteAttrs)) return null;
    for (const attr of noteAttrs) {
      const name = attr.name?.toLowerCase() || '';
      for (const pattern of patterns) {
        if (name.includes(pattern.toLowerCase())) {
          return attr.value?.trim() || null;
        }
      }
    }
    return null;
  };

  const allNoteAttrs = webhookPayload?.note_attributes || apiPayload?.note_attributes || [];

  const noteFirstName = getNoteAttribute(allNoteAttrs, ['first name', 'first_name']);
  const noteLastName = getNoteAttribute(allNoteAttrs, ['last name', 'last_name']);
  const noteFullName = noteFirstName && noteLastName
    ? `${noteFirstName} ${noteLastName}`.trim()
    : noteFirstName || noteLastName || null;
  const notePhone = getNoteAttribute(allNoteAttrs, ['mobile', 'phone', 'contact']);
  const noteAddress = getNoteAttribute(allNoteAttrs, ['full address', 'address', 'ایڈریس']);
  const noteCity = getNoteAttribute(allNoteAttrs, ['city', 'شہر']);

  const resolveField = (fieldName: string, candidates: Array<{ value: string | null | undefined; source: string }>): string | null => {
    for (const { value, source } of candidates) {
      if (isMeaningful(value)) {
        sources[fieldName] = source;
        return value!.trim();
      }
    }
    if (existingOrder && isMeaningful(existingOrder[fieldName])) {
      sources[fieldName] = 'existing';
      return existingOrder[fieldName];
    }
    return null;
  };

  const wsa = webhookPayload?.shipping_address;
  const wba = webhookPayload?.billing_address;
  const wc = webhookPayload?.customer;
  const asa = apiPayload?.shipping_address;
  const aba = apiPayload?.billing_address;
  const ac = apiPayload?.customer;

  const customerName = resolveField('customerName', [
    { value: noteFullName, source: 'note_attributes' },
    { value: wsa?.name || (wsa?.first_name && wsa?.last_name ? `${wsa.first_name} ${wsa.last_name}` : null), source: 'webhook_shipping' },
    { value: wc?.first_name && wc?.last_name ? `${wc.first_name} ${wc.last_name}` : null, source: 'webhook_customer' },
    { value: wba?.name, source: 'webhook_billing' },
    { value: asa?.name || (asa?.first_name && asa?.last_name ? `${asa.first_name} ${asa.last_name}` : null), source: 'api_shipping' },
    { value: ac?.first_name && ac?.last_name ? `${ac.first_name} ${ac.last_name}` : null, source: 'api_customer' },
    { value: aba?.name, source: 'api_billing' },
  ]);

  const customerPhone = resolveField('customerPhone', [
    { value: notePhone, source: 'note_attributes' },
    { value: wsa?.phone, source: 'webhook_shipping' },
    { value: wc?.phone, source: 'webhook_customer' },
    { value: wba?.phone, source: 'webhook_billing' },
    { value: asa?.phone, source: 'api_shipping' },
    { value: ac?.phone, source: 'api_customer' },
    { value: aba?.phone, source: 'api_billing' },
    { value: wc?.default_address?.phone, source: 'webhook_default_address' },
    { value: ac?.default_address?.phone, source: 'api_default_address' },
  ]);

  const customerEmail = resolveField('customerEmail', [
    { value: wc?.email, source: 'webhook_customer' },
    { value: webhookPayload?.email, source: 'webhook_order' },
    { value: ac?.email, source: 'api_customer' },
    { value: apiPayload?.email, source: 'api_order' },
  ]);

  const city = resolveField('city', [
    { value: noteCity, source: 'note_attributes' },
    { value: wsa?.city, source: 'webhook_shipping' },
    { value: wba?.city, source: 'webhook_billing' },
    { value: asa?.city, source: 'api_shipping' },
    { value: aba?.city, source: 'api_billing' },
    { value: wc?.default_address?.city, source: 'webhook_default_address' },
    { value: ac?.default_address?.city, source: 'api_default_address' },
  ]);

  const shippingAddress = resolveField('shippingAddress', [
    { value: noteAddress, source: 'note_attributes' },
    { value: wsa?.address1, source: 'webhook_shipping' },
    { value: wba?.address1, source: 'webhook_billing' },
    { value: asa?.address1, source: 'api_shipping' },
    { value: aba?.address1, source: 'api_billing' },
  ]);

  const province = resolveField('province', [
    { value: wsa?.province, source: 'webhook_shipping' },
    { value: wba?.province, source: 'webhook_billing' },
    { value: asa?.province, source: 'api_shipping' },
    { value: aba?.province, source: 'api_billing' },
  ]);

  const postalCode = resolveField('postalCode', [
    { value: wsa?.zip, source: 'webhook_shipping' },
    { value: wba?.zip, source: 'webhook_billing' },
    { value: asa?.zip, source: 'api_shipping' },
    { value: aba?.zip, source: 'api_billing' },
  ]);

  qualityFlags.missing_name = !customerName || customerName === 'Unknown';
  qualityFlags.missing_phone = !customerPhone;
  qualityFlags.missing_address = !shippingAddress;
  qualityFlags.missing_city = !city;
  qualityFlags.missing_email = !customerEmail;

  return {
    customerName,
    customerPhone,
    customerEmail,
    shippingAddress,
    city,
    province,
    postalCode,
    sources,
    qualityFlags,
  };
}

export const webhookHandler = new WebhookHandler();
export { resolveOrderFields };
