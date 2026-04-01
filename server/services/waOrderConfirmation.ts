import { db } from "../db";
import { orders } from "@shared/schema";
import type { Order } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { processConfirmationResponse, createNotification, logConfirmationEvent } from "./confirmationEngine";
import { sendWhatsAppMessage } from "./whatsappSendMessage";
import { handleAiAutoReply } from "./aiAutoReplyService";
import { transitionOrder } from "./workflowTransition";

const LOG = "[WA-OrderConfirmation]";

const CANCEL_SIGNALS = [
  "nahi chahiye", "mat bhejo", "mat karo", "band karo", "band kar do",
  "cancel kar do", "cancel karo", "rok do", "don't want", "dont want",
  "don't send", "dont send", "not interested",
  "cancel", "cancelled", "cancellation",
  "nahi", "nahin", "nai", "nay",
  "wapis", "stop",
  "نہیں", "کینسل", "واپس", "بند",
  "no", "nope", "nah",
  "na",
];

const CONFIRM_SIGNALS = [
  "ji haan", "ji han", "sahi hai", "theek hai", "thik hai",
  "send kar do", "bej do", "bhej do", "bhejna", "bejh do",
  "bilkul", "zaroor", "alright", "proceed", "approved", "agree",
  "confirm", "confirmed", "okay", "sure",
  "haan", "haa", "han",
  "اوکے", "ہاں", "جی", "جی ہاں", "بالکل",
  "yes", "yep", "yeah", "yup", "yap",
  "ok", "ji",
  "ha",
];

function matchesSignal(msg: string, signal: string): boolean {
  if (signal.length <= 4) {
    return msg === signal || new RegExp(`(?:^|\\s)${signal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(msg);
  }
  return msg.includes(signal);
}

function classifyMessage(lowerMessage: string): "confirm" | "cancel" | "query" {
  const trimmed = lowerMessage.trim().replace(/[!.,؟?،]+$/g, "").trim();
  if (CANCEL_SIGNALS.some(s => matchesSignal(trimmed, s))) return "cancel";
  if (CONFIRM_SIGNALS.some(s => matchesSignal(trimmed, s))) return "confirm";
  return "query";
}

// ── Conflict resolution sub-flow ──────────────────────────────────────────────
async function handleConflictClarificationReply(
  merchantId: string,
  orderId: string,
  orderNumber: string,
  conflictState: string,
  action: "confirm" | "cancel" | "query",
  messageBody: string,
  normalizedPhone: string,
  replyPhoneId?: string,
  replyAccessToken?: string,
): Promise<void> {
  const now = new Date();

  if (conflictState === "awaiting_clarification") {
    if (action === "confirm") {
      // Customer confirmed — finalize order as READY_TO_SHIP
      // Conversation label stays 'conflicting' until agent manually resolves
      await db.update(orders).set({
        conflictClarificationState: null,
        conflictDetected: true,
        confirmationStatus: "confirmed",
        confirmedAt: now,
        updatedAt: now,
      }).where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)));

      await transitionOrder({
        merchantId, orderId,
        toStatus: "READY_TO_SHIP",
        action: "whatsapp_confirm",
        actorType: "system",
        reason: "Customer confirmed after conflict clarification",
      }).catch(() => {});

      await sendWhatsAppMessage(normalizedPhone,
        `✅ Thank you! Your order #${orderNumber} has been confirmed and will be processed shortly.`,
        replyPhoneId, replyAccessToken);

      console.log(`${LOG} ✅ Conflict resolved — Order #${orderNumber} confirmed after clarification`);

    } else if (action === "cancel") {
      // Customer wants to cancel — ask for reason
      // Conversation label stays 'conflicting' until agent manually resolves
      await db.update(orders).set({
        conflictClarificationState: "awaiting_cancel_reason",
        updatedAt: now,
      }).where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)));

      await sendWhatsAppMessage(normalizedPhone,
        `Thank you for letting us know. Could you please briefly tell us why you'd like to cancel order #${orderNumber}? Your feedback helps us improve.`,
        replyPhoneId, replyAccessToken);

      console.log(`${LOG} Conflict → awaiting cancel reason for order #${orderNumber}`);

    } else {
      // Unclear response — mark as permanently conflicting, requires manual resolution
      await db.update(orders).set({
        conflictClarificationState: "conflicting",
        conflictDetected: true,
        updatedAt: now,
      }).where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)));

      await sendWhatsAppMessage(normalizedPhone,
        `We've received your message regarding order #${orderNumber}. Our team will follow up with you shortly to resolve this.`,
        replyPhoneId, replyAccessToken);

      await createNotification({
        merchantId,
        type: "conflict_detected",
        title: `Unresolved conflict on #${orderNumber}`,
        message: `Customer did not clarify after conflict. Order requires manual review.`,
        orderId,
        orderNumber,
      });

      console.log(`${LOG} Conflict unresolved for order #${orderNumber} — marked conflicting`);
    }

  } else if (conflictState === "awaiting_cancel_reason") {
    if (action === "confirm") {
      // Customer changed their mind — confirm the order instead
      // Conversation label stays 'conflicting' until agent manually resolves
      await db.update(orders).set({
        conflictClarificationState: null,
        conflictDetected: true,
        confirmationStatus: "confirmed",
        confirmedAt: now,
        updatedAt: now,
      }).where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)));

      await transitionOrder({
        merchantId, orderId,
        toStatus: "READY_TO_SHIP",
        action: "whatsapp_confirm",
        actorType: "system",
        reason: "Customer confirmed after conflict clarification (reversed cancel intent)",
      }).catch(() => {});

      await sendWhatsAppMessage(normalizedPhone,
        `✅ Got it! Your order #${orderNumber} has been confirmed and will be processed shortly.`,
        replyPhoneId, replyAccessToken);

      console.log(`${LOG} ✅ Order #${orderNumber} confirmed after cancel-reason stage`);

    } else {
      // Any other reply treated as the cancel reason
      // Conversation label stays 'conflicting' until agent manually resolves
      const cancelReason = messageBody.trim() || "Customer requested cancellation";

      await db.update(orders).set({
        conflictClarificationState: null,
        conflictDetected: true,
        confirmationStatus: "cancelled",
        cancelReason,
        cancelledAt: now,
        updatedAt: now,
      }).where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)));

      await transitionOrder({
        merchantId, orderId,
        toStatus: "CANCELLED",
        action: "whatsapp_cancel",
        actorType: "system",
        reason: `Customer cancelled after conflict. Reason: ${cancelReason}`,
      }).catch(() => {});

      await sendWhatsAppMessage(normalizedPhone,
        `We've noted your cancellation for order #${orderNumber}. Thank you for letting us know — we've recorded your reason. If you change your mind or need assistance, please feel free to reach out.`,
        replyPhoneId, replyAccessToken);

      console.log(`${LOG} Order #${orderNumber} cancelled after conflict clarification. Reason: "${cancelReason}"`);
    }
  }

  await logConfirmationEvent({
    merchantId, orderId,
    eventType: "CONFLICT_CLARIFICATION_REPLY",
    channel: "whatsapp",
    responsePayload: { messageBody, conflictState, action },
    responseClassification: action,
    note: `Conflict clarification reply: state was "${conflictState}", action="${action}"`,
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function processWhatsAppOrderResponse(
  merchantId: string,
  orderId: string,
  orderNumber: string,
  messageBody: string,
  phoneNumber: string,
  normalizedPhone: string,
  shopifyOrderId?: string,
  replyPhoneId?: string,
  replyAccessToken?: string,
): Promise<void> {
  try {
    const lowerMessage = messageBody.toLowerCase().trim();
    console.log(`${LOG} Analyzing message for order #${orderNumber}: "${lowerMessage.slice(0, 80)}"`);

    const orderForStatus: Order | undefined = await storage.getOrderById(merchantId, orderId);
    const conflictState = orderForStatus?.conflictClarificationState;

    // ── 1. In-progress conflict clarification ─────────────────────────────────
    if (conflictState === "awaiting_clarification" || conflictState === "awaiting_cancel_reason") {
      const action = classifyMessage(lowerMessage);
      console.log(`${LOG} Order #${orderNumber} in conflict state "${conflictState}", reply classified as: ${action}`);
      await handleConflictClarificationReply(
        merchantId, orderId, orderNumber, conflictState, action,
        messageBody, normalizedPhone, replyPhoneId, replyAccessToken,
      );
      return;
    }

    // ── 2. Already acted on this order (confirmed/cancelled) ─────────────────
    const alreadyActed = orderForStatus?.confirmationStatus === "confirmed" ||
      orderForStatus?.confirmationStatus === "cancelled" ||
      orderForStatus?.confirmationStatus === "manual_confirmed" ||
      orderForStatus?.confirmationStatus === "manual_cancelled";

    if (alreadyActed) {
      const previousStatus = orderForStatus?.confirmationStatus ?? "";
      const action = classifyMessage(lowerMessage);

      // Detect WhatsApp Confirm + Cancel conflict
      const isOpposite =
        (previousStatus === "confirmed" && action === "cancel") ||
        (previousStatus === "manual_confirmed" && action === "cancel") ||
        (previousStatus === "cancelled" && action === "confirm") ||
        (previousStatus === "manual_cancelled" && action === "confirm");

      if (isOpposite) {
        console.log(`${LOG} ⚠️ Conflict detected on #${orderNumber}: was "${previousStatus}", now "${action}" — sending clarification`);

        // Mark order as awaiting clarification
        await db.update(orders).set({
          conflictDetected: true,
          conflictClarificationState: "awaiting_clarification",
          updatedAt: new Date(),
        }).where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)));

        // Label conversation as conflicting — label stays until agent manually clears
        const conv = await storage.getConversationByPhone(merchantId, normalizedPhone);
        if (conv) {
          await storage.updateConversationLabel(merchantId, conv.id, "conflicting").catch(() => {});
        }

        // Create notification for merchant
        await createNotification({
          merchantId,
          type: "conflict_detected",
          title: `Conflicting WhatsApp response on #${orderNumber}`,
          message: `Customer previously ${previousStatus}, but now replied "${action}". Clarification message sent — awaiting customer response.`,
          orderId,
          orderNumber,
        });

        // Send professional clarification message
        const prevWord = previousStatus.startsWith("confirm") ? "Confirm" : "Cancel";
        const newWord = action === "confirm" ? "Confirm" : "Cancel";
        await sendWhatsAppMessage(normalizedPhone,
          `Hi! We noticed you pressed both *${prevWord}* and *${newWord}* for order #${orderNumber}.\n\nTo finalize — please reply:\n• *Confirm* — to proceed with your order\n• *Cancel* — to cancel (and share the reason)\n\nThank you for your time! 🙏`,
          replyPhoneId, replyAccessToken);

        await logConfirmationEvent({
          merchantId, orderId,
          eventType: "WA_CONFLICT_CLARIFICATION_SENT",
          channel: "whatsapp",
          oldStatus: orderForStatus?.workflowStatus,
          responsePayload: { messageBody, previousStatus, newAction: action },
          responseClassification: "conflict",
          note: "Conflict clarification message sent to customer",
        });

        return;
      }

      // Not a conflict — route to AI or send fallback
      const aiMerchant = await storage.getMerchant(merchantId);
      if (aiMerchant?.aiAutoReplyEnabled) {
        const conv = await storage.getConversationByPhone(merchantId, normalizedPhone);
        console.log(`${LOG} Order #${orderNumber} already ${previousStatus} — routing to AI`);
        handleAiAutoReply(merchantId, normalizedPhone, messageBody, conv?.id || null, orderId, orderNumber).catch((e: any) =>
          console.error(`${LOG} Error in post-confirm AI reply:`, e.message)
        );
      } else {
        await sendWhatsAppMessage(normalizedPhone,
          `Thank you for your message regarding order #${orderNumber}. Our team will get back to you shortly.`,
          replyPhoneId, replyAccessToken);
      }
      return;
    }

    // ── 3. Normal first-time response ─────────────────────────────────────────
    const action = classifyMessage(lowerMessage);
    console.log(`${LOG} Classified as: ${action} for order #${orderNumber}`);

    const result = await processConfirmationResponse({
      merchantId,
      orderId,
      source: "whatsapp",
      action,
      payload: { phoneNumber: normalizedPhone, messageBody, raw: messageBody },
    });

    if (result.success) {
      if (action === "confirm") {
        console.log(`${LOG} ✅ Order #${orderNumber} confirmed via WhatsApp — silent confirmation`);
      } else if (action === "cancel") {
        await sendWhatsAppMessage(normalizedPhone,
          `We've noted your cancellation for order #${orderNumber}. Could you briefly share why you'd like to cancel? Your feedback helps us improve.`,
          replyPhoneId, replyAccessToken);
      } else {
        const aiMerchant = await storage.getMerchant(merchantId);
        if (aiMerchant?.aiAutoReplyEnabled) {
          const conv = await storage.getConversationByPhone(merchantId, normalizedPhone);
          console.log(`${LOG} Routing query to AI for order #${orderNumber}`);
          handleAiAutoReply(merchantId, normalizedPhone, messageBody, conv?.id || null, orderId, orderNumber).catch((e: any) =>
            console.error(`${LOG} Error in order-query AI reply:`, e.message)
          );
        } else {
          await sendWhatsAppMessage(normalizedPhone,
            `Thank you for your message regarding order #${orderNumber}. Our team will get back to you shortly.\n\nTo confirm, reply *Yes*. To cancel, reply *No*.`,
            replyPhoneId, replyAccessToken);
        }
      }
    } else if (result.locked) {
      const aiMerchantLocked = await storage.getMerchant(merchantId);
      if (aiMerchantLocked?.aiAutoReplyEnabled) {
        const convLocked = await storage.getConversationByPhone(merchantId, normalizedPhone);
        console.log(`${LOG} Order #${orderNumber} is locked — routing post-booking message to AI`);
        handleAiAutoReply(merchantId, normalizedPhone, messageBody, convLocked?.id || null, orderId, orderNumber).catch((e: any) =>
          console.error(`${LOG} Error in post-booking AI reply:`, e.message)
        );
      } else {
        await sendWhatsAppMessage(normalizedPhone,
          `Order #${orderNumber} has already been confirmed and is being processed. For any changes, please contact our support team.`,
          replyPhoneId, replyAccessToken);
      }
    } else {
      console.error(`${LOG} processConfirmationResponse failed for order #${orderNumber} (${orderId}): ${result.error}`);
      await sendWhatsAppMessage(normalizedPhone,
        `Sorry, there was an issue processing your response for order #${orderNumber}. Please try again or contact support.`,
        replyPhoneId, replyAccessToken);
    }

    await storage.createOrderChangeLog({
      orderId,
      merchantId,
      changeType: action === "confirm" ? "WHATSAPP_CONFIRMED" : action === "cancel" ? "WHATSAPP_CANCELLED" : "WHATSAPP_QUERY",
      fieldName: "workflowStatus",
      oldValue: "",
      newValue: result.newStatus || "",
      actorUserId: "whatsapp_webhook",
      actorName: "WhatsApp Response",
      actorType: "system",
      metadata: { phoneNumber: normalizedPhone, waMessageBody: messageBody, conflict: result.conflict },
    });
  } catch (error: any) {
    console.error(`${LOG} Error processing WhatsApp response:`, error.message);
  }
}
