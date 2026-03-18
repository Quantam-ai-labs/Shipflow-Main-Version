import OpenAI from "openai";
import { db } from "../db";
import { merchants, products, waConversations, waMessages, orders } from "@shared/schema";
import { eq, and, desc, or, ilike, sql } from "drizzle-orm";
import { normalizePakistaniPhone } from "../utils/phone";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const LOG_PREFIX = "[WhatsApp AI]";
const MAX_REPLY_LENGTH = 500;
const MAX_KEYWORD_MATCHES = 30;
const MAX_GENERAL_PRODUCTS = 100;
const MAX_CONVERSATION_MESSAGES = 10;
const MAX_PHONE_ORDERS = 10;

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

const STATUS_MAP: Record<string, string> = {
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

export type AiClassification = "complaint" | "return" | "replacement" | "human_handoff" | null;

export interface AiReplyResult {
  success: boolean;
  reply?: string;
  classification?: AiClassification;
  error?: string;
  skipped?: boolean;
}

function buildPhoneVariants(phone: string): string[] {
  const digits = phone.replace(/[^\d]/g, "");
  const variants = new Set<string>();
  variants.add(phone);
  variants.add(digits);
  if (digits.startsWith("92") && digits.length >= 12) {
    variants.add(digits);
    variants.add(`+${digits}`);
    variants.add(`0${digits.slice(2)}`);
  } else if (digits.startsWith("0") && digits.length === 11) {
    variants.add(digits);
    variants.add(`92${digits.slice(1)}`);
    variants.add(`+92${digits.slice(1)}`);
  } else if (digits.startsWith("3") && digits.length === 10) {
    variants.add(`0${digits}`);
    variants.add(`92${digits}`);
    variants.add(`+92${digits}`);
  }
  const normalized = normalizePakistaniPhone(phone);
  if (normalized) variants.add(normalized);
  return [...variants];
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

    const productFields = {
      title: products.title,
      description: products.description,
      status: products.status,
      totalInventory: products.totalInventory,
      variants: products.variants,
      productType: products.productType,
      tags: products.tags,
    };

    const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "of", "in", "on", "at", "to", "for", "and", "or", "it", "its", "this", "that", "what", "how", "much", "many", "do", "does", "can", "will", "would", "should", "could", "please", "thanks", "thank", "you", "your", "my", "me", "i", "we", "he", "she", "they", "have", "has", "had", "about", "with", "from", "by", "price", "cost", "available", "stock", "kya", "hai", "ka", "ki", "ke", "ko", "se", "mein", "ye", "wo", "ap", "hain", "kitna", "kitne", "kitni", "konsa", "konsi", "bhi", "aur", "ya", "nahi"]);
    const keywords = messageText
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !stopWords.has(w));

    type ProductRow = {
      title: string | null;
      description: string | null;
      status: string | null;
      totalInventory: number | null;
      variants: unknown;
      productType: string | null;
      tags: string[] | null;
    };

    let keywordProducts: ProductRow[] = [];
    if (keywords.length > 0) {
      const keywordConditions = keywords.map((kw) => {
        const pattern = `%${kw}%`;
        return or(
          ilike(products.title, pattern),
          ilike(products.description, pattern),
          ilike(products.productType, pattern),
          ilike(products.tags, pattern)
        );
      });
      keywordProducts = await db.select(productFields).from(products)
        .where(and(
          eq(products.merchantId, merchantId),
          eq(products.status, "active"),
          or(...keywordConditions)
        ))
        .limit(MAX_KEYWORD_MATCHES);
    }

    const keywordProductIds = new Set(keywordProducts.map((p) => p.title));

    let activeProducts: ProductRow[] = [...keywordProducts];
    const remainingSlots = MAX_GENERAL_PRODUCTS - activeProducts.length;
    if (remainingSlots > 0) {
      const generalProducts = await db.select(productFields).from(products)
        .where(and(eq(products.merchantId, merchantId), eq(products.status, "active")))
        .limit(remainingSlots + keywordProducts.length);
      for (const gp of generalProducts) {
        if (!keywordProductIds.has(gp.title) && activeProducts.length < MAX_GENERAL_PRODUCTS) {
          activeProducts.push(gp);
        }
      }
    }

    console.log(`${LOG_PREFIX} Product context: ${keywordProducts.length} keyword matches + ${activeProducts.length - keywordProducts.length} general = ${activeProducts.length} total (keywords: ${keywords.join(", ")})`);

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

    const orderFields = {
      orderNumber: orders.orderNumber,
      workflowStatus: orders.workflowStatus,
      totalAmount: orders.totalAmount,
      currency: orders.currency,
      itemSummary: orders.itemSummary,
      city: orders.city,
      courierName: orders.courierName,
      courierTracking: orders.courierTracking,
      shipmentStatus: orders.shipmentStatus,
      paymentMethod: orders.paymentMethod,
      orderDate: orders.orderDate,
    };

    let orderContext = "";

    const phoneVariants = buildPhoneVariants(customerPhone);
    const phoneConditions = phoneVariants.map(v => eq(orders.customerPhone, v));
    const phoneOrders = await db.select(orderFields).from(orders)
      .where(and(
        eq(orders.merchantId, merchantId),
        or(...phoneConditions)
      ))
      .orderBy(desc(orders.orderDate))
      .limit(MAX_PHONE_ORDERS);

    if (phoneOrders.length > 0) {
      const orderLines = phoneOrders.map((o, i) => {
        const status = STATUS_MAP[o.workflowStatus || ""] || o.workflowStatus || "Unknown";
        const date = o.orderDate ? new Date(o.orderDate).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }) : "N/A";
        let line = `${i + 1}. Order ${o.orderNumber} (${date})`;
        line += `\n   Status: ${status}`;
        line += `\n   Items: ${o.itemSummary || "N/A"}`;
        line += `\n   Total: ${o.currency || "PKR"} ${o.totalAmount || "N/A"}`;
        line += `\n   City: ${o.city || "N/A"}`;
        line += `\n   Payment: ${o.paymentMethod || "N/A"}`;
        if (o.courierName) line += `\n   Courier: ${o.courierName}`;
        if (o.courierTracking) line += `\n   Tracking: ${o.courierTracking}`;
        if (o.shipmentStatus) line += `\n   Shipment: ${o.shipmentStatus}`;
        return line;
      });
      orderContext = `\nCUSTOMER'S ORDERS (${phoneOrders.length} found, most recent first):\n${orderLines.join("\n\n")}`;
      console.log(`${LOG_PREFIX} Found ${phoneOrders.length} orders for phone ${customerPhone}`);
    } else if (params.orderId) {
      const [singleOrder] = await db.select(orderFields).from(orders)
        .where(and(eq(orders.id, params.orderId), eq(orders.merchantId, merchantId)))
        .limit(1);
      if (singleOrder) {
        const status = STATUS_MAP[singleOrder.workflowStatus || ""] || singleOrder.workflowStatus;
        orderContext = `\nCUSTOMER'S ORDER:\n- Order ${singleOrder.orderNumber}\n- Status: ${status}\n- Items: ${singleOrder.itemSummary || "N/A"}\n- Total: ${singleOrder.currency || "PKR"} ${singleOrder.totalAmount || "N/A"}\n- City: ${singleOrder.city || "N/A"}`;
        if (singleOrder.courierName) orderContext += `\n- Courier: ${singleOrder.courierName}`;
        if (singleOrder.courierTracking) orderContext += `\n- Tracking: ${singleOrder.courierTracking}`;
      }
    } else {
      console.log(`${LOG_PREFIX} No orders found for phone ${customerPhone}`);
    }

    const systemPrompt = `You are a helpful store assistant for "${storeName}". You respond to customer messages on WhatsApp.

You MUST respond with a JSON object in this exact format:
{"reply": "your message to the customer", "classification": null}

The "classification" field must be one of:
- "complaint" — if the customer is complaining about a problem (damaged item, wrong item, bad quality, late delivery, not received, etc.)
- "return" — if the customer wants to return an item
- "replacement" — if the customer wants a replacement item
- "human_handoff" — if the customer explicitly asks to speak to a human agent, real person, manager, or supervisor
- null — for all other messages (product inquiries, order status, general questions, greetings, etc.)

CRITICAL RULES — FOLLOW EXACTLY:
1. You ONLY know about ${storeName}'s products, policies, and orders listed below. NEVER use outside knowledge.
2. NEVER reveal you are AI, a bot, or an automated system. Respond as a team member of ${storeName}.
3. Keep responses SHORT: 1-3 sentences maximum. Be direct and helpful.
4. If you find ANY matching product in the catalog below, ALWAYS share its details (name, price, availability). Never refuse when you have relevant product data.
5. If the customer asks for something you cannot provide (link, URL, website, phone number, WhatsApp number), share whatever product info you DO have and say the team will share the rest shortly.
6. ONLY use the generic refusal "I can only help with ${storeName} questions" for truly unrelated topics (politics, weather, other stores, personal advice, etc.) where NONE of the product/order/policy data is relevant.
7. NEVER make up or guess information. If the answer isn't in the provided data, say you'll check and get back to them.
8. Respond in the SAME LANGUAGE the customer uses (Urdu, English, or Roman Urdu).
9. Be friendly and professional. Use the customer's name if known.
10. Maximum response length: ${MAX_REPLY_LENGTH} characters.

ORDER INQUIRY RULES:
- If the customer asks about order status, provide details from the order data below.
- If the customer has multiple orders, share the most recent order's details and mention you can look up any specific order by number.
- If no orders are found for this customer, tell them you couldn't find any orders linked to their number and ask them to share their order number.
- NEVER promise specific delivery dates unless the data explicitly shows them.
- NEVER fabricate tracking numbers, courier names, or order details.

COMPLAINT / RETURN / REPLACEMENT RULES:
- When classifying as "complaint": Respond empathetically, acknowledge the issue, apologize for the inconvenience, and tell the customer that a team member will review their case and get back to them shortly.
- When classifying as "return": Acknowledge the return request, and tell the customer that a team member from the returns department will assist them shortly.
- When classifying as "replacement": Acknowledge the replacement request, and tell the customer that a team member will arrange the replacement and get back to them shortly.
- For complaints/returns/replacements, do NOT try to resolve the issue yourself — always escalate to a human.
- When classifying as "human_handoff": Acknowledge the customer's request, and tell them that a human agent will be connected shortly to assist them. Be reassuring and professional.

${knowledgeBase ? `STORE KNOWLEDGE BASE (policies, FAQs, shipping info):\n${knowledgeBase}\n` : ""}
${productCatalog ? `PRODUCT CATALOG:\n${productCatalog}\n` : "No products loaded."}
${orderContext ? `${orderContext}\n` : "No orders found for this customer's phone number."}
${conversationHistory ? `RECENT CONVERSATION:\n${conversationHistory}\n` : ""}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: messageText },
      ],
      max_tokens: 300,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const rawContent = response.choices?.[0]?.message?.content?.trim() || "";

    if (!rawContent) {
      releaseAiLock(lockKey);
      return { success: false, error: "Empty AI response" };
    }

    let reply = "";
    let classification: AiClassification = null;

    try {
      const parsed = JSON.parse(rawContent);
      reply = (parsed.reply || parsed.message || "").trim();
      const cls = parsed.classification;
      if (cls === "complaint" || cls === "return" || cls === "replacement" || cls === "human_handoff") {
        classification = cls;
      }
    } catch {
      reply = rawContent;
      console.warn(`${LOG_PREFIX} Failed to parse JSON response, using raw text`);
    }

    if (!reply) {
      releaseAiLock(lockKey);
      return { success: false, error: "Empty reply in AI response" };
    }

    if (reply.length > MAX_REPLY_LENGTH) {
      reply = reply.substring(0, MAX_REPLY_LENGTH - 3) + "...";
    }

    console.log(`${LOG_PREFIX} Generated reply for ${customerPhone}: "${reply.substring(0, 80)}..."${classification ? ` [classified: ${classification}]` : ""}`);
    return { success: true, reply, classification };
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
