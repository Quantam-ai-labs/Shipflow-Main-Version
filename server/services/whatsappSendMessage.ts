export async function sendWhatsAppMessage(
  phoneNumber: string,
  messageText: string,
  merchantPhoneId?: string,
  merchantAccessToken?: string,
): Promise<boolean> {
  try {
    if (!merchantPhoneId || !merchantAccessToken) {
      console.warn(`[WA Send] Cannot send: WA credentials not configured`);
      return false;
    }

    const formattedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;

    const response = await fetch(
      `https://graph.facebook.com/v22.0/${merchantPhoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${merchantAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: formattedPhone,
          type: "text",
          text: { body: messageText },
        }),
      }
    );

    const data = await response.json();
    if (data.messages?.[0]?.id) {
      console.log(`[WA Send] Message sent to ${formattedPhone}`);
      return true;
    } else {
      console.error(`[WA Send] Failed to send:`, data.error?.message || JSON.stringify(data));
      return false;
    }
  } catch (error: any) {
    console.error(`[WA Send] Error:`, error.message);
    return false;
  }
}
