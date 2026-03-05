const LOG_PREFIX = "[WhatsApp]";

const WHATSAPP_API_URL = "https://graph.facebook.com/v22.0/967693413100547/messages";
const WHATSAPP_REQUEST_TIMEOUT_MS = 10_000;

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  BOOKED: "Booked",
  FULFILLED: "Shipped",
  DELIVERED: "Delivered",
};

function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

function formatPhoneForWhatsApp(phone: string | null | undefined): string | null {
  if (!phone || phone.trim().length === 0) {
    return null;
  }

  let cleaned = phone.replace(/[\s\-()]/g, "");
  cleaned = cleaned.replace(/[^0-9+]/g, "");

  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  if (cleaned.startsWith("0")) {
    cleaned = "92" + cleaned.substring(1);
  }

  if (cleaned.length < 10 || cleaned.length > 15) {
    console.warn(`${LOG_PREFIX} Phone number "${phone}" formatted to "${cleaned}" is invalid (length: ${cleaned.length})`);
    return null;
  }

  return cleaned;
}

function buildTemplatePayload(formattedPhone: string, _params: {
  customerName: string;
  orderNumber: string;
  fromStatus: string;
  toStatus: string;
}): object {
  return {
    messaging_product: "whatsapp",
    to: formattedPhone,
    type: "template",
    template: {
      name: "status_notify",
      language: { code: "en_US" },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: `Dear ${_params.customerName}, your order #${_params.orderNumber} status has changed from ${getStatusLabel(_params.fromStatus)} to ${getStatusLabel(_params.toStatus)}.`
            }
          ]
        }
      ]
    },
  };
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendOrderStatusWhatsApp(params: {
  customerPhone: string | null | undefined;
  customerName: string;
  orderNumber: string;
  fromStatus: string;
  toStatus: string;
}): Promise<SendResult> {
  const { customerPhone, customerName, orderNumber, fromStatus, toStatus } = params;
  const fromLabel = getStatusLabel(fromStatus);
  const toLabel = getStatusLabel(toStatus);

  try {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) {
      console.warn(`${LOG_PREFIX} WHATSAPP_ACCESS_TOKEN not configured — skipping notification for order ${orderNumber}`);
      return { success: false, error: "WHATSAPP_ACCESS_TOKEN not configured" };
    }

    const formattedPhone = formatPhoneForWhatsApp(customerPhone);
    if (!formattedPhone) {
      console.warn(`${LOG_PREFIX} Skipping order ${orderNumber} — invalid or missing phone: "${customerPhone}"`);
      return { success: false, error: `Invalid or missing phone number: ${customerPhone}` };
    }

    const payload = buildTemplatePayload(formattedPhone, {
      customerName,
      orderNumber,
      fromStatus,
      toStatus,
    });

    console.log(`${LOG_PREFIX} Sending notification to ${formattedPhone} for order ${orderNumber} (${fromLabel} → ${toLabel})...`);

    let response: Response;
    try {
      response = await fetch(WHATSAPP_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(WHATSAPP_REQUEST_TIMEOUT_MS),
      });
    } catch (fetchErr: any) {
      if (fetchErr.name === "TimeoutError" || fetchErr.name === "AbortError") {
        console.error(`${LOG_PREFIX} Request timed out after ${WHATSAPP_REQUEST_TIMEOUT_MS}ms for order ${orderNumber} to ${formattedPhone}`);
        return { success: false, error: "Request timed out" };
      }
      console.error(`${LOG_PREFIX} Network error for order ${orderNumber} to ${formattedPhone}:`, fetchErr.message || fetchErr);
      return { success: false, error: `Network error: ${fetchErr.message || "Unknown"}` };
    }

    if (!response.ok) {
      let errBody = "";
      try {
        errBody = await response.text();
      } catch {
        errBody = "(unable to read response body)";
      }
      console.error(`${LOG_PREFIX} API error ${response.status} for order ${orderNumber} to ${formattedPhone}: ${errBody}`);
      return { success: false, error: `API error ${response.status}: ${errBody}` };
    }

    let result: any;
    try {
      result = await response.json();
    } catch {
      console.warn(`${LOG_PREFIX} Sent to ${formattedPhone} for order ${orderNumber} but could not parse response JSON`);
      return { success: true };
    }

    const messageId = result?.messages?.[0]?.id || null;
    console.log(`${LOG_PREFIX} ✓ Sent to ${formattedPhone} for order ${orderNumber}: ${fromLabel} → ${toLabel}${messageId ? ` (msgId: ${messageId})` : ""}`);
    return { success: true, messageId: messageId || undefined };

  } catch (err: any) {
    console.error(`${LOG_PREFIX} Unexpected error for order ${orderNumber} (${customerPhone}):`, err.message || err);
    return { success: false, error: err.message || "Unexpected error" };
  }
}
