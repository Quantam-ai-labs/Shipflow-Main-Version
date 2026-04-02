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
import { merchants, orders, waRawEvents } from "../../shared/schema";
import { eq, and, or, desc } from "drizzle-orm";
import type { WaRawEvent } from "../../shared/schema";
import { sendAgentChatPushNotifications } from "./agentChatNotificationService";
import { handleAiAutoReply } from "./aiAutoReplyService";
import { broadcastToMerchant } from "./sseManager";

const LOG = "[WA-Processor]";
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];

// Common confirm/cancel signals (subset of what waOrderConfirmation uses) — used as a
// safety guard to prevent AI from handling messages that look like order confirmations.
const CONFIRM_CANCEL_SIGNALS = [
  "confirm", "confirmed", "yes", "yep", "yeah", "yup", "yap", "ok", "okay", "sure",
  "haan", "haa", "han", "ha", "ji", "ji haan", "ji han", "bilkul", "zaroor",
  "alright", "proceed", "approved", "agree", "sahi hai", "theek hai", "thik hai",
  "send kar do", "bej do", "bhej do", "اوکے", "ہاں", "جی", "جی ہاں", "بالکل",
  "cancel", "cancelled", "no", "nope", "nah", "na", "nahi", "nahin", "nai", "nay",
  "nahi chahiye", "mat bhejo", "cancel kar do", "cancel karo", "rok do",
  "don't want", "dont want", "don't send", "dont send", "not interested",
  "wapis", "stop", "band karo", "band kar do", "نہیں", "کینسل", "واپس", "بند",
];

/**
 * Returns true if the message body matches a known confirm or cancel signal.
 * Used as a safety guard: when no order record is found but the customer appears to
 * be responding to an order confirmation prompt, we skip AI and send a neutral reply.
 */
function isConfirmOrCancelIntent(messageBody: string): boolean {
  const lower = messageBody.toLowerCase().trim().replace(/[!.,؟?،]+$/g, "").trim();
  return CONFIRM_CANCEL_SIGNALS.some(signal => {
    if (signal.length <= 4) {
      return lower === signal || new RegExp(`(?:^|\\s)${signal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(lower);
    }
    return lower.includes(signal);
  });
}

/** Thrown when a reaction is parked (target not found). Signals processWithRetry to NOT retry and NOT mark as processed. */
class ReactionParkedError extends Error {
  constructor() { super("reaction_parked"); }
}

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
 * PERSIST ONLY — writes raw message event to DB and returns it.
 * Call scheduleProcessing() afterward to kick off async processing.
 * Use this when you need the raw event persisted BEFORE sending 200 to Meta.
 */
export async function persistRawMessageEvent(params: {
  merchantId: string | null;
  eventType: string;
  waMessageId: string;
  fromPhone: string;
  webhookSource: "generic" | "merchant";
  payload: Record<string, any>;
}): Promise<WaRawEvent> {
  return storage.createWaRawEvent({
    merchantId: params.merchantId,
    eventType: params.eventType,
    waMessageId: params.waMessageId,
    fromPhone: params.fromPhone,
    webhookSource: params.webhookSource,
    payload: params.payload,
    status: "pending",
    retryCount: 0,
  });
}

/**
 * PERSIST ONLY — writes raw status event to DB and returns it.
 * Call scheduleProcessing() afterward to kick off async processing.
 */
export async function persistRawStatusEvent(params: {
  merchantId: string | null;
  waMessageId: string;
  webhookSource: "generic" | "merchant";
  payload: Record<string, any>;
}): Promise<WaRawEvent> {
  return storage.createWaRawEvent({
    merchantId: params.merchantId,
    eventType: "status",
    waMessageId: params.waMessageId,
    fromPhone: null,
    webhookSource: params.webhookSource,
    payload: params.payload,
    status: "pending",
    retryCount: 0,
  });
}

/**
 * Schedule async processing for a raw event that has already been persisted.
 * Fire-and-forget — returns immediately.
 */
export function scheduleProcessing(rawEvent: WaRawEvent): void {
  processWithRetry(rawEvent).catch(() => {});
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
    // Reaction was parked (target message not yet in DB) — not an error, not a retry
    if (err instanceof ReactionParkedError) return;

    const retryCount = (rawEvent.retryCount ?? 0) + 1;
    const errMsg = err.message ?? String(err);

    if (retryCount >= MAX_RETRIES) {
      console.error(`${LOG} Event ${rawEvent.id} (${rawEvent.eventType}) — FAILED permanently after ${MAX_RETRIES} attempts: ${errMsg}`);
      await storage.updateWaRawEventStatus(rawEvent.id, "failed", {
        retryCount,
        error: errMsg,
        nextRetryAt: null,
      }).catch(() => {});
      // Enqueue to permanent failure queue for admin review
      storage.createWaFailedEvent({
        rawEventId: rawEvent.id,
        merchantId: rawEvent.merchantId ?? null,
        eventType: rawEvent.eventType,
        webhookSource: rawEvent.webhookSource ?? "generic",
        payload: rawEvent.payload,
        errorMessage: errMsg,
        attemptCount: retryCount,
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

  // Look up the message before updating so we have its conversationId for SSE broadcast
  const existingMsg = await storage.getWaMessageByWaId(waMessageId).catch(() => null);
  const updated = await storage.updateWaMessageStatusByWaId(waMessageId, newStatus);
  if (updated) {
    console.log(`${LOG} Status update: ${waMessageId} → ${newStatus}`);
    // Broadcast tick update to all SSE clients for this merchant
    if (rawEvent.merchantId && existingMsg?.conversationId) {
      broadcastToMerchant(rawEvent.merchantId, "status_update", {
        waMessageId,
        status: newStatus,
        conversationId: existingMsg.conversationId,
      });
    }
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
  // For WhatsApp deleted events, message.id IS the ID of the deleted message.
  // Some API versions may also provide it under message.deleted?.message_id as a backup.
  if (rawType === "deleted") {
    const deletedTargetId = message.id ?? message.deleted?.message_id ?? "";
    if (deletedTargetId) {
      await storage.softDeleteWaMessage(deletedTargetId);
      console.log(`${LOG} Message deleted by customer: ${deletedTargetId}`);
    }
    return;
  }

  // ── Reaction ─────────────────────────────────────────────────────────────
  if (rawType === "reaction") {
    const emoji: string = message.reaction?.emoji ?? "";
    const targetWaId: string = message.reaction?.message_id ?? "";

    let reactionParked = false;
    if (targetWaId) {
      // Pass phone as reactionFrom so it's set on the target message row
      const applied = await storage.applyReactionToWaMessage(targetWaId, emoji, phone || null);
      if (applied) {
        console.log(`${LOG} Reaction ${emoji || "(removed)"} applied to message ${targetWaId} from ${phone}`);
      } else {
        // Target message not yet in DB — park for later reconciliation.
        // Set waMessageId to targetWaId so getPendingReactionsForTarget can find this event.
        await db.update(waRawEvents)
          .set({ status: "reaction_pending", waMessageId: targetWaId })
          .where(eq(waRawEvents.id, rawEvent.id));
        console.warn(`${LOG} Reaction target ${targetWaId} not found — parked as reaction_pending`);
        reactionParked = true;
      }
    }

    // Save the reaction as an inbound timeline message with reactionFrom = sender phone
    if (resolvedMerchantId && phone) {
      await saveInboxMessage(resolvedMerchantId, phone, contactName, waMessageId, "reaction",
        emoji ? `Reacted ${emoji}` : "Removed reaction",
        null, null, null, emoji || null, phone, targetWaId || null, message);
    }

    // If parked, signal processWithRetry to leave status as reaction_pending (not processed)
    if (reactionParked) throw new ReactionParkedError();
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

  const saveResult = await saveInboxMessage(
    resolvedMerchantId, phone, contactName, waMessageId,
    msgType, messageBody, mediaUrl, mimeType, fileName,
    null, null, null, message,
  );

  // ── Push notification + SSE broadcast ──────────────────────────────────────
  if (saveResult) {
    const { convId, message: savedMessage } = saveResult;
    sendAgentChatPushNotifications(resolvedMerchantId, contactName ?? phone, messageBody, convId).catch(() => {});
    // Include message payload so SSE clients can append directly to cache (zero extra fetch)
    broadcastToMerchant(resolvedMerchantId, "new_message", { conversationId: convId, message: savedMessage });
    broadcastToMerchant(resolvedMerchantId, "conversation_update", { conversationId: convId });
  }

  // ── Order confirmation (text/button only) ─────────────────────────────────
  const convId = saveResult?.convId ?? null;
  if (msgType === "text" || msgType === "button_reply") {
    // triggerOrderConfirmation returns true if an order was matched (even if processing
    // failed internally). Returns false ONLY when no order exists for this customer.
    const orderHandled = await triggerOrderConfirmation(resolvedMerchantId, phone, messageBody, message, waMessageId);

    if (!orderHandled) {
      // ── Safety guard: if the message looks like a confirm/cancel intent, do NOT ──
      // route to AI — send a neutral acknowledgement instead. This prevents the AI
      // from falsely confirming or cancelling an order when no order record was found.
      if (msgType === "button_reply" || isConfirmOrCancelIntent(messageBody)) {
        const { sendWhatsAppMessage } = await import("./whatsappSendMessage");
        const merchant = await storage.getMerchant(resolvedMerchantId).catch(() => null);
        if (merchant?.waPhoneNumberId && merchant?.waAccessToken) {
          sendWhatsAppMessage(
            phone,
            "Thank you for your response. Our team will process it shortly.",
            merchant.waPhoneNumberId,
            merchant.waAccessToken,
          ).catch(() => {});
        }
        console.log(`${LOG} Confirm/cancel intent detected but no order found for ${phone} — sent safe acknowledgement, skipping AI`);
        return;
      }

      // ── AI auto-reply (only when message is not an order confirmation) ───
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
  reactionFrom: string | null,
  referenceMessageId: string | null,
  rawMessage: Record<string, any>,
): Promise<{ convId: string; message: any } | null> {
  try {
    // Idempotency: skip if this waMessageId was already saved inline during the same webhook call
    if (waMessageId) {
      const existing = await storage.getWaMessageByWaId(waMessageId);
      if (existing) {
        console.log(`${LOG} Idempotency: waMessageId ${waMessageId} already in wa_messages — skipping duplicate save`);
        const conv = await storage.getConversationById(existing.conversationId);
        return conv ? { convId: conv.id, message: existing } : null;
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

    const savedMessage = await storage.createWaMessage({
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
      reactionFrom,
      referenceMessageId,
    });

    // Reconcile any pending reactions that were waiting for this message
    if (waMessageId && msgType !== "reaction") {
      reconcilePendingReactions(waMessageId).catch(() => {});
    }

    return { convId: conv.id, message: savedMessage };
  } catch (err: any) {
    console.error(`${LOG} saveInboxMessage failed for ${phone}: ${err.message}`);
    throw err;
  }
}

async function reconcilePendingReactions(targetWaId: string): Promise<void> {
  try {
    const pending = await storage.getPendingReactionsForTarget(targetWaId);
    if (pending.length === 0) return;
    console.log(`${LOG} Reconciling ${pending.length} pending reaction(s) for message ${targetWaId}`);
    for (const evt of pending) {
      const msgPayload = (evt.payload as any)?.message;
      const emoji: string = msgPayload?.reaction?.emoji ?? "";
      const fromPhone: string = evt.fromPhone ?? "";
      const applied = await storage.applyReactionToWaMessage(targetWaId, emoji, fromPhone || null);
      if (applied) {
        await storage.updateWaRawEventStatus(evt.id, "processed", { processedAt: new Date() }).catch(() => {});
        console.log(`${LOG} Reconciled pending reaction ${emoji} on message ${targetWaId}`);
      }
    }
  } catch (err: any) {
    console.error(`${LOG} reconcilePendingReactions error for ${targetWaId}: ${err.message}`);
  }
}

// Returns true if an order was matched (regardless of whether processing succeeded).
// Returns false ONLY if no order was found for this customer — caller triggers AI auto-reply.
// When an order is found but processing throws, we return true so AI is NOT triggered,
// and a merchant notification is created inside processWhatsAppOrderResponse's catch block.
async function triggerOrderConfirmation(
  merchantId: string,
  phone: string,
  messageBody: string,
  rawMessage: Record<string, any>,
  waMessageId: string,
): Promise<boolean> {
  let matchedOrderNumber: string | null = null;
  let matchedOrderId: string | null = null;
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

    if (!matchedOrder) return false;

    // Order found — capture identifiers before processing in case of error
    matchedOrderNumber = matchedOrder.orderNumber;
    matchedOrderId = matchedOrder.id;

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
    // Return true — order was matched and processed (or processing failure was handled internally)
    return true;
  } catch (err: any) {
    // Order was found but an unexpected error escaped processWhatsAppOrderResponse.
    // Log with enough detail to diagnose the root cause.
    console.error(
      `${LOG} triggerOrderConfirmation UNEXPECTED error — merchantId=${merchantId} phone=${phone}` +
      (matchedOrderNumber ? ` orderNumber=${matchedOrderNumber}` : "") +
      (matchedOrderId ? ` orderId=${matchedOrderId}` : "") +
      ` message="${messageBody?.slice(0, 80)}" error=${err.message}`,
      err
    );
    // Return true so the AI fallback is NOT triggered — the merchant notification
    // will have been created inside processWhatsAppOrderResponse's catch block if the
    // error originated there. If it originated here (e.g. during DB lookup of the
    // order), we return true conservatively to avoid false AI confirmations.
    if (matchedOrderId) {
      // An order was found — AI must not handle this
      return true;
    }
    // Error happened before we could confirm an order exists — safe to let caller decide,
    // but we still return false only when matchedOrderId is null (order lookup itself failed).
    return false;
  }
}
