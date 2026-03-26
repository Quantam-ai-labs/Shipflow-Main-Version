/**
 * WhatsApp Webhook Processor — Zero-Drop Safety Net
 *
 * Every incoming Meta webhook event is first saved to wa_raw_events.
 * This processor runs async after the raw event is persisted, handling
 * ALL message types (text, image, audio, video, document, sticker,
 * reaction, location, contacts, deleted) and all status updates
 * (sent, delivered, read, failed).
 *
 * If processing fails, the event is retried with exponential backoff:
 *   Attempt 1 → 5 seconds
 *   Attempt 2 → 30 seconds
 *   Attempt 3 → 2 minutes
 * After 3 failures → status = "failed" (visible in /api/admin/webhook-health)
 *
 * On server startup, any events still in "pending" or "retrying" state are
 * automatically picked up and reprocessed.
 */

import { db } from "../db";
import { storage } from "../storage";
import { merchants, orders } from "../../shared/schema";
import { eq, and, or, desc } from "drizzle-orm";
import type { WaRawEvent } from "../../shared/schema";
import { sendAgentChatPushNotifications } from "./agentChatNotificationService";
import { handleAiAutoReply } from "./aiAutoReplyService";

const LOG = "[WA-Processor]";
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];

// In-memory registry of scheduled retry timers (prevents duplicate scheduling)
const scheduledRetries = new Set<string>();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Persist a single message event to wa_raw_events and kick off async processing.
 * The caller gets no return value — this is fire-and-forget after persistence.
 */
export async function persistAndProcessMessage(params: {
  merchantId: string | null;
  eventType: string;
  waMessageId: string;
  fromPhone: string;
  webhookSource: "generic" | "merchant";
  payload: Record<string, any>;
}): Promise<void> {
  try {
    const rawEvent = await storage.createWaRawEvent({
      merchantId: params.merchantId,
      eventType: params.eventType,
      waMessageId: params.waMessageId,
      fromPhone: params.fromPhone,
      webhookSource: params.webhookSource,
      payload: params.payload,
      status: "pending",
      retryCount: 0,
    });
    processWithRetry(rawEvent).catch(() => {});
  } catch (err: any) {
    console.error(`${LOG} CRITICAL — failed to persist raw event: ${err.message}`);
  }
}

/**
 * Persist a status update event (sent/delivered/read/failed) and process async.
 */
export async function persistAndProcessStatus(params: {
  merchantId: string | null;
  waMessageId: string;
  webhookSource: "generic" | "merchant";
  payload: Record<string, any>;
}): Promise<void> {
  try {
    const rawEvent = await storage.createWaRawEvent({
      merchantId: params.merchantId,
      eventType: "status",
      waMessageId: params.waMessageId,
      fromPhone: null,
      webhookSource: params.webhookSource,
      payload: params.payload,
      status: "pending",
      retryCount: 0,
    });
    processWithRetry(rawEvent).catch(() => {});
  } catch (err: any) {
    console.error(`${LOG} CRITICAL — failed to persist status raw event: ${err.message}`);
  }
}

/**
 * On server startup: pick up any events that were left pending (e.g., from a
 * server crash mid-processing) and reprocess them.
 */
export async function recoverPendingEvents(): Promise<void> {
  try {
    const pending = await storage.getPendingWaRawEvents(200);
    if (pending.length === 0) return;
    console.log(`${LOG} Startup recovery: found ${pending.length} pending event(s) to reprocess`);
    for (const evt of pending) {
      processWithRetry(evt).catch(() => {});
    }
  } catch (err: any) {
    console.error(`${LOG} Startup recovery failed: ${err.message}`);
  }
}

// ─── Core Processor ───────────────────────────────────────────────────────────

async function processWithRetry(rawEvent: WaRawEvent): Promise<void> {
  if (scheduledRetries.has(rawEvent.id)) return;
  try {
    await processRawEvent(rawEvent);
    await storage.updateWaRawEventStatus(rawEvent.id, "processed", {
      processedAt: new Date(),
      error: null,
      nextRetryAt: null,
    });
  } catch (err: any) {
    const retryCount = (rawEvent.retryCount ?? 0) + 1;
    const errMsg = err.message ?? String(err);

    if (retryCount >= MAX_RETRIES) {
      console.error(`${LOG} Event ${rawEvent.id} (${rawEvent.eventType}) — FAILED permanently after ${MAX_RETRIES} attempts: ${errMsg}`);
      await storage.updateWaRawEventStatus(rawEvent.id, "failed", {
        retryCount,
        error: errMsg,
        nextRetryAt: null,
      }).catch(() => {});
    } else {
      const delayMs = RETRY_DELAYS_MS[retryCount - 1] ?? 120_000;
      const nextRetryAt = new Date(Date.now() + delayMs);
      console.warn(`${LOG} Event ${rawEvent.id} (${rawEvent.eventType}) — attempt ${retryCount} failed, retrying in ${delayMs / 1000}s: ${errMsg}`);
      await storage.updateWaRawEventStatus(rawEvent.id, "retrying", {
        retryCount,
        error: errMsg,
        nextRetryAt,
      }).catch(() => {});

      scheduledRetries.add(rawEvent.id);
      setTimeout(async () => {
        scheduledRetries.delete(rawEvent.id);
        const updated: WaRawEvent = { ...rawEvent, retryCount, status: "retrying" };
        await processWithRetry(updated);
      }, delayMs);
    }
  }
}

async function processRawEvent(rawEvent: WaRawEvent): Promise<void> {
  const { eventType, payload } = rawEvent;

  if (eventType === "status") {
    await handleStatusEvent(rawEvent);
    return;
  }

  await handleMessageEvent(rawEvent);
}

// ─── Status Events ────────────────────────────────────────────────────────────

async function handleStatusEvent(rawEvent: WaRawEvent): Promise<void> {
  const { waMessageId, payload } = rawEvent;
  const statusPayload = payload as { status?: string; timestamp?: string; errors?: any[] };
  const newStatus = statusPayload.status;

  if (!waMessageId || !newStatus) return;
  if (!["sent", "delivered", "read", "failed"].includes(newStatus)) return;

  const updated = await storage.updateWaMessageStatusByWaId(waMessageId, newStatus);
  if (updated) {
    console.log(`${LOG} Status update: ${waMessageId} → ${newStatus}`);
  }
}

// ─── Message Events ───────────────────────────────────────────────────────────

async function handleMessageEvent(rawEvent: WaRawEvent): Promise<void> {
  const { merchantId, fromPhone, payload } = rawEvent;
  const p = payload as {
    message: Record<string, any>;
    contacts: any[];
    metadata: Record<string, any>;
    webhookMerchantId?: string;
  };

  const message = p.message;
  const contacts = p.contacts ?? [];
  const resolvedMerchantId = merchantId ?? p.webhookMerchantId ?? null;
  const rawType: string = message.type ?? "text";
  const waMessageId: string = message.id ?? "";
  const phone: string = fromPhone ?? (message.from ?? "").replace(/^\+/, "");
  const contactName: string | undefined = contacts[0]?.profile?.name;

  // ── Deletion ──────────────────────────────────────────────────────────────
  if (rawType === "deleted") {
    if (waMessageId) {
      await storage.softDeleteWaMessage(waMessageId);
      console.log(`${LOG} Message deleted by customer: ${waMessageId}`);
    }
    return;
  }

  // ── Reaction ─────────────────────────────────────────────────────────────
  if (rawType === "reaction") {
    const emoji: string = message.reaction?.emoji ?? "";
    const targetWaId: string = message.reaction?.message_id ?? "";

    if (targetWaId) {
      const applied = await storage.applyReactionToWaMessage(targetWaId, emoji);
      if (applied) {
        console.log(`${LOG} Reaction ${emoji || "(removed)"} applied to message ${targetWaId}`);
      } else {
        console.warn(`${LOG} Reaction target message not found: ${targetWaId} — saving as reaction message anyway`);
      }
    }

    // Save the reaction as an inbound message too so it shows in the timeline
    if (resolvedMerchantId && phone) {
      await saveInboxMessage(resolvedMerchantId, phone, contactName, waMessageId, "reaction",
        emoji ? `Reacted ${emoji}` : "Removed reaction",
        null, null, null, emoji || null, targetWaId || null, message);
    }
    return;
  }

  // ── Normalise message content ─────────────────────────────────────────────
  let msgType = "text";
  let messageBody = "[non-text message]";
  let mediaUrl: string | null = null;
  let mimeType: string | null = null;
  let fileName: string | null = null;

  if (rawType === "text") {
    messageBody = message.text?.body ?? "";
    msgType = "text";
  } else if (rawType === "button") {
    messageBody = message.button?.text ?? "";
    msgType = "button_reply";
  } else if (rawType === "interactive") {
    messageBody = message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? "";
    msgType = "button_reply";
  } else if (rawType === "image") {
    messageBody = message.image?.caption ?? "📷 Image";
    mediaUrl = message.image?.id ? `wa-media:${message.image.id}` : null;
    mimeType = message.image?.mime_type ?? null;
    msgType = "image";
  } else if (rawType === "sticker") {
    messageBody = "🎨 Sticker";
    mediaUrl = message.sticker?.id ? `wa-media:${message.sticker.id}` : null;
    mimeType = message.sticker?.mime_type ?? null;
    msgType = "sticker";
  } else if (rawType === "document") {
    messageBody = message.document?.caption ?? message.document?.filename ?? "📄 Document";
    mediaUrl = message.document?.id ? `wa-media:${message.document.id}` : null;
    mimeType = message.document?.mime_type ?? null;
    fileName = message.document?.filename ?? null;
    msgType = "document";
  } else if (rawType === "audio" || rawType === "voice") {
    messageBody = "🎵 Audio";
    const audioId = message.audio?.id || message.voice?.id;
    mediaUrl = audioId ? `wa-media:${audioId}` : null;
    mimeType = message.audio?.mime_type ?? message.voice?.mime_type ?? null;
    msgType = "audio";
  } else if (rawType === "video") {
    messageBody = message.video?.caption ?? "🎬 Video";
    mediaUrl = message.video?.id ? `wa-media:${message.video.id}` : null;
    mimeType = message.video?.mime_type ?? null;
    msgType = "video";
  } else if (rawType === "location") {
    const lat = message.location?.latitude;
    const lng = message.location?.longitude;
    const locName = message.location?.name ?? "";
    const locAddr = message.location?.address ?? "";
    messageBody = locName || locAddr || `${lat},${lng}`;
    mediaUrl = `geo:${lat},${lng}`;
    msgType = "location";
  } else if (rawType === "contacts") {
    const ctcts = message.contacts ?? [];
    const names = ctcts.map((c: any) => c.name?.formatted_name ?? "Unknown").join(", ");
    messageBody = names || "Contact shared";
    mediaUrl = JSON.stringify(ctcts);
    msgType = "contacts";
  }

  // ── Save to inbox ─────────────────────────────────────────────────────────
  if (!resolvedMerchantId) {
    console.warn(`${LOG} No merchant resolved for event ${rawEvent.id}, cannot save to inbox`);
    return;
  }

  const convId = await saveInboxMessage(
    resolvedMerchantId, phone, contactName, waMessageId,
    msgType, messageBody, mediaUrl, mimeType, fileName,
    null, null, message,
  );

  // ── Push notification to agent ─────────────────────────────────────────
  if (convId) {
    sendAgentChatPushNotifications(resolvedMerchantId, contactName ?? phone, messageBody, convId).catch(() => {});
  }

  // ── Order confirmation (text/button only) ─────────────────────────────────
  if (msgType === "text" || msgType === "button_reply") {
    await triggerOrderConfirmation(resolvedMerchantId, phone, messageBody, message, waMessageId);

    // ── AI auto-reply ───────────────────────────────────────────────────────
    const conv = convId ? await storage.getConversationById(convId).catch(() => null) : null;
    handleAiAutoReply(
      resolvedMerchantId,
      phone,
      messageBody,
      convId,
      conv?.orderId ?? null,
      conv?.orderNumber ?? null,
    ).catch(() => {});
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function saveInboxMessage(
  merchantId: string,
  phone: string,
  contactName: string | undefined,
  waMessageId: string,
  msgType: string,
  messageBody: string,
  mediaUrl: string | null,
  mimeType: string | null,
  fileName: string | null,
  reactionEmoji: string | null,
  referenceMessageId: string | null,
  rawMessage: Record<string, any>,
): Promise<string | null> {
  try {
    // Idempotency: skip if this waMessageId was already saved inline during the same webhook call
    if (waMessageId) {
      const existing = await storage.getWaMessageByWaId(waMessageId);
      if (existing) {
        console.log(`${LOG} Idempotency: waMessageId ${waMessageId} already in wa_messages — skipping duplicate save`);
        const conv = await storage.getConversationById(existing.conversationId);
        return conv?.id ?? null;
      }
    }

    // Find matching order (optional)
    const [matchedOrder] = await db
      .select({ id: orders.id, orderNumber: orders.orderNumber })
      .from(orders)
      .where(and(
        eq(orders.merchantId, merchantId),
        or(
          eq(orders.customerPhone, phone),
          eq(orders.customerPhone, `+${phone}`),
          eq(orders.customerPhone, `0${phone.slice(2)}`),
        ),
      ))
      .orderBy(desc(orders.createdAt))
      .limit(1);

    const conv = await storage.upsertConversation({
      merchantId,
      contactPhone: phone,
      contactName,
      orderId: matchedOrder?.id ?? null,
      orderNumber: matchedOrder?.orderNumber ?? null,
      lastMessage: messageBody.slice(0, 200),
    });

    await storage.createWaMessage({
      conversationId: conv.id,
      direction: "inbound",
      senderName: contactName ?? phone,
      text: messageBody,
      waMessageId,
      status: "received",
      messageType: msgType,
      mediaUrl,
      mimeType,
      fileName,
      reactionEmoji,
      referenceMessageId,
    });

    return conv.id;
  } catch (err: any) {
    console.error(`${LOG} saveInboxMessage failed for ${phone}: ${err.message}`);
    throw err;
  }
}

async function triggerOrderConfirmation(
  merchantId: string,
  phone: string,
  messageBody: string,
  rawMessage: Record<string, any>,
  waMessageId: string,
): Promise<void> {
  try {
    const { processWhatsAppOrderResponse } = await import("./waOrderConfirmation");
    const merchant = await storage.getMerchant(merchantId);

    const [matchedOrder] = await db
      .select({
        id: orders.id,
        merchantId: orders.merchantId,
        orderNumber: orders.orderNumber,
        shopifyOrderId: orders.shopifyOrderId,
        status: orders.workflowStatus,
      })
      .from(orders)
      .where(and(
        eq(orders.merchantId, merchantId),
        or(
          eq(orders.customerPhone, phone),
          eq(orders.customerPhone, `+${phone}`),
          eq(orders.customerPhone, `0${phone.slice(2)}`),
        ),
      ))
      .orderBy(desc(orders.createdAt))
      .limit(1);

    if (!matchedOrder) return;

    await processWhatsAppOrderResponse(
      matchedOrder.merchantId,
      matchedOrder.id,
      matchedOrder.orderNumber,
      messageBody,
      phone,
      phone,
      matchedOrder.shopifyOrderId,
      merchant?.waPhoneNumberId ?? undefined,
      merchant?.waAccessToken ?? undefined,
    );
  } catch (err: any) {
    console.error(`${LOG} triggerOrderConfirmation error for ${phone}: ${err.message}`);
  }
}
