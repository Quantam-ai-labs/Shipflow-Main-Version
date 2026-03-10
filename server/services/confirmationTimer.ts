import { db } from "../db";
import { orders, merchants, robocallQueue } from "@shared/schema";
import { eq, and, lt, or, isNull, isNotNull } from "drizzle-orm";
import { logConfirmationEvent, createNotification } from "./confirmationEngine";
import { formatPhoneForWhatsApp } from "../utils/integrations/whatsapp/sender";

const LOG_PREFIX = "[ConfirmationTimer]";
const PENDING_TIMEOUT_HOURS = 12;
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

async function checkPendingOrders() {
  try {
    const cutoff = new Date(Date.now() - PENDING_TIMEOUT_HOURS * 60 * 60 * 1000);

    const pendingOrders = await db.select({
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
    }).from(orders)
      .where(and(
        eq(orders.workflowStatus, "NEW"),
        eq(orders.confirmationStatus, "pending"),
        isNull(orders.waResponseAt),
        or(
          lt(orders.waConfirmationSentAt, cutoff),
          and(isNull(orders.waConfirmationSentAt), lt(orders.createdAt, cutoff)),
        ),
      ));

    if (pendingOrders.length === 0) return;

    console.log(`${LOG_PREFIX} Found ${pendingOrders.length} orders past ${PENDING_TIMEOUT_HOURS}h timeout`);

    const merchantIds = [...new Set(pendingOrders.map(o => o.merchantId))];
    const merchantMap = new Map<string, any>();
    for (const mId of merchantIds) {
      const [merchant] = await db.select().from(merchants).where(eq(merchants.id, mId)).limit(1);
      if (merchant) merchantMap.set(mId, merchant);
    }

    for (const order of pendingOrders) {
      try {
        await db.update(orders).set({
          workflowStatus: "PENDING",
          previousWorkflowStatus: "NEW",
          pendingReason: "No WhatsApp response within 12 hours",
          pendingReasonType: "confirmation_pending",
          lastStatusChangedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(orders.id, order.id));

        await logConfirmationEvent({
          merchantId: order.merchantId,
          orderId: order.id,
          eventType: "MOVED_TO_PENDING",
          oldStatus: "NEW",
          newStatus: "PENDING",
          note: `No WhatsApp response after ${PENDING_TIMEOUT_HOURS} hours — moved to Confirmation Pending`,
        });

        const merchant = merchantMap.get(order.merchantId);
        if (merchant?.robocallEmail && merchant?.robocallApiKey && order.customerPhone) {
          const formattedPhone = formatPhoneForWhatsApp(order.customerPhone);
          if (formattedPhone) {
            const startTime = merchant.robocallStartTime || "10:00";
            const endTime = merchant.robocallEndTime || "20:00";
            const withinWindow = isWithinCallWindow(startTime, endTime);
            const scheduledAt = withinWindow ? new Date() : getNextCallWindowStart(startTime);

            const existingQueue = await db.select({ id: robocallQueue.id }).from(robocallQueue)
              .where(and(
                eq(robocallQueue.orderId, order.id),
                eq(robocallQueue.status, "waiting"),
              )).limit(1);

            if (existingQueue.length === 0) {
              await db.insert(robocallQueue).values({
                merchantId: order.merchantId,
                orderId: order.id,
                orderNumber: order.orderNumber,
                customerName: order.customerName,
                phone: formattedPhone,
                amount: order.totalAmount,
                brandName: merchant.name,
                status: "waiting",
                reason: withinWindow ? "12h timeout — ready to call" : `12h timeout — scheduled for next call window (${startTime})`,
                scheduledAt,
                attemptCount: 0,
                waResponseArrived: false,
              });

              await logConfirmationEvent({
                merchantId: order.merchantId,
                orderId: order.id,
                eventType: "CALL_QUEUED",
                note: withinWindow
                  ? "RoboCall queued — within allowed time window"
                  : `RoboCall queued — scheduled for ${scheduledAt.toISOString()}`,
              });
            }
          }
        }

        console.log(`${LOG_PREFIX} Order #${order.orderNumber} → Confirmation Pending`);
      } catch (err: any) {
        console.error(`${LOG_PREFIX} Failed to process order ${order.id}:`, err.message);
      }
    }
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
