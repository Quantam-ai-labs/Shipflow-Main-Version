import { db } from "../db";
import { orders, workflowAuditLog } from "@shared/schema";
import { eq, and, inArray, lt, sql } from "drizzle-orm";
import type { Order } from "@shared/schema";
import { writeBackCancel, writeBackTags } from './shopifyWriteBack';

const VALID_STATUSES = ["NEW", "PENDING", "HOLD", "READY_TO_SHIP", "BOOKED", "FULFILLED", "DELIVERED", "RETURN", "CANCELLED"] as const;
type WorkflowStatus = typeof VALID_STATUSES[number];

const ALLOWED_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  NEW:           ["PENDING", "READY_TO_SHIP", "CANCELLED"],
  PENDING:       ["NEW", "HOLD", "READY_TO_SHIP", "CANCELLED"],
  HOLD:          ["PENDING", "READY_TO_SHIP", "CANCELLED"],
  READY_TO_SHIP: ["PENDING", "HOLD", "BOOKED", "CANCELLED"],
  BOOKED:        ["FULFILLED", "CANCELLED"],
  FULFILLED:     ["DELIVERED", "RETURN"],
  DELIVERED:     [],
  RETURN:        [],
  CANCELLED:     [],
};

const SYSTEM_ALLOWED_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  NEW:           ["PENDING", "READY_TO_SHIP", "CANCELLED"],
  PENDING:       ["READY_TO_SHIP", "CANCELLED"],
  HOLD:          ["PENDING", "READY_TO_SHIP", "CANCELLED"],
  READY_TO_SHIP: ["BOOKED", "CANCELLED"],
  BOOKED:        ["FULFILLED", "CANCELLED"],
  FULFILLED:     ["DELIVERED", "RETURN"],
  DELIVERED:     [],
  RETURN:        [],
  CANCELLED:     [],
};

function isTransitionAllowed(from: string, to: string, actorType: string, action: string): { allowed: boolean; reason?: string } {
  if (action === "revert" || action === "admin_override" || action === "data_repair") {
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

  if (order.workflowStatus === "BOOKED" && toStatus === "FULFILLED") {
    const staleStatuses = ["Unfulfilled", "pending", null, undefined, ""];
    if (staleStatuses.includes(order.shipmentStatus as any)) {
      updateData.shipmentStatus = "IN_TRANSIT";
    }
  }

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

  if (order.shopifyOrderId) {
    if (toStatus === "CANCELLED") {
      writeBackCancel(merchantId, order.shopifyOrderId, reason || "Cancelled in ShipFlow")
        .then(r => { if (!r.success) console.warn(`[ShopifyWriteBack] Cancel failed for ${orderId}: ${r.error}`); })
        .catch(e => console.error(`[ShopifyWriteBack] Cancel error:`, e));
    }
    writeBackTags(merchantId, order.shopifyOrderId, toStatus)
      .then(r => { if (!r.success) console.warn(`[ShopifyWriteBack] Tag sync failed for ${orderId}: ${r.error}`); })
      .catch(e => console.error(`[ShopifyWriteBack] Tag sync error:`, e));
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

  if (toStatus === "FULFILLED") {
    const staleStatuses = ["Unfulfilled", "pending", "", null];
    const staleIds = eligible
      .filter(o => o.workflowStatus === "BOOKED" && staleStatuses.includes(o.shipmentStatus as any))
      .map(o => o.id);
    if (staleIds.length > 0) {
      await db.update(orders)
        .set({ shipmentStatus: "IN_TRANSIT" } as any)
        .where(and(inArray(orders.id, staleIds), eq(orders.merchantId, merchantId)));
    }
  }

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

  const shopifyOrders = eligible.filter(o => o.shopifyOrderId);
  if (shopifyOrders.length > 0) {
    (async () => {
      for (let i = 0; i < shopifyOrders.length; i++) {
        const o = shopifyOrders[i];
        try {
          if (toStatus === "CANCELLED") {
            const r = await writeBackCancel(merchantId, o.shopifyOrderId!, reason || "Cancelled in ShipFlow");
            if (!r.success) console.warn(`[ShopifyWriteBack] Bulk cancel failed for ${o.id}: ${r.error}`);
          }
          const r = await writeBackTags(merchantId, o.shopifyOrderId!, toStatus);
          if (!r.success) console.warn(`[ShopifyWriteBack] Bulk tag sync failed for ${o.id}: ${r.error}`);
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

  if (order.shopifyOrderId) {
    writeBackTags(merchantId, order.shopifyOrderId, order.previousWorkflowStatus)
      .then(r => { if (!r.success) console.warn(`[ShopifyWriteBack] Revert tag sync failed for ${orderId}: ${r.error}`); })
      .catch(e => console.error(`[ShopifyWriteBack] Revert tag sync error:`, e));
  }

  return { success: true, order: updated };
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

export function parseRoboTags(tags: string[] | null): { roboConfirm: boolean; roboCancel: boolean; roboPending: boolean } {
  if (!tags || tags.length === 0) return { roboConfirm: false, roboCancel: false, roboPending: false };

  const tagSet = new Set(tags.map(t => t.trim().toLowerCase()));
  return {
    roboConfirm: tagSet.has("robo-confirm"),
    roboCancel: tagSet.has("robo-cancel"),
    roboPending: tagSet.has("robo-pending"),
  };
}

export async function applyRoboTags(merchantId: string, orderId: string, tags: string[] | null): Promise<TransitionResult | null> {
  const robo = parseRoboTags(tags);

  if (!robo.roboConfirm && !robo.roboCancel && !robo.roboPending) {
    return null;
  }

  const [order] = await db.select().from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)));

  if (!order) return null;

  if (!["NEW", "PENDING"].includes(order.workflowStatus)) {
    return null;
  }

  if (robo.roboCancel) {
    return transitionOrder({
      merchantId,
      orderId,
      toStatus: "CANCELLED",
      action: "robo_cancel",
      actorType: "system",
      reason: "Robo-Cancel tag",
      extraData: { cancelledAt: new Date(), cancelReason: "Robo-Cancel tag" },
    });
  }

  if (robo.roboConfirm) {
    return transitionOrder({
      merchantId,
      orderId,
      toStatus: "READY_TO_SHIP",
      action: "robo_confirm",
      actorType: "system",
      reason: "Robo-Confirm tag",
      extraData: { confirmedAt: new Date() },
    });
  }

  return null;
}
