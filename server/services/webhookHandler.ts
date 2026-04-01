import crypto from 'crypto';
import { storage } from '../storage';
import { shopifyService } from './shopify';
import { isRecentWriteBack } from './shopifyWriteBack';
import { sendOrderStatusWhatsApp } from '../utils/integrations/whatsapp';
import { initializeOrderConfirmation, logConfirmationEvent } from './confirmationEngine';
import { db } from '../db';
import { orders, merchants } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { formatPhoneForWhatsApp } from '../utils/integrations/whatsapp/sender';
import { triggerRobocallForOrder } from './robocallService';
import { transitionOrder } from './workflowTransition';

async function db_updateWaSentAt(orderId: string, waAttemptCount: number = 1, templateName?: string) {
  try {
    const now = new Date();
    await db.update(orders).set({
      waConfirmationSentAt: now,
      waAttemptCount,
      waLastTemplateUsed: templateName || null,
    }).where(eq(orders.id, orderId));
  } catch {}
}

async function db_setNotOnWhatsApp(orderId: string) {
  try {
    await db.update(orders).set({
      waNotOnWhatsApp: true,
      waAttemptCount: 0,
      waNextAttemptAt: null,
    }).where(eq(orders.id, orderId));
  } catch {}
}

async function directTriggerRobocall(params: {
  merchantId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  totalAmount: string | null;
  reason: string;
}): Promise<boolean> {
  const { merchantId, orderId, orderNumber, customerName, customerPhone, totalAmount, reason } = params;
  const [merchant] = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!merchant) return false;

  const order = { id: orderId, merchantId, orderNumber, customerName, customerPhone, totalAmount };
  await triggerRobocallForOrder(order, merchant, reason);
  return true;
}

interface WebhookProcessResult {
  success: boolean;
  action: 'created' | 'updated' | 'skipped_duplicate' | 'failed';
  orderId?: string;
  error?: string;
}

export class WebhookHandler {
  private fallbackSecrets: string[];
  private fallbackLabels: string[];

  constructor() {
    const envKeys = [
      'SHOPIFY_WEBHOOK_SECRET',
      'SHOPIFY_APP_CLIENT_SECRET',
      'SHOPIFY_CLIENT_SECRET',
      'SHOPIFY_APP_SHARED_SECRET',
      'SHOPIFY_APP_SHARED_SECRET_2',
    ];
    this.fallbackSecrets = [];
    this.fallbackLabels = [];
    for (const key of envKeys) {
      const val = process.env[key];
      if (val) {
        this.fallbackSecrets.push(val);
        this.fallbackLabels.push(key);
      }
    }

    const masked = this.fallbackLabels.map((label, i) => {
      const s = this.fallbackSecrets[i];
      return `${label}=${s.slice(0, 4)}...${s.slice(-4)} (${s.length} chars)`;
    });
    console.log(`[WebhookHandler] Initialized with ${this.fallbackSecrets.length} fallback env secrets: ${masked.join(', ') || 'NONE'}`);
  }

  private tryHmac(rawBody: Buffer, hmacHeader: string, secret: string): boolean {
    try {
      const generated = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('base64');
      const hmacBuf = Buffer.from(hmacHeader, 'base64');
      const generatedBuf = Buffer.from(generated, 'base64');
      return (
        hmacBuf.length === generatedBuf.length &&
        crypto.timingSafeEqual(hmacBuf, generatedBuf)
      );
    } catch {
      return false;
    }
  }

  async verifyHmacForShop(rawBody: Buffer, hmacHeader: string, shopDomain: string): Promise<boolean> {
    if (!hmacHeader) {
      console.warn(`[WebhookHandler] HMAC verify skipped: hmacHeader missing`);
      return false;
    }

    const normalizedDomain = shopDomain?.toLowerCase().trim() || '';

    const { decryptToken } = await import('./encryption');
    const { merchants } = await import('../../shared/schema');
    const { shopifyStores } = await import('../../shared/schema');
    const { db } = await import('../db');
    const { eq, and } = await import('drizzle-orm');

    try {
      const [store] = await db.select({ merchantId: shopifyStores.merchantId })
        .from(shopifyStores)
        .where(and(
          eq(shopifyStores.shopDomain, normalizedDomain),
          eq(shopifyStores.isConnected, true)
        ))
        .limit(1);

      if (store) {
        const [merchant] = await db.select({ shopifyAppClientSecret: merchants.shopifyAppClientSecret })
          .from(merchants)
          .where(eq(merchants.id, store.merchantId))
          .limit(1);

        if (merchant?.shopifyAppClientSecret) {
          const dbSecret = decryptToken(merchant.shopifyAppClientSecret);
          if (this.tryHmac(rawBody, hmacHeader, dbSecret)) {
            console.log(`[WebhookHandler] HMAC verified using DB secret for ${normalizedDomain}`);
            return true;
          }
          console.warn(`[WebhookHandler] HMAC failed for ${normalizedDomain}: DB secret did not match (no fallback when merchant secret is configured), header=${hmacHeader.slice(0, 8)}..., bodyLen=${rawBody.length}`);
          return false;
        }

        console.warn(`[WebhookHandler] No DB secret stored for merchant of ${normalizedDomain}, trying fallback env secrets...`);
      } else {
        console.warn(`[WebhookHandler] No connected store found for ${normalizedDomain}, trying fallback env secrets...`);
      }
    } catch (err: any) {
      console.warn(`[WebhookHandler] DB lookup error for ${normalizedDomain}: ${err.message}, trying fallback env secrets...`);
    }

    for (const secret of this.fallbackSecrets) {
      if (this.tryHmac(rawBody, hmacHeader, secret)) {
        console.log(`[WebhookHandler] HMAC verified using fallback env secret for ${normalizedDomain}`);
        return true;
      }
    }

    console.warn(`[WebhookHandler] HMAC failed for ${normalizedDomain}: tried ${this.fallbackSecrets.length} env fallbacks (${this.fallbackLabels.join(', ')}), header=${hmacHeader.slice(0, 8)}..., bodyLen=${rawBody.length}`);
    return false;
  }

  verifyHmac(rawBody: Buffer, hmacHeader: string): boolean {
    if (!this.fallbackSecrets.length || !hmacHeader) {
      return false;
    }
    for (const secret of this.fallbackSecrets) {
      if (this.tryHmac(rawBody, hmacHeader, secret)) {
        return true;
      }
    }
    return false;
  }

  getSecretsDiagnostics(): { count: number; configured: { name: string; masked: string }[]; note: string } {
    return {
      count: this.fallbackSecrets.length,
      configured: this.fallbackLabels.map((label, i) => {
        const s = this.fallbackSecrets[i];
        return { name: label, masked: `${s.slice(0, 4)}...${s.slice(-4)} (${s.length} chars)` };
      }),
      note: "Primary HMAC verification uses the merchant's shopifyAppClientSecret from the DB. Env vars are fallbacks only.",
    };
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
        const manuallyEditedFields: string[] = Array.isArray(existingOrder.manuallyEditedFields) ? (existingOrder.manuallyEditedFields as string[]) : [];
        for (const [key, value] of Object.entries(orderData)) {
          if (key === 'merchantId' || key === 'id' || key === 'shopifyOrderId' || key === 'orderNumber') continue;
          if (manuallyEditedFields.includes(key)) continue;
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

        const isDraftOrder = created.orderSource === "shopify_draft_order";

        if (isDraftOrder) {
          console.log(`[Webhook] Order ${created.orderNumber}: 1SOL-created order (Draft-1SOL tag) — auto-confirming to READY_TO_SHIP`);
          await storage.updateOrder(merchantId, created.id, {
            confirmationStatus: "confirmed",
            confirmationSource: "draft",
          });
          await logConfirmationEvent({
            merchantId,
            orderId: created.id,
            eventType: "CONFIRMED",
            channel: "system",
            note: "1SOL-created order auto-confirmed",
          }).catch(() => {});
          transitionOrder({
            merchantId,
            orderId: created.id,
            toStatus: "READY_TO_SHIP",
            action: "draft_confirm",
            actorType: "system",
            actorName: "System",
            reason: "1SOL-created order auto-confirmed",
          }).catch(err => console.warn(`[Webhook] Failed to transition 1SOL-created order ${created.orderNumber} to READY_TO_SHIP:`, err.message));
          await storage.updateWebhookEventStatus(webhookEvent.id, 'processed');
          return { success: true, action: 'created', orderId: created.id };
        }

        initializeOrderConfirmation({
          merchantId,
          orderId: created.id,
          orderNumber: created.orderNumber,
        }).catch(err => console.error(`[Webhook] Confirmation init failed for ${created.orderNumber}:`, err));

        try {
          const waResult = await sendOrderStatusWhatsApp({
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
            orderSource: created.orderSource,
          });

          if (waResult?.notOnWhatsApp) {
            await db_setNotOnWhatsApp(created.id);

            await logConfirmationEvent({
              merchantId,
              orderId: created.id,
              eventType: "WA_NOT_AVAILABLE",
              channel: "whatsapp",
              note: `Number ${created.customerPhone} not on WhatsApp — bypassing to RoboCall`,
              errorDetails: waResult.error,
            }).catch(() => {});

            await db.update(orders).set({
              workflowStatus: "PENDING",
              previousWorkflowStatus: "NEW",
              pendingReason: "Number not on WhatsApp — routed to RoboCall",
              pendingReasonType: "confirmation_pending",
              lastStatusChangedAt: new Date(),
              updatedAt: new Date(),
            }).where(eq(orders.id, created.id));

            await directTriggerRobocall({
              merchantId,
              orderId: created.id,
              orderNumber: created.orderNumber,
              customerName: created.customerName,
              customerPhone: created.customerPhone,
              totalAmount: created.totalAmount,
              reason: "WhatsApp unavailable — direct bypass to RoboCall",
            });

            console.log(`[Webhook] Order #${created.orderNumber}: number not on WhatsApp, bypassed to RoboCall`);
          } else if (waResult?.sent) {
            await logConfirmationEvent({
              merchantId,
              orderId: created.id,
              eventType: "WA_SENT",
              channel: "whatsapp",
              note: `Confirmation WhatsApp sent to ${created.customerPhone}`,
            }).catch(() => {});

            const firstRetryDelayHours = waResult.retryAttempts?.[0]?.delayHours ?? null;
            const [merchantData] = await db.select({
              waMaxAttempts: merchants.waMaxAttempts,
              waAttempt2DelayHours: merchants.waAttempt2DelayHours,
            }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
            const retriesEnabled = (merchantData?.waMaxAttempts ?? 3) > 1;
            let nextAttempt: Date | null = null;
            if (retriesEnabled) {
              if (firstRetryDelayHours != null) {
                nextAttempt = new Date(Date.now() + firstRetryDelayHours * 60 * 60 * 1000);
              } else {
                const delayHours = merchantData?.waAttempt2DelayHours || 4;
                nextAttempt = new Date(Date.now() + delayHours * 60 * 60 * 1000);
              }
            }

            await db_updateWaSentAt(created.id, 1);
            await db.update(orders).set({
              waNextAttemptAt: nextAttempt,
              ...(waResult.automationId ? { waAutomationId: waResult.automationId } : {}),
            }).where(eq(orders.id, created.id));
          } else {
            const errorStr = waResult?.error || "";
            const isPermanentError = /\(#100\)|\(#131008\)|\(#132000\)|\(#132001\)|\(#132018\)/.test(errorStr);

            if (isPermanentError) {
              await db.update(orders).set({
                waAttemptCount: 1,
                waNextAttemptAt: null,
                workflowStatus: "PENDING",
                previousWorkflowStatus: "NEW",
                pendingReason: "WhatsApp template error — routed to RoboCall",
                pendingReasonType: "confirmation_pending",
                lastStatusChangedAt: new Date(),
                updatedAt: new Date(),
              }).where(eq(orders.id, created.id));

              await logConfirmationEvent({
                merchantId,
                orderId: created.id,
                eventType: "WA_PERMANENT_FAILURE",
                channel: "whatsapp",
                errorDetails: errorStr,
                note: `WhatsApp send failed with permanent error — escalating to RoboCall immediately`,
              }).catch(() => {});

              await directTriggerRobocall({
                merchantId,
                orderId: created.id,
                orderNumber: created.orderNumber,
                customerName: created.customerName,
                customerPhone: created.customerPhone,
                totalAmount: created.totalAmount,
                reason: "WhatsApp template/parameter error — immediate bypass to RoboCall",
              });

              console.log(`[Webhook] Order #${created.orderNumber}: WA permanent error, bypassed to RoboCall`);
            } else {
              const retryAt = new Date(Date.now() + 30 * 60 * 1000);

              await db.update(orders).set({
                waAttemptCount: 1,
                waNextAttemptAt: retryAt,
              }).where(eq(orders.id, created.id));

              await logConfirmationEvent({
                merchantId,
                orderId: created.id,
                eventType: "WA_SENT",
                channel: "whatsapp",
                errorDetails: errorStr || "Unknown error",
                note: `WhatsApp confirmation send failed (transient error) — will retry at ${retryAt.toISOString()}`,
              }).catch(() => {});
            }
          }
        } catch (waErr) {
          console.error(`[Webhook] WhatsApp notification failed for order ${created.orderNumber}:`, waErr);
          await logConfirmationEvent({
            merchantId,
            orderId: created.id,
            eventType: "WA_SENT",
            channel: "whatsapp",
            errorDetails: String(waErr),
            note: "WhatsApp confirmation send failed",
          }).catch(() => {});
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
