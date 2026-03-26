/**
 * SSE Manager — in-memory pub/sub for WhatsApp real-time events.
 *
 * Each merchant has a Set of open Response streams.
 * Events are typed: new_message | status_update | conversation_update | ping
 */
import type { Response } from "express";

interface SseClient {
  merchantId: string;
  res: Response;
}

const merchantClients = new Map<string, Set<Response>>();

export function registerSseClient(merchantId: string, res: Response): void {
  if (!merchantClients.has(merchantId)) {
    merchantClients.set(merchantId, new Set());
  }
  merchantClients.get(merchantId)!.add(res);
}

export function unregisterSseClient(merchantId: string, res: Response): void {
  const clients = merchantClients.get(merchantId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) {
      merchantClients.delete(merchantId);
    }
  }
}

export function broadcastToMerchant(
  merchantId: string,
  type: "new_message" | "status_update" | "conversation_update" | "ping",
  data: Record<string, any> = {},
): void {
  const clients = merchantClients.get(merchantId);
  if (!clients || clients.size === 0) return;

  const payload = JSON.stringify({ type, ...data, ts: Date.now() });
  const frame = `data: ${payload}\n\n`;

  for (const res of clients) {
    try {
      res.write(frame);
    } catch {
      clients.delete(res);
    }
  }
}

export function getConnectedClientCount(merchantId: string): number {
  return merchantClients.get(merchantId)?.size ?? 0;
}

export function getTotalConnectedClients(): number {
  let total = 0;
  for (const set of merchantClients.values()) total += set.size;
  return total;
}
