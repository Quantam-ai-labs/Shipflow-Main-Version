import { db, withRetry } from "../db";
import { orders, merchants, robocallQueue } from "@shared/schema";
import { eq, and, lt, or, isNull, isNotNull, lte } from "drizzle-orm";
import { logConfirmationEvent, createNotification } from "./confirmationEngine";
import { formatPhoneForWhatsApp } from "../utils/integrations/whatsapp/sender";
import { sendWhatsAppApiRequest } from "../utils/integrations/whatsapp/sender";

const LOG_PREFIX = "[ConfirmationTimer]";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

function isWithinCallWindow(startTime: string, endTime: string): boolean {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

function getNextCallWindowStart(startTime: string): Date {
  const [startH, startM] = startTime.split(":").map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(startH, startM, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

async function queueOrderForRobocall(order: any, merchant: any, reason: string) {
  if (merchant?.robocallDisconnected) {
    console.log(`[ConfirmationTimer] RoboCall disconnected for merchant, skipping queue for order #${order.orderNumber}`);
    return;
  }
  if (!merchant?.robocallEmail || !merchant?.robocallApiKey || !order.customerPhone) return;

  const formattedPhone = formatPhoneForWhatsApp(order.customerPhone);
  if (!formattedPhone) return;

  const startTime = merchant.robocallStartTime || "10:00";
  const endTime = merchant.robocallEndTime || "20:00";
  const withinWindow = isWithinCallWindow(startTime, endTime);
  const scheduledAt = withinWindow ? new Date() : getNextCallWindowStart(startTime);

  const existingQueue = await db.select({ id: robocallQueue.id }).from(robocallQueue)
    .where(and(
      eq(robocallQueue.orderId, order.id),
      eq(robocallQueue.status, "waiting"),
    )).limit(1);

  if (existingQueue.length > 0) return;

  await db.insert(robocallQueue).values({
    merchantId: order.merchantId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    phone: formattedPhone,
    amount: order.totalAmount,
    brandName: merchant.name,
    status: "waiting",
    reason: withinWindow ? reason : `${reason} — scheduled for next call window (${startTime})`,
    scheduledAt,
    attemptCount: 0,
    maxAttempts: merchant.robocallMaxAttempts ?? 3,
    waResponseArrived: false,
  });

  await logConfirmationEvent({
    merchantId: order.merchantId,
    orderId: order.id,
    eventType: "CALL_QUEUED",
    note: withinWindow
      ? `RoboCall queued — ${reason}`
      : `RoboCall queued — scheduled for ${scheduledAt.toISOString()} (${reason})`,
  });
}

function getTemplateForAttempt(merchant: any, attemptNumber: number): string | null {
  if (attemptNumber === 1) return merchant.waConfirmTemplate1 || null;
  if (attemptNumber === 2) return merchant.waConfirmTemplate2 || null;
  if (attemptNumber === 3) return merchant.waConfirmTemplate3 || null;
  return null;
}

function getNextAttemptDelay(merchant: any, currentAttempt: number): number | null {
  const maxAttempts = merchant.waMaxAttempts ?? 3;
  if (currentAttempt >= maxAttempts) return null;

  if (currentAttempt === 1) {
    return (merchant.waAttempt2DelayHours || 4) * 60 * 60 * 1000;
  }
  if (currentAttempt === 2) {
    return (merchant.waAttempt3DelayHours || 12) * 60 * 60 * 1000;
  }
  return null;
}

const WA_PERMANENT_ERROR_RE = /\(#100\)|\(#131008\)|\(#132000\)|\(#132001\)|\(#132018\)/;

async function sendWaReminder(order: any, merchant: any, attemptNumber: number): Promise<{ sent: boolean; permanentError?: boolean; error?: string }> {
  const formattedPhone = formatPhoneForWhatsApp(order.customerPhone);
  if (!formattedPhone) return { sent: false };

  const templateName = getTemplateForAttempt(merchant, attemptNumber);
  if (!templateName) {
    console.log(`${LOG_PREFIX} No template configured for attempt ${attemptNumber}, skipping WA reminder for order #${order.orderNumber}`);
    return { sent: false };
  }

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
      console.log(`${LOG_PREFIX} WA reminder #${attemptNumber} sent for order #${order.orderNumber} (template: ${templateName})`);
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
    }).from(orders)
      .where(and(
        eq(orders.workflowStatus, "NEW"),
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

    for (const order of pendingReminders) {
      try {
        const merchant = merchantMap.get(order.merchantId);
        if (!merchant) continue;

        if (merchant.waDisconnected) {
          console.log(`${LOG_PREFIX} WhatsApp disconnected for merchant, skipping reattempt for order #${order.orderNumber}`);
          continue;
        }

        const maxAttempts = merchant.waMaxAttempts ?? 3;
        const currentAttemptCount = order.waAttemptCount || 0;

        if (currentAttemptCount >= maxAttempts) {
          await db.update(orders).set({
            workflowStatus: "PENDING",
            previousWorkflowStatus: "NEW",
            pendingReason: `No WhatsApp response after ${maxAttempts} attempts`,
            pendingReasonType: "confirmation_pending",
            lastStatusChangedAt: now,
            waNextAttemptAt: null,
            updatedAt: now,
          }).where(eq(orders.id, order.id));

          await logConfirmationEvent({
            merchantId: order.merchantId,
            orderId: order.id,
            eventType: "MOVED_TO_PENDING",
            oldStatus: "NEW",
            newStatus: "PENDING",
            note: `No WhatsApp response after ${maxAttempts} attempts — moved to Confirmation Pending`,
          });

          await queueOrderForRobocall(order, merchant, `WA exhausted (${maxAttempts} attempts) — escalating to RoboCall`);
          console.log(`${LOG_PREFIX} Order #${order.orderNumber} → Confirmation Pending (WA attempts exhausted)`);
          continue;
        }

        const nextAttemptNumber = currentAttemptCount + 1;
        const templateName = getTemplateForAttempt(merchant, nextAttemptNumber);
        const reminderResult = await sendWaReminder(order, merchant, nextAttemptNumber);

        await db.update(orders).set({
          waAttemptCount: nextAttemptNumber,
          waLastTemplateUsed: templateName || order.waLastTemplateUsed,
          updatedAt: now,
        }).where(eq(orders.id, order.id));

        const [freshOrder] = await db.select({
          waNotOnWhatsApp: orders.waNotOnWhatsApp,
        }).from(orders).where(eq(orders.id, order.id)).limit(1);

        if (freshOrder?.waNotOnWhatsApp) {
          await db.update(orders).set({
            workflowStatus: "PENDING",
            previousWorkflowStatus: "NEW",
            pendingReason: "Number not on WhatsApp — routed to RoboCall",
            pendingReasonType: "confirmation_pending",
            lastStatusChangedAt: now,
            waNextAttemptAt: null,
            updatedAt: now,
          }).where(eq(orders.id, order.id));

          await logConfirmationEvent({
            merchantId: order.merchantId,
            orderId: order.id,
            eventType: "WA_NOT_AVAILABLE",
            channel: "whatsapp",
            note: `Number not on WhatsApp (detected on attempt ${nextAttemptNumber}) — bypassing to RoboCall`,
          });

          await queueOrderForRobocall(order, merchant, "WhatsApp unavailable — direct bypass to RoboCall");
          continue;
        }

        if (reminderResult.permanentError) {
          await db.update(orders).set({
            workflowStatus: "PENDING",
            previousWorkflowStatus: "NEW",
            pendingReason: "WhatsApp template error — routed to RoboCall",
            pendingReasonType: "confirmation_pending",
            lastStatusChangedAt: now,
            waNextAttemptAt: null,
            updatedAt: now,
          }).where(eq(orders.id, order.id));

          await logConfirmationEvent({
            merchantId: order.merchantId,
            orderId: order.id,
            eventType: "WA_PERMANENT_FAILURE",
            channel: "whatsapp",
            errorDetails: reminderResult.error,
            note: `WhatsApp permanent error on attempt ${nextAttemptNumber} — escalating to RoboCall immediately`,
          });

          await queueOrderForRobocall(order, merchant, "WhatsApp template/parameter error — immediate bypass to RoboCall");
          console.log(`${LOG_PREFIX} Order #${order.orderNumber}: WA permanent error on attempt ${nextAttemptNumber}, bypassed to RoboCall`);
          continue;
        }

        if (reminderResult.sent) {
          const nextDelay = getNextAttemptDelay(merchant, nextAttemptNumber);
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
            note: `WhatsApp reminder #${nextAttemptNumber} sent (Template: ${templateName})`,
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
            const nextDelay = getNextAttemptDelay(merchant, nextAttemptNumber);
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
    }).from(orders)
      .where(and(
        eq(orders.workflowStatus, "NEW"),
        eq(orders.confirmationStatus, "pending"),
        isNull(orders.waResponseAt),
        isNull(orders.waNextAttemptAt),
        eq(orders.waNotOnWhatsApp, false),
      )), 'confirmTimer-exhaustedOrders');

    if (exhaustedOrders.length === 0) return;

    const merchantIds = [...new Set(exhaustedOrders.map(o => o.merchantId))];
    const merchantMap = new Map<string, any>();
    for (const mId of merchantIds) {
      const [merchant] = await db.select().from(merchants).where(eq(merchants.id, mId)).limit(1);
      if (merchant) merchantMap.set(mId, merchant);
    }

    for (const order of exhaustedOrders) {
      const merchant = merchantMap.get(order.merchantId);
      if (!merchant) continue;
      const maxAttempts = merchant.waMaxAttempts ?? 3;
      if ((order.waAttemptCount || 0) < maxAttempts) continue;

      try {
        await db.update(orders).set({
          workflowStatus: "PENDING",
          previousWorkflowStatus: "NEW",
          pendingReason: `No WhatsApp response after ${maxAttempts} attempts`,
          pendingReasonType: "confirmation_pending",
          lastStatusChangedAt: now,
          updatedAt: now,
        }).where(eq(orders.id, order.id));

        await logConfirmationEvent({
          merchantId: order.merchantId,
          orderId: order.id,
          eventType: "MOVED_TO_PENDING",
          oldStatus: "NEW",
          newStatus: "PENDING",
          note: `No WhatsApp response after ${maxAttempts} attempts — moved to Confirmation Pending`,
        });

        await queueOrderForRobocall(order, merchant, `WA exhausted (${maxAttempts} attempts) — escalating to RoboCall`);
        console.log(`${LOG_PREFIX} Order #${order.orderNumber} → Confirmation Pending (WA exhausted, no nextAttemptAt)`);
      } catch (err: any) {
        console.error(`${LOG_PREFIX} Failed to process exhausted WA order ${order.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Exhausted WA orders check failed:`, err.message);
  }
}

async function checkPendingOrders() {
  try {
    await checkWaReattempts();
    await checkExhaustedWaOrders();
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
