import { db } from "../../../db";
import { orderChangeLog } from "@shared/schema";
import { storage } from "../../../storage";
import {
  buildVarsFromParams,
  interpolateMessageBody,
  getStatusLabel,
  WA_NOTIFY_STATUSES,
} from "./variables";
import { formatPhoneForWhatsApp, sendWhatsAppApiRequest } from "./sender";
import type { OrderNotificationParams } from "./types";

export { WA_VARIABLE_CHIPS, DEFAULT_MESSAGE_BODY, interpolateMessageBody, STATUS_LABELS, getStatusLabel, WA_NOTIFY_STATUSES } from "./variables";
export type { WaNotifyStatus } from "./variables";
export { formatPhoneForWhatsApp } from "./sender";
export type { SendResult, OrderNotificationParams } from "./types";

const LOG_PREFIX = "[WhatsApp]";

export async function sendOrderStatusWhatsApp(
  params: OrderNotificationParams
): Promise<void> {
  if (!WA_NOTIFY_STATUSES.includes(params.toStatus)) return;

  try {
    const { templateName, messageBody } =
      await storage.getWhatsAppTemplateForStatus(
        params.merchantId,
        params.toStatus
      );

    const formattedPhone = formatPhoneForWhatsApp(params.customerPhone);
    if (!formattedPhone) {
      console.warn(
        `${LOG_PREFIX} Skip order ${params.orderNumber}: invalid/missing phone "${params.customerPhone}"`
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
    const messageText = interpolateMessageBody(messageBody, vars);

    const fromLabel = getStatusLabel(params.fromStatus);
    const toLabel = getStatusLabel(params.toStatus);

    console.log(
      `${LOG_PREFIX} ─── Sending notification ──────────────────────────`
    );
    console.log(
      `${LOG_PREFIX}   Order:    #${params.orderNumber} (${fromLabel} → ${toLabel})`
    );
    console.log(`${LOG_PREFIX}   To:       ${formattedPhone}`);
    console.log(`${LOG_PREFIX}   Template: "${templateName}"`);
    console.log(`${LOG_PREFIX}   Message:  "${messageText}"`);
    console.log(
      `${LOG_PREFIX} ────────────────────────────────────────────────────`
    );

    const result = await sendWhatsAppApiRequest({
      formattedPhone,
      templateName,
      messageText,
      orderNumber: params.orderNumber,
    });

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
      err.message || err
    );
  }
}
