import type { SendResult } from "./types";

const LOG_PREFIX = "[WhatsApp]";
const WHATSAPP_REQUEST_TIMEOUT_MS = 10_000;

const NOT_ON_WHATSAPP_CODES = [131026, 131047, 131021];

function isNotOnWhatsAppError(errorBody: string): boolean {
  try {
    const parsed = JSON.parse(errorBody);
    const code = parsed?.error?.code;
    if (code && NOT_ON_WHATSAPP_CODES.includes(code)) return true;
    const subcode = parsed?.error?.error_subcode;
    if (subcode && NOT_ON_WHATSAPP_CODES.includes(subcode)) return true;
  } catch {}
  const lower = errorBody.toLowerCase();
  return lower.includes("not a valid whatsapp") ||
    lower.includes("recipient is not a valid") ||
    lower.includes("not a whatsapp user") ||
    lower.includes("incapable_number");
}

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

function sanitizeTemplateParam(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // remove zero-width chars
    .replace(/[\r\n\t]/g, " ")             // remove newlines/tabs
    .replace(/\s+/g, " ")                  // collapse ALL whitespace
    .trim();
}

function buildTemplatePayload(
  formattedPhone: string,
  templateName: string,
  messageText: string,
  templateParams?: string[]
): object {
  let bodyParameters: object[];
  if (templateParams && templateParams.length > 0) {
    bodyParameters = templateParams.map(p => ({ type: "text", text: sanitizeTemplateParam(p) }));
    console.log(`[WhatsApp] Using ${templateParams.length} structured params for template "${templateName}":`, templateParams);
  } else {
    const message = sanitizeTemplateParam(messageText);
    console.log(`message text is: ${messageText}`);
    console.log(`message after sanitize is: ${message}`);
    bodyParameters = [{ type: "text", text: message }];
  }
  return {
    messaging_product: "whatsapp",
    to: formattedPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: bodyParameters,
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
  templateParams?: string[];
  phoneNumberId?: string;
  accessToken?: string;
}): Promise<SendResult> {
  const { formattedPhone, templateName, messageText, orderNumber, templateParams } = params;

  const phoneNumberId = params.phoneNumberId;
  const token = params.accessToken;

  if (!token) {
    console.warn(
      `${LOG_PREFIX} WhatsApp access token not provided — skipping order ${orderNumber}`
    );
    return { success: false, error: "WhatsApp not configured. Please connect your WhatsApp Business Account in Settings." };
  }

  if (!phoneNumberId) {
    console.warn(
      `${LOG_PREFIX} WhatsApp phone number ID not provided — skipping order ${orderNumber}`
    );
    return { success: false, error: "WhatsApp Phone Number ID not configured" };
  }

  const apiUrl = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;
  const payload = buildTemplatePayload(formattedPhone, templateName, messageText, templateParams);

  let response: Response;
  try {
    response = await fetch(apiUrl, {
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

    const notOnWA = isNotOnWhatsAppError(errBody);
    if (notOnWA) {
      console.warn(`${LOG_PREFIX} Number ${formattedPhone} is NOT on WhatsApp (order ${orderNumber})`);
    }

    return {
      success: false,
      error: `API error ${response.status}: ${errBody}`,
      phone: formattedPhone,
      notOnWhatsApp: notOnWA,
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
