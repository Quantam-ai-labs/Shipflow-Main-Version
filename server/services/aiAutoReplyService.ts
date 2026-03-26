import { storage } from "../storage";
import { sendWhatsAppMessage } from "./whatsappSendMessage";
import { createNotification } from "./confirmationEngine";

const LOG = "[WhatsApp AI]";

const CLASSIFICATION_TO_LABEL: Record<string, string> = {
  complaint: "Complaints",
  return: "Returns",
  replacement: "Replacements",
  human_handoff: "Need Human",
  conflict: "Conflicts",
  lead: "Leads",
  urgent_request: "Urgent",
  general_query: "General Queries",
};

const LABEL_PRIORITY = ["Leads", "General Queries", "Complaints", "Returns", "Replacements", "Conflicts", "Need Human", "Urgent"];

const NOTIFY_CLASSIFICATIONS = new Set(["complaint", "return", "replacement", "human_handoff", "conflict", "lead", "urgent_request"]);

const CLASSIFICATION_NOTIFICATION_TITLES: Record<string, string> = {
  complaint: "Customer Complaint",
  return: "Return Request",
  replacement: "Replacement Request",
  human_handoff: "Human Takeover Needed",
  conflict: "Order Conflict Detected",
  lead: "New Lead",
  urgent_request: "Urgent Request",
};

export async function handleAiAutoReply(
  merchantId: string,
  customerPhone: string,
  messageText: string,
  conversationId: string | null,
  orderId: string | null,
  orderNumber: string | null,
): Promise<void> {
  try {
    if (conversationId) {
      const conv = await storage.getConversationById(conversationId);
      if (conv?.aiPaused) {
        console.log(`${LOG} AI paused for conversation ${conversationId}, skipping auto-reply`);
        return;
      }
    }

    const { generateAiReply } = await import("./whatsappAiReply");
    const result = await generateAiReply({
      merchantId,
      customerPhone,
      messageText,
      conversationId: conversationId || undefined,
      orderId,
      orderNumber,
    });

    if (!result.success || !result.reply) {
      if (!result.skipped) {
        console.error(`${LOG} AI reply failed for ${customerPhone}: ${result.error}`);
      }
      return;
    }

    const merchant = await storage.getMerchant(merchantId);
    if (!merchant?.waPhoneNumberId || !merchant?.waAccessToken) {
      console.warn(`${LOG} Cannot send AI reply: WA not configured for merchant ${merchantId}`);
      return;
    }

    const sent = await sendWhatsAppMessage(
      customerPhone,
      result.reply,
      merchant.waPhoneNumberId,
      merchant.waAccessToken,
    );

    if (sent) {
      let convId = conversationId;
      if (!convId) {
        const conv = await storage.getConversationByPhone(merchantId, customerPhone);
        convId = conv?.id || null;
      }
      if (convId) {
        await storage.createWaMessage({
          conversationId: convId,
          direction: "outbound",
          senderName: "AI Assistant",
          text: result.reply,
          status: "sent",
          messageType: "text",
        });
        await storage.upsertConversation({
          merchantId,
          contactPhone: customerPhone,
          lastMessage: result.reply.slice(0, 200),
        });

        if (result.classification && CLASSIFICATION_TO_LABEL[result.classification]) {
          let conv: any = null;
          try {
            conv = await storage.getConversationById(convId);
            if (conv) {
              const labelName = CLASSIFICATION_TO_LABEL[result.classification];
              const currentPriority = LABEL_PRIORITY.indexOf(conv.label || "");
              const newPriority = LABEL_PRIORITY.indexOf(labelName);
              if (newPriority > currentPriority) {
                await storage.updateConversationLabel(merchantId, convId, labelName);
                console.log(`${LOG} Auto-labeled conversation ${convId} as "${labelName}" (escalated from "${conv.label || "none"}")`);
              } else {
                console.log(`${LOG} Skipping label downgrade for ${convId}: "${conv.label}" → "${labelName}" (no escalation)`);
              }
            }
          } catch (labelErr: any) {
            console.error(`${LOG} Failed to auto-label:`, labelErr.message);
          }

          const shouldPause = result.classification === "complaint" || result.classification === "return" || result.classification === "replacement" || result.classification === "urgent_request";
          if (shouldPause) {
            try {
              await storage.pauseAiForConversation(merchantId, convId);
              console.log(`${LOG} AI paused for conversation ${convId} due to ${result.classification}`);
            } catch (pauseErr: any) {
              console.error(`${LOG} Failed to pause AI:`, pauseErr.message);
            }
          }

          const conflictOrderId = conv?.orderId || orderId;
          if (result.classification === "conflict" && conflictOrderId) {
            try {
              const { transitionOrder } = await import("./workflowTransition");
              const { logConfirmationEvent: logCE } = await import("./confirmationEngine");
              const conflictOrderNumber = conv?.orderNumber || orderNumber || "N/A";
              console.log(`${LOG} AI conflict detected for order ${conflictOrderNumber} — transitioning to HOLD`);
              const holdResult = await transitionOrder({
                merchantId,
                orderId: conflictOrderId,
                toStatus: "HOLD",
                action: "ai_conflict",
                actorType: "system",
                actorUserId: "whatsapp_ai",
                actorName: "AI Assistant",
                reason: `AI detected conflicting post-confirmation message from customer — held for manual review`,
                extraData: { aiConflictMessage: messageText, aiReply: result.reply },
              });
              if (holdResult.success) {
                await logCE({
                  merchantId,
                  orderId: conflictOrderId,
                  eventType: "AI_CONFLICT_HOLD",
                  channel: "whatsapp",
                  newStatus: "HOLD",
                  note: `AI classified post-confirm message as conflict: "${messageText.slice(0, 150)}". AI replied: "${(result.reply || "").slice(0, 150)}". Order moved to Hold — manual agent review required.`,
                });
                console.log(`${LOG} Order ${conflictOrderNumber} moved to HOLD due to AI conflict classification`);
              } else {
                console.warn(`${LOG} Failed to transition order to HOLD: ${holdResult.error}`);
              }
            } catch (conflictErr: any) {
              console.error(`${LOG} Failed to handle AI conflict:`, conflictErr.message);
            }
          }

          if (NOTIFY_CLASSIFICATIONS.has(result.classification)) {
            try {
              const contactDisplay = conv?.contactName || customerPhone;
              const notifOrderId = conv?.orderId || orderId || undefined;
              const notifOrderNumber = conv?.orderNumber || orderNumber || undefined;
              const orderRef = notifOrderNumber ? ` (Order #${notifOrderNumber})` : "";
              let notifMessage = `${contactDisplay}${orderRef} — classified as ${CLASSIFICATION_TO_LABEL[result.classification]}`;
              if (result.classification === "conflict") {
                notifMessage = `${contactDisplay}${orderRef} sent a conflicting message: "${messageText.slice(0, 120)}". Order moved to Hold — manual review required.`;
              }
              await createNotification({
                merchantId,
                type: `ai_${result.classification}`,
                title: CLASSIFICATION_NOTIFICATION_TITLES[result.classification] || result.classification,
                message: notifMessage,
                orderId: notifOrderId,
                orderNumber: notifOrderNumber,
              });
              console.log(`${LOG} Notification sent for ${result.classification} on conversation ${convId}`);
            } catch (notifyErr: any) {
              console.error(`${LOG} Failed to create notification:`, notifyErr.message);
            }
          }
        }
      }
      console.log(`${LOG} AI reply sent to ${customerPhone}${result.classification ? ` [${result.classification}]` : ""}`);
    }
  } catch (error: any) {
    console.error(`${LOG} handleAiAutoReply error:`, error.message);
  }
}
