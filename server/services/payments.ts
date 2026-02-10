import { storage } from "../storage";
import type { Order } from "@shared/schema";

export interface PaymentState {
  prepaidAmount: number;
  codRemaining: number;
  codPaymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
}

export function computePaymentState(totalAmount: number, paymentSum: number): PaymentState {
  const prepaid = Math.max(paymentSum, 0);
  const codRemaining = Math.max(totalAmount - prepaid, 0);
  let codPaymentStatus: PaymentState["codPaymentStatus"] = "UNPAID";
  if (prepaid >= totalAmount && totalAmount > 0) {
    codPaymentStatus = "PAID";
  } else if (prepaid > 0) {
    codPaymentStatus = "PARTIALLY_PAID";
  }
  return { prepaidAmount: prepaid, codRemaining, codPaymentStatus };
}

export async function recalculateOrderPayment(merchantId: string, orderId: string): Promise<PaymentState> {
  const order = await storage.getOrderById(merchantId, orderId);
  if (!order) throw new Error("Order not found");

  const paymentSum = await storage.getOrderPaymentSum(merchantId, orderId);
  const totalAmount = parseFloat(order.totalAmount) || 0;
  const state = computePaymentState(totalAmount, paymentSum);

  await storage.updateOrder(merchantId, orderId, {
    prepaidAmount: String(state.prepaidAmount),
    codRemaining: String(state.codRemaining),
    codPaymentStatus: state.codPaymentStatus,
    lastPaymentAt: paymentSum > 0 ? new Date() : null,
  } as any);

  return state;
}

export async function addPayment(
  merchantId: string,
  orderId: string,
  amount: number,
  method: string,
  userId?: string,
  reference?: string,
  notes?: string
): Promise<PaymentState> {
  if (amount <= 0) throw new Error("Payment amount must be positive");

  const order = await storage.getOrderById(merchantId, orderId);
  if (!order) throw new Error("Order not found");

  const totalAmount = parseFloat(order.totalAmount) || 0;
  const currentPrepaid = parseFloat(order.prepaidAmount || "0");
  const clampedAmount = Math.min(amount, Math.max(totalAmount - currentPrepaid, 0));

  if (clampedAmount <= 0) throw new Error("Order is already fully paid");

  await storage.createOrderPayment({
    merchantId,
    orderId,
    amount: String(clampedAmount),
    method,
    reference: reference || null,
    notes: notes || null,
    createdByUserId: userId || null,
  });

  return recalculateOrderPayment(merchantId, orderId);
}

export async function deletePayment(
  merchantId: string,
  paymentId: string,
  orderId: string
): Promise<PaymentState> {
  await storage.deleteOrderPayment(merchantId, paymentId);
  return recalculateOrderPayment(merchantId, orderId);
}

export async function markFullyPaid(
  merchantId: string,
  orderId: string,
  method: string,
  userId?: string
): Promise<PaymentState> {
  const order = await storage.getOrderById(merchantId, orderId);
  if (!order) throw new Error("Order not found");

  const totalAmount = parseFloat(order.totalAmount) || 0;
  const currentPrepaid = parseFloat(order.prepaidAmount || "0");
  const remaining = Math.max(totalAmount - currentPrepaid, 0);

  if (remaining <= 0) throw new Error("Order is already fully paid");

  await storage.createOrderPayment({
    merchantId,
    orderId,
    amount: String(remaining),
    method,
    reference: null,
    notes: "Marked as fully paid",
    createdByUserId: userId || null,
  });

  return recalculateOrderPayment(merchantId, orderId);
}

export async function resetPayments(
  merchantId: string,
  orderId: string
): Promise<PaymentState> {
  const payments = await storage.getOrderPayments(merchantId, orderId);
  for (const p of payments) {
    await storage.deleteOrderPayment(merchantId, p.id);
  }
  return recalculateOrderPayment(merchantId, orderId);
}

export async function bulkMarkPrepaid(
  merchantId: string,
  orderIds: string[],
  method: string,
  userId?: string
): Promise<{ success: number; failed: number; results: { orderId: string; error?: string }[] }> {
  const results: { orderId: string; error?: string }[] = [];
  let success = 0;
  let failed = 0;

  for (const orderId of orderIds) {
    try {
      await markFullyPaid(merchantId, orderId, method, userId);
      results.push({ orderId });
      success++;
    } catch (err: any) {
      results.push({ orderId, error: err.message });
      failed++;
    }
  }

  return { success, failed, results };
}
