import { db } from "../db";
import { orders, merchants, robocallQueue, robocallLogs } from "@shared/schema";
import { eq, and, lte, or, isNotNull, isNull } from "drizzle-orm";
import { logConfirmationEvent, processConfirmationResponse, createNotification } from "./confirmationEngine";
import { storage } from "../storage";
import { transitionOrder } from "./workflowTransition";

const LOG_PREFIX = "[RobocallQueue]";
const PROCESS_INTERVAL_MS = 2 * 60 * 1000;
const ROBOCALL_API_BASE = "https://api.robocall.pk/api/v1";
const NO_DTMF_STATUSES = [2, 3, 5, 6];

function isWithinCallWindow(startTime: string, endTime: string): boolean {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentMinutes = hours * 60 + minutes;
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  return currentMinutes >= (startH * 60 + startM) && currentMinutes < (endH * 60 + endM);
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

function computeNextRetryAt(retryGapMinutes: number, startTime: string, endTime: string): Date {
  const candidate = new Date(Date.now() + retryGapMinutes * 60 * 1000);
  const candidateMinutes = candidate.getHours() * 60 + candidate.getMinutes();
  const [endH, endM] = endTime.split(":").map(Number);
  const endMinutes = endH * 60 + endM;
  if (candidateMinutes >= endMinutes) {
    return getNextCallWindowStart(startTime);
  }
  const [startH, startM] = startTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  if (candidateMinutes < startMinutes) {
    const target = new Date(candidate);
    target.setHours(startH, startM, 0, 0);
    return target;
  }
  return candidate;
}

async function safeFetchJson(url: string): Promise<any> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text, error: "Invalid JSON response" };
    }
  } catch (err: any) {
    return { raw: null, error: err.message || "Network error" };
  }
}

async function processQueue() {
  try {
    const now = new Date();

    const queueEntries = await db.select().from(robocallQueue)
      .where(and(
        eq(robocallQueue.status, "waiting"),
        or(
          and(lte(robocallQueue.scheduledAt, now), isNull(robocallQueue.nextRetryAt)),
          lte(robocallQueue.nextRetryAt, now),
        ),
      ))
      .limit(10);

    if (queueEntries.length === 0) return;

    console.log(`${LOG_PREFIX} Processing ${queueEntries.length} queued calls`);

    const merchantCache = new Map<string, any>();

    for (const entry of queueEntries) {
      try {
        const [order] = await db.select({
          confirmationStatus: orders.confirmationStatus,
          waResponseAt: orders.waResponseAt,
          confirmationLocked: orders.confirmationLocked,
          workflowStatus: orders.workflowStatus,
        }).from(orders).where(eq(orders.id, entry.orderId)).limit(1);

        if (!order) {
          await db.update(robocallQueue).set({ status: "skipped", completedAt: now })
            .where(eq(robocallQueue.id, entry.id));
          continue;
        }

        if (order.waResponseAt || order.confirmationStatus !== "pending" || order.confirmationLocked) {
          await db.update(robocallQueue).set({
            status: "skipped",
            waResponseArrived: !!order.waResponseAt,
            completedAt: now,
          }).where(eq(robocallQueue.id, entry.id));
          console.log(`${LOG_PREFIX} Skipped #${entry.orderNumber} — WA response arrived or already processed`);
          continue;
        }

        let merchant = merchantCache.get(entry.merchantId);
        if (!merchant) {
          merchant = await storage.getMerchant(entry.merchantId);
          if (merchant) merchantCache.set(entry.merchantId, merchant);
        }

        if (!merchant?.robocallEmail || !merchant?.robocallApiKey) {
          await db.update(robocallQueue).set({ status: "failed", completedAt: now })
            .where(eq(robocallQueue.id, entry.id));
          continue;
        }

        const startTime = merchant.robocallStartTime || "10:00";
        const endTime = merchant.robocallEndTime || "20:00";
        if (!isWithinCallWindow(startTime, endTime)) {
          console.log(`${LOG_PREFIX} Outside call window for #${entry.orderNumber}, will retry later`);
          continue;
        }

        await db.update(robocallQueue).set({ status: "sending" })
          .where(eq(robocallQueue.id, entry.id));

        const voiceId = merchant.robocallVoiceId || "735";
        const sendUrl = `${ROBOCALL_API_BASE}/send-voice-otp?email=${encodeURIComponent(merchant.robocallEmail)}&key=${encodeURIComponent(merchant.robocallApiKey)}&voice_id=${voiceId}&receiver=${encodeURIComponent(entry.phone)}&amount=${encodeURIComponent(entry.amount || "0")}&brand_name=${encodeURIComponent(entry.brandName || merchant.name)}&order_number=${encodeURIComponent(entry.orderNumber || "")}`;

        const data = await safeFetchJson(sendUrl);
        const smsData = data?.sms || data;
        const callId = smsData?.id || smsData?.call_id || data?.data?.call_id || null;

        if (callId) {
          await db.insert(robocallLogs).values({
            merchantId: entry.merchantId,
            callId: String(callId),
            phone: entry.phone,
            amount: entry.amount,
            voiceId,
            brandName: entry.brandName,
            orderNumber: entry.orderNumber,
            status: "Initiated",
          });

          await db.update(robocallQueue).set({
            callId: String(callId),
            attemptCount: (entry.attemptCount || 0) + 1,
            status: "completed",
            completedAt: now,
          }).where(eq(robocallQueue.id, entry.id));

          await logConfirmationEvent({
            merchantId: entry.merchantId,
            orderId: entry.orderId,
            eventType: "CALL_ATTEMPTED",
            channel: "robocall",
            apiResponse: data,
            note: `RoboCall sent — call ID: ${callId}`,
          });

          console.log(`${LOG_PREFIX} Call sent for #${entry.orderNumber} — callId: ${callId}`);
        } else {
          await db.update(robocallQueue).set({
            status: "failed",
            attemptCount: (entry.attemptCount || 0) + 1,
            completedAt: now,
          }).where(eq(robocallQueue.id, entry.id));

          await logConfirmationEvent({
            merchantId: entry.merchantId,
            orderId: entry.orderId,
            eventType: "CALL_ATTEMPTED",
            channel: "robocall",
            apiResponse: data,
            errorDetails: data?.error || "No call ID returned",
            note: "RoboCall send failed",
          });

          await createNotification({
            merchantId: entry.merchantId,
            type: "robocall_failed",
            title: `RoboCall failed for #${entry.orderNumber}`,
            message: `Failed to send robocall: ${data?.error || "No call ID returned"}`,
            orderId: entry.orderId,
            orderNumber: entry.orderNumber || undefined,
          });
        }

        await new Promise(r => setTimeout(r, 500));
      } catch (err: any) {
        console.error(`${LOG_PREFIX} Failed to process queue entry ${entry.id}:`, err.message);
        await db.update(robocallQueue).set({ status: "failed", completedAt: now })
          .where(eq(robocallQueue.id, entry.id));
      }
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Queue processing failed:`, err.message);
  }
}

async function checkRobocallResponses() {
  try {
    const FINAL_VOICE_STATUSES = [2, 3, 4, 5, 6, 7, 9, 10];

    const recentCalls = await db.select().from(robocallQueue)
      .where(and(
        eq(robocallQueue.status, "completed"),
        isNotNull(robocallQueue.callId),
      ))
      .limit(20);

    if (recentCalls.length === 0) return;

    const merchantCache = new Map<string, any>();

    for (const entry of recentCalls) {
      if (!entry.callId) continue;

      let merchant = merchantCache.get(entry.merchantId);
      if (!merchant) {
        merchant = await storage.getMerchant(entry.merchantId);
        if (merchant) merchantCache.set(entry.merchantId, merchant);
      }
      if (!merchant?.robocallEmail || !merchant?.robocallApiKey) continue;

      try {
        const statusUrl = `${ROBOCALL_API_BASE}/get-call?email=${encodeURIComponent(merchant.robocallEmail)}&key=${encodeURIComponent(merchant.robocallApiKey)}&id=${encodeURIComponent(entry.callId)}`;
        const data = await safeFetchJson(statusUrl);
        const smsData = data?.sms;
        if (!smsData || smsData.voice_status === undefined) continue;

        const CALL_STATUS_LABELS: Record<number, string> = { 1: "Initiated", 2: "Congestion", 3: "No Response", 4: "Answered", 5: "Busy", 6: "Hangup", 7: "Limit Exceeded", 8: "Sent to SIP", 9: "Verified", 10: "Deleted", 11: "Queued" };
        const statusLabel = CALL_STATUS_LABELS[smsData.voice_status] || `Status ${smsData.voice_status}`;
        const dtmfValue = smsData.voice_dtmf && smsData.voice_dtmf > 0 ? smsData.voice_dtmf : null;

        const log = await storage.getRobocallLogByCallId(entry.merchantId, entry.callId);
        if (log) {
          await storage.updateRobocallLog(log.id, { status: statusLabel, dtmf: dtmfValue });
        }

        const [currentOrder] = await db.select({
          confirmationStatus: orders.confirmationStatus,
          workflowStatus: orders.workflowStatus,
          confirmationLocked: orders.confirmationLocked,
        }).from(orders).where(eq(orders.id, entry.orderId)).limit(1);

        const orderAlreadyResolved = !currentOrder ||
          currentOrder.confirmationStatus !== "pending" ||
          currentOrder.confirmationLocked ||
          !["NEW", "PENDING"].includes(currentOrder.workflowStatus || "");

        if (orderAlreadyResolved) {
          await db.update(robocallQueue).set({
            status: "skipped",
            lastCallResult: `${statusLabel} (order already resolved)`,
            completedAt: new Date(),
          }).where(eq(robocallQueue.id, entry.id));
          console.log(`${LOG_PREFIX} Skipping response for #${entry.orderNumber} — order already resolved (${currentOrder?.confirmationStatus}/${currentOrder?.workflowStatus})`);
          continue;
        }

        if (smsData.voice_status === 4 && dtmfValue) {
          const action = dtmfValue === 1 ? "confirm" : dtmfValue === 2 ? "cancel" : null;
          if (action) {
            await processConfirmationResponse({
              merchantId: entry.merchantId,
              orderId: entry.orderId,
              source: "robocall",
              action,
              payload: { callId: entry.callId, dtmf: dtmfValue, voiceStatus: smsData.voice_status, voiceSec: smsData.voice_sec },
            });

            console.log(`${LOG_PREFIX} DTMF ${dtmfValue} for #${entry.orderNumber} → ${action}`);
          }

          await db.update(robocallQueue).set({
            status: "processed",
            lastCallResult: statusLabel,
            completedAt: new Date(),
          }).where(eq(robocallQueue.id, entry.id));
        } else if (FINAL_VOICE_STATUSES.includes(smsData.voice_status)) {
          await logConfirmationEvent({
            merchantId: entry.merchantId,
            orderId: entry.orderId,
            eventType: "CALL_RESPONSE",
            channel: "robocall",
            responseClassification: statusLabel,
            note: `Call ${statusLabel} — no DTMF input (attempt ${entry.attemptCount}/${entry.maxAttempts || 3}, duration: ${smsData.voice_sec || 0}s)`,
            apiResponse: { voiceStatus: smsData.voice_status, voiceSec: smsData.voice_sec, dtmf: dtmfValue },
          });

          const maxAttempts = entry.maxAttempts || 3;
          const currentAttempts = entry.attemptCount || 0;

          if (NO_DTMF_STATUSES.includes(smsData.voice_status) && currentAttempts < maxAttempts) {
            const startTime = merchant.robocallStartTime || "10:00";
            const endTime = merchant.robocallEndTime || "20:00";
            const retryGap = merchant.robocallRetryGapMinutes || 45;
            const nextRetry = computeNextRetryAt(retryGap, startTime, endTime);

            await db.update(robocallQueue).set({
              status: "waiting",
              lastCallResult: statusLabel,
              nextRetryAt: nextRetry,
              callId: null,
            }).where(eq(robocallQueue.id, entry.id));

            console.log(`${LOG_PREFIX} Call ${statusLabel} for #${entry.orderNumber} — retry ${currentAttempts}/${maxAttempts}, next at ${nextRetry.toISOString()}`);
          } else if (currentAttempts >= maxAttempts) {
            await db.update(robocallQueue).set({
              status: "exhausted",
              lastCallResult: statusLabel,
              completedAt: new Date(),
            }).where(eq(robocallQueue.id, entry.id));

            await transitionOrder({
              merchantId: entry.merchantId,
              orderId: entry.orderId,
              toStatus: "HOLD",
              action: "robocall_exhausted",
              actorType: "system",
              reason: `All ${maxAttempts} robocall attempts exhausted — last result: ${statusLabel}`,
            });

            await logConfirmationEvent({
              merchantId: entry.merchantId,
              orderId: entry.orderId,
              eventType: "ROBO_EXHAUSTED",
              channel: "robocall",
              note: `All ${maxAttempts} robocall attempts exhausted — moved to Hold`,
            });

            await createNotification({
              merchantId: entry.merchantId,
              type: "robocall_exhausted",
              title: `All robocall attempts exhausted for #${entry.orderNumber}`,
              message: `${maxAttempts} call attempts failed (last: ${statusLabel}). Order moved to Hold for manual resolution.`,
              orderId: entry.orderId,
              orderNumber: entry.orderNumber || undefined,
            });

            console.log(`${LOG_PREFIX} All ${maxAttempts} attempts exhausted for #${entry.orderNumber} — moved to HOLD`);
          } else {
            await db.update(robocallQueue).set({
              status: "processed",
              lastCallResult: statusLabel,
              completedAt: new Date(),
            }).where(eq(robocallQueue.id, entry.id));
          }
        }

        await new Promise(r => setTimeout(r, 200));
      } catch (err: any) {
        console.error(`${LOG_PREFIX} Status check failed for callId ${entry.callId}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Response check failed:`, err.message);
  }
}

let queueInterval: ReturnType<typeof setInterval> | null = null;
let responseInterval: ReturnType<typeof setInterval> | null = null;

export function startRobocallQueueProcessor() {
  if (queueInterval) return;
  console.log(`${LOG_PREFIX} Started — processing every ${PROCESS_INTERVAL_MS / 60000} minutes`);
  queueInterval = setInterval(processQueue, PROCESS_INTERVAL_MS);
  responseInterval = setInterval(checkRobocallResponses, 3 * 60 * 1000);
  setTimeout(processQueue, 60_000);
}

export function stopRobocallQueueProcessor() {
  if (queueInterval) { clearInterval(queueInterval); queueInterval = null; }
  if (responseInterval) { clearInterval(responseInterval); responseInterval = null; }
  console.log(`${LOG_PREFIX} Stopped`);
}
