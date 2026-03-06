import type { SendResult } from "./types";

const LOG_PREFIX = "[WhatsApp]";
const WHATSAPP_API_URL =
  `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NO_ID}/messages`;
const WHATSAPP_REQUEST_TIMEOUT_MS = 10_000;

export function formatPhoneForWhatsApp(
  phone: string | null | undefined
): string | null {
  if (!phone || phone.trim().length === 0) return null;

  let cleaned = phone.replace(/[\s\-()]/g, "");
  cleaned = cleaned.replace(/[^0-9+]/g, "");

  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  if (cleaned.startsWith("0")) {
    cleaned = "92" + cleaned.substring(1);
  }

  if (cleaned.length < 10 || cleaned.length > 15) {
    console.warn(
      `${LOG_PREFIX} Phone "${phone}" → "${cleaned}" invalid length (${cleaned.length})`
    );
    return null;
  }

  return cleaned;
}

function buildTemplatePayload(
  formattedPhone: string,
  templateName: string,
  messageText: string
): object {
  return {
    messaging_product: "whatsapp",
    to: formattedPhone,
    type: "template",
    template: {
      name: "custom_message",
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: messageText }],
        },
      ],
    },
  };
}

export async function sendWhatsAppApiRequest(params: {
  formattedPhone: string;
  templateName: string;
  messageText: string;
  orderNumber: string;
}): Promise<SendResult> {
  const { formattedPhone, templateName, messageText, orderNumber } = params;

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    console.warn(
      `${LOG_PREFIX} WHATSAPP_ACCESS_TOKEN not set — skipping order ${orderNumber}`
    );
    return { success: false, error: "WHATSAPP_ACCESS_TOKEN not configured" };
  }

  const payload = buildTemplatePayload(formattedPhone, templateName, messageText);

  let response: Response;
  try {
    response = await fetch(WHATSAPP_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WHATSAPP_REQUEST_TIMEOUT_MS),
    });
  } catch (fetchErr: any) {
    if (
      fetchErr.name === "TimeoutError" ||
      fetchErr.name === "AbortError"
    ) {
      console.error(
        `${LOG_PREFIX} Request timed out after ${WHATSAPP_REQUEST_TIMEOUT_MS}ms for order ${orderNumber} to ${formattedPhone}`
      );
      return { success: false, error: "Request timed out" };
    }
    console.error(
      `${LOG_PREFIX} Network error for order ${orderNumber}:`,
      fetchErr.message || fetchErr
    );
    return {
      success: false,
      error: `Network error: ${fetchErr.message || "Unknown"}`,
    };
  }

  if (!response.ok) {
    let errBody = "";
    try {
      errBody = await response.text();
    } catch {
      errBody = "(unable to read response body)";
    }
    console.error(
      `${LOG_PREFIX} API error ${response.status} for order ${orderNumber} to ${formattedPhone}: ${errBody}`
    );
    return {
      success: false,
      error: `API error ${response.status}: ${errBody}`,
      phone: formattedPhone,
    };
  }

  let result: any;
  try {
    result = await response.json();
  } catch {
    console.warn(
      `${LOG_PREFIX} Sent to ${formattedPhone} for order ${orderNumber} but could not parse response JSON`
    );
    return { success: true, phone: formattedPhone };
  }

  const messageId = result?.messages?.[0]?.id || null;
  console.log(
    `${LOG_PREFIX} ✓ Delivered to ${formattedPhone} for order ${orderNumber}${messageId ? ` (msgId: ${messageId})` : ""}`
  );
  return {
    success: true,
    messageId: messageId || undefined,
    phone: formattedPhone,
  };
}
