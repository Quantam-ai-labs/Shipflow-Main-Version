import { db } from "../../../db";
import { orderChangeLog, merchants, orders } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import type { WaAutomation } from "@shared/schema";
import { storage } from "../../../storage";
import {
  buildVarsFromParams,
  buildTemplateParamsFromBody,
  extractMessageTextParams,
  interpolateMessageBody,
  getStatusLabel,
  WA_NOTIFY_STATUSES,
} from "./variables";
import { waMetaTemplates } from "@shared/schema";
import { formatPhoneForWhatsApp, sendWhatsAppApiRequest } from "./sender";
import type { OrderNotificationParams } from "./types";

export {
  WA_VARIABLE_CHIPS,
  interpolateMessageBody,
  STATUS_LABELS,
  getStatusLabel,
  WA_NOTIFY_STATUSES,
} from "./variables";
export type { WaNotifyStatus } from "./variables";
export { formatPhoneForWhatsApp } from "./sender";
export type { SendResult, OrderNotificationParams } from "./types";

const LOG_PREFIX = "[WhatsApp]";

const waSendingInProgress = new Map<string, number>();
const WA_DEDUP_TTL_MS = 5 * 60 * 1000;

function claimSend(key: string): boolean {
  const now = Date.now();
  const existing = waSendingInProgress.get(key);
  if (existing && now - existing < WA_DEDUP_TTL_MS) {
    return false;
  }
  waSendingInProgress.set(key, now);
  if (waSendingInProgress.size > 5000) {
    for (const [k, t] of waSendingInProgress) {
      if (now - t > WA_DEDUP_TTL_MS) waSendingInProgress.delete(k);
    }
  }
  return true;
}

function releaseClaim(key: string) {
  waSendingInProgress.delete(key);
}

export interface WaSendOutcome {
  sent: boolean;
  notOnWhatsApp: boolean;
  error?: string;
  automationId?: string;
  retryAttempts?: Array<{ messageText: string; delayHours: number }> | null;
}

export async function sendOrderStatusWhatsApp(
  params: OrderNotificationParams,
): Promise<WaSendOutcome> {
  const SKIP = { sent: false, notOnWhatsApp: false } as WaSendOutcome;

  if (!(WA_NOTIFY_STATUSES as readonly string[]).includes(params.toStatus))
    return SKIP;

  const merchant = await storage.getMerchant(params.merchantId);
  if (!merchant) {
    console.log(`${LOG_PREFIX} Merchant ${params.merchantId} not found, skipping`);
    return SKIP;
  }

  if (merchant.waNotificationsEnabled === false) {
    console.log(`${LOG_PREFIX} [DISABLED] WA notifications disabled for merchant ${params.merchantId}, skipping order ${params.orderNumber}`);
    return SKIP;
  }

  if (merchant.waDisconnected) {
    console.log(`${LOG_PREFIX} [DISCONNECTED] WhatsApp disconnected for merchant ${params.merchantId}, skipping order ${params.orderNumber}`);
    return SKIP;
  }

  const formattedPhone = formatPhoneForWhatsApp(params.customerPhone);
  if (!formattedPhone) {
    console.warn(
      `${LOG_PREFIX} Skip order ${params.orderNumber}: invalid/missing phone "${params.customerPhone}"`,
    );
    await db.insert(orderChangeLog).values({
      orderId: params.orderId,
      merchantId: params.merchantId,
      changeType: "WHATSAPP_SENT",
      newValue: "failed",
      actorType: "system",
      actorName: "WhatsApp",
      metadata: {
        success: false,
        toStatus: params.toStatus,
        phone: null,
        error: `Invalid or missing phone: ${params.customerPhone}`,
      },
    });
    return SKIP;
  }

  try {
    const automations = await storage.getWaAutomationsByTrigger(params.merchantId, params.toStatus);
    if (automations.length === 0) {
      console.log(`${LOG_PREFIX} No active automations for status "${params.toStatus}" on order ${params.orderNumber}, skipping`);
      return SKIP;
    }

    const [merchantRow] = await db.select({
      waPhoneNumberId: merchants.waPhoneNumberId,
      waAccessToken: merchants.waAccessToken,
    }).from(merchants).where(eq(merchants.id, params.merchantId)).limit(1);

    const vars = buildVarsFromParams(params);
    const fromLabel = getStatusLabel(params.fromStatus);
    const toLabel = getStatusLabel(params.toStatus);

    let anySent = false;
    let anyNotOnWA = false;
    let lastError: string | undefined;
    let firstAutomationId: string | undefined;
    let firstRetryAttempts: Array<{ messageText: string; delayHours: number }> | null | undefined;

    let draftAutoConfirmed = false;

    for (const automation of automations) {
      if (automation.excludeDraftOrders && params.orderSource === "shopify_draft_order") {
        console.log(`${LOG_PREFIX} Skip automation "${automation.title}" for order ${params.orderNumber}: draft order excluded`);
        if (!draftAutoConfirmed) {
          draftAutoConfirmed = true;
          try {
            const existingOrder = await storage.getOrderById(params.merchantId, params.orderId);
            if (existingOrder && existingOrder.confirmationStatus !== "confirmed") {
              const existingTags = Array.isArray(existingOrder.tags) ? existingOrder.tags : [];
              const newTags = existingTags.includes("Auto-Confirmed") ? existingTags : [...existingTags, "Auto-Confirmed"];
              await storage.updateOrder(params.merchantId, params.orderId, {
                confirmationStatus: "confirmed",
                confirmationSource: "draft",
                tags: newTags,
              });
              if (existingOrder.shopifyOrderId) {
                import("../../../services/shopifyWriteBack").then(({ writeBackAddTag }) =>
                  writeBackAddTag(params.merchantId, existingOrder.shopifyOrderId!, "Auto-Confirmed")
                ).catch(err => console.warn(`${LOG_PREFIX} Failed to write Auto-Confirmed tag to Shopify for ${params.orderNumber}:`, err.message));
              }
              console.log(`${LOG_PREFIX} Auto-confirmed draft order ${params.orderNumber} (excluded from automation "${automation.title}")`);
              if (existingOrder.workflowStatus === "PENDING") {
                import("../../../services/workflowTransition").then(({ transitionOrder }) =>
                  transitionOrder({
                    merchantId: params.merchantId,
                    orderId: params.orderId,
                    toStatus: "READY_TO_SHIP",
                    action: "draft_confirm",
                    actorType: "system",
                    actorName: "System",
                    reason: `Draft order auto-confirmed — excluded from automation "${automation.title}"`,
                  })
                ).catch(err => console.warn(`${LOG_PREFIX} Failed to transition draft order ${params.orderNumber} to READY_TO_SHIP:`, err.message));
              }
            }
          } catch (confirmErr: any) {
            console.warn(`${LOG_PREFIX} Failed to auto-confirm draft order ${params.orderNumber}:`, confirmErr.message);
          }
        }
        continue;
      }

      const fireAutomation = async () => {
        try {
          const dedupeKey = `wa:${params.orderId}:${params.toStatus}:${automation.id}`;

          if (!claimSend(dedupeKey)) {
            console.log(
              `${LOG_PREFIX} Skip automation "${automation.title}" for order ${params.orderNumber}: send already in progress`,
            );
            return;
          }

          const alreadySent = await db
            .select({ id: orderChangeLog.id })
            .from(orderChangeLog)
            .where(
              and(
                eq(orderChangeLog.orderId, params.orderId),
                eq(orderChangeLog.changeType, "WHATSAPP_SENT"),
                sql`${orderChangeLog.metadata}->>'success' = 'true'`,
                sql`${orderChangeLog.metadata}->>'toStatus' = ${params.toStatus}`,
                sql`${orderChangeLog.metadata}->>'automationId' = ${automation.id}`,
              ),
            )
            .limit(1);

          if (alreadySent.length > 0) {
            console.log(
              `${LOG_PREFIX} Skip automation "${automation.title}" for order ${params.orderNumber}: already sent successfully`,
            );
            return;
          }

          const trimmedMsgText = automation.messageText?.trim() || null;
          const msgText = trimmedMsgText
            ? interpolateMessageBody(trimmedMsgText, vars)
            : null;
          const tmplName = automation.templateName || null;

          if (!tmplName) {
            console.log(
              `${LOG_PREFIX} Skip automation "${automation.title}" for order ${params.orderNumber}: no Meta-approved template configured`,
            );
            return;
          }

          let templateParams: string[] | null = null;
          let metaTemplateBody: string | null = null;
          if (tmplName) {
            const [metaTemplate] = await db.select({ body: waMetaTemplates.body })
              .from(waMetaTemplates)
              .where(and(
                eq(waMetaTemplates.merchantId, params.merchantId),
                eq(waMetaTemplates.name, tmplName),
              ))
              .limit(1);

            if (metaTemplate?.body) {
              metaTemplateBody = metaTemplate.body;
              templateParams = buildTemplateParamsFromBody(metaTemplate.body, vars, automation.variableOrder);
            }
            if (!templateParams && automation.messageText) {
              templateParams = extractMessageTextParams(automation.messageText, vars);
            }
          }

          console.log(
            `${LOG_PREFIX} ─── Automation: "${automation.title}" ──────────────────`,
          );
          console.log(
            `${LOG_PREFIX}   Order:    #${params.orderNumber} (${fromLabel} → ${toLabel})`,
          );
          console.log(`${LOG_PREFIX}   To:       ${formattedPhone}`);
          console.log(`${LOG_PREFIX}   Template: "${tmplName}"`);
          if (templateParams) {
            console.log(
              `${LOG_PREFIX}   Params:   ${JSON.stringify(templateParams)}`,
            );
          } else if (msgText) {
            console.log(`${LOG_PREFIX}   Message:  "${msgText.slice(0, 100)}..."`);
          }
          console.log(
            `${LOG_PREFIX} ────────────────────────────────────────────────────`,
          );

          const result = await sendWhatsAppApiRequest({
            formattedPhone,
            templateName: tmplName,
            messageText: msgText || "",
            orderNumber: params.orderNumber,
            templateParams: templateParams ?? undefined,
            phoneNumberId: merchantRow?.waPhoneNumberId ?? undefined,
            accessToken: merchantRow?.waAccessToken ?? undefined,
          });

          if (result.success) {
            anySent = true;
            if (!firstAutomationId) {
              firstAutomationId = automation.id;
              firstRetryAttempts = automation.retryAttempts ?? null;
              if (params.toStatus === "NEW") {
                await db.update(orders).set({ waAutomationId: automation.id }).where(eq(orders.id, params.orderId));
              }
            }
            console.log(`${LOG_PREFIX} Automation "${automation.title}" sent successfully for order ${params.orderNumber}`);
            try {
              const displayText = (() => {
                if (msgText) return msgText;
                if (metaTemplateBody) {
                  if (templateParams && templateParams.length > 0) {
                    return metaTemplateBody.replace(/\{\{(\d+)\}\}/g, (_, n) => templateParams[parseInt(n) - 1] ?? `{{${n}}}`);
                  }
                  return interpolateMessageBody(metaTemplateBody, vars);
                }
                return `[Template: ${tmplName}]`;
              })();
              const conv = await storage.upsertConversation({
                merchantId: params.merchantId,
                contactPhone: formattedPhone,
                contactName: params.customerName,
                orderId: params.orderId,
                orderNumber: params.orderNumber,
                lastMessage: displayText.slice(0, 200),
              });
              await storage.createWaMessage({
                conversationId: conv.id,
                direction: "outbound",
                senderName: "System",
                text: displayText,
                waMessageId: result.messageId,
                status: "sent",
              });
            } catch (convErr: any) {
              console.warn(`${LOG_PREFIX} Failed to upsert conversation for order ${params.orderNumber}:`, convErr.message);
            }
          } else {
            releaseClaim(dedupeKey);
            if (result.notOnWhatsApp) anyNotOnWA = true;
            lastError = result.error;
            console.error(`${LOG_PREFIX} Automation "${automation.title}" failed for order ${params.orderNumber}: ${result.error}`);
          }

          await db.insert(orderChangeLog).values({
            orderId: params.orderId,
            merchantId: params.merchantId,
            changeType: "WHATSAPP_SENT",
            newValue: result.success ? "sent" : "failed",
            actorType: "system",
            actorName: "WhatsApp",
            metadata: {
              success: result.success,
              toStatus: params.toStatus,
              phone: result.phone ?? formattedPhone,
              templateName: tmplName,
              automationId: automation.id,
              automationTitle: automation.title,
              messageId: result.messageId,
              messageText: msgText,
              error: result.error,
            },
          });
        } catch (e: any) {
          releaseClaim(`wa:${params.orderId}:${params.toStatus}:${automation.id}`);
          console.error(`${LOG_PREFIX} Automation "${automation.title}" error for order ${params.orderNumber}:`, e.message);
          await db.insert(orderChangeLog).values({
            orderId: params.orderId,
            merchantId: params.merchantId,
            changeType: "WHATSAPP_SENT",
            newValue: "failed",
            actorType: "system",
            actorName: "WhatsApp",
            metadata: {
              success: false,
              toStatus: params.toStatus,
              phone: formattedPhone,
              automationId: automation.id,
              automationTitle: automation.title,
              error: e.message,
            },
          });
        }
      };

      if (automation.delayMinutes > 0) {
        console.log(`${LOG_PREFIX} Scheduling automation "${automation.title}" for order ${params.orderNumber} with ${automation.delayMinutes}min delay`);
        setTimeout(fireAutomation, automation.delayMinutes * 60 * 1000);
      } else {
        await fireAutomation();
      }
    }

    return { sent: anySent, notOnWhatsApp: anyNotOnWA, error: lastError, automationId: firstAutomationId, retryAttempts: firstRetryAttempts };
  } catch (err: any) {
    console.error(
      `${LOG_PREFIX} Unexpected error for order ${params.orderId}:`,
      err.message || err,
    );
    return { sent: false, notOnWhatsApp: false, error: err.message };
  }
}
