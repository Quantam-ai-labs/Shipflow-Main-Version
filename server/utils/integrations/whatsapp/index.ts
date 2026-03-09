import { db } from "../../../db";
import { orderChangeLog, merchants } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { storage } from "../../../storage";
import {
  buildVarsFromParams,
  buildTemplateParams,
  interpolateMessageBody,
  getStatusLabel,
  WA_NOTIFY_STATUSES,
} from "./variables";
import { formatPhoneForWhatsApp, sendWhatsAppApiRequest } from "./sender";
import type { OrderNotificationParams } from "./types";

export {
  WA_VARIABLE_CHIPS,
  DEFAULT_MESSAGE_BODY,
  DEFAULT_MESSAGE_BODIES,
  getDefaultMessageBody,
  interpolateMessageBody,
  STATUS_LABELS,
  getStatusLabel,
  WA_NOTIFY_STATUSES,
} from "./variables";
export type { WaNotifyStatus } from "./variables";
export { formatPhoneForWhatsApp } from "./sender";
export type { SendResult, OrderNotificationParams } from "./types";

const LOG_PREFIX = "[WhatsApp]";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

export async function sendOrderStatusWhatsApp(
  params: OrderNotificationParams,
): Promise<void> {
  if (!(WA_NOTIFY_STATUSES as readonly string[]).includes(params.toStatus))
    return;

  // if (!IS_PRODUCTION) {
  //   console.log(
  //     `${LOG_PREFIX} [DEV] Skipping send for order ${params.orderNumber} (${params.toStatus}) — not in production`,
  //   );
  //   return;
  // }

  const merchant = await storage.getMerchant(params.merchantId);
  if (!merchant) {
    console.log(`${LOG_PREFIX} Merchant ${params.merchantId} not found, skipping`);
    return;
  }

  if (merchant.waNotificationsEnabled === false) {
    console.log(`${LOG_PREFIX} [DISABLED] WA notifications disabled for merchant ${params.merchantId}, skipping order ${params.orderNumber}`);
    return;
  }

  const allowedDomain = process.env.LALA_IMPORT;
  if (allowedDomain) {
    const order = await storage.getOrderById(params.merchantId, params.orderId);
    const orderShopDomain = order?.shopDomain ?? null;
    if (orderShopDomain !== allowedDomain) {
      console.log(
        `${LOG_PREFIX} [ENV FILTER] Skipping order ${params.orderNumber} — shop_domain "${orderShopDomain}" does not match allowed "${allowedDomain}"`,
      );
      return;
    }
  }

  try {
    const alreadySent = await db
      .select({ id: orderChangeLog.id })
      .from(orderChangeLog)
      .where(
        and(
          eq(orderChangeLog.orderId, params.orderId),
          eq(orderChangeLog.changeType, "WHATSAPP_SENT"),
          sql`${orderChangeLog.metadata}->>'success' = 'true'`,
          sql`${orderChangeLog.metadata}->>'toStatus' = ${params.toStatus}`,
        ),
      )
      .limit(1);

    if (alreadySent.length > 0) {
      console.log(
        `${LOG_PREFIX} Skip order ${params.orderNumber}: WhatsApp already sent successfully for status "${params.toStatus}"`,
      );
      return;
    }

    const { templateName, messageBody } =
      await storage.getWhatsAppTemplateForStatus(
        params.merchantId,
        params.toStatus,
      );

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
          templateName,
          error: `Invalid or missing phone: ${params.customerPhone}`,
        },
      });
      return;
    }

    const vars = buildVarsFromParams(params);
    const messageText = interpolateMessageBody(
      messageBody,
      vars,
      params.toStatus,
    );

    const templateParams = buildTemplateParams(templateName, vars);

    const fromLabel = getStatusLabel(params.fromStatus);
    const toLabel = getStatusLabel(params.toStatus);

    console.log(
      `${LOG_PREFIX} ─── Sending notification ──────────────────────────`,
    );
    console.log(
      `${LOG_PREFIX}   Order:    #${params.orderNumber} (${fromLabel} → ${toLabel})`,
    );
    console.log(`${LOG_PREFIX}   To:       ${formattedPhone}`);
    console.log(`${LOG_PREFIX}   Template: "${templateName}"`);
    if (templateParams) {
      console.log(
        `${LOG_PREFIX}   Params:   ${JSON.stringify(templateParams)}`,
      );
    } else {
      console.log(`${LOG_PREFIX}   Message:  "${messageText}"`);
    }
    console.log(
      `${LOG_PREFIX} ────────────────────────────────────────────────────`,
    );

    const [merchantRow] = await db.select({
      waPhoneNumberId: merchants.waPhoneNumberId,
      waAccessToken: merchants.waAccessToken,
    }).from(merchants).where(eq(merchants.id, params.merchantId)).limit(1);

    const result = await sendWhatsAppApiRequest({
      formattedPhone,
      templateName,
      messageText,
      orderNumber: params.orderNumber,
      templateParams: templateParams ?? undefined,
      phoneNumberId: merchantRow?.waPhoneNumberId ?? undefined,
      accessToken: merchantRow?.waAccessToken ?? undefined,
    });

    if (result.success) {
      try {
        const conv = await storage.upsertConversation({
          merchantId: params.merchantId,
          contactPhone: formattedPhone,
          contactName: params.customerName,
          orderId: params.orderId,
          orderNumber: params.orderNumber,
          lastMessage: messageText.slice(0, 200),
        });
        await storage.createWaMessage({
          conversationId: conv.id,
          direction: "outbound",
          senderName: "System",
          text: messageText,
          waMessageId: result.messageId,
          status: "sent",
        });
      } catch (convErr: any) {
        console.warn(`${LOG_PREFIX} Failed to upsert conversation for order ${params.orderNumber}:`, convErr.message);
      }
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
        templateName,
        messageId: result.messageId,
        messageText,
        error: result.error,
      },
    });
  } catch (err: any) {
    console.error(
      `${LOG_PREFIX} Unexpected error for order ${params.orderId}:`,
      err.message || err,
    );
  }
}
