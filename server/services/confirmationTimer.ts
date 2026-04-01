import { db, withRetry } from "../db";
import { orders, merchants, robocallLogs, waAutomations, waConversations, waMessages, waMetaTemplates } from "@shared/schema";
import { eq, and, isNull, isNotNull, lte, inArray, gte, notInArray } from "drizzle-orm";
import { logConfirmationEvent } from "./confirmationEngine";
import { formatPhoneForWhatsApp, sendWhatsAppApiRequest, sendWhatsAppTextMessage } from "../utils/integrations/whatsapp/sender";
import { interpolateMessageBody, buildVarsFromParams, buildTemplateParamsFromBody } from "../utils/integrations/whatsapp/variables";
import { storage } from "../storage";
import { triggerRobocallForOrder, checkAndSendPendingCalls, retryFailedCalls } from "./robocallService";

const LOG_PREFIX = "[ConfirmationTimer]";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

type RetryAttempt = { messageText: string; delayHours: number; templateName?: string };

function getRetryAttemptForIndex(automation: any, index: number): RetryAttempt | null {
  const attempts: RetryAttempt[] | null = automation?.retryAttempts;
  if (attempts && attempts.length > index) return attempts[index];
  return null;
}

function getMaxAttempts(automation: any, merchant: any): number {
  const attempts: RetryAttempt[] | null = automation?.retryAttempts;
  if (attempts && attempts.length > 0) return 1 + attempts.length;
  return merchant.waMaxAttempts ?? 3;
}

function getNextAttemptDelay(automation: any, merchant: any, currentAttempt: number): number | null {
  const maxAttempts = getMaxAttempts(automation, merchant);
  if (currentAttempt >= maxAttempts) return null;
  const retryIndex = currentAttempt - 1;
  const attempt = getRetryAttemptForIndex(automation, retryIndex);
  if (attempt) return attempt.delayHours * 60 * 60 * 1000;
  if (currentAttempt === 1) return (merchant.waAttempt2DelayHours || 4) * 60 * 60 * 1000;
  if (currentAttempt === 2) return (merchant.waAttempt3DelayHours || 12) * 60 * 60 * 1000;
  return null;
}

const WA_PERMANENT_ERROR_RE = /\(#100\)|\(#131008\)|\(#132000\)|\(#132001\)|\(#132018\)/;

async function hasInboundMessageWithin24h(formattedPhone: string, merchantId: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [conv] = await db.select({ id: waConversations.id })
      .from(waConversations)
      .where(and(
        eq(waConversations.merchantId, merchantId),
        eq(waConversations.contactPhone, formattedPhone),
      ))
      .limit(1);

    if (!conv) return false;

    const [recentInbound] = await db.select({ id: waMessages.id })
      .from(waMessages)
      .where(and(
        eq(waMessages.conversationId, conv.id),
        eq(waMessages.direction, "inbound"),
        gte(waMessages.createdAt, since),
      ))
      .limit(1);

    return !!recentInbound;
  } catch (err: any) {
    console.warn(`${LOG_PREFIX} Failed to check 24h inbound window for ${formattedPhone}:`, err.message);
    return false;
  }
}

async function sendWaReminderViaTemplate(
  formattedPhone: string,
  templateName: string,
  order: any,
  merchant: any,
): Promise<{ sent: boolean; permanentError?: boolean; error?: string; templateUsed?: string | null }> {
  try {
    const result = await sendWhatsAppApiRequest({
      formattedPhone,
      templateName,
      messageText: "",
      orderNumber: order.orderNumber,
      phoneNumberId: merchant.waPhoneNumberId || undefined,
      accessToken: merchant.waAccessToken || undefined,
    });

    if (result.success) {
      console.log(`${LOG_PREFIX} WA reminder sent for order #${order.orderNumber} (template: ${templateName})`);

      // Save to agent chat so agents can see what was sent
      try {
        const [metaTpl] = await db.select({ body: waMetaTemplates.body })
          .from(waMetaTemplates)
          .where(and(
            eq(waMetaTemplates.merchantId, order.merchantId),
            eq(waMetaTemplates.name, templateName),
          ))
          .limit(1);
        const vars = buildVarsFromParams({
          customerName: order.customerName || "",
          orderNumber: order.orderNumber || "",
          fromStatus: "NEW",
          toStatus: "NEW",
          totalAmount: order.totalAmount,
          courierName: order.courierName,
          courierTracking: order.courierTracking,
          itemSummary: order.itemSummary,
          city: order.city,
          shippingAddress: order.shippingAddress,
        });
        const params = metaTpl?.body ? buildTemplateParamsFromBody(metaTpl.body, vars) : null;
        const displayText = metaTpl?.body
          ? (params?.length
            ? metaTpl.body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[parseInt(n) - 1] ?? `{{${n}}}`)
            : metaTpl.body)
          : `[Template: ${templateName}]`;
        const conv = await storage.upsertConversation({
          merchantId: order.merchantId,
          contactPhone: formattedPhone,
          contactName: order.customerName || undefined,
          orderId: order.id,
          orderNumber: order.orderNumber,
          lastMessage: displayText.slice(0, 200),
        });
        await storage.createWaMessage({
          conversationId: conv.id,
          direction: "outbound",
          senderName: "System",
          text: displayText,
          status: "sent",
        });
      } catch (saveErr: any) {
        console.warn(`${LOG_PREFIX} Failed to save reminder to chat for order #${order.orderNumber}:`, saveErr.message);
      }

      return { sent: true, templateUsed: templateName };
    }

    if (result.notOnWhatsApp) {
      console.warn(`${LOG_PREFIX} Number not on WhatsApp for order #${order.orderNumber} — flagging`);
      await db.update(orders).set({
        waNotOnWhatsApp: true,
        waNextAttemptAt: null,
      }).where(eq(orders.id, order.id));
      return { sent: false, error: result.error };
    }

    const isPermanent = WA_PERMANENT_ERROR_RE.test(result.error || "");
    console.error(`${LOG_PREFIX} WA reminder failed for order #${order.orderNumber}: ${result.error}${isPermanent ? " (permanent)" : ""}`);
    return { sent: false, permanentError: isPermanent, error: result.error };
  } catch (err: any) {
    console.error(`${LOG_PREFIX} WA reminder error for order #${order.orderNumber}:`, err.message);
    return { sent: false, error: err.message };
  }
}

async function sendWaReminder(order: any, merchant: any, automation: any, attemptNumber: number): Promise<{ sent: boolean; permanentError?: boolean; error?: string; templateUsed?: string | null }> {
  const formattedPhone = formatPhoneForWhatsApp(order.customerPhone);
  if (!formattedPhone) return { sent: false };

  const retryIndex = attemptNumber - 2;
  const retryAttempt = retryIndex >= 0 ? getRetryAttemptForIndex(automation, retryIndex) : null;

  if (retryAttempt) {
    if (retryAttempt.templateName?.trim()) {
      console.log(`${LOG_PREFIX} Retry attempt ${attemptNumber} using template "${retryAttempt.templateName}" for order #${order.orderNumber}`);
      return sendWaReminderViaTemplate(formattedPhone, retryAttempt.templateName.trim(), order, merchant);
    }

    const fallbackTemplate = attemptNumber === 1
      ? merchant.waConfirmTemplate1 || null
      : attemptNumber === 2
      ? merchant.waConfirmTemplate2 || null
      : attemptNumber === 3
      ? merchant.waConfirmTemplate3 || null
      : null;
    if (fallbackTemplate) {
      console.log(`${LOG_PREFIX} Retry attempt ${attemptNumber} has no templateName — falling back to merchant global template "${fallbackTemplate}" for order #${order.orderNumber}`);
      return sendWaReminderViaTemplate(formattedPhone, fallbackTemplate, order, merchant);
    }

    const rawText = retryAttempt.messageText?.trim();
    if (!rawText) {
      console.log(`${LOG_PREFIX} Retry attempt ${attemptNumber} has empty message text for order #${order.orderNumber}, skipping`);
      return { sent: false };
    }

    const inWindow = await hasInboundMessageWithin24h(formattedPhone, order.merchantId);
    if (!inWindow) {
      console.warn(`${LOG_PREFIX} Retry attempt ${attemptNumber} for order #${order.orderNumber}: no template available and customer service window is closed — skipping free-form message to avoid WhatsApp rejection`);
      return { sent: false };
    }

    const vars = buildVarsFromParams({
      customerName: order.customerName || "",
      orderNumber: order.orderNumber || "",
      fromStatus: "NEW",
      toStatus: "NEW",
      totalAmount: order.totalAmount,
      courierName: order.courierName,
      courierTracking: order.courierTracking,
      itemSummary: order.itemSummary,
      city: order.city,
      shippingAddress: order.shippingAddress,
    });

    const messageText = interpolateMessageBody(rawText, vars);

    try {
      const result = await sendWhatsAppTextMessage({
        formattedPhone,
        messageText,
        orderNumber: order.orderNumber,
        phoneNumberId: merchant.waPhoneNumberId || undefined,
        accessToken: merchant.waAccessToken || undefined,
      });

      if (result.success) {
        console.log(`${LOG_PREFIX} WA reminder #${attemptNumber} sent (plain text, 24h window open) for order #${order.orderNumber}`);

        // Save to agent chat so agents can see what was sent
        try {
          const conv = await storage.upsertConversation({
            merchantId: order.merchantId,
            contactPhone: formattedPhone,
            contactName: order.customerName || undefined,
            orderId: order.id,
            orderNumber: order.orderNumber,
            lastMessage: messageText.slice(0, 200),
          });
          await storage.createWaMessage({
            conversationId: conv.id,
            direction: "outbound",
            senderName: "System",
            text: messageText,
            status: "sent",
          });
        } catch (saveErr: any) {
          console.warn(`${LOG_PREFIX} Failed to save plain-text reminder to chat for order #${order.orderNumber}:`, saveErr.message);
        }

        return { sent: true };
      }

      if (result.notOnWhatsApp) {
        console.warn(`${LOG_PREFIX} Number not on WhatsApp for order #${order.orderNumber} — flagging`);
        await db.update(orders).set({
          waNotOnWhatsApp: true,
          waNextAttemptAt: null,
        }).where(eq(orders.id, order.id));
        return { sent: false, error: result.error };
      }

      const isPermanent = WA_PERMANENT_ERROR_RE.test(result.error || "");
      console.error(`${LOG_PREFIX} WA reminder failed for order #${order.orderNumber}: ${result.error}${isPermanent ? " (permanent)" : ""}`);
      return { sent: false, permanentError: isPermanent, error: result.error };
    } catch (err: any) {
      console.error(`${LOG_PREFIX} WA reminder error for order #${order.orderNumber}:`, err.message);
      return { sent: false, error: err.message };
    }
  }

  const templateName = attemptNumber === 1
    ? merchant.waConfirmTemplate1 || null
    : attemptNumber === 2
    ? merchant.waConfirmTemplate2 || null
    : attemptNumber === 3
    ? merchant.waConfirmTemplate3 || null
    : null;

  if (!templateName) {
    console.log(`${LOG_PREFIX} No template configured for attempt ${attemptNumber}, skipping WA reminder for order #${order.orderNumber}`);
    return { sent: false };
  }

  return sendWaReminderViaTemplate(formattedPhone, templateName, order, merchant);
}

async function checkWaReattempts() {
  try {
    const now = new Date();

    const pendingReminders = await withRetry(() => db.select({
      id: orders.id,
      merchantId: orders.merchantId,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      totalAmount: orders.totalAmount,
      workflowStatus: orders.workflowStatus,
      confirmationStatus: orders.confirmationStatus,
      waConfirmationSentAt: orders.waConfirmationSentAt,
      waResponseAt: orders.waResponseAt,
      waAttemptCount: orders.waAttemptCount,
      waNextAttemptAt: orders.waNextAttemptAt,
      waNotOnWhatsApp: orders.waNotOnWhatsApp,
      waAutomationId: orders.waAutomationId,
      courierName: orders.courierName,
      courierTracking: orders.courierTracking,
      city: orders.city,
      shippingAddress: orders.shippingAddress,
      itemSummary: orders.itemSummary,
    }).from(orders)
      .where(and(
        notInArray(orders.workflowStatus, ["CANCELLED", "DELIVERED", "RETURN"]),
        eq(orders.confirmationStatus, "pending"),
        isNull(orders.waResponseAt),
        eq(orders.waNotOnWhatsApp, false),
        isNotNull(orders.waNextAttemptAt),
        lte(orders.waNextAttemptAt, now),
      )), 'confirmTimer-waReattempts');

    if (pendingReminders.length === 0) return;

    console.log(`${LOG_PREFIX} Found ${pendingReminders.length} orders due for WA reattempt`);

    const merchantIds = [...new Set(pendingReminders.map(o => o.merchantId))];
    const merchantMap = new Map<string, any>();
    for (const mId of merchantIds) {
      const [merchant] = await db.select().from(merchants).where(eq(merchants.id, mId)).limit(1);
      if (merchant) merchantMap.set(mId, merchant);
    }

    const automationIds = [...new Set(pendingReminders.map(o => o.waAutomationId).filter(Boolean))] as string[];
    const automationMap = new Map<string, any>();
    for (const aId of automationIds) {
      const [automation] = await db.select().from(waAutomations).where(eq(waAutomations.id, aId)).limit(1);
      if (automation) automationMap.set(aId, automation);
    }

    for (const order of pendingReminders) {
      try {
        const merchant = merchantMap.get(order.merchantId);
        if (!merchant) continue;

        if (merchant.waDisconnected) {
          console.log(`${LOG_PREFIX} WhatsApp disconnected for merchant, skipping reattempt for order #${order.orderNumber}`);
          continue;
        }

        const automation = order.waAutomationId ? automationMap.get(order.waAutomationId) ?? null : null;
        const maxAttempts = getMaxAttempts(automation, merchant);
        const currentAttemptCount = order.waAttemptCount || 0;

        if (currentAttemptCount >= maxAttempts) {
          await db.update(orders).set({
            waNextAttemptAt: null,
            updatedAt: now,
          }).where(eq(orders.id, order.id));

          await logConfirmationEvent({
            merchantId: order.merchantId,
            orderId: order.id,
            eventType: "WA_EXHAUSTED",
            channel: "whatsapp",
            oldStatus: "NEW",
            newStatus: "NEW",
            note: `No WhatsApp response after ${maxAttempts} attempts — escalating to RoboCall (order stays in New Orders)`,
          });

          await triggerRobocallForOrder(order, merchant, `WA exhausted (${maxAttempts} attempts) — escalating to RoboCall`);
          console.log(`${LOG_PREFIX} Order #${order.orderNumber}: WA exhausted — escalating to RoboCall (stays in NEW)`);
          continue;
        }

        const nextAttemptNumber = currentAttemptCount + 1;
        const retryAttempt = nextAttemptNumber >= 2 ? getRetryAttemptForIndex(automation, nextAttemptNumber - 2) : null;
        const reminderResult = await sendWaReminder(order, merchant, automation, nextAttemptNumber);

        await db.update(orders).set({
          waAttemptCount: nextAttemptNumber,
          waLastTemplateUsed: reminderResult.templateUsed !== undefined ? reminderResult.templateUsed : (order.waLastTemplateUsed || null),
          updatedAt: now,
        }).where(eq(orders.id, order.id));

        const [freshOrder] = await db.select({
          waNotOnWhatsApp: orders.waNotOnWhatsApp,
        }).from(orders).where(eq(orders.id, order.id)).limit(1);

        if (freshOrder?.waNotOnWhatsApp) {
          await db.update(orders).set({
            waNextAttemptAt: null,
            updatedAt: now,
          }).where(eq(orders.id, order.id));

          await logConfirmationEvent({
            merchantId: order.merchantId,
            orderId: order.id,
            eventType: "WA_NOT_AVAILABLE",
            channel: "whatsapp",
            note: `Number not on WhatsApp (detected on attempt ${nextAttemptNumber}) — bypassing to RoboCall (order stays in New Orders)`,
          });

          await triggerRobocallForOrder(order, merchant, "WhatsApp unavailable — direct bypass to RoboCall");
          continue;
        }

        if (reminderResult.permanentError) {
          await db.update(orders).set({
            waNextAttemptAt: null,
            updatedAt: now,
          }).where(eq(orders.id, order.id));

          await logConfirmationEvent({
            merchantId: order.merchantId,
            orderId: order.id,
            eventType: "WA_PERMANENT_FAILURE",
            channel: "whatsapp",
            errorDetails: reminderResult.error,
            note: `WhatsApp permanent error on attempt ${nextAttemptNumber} — escalating to RoboCall immediately (order stays in New Orders)`,
          });

          await triggerRobocallForOrder(order, merchant, "WhatsApp template/parameter error — immediate bypass to RoboCall");
          console.log(`${LOG_PREFIX} Order #${order.orderNumber}: WA permanent error on attempt ${nextAttemptNumber}, bypassed to RoboCall (stays in NEW)`);
          continue;
        }

        if (reminderResult.sent) {
          const nextDelay = getNextAttemptDelay(automation, merchant, nextAttemptNumber);
          const nextAttemptAt = nextDelay ? new Date(Date.now() + nextDelay) : null;

          await db.update(orders).set({
            waNextAttemptAt: nextAttemptAt,
          }).where(eq(orders.id, order.id));

          await logConfirmationEvent({
            merchantId: order.merchantId,
            orderId: order.id,
            eventType: "WA_REMINDER_SENT",
            channel: "whatsapp",
            retryCount: nextAttemptNumber,
            note: reminderResult.templateUsed
              ? `WhatsApp follow-up reminder #${nextAttemptNumber} sent (Template: ${reminderResult.templateUsed})`
              : retryAttempt
              ? `WhatsApp follow-up reminder #${nextAttemptNumber} sent (plain text, 24h window)`
              : `WhatsApp reminder #${nextAttemptNumber} sent (Template: ${merchant[`waConfirmTemplate${nextAttemptNumber}`]})`,
          });

          if (!nextAttemptAt) {
            console.log(`${LOG_PREFIX} Order #${order.orderNumber}: WA attempt ${nextAttemptNumber}/${maxAttempts} (final)`);
          } else {
            console.log(`${LOG_PREFIX} Order #${order.orderNumber}: WA attempt ${nextAttemptNumber}/${maxAttempts}, next at ${nextAttemptAt.toISOString()}`);
          }
        } else {
          if (nextAttemptNumber >= maxAttempts) {
            await db.update(orders).set({
              waNextAttemptAt: null,
            }).where(eq(orders.id, order.id));
            console.log(`${LOG_PREFIX} Order #${order.orderNumber}: WA attempt ${nextAttemptNumber}/${maxAttempts} failed (final, will escalate)`);
          } else {
            const nextDelay = getNextAttemptDelay(automation, merchant, nextAttemptNumber);
            const nextAttemptAt = nextDelay ? new Date(Date.now() + nextDelay) : new Date(Date.now() + 30 * 60 * 1000);
            await db.update(orders).set({
              waNextAttemptAt: nextAttemptAt,
            }).where(eq(orders.id, order.id));
            console.log(`${LOG_PREFIX} Order #${order.orderNumber}: WA attempt ${nextAttemptNumber}/${maxAttempts} failed, retry at ${nextAttemptAt.toISOString()}`);
          }
        }
      } catch (err: any) {
        console.error(`${LOG_PREFIX} Failed to process WA reattempt for order ${order.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} WA reattempt check failed:`, err.message);
  }
}

async function checkExhaustedWaOrders() {
  try {
    const now = new Date();

    const exhaustedOrders = await withRetry(() => db.select({
      id: orders.id,
      merchantId: orders.merchantId,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      totalAmount: orders.totalAmount,
      waAttemptCount: orders.waAttemptCount,
      waNextAttemptAt: orders.waNextAttemptAt,
      waAutomationId: orders.waAutomationId,
    }).from(orders)
      .where(and(
        notInArray(orders.workflowStatus, ["CANCELLED", "DELIVERED", "RETURN"]),
        eq(orders.confirmationStatus, "pending"),
        isNull(orders.waResponseAt),
        isNull(orders.waNextAttemptAt),
        eq(orders.waNotOnWhatsApp, false),
      )), 'confirmTimer-exhaustedOrders');

    if (exhaustedOrders.length === 0) return;

    const allOrderIds = exhaustedOrders.map(o => o.id);

    const existingRobocallLogs = await db.selectDistinct({ orderId: robocallLogs.orderId })
      .from(robocallLogs)
      .where(inArray(robocallLogs.orderId, allOrderIds));
    const ordersWithRobocallActivity = new Set(existingRobocallLogs.map(r => r.orderId).filter(Boolean));

    const merchantIds = [...new Set(exhaustedOrders.map(o => o.merchantId))];
    const merchantMap = new Map<string, any>();
    for (const mId of merchantIds) {
      const [merchant] = await db.select().from(merchants).where(eq(merchants.id, mId)).limit(1);
      if (merchant) merchantMap.set(mId, merchant);
    }

    const automationIds = [...new Set(exhaustedOrders.map(o => o.waAutomationId).filter(Boolean))] as string[];
    const automationMap = new Map<string, any>();
    for (const aId of automationIds) {
      const [automation] = await db.select().from(waAutomations).where(eq(waAutomations.id, aId)).limit(1);
      if (automation) automationMap.set(aId, automation);
    }

    for (const order of exhaustedOrders) {
      if (ordersWithRobocallActivity.has(order.id)) {
        continue;
      }

      const merchant = merchantMap.get(order.merchantId);
      if (!merchant) continue;

      const automation = order.waAutomationId ? automationMap.get(order.waAutomationId) ?? null : null;
      const maxAttempts = getMaxAttempts(automation, merchant);
      if ((order.waAttemptCount || 0) < maxAttempts) continue;

      try {
        await logConfirmationEvent({
          merchantId: order.merchantId,
          orderId: order.id,
          eventType: "WA_EXHAUSTED",
          channel: "whatsapp",
          oldStatus: "NEW",
          newStatus: "NEW",
          note: `No WhatsApp response after ${maxAttempts} attempts — escalating to RoboCall (order stays in New Orders)`,
        });

        await triggerRobocallForOrder(order, merchant, `WA exhausted (${maxAttempts} attempts) — escalating to RoboCall`);
        console.log(`${LOG_PREFIX} Order #${order.orderNumber}: WA exhausted — escalating to RoboCall (stays in NEW)`);
      } catch (err: any) {
        console.error(`${LOG_PREFIX} Failed to process exhausted WA order ${order.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Exhausted WA orders check failed:`, err.message);
  }
}

async function checkRobocallsForMerchants() {
  try {
    let offset = 0;
    const batchSize = 50;
    while (true) {
      const batch = await db.select({ id: merchants.id }).from(merchants).limit(batchSize).offset(offset);
      if (batch.length === 0) break;
      for (const m of batch) {
        try {
          await checkAndSendPendingCalls(m.id);
          await retryFailedCalls(m.id);
        } catch (err: any) {
          console.error(`${LOG_PREFIX} Robocall check failed for merchant ${m.id}:`, err.message);
        }
      }
      if (batch.length < batchSize) break;
      offset += batchSize;
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Robocall merchant loop failed:`, err.message);
  }
}

async function checkOrphanedConfirmations() {
  try {
    const now = new Date();

    const orphaned = await withRetry(() => db.select({
      id: orders.id,
      merchantId: orders.merchantId,
      orderNumber: orders.orderNumber,
      waAttemptCount: orders.waAttemptCount,
      waAutomationId: orders.waAutomationId,
    }).from(orders)
      .where(and(
        notInArray(orders.workflowStatus, ["CANCELLED", "DELIVERED", "RETURN"]),
        eq(orders.confirmationStatus, "pending"),
        isNotNull(orders.waConfirmationSentAt),
        isNull(orders.waNextAttemptAt),
        isNull(orders.waResponseAt),
        eq(orders.waNotOnWhatsApp, false),
      )), 'confirmTimer-orphanedConfirmations');

    if (orphaned.length === 0) return;

    const merchantIds = [...new Set(orphaned.map(o => o.merchantId))];
    const merchantMap = new Map<string, any>();
    for (const mId of merchantIds) {
      const [merchant] = await db.select().from(merchants).where(eq(merchants.id, mId)).limit(1);
      if (merchant) merchantMap.set(mId, merchant);
    }

    const automationIds = [...new Set(orphaned.map(o => o.waAutomationId).filter(Boolean))] as string[];
    const automationMap = new Map<string, any>();
    for (const aId of automationIds) {
      const [automation] = await db.select().from(waAutomations).where(eq(waAutomations.id, aId)).limit(1);
      if (automation) automationMap.set(aId, automation);
    }

    let rescheduled = 0;
    for (const order of orphaned) {
      try {
        const merchant = merchantMap.get(order.merchantId);
        if (!merchant) continue;

        const automation = order.waAutomationId ? automationMap.get(order.waAutomationId) ?? null : null;
        const maxAttempts = getMaxAttempts(automation, merchant);
        const currentAttemptCount = order.waAttemptCount || 0;

        if (currentAttemptCount >= maxAttempts) continue;

        await db.update(orders).set({
          waNextAttemptAt: new Date(now.getTime() - 1000),
          updatedAt: now,
        }).where(eq(orders.id, order.id));

        rescheduled++;
      } catch (err: any) {
        console.error(`${LOG_PREFIX} Failed to reschedule orphaned order ${order.id}:`, err.message);
      }
    }

    if (rescheduled > 0) {
      console.log(`${LOG_PREFIX} Rescheduled ${rescheduled} orphaned WA confirmation(s) for immediate follow-up`);
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Orphaned confirmation check failed:`, err.message);
  }
}

async function checkPendingOrders() {
  try {
    await checkOrphanedConfirmations();
    await checkWaReattempts();
    await checkExhaustedWaOrders();
    await checkRobocallsForMerchants();
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Check failed:`, err.message);
  }
}

let timerInterval: ReturnType<typeof setInterval> | null = null;

export function startConfirmationTimer() {
  if (timerInterval) return;
  console.log(`${LOG_PREFIX} Started — checking every ${CHECK_INTERVAL_MS / 60000} minutes`);
  timerInterval = setInterval(checkPendingOrders, CHECK_INTERVAL_MS);
  setTimeout(checkPendingOrders, 30_000);
}

export function stopConfirmationTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    console.log(`${LOG_PREFIX} Stopped`);
  }
}
