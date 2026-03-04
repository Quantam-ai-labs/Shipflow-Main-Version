const WHATSAPP_API_URL = "https://graph.facebook.com/v22.0/967693413100547/messages";

function formatPhoneForWhatsApp(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }
  if (cleaned.startsWith("0")) {
    cleaned = "92" + cleaned.substring(1);
  }
  if (cleaned.length < 10 || cleaned.length > 15) return null;
  return cleaned;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  PENDING: "Pending",
  HOLD: "On Hold",
  READY_TO_SHIP: "Ready to Ship",
  BOOKED: "Booked",
  FULFILLED: "Shipped",
  DELIVERED: "Delivered",
  RETURN: "Returned",
  CANCELLED: "Cancelled",
};

export async function sendOrderStatusWhatsApp(params: {
  customerPhone: string | null | undefined;
  customerName: string;
  orderNumber: string;
  fromStatus: string;
  toStatus: string;
}): Promise<{ success: boolean; error?: string }> {
  const { customerPhone, customerName, orderNumber, fromStatus, toStatus } = params;

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    return { success: false, error: "WHATSAPP_ACCESS_TOKEN not configured" };
  }

  const formattedPhone = formatPhoneForWhatsApp(customerPhone);
  if (!formattedPhone) {
    return { success: false, error: `Invalid or missing phone number: ${customerPhone}` };
  }

  const toLabel = STATUS_LABELS[toStatus] || toStatus;

  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "template",
        template: {
          name: "hello_world",
          language: { code: "en_US" },
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[WhatsApp] Failed to send to ${formattedPhone} for order ${orderNumber}: ${response.status} ${errBody}`);
      return { success: false, error: `API error ${response.status}: ${errBody}` };
    }

    const result = await response.json();
    console.log(`[WhatsApp] Sent status notification to ${formattedPhone} for order ${orderNumber}: ${fromStatus} → ${toLabel}`);
    return { success: true };
  } catch (err: any) {
    console.error(`[WhatsApp] Error sending to ${formattedPhone} for order ${orderNumber}:`, err);
    return { success: false, error: err.message || "Unknown error" };
  }
}
