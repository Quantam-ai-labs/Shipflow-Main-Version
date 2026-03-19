import { db, withRetry } from "../db";
import { orders, merchants, robocallLogs } from "@shared/schema";
import { eq, and, isNull, isNotNull, desc, lte } from "drizzle-orm";
import { logConfirmationEvent, processConfirmationResponse, createNotification } from "./confirmationEngine";
import { storage } from "../storage";
import { transitionOrder } from "./workflowTransition";
import { formatPhoneForWhatsApp } from "../utils/integrations/whatsapp/sender";

const LOG_PREFIX = "[RobocallService]";
const ROBOCALL_API_BASE = "https://app.brandedsmspakistan.com/api";
const RESPONSE_CHECK_INTERVAL_MS = 3 * 60 * 1000;
const PENDING_CHECK_INTERVAL_MS = 5 * 60 * 1000;
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

  const data = await safeFetchJson(`${ROBOCALL_API_BASE}/send-voice?${urlParams.toString()}`);
  const smsData = data?.sms || data;
  const callId = smsData?.id || smsData?.call_id || data?.data?.call_id || null;

  if (callId) {
    await db.insert(robocallLogs).values({
      merchantId,
      callId: String(callId),
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
    await db.insert(robocallLogs).values({
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
      status: "Error",
      error: errorMsg,
    });

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

async function getOrderCallStats(merchantId: string, orderId: string): Promise<{ totalAttempts: number; hasPendingCall: boolean; latestCallTime: Date | null }> {
  const logs = await db.select({
    id: robocallLogs.id,
    status: robocallLogs.status,
    createdAt: robocallLogs.createdAt,
  }).from(robocallLogs)
    .where(and(eq(robocallLogs.merchantId, merchantId), eq(robocallLogs.orderId, orderId)))
    .orderBy(desc(robocallLogs.createdAt));

  const totalAttempts = logs.length;
  const hasPendingCall = logs.some(l => l.status === "Initiated");
  const latestCallTime = logs.length > 0 && logs[0].createdAt ? new Date(logs[0].createdAt) : null;

  return { totalAttempts, hasPendingCall, latestCallTime };
}

export async function checkAndSendPendingCalls(merchantId: string): Promise<void> {
  try {
    const merchant = await storage.getMerchant(merchantId);
    if (!merchant || merchant.robocallDisconnected) return;
    if (!merchant.robocallEmail || !merchant.robocallApiKey) return;

    const startTime = merchant.robocallStartTime || "10:00";
    const endTime = merchant.robocallEndTime || "20:00";
    if (!isWithinCallWindow(startTime, endTime)) return;

    const cutoff = new Date(Date.now() - MIN_PENDING_AGE_MS);

    const pendingOrders = await withRetry(() => db.select({
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
        lte(orders.lastStatusChangedAt, cutoff),
      ))
      .limit(20), 'robocallService-checkPendingMerchant');

    for (const order of pendingOrders) {
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

    const pendingOrders = await withRetry(() => db.select({
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
      .limit(20), 'robocallService-retryFailed');

    for (const order of pendingOrders) {
      const { totalAttempts, hasPendingCall, latestCallTime } = await getOrderCallStats(merchantId, order.id);
      if (totalAttempts === 0 || hasPendingCall) continue;

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

async function processOrderForCall(order: any, merchant: any): Promise<void> {
  const { totalAttempts, hasPendingCall, latestCallTime } = await getOrderCallStats(order.merchantId, order.id);

  if (hasPendingCall) return;

  const maxAttempts = merchant.robocallMaxAttempts ?? 3;
  if (totalAttempts >= maxAttempts) return;

  if (latestCallTime) {
    const retryGap = (merchant.robocallRetryGapMinutes || 45) * 60 * 1000;
    if (Date.now() - latestCallTime.getTime() < retryGap) return;
  }

  const formattedPhone = formatPhoneForWhatsApp(order.customerPhone);
  if (!formattedPhone) return;

  const attemptNumber = totalAttempts + 1;

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

async function checkPendingOrdersForRobocall(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - MIN_PENDING_AGE_MS);

    const pendingOrders = await withRetry(() => db.select({
      id: orders.id,
      merchantId: orders.merchantId,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      totalAmount: orders.totalAmount,
      confirmationStatus: orders.confirmationStatus,
      workflowStatus: orders.workflowStatus,
      pendingReasonType: orders.pendingReasonType,
    }).from(orders)
      .where(and(
        eq(orders.workflowStatus, "PENDING"),
        eq(orders.pendingReasonType, "confirmation_pending"),
        eq(orders.confirmationStatus, "pending"),
        isNotNull(orders.customerPhone),
        lte(orders.lastStatusChangedAt, cutoff),
      ))
      .limit(50), 'robocallService-checkPending');

    if (pendingOrders.length === 0) return;

    const merchantCache = new Map<string, any>();

    for (const order of pendingOrders) {
      try {
        let merchant = merchantCache.get(order.merchantId);
        if (!merchant) {
          merchant = await storage.getMerchant(order.merchantId);
          if (merchant) merchantCache.set(order.merchantId, merchant);
        }
        if (!merchant || merchant.robocallDisconnected) continue;
        if (!merchant.robocallEmail || !merchant.robocallApiKey) continue;

        const startTime = merchant.robocallStartTime || "10:00";
        const endTime = merchant.robocallEndTime || "20:00";
        if (!isWithinCallWindow(startTime, endTime)) continue;

        await processOrderForCall(order, merchant);
      } catch (err: any) {
        console.error(`${LOG_PREFIX} Error processing pending order ${order.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Pending orders check failed:`, err.message);
  }
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

        await storage.updateRobocallLog(log.id, { status: statusLabel, dtmf: dtmfValue });

        if (!log.orderId) {
          await new Promise(r => setTimeout(r, 200));
          continue;
        }

        const [currentOrder] = await db.select({
          confirmationStatus: orders.confirmationStatus,
          workflowStatus: orders.workflowStatus,
          confirmationLocked: orders.confirmationLocked,
        }).from(orders).where(eq(orders.id, log.orderId)).limit(1);

        const orderAlreadyResolved = !currentOrder ||
          currentOrder.confirmationStatus !== "pending" ||
          currentOrder.confirmationLocked ||
          !["NEW", "PENDING"].includes(currentOrder.workflowStatus || "");

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
              toStatus: "HOLD",
              action: "robocall_exhausted",
              actorType: "system",
              reason: `All ${maxAttempts} robocall attempts exhausted — last result: ${statusLabel}`,
            });

            await logConfirmationEvent({
              merchantId: log.merchantId,
              orderId: log.orderId,
              eventType: "ROBO_EXHAUSTED",
              channel: "robocall",
              note: `All ${maxAttempts} robocall attempts exhausted — moved to Hold`,
            });

            await createNotification({
              merchantId: log.merchantId,
              type: "robocall_exhausted",
              title: `All robocall attempts exhausted for #${log.orderNumber}`,
              message: `${maxAttempts} call attempts failed (last: ${statusLabel}). Order moved to Hold for manual resolution.`,
              orderId: log.orderId,
              orderNumber: log.orderNumber || undefined,
            });

            console.log(`${LOG_PREFIX} All ${maxAttempts} attempts exhausted for #${log.orderNumber} — moved to HOLD`);
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
                toStatus: "HOLD",
                action: "robocall_exhausted",
                actorType: "system",
                reason: `Robocall stuck at "${statusLabel}" — attempts exhausted`,
              });

              await createNotification({
                merchantId: log.merchantId,
                type: "robocall_exhausted",
                title: `RoboCall timed out for #${log.orderNumber}`,
                message: `Call stuck at "${statusLabel}" after ${maxAttempts} attempt(s). Order moved to Hold.`,
                orderId: log.orderId,
                orderNumber: log.orderNumber || undefined,
              });

              console.log(`${LOG_PREFIX} Attempts exhausted for #${log.orderNumber} after "${statusLabel}" timeout — moved to HOLD`);
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

let responseInterval: ReturnType<typeof setInterval> | null = null;

export function startRobocallService() {
  if (responseInterval) return;
  console.log(`${LOG_PREFIX} Started — response check every ${RESPONSE_CHECK_INTERVAL_MS / 60000}min (pending checks run via confirmationTimer)`);
  responseInterval = setInterval(checkCallResponses, RESPONSE_CHECK_INTERVAL_MS);
  setTimeout(checkCallResponses, 60_000);
}

export function stopRobocallService() {
  if (responseInterval) { clearInterval(responseInterval); responseInterval = null; }
  console.log(`${LOG_PREFIX} Stopped`);
}
