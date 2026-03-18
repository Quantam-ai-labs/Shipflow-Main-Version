import OpenAI from "openai";
import { db } from "../db";
import { merchants, products, waConversations, waMessages, orders } from "@shared/schema";
import { eq, and, desc, or } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const LOG_PREFIX = "[WhatsApp AI]";
const MAX_REPLY_LENGTH = 500;
const MAX_PRODUCTS = 50;
const MAX_CONVERSATION_MESSAGES = 10;

const aiReplyLock = new Map<string, number>();
const AI_LOCK_TTL_MS = 30_000;

function acquireAiLock(key: string): boolean {
  const now = Date.now();
  const existing = aiReplyLock.get(key);
  if (existing && now - existing < AI_LOCK_TTL_MS) {
    return false;
  }
  aiReplyLock.set(key, now);
  if (aiReplyLock.size > 5000) {
    for (const [k, t] of aiReplyLock) {
      if (now - t > AI_LOCK_TTL_MS) aiReplyLock.delete(k);
    }
  }
  return true;
}

function releaseAiLock(key: string) {
  aiReplyLock.delete(key);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

interface AiReplyResult {
  success: boolean;
  reply?: string;
  error?: string;
  skipped?: boolean;
}

export async function generateAiReply(params: {
  merchantId: string;
  customerPhone: string;
  messageText: string;
  conversationId?: string;
  orderId?: string | null;
  orderNumber?: string | null;
  skipEnabledCheck?: boolean;
}): Promise<AiReplyResult> {
  const { merchantId, customerPhone, messageText } = params;

  const lockKey = `ai:${merchantId}:${customerPhone}`;
  if (!acquireAiLock(lockKey)) {
    console.log(`${LOG_PREFIX} Skipping AI reply for ${customerPhone} — lock active`);
    return { success: false, skipped: true, error: "Debounce lock active" };
  }

  try {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
    if (!merchant) {
      releaseAiLock(lockKey);
      return { success: false, error: "Merchant not found" };
    }

    if (!merchant.aiAutoReplyEnabled && !params.skipEnabledCheck) {
      releaseAiLock(lockKey);
      return { success: false, skipped: true, error: "AI auto-reply disabled" };
    }

    const storeName = merchant.aiAutoReplyStoreName || merchant.name || "our store";
    const knowledgeBase = merchant.aiAutoReplyKnowledgeBase || "";

    const activeProducts = await db.select({
      title: products.title,
      description: products.description,
      status: products.status,
      totalInventory: products.totalInventory,
      variants: products.variants,
      productType: products.productType,
      tags: products.tags,
    }).from(products)
      .where(and(eq(products.merchantId, merchantId), eq(products.status, "active")))
      .limit(MAX_PRODUCTS);

    let productCatalog = "";
    if (activeProducts.length > 0) {
      const productLines = activeProducts.map((p) => {
        const variants = (p.variants as any[]) || [];
        const priceRange = variants.length > 0
          ? variants.map((v: any) => parseFloat(v.price || "0")).filter(Boolean)
          : [];
        const minPrice = priceRange.length > 0 ? Math.min(...priceRange) : 0;
        const maxPrice = priceRange.length > 0 ? Math.max(...priceRange) : 0;
        const priceStr = minPrice === maxPrice
          ? `PKR ${minPrice}`
          : `PKR ${minPrice}-${maxPrice}`;
        const variantNames = variants.map((v: any) => v.title).filter((t: string) => t && t !== "Default Title");
        const inStock = (p.totalInventory || 0) > 0;

        let line = `- ${p.title}: ${priceStr}, ${inStock ? "In Stock" : "Out of Stock"}`;
        if (variantNames.length > 0) {
          line += ` (Variants: ${variantNames.join(", ")})`;
        }
        if (p.description) {
          const desc = p.description.length > 150 ? p.description.substring(0, 150) + "..." : p.description;
          line += ` — ${desc}`;
        }
        return line;
      });
      productCatalog = productLines.join("\n");
    }

    let conversationHistory = "";
    if (params.conversationId) {
      const recentMessages = await db.select({
        direction: waMessages.direction,
        text: waMessages.text,
        senderName: waMessages.senderName,
        createdAt: waMessages.createdAt,
      }).from(waMessages)
        .where(eq(waMessages.conversationId, params.conversationId))
        .orderBy(desc(waMessages.createdAt))
        .limit(MAX_CONVERSATION_MESSAGES);

      if (recentMessages.length > 0) {
        const reversed = recentMessages.reverse();
        conversationHistory = reversed.map((m) => {
          const role = m.direction === "inbound" ? "Customer" : "Store";
          return `${role}: ${m.text || "[media]"}`;
        }).join("\n");
      }
    }

    let orderContext = "";
    if (params.orderId) {
      const [order] = await db.select({
        orderNumber: orders.orderNumber,
        workflowStatus: orders.workflowStatus,
        totalAmount: orders.totalAmount,
        currency: orders.currency,
        itemSummary: orders.itemSummary,
        city: orders.city,
        courierName: orders.courierName,
        courierTracking: orders.courierTracking,
      }).from(orders)
        .where(and(eq(orders.id, params.orderId), eq(orders.merchantId, merchantId)))
        .limit(1);

      if (order) {
        const statusMap: Record<string, string> = {
          NEW: "Received",
          PENDING: "Being Processed",
          READY_TO_SHIP: "Ready to Ship",
          HOLD: "On Hold",
          BOOKED: "Booked with Courier",
          FULFILLED: "Shipped / In Transit",
          DELIVERED: "Delivered",
          RETURN: "Returned",
          CANCELLED: "Cancelled",
        };
        orderContext = `
CUSTOMER'S ORDER:
- Order #${order.orderNumber}
- Status: ${statusMap[order.workflowStatus || ""] || order.workflowStatus}
- Items: ${order.itemSummary || "N/A"}
- Total: ${order.currency || "PKR"} ${order.totalAmount || "N/A"}
- City: ${order.city || "N/A"}${order.courierName ? `\n- Courier: ${order.courierName}` : ""}${order.courierTracking ? `\n- Tracking: ${order.courierTracking}` : ""}`;
      }
    }

    const systemPrompt = `You are a helpful store assistant for "${storeName}". You respond to customer messages on WhatsApp.

CRITICAL RULES — FOLLOW EXACTLY:
1. You ONLY know about ${storeName}'s products, policies, and orders listed below. NEVER use outside knowledge.
2. NEVER reveal you are AI, a bot, or an automated system. Respond as a team member of ${storeName}.
3. Keep responses SHORT: 1-3 sentences maximum. Be direct and helpful.
4. If the customer asks about something NOT in the data below, say: "I can only help with ${storeName} questions. For more details, please contact us directly."
5. NEVER make up or guess information. If the answer isn't in the provided data, say you'll check and get back to them.
6. Respond in the SAME LANGUAGE the customer uses (Urdu, English, or Roman Urdu).
7. Be friendly and professional. Use the customer's name if known.
8. For order status questions, provide the current status from the order data. Do not promise specific delivery dates unless the data shows them.
9. For product questions, use ONLY the catalog data provided. Include prices and availability.
10. Maximum response length: ${MAX_REPLY_LENGTH} characters.

${knowledgeBase ? `STORE KNOWLEDGE BASE (policies, FAQs, shipping info):\n${knowledgeBase}\n` : ""}
${productCatalog ? `PRODUCT CATALOG:\n${productCatalog}\n` : "No products loaded."}
${orderContext ? `${orderContext}\n` : ""}
${conversationHistory ? `RECENT CONVERSATION:\n${conversationHistory}\n` : ""}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: messageText },
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    let reply = response.choices?.[0]?.message?.content?.trim() || "";

    if (!reply) {
      releaseAiLock(lockKey);
      return { success: false, error: "Empty AI response" };
    }

    if (reply.length > MAX_REPLY_LENGTH) {
      reply = reply.substring(0, MAX_REPLY_LENGTH - 3) + "...";
    }

    console.log(`${LOG_PREFIX} Generated reply for ${customerPhone}: "${reply.substring(0, 80)}..."`);
    return { success: true, reply };
  } catch (error: any) {
    releaseAiLock(lockKey);
    console.error(`${LOG_PREFIX} Error generating AI reply:`, error.message);
    return { success: false, error: error.message };
  }
}

export async function testAiReply(params: {
  merchantId: string;
  testMessage: string;
}): Promise<AiReplyResult> {
  return generateAiReply({
    merchantId: params.merchantId,
    customerPhone: `test-preview-${Date.now()}`,
    messageText: params.testMessage,
    skipEnabledCheck: true,
  });
}
