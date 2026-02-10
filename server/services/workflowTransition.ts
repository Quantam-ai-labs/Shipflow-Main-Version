import { db } from "../db";
import { orders, workflowAuditLog } from "@shared/schema";
import { eq, and, inArray, lt, sql } from "drizzle-orm";
import type { Order } from "@shared/schema";

const FINAL_STATUSES = ["FULFILLED"];
const VALID_STATUSES = ["NEW", "PENDING", "HOLD", "READY_TO_SHIP", "FULFILLED", "CANCELLED"];

interface TransitionParams {
  merchantId: string;
  orderId: string;
  toStatus: string;
  action: string;
  actorUserId?: string;
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
  const { merchantId, orderId, toStatus, action, actorUserId, actorType = "user", reason, extraData } = params;

  if (!VALID_STATUSES.includes(toStatus)) {
    return { success: false, error: `Invalid status: ${toStatus}` };
  }

  const [order] = await db.select().from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)));

  if (!order) {
    return { success: false, error: "Order not found" };
  }

  if (FINAL_STATUSES.includes(order.workflowStatus) && action !== "revert") {
    return { success: false, error: `Cannot change status of ${order.workflowStatus} order` };
  }

  if (order.workflowStatus === toStatus) {
    return { success: true, order };
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
    actorType,
  });

  return { success: true, order: updated };
}

export async function bulkTransitionOrders(params: {
  merchantId: string;
  orderIds: string[];
  toStatus: string;
  action: string;
  actorUserId?: string;
  actorType?: string;
  reason?: string;
  extraData?: Partial<Order>;
}): Promise<{ updated: number; skipped: number }> {
  const { merchantId, orderIds, toStatus, action, actorUserId, actorType = "user", reason, extraData } = params;

  const existingOrders = await db.select({
    id: orders.id,
    workflowStatus: orders.workflowStatus,
  }).from(orders)
    .where(and(
      inArray(orders.id, orderIds),
      eq(orders.merchantId, merchantId)
    ));

  const eligible = existingOrders.filter(o =>
    !FINAL_STATUSES.includes(o.workflowStatus) && o.workflowStatus !== toStatus
  );

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
    actorType,
  }));

  if (auditEntries.length > 0) {
    await db.insert(workflowAuditLog).values(auditEntries);
  }

  return { updated: eligible.length, skipped: orderIds.length - eligible.length };
}

export async function revertOrder(merchantId: string, orderId: string, actorUserId?: string, reason?: string): Promise<TransitionResult> {
  const [order] = await db.select().from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)));

  if (!order) {
    return { success: false, error: "Order not found" };
  }

  if (!order.previousWorkflowStatus) {
    return { success: false, error: "No previous status to revert to" };
  }

  if (order.workflowStatus === "FULFILLED") {
    return { success: false, error: "Cannot revert FULFILLED orders" };
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
    actorType: "user",
  });

  return { success: true, order: updated };
}

export async function autoMoveStalePending(merchantId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

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
      pendingReasonType: "AUTO_24H",
      pendingReason: "Auto-moved: not finalized within 24 hours",
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
    action: "auto_24h_pending",
    reason: "Auto-moved: not finalized within 24 hours",
    actorUserId: null,
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
