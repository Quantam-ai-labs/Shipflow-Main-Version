import { db, withRetry } from "../db";
import { orders, workflowAuditLog } from "@shared/schema";
import { eq, and, inArray, lt, sql } from "drizzle-orm";
import type { Order } from "@shared/schema";
import { writeBackCancel, writeBackTags } from './shopifyWriteBack';
import { getMerchantRoboTags, type RoboTagConfig } from './roboTags';
import { sendOrderStatusWhatsApp, WA_NOTIFY_STATUSES } from '../utils/integrations/whatsapp';
import { lockOrderAfterBooking } from './confirmationEngine';

export { getMerchantRoboTags, type RoboTagConfig };

const VALID_STATUSES = ["NEW", "PENDING", "HOLD", "READY_TO_SHIP", "BOOKED", "FULFILLED", "DELIVERED", "RETURN", "CANCELLED"] as const;
type WorkflowStatus = typeof VALID_STATUSES[number];

const ALLOWED_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  NEW:           ["PENDING", "READY_TO_SHIP", "CANCELLED"],
  PENDING:       ["NEW", "HOLD", "READY_TO_SHIP", "CANCELLED"],
  HOLD:          ["PENDING", "READY_TO_SHIP", "CANCELLED"],
  READY_TO_SHIP: ["PENDING", "HOLD", "BOOKED", "CANCELLED"],
  BOOKED:        ["PENDING", "READY_TO_SHIP", "FULFILLED", "CANCELLED"],
  FULFILLED:     ["DELIVERED", "RETURN"],
  DELIVERED:     [],
  RETURN:        [],
  CANCELLED:     [],
};

const SYSTEM_ALLOWED_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  NEW:           ["PENDING", "HOLD", "READY_TO_SHIP", "CANCELLED"],
  PENDING:       ["HOLD", "READY_TO_SHIP", "CANCELLED"],
  HOLD:          ["PENDING", "READY_TO_SHIP", "CANCELLED"],
  READY_TO_SHIP: ["HOLD", "BOOKED", "CANCELLED"],
  BOOKED:        ["PENDING", "READY_TO_SHIP", "FULFILLED", "CANCELLED"],
  FULFILLED:     ["DELIVERED", "RETURN"],
  DELIVERED:     [],
  RETURN:        [],
  CANCELLED:     [],
};

function isTransitionAllowed(from: string, to: string, actorType: string, action: string): { allowed: boolean; reason?: string } {
  if (action === "revert" || action === "admin_override" || action === "data_repair" || action === "courier_status_sync" || action === "shopify_sync") {
    return { allowed: true };
  }

  if (!VALID_STATUSES.includes(from as WorkflowStatus) || !VALID_STATUSES.includes(to as WorkflowStatus)) {
    return { allowed: false, reason: `Invalid status: ${from} -> ${to}` };
  }

  if (from === to) {
    return { allowed: true };
  }

  const transitionMap = actorType === "system" ? SYSTEM_ALLOWED_TRANSITIONS : ALLOWED_TRANSITIONS;
  const allowed = transitionMap[from as WorkflowStatus];

  if (!allowed || !allowed.includes(to as WorkflowStatus)) {
    return { allowed: false, reason: `Transition ${from} -> ${to} is not allowed (actor: ${actorType}, action: ${action})` };
  }

  return { allowed: true };
}

interface TransitionParams {
  merchantId: string;
  orderId: string;
  toStatus: string;
  action: string;
  actorUserId?: string;
  actorName?: string;
  actorType?: string;
  reason?: string;
  extraData?: Partial<Order>;
}

interface TransitionResult {
  success: boolean;
  order?: Order;
  error?: string;
}

export async function transitionOrder(params: TransitionParams): Promise<TransitionResult> {
  return withRetry(() => _transitionOrderInner(params), `transitionOrder:${params.orderId}`);
}

async function _transitionOrderInner(params: TransitionParams): Promise<TransitionResult> {
  const { merchantId, orderId, toStatus, action, actorUserId, actorName, actorType = "user", reason, extraData } = params;

  if (!VALID_STATUSES.includes(toStatus as WorkflowStatus)) {
    return { success: false, error: `Invalid status: ${toStatus}` };
  }

  const [order] = await db.select().from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)));

  if (!order) {
    return { success: false, error: "Order not found" };
  }

  if (order.workflowStatus === toStatus) {
    return { success: true, order };
  }

  const check = isTransitionAllowed(order.workflowStatus, toStatus, actorType, action);
  if (!check.allowed) {
    console.warn(`[Workflow] BLOCKED transition: ${check.reason} for order ${orderId}`);
    return { success: false, error: check.reason || `Transition not allowed` };
  }

  const now = new Date();
  const updateData: any = {
    workflowStatus: toStatus,
    previousWorkflowStatus: order.workflowStatus,
    lastStatusChangedAt: now,
    lastStatusChangedByUserId: actorUserId || null,
    updatedAt: now,
    ...extraData,
  };


  const [updated] = await db.update(orders)
    .set(updateData)
    .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)))
    .returning();

  await db.insert(workflowAuditLog).values({
    orderId,
    merchantId,
    fromStatus: order.workflowStatus,
    toStatus,
    action,
    reason: reason || null,
    actorUserId: actorUserId || null,
    actorName: actorName || (actorType === "system" ? "System" : null),
    actorType,
  });

  if (WA_NOTIFY_STATUSES.includes(toStatus as any)) {
    sendOrderStatusWhatsApp({
      orderId,
      merchantId,
      customerPhone: order.customerPhone,
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      fromStatus: order.workflowStatus,
      toStatus,
      city: order.city,
      shippingAddress: order.shippingAddress,
      totalAmount: order.totalAmount,
      courierName: order.courierName,
      courierTracking: order.courierTracking,
      itemSummary: order.itemSummary,
      lineItems: Array.isArray(order.lineItems) ? (order.lineItems as any[]) : null,
      shopDomain: (order as any).shopDomain || null,
    }).catch(err => console.error(`[WhatsApp] Error in transitionOrder for ${orderId}:`, err));
  }

  if (toStatus === "BOOKED") {
    lockOrderAfterBooking(merchantId, orderId)
      .catch(err => console.error(`[Workflow] Failed to lock order after booking: ${err.message}`));
  }

  if (order.shopifyOrderId && action !== 'courier_status_sync') {
    const AUTO_CANCEL_ACTIONS = ['robo_cancel', 'whatsapp_cancel', 'robocall_cancel', 'conflict_hold', 'robocall_exhausted'];
    if (toStatus === "CANCELLED" && !AUTO_CANCEL_ACTIONS.includes(action)) {
      writeBackCancel(merchantId, order.shopifyOrderId, reason || "Cancelled in 1SOL.AI")
        .then(r => { if (!r.success) console.warn(`[ShopifyWriteBack] Cancel failed for ${orderId}: ${r.error}`); })
        .catch(e => console.error(`[ShopifyWriteBack] Cancel error:`, e));
    }
    const ROBOCALL_ACTIONS = ['robocall_confirm', 'robocall_cancel', 'robo_cancel', 'robocall_exhausted'];
    const ROBO_TAG_STATUSES = ['READY_TO_SHIP', 'PENDING', 'CANCELLED'];
    if (ROBO_TAG_STATUSES.includes(toStatus) && ROBOCALL_ACTIONS.includes(action)) {
      writeBackTags(merchantId, order.shopifyOrderId, toStatus)
        .then(r => { if (!r.success) console.warn(`[ShopifyWriteBack] Tag sync failed for ${orderId}: ${r.error}`); })
        .catch(e => console.error(`[ShopifyWriteBack] Tag sync error:`, e));
    }
  }

  return { success: true, order: updated };
}

export async function bulkTransitionOrders(params: {
  merchantId: string;
  orderIds: string[];
  toStatus: string;
  action: string;
  actorUserId?: string;
  actorName?: string;
  actorType?: string;
  reason?: string;
  extraData?: Partial<Order>;
}): Promise<{ updated: number; skipped: number }> {
  const { merchantId, orderIds, toStatus, action, actorUserId, actorName, actorType = "user", reason, extraData } = params;

  if (!VALID_STATUSES.includes(toStatus as WorkflowStatus)) {
    return { updated: 0, skipped: orderIds.length };
  }

  const existingOrders = await db.select({
    id: orders.id,
    workflowStatus: orders.workflowStatus,
    shopifyOrderId: orders.shopifyOrderId,
    shipmentStatus: orders.shipmentStatus,
    customerPhone: orders.customerPhone,
    customerName: orders.customerName,
    orderNumber: orders.orderNumber,
    city: orders.city,
    shippingAddress: orders.shippingAddress,
    totalAmount: orders.totalAmount,
    courierName: orders.courierName,
    courierTracking: orders.courierTracking,
  }).from(orders)
    .where(and(
      inArray(orders.id, orderIds),
      eq(orders.merchantId, merchantId)
    ));

  const eligible = existingOrders.filter(o => {
    if (o.workflowStatus === toStatus) return false;
    const check = isTransitionAllowed(o.workflowStatus, toStatus, actorType || "user", action);
    if (!check.allowed) {
      console.warn(`[Workflow] BLOCKED bulk transition for order ${o.id}: ${check.reason}`);
    }
    return check.allowed;
  });

  if (eligible.length === 0) {
    return { updated: 0, skipped: orderIds.length };
  }

  const eligibleIds = eligible.map(o => o.id);
  const now = new Date();

  await db.update(orders)
    .set({
      workflowStatus: toStatus,
      previousWorkflowStatus: sql`workflow_status`,
      lastStatusChangedAt: now,
      lastStatusChangedByUserId: actorUserId || null,
      updatedAt: now,
      ...extraData,
    } as any)
    .where(and(
      inArray(orders.id, eligibleIds),
      eq(orders.merchantId, merchantId)
    ));


  const auditEntries = eligible.map(o => ({
    orderId: o.id,
    merchantId,
    fromStatus: o.workflowStatus,
    toStatus,
    action,
    reason: reason || null,
    actorUserId: actorUserId || null,
    actorName: actorName || (actorType === "system" ? "System" : null),
    actorType,
  }));

  if (auditEntries.length > 0) {
    await db.insert(workflowAuditLog).values(auditEntries);
  }

  if (WA_NOTIFY_STATUSES.includes(toStatus as any)) {
    eligible.forEach(o => {
      sendOrderStatusWhatsApp({
        orderId: o.id,
        merchantId,
        customerPhone: o.customerPhone,
        customerName: o.customerName,
        orderNumber: o.orderNumber,
        fromStatus: o.workflowStatus,
        toStatus,
        city: o.city,
        shippingAddress: o.shippingAddress,
        totalAmount: o.totalAmount,
        courierName: o.courierName,
        courierTracking: o.courierTracking,
        itemSummary: o.itemSummary,
        lineItems: Array.isArray(o.lineItems) ? (o.lineItems as any[]) : null,
        shopDomain: (o as any).shopDomain || null,
      }).catch(err => console.error(`[WhatsApp] Error in bulkTransition for ${o.id}:`, err));
    });
  }

  const shopifyOrders = eligible.filter(o => o.shopifyOrderId);
  if (shopifyOrders.length > 0) {
    (async () => {
      for (let i = 0; i < shopifyOrders.length; i++) {
        const o = shopifyOrders[i];
        try {
          const AUTO_CANCEL_ACTIONS_BULK = ['robo_cancel', 'whatsapp_cancel', 'robocall_cancel', 'conflict_hold', 'robocall_exhausted'];
          if (toStatus === "CANCELLED" && !AUTO_CANCEL_ACTIONS_BULK.includes(action)) {
            const r = await writeBackCancel(merchantId, o.shopifyOrderId!, reason || "Cancelled in 1SOL.AI");
            if (!r.success) console.warn(`[ShopifyWriteBack] Bulk cancel failed for ${o.id}: ${r.error}`);
          }
          const ROBOCALL_ACTIONS_BULK = ['robocall_confirm', 'robocall_cancel', 'robo_cancel', 'robocall_exhausted'];
          const ROBO_BULK_STATUSES = ['READY_TO_SHIP', 'PENDING', 'CANCELLED'];
          if (ROBO_BULK_STATUSES.includes(toStatus) && ROBOCALL_ACTIONS_BULK.includes(action)) {
            const r = await writeBackTags(merchantId, o.shopifyOrderId!, toStatus);
            if (!r.success) console.warn(`[ShopifyWriteBack] Bulk tag sync failed for ${o.id}: ${r.error}`);
          }
        } catch (e) {
          console.error(`[ShopifyWriteBack] Bulk write-back error for ${o.id}:`, e);
        }
        if (i < shopifyOrders.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    })().catch(e => console.error(`[ShopifyWriteBack] Bulk write-back error:`, e));
  }

  return { updated: eligible.length, skipped: orderIds.length - eligible.length };
}

export async function revertOrder(merchantId: string, orderId: string, actorUserId?: string, reason?: string, actorName?: string): Promise<TransitionResult> {
  return withRetry(async () => {
    const [order] = await db.select().from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)));

    if (!order) {
      return { success: false, error: "Order not found" };
    }

    if (!order.previousWorkflowStatus) {
      return { success: false, error: "No previous status to revert to" };
    }

    const now = new Date();
    const [updated] = await db.update(orders)
      .set({
        workflowStatus: order.previousWorkflowStatus,
        previousWorkflowStatus: order.workflowStatus,
        lastStatusChangedAt: now,
        lastStatusChangedByUserId: actorUserId || null,
        updatedAt: now,
      })
      .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)))
      .returning();

    await db.insert(workflowAuditLog).values({
      orderId,
      merchantId,
      fromStatus: order.workflowStatus,
      toStatus: order.previousWorkflowStatus,
      action: "revert",
      reason: reason || "User reverted status",
      actorUserId: actorUserId || null,
      actorName: actorName || null,
      actorType: "user",
    });

    if (WA_NOTIFY_STATUSES.includes(order.previousWorkflowStatus as any)) {
      sendOrderStatusWhatsApp({
        orderId,
        merchantId,
        customerPhone: order.customerPhone,
        customerName: order.customerName,
        orderNumber: order.orderNumber,
        fromStatus: order.workflowStatus,
        toStatus: order.previousWorkflowStatus,
        city: order.city,
        shippingAddress: order.shippingAddress,
        totalAmount: order.totalAmount,
        courierName: order.courierName,
        courierTracking: order.courierTracking,
        itemSummary: order.itemSummary,
        lineItems: Array.isArray(order.lineItems) ? (order.lineItems as any[]) : null,
        shopDomain: (order as any).shopDomain || null,
      }).catch(err => console.error(`[WhatsApp] Error in revertOrder for ${orderId}:`, err));
    }

    const ROBO_REVERT_STATUSES = ['READY_TO_SHIP', 'PENDING', 'CANCELLED'];
    if (order.shopifyOrderId && ROBO_REVERT_STATUSES.includes(order.previousWorkflowStatus) && order.confirmationSource === "robocall") {
      writeBackTags(merchantId, order.shopifyOrderId, order.previousWorkflowStatus)
        .then(r => { if (!r.success) console.warn(`[ShopifyWriteBack] Revert tag sync failed for ${orderId}: ${r.error}`); })
        .catch(e => console.error(`[ShopifyWriteBack] Revert tag sync error:`, e));
    }

    return { success: true, order: updated };
  }, `revertOrder:${orderId}`);
}

export async function autoMoveStalePending(merchantId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);

  const staleOrders = await db.select({ id: orders.id, workflowStatus: orders.workflowStatus })
    .from(orders)
    .where(and(
      eq(orders.merchantId, merchantId),
      eq(orders.workflowStatus, "NEW"),
      lt(orders.createdAt, cutoff)
    ));

  if (staleOrders.length === 0) return 0;

  const staleIds = staleOrders.map(o => o.id);
  const now = new Date();

  await db.update(orders)
    .set({
      workflowStatus: "PENDING",
      previousWorkflowStatus: "NEW",
      pendingReasonType: "AUTO_12H",
      pendingReason: "Auto-moved: not finalized within 12 hours",
      lastStatusChangedAt: now,
      lastStatusChangedByUserId: null,
      updatedAt: now,
    })
    .where(and(
      inArray(orders.id, staleIds),
      eq(orders.merchantId, merchantId),
      eq(orders.workflowStatus, "NEW")
    ));

  const auditEntries = staleOrders.map(o => ({
    orderId: o.id,
    merchantId,
    fromStatus: "NEW",
    toStatus: "PENDING",
    action: "auto_12h_pending",
    reason: "Auto-moved: not finalized within 12 hours",
    actorUserId: null,
    actorName: "System",
    actorType: "system",
  }));

  if (auditEntries.length > 0) {
    await db.insert(workflowAuditLog).values(auditEntries);
  }

  return staleOrders.length;
}

const DEFAULT_ROBO_TAGS = { confirm: "confirm", cancel: "cancel", pending: "pending" };

export function parseRoboTags(tags: string[] | null, config?: RoboTagConfig): { roboConfirm: boolean; roboCancel: boolean; roboPending: boolean } {
  if (!tags || tags.length === 0) return { roboConfirm: false, roboCancel: false, roboPending: false };
  const c = config || DEFAULT_ROBO_TAGS;

  const tagSet = new Set(tags.map(t => t.trim().toLowerCase()));
  return {
    roboConfirm: tagSet.has(c.confirm.toLowerCase()),
    roboCancel: tagSet.has(c.cancel.toLowerCase()),
    roboPending: tagSet.has(c.pending.toLowerCase()),
  };
}

export async function applyRoboTags(_merchantId: string, _orderId: string, _tags: string[] | null): Promise<TransitionResult | null> {
  return null;
}
