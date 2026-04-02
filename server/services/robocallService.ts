import { db, withRetry } from "../db";
import { orders, merchants, robocallLogs, notifications, workflowAuditLog } from "@shared/schema";
import { eq, and, isNotNull, desc, lt, gt, inArray, or } from "drizzle-orm";
import { logConfirmationEvent, processConfirmationResponse, createNotification } from "./confirmationEngine";
import { storage } from "../storage";
import { transitionOrder } from "./workflowTransition";
import { formatPhoneForWhatsApp } from "../utils/integrations/whatsapp/sender";

const LOG_PREFIX = "[RobocallService]";
const ROBOCALL_API_BASE = "https://app.brandedsmspakistan.com/api";
const RESPONSE_CHECK_INTERVAL_MS = 3 * 60 * 1000;
const MIN_PENDING_AGE_MS = 12 * 60 * 60 * 1000;
const FINAL_VOICE_STATUSES = [2, 3, 4, 5, 6, 7, 9, 10];
const CALL_STATUS_LABELS: Record<number, string> = {
  1: "Initiated", 2: "Congestion", 3: "No Response", 4: "Answered",
  5: "Busy", 6: "Hangup", 7: "Limit Exceeded", 8: "Sent to SIP",
  9: "Verified", 10: "Deleted", 11: "Queued",
};

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

function getNowInTimezone(timezone?: string): Date {
  const tz = timezone || "Asia/Karachi";
  try {
    const str = new Date().toLocaleString("en-US", { timeZone: tz });
    return new Date(str);
  } catch {
    const utcNow = new Date();
    return new Date(utcNow.getTime() + PKT_OFFSET_MS);
  }
}

export function isWithinCallWindow(startTime: string, endTime: string, timezone?: string): boolean {
  const now = getNowInTimezone(timezone);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  return currentMinutes >= (startH * 60 + startM) && currentMinutes < (endH * 60 + endM);
}

export function getNextWindowStart(startTime: string, timezone?: string): Date {
  const now = getNowInTimezone(timezone);
  const [startH, startM] = startTime.split(":").map(Number);
  const target = new Date(now);
  target.setHours(startH, startM, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const offsetMs = target.getTime() - now.getTime();
  return new Date(Date.now() + offsetMs);
}

export const getNextCallWindowStart = getNextWindowStart;

export async function safeFetchJson(url: string): Promise<any> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    try { return JSON.parse(text); } catch { return { raw: text, error: "Invalid JSON response" }; }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Fetch error: ${err.message}`);
    return { raw: null, error: err.message || "Network error" };
  }
}

export async function sendCallDirect(params: {
  merchantId: string;
  merchant: { robocallEmail: string; robocallApiKey: string; robocallVoiceId?: string | null; name?: string | null };
  orderId: string;
  orderNumber: string;
  phone: string;
  amount: string;
  brandName?: string;
  source?: string;
  attemptNumber?: number;
}): Promise<{ success: boolean; callId?: string; error?: string }> {
  const { merchantId, merchant, orderId, orderNumber, phone, amount, brandName, source, attemptNumber } = params;
  const voiceId = merchant.robocallVoiceId || "735";

  const urlParams = new URLSearchParams({
    email: merchant.robocallEmail,
    key: merchant.robocallApiKey,
    to: phone,
    type: "dtmf",
    voice_id: voiceId,
    amount: amount || "0",
    brand_name: (brandName || merchant.name || "").replace(/\s+/g, " ").trim(),
    order_number: (orderNumber || "").replace(/^#/, ""),
  });

  let preLog: { id: string };
  try {
    preLog = await storage.createRobocallLog({
      merchantId,
      callId: null,
      phone,
      amount,
      voiceId,
      brandName: brandName || merchant.name || null,
      orderNumber,
      orderId,
      source: source || "auto",
      attemptNumber: attemptNumber || 1,
      status: "Initiated",
    });
  } catch (preLogErr: any) {
    console.error(`${LOG_PREFIX} Pre-call log insert failed for #${orderNumber} — aborting call to preserve audit trail:`, preLogErr.message);
    return { success: false, error: `Pre-call log failed: ${preLogErr.message}` };
  }

  const data = await safeFetchJson(`${ROBOCALL_API_BASE}/send-voice?${urlParams.toString()}`);
  const smsData = data?.sms || data;
  const callId = smsData?.id || smsData?.call_id || data?.data?.call_id || null;

  if (callId) {
    try {
      await storage.updateRobocallLog(preLog.id, { callId: String(callId) });
    } catch (logErr: any) {
      console.error(`${LOG_PREFIX} Failed to update robocall log with callId ${callId}:`, logErr.message);
    }

    await logConfirmationEvent({
      merchantId, orderId,
      eventType: "CALL_ATTEMPTED",
      channel: "robocall",
      apiResponse: data,
      note: `RoboCall sent — call ID: ${callId} (${source || "auto"}, attempt ${attemptNumber || 1})`,
    });

    console.log(`${LOG_PREFIX} Call sent for #${orderNumber} — callId: ${callId}`);
    return { success: true, callId: String(callId) };
  } else {
    const errorMsg = data?.error || "No call ID returned";

    try {
      await storage.updateRobocallLog(preLog.id, { status: "Error", error: errorMsg });
    } catch (logErr: any) {
      console.error(`${LOG_PREFIX} Failed to update error robocall log for #${orderNumber}:`, logErr.message);
    }

    await logConfirmationEvent({
      merchantId, orderId,
      eventType: "CALL_ATTEMPTED",
      channel: "robocall",
      apiResponse: data,
      errorDetails: errorMsg,
      note: `RoboCall send failed: ${errorMsg}`,
    });

    console.log(`${LOG_PREFIX} Call failed for #${orderNumber}: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

export async function triggerRobocallForOrder(order: any, merchant: any, reason: string): Promise<void> {
  if (merchant?.robocallDisconnected) {
    console.log(`${LOG_PREFIX} RoboCall disconnected, skipping for #${order.orderNumber}`);
    return;
  }
  if (!merchant?.robocallEmail || !merchant?.robocallApiKey || !order.customerPhone) return;

  const formattedPhone = formatPhoneForWhatsApp(order.customerPhone);
  if (!formattedPhone) return;

  const startTime = merchant.robocallStartTime || "10:00";
  const endTime = merchant.robocallEndTime || "20:00";

  if (isWithinCallWindow(startTime, endTime)) {
    await sendCallDirect({
      merchantId: order.merchantId,
      merchant,
      orderId: order.id,
      orderNumber: order.orderNumber || "",
      phone: formattedPhone,
      amount: order.totalAmount || "0",
      brandName: merchant.name,
      source: "auto",
      attemptNumber: 1,
    });
  } else {
    await db.insert(robocallLogs).values({
      merchantId: order.merchantId,
      callId: null,
      phone: formattedPhone,
      amount: order.totalAmount || "0",
      voiceId: merchant.robocallVoiceId || "735",
      brandName: merchant.name || null,
      orderNumber: order.orderNumber || "",
      orderId: order.id,
      source: "auto",
      attemptNumber: 0,
      status: "Deferred",
    });

    await logConfirmationEvent({
      merchantId: order.merchantId,
      orderId: order.id,
      eventType: "CALL_DEFERRED",
      channel: "robocall",
      note: `${reason} — outside call window (${startTime}-${endTime}), will auto-send in next window`,
    });
    console.log(`${LOG_PREFIX} Outside call window for #${order.orderNumber}, will auto-send later`);
  }
}

async function getOrderCallStats(merchantId: string, orderId: string): Promise<{ totalAttempts: number; hasActivity: boolean; hasPendingCall: boolean; hasDeferred: boolean; latestCallTime: Date | null }> {
  const logs = await db.select({
    id: robocallLogs.id,
    status: robocallLogs.status,
    createdAt: robocallLogs.createdAt,
  }).from(robocallLogs)
    .where(and(eq(robocallLogs.merchantId, merchantId), eq(robocallLogs.orderId, orderId)))
    .orderBy(desc(robocallLogs.createdAt));

  const realLogs = logs.filter(l => l.status !== "Deferred");
  const totalAttempts = realLogs.length;
  const hasActivity = logs.length > 0;
  const hasPendingCall = logs.some(l => l.status === "Initiated");
  const hasDeferred = logs.some(l => l.status === "Deferred");
  const latestRealLog = realLogs.length > 0 ? realLogs[0] : null;
  const latestCallTime = latestRealLog && latestRealLog.createdAt ? new Date(latestRealLog.createdAt) : null;

  return { totalAttempts, hasActivity, hasPendingCall, hasDeferred, latestCallTime };
}

export async function checkAndSendPendingCalls(merchantId: string): Promise<void> {
  try {
    const merchant = await storage.getMerchant(merchantId);
    if (!merchant || merchant.robocallDisconnected) return;
    if (!merchant.robocallEmail || !merchant.robocallApiKey) return;

    const startTime = merchant.robocallStartTime || "10:00";
    const endTime = merchant.robocallEndTime || "20:00";
    if (!isWithinCallWindow(startTime, endTime)) return;

    const newOrderIdsWithRobocall = await db.selectDistinct({ orderId: robocallLogs.orderId })
      .from(robocallLogs)
      .where(eq(robocallLogs.merchantId, merchantId));
    const robocallOrderIds = newOrderIdsWithRobocall.map(r => r.orderId).filter(Boolean) as string[];

    const [pendingConfirmationOrders, newRobocallOrders] = await Promise.all([
      withRetry(() => db.select({
        id: orders.id,
        merchantId: orders.merchantId,
        orderNumber: orders.orderNumber,
        customerPhone: orders.customerPhone,
        totalAmount: orders.totalAmount,
        workflowStatus: orders.workflowStatus,
        lastStatusChangedAt: orders.lastStatusChangedAt,
      }).from(orders)
        .where(and(
          eq(orders.merchantId, merchantId),
          eq(orders.workflowStatus, "PENDING"),
          eq(orders.pendingReasonType, "confirmation_pending"),
          eq(orders.confirmationStatus, "pending"),
          isNotNull(orders.customerPhone),
        ))
        .orderBy(orders.lastStatusChangedAt)
        .limit(20), 'robocallService-checkPendingConfirmation'),

      robocallOrderIds.length > 0
        ? withRetry(() => db.select({
            id: orders.id,
            merchantId: orders.merchantId,
            orderNumber: orders.orderNumber,
            customerPhone: orders.customerPhone,
            totalAmount: orders.totalAmount,
            workflowStatus: orders.workflowStatus,
            lastStatusChangedAt: orders.lastStatusChangedAt,
          }).from(orders)
            .where(and(
              eq(orders.merchantId, merchantId),
              eq(orders.workflowStatus, "NEW"),
              eq(orders.confirmationStatus, "pending"),
              isNotNull(orders.customerPhone),
              inArray(orders.id, robocallOrderIds),
            ))
            .orderBy(orders.lastStatusChangedAt)
            .limit(20), 'robocallService-checkNewRobocall')
        : Promise.resolve([]),
    ]);

    const cutoff = new Date(Date.now() - MIN_PENDING_AGE_MS);

    for (const order of pendingConfirmationOrders) {
      const { hasActivity } = await getOrderCallStats(merchantId, order.id);
      if (hasActivity) {
        await processOrderForCall(order, merchant);
      } else {
        const changedAt = order.lastStatusChangedAt ? new Date(order.lastStatusChangedAt) : null;
        if (changedAt && changedAt <= cutoff) {
          await processOrderForCall(order, merchant);
        }
      }
    }

    for (const order of newRobocallOrders) {
      await processOrderForCall(order, merchant);
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} checkAndSendPendingCalls failed for merchant ${merchantId}:`, err.message);
  }
}

export async function retryFailedCalls(merchantId: string): Promise<void> {
  try {
    const merchant = await storage.getMerchant(merchantId);
    if (!merchant || merchant.robocallDisconnected) return;
    if (!merchant.robocallEmail || !merchant.robocallApiKey) return;

    const startTime = merchant.robocallStartTime || "10:00";
    const endTime = merchant.robocallEndTime || "20:00";
    if (!isWithinCallWindow(startTime, endTime)) return;

    const newOrderIdsWithRobocall = await db.selectDistinct({ orderId: robocallLogs.orderId })
      .from(robocallLogs)
      .where(eq(robocallLogs.merchantId, merchantId));
    const robocallOrderIds = newOrderIdsWithRobocall.map(r => r.orderId).filter(Boolean) as string[];

    const [pendingOrders, newRobocallOrders] = await Promise.all([
      withRetry(() => db.select({
        id: orders.id,
        merchantId: orders.merchantId,
        orderNumber: orders.orderNumber,
        customerPhone: orders.customerPhone,
        totalAmount: orders.totalAmount,
      }).from(orders)
        .where(and(
          eq(orders.merchantId, merchantId),
          eq(orders.workflowStatus, "PENDING"),
          eq(orders.pendingReasonType, "confirmation_pending"),
          eq(orders.confirmationStatus, "pending"),
          isNotNull(orders.customerPhone),
        ))
        .orderBy(orders.lastStatusChangedAt)
        .limit(15), 'robocallService-retryFailedPending'),

      robocallOrderIds.length > 0
        ? withRetry(() => db.select({
            id: orders.id,
            merchantId: orders.merchantId,
            orderNumber: orders.orderNumber,
            customerPhone: orders.customerPhone,
            totalAmount: orders.totalAmount,
          }).from(orders)
            .where(and(
              eq(orders.merchantId, merchantId),
              eq(orders.workflowStatus, "NEW"),
              eq(orders.confirmationStatus, "pending"),
              isNotNull(orders.customerPhone),
              inArray(orders.id, robocallOrderIds),
            ))
            .orderBy(orders.lastStatusChangedAt)
            .limit(15), 'robocallService-retryFailedNew')
        : Promise.resolve([]),
    ]);

    const allOrders = [...pendingOrders, ...newRobocallOrders];

    for (const order of allOrders) {
      const { totalAttempts, hasActivity, hasPendingCall, latestCallTime } = await getOrderCallStats(merchantId, order.id);
      if (!hasActivity || hasPendingCall) continue;

      const maxAttempts = merchant.robocallMaxAttempts ?? 3;
      if (totalAttempts >= maxAttempts) continue;

      if (latestCallTime) {
        const retryGap = (merchant.robocallRetryGapMinutes || 45) * 60 * 1000;
        if (Date.now() - latestCallTime.getTime() < retryGap) continue;
      }

      const formattedPhone = formatPhoneForWhatsApp(order.customerPhone);
      if (!formattedPhone) continue;

      await sendCallDirect({
        merchantId,
        merchant,
        orderId: order.id,
        orderNumber: order.orderNumber || "",
        phone: formattedPhone,
        amount: order.totalAmount || "0",
        brandName: merchant.name,
        source: "auto_retry",
        attemptNumber: totalAttempts + 1,
      });

      await new Promise(r => setTimeout(r, 500));
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} retryFailedCalls failed for merchant ${merchantId}:`, err.message);
  }
}

async function handleExhaustedAttempts(order: any, merchant: any, totalAttempts: number): Promise<void> {
  const currentOrder = await db.select({
    workflowStatus: orders.workflowStatus,
  }).from(orders).where(eq(orders.id, order.id)).limit(1);

  if (!currentOrder[0] || currentOrder[0].workflowStatus === "PENDING") return;

  const maxAttempts = merchant.robocallMaxAttempts ?? 3;

  await transitionOrder({
    merchantId: order.merchantId,
    orderId: order.id,
    toStatus: "PENDING",
    action: "robocall_exhausted",
    actorType: "system",
    reason: `All ${maxAttempts} robocall attempts exhausted (${totalAttempts} total)`,
    extraData: {
      pendingReasonType: "confirmation_pending",
      pendingReason: `All WA and RoboCall attempts exhausted (${maxAttempts} calls)`,
    },
  });

  await logConfirmationEvent({
    merchantId: order.merchantId,
    orderId: order.id,
    eventType: "ROBO_EXHAUSTED",
    channel: "robocall",
    note: `All ${maxAttempts} robocall attempts exhausted — moved to Confirmation Pending`,
  });

  await createNotification({
    merchantId: order.merchantId,
    type: "robocall_exhausted",
    title: `All robocall attempts exhausted for #${order.orderNumber}`,
    message: `${maxAttempts} call attempts failed. Order moved to Confirmation Pending for manual review.`,
    orderId: order.id,
    orderNumber: order.orderNumber || undefined,
  });

  console.log(`${LOG_PREFIX} Order #${order.orderNumber} moved to PENDING — all ${maxAttempts} robocall attempts exhausted`);
}

async function processOrderForCall(order: any, merchant: any): Promise<void> {
  const { totalAttempts, hasPendingCall, hasDeferred, latestCallTime } = await getOrderCallStats(order.merchantId, order.id);

  if (hasPendingCall) return;

  const maxAttempts = merchant.robocallMaxAttempts ?? 3;
  if (totalAttempts >= maxAttempts) {
    await handleExhaustedAttempts(order, merchant, totalAttempts);
    return;
  }

  if (latestCallTime) {
    const retryGap = (merchant.robocallRetryGapMinutes || 45) * 60 * 1000;
    if (Date.now() - latestCallTime.getTime() < retryGap) return;
  }

  const formattedPhone = formatPhoneForWhatsApp(order.customerPhone);
  if (!formattedPhone) return;

  const attemptNumber = totalAttempts + 1;

  if (hasDeferred) {
    await db.delete(robocallLogs).where(
      and(
        eq(robocallLogs.merchantId, order.merchantId),
        eq(robocallLogs.orderId, order.id),
        eq(robocallLogs.status, "Deferred"),
      )
    );
  }

  await sendCallDirect({
    merchantId: order.merchantId,
    merchant,
    orderId: order.id,
    orderNumber: order.orderNumber || "",
    phone: formattedPhone,
    amount: order.totalAmount || "0",
    brandName: merchant.name,
    source: totalAttempts === 0 ? "auto" : "auto_retry",
    attemptNumber,
  });

  await new Promise(r => setTimeout(r, 500));
}

async function checkCallResponses(): Promise<void> {
  try {
    const initiatedCalls = await withRetry(() => db.select().from(robocallLogs)
      .where(eq(robocallLogs.status, "Initiated"))
      .limit(20), 'robocallService-checkResponses');

    if (initiatedCalls.length === 0) return;

    console.log(`${LOG_PREFIX} Checking ${initiatedCalls.length} initiated calls`);

    const merchantCache = new Map<string, any>();

    for (const log of initiatedCalls) {
      if (!log.callId) continue;

      const [freshLog] = await db.select({ status: robocallLogs.status }).from(robocallLogs).where(eq(robocallLogs.id, log.id)).limit(1);
      if (freshLog && freshLog.status !== "Initiated") {
        console.log(`${LOG_PREFIX} Call ${log.callId} already processed by webhook (status=${freshLog.status}) — skipping poll`);
        continue;
      }

      let merchant = merchantCache.get(log.merchantId);
      if (!merchant) {
        merchant = await storage.getMerchant(log.merchantId);
        if (merchant) merchantCache.set(log.merchantId, merchant);
      }
      if (!merchant?.robocallEmail || !merchant?.robocallApiKey) continue;

      try {
        const statusUrl = `${ROBOCALL_API_BASE}/get-call?email=${encodeURIComponent(merchant.robocallEmail)}&key=${encodeURIComponent(merchant.robocallApiKey)}&id=${encodeURIComponent(log.callId)}`;
        const data = await safeFetchJson(statusUrl);
        const smsData = data?.sms;
        if (!smsData || smsData.voice_status === undefined) continue;

        const statusLabel = CALL_STATUS_LABELS[smsData.voice_status] || `Status ${smsData.voice_status}`;
        const dtmfValue = smsData.voice_dtmf && smsData.voice_dtmf > 0 ? smsData.voice_dtmf : null;

        const voiceSecPoll = typeof smsData.voice_sec === "number" ? smsData.voice_sec : null;
        await storage.updateRobocallLog(log.id, { status: statusLabel, dtmf: dtmfValue, ...(voiceSecPoll !== null ? { durationSeconds: voiceSecPoll } : {}) });

        if (!log.orderId) {
          await new Promise(r => setTimeout(r, 200));
          continue;
        }

        const [currentOrder] = await db.select({
          confirmationStatus: orders.confirmationStatus,
          workflowStatus: orders.workflowStatus,
          confirmationLocked: orders.confirmationLocked,
        }).from(orders).where(eq(orders.id, log.orderId)).limit(1);

        const TERMINAL_STATUSES_POLL = ["BOOKED", "FULFILLED", "DELIVERED", "RETURN", "CANCELLED"];
        const orderAlreadyResolved = !currentOrder ||
          currentOrder.confirmationLocked ||
          TERMINAL_STATUSES_POLL.includes(currentOrder.workflowStatus || "");

        if (orderAlreadyResolved) {
          const dtmfNote = dtmfValue ? ` — DTMF ${dtmfValue} (${dtmfValue === 1 ? "confirm" : dtmfValue === 2 ? "cancel" : "other"})` : "";
          await logConfirmationEvent({
            merchantId: log.merchantId,
            orderId: log.orderId,
            eventType: "CALL_RESPONSE",
            channel: "robocall",
            responseClassification: statusLabel,
            note: `Call ${statusLabel}${dtmfNote} (order already ${currentOrder?.confirmationStatus || "resolved"}, duration: ${smsData.voice_sec || 0}s)`,
            apiResponse: { voiceStatus: smsData.voice_status, voiceSec: smsData.voice_sec, dtmf: dtmfValue },
          });
          await new Promise(r => setTimeout(r, 200));
          continue;
        }

        if (smsData.voice_status === 4 && dtmfValue) {
          const action = dtmfValue === 1 ? "confirm" : dtmfValue === 2 ? "cancel" : null;
          if (action) {
            await processConfirmationResponse({
              merchantId: log.merchantId,
              orderId: log.orderId,
              source: "robocall",
              action,
              payload: { callId: log.callId, dtmf: dtmfValue, voiceStatus: smsData.voice_status, voiceSec: smsData.voice_sec },
            });
            console.log(`${LOG_PREFIX} DTMF ${dtmfValue} for #${log.orderNumber} → ${action}`);
          }
        } else if (FINAL_VOICE_STATUSES.includes(smsData.voice_status)) {
          await logConfirmationEvent({
            merchantId: log.merchantId,
            orderId: log.orderId,
            eventType: "CALL_RESPONSE",
            channel: "robocall",
            responseClassification: statusLabel,
            note: `Call ${statusLabel} — no DTMF input (attempt ${log.attemptNumber || 1}, duration: ${smsData.voice_sec || 0}s)`,
            apiResponse: { voiceStatus: smsData.voice_status, voiceSec: smsData.voice_sec, dtmf: dtmfValue },
          });

          const maxAttempts = merchant.robocallMaxAttempts ?? 3;
          const { totalAttempts } = await getOrderCallStats(log.merchantId, log.orderId);

          if (totalAttempts >= maxAttempts) {
            await transitionOrder({
              merchantId: log.merchantId,
              orderId: log.orderId,
              toStatus: "PENDING",
              action: "robocall_exhausted",
              actorType: "system",
              reason: `All ${maxAttempts} robocall attempts exhausted — last result: ${statusLabel}`,
              extraData: {
                pendingReasonType: "confirmation_pending",
                pendingReason: `All WA and RoboCall attempts exhausted (${maxAttempts} calls)`,
              },
            });

            await logConfirmationEvent({
              merchantId: log.merchantId,
              orderId: log.orderId,
              eventType: "ROBO_EXHAUSTED",
              channel: "robocall",
              note: `All ${maxAttempts} robocall attempts exhausted — moved to Confirmation Pending`,
            });

            await createNotification({
              merchantId: log.merchantId,
              type: "robocall_exhausted",
              title: `All robocall attempts exhausted for #${log.orderNumber}`,
              message: `${maxAttempts} call attempts failed (last: ${statusLabel}). Order moved to Confirmation Pending for manual review.`,
              orderId: log.orderId,
              orderNumber: log.orderNumber || undefined,
            });

            console.log(`${LOG_PREFIX} All ${maxAttempts} attempts exhausted for #${log.orderNumber} — moved to PENDING`);
          }
        } else if ([1, 8, 11].includes(smsData.voice_status)) {
          const createdTime = log.createdAt ? new Date(log.createdAt).getTime() : 0;
          const stuckMinutes = createdTime ? (Date.now() - createdTime) / 60000 : 0;

          if (stuckMinutes >= 10) {
            await storage.updateRobocallLog(log.id, { status: "No Response" });

            await logConfirmationEvent({
              merchantId: log.merchantId,
              orderId: log.orderId,
              eventType: "CALL_RESPONSE",
              channel: "robocall",
              responseClassification: `${statusLabel} (timed out)`,
              note: `Call stuck at "${statusLabel}" for ${Math.round(stuckMinutes)} minutes — treating as No Response`,
              apiResponse: { voiceStatus: smsData.voice_status, voiceSec: smsData.voice_sec },
            });

            const maxAttempts = merchant.robocallMaxAttempts ?? 3;
            const { totalAttempts } = await getOrderCallStats(log.merchantId, log.orderId);

            if (totalAttempts >= maxAttempts) {
              await transitionOrder({
                merchantId: log.merchantId,
                orderId: log.orderId,
                toStatus: "PENDING",
                action: "robocall_exhausted",
                actorType: "system",
                reason: `Robocall stuck at "${statusLabel}" — attempts exhausted`,
                extraData: {
                  pendingReasonType: "confirmation_pending",
                  pendingReason: `All WA and RoboCall attempts exhausted (${maxAttempts} calls)`,
                },
              });

              await createNotification({
                merchantId: log.merchantId,
                type: "robocall_exhausted",
                title: `RoboCall timed out for #${log.orderNumber}`,
                message: `Call stuck at "${statusLabel}" after ${maxAttempts} attempt(s). Order moved to Confirmation Pending.`,
                orderId: log.orderId,
                orderNumber: log.orderNumber || undefined,
              });

              console.log(`${LOG_PREFIX} Attempts exhausted for #${log.orderNumber} after "${statusLabel}" timeout — moved to PENDING`);
            }
          }
        }

        await new Promise(r => setTimeout(r, 200));
      } catch (err: any) {
        console.error(`${LOG_PREFIX} Status check failed for callId ${log.callId}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Response check failed:`, err.message);
  }
}

export async function processIvrWebhook(body: any): Promise<{ success: boolean; action?: string; skipped?: boolean; error?: string }> {
  const voiceId = String(body.voice_id || "").trim();
  const dtmfRaw = parseInt(body.dtmf, 10);
  const voiceStatus = parseInt(body.voice_status, 10);
  const voiceSecRaw = parseInt(body.voice_sec, 10);
  const voiceSec = Number.isFinite(voiceSecRaw) && voiceSecRaw >= 0 && body.voice_sec !== undefined && body.voice_sec !== "" ? voiceSecRaw : null;
  const orderNumber = body.order_number || "";
  const callerIdRaw = body.caller_id || "";
  const vsName = body.vs_name || "";

  if (!voiceId || !/^\d+$/.test(voiceId)) {
    return { success: false, error: "Invalid or missing voice_id" };
  }
  if (isNaN(voiceStatus) || voiceStatus < 1 || voiceStatus > 15) {
    return { success: false, error: "Invalid voice_status" };
  }
  if (!isNaN(dtmfRaw) && (dtmfRaw < 0 || dtmfRaw > 9)) {
    return { success: false, error: "Invalid dtmf value" };
  }

  console.log(`${LOG_PREFIX} [IVR-WEBHOOK] Received: voice_id=${voiceId} dtmf=${dtmfRaw} status=${voiceStatus} (${vsName}) order=${orderNumber}`);

  const [log] = await db.select().from(robocallLogs)
    .where(eq(robocallLogs.callId, voiceId))
    .limit(1);

  if (!log) {
    console.warn(`${LOG_PREFIX} [IVR-WEBHOOK] No robocall log found for callId=${voiceId} — ignoring`);
    return { success: false, error: "Call not found" };
  }

  const statusLabel = CALL_STATUS_LABELS[voiceStatus] || vsName || `Status ${voiceStatus}`;
  const dtmfValue = dtmfRaw > 0 ? dtmfRaw : null;

  const isPendingStatus = log.status === "Initiated" || log.status === "Queued" || log.status === "Sent to SIP";
  const hasNewDtmf = dtmfValue && !log.dtmf;
  if (!isPendingStatus && !hasNewDtmf) {
    console.log(`${LOG_PREFIX} [IVR-WEBHOOK] Call ${voiceId} already processed (status=${log.status}, dtmf=${log.dtmf}) — skipping`);
    return { success: true, skipped: true };
  }

  await storage.updateRobocallLog(log.id, { status: statusLabel, dtmf: dtmfValue, ...(voiceSec !== null ? { durationSeconds: voiceSec } : {}) });

  if (!log.orderId) {
    console.log(`${LOG_PREFIX} [IVR-WEBHOOK] Call ${voiceId} has no orderId — log updated, no order action`);
    return { success: true, action: "log_updated" };
  }

  const [currentOrder] = await db.select({
    confirmationStatus: orders.confirmationStatus,
    workflowStatus: orders.workflowStatus,
    confirmationLocked: orders.confirmationLocked,
  }).from(orders).where(eq(orders.id, log.orderId)).limit(1);

  const TERMINAL_STATUSES_WEBHOOK = ["BOOKED", "FULFILLED", "DELIVERED", "RETURN", "CANCELLED"];
  const orderAlreadyResolved = !currentOrder ||
    currentOrder.confirmationLocked ||
    TERMINAL_STATUSES_WEBHOOK.includes(currentOrder.workflowStatus || "");

  if (orderAlreadyResolved) {
    const dtmfNote = dtmfValue ? ` — DTMF ${dtmfValue} (${dtmfValue === 1 ? "confirm" : dtmfValue === 2 ? "cancel" : "other"})` : "";
    await logConfirmationEvent({
      merchantId: log.merchantId,
      orderId: log.orderId,
      eventType: "CALL_RESPONSE",
      channel: "robocall",
      responseClassification: statusLabel,
      note: `[Webhook] Call ${statusLabel}${dtmfNote} (order already ${currentOrder?.confirmationStatus || "resolved"}, duration: ${voiceSec}s)`,
      apiResponse: { voiceStatus, voiceSec, dtmf: dtmfValue, source: "ivr_webhook" },
    });
    return { success: true, action: "order_already_resolved" };
  }

  if (voiceStatus === 4 && dtmfValue) {
    const action = dtmfValue === 1 ? "confirm" : dtmfValue === 2 ? "cancel" : null;
    if (action) {
      await processConfirmationResponse({
        merchantId: log.merchantId,
        orderId: log.orderId,
        source: "robocall",
        action,
        payload: { callId: log.callId, dtmf: dtmfValue, voiceStatus, voiceSec, source: "ivr_webhook" },
      });
      console.log(`${LOG_PREFIX} [IVR-WEBHOOK] DTMF ${dtmfValue} for #${log.orderNumber} → ${action} (real-time)`);
      return { success: true, action };
    }
  }

  if (FINAL_VOICE_STATUSES.includes(voiceStatus)) {
    await logConfirmationEvent({
      merchantId: log.merchantId,
      orderId: log.orderId,
      eventType: "CALL_RESPONSE",
      channel: "robocall",
      responseClassification: statusLabel,
      note: `[Webhook] Call ${statusLabel} — no DTMF input (attempt ${log.attemptNumber || 1}, duration: ${voiceSec}s)`,
      apiResponse: { voiceStatus, voiceSec, dtmf: dtmfValue, source: "ivr_webhook" },
    });

    const merchant = await storage.getMerchant(log.merchantId);
    if (merchant) {
      const maxAttempts = merchant.robocallMaxAttempts ?? 3;
      const { totalAttempts } = await getOrderCallStats(log.merchantId, log.orderId);

      if (totalAttempts >= maxAttempts) {
        await transitionOrder({
          merchantId: log.merchantId,
          orderId: log.orderId,
          toStatus: "PENDING",
          action: "robocall_exhausted",
          actorType: "system",
          reason: `All ${maxAttempts} robocall attempts exhausted — last result: ${statusLabel} (webhook)`,
          extraData: {
            pendingReasonType: "confirmation_pending",
            pendingReason: `All WA and RoboCall attempts exhausted (${maxAttempts} calls)`,
          },
        });

        await logConfirmationEvent({
          merchantId: log.merchantId,
          orderId: log.orderId,
          eventType: "ROBO_EXHAUSTED",
          channel: "robocall",
          note: `[Webhook] All ${maxAttempts} robocall attempts exhausted — moved to Confirmation Pending`,
        });

        await createNotification({
          merchantId: log.merchantId,
          type: "robocall_exhausted",
          title: `All robocall attempts exhausted for #${log.orderNumber}`,
          message: `${maxAttempts} call attempts failed (last: ${statusLabel}). Order moved to Confirmation Pending for manual review.`,
          orderId: log.orderId,
          orderNumber: log.orderNumber || undefined,
        });

        console.log(`${LOG_PREFIX} [IVR-WEBHOOK] All ${maxAttempts} attempts exhausted for #${log.orderNumber} — moved to PENDING`);
        return { success: true, action: "exhausted_pending" };
      }
    }

    return { success: true, action: "no_dtmf" };
  }

  return { success: true, action: "non_final_status" };
}

const HOLD_REMINDER_THRESHOLD_MS = 24 * 60 * 60 * 1000;

async function checkHoldEscalations(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - HOLD_REMINDER_THRESHOLD_MS);

    const holdOrders = await withRetry(() =>
      db.select({
        id: orders.id,
        merchantId: orders.merchantId,
        orderNumber: orders.orderNumber,
        lastStatusChangedAt: orders.lastStatusChangedAt,
      }).from(orders)
        .where(and(
          eq(orders.workflowStatus, "HOLD"),
          lt(orders.lastStatusChangedAt, cutoff),
        ))
        .orderBy(orders.lastStatusChangedAt)
        .limit(30),
      'robocallService-checkHoldEscalations',
    );

    if (holdOrders.length === 0) return;

    const orderIds = holdOrders.map(o => o.id);
    const reminderCutoff = new Date(Date.now() - HOLD_REMINDER_THRESHOLD_MS);

    const [recentReminders, holdAuditEntries] = await Promise.all([
      db.select({ orderId: notifications.orderId })
        .from(notifications)
        .where(and(
          inArray(notifications.orderId, orderIds),
          eq(notifications.type, "hold_reminder"),
          gt(notifications.createdAt, reminderCutoff),
        )),
      db.select({ orderId: workflowAuditLog.orderId, reason: workflowAuditLog.reason })
        .from(workflowAuditLog)
        .where(and(
          inArray(workflowAuditLog.orderId, orderIds),
          eq(workflowAuditLog.toStatus, "HOLD"),
        ))
        .orderBy(desc(workflowAuditLog.createdAt))
        .limit(orderIds.length * 3),
    ]);

    const recentlyRemindedIds = new Set(recentReminders.map(r => r.orderId).filter(Boolean));
    const holdReasonMap: Record<string, string | null> = {};
    for (const entry of holdAuditEntries) {
      if (!(entry.orderId in holdReasonMap)) {
        holdReasonMap[entry.orderId] = entry.reason || null;
      }
    }

    for (const order of holdOrders) {
      if (recentlyRemindedIds.has(order.id)) continue;

      try {
        const heldMs = order.lastStatusChangedAt
          ? Date.now() - new Date(order.lastStatusChangedAt).getTime()
          : HOLD_REMINDER_THRESHOLD_MS;
        const heldHours = Math.floor(heldMs / 3600000);
        const heldMins = Math.floor((heldMs % 3600000) / 60000);
        const heldDuration = heldHours > 0 ? `${heldHours}h ${heldMins}m` : `${heldMins}m`;
        const holdReason = holdReasonMap[order.id];

        await createNotification({
          merchantId: order.merchantId,
          type: "hold_reminder",
          title: `Order #${order.orderNumber} stuck in Hold`,
          message: `This order has been in Hold for ${heldDuration}${holdReason ? ` — Reason: ${holdReason}` : ""}. Please take manual action.`,
          orderId: order.id,
          orderNumber: order.orderNumber || undefined,
        });

        console.log(`${LOG_PREFIX} Hold reminder sent for #${order.orderNumber} (held ${heldDuration})`);
        await new Promise(r => setTimeout(r, 100));
      } catch (orderErr: any) {
        console.error(`${LOG_PREFIX} Hold escalation check failed for order ${order.id}:`, orderErr.message);
      }
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Hold escalation check failed:`, err.message);
  }
}

let responseInterval: ReturnType<typeof setInterval> | null = null;
let holdEscalationInterval: ReturnType<typeof setInterval> | null = null;

export function startRobocallService() {
  if (responseInterval) return;
  console.log(`${LOG_PREFIX} Started — response check every ${RESPONSE_CHECK_INTERVAL_MS / 60000}min (pending checks run via confirmationTimer)`);
  responseInterval = setInterval(checkCallResponses, RESPONSE_CHECK_INTERVAL_MS);
  setTimeout(checkCallResponses, 60_000);
  holdEscalationInterval = setInterval(checkHoldEscalations, RESPONSE_CHECK_INTERVAL_MS);
  setTimeout(checkHoldEscalations, 5 * 60_000);
}

export function stopRobocallService() {
  if (responseInterval) { clearInterval(responseInterval); responseInterval = null; }
  if (holdEscalationInterval) { clearInterval(holdEscalationInterval); holdEscalationInterval = null; }
  console.log(`${LOG_PREFIX} Stopped`);
}
