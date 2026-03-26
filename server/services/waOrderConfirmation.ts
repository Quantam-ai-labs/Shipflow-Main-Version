import { storage } from "../storage";
import { processConfirmationResponse } from "./confirmationEngine";
import { sendWhatsAppMessage } from "./whatsappSendMessage";
import { handleAiAutoReply } from "./aiAutoReplyService";

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

    const orderForStatus = await storage.getOrderById(merchantId, orderId);
    const alreadyActed = orderForStatus?.confirmationStatus === "confirmed" ||
      orderForStatus?.confirmationStatus === "cancelled" ||
      orderForStatus?.confirmationStatus === "manual_confirmed" ||
      orderForStatus?.confirmationStatus === "manual_cancelled";

    if (alreadyActed) {
      const aiMerchant = await storage.getMerchant(merchantId);
      if (aiMerchant?.aiAutoReplyEnabled) {
        const conv = await storage.getConversationByPhone(merchantId, normalizedPhone);
        console.log(`${LOG} Order #${orderNumber} already ${orderForStatus?.confirmationStatus} — routing to AI`);
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

    const trimmedLower = lowerMessage.trim().replace(/[!.,؟?،]+$/g, "").trim();

    let action: "confirm" | "cancel" | "query";
    if (CANCEL_SIGNALS.some(s => matchesSignal(trimmedLower, s))) {
      action = "cancel";
    } else if (CONFIRM_SIGNALS.some(s => matchesSignal(trimmedLower, s))) {
      action = "confirm";
    } else {
      action = "query";
    }

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
