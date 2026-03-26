import webpush from "web-push";
import { db } from "../db";
import { pushSubscriptions, agentChatSessions } from "../../shared/schema";
import { eq, inArray } from "drizzle-orm";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:support@1sol.ai";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export async function sendAgentChatPushNotifications(
  merchantId: string,
  senderName: string,
  messagePreview: string,
  conversationId: string,
): Promise<void> {
  try {
    if (!vapidPublicKey || !vapidPrivateKey) return;

    const subs = await db.select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      sessionId: pushSubscriptions.sessionId,
    }).from(pushSubscriptions)
      .where(eq(pushSubscriptions.merchantId, merchantId));

    if (subs.length === 0) return;

    const payload = JSON.stringify({
      title: senderName,
      body: messagePreview.slice(0, 200),
      conversationId,
      timestamp: Date.now(),
    });

    const staleIds: string[] = [];
    await Promise.allSettled(subs.map(async (sub) => {
      try {
        if (sub.sessionId) {
          const [session] = await db.select({ isRevoked: agentChatSessions.isRevoked })
            .from(agentChatSessions).where(eq(agentChatSessions.id, sub.sessionId)).limit(1);
          if (session?.isRevoked) {
            staleIds.push(sub.id);
            return;
          }
        }
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }, payload);
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleIds.push(sub.id);
        }
      }
    }));

    if (staleIds.length > 0) {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, staleIds)).catch(() => {});
    }
  } catch (err: any) {
    console.error("[WebPush] Send error:", err.message);
  }
}
