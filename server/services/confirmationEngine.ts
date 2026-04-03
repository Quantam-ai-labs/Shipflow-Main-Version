import { db, withRetry } from "../db";
import { orders, orderConfirmationLog, notifications } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { transitionOrder } from "./workflowTransition";
import { writeBackConfirmationTags } from "./shopifyWriteBack";
import type { Order } from "@shared/schema";

const LOG_PREFIX = "[ConfirmationEngine]";

const STATUS_TAGS = ["Pending", "Confirm", "Cancel", "Querry"] as const;
const SOURCE_TAGS = [
  "Whatsapp-Pending", "Whatsapp-Confirmed", "Whatsapp-Cancelled", "Whatsapp-Querry",
  "Manual-Confirm", "Manual-Cancel",
  "Robo-Confirmed", "Robo-Cancelled",
] as const;
const ALL_CONFIRMATION_TAGS = [...STATUS_TAGS, ...SOURCE_TAGS];

type ConfirmationSource = "whatsapp" | "robocall" | "manual";
type ConfirmationAction = "confirm" | "cancel" | "query" | "no_response";

interface ConfirmationResult {
  success: boolean;
  action: string;
  newStatus?: string;
  conflict?: boolean;
  locked?: boolean;
  error?: string;
}

function getTagsForAction(source: ConfirmationSource, action: ConfirmationAction): { statusTag: string; sourceTag: string } {
  const map: Record<string, Record<string, { statusTag: string; sourceTag: string }>> = {
    whatsapp: {
      confirm: { statusTag: "Confirm", sourceTag: "Whatsapp-Confirmed" },
      cancel: { statusTag: "Cancel", sourceTag: "Whatsapp-Cancelled" },
      query: { statusTag: "Querry", sourceTag: "Whatsapp-Querry" },
      no_response: { statusTag: "Pending", sourceTag: "Whatsapp-Pending" },
    },
    robocall: {
      confirm: { statusTag: "Confirm", sourceTag: "Robo-Confirmed" },
      cancel: { statusTag: "Cancel", sourceTag: "Robo-Cancelled" },
      no_response: { statusTag: "Pending", sourceTag: "Whatsapp-Pending" },
      query: { statusTag: "Querry", sourceTag: "Whatsapp-Querry" },
    },
    manual: {
      confirm: { statusTag: "Confirm", sourceTag: "Manual-Confirm" },
      cancel: { statusTag: "Cancel", sourceTag: "Manual-Cancel" },
      no_response: { statusTag: "Pending", sourceTag: "Whatsapp-Pending" },
      query: { statusTag: "Querry", sourceTag: "Whatsapp-Querry" },
    },
  };
  return map[source]?.[action] || { statusTag: "Pending", sourceTag: "Whatsapp-Pending" };
}

function replaceConfirmationTags(existingTags: string[], newStatusTag: string, newSourceTag: string): string[] {
  const filtered = (existingTags || []).filter(
    (t) => !ALL_CONFIRMATION_TAGS.some((ct) => ct.toLowerCase() === t.toLowerCase())
  );
  filtered.push(newStatusTag, newSourceTag);
  return filtered;
}

export async function logConfirmationEvent(params: {
  merchantId: string;
  orderId: string;
  eventType: string;
  channel?: string;
  oldStatus?: string;
  newStatus?: string;
  oldTags?: string[];
  newTags?: string[];
  responsePayload?: any;
  responseClassification?: string;
  actingUserId?: string;
  retryCount?: number;
  queueInfo?: any;
  apiResponse?: any;
  errorDetails?: string;
  note?: string;
}): Promise<void> {
  try {
    await db.insert(orderConfirmationLog).values({
      merchantId: params.merchantId,
      orderId: params.orderId,
      eventType: params.eventType,
      channel: params.channel || null,
      oldStatus: params.oldStatus || null,
      newStatus: params.newStatus || null,
      oldTags: params.oldTags || null,
      newTags: params.newTags || null,
      responsePayload: params.responsePayload || null,
      responseClassification: params.responseClassification || null,
      actingUserId: params.actingUserId || null,
      retryCount: params.retryCount ?? null,
      queueInfo: params.queueInfo || null,
      apiResponse: params.apiResponse || null,
      errorDetails: params.errorDetails || null,
      note: params.note || null,
    });
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Failed to log event:`, err.message);
  }
}

const NOTIFICATION_CATEGORY_MAP: Record<string, { category: string; resolvable: boolean }> = {
  late_response:                { category: "confirmation", resolvable: true },
  conflict_detected:            { category: "confirmation", resolvable: true },
  robocall_exhausted:           { category: "confirmation", resolvable: true },
  hold_reminder:                { category: "confirmation", resolvable: true },
  confirmation_failed:          { category: "confirmation", resolvable: true },
  shopify_writeback_failed:     { category: "other",        resolvable: false },
  urgent_cancellation_request:  { category: "chat",         resolvable: true },
  ai_urgent_request:            { category: "chat",         resolvable: true },
  ai_conflict:                  { category: "chat",         resolvable: true },
  ai_lead:                      { category: "chat",         resolvable: true },
  ai_human_handoff:             { category: "chat",         resolvable: true },
  ai_complaint:                 { category: "chat",         resolvable: true },
  ai_replacement:               { category: "chat",         resolvable: true },
  ai_return:                    { category: "chat",         resolvable: true },
};

export async function createNotification(params: {
  merchantId: string;
  type: string;
  title: string;
  message: string;
  orderId?: string;
  orderNumber?: string;
  category?: string;
  resolvable?: boolean;
}): Promise<void> {
  try {
    const defaults = NOTIFICATION_CATEGORY_MAP[params.type] ?? { category: "other", resolvable: false };
    await db.insert(notifications).values({
      merchantId: params.merchantId,
      type: params.type,
      category: params.category ?? defaults.category,
      resolvable: params.resolvable ?? defaults.resolvable,
      title: params.title,
      message: params.message,
      orderId: params.orderId || null,
      orderNumber: params.orderNumber || null,
    });
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Failed to create notification:`, err.message);
  }
}

export async function processConfirmationResponse(params: {
  merchantId: string;
  orderId: string;
  source: ConfirmationSource;
  action: ConfirmationAction;
  payload?: any;
  actingUserId?: string;
  note?: string;
}): Promise<ConfirmationResult> {
  const { merchantId, orderId, source, action, payload, actingUserId, note } = params;

  return withRetry(async () => {
    const [order] = await db.select().from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)));

    if (!order) {
      return { success: false, action, error: "Order not found" };
    }

    const isLocked = order.confirmationLocked || order.workflowStatus === "BOOKED" ||
      order.workflowStatus === "FULFILLED" || order.workflowStatus === "DELIVERED" || order.workflowStatus === "RETURN";

    if (isLocked && source !== "manual") {
      console.log(`${LOG_PREFIX} Order ${order.orderNumber} is locked — ignoring ${source} ${action}`);

      await logConfirmationEvent({
        merchantId, orderId,
        eventType: "LATE_RESPONSE_IGNORED",
        channel: source,
        oldStatus: order.workflowStatus,
        responsePayload: payload,
        responseClassification: action,
        note: `Response ignored: order is ${order.workflowStatus} (locked)`,
      });

      await createNotification({
        merchantId,
        type: "late_response",
        title: `Late ${source} response on #${order.orderNumber}`,
        message: `Customer pressed "${action}" via ${source} after order was already ${order.workflowStatus}. Response was ignored.`,
        orderId,
        orderNumber: order.orderNumber,
      });

      return { success: false, action, locked: true, error: "Order is locked after booking" };
    }

    if (action === "query") {
      const { statusTag, sourceTag } = getTagsForAction(source, action);
      const oldTags = (order.tags as string[]) || [];
      const newTags = replaceConfirmationTags(oldTags, statusTag, sourceTag);

      await db.update(orders).set({
        tags: newTags,
        updatedAt: new Date(),
      }).where(eq(orders.id, orderId));

      await logConfirmationEvent({
        merchantId, orderId,
        eventType: "WA_RESPONSE",
        channel: source,
        oldStatus: order.workflowStatus,
        newStatus: order.workflowStatus,
        oldTags, newTags,
        responsePayload: payload,
        responseClassification: "query",
        note: "Customer sent a question/message — not confirm or cancel",
      });

      if (order.shopifyOrderId) {
        writeBackConfirmationTags(merchantId, order.shopifyOrderId, oldTags, newTags)
          .catch(e => console.error(`${LOG_PREFIX} Tag write-back error:`, e));
      }

      return { success: true, action: "query", newStatus: order.workflowStatus };
    }

    const now = new Date();
    const responseCount = (order.confirmationResponseCount || 0) + 1;
    const previousAction = order.confirmationStatus;
    const hasConflict = source !== "whatsapp" && responseCount > 1 &&
      ((previousAction === "confirmed" && action === "cancel") ||
       (previousAction === "cancelled" && action === "confirm") ||
       (previousAction === "manual_confirmed" && action === "cancel") ||
       (previousAction === "manual_cancelled" && action === "confirm"));

    const { statusTag, sourceTag } = getTagsForAction(source, action);
    const oldTags = (order.tags as string[]) || [];
    const newTags = replaceConfirmationTags(oldTags, statusTag, sourceTag);

    let targetStatus: string;
    let confirmationStatusValue: string;

    if (hasConflict) {
      targetStatus = "HOLD";
      confirmationStatusValue = action === "confirm" ? "confirmed" : "cancelled";

      await createNotification({
        merchantId,
        type: "conflict_detected",
        title: `Conflicting response on #${order.orderNumber}`,
        message: `Customer previously ${previousAction}, now pressed "${action}" via ${source}. Order moved to Hold for manual review.`,
        orderId,
        orderNumber: order.orderNumber,
      });
    } else if (action === "confirm") {
      targetStatus = "READY_TO_SHIP";
      confirmationStatusValue = "confirmed";
    } else {
      targetStatus = "CANCELLED";
      confirmationStatusValue = "cancelled";
    }

    const updateData: any = {
      tags: newTags,
      confirmationStatus: confirmationStatusValue,
      confirmationSource: source,
      confirmationResponseCount: responseCount,
      conflictDetected: hasConflict || order.conflictDetected,
      updatedAt: now,
    };

    if (!hasConflict) {
      if (action === "confirm") {
        updateData.confirmedAt = now;
      } else if (action === "cancel") {
        updateData.cancelledAt = now;
      }
    }

    if (source === "whatsapp") {
      updateData.waResponseAt = now;
      updateData.waResponsePayload = payload;
    } else if (source === "robocall") {
      updateData.roboResponseAt = now;
    }

    if (action === "confirm" || action === "cancel") {
      updateData.waNextAttemptAt = null;
    }

    const skipTransition = order.workflowStatus === targetStatus;

    if (!skipTransition) {
      const transitionResult = await transitionOrder({
        merchantId,
        orderId,
        toStatus: targetStatus,
        action: hasConflict ? "conflict_hold" : `${source}_${action}`,
        actorUserId: actingUserId,
        actorType: source === "manual" ? "user" : "system",
        reason: hasConflict
          ? `Conflicting ${source} response: was ${previousAction}, now ${action}`
          : `${source} ${action}`,
        extraData: updateData,
      });

      if (!transitionResult.success) {
        console.error(`${LOG_PREFIX} Transition failed for ${orderId}: ${transitionResult.error}`);
        await db.update(orders).set({
          waResponseAt: source === "whatsapp" ? now : undefined,
          waNextAttemptAt: null,
        }).where(eq(orders.id, orderId));
        return { success: false, action, error: transitionResult.error };
      }
    } else {
      await db.update(orders).set(updateData).where(eq(orders.id, orderId));
    }

    await logConfirmationEvent({
      merchantId, orderId,
      eventType: source === "whatsapp" ? "WA_RESPONSE" : source === "robocall" ? "CALL_RESPONSE" : "MANUAL_OVERRIDE",
      channel: source,
      oldStatus: order.workflowStatus,
      newStatus: targetStatus,
      oldTags, newTags,
      responsePayload: payload,
      responseClassification: action,
      actingUserId,
      note: hasConflict ? `Conflict: was ${previousAction}, now ${action}. Moved to Hold.` : (note || `${source} ${action}`),
    });

    await logConfirmationEvent({
      merchantId, orderId,
      eventType: "TAGS_WRITTEN",
      channel: source,
      oldTags, newTags,
      note: `Tags updated: ${statusTag}, ${sourceTag}`,
    });

    if (order.shopifyOrderId) {
      writeBackConfirmationTags(merchantId, order.shopifyOrderId, oldTags, newTags)
        .then(result => {
          if (!result.success) {
            console.warn(`${LOG_PREFIX} Shopify tag write-back failed for ${orderId}: ${result.error}`);
            createNotification({
              merchantId,
              type: "shopify_writeback_failed",
              title: `Tag write-back failed for #${order.orderNumber}`,
              message: `Failed to sync tags to Shopify: ${result.error}`,
              orderId,
              orderNumber: order.orderNumber,
            });
          }
        })
        .catch(e => console.error(`${LOG_PREFIX} Tag write-back error:`, e));
    }

    if (action === "confirm" || action === "cancel") {
      if (source === "whatsapp") {
        await logConfirmationEvent({
          merchantId, orderId,
          eventType: "CHANNELS_CANCELLED",
          channel: "whatsapp",
          note: `Automation channels cancelled — WhatsApp ${action} response received`,
        });
      } else if (source === "robocall") {
        await logConfirmationEvent({
          merchantId, orderId,
          eventType: "WA_REMINDERS_CANCELLED",
          channel: "robocall",
          note: `WhatsApp reminders cancelled — RoboCall ${action} response received`,
        });
      } else if (source === "manual") {
        await logConfirmationEvent({
          merchantId, orderId,
          eventType: "CHANNELS_CANCELLED",
          channel: "manual",
          note: `All automation channels cancelled — manual ${action} override`,
        });
      }
    }

    console.log(`${LOG_PREFIX} Processed ${source} ${action} for order ${order.orderNumber} → ${targetStatus}${hasConflict ? " (CONFLICT → HOLD)" : ""}`);

    return {
      success: true,
      action,
      newStatus: targetStatus,
      conflict: hasConflict,
    };
  }, `confirmationEngine:${orderId}`);
}

export async function initializeOrderConfirmation(params: {
  merchantId: string;
  orderId: string;
  orderNumber: string;
}): Promise<void> {
  const { merchantId, orderId, orderNumber } = params;

  try {
    const [order] = await db.select().from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)));
    if (!order) return;

    const oldTags = (order.tags as string[]) || [];
    const newTags = replaceConfirmationTags(oldTags, "Pending", "Whatsapp-Pending");

    await db.update(orders).set({
      tags: newTags,
      confirmationStatus: "pending",
      confirmationSource: null,
      confirmationResponseCount: 0,
      conflictDetected: false,
      confirmationLocked: false,
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));

    await logConfirmationEvent({
      merchantId, orderId,
      eventType: "ORDER_IMPORTED",
      oldTags, newTags,
      note: `Order #${orderNumber} imported, pending confirmation`,
    });

    if (order.shopifyOrderId) {
      writeBackConfirmationTags(merchantId, order.shopifyOrderId, oldTags, newTags)
        .catch(e => console.error(`${LOG_PREFIX} Initial tag write-back error:`, e));
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Failed to initialize confirmation for ${orderId}:`, err.message);
  }
}

export async function lockOrderAfterBooking(merchantId: string, orderId: string): Promise<void> {
  try {
    await db.update(orders).set({
      confirmationLocked: true,
      confirmationLockedAt: new Date(),
    }).where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)));

    await logConfirmationEvent({
      merchantId, orderId,
      eventType: "ORDER_BOOKED",
      note: "Order booked — confirmation flow locked",
    });
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Failed to lock order ${orderId}:`, err.message);
  }
}
