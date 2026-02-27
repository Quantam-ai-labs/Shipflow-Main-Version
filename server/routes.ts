import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { normalizePakistaniPhone } from "./utils/phone";
import { DEFAULT_TIMEZONE, toMerchantStartOfDay, toMerchantEndOfDay } from "./utils/timezone";
import { registerAccountingRoutes } from "./routes/accounting";
import { registerTransactionRoutes } from "./routes/transactions";
import { registerMarketingRoutes } from "./routes/marketing";
import {
  shipmentPrintRecords,
  users,
  merchants,
  adminActionLogs,
  teamMembers,
  teamInvites,
  orders,
  codReconciliation,
  expenses,
  stockLedger,
  courierDues,
  shopifyStores,
  courierAccounts,
  shipments,
  accountingProducts,
  sales,
  cashAccounts,
  parties,
} from "@shared/schema";
import {
  and,
  eq,
  inArray,
  ilike,
  or,
  sql,
  desc,
  count,
  isNotNull,
  isNull,
  gte,
  lte,
} from "drizzle-orm";
import {
  setupAuth,
  registerAuthRoutes,
  isAuthenticated,
} from "./replit_integrations/auth";
import { z } from "zod";
import crypto from "crypto";
import {
  shopifyService,
  cancelShopifyOrder,
  cancelShopifyFulfillment,
} from "./services/shopify";
import { cancelCourierBooking, trackShipment } from "./services/couriers";
import {
  transitionOrder,
  bulkTransitionOrders,
  revertOrder,
} from "./services/workflowTransition";
import {
  addPayment,
  deletePayment,
  markFullyPaid,
  resetPayments,
  bulkMarkPrepaid,
  recalculateOrderPayment,
} from "./services/payments";
import { encryptToken, decryptToken } from "./services/encryption";
import {
  registerShopifyWebhooks,
  checkWebhookHealth,
} from "./services/webhookRegistration";
import { webhookHandler } from "./services/webhookHandler";
import { sendInviteEmail, sendMerchantSetupEmail } from "./services/email";
import { sendInviteEmailSES } from "./services/sesEmail";
import {
  writeBackAddress,
  writeBackCancel,
  writeBackTags,
  writeBackFulfillment,
} from "./services/shopifyWriteBack";
import { leopardsService } from "./services/couriers/leopards";
import { postexService } from "./services/couriers/postex";
import { getCourierSyncMetrics, cleanupStaleManualSyncProgress, autoTransitionOrder } from "./services/courierSyncScheduler";
import { getShopifySyncMetrics } from "./services/autoSync";

const oauthStateStore = new Map<
  string,
  {
    merchantId: string;
    shopDomain: string;
    credSource: string;
    createdAt: number;
  }
>();
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of oauthStateStore) {
    if (now - val.createdAt > 10 * 60 * 1000) oauthStateStore.delete(key);
  }
  cleanupDbOAuthStates().catch(() => {});
}, 60 * 1000);

interface ShopifySyncProgress {
  status: 'running' | 'done' | 'error';
  processed: number;
  total: number;
  created: number;
  updated: number;
  error?: string;
  completedAt?: number;
}

const shopifySyncProgress = new Map<string, ShopifySyncProgress>();

setInterval(() => {
  const now = Date.now();
  for (const [merchantId, progress] of shopifySyncProgress) {
    const maxAge = progress.status === 'done' ? 5 * 60 * 1000 : (progress.status === 'error' ? 10 * 60 * 1000 : Infinity);
    if (maxAge !== Infinity && progress.completedAt && (now - progress.completedAt) > maxAge) {
      shopifySyncProgress.delete(merchantId);
    }
  }
}, 60 * 1000);

async function storeOAuthStateInDb(
  state: string,
  data: { merchantId: string; shopDomain: string; credSource: string },
) {
  try {
    const { pool } = await import("./db");
    await pool.query(
      `INSERT INTO oauth_states (state, merchant_id, shop_domain, cred_source, created_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (state) DO UPDATE SET merchant_id=$2, shop_domain=$3, cred_source=$4, created_at=NOW()`,
      [state, data.merchantId, data.shopDomain, data.credSource],
    );
  } catch (e: any) {
    if (e.code === "42P01") {
      const { pool } = await import("./db");
      await pool.query(
        `CREATE TABLE IF NOT EXISTS oauth_states (state VARCHAR(64) PRIMARY KEY, merchant_id VARCHAR(255) NOT NULL, shop_domain VARCHAR(255) NOT NULL, cred_source VARCHAR(32) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW())`,
      );
      await pool.query(
        `INSERT INTO oauth_states (state, merchant_id, shop_domain, cred_source, created_at) VALUES ($1, $2, $3, $4, NOW())`,
        [state, data.merchantId, data.shopDomain, data.credSource],
      );
    } else {
      console.warn("[OAuth] Failed to store state in DB:", e.message);
    }
  }
}

async function getOAuthStateFromDb(
  state: string,
): Promise<{
  merchantId: string;
  shopDomain: string;
  credSource: string;
} | null> {
  try {
    const { pool } = await import("./db");
    const result = await pool.query(
      `DELETE FROM oauth_states WHERE state=$1 RETURNING merchant_id, shop_domain, cred_source`,
      [state],
    );
    if (result.rows.length > 0) {
      return {
        merchantId: result.rows[0].merchant_id,
        shopDomain: result.rows[0].shop_domain,
        credSource: result.rows[0].cred_source,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function cleanupDbOAuthStates() {
  try {
    const { pool } = await import("./db");
    await pool.query(
      `DELETE FROM oauth_states WHERE created_at < NOW() - INTERVAL '10 minutes'`,
    );
  } catch {}
}

function mapCourierSlugToName(slug: string): string | null {
  const map: Record<string, string> = {
    leopards: "Leopards Courier",
    postex: "PostEx",
    tcs: "TCS",
  };
  return map[slug.toLowerCase()] || null;
}

// Zod schemas for validation
const remarkSchema = z.object({
  content: z.string().min(1, "Content is required"),
  remarkType: z
    .enum(["general", "delivery", "payment", "return"])
    .optional()
    .default("general"),
});

const reconcileSchema = z.object({
  recordIds: z.array(z.string()).min(1, "At least one record ID is required"),
  settlementRef: z.string().optional(),
});

const teamInviteSchema = z.object({
  email: z.string().email("Valid email is required"),
  role: z.enum(["admin", "manager", "agent"]).optional().default("agent"),
});

const teamRoleUpdateSchema = z.object({
  role: z.enum(["admin", "manager", "agent"]),
});

const courierAccountSchema = z.object({
  courierName: z.enum(["leopards", "postex", "tcs"]),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  accountNumber: z.string().optional(),
  useEnvCredentials: z.boolean().optional(),
  settings: z.record(z.any()).optional(),
});

const settingsUpdateSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  notifications: z
    .object({
      emailOrderUpdates: z.boolean(),
      emailDeliveryAlerts: z.boolean(),
      emailCodReminders: z.boolean(),
    })
    .optional(),
});

// Helper function to generate unique order number
function generateOrderNumber(): string {
  const prefix = "SF";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// Helper function to generate tracking number
function generateTrackingNumber(courier: string): string {
  const prefixes: Record<string, string> = {
    leopards: "LEO",
    postex: "PEX",
    tcs: "TCS",
  };
  const prefix = prefixes[courier] || "TRK";
  return `${prefix}${Date.now().toString().slice(-8)}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

// Simulate syncing orders from Shopify (generates demo data for testing)
async function syncShopifyOrders(
  merchantId: string,
  storeDomain: string,
): Promise<{ synced: number; total: number }> {
  // Generate realistic demo orders (simulating Shopify API response)
  const customerNames = [
    "Ahmad Ali",
    "Sara Khan",
    "Muhammad Hassan",
    "Fatima Zahra",
    "Ali Raza",
    "Ayesha Malik",
    "Usman Ahmed",
    "Hira Noor",
    "Bilal Qureshi",
    "Zainab Shah",
  ];

  const cities = [
    "Karachi",
    "Lahore",
    "Islamabad",
    "Rawalpindi",
    "Faisalabad",
    "Multan",
    "Peshawar",
    "Quetta",
  ];

  const products = [
    { name: "Designer Kurta", price: 2500 },
    { name: "Silk Dupatta", price: 1800 },
    { name: "Lawn Suit 3pc", price: 4500 },
    { name: "Cotton Shalwar", price: 1200 },
    { name: "Embroidered Shirt", price: 3200 },
    { name: "Chiffon Dress", price: 5500 },
    { name: "Formal Suit", price: 6800 },
    { name: "Casual Kurti", price: 1500 },
  ];

  const statuses: Array<
    | "pending"
    | "confirmed"
    | "processing"
    | "shipped"
    | "delivered"
    | "cancelled"
    | "returned"
  > = ["pending", "confirmed", "processing", "shipped", "delivered"];

  const couriers = ["leopards", "postex", "tcs"];

  // Generate 5-10 new orders
  const orderCount = Math.floor(Math.random() * 6) + 5;
  let syncedCount = 0;

  for (let i = 0; i < orderCount; i++) {
    const customer =
      customerNames[Math.floor(Math.random() * customerNames.length)];
    const city = cities[Math.floor(Math.random() * cities.length)];
    const product = products[Math.floor(Math.random() * products.length)];
    const quantity = Math.floor(Math.random() * 3) + 1;
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const courier = couriers[Math.floor(Math.random() * couriers.length)];

    const subtotal = product.price * quantity;
    const shippingCost = Math.random() > 0.5 ? 200 : 0;
    const total = subtotal + shippingCost;

    const isCod = Math.random() > 0.3; // 70% COD orders

    // Create order
    const order = await storage.createOrder({
      merchantId,
      shopifyOrderId: `shopify_${Date.now()}_${i}`,
      orderNumber: generateOrderNumber(),
      customerName: customer,
      customerEmail: `${customer.toLowerCase().replace(" ", ".")}@example.com`,
      customerPhone: `03${Math.floor(Math.random() * 900000000) + 100000000}`.slice(0, 11),
      shippingAddress: `House ${Math.floor(Math.random() * 500) + 1}, Street ${Math.floor(Math.random() * 50) + 1}`,
      city,
      country: "Pakistan",
      lineItems: [{ name: product.name, quantity, price: product.price }],
      subtotalAmount: subtotal.toString(),
      shippingAmount: shippingCost.toString(),
      totalAmount: total.toString(),
      currency: "PKR",
      paymentMethod: isCod ? "cod" : "prepaid",
      paymentStatus: isCod ? "pending" : "paid",
      orderStatus: status,
    });

    // Create shipment for non-pending orders
    if (status !== "pending") {
      const shipmentStatus =
        status === "delivered"
          ? "delivered"
          : status === "shipped"
            ? "in_transit"
            : "booked";

      await storage.createShipment({
        merchantId,
        orderId: order.id,
        courierName: courier,
        trackingNumber: generateTrackingNumber(courier),
        status: shipmentStatus,
        estimatedDelivery: new Date(
          Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000,
        ),
        shippingCost: shippingCost.toString(),
        weight: (Math.random() * 2 + 0.5).toFixed(2),
      });
    }

    // Create COD record for COD orders
    if (isCod) {
      const codStatus = status === "delivered" ? "received" : "pending";
      const courierFee = Math.floor(total * 0.03); // 3% courier fee
      await storage.createCodReconciliation({
        merchantId,
        orderId: order.id,
        courierName: courier,
        trackingNumber: order.orderNumber,
        codAmount: total.toString(),
        courierFee: courierFee.toString(),
        netAmount: (total - courierFee).toString(),
        status: codStatus,
      });
    }

    syncedCount++;
  }

  // Update last sync timestamp
  const store = await storage.getShopifyStore(merchantId);
  if (store) {
    await storage.updateShopifyStore(store.id, { lastSyncAt: new Date() });
  }

  return { synced: syncedCount, total: orderCount };
}

// Helper to get user ID from session
function getSessionUserId(req: any): string | null {
  return req.session?.userId || null;
}

// Helper to get user name from DB for audit logging
async function getSessionUserName(req: any): Promise<string> {
  const userId = getSessionUserId(req);
  if (!userId) return "Unknown";
  try {
    const user = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, userId));
    if (user.length > 0) {
      return (
        ((user[0].firstName || "") + " " + (user[0].lastName || "")).trim() ||
        "Unknown"
      );
    }
  } catch {}
  return "Unknown";
}

// Helper to get merchant ID from authenticated user
async function getMerchantIdForUser(req: any): Promise<string | null> {
  const userId = getSessionUserId(req);
  if (!userId) {
    return null;
  }

  const existingMerchantId = await storage.getUserMerchantId(userId);
  if (existingMerchantId) {
    return existingMerchantId;
  }

  return null;
}

// Middleware to ensure merchant access
async function requireMerchant(req: any, res: any): Promise<string | null> {
  const merchantId = await getMerchantIdForUser(req);
  if (!merchantId) {
    res.status(403).json({ message: "Access denied. No merchant access." });
    return null;
  }
  return merchantId;
}

const dashboardStatsCache = new Map<string, { data: any; fetchedAt: number }>();
const workflowCountsCache = new Map<string, { data: any; fetchedAt: number }>();
const DASHBOARD_CACHE_TTL_MS = 60000;
const DASHBOARD_CACHE_MAX_SIZE = 100;

function cleanExpiredCacheEntries(cache: Map<string, { data: any; fetchedAt: number }>) {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.fetchedAt > DASHBOARD_CACHE_TTL_MS) cache.delete(key);
  }
  if (cache.size > DASHBOARD_CACHE_MAX_SIZE) {
    const entries = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
    const toRemove = entries.slice(0, cache.size - DASHBOARD_CACHE_MAX_SIZE);
    for (const [key] of toRemove) cache.delete(key);
  }
}

const merchantTimezoneCache = new Map<string, { tz: string; fetchedAt: number }>();
async function getMerchantTimezone(merchantId: string): Promise<string> {
  const cached = merchantTimezoneCache.get(merchantId);
  if (cached && Date.now() - cached.fetchedAt < 300000) {
    return cached.tz;
  }
  const merchant = await storage.getMerchant(merchantId);
  const tz = (merchant as any)?.timezone || DEFAULT_TIMEZONE;
  merchantTimezoneCache.set(merchantId, { tz, fetchedAt: Date.now() });
  return tz;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Setup authentication
  await setupAuth(app);
  registerAuthRoutes(app);
  registerAccountingRoutes(app);
  registerTransactionRoutes(app);
  registerMarketingRoutes(app);

  // Seed demo data on startup
  await storage.seedDemoData();

  function normalizeCourierName(raw: string): string {
    const name = raw.toLowerCase().trim();
    if (name.includes("leopard")) return "leopards";
    if (name.includes("postex") || name.includes("post ex")) return "postex";
    if (name.includes("tcs")) return "tcs";
    return name;
  }

  async function getCourierCredentials(
    merchantId: string,
    courierName: string,
  ): Promise<{ apiKey: string | null; apiSecret: string | null } | null> {
    const normalized = normalizeCourierName(courierName);
    const accounts = await storage.getCourierAccounts(merchantId);
    const account = accounts.find((a) => a.courierName === normalized);
    const settings = (account?.settings as Record<string, any>) || {};

    if (normalized === "leopards") {
      const apiKey =
        (!settings.useEnvCredentials && account?.apiKey) ||
        process.env.LEOPARDS_API_KEY ||
        null;
      const apiSecret =
        (!settings.useEnvCredentials && account?.apiSecret) ||
        process.env.LEOPARDS_API_PASSWORD ||
        null;
      if (!apiKey || !apiSecret) return null;
      return { apiKey, apiSecret };
    }

    if (normalized === "postex") {
      const apiKey =
        (!settings.useEnvCredentials && account?.apiKey) ||
        process.env.POSTEX_API_TOKEN ||
        null;
      if (!apiKey) return null;
      return { apiKey, apiSecret: null };
    }

    return null;
  }

  // Dashboard Stats
  app.get("/api/dashboard/stats", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { dateFrom, dateTo } = req.query;
      const cacheKey = `${merchantId}:${dateFrom || ""}:${dateTo || ""}`;
      const cached = dashboardStatsCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < DASHBOARD_CACHE_TTL_MS) {
        return res.json(cached.data);
      }

      const timezone = await getMerchantTimezone(merchantId);
      const stats = await storage.getDashboardStats(merchantId, {
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        timezone,
      });
      dashboardStatsCache.set(cacheKey, { data: stats, fetchedAt: Date.now() });
      cleanExpiredCacheEntries(dashboardStatsCache);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Orders
  app.get("/api/orders/recent", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const orders = await storage.getRecentOrders(merchantId, 5);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching recent orders:", error);
      res.status(500).json({ message: "Failed to fetch recent orders" });
    }
  });

  app.get("/api/orders", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const {
        search,
        searchOrderNumber,
        searchTracking,
        searchName,
        searchPhone,
        status,
        courier,
        city,
        month,
        dateFrom,
        dateTo,
        page,
        pageSize,
        workflowStatus,
        pendingReasonType,
        shipmentStatus,
        light,
      } = req.query;

      const timezone = await getMerchantTimezone(merchantId);
      const result = await storage.getOrders(merchantId, {
        search: search as string,
        searchOrderNumber: searchOrderNumber as string,
        searchTracking: searchTracking as string,
        searchName: searchName as string,
        searchPhone: searchPhone as string,
        status: status as string,
        courier: courier as string,
        city: city as string,
        month: month as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        page: parseInt(page as string) || 1,
        pageSize: Math.min(parseInt(pageSize as string) || 50, 200),
        workflowStatus: workflowStatus as string,
        pendingReasonType: pendingReasonType as string,
        shipmentStatus: shipmentStatus as string,
        excludeHeavyFields: light === "1" || light === "true",
        timezone,
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/cities", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const cities = await storage.getUniqueCities(merchantId);
      res.json({ cities });
    } catch (error) {
      console.error("Error fetching cities:", error);
      res.status(500).json({ message: "Failed to fetch cities" });
    }
  });

  app.get("/api/orders/statuses", isAuthenticated, async (req, res) => {
    try {
      const { UNIVERSAL_STATUSES } = await import(
        "./services/statusNormalization"
      );
      const { getStatusDisplayLabel } = await import(
        "./services/statusNormalization"
      );
      res.json({
        statuses: UNIVERSAL_STATUSES.map((s) => ({
          value: s,
          label: getStatusDisplayLabel(s),
        })),
      });
    } catch (error) {
      console.error("Error fetching statuses:", error);
      res.status(500).json({ message: "Failed to fetch statuses" });
    }
  });

  app.get("/api/orders/workflow-counts", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { dateFrom, dateTo } = req.query as {
        dateFrom?: string;
        dateTo?: string;
      };
      const cacheKey = `${merchantId}:${dateFrom || ""}:${dateTo || ""}`;
      const cached = workflowCountsCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < DASHBOARD_CACHE_TTL_MS) {
        return res.json(cached.data);
      }

      const timezone = await getMerchantTimezone(merchantId);
      const counts = await storage.getWorkflowCounts(merchantId, {
        dateFrom,
        dateTo,
        timezone,
      });
      workflowCountsCache.set(cacheKey, { data: counts, fetchedAt: Date.now() });
      cleanExpiredCacheEntries(workflowCountsCache);
      res.json(counts);
    } catch (error) {
      console.error("Error fetching workflow counts:", error);
      res.status(500).json({ message: "Failed to fetch workflow counts" });
    }
  });

  app.post("/api/orders/customer-history-batch", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { phoneNumbers } = req.body as { phoneNumbers: string[] };
      if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
        return res.json({});
      }
      const normalized = phoneNumbers
        .map(p => normalizePakistaniPhone(p) || p)
        .filter(Boolean);
      const uniquePhones = [...new Set(normalized)];

      const results = await db.execute(sql`
        SELECT 
          customer_phone,
          COUNT(*)::int as order_count,
          MAX(order_date) as last_order_date,
          array_agg(order_date ORDER BY order_date DESC) as order_dates
        FROM orders 
        WHERE merchant_id = ${merchantId} 
          AND customer_phone IN ${sql.raw(`(${uniquePhones.map(p => `'${p.replace(/'/g, "''")}'`).join(",")})`)}
          AND customer_phone IS NOT NULL 
          AND customer_phone != ''
        GROUP BY customer_phone
      `);
      const historyMap: Record<string, { orderCount: number; lastOrderDate: string | null; orderDates: string[] }> = {};
      for (const row of results.rows) {
        const rawDates = row.order_dates as any;
        let orderDates: string[] = [];
        if (Array.isArray(rawDates)) {
          orderDates = rawDates.filter(Boolean).map((d: any) => String(d));
        } else if (typeof rawDates === "string") {
          orderDates = rawDates.replace(/[{}]/g, "").split(",").filter(Boolean);
        }
        historyMap[row.customer_phone as string] = {
          orderCount: row.order_count as number,
          lastOrderDate: row.last_order_date as string | null,
          orderDates,
        };
      }
      res.json(historyMap);
    } catch (error) {
      console.error("Error fetching customer history batch:", error);
      res.status(500).json({ message: "Failed to fetch customer history" });
    }
  });

  app.get("/api/orders/customer-history/:phone", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const phone = normalizePakistaniPhone(decodeURIComponent(req.params.phone)) || decodeURIComponent(req.params.phone);

      const result = await db.execute(sql`
        SELECT 
          id, order_number, customer_name, total_amount, currency, 
          workflow_status, order_date, city, courier_name, courier_tracking,
          shipment_status, payment_method, item_summary
        FROM orders 
        WHERE merchant_id = ${merchantId} 
          AND customer_phone = ${phone}
        ORDER BY order_date DESC
      `);
      res.json({
        phone,
        orderCount: result.rows.length,
        orders: result.rows.map((r: any) => ({
          id: r.id,
          orderNumber: r.order_number,
          customerName: r.customer_name,
          totalAmount: r.total_amount,
          currency: r.currency,
          workflowStatus: r.workflow_status,
          orderDate: r.order_date,
          city: r.city,
          courierName: r.courier_name,
          courierTracking: r.courier_tracking,
          shipmentStatus: r.shipment_status,
          paymentMethod: r.payment_method,
          itemSummary: r.item_summary,
        })),
      });
    } catch (error) {
      console.error("Error fetching customer history:", error);
      res.status(500).json({ message: "Failed to fetch customer history" });
    }
  });

  app.post("/api/orders/:id/workflow", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const orderId = req.params.id;
      const {
        action,
        cancelReason,
        cancelOnShopify,
        pendingReasonType,
        pendingReason,
        holdUntil,
        customerPhone,
        shippingAddress,
        city,
      } = req.body;
      const userId = getSessionUserId(req) || "system";
      const actorName = await getSessionUserName(req);

      let toStatus: string;
      let reason: string | undefined;
      let extraData: any = {};

      switch (action) {
        case "confirm":
          toStatus = "READY_TO_SHIP";
          extraData = { confirmedAt: new Date(), confirmedByUserId: userId };
          break;
        case "cancel":
          if (!cancelReason)
            return res
              .status(400)
              .json({ message: "Cancel reason is required" });
          toStatus = "CANCELLED";
          reason = cancelReason;
          extraData = {
            cancelledAt: new Date(),
            cancelledByUserId: userId,
            cancelReason,
          };
          break;
        case "pending":
          if (!pendingReasonType)
            return res
              .status(400)
              .json({ message: "Pending reason type is required" });
          toStatus = "PENDING";
          reason = pendingReason;
          extraData = { pendingReasonType, pendingReason: pendingReason || "" };
          break;
        case "hold":
          if (!holdUntil)
            return res
              .status(400)
              .json({ message: "Hold until date is required" });
          toStatus = "HOLD";
          extraData = {
            holdUntil: new Date(holdUntil),
            holdCreatedAt: new Date(),
            holdCreatedByUserId: userId,
          };
          break;
        case "release-hold":
          toStatus = "READY_TO_SHIP";
          extraData = {
            confirmedAt: new Date(),
            confirmedByUserId: userId,
            holdUntil: null,
          };
          break;
        case "fix-confirm":
          toStatus = "READY_TO_SHIP";
          extraData = {
            confirmedAt: new Date(),
            confirmedByUserId: userId,
            pendingReason: null,
            pendingReasonType: null,
          };
          if (customerPhone) extraData.customerPhone = normalizePakistaniPhone(customerPhone) || customerPhone;
          if (shippingAddress) extraData.shippingAddress = shippingAddress;
          if (city) extraData.city = city;
          break;
        case "move-to-pending":
          if (!pendingReasonType)
            return res
              .status(400)
              .json({ message: "Pending reason type is required" });
          toStatus = "PENDING";
          reason = pendingReason;
          extraData = {
            pendingReasonType,
            pendingReason: pendingReason || "",
            holdUntil: null,
          };
          break;
        case "revert":
          const revertResult = await revertOrder(
            merchantId,
            orderId,
            userId,
            req.body.reason,
            actorName,
          );
          if (!revertResult.success)
            return res.status(400).json({ message: revertResult.error });
          return res.json(revertResult.order);
        default:
          return res.status(400).json({ message: "Invalid action" });
      }

      const result = await transitionOrder({
        merchantId,
        orderId,
        toStatus,
        action,
        actorUserId: userId,
        actorName,
        reason,
        extraData,
      });
      if (!result.success)
        return res.status(400).json({ message: result.error });

      if (
        action === "cancel" &&
        cancelOnShopify &&
        result.order?.shopifyOrderId
      ) {
        try {
          const store = await storage.getShopifyStore(merchantId);
          if (store?.accessToken) {
            const shopifyToken = decryptToken(store.accessToken);
            await cancelShopifyOrder(
              store.shopDomain,
              shopifyToken,
              result.order.shopifyOrderId,
            );
            console.log(
              `[Cancel+Shopify] Order ${orderId} cancelled on Shopify`,
            );
          }
        } catch (shopifyError: any) {
          console.error(
            `[Cancel+Shopify] Failed to cancel on Shopify for order ${orderId}:`,
            shopifyError?.message,
          );
        }
      }

      res.json(result.order);
    } catch (error) {
      console.error("Error updating workflow:", error);
      res.status(500).json({ message: "Failed to update workflow" });
    }
  });

  app.post("/api/orders/bulk-workflow", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const {
        orderIds,
        action,
        cancelReason,
        cancelOnShopify,
        pendingReasonType,
        pendingReason,
        holdUntil,
      } = req.body;
      const userId = getSessionUserId(req) || "system";
      const actorName = await getSessionUserName(req);

      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ message: "Order IDs are required" });
      }

      let toStatus: string;
      let reason: string | undefined;
      let extraData: any = {};

      switch (action) {
        case "confirm":
          toStatus = "READY_TO_SHIP";
          extraData = { confirmedAt: new Date(), confirmedByUserId: userId };
          break;
        case "cancel":
          if (!cancelReason)
            return res
              .status(400)
              .json({ message: "Cancel reason is required" });
          toStatus = "CANCELLED";
          reason = cancelReason;
          extraData = {
            cancelledAt: new Date(),
            cancelledByUserId: userId,
            cancelReason,
          };
          break;
        case "pending":
          if (!pendingReasonType)
            return res
              .status(400)
              .json({ message: "Pending reason type is required" });
          toStatus = "PENDING";
          reason = pendingReason;
          extraData = { pendingReasonType, pendingReason: pendingReason || "" };
          break;
        case "hold":
          if (!holdUntil)
            return res
              .status(400)
              .json({ message: "Hold until date is required" });
          toStatus = "HOLD";
          extraData = {
            holdUntil: new Date(holdUntil),
            holdCreatedAt: new Date(),
            holdCreatedByUserId: userId,
          };
          break;
        case "release-hold":
          toStatus = "READY_TO_SHIP";
          extraData = {
            confirmedAt: new Date(),
            confirmedByUserId: userId,
            holdUntil: null,
          };
          break;
        default:
          return res.status(400).json({ message: "Invalid action" });
      }

      const result = await bulkTransitionOrders({
        merchantId,
        orderIds,
        toStatus,
        action,
        actorUserId: userId,
        actorName,
        reason,
        extraData,
      });

      if (action === "cancel" && cancelOnShopify) {
        try {
          const store = await storage.getShopifyStore(merchantId);
          if (store?.accessToken) {
            const shopifyToken = decryptToken(store.accessToken);
            for (const oid of orderIds) {
              const order = await storage.getOrderById(merchantId, oid);
              if (order?.shopifyOrderId) {
                try {
                  await cancelShopifyOrder(
                    store.shopDomain,
                    shopifyToken,
                    order.shopifyOrderId,
                  );
                  console.log(
                    `[BulkCancel+Shopify] Order ${oid} cancelled on Shopify`,
                  );
                } catch (e: any) {
                  console.error(
                    `[BulkCancel+Shopify] Failed for ${oid}:`,
                    e?.message,
                  );
                }
              }
            }
          }
        } catch (e: any) {
          console.error("[BulkCancel+Shopify] Store fetch failed:", e?.message);
        }
      }

      res.json(result);
    } catch (error) {
      console.error("Error bulk updating workflow:", error);
      res.status(500).json({ message: "Failed to bulk update workflow" });
    }
  });

  app.get("/api/orders/:id/audit-log", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const orderId = req.params.id;
      const logs = await storage.getOrderAuditLog(merchantId, orderId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching audit log:", error);
      res.status(500).json({ message: "Failed to fetch audit log" });
    }
  });

  app.get("/api/orders/:id/change-log", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const orderId = req.params.id;
      const logs = await storage.getOrderChangeLog(merchantId, orderId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching change log:", error);
      res.status(500).json({ message: "Failed to fetch change log" });
    }
  });

  const PICKED_UP_OR_BEYOND_STATUSES = [
    "PICKED_UP",
    "IN_TRANSIT",
    "ARRIVED_AT_DESTINATION",
    "OUT_FOR_DELIVERY",
    "DELIVERY_ATTEMPTED",
    "DELIVERED",
    "DELIVERY_FAILED",
    "RETURNED_TO_SHIPPER",
    "RETURN_IN_TRANSIT",
  ];

  const EDITABLE_ORDER_FIELDS = [
    "customerName",
    "customerPhone",
    "customerEmail",
    "shippingAddress",
    "city",
    "province",
    "postalCode",
    "notes",
    "totalAmount",
    "subtotalAmount",
    "shippingAmount",
    "discountAmount",
    "lineItems",
    "totalQuantity",
  ];

  app.patch(
    "/api/orders/:id/customer",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;
        const orderId = req.params.id;

        const order = await storage.getOrderById(merchantId, orderId);
        if (!order) return res.status(404).json({ message: "Order not found" });

        if (
          order.workflowStatus === "DELIVERED" ||
          order.workflowStatus === "RETURN" ||
          order.workflowStatus === "CANCELLED"
        ) {
          return res
            .status(403)
            .json({
              message: "Order is locked - delivered, returned, or cancelled",
            });
        }

        const updateData: any = {};
        const fieldsToCheck: Array<{ key: string; newVal: any }> = [];
        const numericFields = [
          "totalAmount",
          "subtotalAmount",
          "shippingAmount",
          "discountAmount",
          "totalQuantity",
        ];

        for (const field of EDITABLE_ORDER_FIELDS) {
          if (req.body[field] !== undefined) {
            let val = req.body[field];
            if (numericFields.includes(field)) {
              val = String(parseFloat(val) || 0);
            }
            if (field === "lineItems") {
              if (!Array.isArray(val)) {
                return res
                  .status(400)
                  .json({ message: "lineItems must be an array" });
              }
              val = val.filter(
                (item: any) => item && typeof item === "object" && item.name,
              );
            }
            if (field === "customerPhone" && typeof val === "string") {
              val = normalizePakistaniPhone(val) || val;
            }
            updateData[field] = val;
            fieldsToCheck.push({ key: field, newVal: val });
          }
        }

        if (Object.keys(updateData).length === 0) {
          return res.status(400).json({ message: "No fields to update" });
        }

        const updated = await storage.updateOrderWorkflow(
          merchantId,
          orderId,
          updateData,
        );
        if (!updated)
          return res.status(404).json({ message: "Order not found" });

        const actorUserId = getSessionUserId(req) || null;
        const actorName = await getSessionUserName(req);

        for (const field of fieldsToCheck) {
          const oldValue = (order as any)[field.key];
          const newValStr =
            field.key === "lineItems"
              ? JSON.stringify(field.newVal)
              : String(field.newVal ?? "");
          const oldValStr =
            field.key === "lineItems"
              ? JSON.stringify(oldValue)
              : String(oldValue ?? "");
          if (oldValStr !== newValStr) {
            await storage.createOrderChangeLog({
              orderId,
              merchantId,
              changeType: "FIELD_EDIT",
              fieldName: field.key,
              oldValue: oldValue != null ? oldValStr : null,
              newValue: field.newVal != null ? newValStr : null,
              actorUserId,
              actorName,
              actorType: "user",
            });
          }
        }

        if (order.shopifyOrderId) {
          const addressFields = [
            "customerName",
            "customerPhone",
            "customerEmail",
            "shippingAddress",
            "city",
            "province",
            "postalCode",
          ];
          const hasAddressChange = addressFields.some(
            (f) => updateData[f] !== undefined,
          );
          if (hasAddressChange) {
            writeBackAddress(merchantId, order.shopifyOrderId, updateData)
              .then((result) => {
                if (!result.success) {
                  console.warn(
                    `[ShopifyWriteBack] Address sync failed for order ${orderId}: ${result.error}`,
                  );
                }
              })
              .catch((err) =>
                console.error(`[ShopifyWriteBack] Address sync error:`, err),
              );
          }
        }

        res.json(updated);
      } catch (error) {
        console.error("Error updating order:", error);
        res.status(500).json({ message: "Failed to update order" });
      }
    },
  );

  app.post(
    "/api/orders/:id/cancel-booking",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;
        const orderId = req.params.id;
        const skipCourierApi = req.body?.skipCourierApi === true;

        const order = await storage.getOrderById(merchantId, orderId);
        if (!order) return res.status(404).json({ message: "Order not found" });

        if (order.workflowStatus !== "BOOKED") {
          return res
            .status(400)
            .json({
              message: "Order must be in BOOKED status to cancel booking",
            });
        }

        if (
          order.shipmentStatus &&
          PICKED_UP_OR_BEYOND_STATUSES.includes(order.shipmentStatus)
        ) {
          return res
            .status(403)
            .json({ message: "Cannot cancel - courier has already picked up" });
        }

        const oldCourierTracking = order.courierTracking;
        const oldCourierName = order.courierName;
        let courierCancelResult: { success: boolean; message: string } | null =
          null;

        if (!skipCourierApi && oldCourierTracking && oldCourierName) {
          const creds = await getCourierCredentials(merchantId, oldCourierName);
          if (creds) {
            courierCancelResult = await cancelCourierBooking(
              oldCourierName,
              oldCourierTracking,
              {
                apiKey: creds.apiKey || undefined,
                apiSecret: creds.apiSecret || undefined,
              },
            );
            console.log(
              `[Cancel] Courier cancel result for ${oldCourierTracking}:`,
              courierCancelResult,
            );
            if (!courierCancelResult.success) {
              let alreadyCancelled = false;
              try {
                const liveTracking = await trackShipment(
                  oldCourierName,
                  oldCourierTracking,
                  { apiKey: creds.apiKey || undefined, apiSecret: creds.apiSecret || undefined },
                  order.shipmentStatus,
                  order.workflowStatus,
                  merchantId,
                );
                if (liveTracking) {
                  const liveStatus = (liveTracking.normalizedStatus || '').toUpperCase();
                  const liveRaw = (liveTracking.rawCourierStatus || '').toLowerCase();
                  if (liveStatus === 'CANCELLED' || liveRaw.includes('cancel')) {
                    alreadyCancelled = true;
                    console.log(`[Cancel] Shipment ${oldCourierTracking} already cancelled on courier — proceeding with local cleanup`);
                  }
                }
              } catch (trackErr: any) {
                console.warn(`[Cancel] Live tracking check failed for ${oldCourierTracking}:`, trackErr?.message);
              }

              if (!alreadyCancelled) {
                const cleanMsg =
                  typeof courierCancelResult.message === "string"
                    ? courierCancelResult.message
                    : JSON.stringify(courierCancelResult.message);
                return res.status(400).json({
                  message: `Courier cancellation failed: ${cleanMsg}`,
                });
              }
            }
          }
        }

        let fulfillmentCancelResult: {
          success: boolean;
          error?: string;
        } | null = null;
        if (order.shopifyFulfillmentId && order.shopifyOrderId) {
          const store = await storage.getShopifyStore(merchantId);
          if (store?.isConnected && store?.accessToken && store?.shopDomain) {
            let token = store.accessToken;
            try {
              token = decryptToken(store.accessToken);
            } catch {}
            fulfillmentCancelResult = await cancelShopifyFulfillment(
              store.shopDomain,
              token,
              order.shopifyFulfillmentId,
            );
            console.log(
              `[Cancel] Shopify fulfillment cancel result for ${order.shopifyFulfillmentId}:`,
              fulfillmentCancelResult,
            );
            if (!fulfillmentCancelResult.success) {
              console.warn(
                `[Cancel] Shopify fulfillment cancel failed (non-blocking): ${fulfillmentCancelResult.error}`,
              );
            }
          }
        }

        const userId = getSessionUserId(req) || "system";
        const actorName = await getSessionUserName(req);
        const result = await transitionOrder({
          merchantId,
          orderId,
          toStatus: "READY_TO_SHIP",
          action: "cancel_booking",
          actorUserId: userId,
          actorName,
          actorType: "user",
          reason: courierCancelResult
            ? `Booking cancelled with courier API (${courierCancelResult.message})`
            : "Booking cancelled by user (local only)",
        });

        if (!result.success) {
          return res.status(400).json({ message: result.error });
        }

        await storage.updateOrderWorkflow(merchantId, orderId, {
          courierName: null,
          courierTracking: null,
          courierSlipUrl: null,
          bookingStatus: null,
          bookingError: null,
          bookedAt: null,
          shipmentStatus: "Unfulfilled",
          courierRawStatus: null,
          shopifyFulfillmentId: null,
        });

        const existingBookingJob = await storage.getBookingJob(merchantId, orderId, oldCourierName || "");
        if (existingBookingJob) {
          await storage.updateBookingJob(existingBookingJob.id, {
            status: "cancelled",
            errorMessage: "Booking cancelled by user",
          });
        }

        await storage.createOrderChangeLog({
          orderId,
          merchantId,
          changeType: "BOOKING_CANCELLED",
          actorUserId: userId,
          actorName,
          actorType: "user",
          metadata: {
            oldCourierTracking,
            oldCourierName,
            courierApiCalled: !!courierCancelResult,
            courierCancelResult: courierCancelResult || undefined,
            fulfillmentCancelled: fulfillmentCancelResult?.success || false,
          },
        });

        const fulfillmentWarning =
          fulfillmentCancelResult && !fulfillmentCancelResult.success
            ? `Shopify fulfillment cancel failed: ${fulfillmentCancelResult.error}`
            : undefined;
        res.json({
          ...result.order,
          courierCancelResult,
          fulfillmentCancelled: fulfillmentCancelResult?.success || false,
          fulfillmentWarning,
        });
      } catch (error) {
        console.error("Error cancelling booking:", error);
        res.status(500).json({ message: "Failed to cancel booking" });
      }
    },
  );

  app.post(
    "/api/orders/retry-fulfillment-writeback",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const bookedOrders: any[] = [];
        let page = 1;
        const pageSize = 200;
        while (true) {
          const { orders: batch } = await storage.getOrders(merchantId, {
            workflowStatus: "BOOKED",
            page,
            pageSize,
          });
          for (const o of batch) {
            if (o.courierTracking && o.shopifyOrderId && !o.shopifyFulfillmentId) {
              bookedOrders.push(o);
            }
          }
          if (batch.length < pageSize) break;
          page++;
        }

        if (bookedOrders.length === 0) {
          return res.json({ message: "No booked orders need fulfillment retry", retried: 0, succeeded: 0, failed: 0 });
        }

        let succeeded = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const order of bookedOrders) {
          const cn = (order.courierName || "").toLowerCase();
          const courierDisplayName = cn.includes("leopard") ? "Leopards Courier" : cn.includes("postex") ? "PostEx" : cn.includes("tcs") ? "TCS" : order.courierName || "Unknown";
          try {
            const result = await writeBackFulfillment(
              merchantId,
              order.id,
              order.shopifyOrderId,
              order.courierTracking,
              courierDisplayName,
            );
            if (result.success) {
              succeeded++;
              await storage.updateOrder(merchantId, order.id, { bookingError: null });
            } else {
              failed++;
              errors.push(`${order.orderNumber}: ${result.error}`);
            }
          } catch (err: any) {
            failed++;
            errors.push(`${order.orderNumber}: ${err.message}`);
          }
          await new Promise(r => setTimeout(r, 500));
        }

        console.log(`[RetryFulfillment] Retried ${bookedOrders.length} orders: ${succeeded} succeeded, ${failed} failed`);
        res.json({
          message: `Retried ${bookedOrders.length} booked orders`,
          retried: bookedOrders.length,
          succeeded,
          failed,
          errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
        });
      } catch (error: any) {
        console.error("Error retrying fulfillment write-backs:", error);
        res.status(500).json({ message: "Failed to retry fulfillment write-backs" });
      }
    },
  );

  app.post(
    "/api/orders/bulk-cleanup-cancelled",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const cancelledOrders: any[] = [];
        const allBookedOrders: any[] = [];
        let page = 1;
        const pageSize = 200;
        while (true) {
          const { orders: batch } = await storage.getOrders(merchantId, {
            workflowStatus: "BOOKED",
            page,
            pageSize,
          });
          for (const o of batch) {
            allBookedOrders.push(o);
            const raw = (o.courierRawStatus || "").toLowerCase();
            const ship = (o.shipmentStatus || "").toUpperCase();
            if (raw.includes("cancel") || ship === "CANCELLED") {
              cancelledOrders.push(o);
            }
          }
          if (batch.length < pageSize) break;
          page++;
        }

        const uncheckedOrders = allBookedOrders.filter(
          (o) => !cancelledOrders.some((c) => c.id === o.id) && o.courierTracking && o.courierName
        );

        if (uncheckedOrders.length > 0) {
          console.log(`[BulkCleanup] Checking ${uncheckedOrders.length} BOOKED orders with live courier tracking...`);
          for (const o of uncheckedOrders) {
            try {
              const creds = await getCourierCredentials(merchantId, o.courierName);
              if (!creds) continue;
              const liveTracking = await trackShipment(
                o.courierName,
                o.courierTracking,
                { apiKey: creds.apiKey || undefined, apiSecret: creds.apiSecret || undefined },
                o.shipmentStatus,
                o.workflowStatus,
                merchantId,
              );
              if (liveTracking) {
                const liveStatus = (liveTracking.normalizedStatus || '').toUpperCase();
                const liveRaw = (liveTracking.rawCourierStatus || '').toLowerCase();
                if (liveStatus === 'CANCELLED' || liveRaw.includes('cancel')) {
                  console.log(`[BulkCleanup] Live check: ${o.orderNumber} (${o.courierTracking}) is cancelled on courier`);
                  cancelledOrders.push(o);
                }
              }
            } catch (err: any) {
              console.warn(`[BulkCleanup] Live tracking check failed for ${o.orderNumber}: ${err?.message}`);
            }
          }
        }

        if (cancelledOrders.length === 0) {
          return res.json({
            cleaned: 0,
            message: "No cancelled BOOKED orders found",
          });
        }

        const userId = getSessionUserId(req) || "system";
        const actorName = await getSessionUserName(req);
        let cleaned = 0;
        const errors: string[] = [];

        const store = await storage.getShopifyStore(merchantId);
        let shopifyToken: string | null = null;
        if (store?.isConnected && store?.accessToken && store?.shopDomain) {
          try {
            shopifyToken = decryptToken(store.accessToken);
          } catch {
            shopifyToken = store.accessToken;
          }
        }

        for (const order of cancelledOrders) {
          try {
            if (
              order.shopifyFulfillmentId &&
              shopifyToken &&
              store?.shopDomain
            ) {
              try {
                await cancelShopifyFulfillment(
                  store.shopDomain,
                  shopifyToken,
                  order.shopifyFulfillmentId,
                );
              } catch (e: any) {
                console.warn(
                  `[BulkCleanup] Fulfillment cancel failed for ${order.orderNumber}: ${e.message}`,
                );
              }
            }

            await storage.updateOrderWorkflow(merchantId, order.id, {
              courierName: null,
              courierTracking: null,
              courierSlipUrl: null,
              bookingStatus: null,
              bookingError: null,
              bookedAt: null,
              shipmentStatus: "Unfulfilled",
              courierRawStatus: null,
              shopifyFulfillmentId: null,
            });

            const result = await transitionOrder({
              merchantId,
              orderId: order.id,
              toStatus: "READY_TO_SHIP",
              action: "bulk_cleanup",
              actorUserId: userId,
              actorName,
              actorType: "user",
              reason:
                "Bulk cleanup: courier-cancelled order reverted to Ready to Ship",
            });

            if (result.success) {
              cleaned++;
            } else {
              errors.push(
                `${order.orderNumber}: transition failed - ${result.error}`,
              );
            }
          } catch (e: any) {
            errors.push(`${order.orderNumber}: ${e.message}`);
          }
        }

        console.log(
          `[BulkCleanup] Cleaned ${cleaned}/${cancelledOrders.length} cancelled BOOKED orders`,
        );
        res.json({
          cleaned,
          total: cancelledOrders.length,
          errors: errors.length > 0 ? errors : undefined,
        });
      } catch (error) {
        console.error("Error in bulk cleanup:", error);
        res.status(500).json({ message: "Failed to run bulk cleanup" });
      }
    },
  );

  app.post(
    "/api/orders/:id/cancel-shopify",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;
        const orderId = req.params.id;
        const reason = req.body?.reason || "other";

        const order = await storage.getOrderById(merchantId, orderId);
        if (!order) return res.status(404).json({ message: "Order not found" });

        if (!order.shopifyOrderId) {
          return res
            .status(400)
            .json({
              message: "Order has no Shopify ID - not linked to Shopify",
            });
        }

        const rawShopify = order.rawShopifyData as any;
        if (rawShopify?.cancelled_at) {
          return res
            .status(400)
            .json({ message: "Order is already cancelled on Shopify" });
        }

        const store = await storage.getShopifyStore(merchantId);
        if (
          !store ||
          !store.isConnected ||
          !store.accessToken ||
          !store.shopDomain
        ) {
          return res
            .status(400)
            .json({ message: "Shopify store is not connected" });
        }

        let shopifyCancelled = false;
        let shopifyError: string | undefined;

        const cancelResult = await cancelShopifyOrder(
          store.shopDomain,
          store.accessToken,
          order.shopifyOrderId,
          reason,
        );

        if (cancelResult.success) {
          shopifyCancelled = true;
        } else {
          shopifyError = cancelResult.error;
          console.warn(
            `[Cancel] Shopify cancellation failed for order ${orderId}, proceeding with local cancel: ${cancelResult.error}`,
          );
        }

        if (!order.cancelledAt) {
          await storage.updateOrderWorkflow(merchantId, orderId, {
            cancelledAt: new Date(),
          });
        }
        if (shopifyCancelled) {
          await storage.updateOrderWorkflow(merchantId, orderId, {
            cancelReason: "Cancelled in Shopify",
          });
        }

        const userId = getSessionUserId(req) || "system";
        const actorName = await getSessionUserName(req);
        const result = await transitionOrder({
          merchantId,
          orderId,
          toStatus: "CANCELLED",
          action: "shopify_cancel",
          actorUserId: userId,
          actorName,
          actorType: "user",
          reason: shopifyCancelled
            ? `Shopify order cancelled via API (reason: ${reason})`
            : `Order cancelled locally (Shopify cancel failed: ${shopifyError})`,
        });

        await storage.createOrderChangeLog({
          orderId,
          merchantId,
          changeType: "SHOPIFY_CANCELLED",
          actorUserId: userId,
          actorName,
          actorType: "user",
          metadata: {
            shopifyOrderId: order.shopifyOrderId,
            reason,
            shopifyCancelled,
            shopifyError,
          },
        });

        res.json({
          success: true,
          order: result.order,
          shopifyCancelled,
          ...(shopifyError && {
            shopifyWarning: `Order cancelled locally but Shopify cancellation failed: ${shopifyError}`,
          }),
        });
      } catch (error) {
        console.error("Error cancelling Shopify order:", error);
        res.status(500).json({ message: "Failed to cancel Shopify order" });
      }
    },
  );

  app.get("/api/orders/:id", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      // Get order with merchantId scope (will return undefined if not found or not owned)
      const orderId = req.params.id as string;
      const order = await storage.getOrderById(merchantId, orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Get related shipments with events (all scoped by merchantId)
      const orderShipments = await storage.getShipmentsByOrderId(
        merchantId,
        order.id,
      );
      const shipmentsWithEvents = await Promise.all(
        orderShipments.map(async (shipment) => ({
          ...shipment,
          events: await storage.getShipmentEvents(merchantId, shipment.id),
        })),
      );

      // Get remarks (scoped by merchantId via order ownership)
      const orderRemarks = await storage.getRemarks(merchantId, order.id);

      // Get change log
      const changeLog = await storage.getOrderChangeLog(merchantId, order.id);

      // Enrich line items with product images using raw Shopify data + products table
      let enrichedOrder = { ...order };
      const lineItems = order.lineItems as Array<{ name: string; quantity: number; price: string | number; sku?: string; image?: string | null; productId?: string | null; variantId?: string | null; variantTitle?: string | null }> | null;
      if (lineItems && lineItems.length > 0) {
        const rawData = order.rawShopifyData as any;
        const rawLineItems = rawData?.line_items as Array<any> | undefined;

        // Build a lookup from raw Shopify line items by title for safe matching
        const rawByTitle = new Map<string, any>();
        if (rawLineItems) {
          for (const raw of rawLineItems) {
            if (raw.title) rawByTitle.set(raw.title.toLowerCase().trim(), raw);
          }
        }

        // Collect all possible product IDs
        const productIdSet = new Set<string>();
        lineItems.forEach(item => {
          if (item.productId) productIdSet.add(item.productId);
        });
        if (rawLineItems) {
          for (const raw of rawLineItems) {
            if (raw.product_id) productIdSet.add(String(raw.product_id));
          }
        }

        const productImageMap = new Map<string, string>();
        if (productIdSet.size > 0) {
          const matchedProducts = await storage.getProductsByShopifyIds(merchantId, Array.from(productIdSet));
          for (const p of matchedProducts) {
            if (p.imageUrl) productImageMap.set(p.shopifyProductId, p.imageUrl);
          }
        }

        let anyChanged = false;
        const enrichedLineItems = lineItems.map(item => {
          if (item.image && item.productId) return item;
          // Match raw item by title (safe, not index-based)
          const rawItem = rawByTitle.get((item.name || '').toLowerCase().trim());
          const pid = item.productId || (rawItem?.product_id ? String(rawItem.product_id) : null);

          const updates: any = { ...item };
          if (!updates.productId && pid) { updates.productId = pid; anyChanged = true; }
          if (!updates.variantId && rawItem?.variant_id) { updates.variantId = String(rawItem.variant_id); anyChanged = true; }

          if (!updates.image) {
            if (rawItem?.image?.src) { updates.image = rawItem.image.src; anyChanged = true; }
            else if (pid && productImageMap.has(pid)) { updates.image = productImageMap.get(pid)!; anyChanged = true; }
          }
          return updates;
        });

        if (anyChanged) {
          enrichedOrder = { ...enrichedOrder, lineItems: enrichedLineItems };
        }
      }

      res.json({
        ...enrichedOrder,
        shipments: shipmentsWithEvents,
        remarks: orderRemarks,
        changeLog,
      });
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  app.post(
    "/api/orders/:id/remarks",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        // Validate request body
        const validated = remarkSchema.safeParse(req.body);
        if (!validated.success) {
          return res
            .status(400)
            .json({ message: validated.error.errors[0].message });
        }

        // Verify order exists and belongs to merchant
        const order = await storage.getOrderById(merchantId, req.params.id);
        if (!order) {
          return res.status(404).json({ message: "Order not found" });
        }

        const userId = getSessionUserId(req) || "unknown";

        // Create remark with merchantId scope check
        const remark = await storage.createRemark(merchantId, {
          orderId: req.params.id,
          userId,
          content: validated.data.content,
          remarkType: validated.data.remarkType,
          isInternal: true,
        });

        const actorName = await getSessionUserName(req);
        await storage.createOrderChangeLog({
          orderId: req.params.id,
          merchantId,
          changeType: "REMARK_ADDED",
          fieldName: "remarks",
          newValue: validated.data.content,
          actorUserId: userId,
          actorName,
          actorType: "user",
          metadata: { remarkType: validated.data.remarkType },
        });

        res.json(remark);
      } catch (error) {
        console.error("Error creating remark:", error);
        res.status(500).json({ message: "Failed to create remark" });
      }
    },
  );

  // Update order remark
  app.patch(
    "/api/orders/:id/remark",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const { value } = req.body;
        if (typeof value !== "string") {
          return res.status(400).json({ message: "Invalid remark value" });
        }

        // Verify order exists and belongs to merchant
        const order = await storage.getOrderById(merchantId, req.params.id);
        if (!order) {
          return res.status(404).json({ message: "Order not found" });
        }

        const updated = await storage.updateOrder(merchantId, req.params.id, {
          remark: value,
        });
        res.json(updated);
      } catch (error) {
        console.error("Error updating remark:", error);
        res.status(500).json({ message: "Failed to update remark" });
      }
    },
  );

  // ============================================
  // ORDER PAYMENTS
  // ============================================
  app.get(
    "/api/orders/:id/payments",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;
        const order = await storage.getOrderById(merchantId, req.params.id);
        if (!order) return res.status(404).json({ message: "Order not found" });
        const payments = await storage.getOrderPayments(
          merchantId,
          req.params.id,
        );
        const totalAmount = parseFloat(order.totalAmount) || 0;
        const prepaidAmount = parseFloat(order.prepaidAmount || "0");
        const codRemaining = parseFloat(
          order.codRemaining || String(totalAmount),
        );
        res.json({
          payments,
          totalAmount,
          prepaidAmount,
          codRemaining,
          codPaymentStatus: order.codPaymentStatus || "UNPAID",
          isBooked: ["BOOKED", "FULFILLED", "DELIVERED", "RETURN"].includes(
            order.workflowStatus,
          ),
        });
      } catch (error) {
        console.error("Error fetching payments:", error);
        res.status(500).json({ message: "Failed to fetch payments" });
      }
    },
  );

  app.post(
    "/api/orders/:id/payments",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const order = await storage.getOrderById(merchantId, req.params.id);
        if (!order) return res.status(404).json({ message: "Order not found" });
        if (
          ["BOOKED", "FULFILLED", "DELIVERED", "RETURN", "CANCELLED"].includes(
            order.workflowStatus,
          )
        ) {
          return res
            .status(403)
            .json({ message: "Payments locked after booking" });
        }

        const { amount, method, reference, notes } = req.body;
        if (!amount || typeof amount !== "number" || amount <= 0) {
          return res
            .status(400)
            .json({ message: "Amount must be a positive number" });
        }
        if (!method)
          return res
            .status(400)
            .json({ message: "Payment method is required" });
        const userId = getSessionUserId(req) || "unknown";
        const actorName = await getSessionUserName(req);
        const state = await addPayment(
          merchantId,
          req.params.id,
          amount,
          method,
          userId,
          reference,
          notes,
        );

        await storage.createOrderChangeLog({
          orderId: req.params.id,
          merchantId,
          changeType: "PAYMENT_ADDED",
          fieldName: "prepaidAmount",
          oldValue: order.prepaidAmount || "0",
          newValue: String(state.prepaidAmount),
          actorUserId: userId,
          actorName,
          actorType: "user",
          metadata: { amount, method, reference, notes },
        });

        res.json(state);
      } catch (error: any) {
        console.error("Error adding payment:", error);
        res
          .status(400)
          .json({ message: error.message || "Failed to add payment" });
      }
    },
  );

  app.delete(
    "/api/orders/:orderId/payments/:paymentId",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;
        const orderBefore = await storage.getOrderById(
          merchantId,
          req.params.orderId,
        );
        const state = await deletePayment(
          merchantId,
          req.params.paymentId,
          req.params.orderId,
        );
        const userId = getSessionUserId(req) || "unknown";
        const actorName = await getSessionUserName(req);
        await storage.createOrderChangeLog({
          orderId: req.params.orderId,
          merchantId,
          changeType: "PAYMENT_DELETED",
          fieldName: "prepaidAmount",
          oldValue: orderBefore?.prepaidAmount || "0",
          newValue: String(state.prepaidAmount),
          actorUserId: userId,
          actorName,
          actorType: "user",
          metadata: { paymentId: req.params.paymentId },
        });
        res.json(state);
      } catch (error: any) {
        console.error("Error deleting payment:", error);
        res
          .status(400)
          .json({ message: error.message || "Failed to delete payment" });
      }
    },
  );

  app.post(
    "/api/orders/:id/payments/mark-paid",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;
        const { method } = req.body;
        const userId = getSessionUserId(req) || "unknown";
        const actorName = await getSessionUserName(req);
        const orderBefore = await storage.getOrderById(
          merchantId,
          req.params.id,
        );
        const state = await markFullyPaid(
          merchantId,
          req.params.id,
          method || "CASH",
          userId,
        );
        await storage.createOrderChangeLog({
          orderId: req.params.id,
          merchantId,
          changeType: "PAYMENT_MARK_PAID",
          fieldName: "codPaymentStatus",
          oldValue: orderBefore?.codPaymentStatus || "UNPAID",
          newValue: "PAID",
          actorUserId: userId,
          actorName,
          actorType: "user",
          metadata: { method: method || "CASH" },
        });
        res.json(state);
      } catch (error: any) {
        console.error("Error marking fully paid:", error);
        res
          .status(400)
          .json({ message: error.message || "Failed to mark as paid" });
      }
    },
  );

  app.post(
    "/api/orders/:id/payments/reset",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;
        const orderBefore = await storage.getOrderById(
          merchantId,
          req.params.id,
        );
        const state = await resetPayments(merchantId, req.params.id);
        const userId = getSessionUserId(req) || "unknown";
        const actorName = await getSessionUserName(req);
        await storage.createOrderChangeLog({
          orderId: req.params.id,
          merchantId,
          changeType: "PAYMENT_RESET",
          fieldName: "prepaidAmount",
          oldValue: orderBefore?.prepaidAmount || "0",
          newValue: "0",
          actorUserId: userId,
          actorName,
          actorType: "user",
        });
        res.json(state);
      } catch (error: any) {
        console.error("Error resetting payments:", error);
        res
          .status(400)
          .json({ message: error.message || "Failed to reset payments" });
      }
    },
  );

  app.post(
    "/api/orders/bulk-mark-prepaid",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;
        const { orderIds, method } = req.body;
        if (!Array.isArray(orderIds) || orderIds.length === 0) {
          return res
            .status(400)
            .json({ message: "orderIds array is required" });
        }
        const userId = getSessionUserId(req) || "unknown";
        const result = await bulkMarkPrepaid(
          merchantId,
          orderIds,
          method || "CASH",
          userId,
        );
        res.json(result);
      } catch (error: any) {
        console.error("Error bulk marking prepaid:", error);
        res
          .status(500)
          .json({ message: error.message || "Failed to bulk mark prepaid" });
      }
    },
  );

  // Shipments
  app.get("/api/shipments", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const {
        search,
        status,
        courier,
        dateFrom,
        dateTo,
        page: pageStr,
        pageSize: pageSizeStr,
        workflowStatus: wfStatus,
        shipmentStatus: shipStatusParam,
      } = req.query;
      const page = parseInt(pageStr as string) || 1;
      const pageSize = parseInt(pageSizeStr as string) || 20;
      const offset = (page - 1) * pageSize;

      const targetStatuses = ["FULFILLED", "DELIVERED", "RETURN"];
      let conditions: any[] = [
        eq(orders.merchantId, merchantId),
        inArray(orders.workflowStatus, targetStatuses),
      ];

      if (wfStatus && wfStatus !== "all") {
        conditions.push(eq(orders.workflowStatus, wfStatus as string));
      }

      if (shipStatusParam && shipStatusParam !== "all") {
        conditions.push(eq(orders.shipmentStatus, shipStatusParam as string));
      }

      if (courier && courier !== "all") {
        const mappedCourier =
          mapCourierSlugToName(courier as string) || (courier as string);
        conditions.push(eq(orders.courierName, mappedCourier));
      }

      if (search) {
        const searchTerm = `%${search}%`;
        conditions.push(
          or(
            ilike(orders.orderNumber, searchTerm),
            ilike(orders.customerName, searchTerm),
            ilike(orders.customerPhone || "", searchTerm),
            ilike(orders.courierTracking || "", searchTerm),
            ilike(orders.city || "", searchTerm),
          ),
        );
      }

      const tz = await getMerchantTimezone(merchantId);
      if (dateFrom) {
        conditions.push(sql`${orders.orderDate} >= ${toMerchantStartOfDay(dateFrom as string, tz)}`);
      }
      if (dateTo) {
        conditions.push(sql`${orders.orderDate} <= ${toMerchantEndOfDay(dateTo as string, tz)}`);
      }

      const whereClause = and(...conditions);

      const [result, totalResult] = await Promise.all([
        db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            customerName: orders.customerName,
            customerPhone: orders.customerPhone,
            city: orders.city,
            courierName: orders.courierName,
            courierTracking: orders.courierTracking,
            totalAmount: orders.totalAmount,
            codRemaining: orders.codRemaining,
            codPaymentStatus: orders.codPaymentStatus,
            workflowStatus: orders.workflowStatus,
            remark: orders.remark,
            orderDate: orders.orderDate,
            dispatchedAt: orders.dispatchedAt,
            deliveredAt: orders.deliveredAt,
            returnedAt: orders.returnedAt,
            shipmentStatus: orders.shipmentStatus,
            courierRawStatus: orders.courierRawStatus,
            lastTrackingUpdate: orders.lastTrackingUpdate,
            prepaidAmount: orders.prepaidAmount,
            paymentMethod: orders.paymentMethod,
          })
          .from(orders)
          .where(whereClause)
          .orderBy(desc(orders.orderDate))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: count() }).from(orders).where(whereClause),
      ]);

      const countConditions: any[] = [
        eq(orders.merchantId, merchantId),
        inArray(orders.workflowStatus, targetStatuses),
      ];
      if (dateFrom) {
        countConditions.push(sql`${orders.orderDate} >= ${toMerchantStartOfDay(dateFrom as string, tz)}`);
      }
      if (dateTo) {
        countConditions.push(sql`${orders.orderDate} <= ${toMerchantEndOfDay(dateTo as string, tz)}`);
      }

      const countsByStatus = await db
        .select({
          workflowStatus: orders.workflowStatus,
          count: count(),
        })
        .from(orders)
        .where(and(...countConditions))
        .groupBy(orders.workflowStatus);

      const counts: Record<string, number> = {};
      for (const row of countsByStatus) {
        counts[row.workflowStatus] = row.count;
      }

      res.json({
        orders: result,
        total: totalResult[0]?.count || 0,
        page,
        pageSize,
        counts,
      });
    } catch (error) {
      console.error("Error fetching shipments:", error);
      res.status(500).json({ message: "Failed to fetch shipments" });
    }
  });

  app.get("/api/booking-logs", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const {
        courier,
        status,
        dateFrom,
        dateTo,
        page: pageStr,
        pageSize: pageSizeStr,
      } = req.query;
      const page = parseInt(pageStr as string) || 1;
      const pageSize = parseInt(pageSizeStr as string) || 20;

      const result = await storage.getBookingLogs(merchantId, {
        page,
        pageSize,
        courier: courier as string,
        status: status as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
      });

      res.json({ ...result, page, pageSize });
    } catch (error) {
      console.error("Error fetching booking logs:", error);
      res.status(500).json({ message: "Failed to fetch booking logs" });
    }
  });

  app.get("/api/shipper-advice", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { courier, dateFrom, dateTo } = req.query;
      const targetStatuses = ["FULFILLED", "DELIVERED", "RETURN"];

      let conditions: any[] = [
        eq(orders.merchantId, merchantId),
        inArray(orders.workflowStatus, targetStatuses),
        isNotNull(orders.courierTracking),
      ];

      if (courier && courier !== "all") {
        const mappedCourier =
          mapCourierSlugToName(courier as string) || (courier as string);
        conditions.push(eq(orders.courierName, mappedCourier));
      }
      const tz = await getMerchantTimezone(merchantId);
      if (dateFrom) {
        conditions.push(sql`${orders.orderDate} >= ${toMerchantStartOfDay(dateFrom as string, tz)}`);
      }
      if (dateTo) {
        conditions.push(sql`${orders.orderDate} <= ${toMerchantEndOfDay(dateTo as string, tz)}`);
      }

      const whereClause = and(...conditions);

      const rows = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          customerName: orders.customerName,
          customerPhone: orders.customerPhone,
          city: orders.city,
          courierName: orders.courierName,
          courierTracking: orders.courierTracking,
          totalAmount: orders.totalAmount,
          codRemaining: orders.codRemaining,
          codPaymentStatus: orders.codPaymentStatus,
          workflowStatus: orders.workflowStatus,
          paymentMethod: orders.paymentMethod,
          prepaidAmount: orders.prepaidAmount,
          dispatchedAt: orders.dispatchedAt,
          deliveredAt: orders.deliveredAt,
          orderDate: orders.orderDate,
        })
        .from(orders)
        .where(whereClause)
        .orderBy(orders.courierName, desc(orders.orderDate));

      const totalsByCourier: Record<
        string,
        {
          count: number;
          totalAmount: number;
          codCollected: number;
          codPending: number;
        }
      > = {};
      for (const row of rows) {
        const cn = row.courierName || "Unknown";
        if (!totalsByCourier[cn]) {
          totalsByCourier[cn] = {
            count: 0,
            totalAmount: 0,
            codCollected: 0,
            codPending: 0,
          };
        }
        totalsByCourier[cn].count++;
        totalsByCourier[cn].totalAmount += Number(row.totalAmount || 0);
        if (row.codPaymentStatus === "PAID") {
          totalsByCourier[cn].codCollected += Number(row.totalAmount || 0);
        } else {
          totalsByCourier[cn].codPending += Number(
            row.codRemaining || row.totalAmount || 0,
          );
        }
      }

      res.json({ rows, totalsByCourier, total: rows.length });
    } catch (error) {
      console.error("Error fetching shipper advice:", error);
      res.status(500).json({ message: "Failed to fetch shipper advice" });
    }
  });

  // Analytics
  app.get("/api/analytics", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const dateRange = (req.query.dateRange as string) || "30d";
      const { dateFrom, dateTo } = req.query;
      const timezone = await getMerchantTimezone(merchantId);
      const analytics = await storage.getAnalytics(merchantId, dateRange, {
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        timezone,
      });
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // COD Reconciliation
  // Payment Ledger - per-shipment financial breakdown
  app.get("/api/payment-ledger", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const {
        search,
        courier,
        dateFrom,
        dateTo,
        page: pageStr,
        pageSize: pageSizeStr,
      } = req.query;
      const page = parseInt(pageStr as string) || 1;
      const pageSize = parseInt(pageSizeStr as string) || 100;
      const offset = (page - 1) * pageSize;

      let conditions = [eq(codReconciliation.merchantId, merchantId)];

      if (search) {
        conditions.push(
          or(
            ilike(codReconciliation.trackingNumber, `%${search}%`),
            ilike(codReconciliation.courierName, `%${search}%`),
          )!,
        );
      }
      if (courier && courier !== "all") {
        conditions.push(eq(codReconciliation.courierName, courier as string));
      }
      const tz = await getMerchantTimezone(merchantId);
      if (dateFrom) {
        conditions.push(
          sql`${codReconciliation.createdAt} >= ${toMerchantStartOfDay(dateFrom as string, tz)}`,
        );
      }
      if (dateTo) {
        conditions.push(
          sql`${codReconciliation.createdAt} <= ${toMerchantEndOfDay(dateTo as string, tz)}`,
        );
      }

      const whereClause = and(...conditions);

      const [records, totalResult, allForSummary] = await Promise.all([
        db
          .select()
          .from(codReconciliation)
          .where(whereClause)
          .orderBy(desc(codReconciliation.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: count() })
          .from(codReconciliation)
          .where(whereClause),
        db
          .select({
            totalCod: sql<string>`COALESCE(SUM(${codReconciliation.codAmount}), 0)`,
            recordCount: count(),
            syncedCount: sql<number>`COUNT(CASE WHEN ${codReconciliation.lastSyncedAt} IS NOT NULL THEN 1 END)`,
            unsyncedCount: sql<number>`COUNT(CASE WHEN ${codReconciliation.lastSyncedAt} IS NULL THEN 1 END)`,
            totalTxnFee: sql<string>`COALESCE(SUM(COALESCE(${codReconciliation.transactionFee}, 0)), 0)`,
            totalTxnTax: sql<string>`COALESCE(SUM(COALESCE(${codReconciliation.transactionTax}, 0)), 0)`,
            totalReversalFee: sql<string>`COALESCE(SUM(COALESCE(${codReconciliation.reversalFee}, 0)), 0)`,
            totalReversalTax: sql<string>`COALESCE(SUM(COALESCE(${codReconciliation.reversalTax}, 0)), 0)`,
            totalCourierFee: sql<string>`COALESCE(SUM(COALESCE(${codReconciliation.courierFee}, 0)), 0)`,
          })
          .from(codReconciliation)
          .where(whereClause),
      ]);

      const s = allForSummary[0] || {};

      // Compute per-record deductions and net using consistent logic
      const computeRecord = (r: (typeof records)[0]) => {
        const codAmt = Number(r.codAmount) || 0;
        const txnFee = Number(r.transactionFee) || 0;
        const txnTax = Number(r.transactionTax) || 0;
        const reversalFee = Number(r.reversalFee) || 0;
        const reversalTax = Number(r.reversalTax) || 0;
        const courierFee = Number(r.courierFee) || 0;
        // Use courierFee if set (it's the total deduction from Leopards), otherwise sum individual fees (PostEx)
        const totalDeduction =
          courierFee > 0
            ? courierFee
            : txnFee + txnTax + reversalFee + reversalTax;
        const netPaid = Number(r.netAmount) || codAmt - totalDeduction;
        return { totalDeduction, netPaid, hasSyncedData: !!r.lastSyncedAt };
      };

      const ledgerRecords = records.map((r) => {
        const computed = computeRecord(r);
        return {
          ...r,
          totalDeduction: computed.totalDeduction.toFixed(2),
          calculatedNetPaid: computed.netPaid.toFixed(2),
          hasSyncedData: computed.hasSyncedData,
        };
      });

      // Use same logic for summary: sum deductions using CASE to pick courierFee OR individual fees
      const totalDeductions = Number(
        (await db
          .select({
            total: sql<string>`COALESCE(SUM(
            CASE 
              WHEN COALESCE(${codReconciliation.courierFee}, 0) > 0 THEN COALESCE(${codReconciliation.courierFee}, 0)
              ELSE COALESCE(${codReconciliation.transactionFee}, 0) + COALESCE(${codReconciliation.transactionTax}, 0) + COALESCE(${codReconciliation.reversalFee}, 0) + COALESCE(${codReconciliation.reversalTax}, 0)
            END
          ), 0)`,
          })
          .from(codReconciliation)
          .where(whereClause)
          .then((r) => r[0]?.total)) || "0",
      );

      const totalCodNum = Number(s.totalCod || 0);
      // Net paid = totalCod - totalDeductions (for consistent calculation)
      const totalNetPaid = totalCodNum - totalDeductions;

      res.json({
        records: ledgerRecords,
        total: totalResult[0]?.count || 0,
        page,
        pageSize,
        summary: {
          totalCod: totalCodNum.toLocaleString(),
          totalDeductions: totalDeductions.toLocaleString(),
          totalNetPaid: totalNetPaid.toLocaleString(),
          totalTxnFee: Number(s.totalTxnFee || 0).toLocaleString(),
          totalTxnTax: Number(s.totalTxnTax || 0).toLocaleString(),
          totalReversalFee: Number(s.totalReversalFee || 0).toLocaleString(),
          recordCount: s.recordCount || 0,
          syncedCount: s.syncedCount || 0,
          unsyncedCount: s.unsyncedCount || 0,
        },
      });
    } catch (error) {
      console.error("Error fetching payment ledger:", error);
      res.status(500).json({ message: "Failed to fetch payment ledger" });
    }
  });

  app.get("/api/manage-cheques", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const search = (req.query.search as string) || "";
      const status = (req.query.status as string) || "";
      const courier = (req.query.courier as string) || "";
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 50;

      const settlementKey = sql<string>`COALESCE(
        ${codReconciliation.courierPaymentRef},
        CASE WHEN ${codReconciliation.courierSettlementDate} IS NOT NULL
          THEN 'SETTLE-' || ${codReconciliation.courierName} || '-' || TO_CHAR(${codReconciliation.courierSettlementDate}, 'YYYY-MM-DD')
          ELSE NULL
        END
      )`;

      const conditions: any[] = [
        eq(codReconciliation.merchantId, merchantId),
        or(
          isNotNull(codReconciliation.courierPaymentRef),
          isNotNull(codReconciliation.courierSettlementDate),
        ),
      ];

      if (search) {
        conditions.push(
          or(
            ilike(codReconciliation.courierPaymentRef, `%${search}%`),
            ilike(codReconciliation.trackingNumber, `%${search}%`),
          ),
        );
      }
      if (status) {
        const statusLower = status.toLowerCase();
        if (statusLower === "paid" || statusLower === "settled") {
          conditions.push(
            or(
              eq(codReconciliation.courierPaymentStatus, "Paid"),
              eq(codReconciliation.courierPaymentStatus, "Settled"),
            ),
          );
        } else if (statusLower === "pending") {
          conditions.push(
            or(
              eq(codReconciliation.courierPaymentStatus, "Pending"),
              isNull(codReconciliation.courierPaymentStatus),
            ),
          );
        } else {
          conditions.push(eq(codReconciliation.courierPaymentStatus, status));
        }
      }
      if (courier) {
        conditions.push(ilike(codReconciliation.courierName, `%${courier}%`));
      }

      const whereClause = and(...conditions);

      const [chequeGroups, totalResult] = await Promise.all([
        db
          .select({
            settlementKey: settlementKey,
            chequeRef: sql<string>`MAX(${codReconciliation.courierPaymentRef})`,
            paymentStatus: sql<string>`MAX(${codReconciliation.courierPaymentStatus})`,
            paymentMethod: sql<string>`MAX(${codReconciliation.courierPaymentMethod})`,
            courierName: sql<string>`MAX(${codReconciliation.courierName})`,
            slipLink: sql<string>`MAX(${codReconciliation.courierSlipLink})`,
            shipmentCount: count(),
            totalCod: sql<string>`COALESCE(SUM(${codReconciliation.codAmount}), 0)`,
            totalDeductions: sql<string>`COALESCE(SUM(
              CASE 
                WHEN COALESCE(${codReconciliation.courierFee}, 0) > 0 THEN COALESCE(${codReconciliation.courierFee}, 0)
                ELSE COALESCE(${codReconciliation.transactionFee}, 0) + COALESCE(${codReconciliation.transactionTax}, 0) + COALESCE(${codReconciliation.reversalFee}, 0) + COALESCE(${codReconciliation.reversalTax}, 0)
              END
            ), 0)`,
            totalNet: sql<string>`COALESCE(SUM(COALESCE(${codReconciliation.netAmount}, 0)), 0)`,
            settlementDate: sql<string>`MAX(${codReconciliation.courierSettlementDate})`,
            earliestDate: sql<string>`MIN(${codReconciliation.createdAt})`,
            latestDate: sql<string>`MAX(${codReconciliation.createdAt})`,
          })
          .from(codReconciliation)
          .where(whereClause)
          .groupBy(settlementKey)
          .orderBy(desc(sql`MAX(COALESCE(${codReconciliation.courierSettlementDate}, ${codReconciliation.createdAt}))`))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db
          .select({
            count: sql<number>`COUNT(DISTINCT ${settlementKey})`,
          })
          .from(codReconciliation)
          .where(whereClause),
      ]);

      const summaryResult = await db
        .select({
          totalSettlements: sql<number>`COUNT(DISTINCT ${settlementKey})`,
          totalCod: sql<string>`COALESCE(SUM(${codReconciliation.codAmount}), 0)`,
          totalNet: sql<string>`COALESCE(SUM(COALESCE(${codReconciliation.netAmount}, 0)), 0)`,
          totalDeductions: sql<string>`COALESCE(SUM(
            CASE 
              WHEN COALESCE(${codReconciliation.courierFee}, 0) > 0 THEN COALESCE(${codReconciliation.courierFee}, 0)
              ELSE COALESCE(${codReconciliation.transactionFee}, 0) + COALESCE(${codReconciliation.transactionTax}, 0) + COALESCE(${codReconciliation.reversalFee}, 0) + COALESCE(${codReconciliation.reversalTax}, 0)
            END
          ), 0)`,
          settledCount: sql<number>`COUNT(DISTINCT CASE WHEN ${codReconciliation.courierPaymentStatus} IN ('Paid', 'Settled') THEN ${settlementKey} END)`,
          pendingCount: sql<number>`COUNT(DISTINCT CASE WHEN ${codReconciliation.courierPaymentStatus} NOT IN ('Paid', 'Settled') OR ${codReconciliation.courierPaymentStatus} IS NULL THEN ${settlementKey} END)`,
        })
        .from(codReconciliation)
        .where(whereClause);

      const s = summaryResult[0] || {};

      res.json({
        cheques: chequeGroups.map((c) => ({
          settlementKey: c.settlementKey,
          chequeRef: c.chequeRef || null,
          paymentStatus: c.paymentStatus || "Pending",
          paymentMethod: c.paymentMethod || "N/A",
          courierName: c.courierName,
          slipLink: c.slipLink,
          shipmentCount: c.shipmentCount,
          totalCod: Number(c.totalCod || 0).toFixed(2),
          totalDeductions: Number(c.totalDeductions || 0).toFixed(2),
          totalNet: Number(c.totalNet || 0).toFixed(2),
          settlementDate: c.settlementDate,
          earliestDate: c.earliestDate,
          latestDate: c.latestDate,
        })),
        total: totalResult[0]?.count || 0,
        page,
        pageSize,
        summary: {
          totalSettlements: s.totalSettlements || 0,
          totalCod: Number(s.totalCod || 0).toFixed(2),
          totalNet: Number(s.totalNet || 0).toFixed(2),
          totalDeductions: Number(s.totalDeductions || 0).toFixed(2),
          settledCount: s.settledCount || 0,
          pendingCount: s.pendingCount || 0,
        },
      });
    } catch (error) {
      console.error("Error fetching manage cheques:", error);
      res.status(500).json({ message: "Failed to fetch cheques data" });
    }
  });


  app.get("/api/cod-reconciliation", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { search, status, dateFrom, dateTo, page, pageSize } = req.query;
      const timezone = await getMerchantTimezone(merchantId);
      const result = await storage.getCodReconciliation(merchantId, {
        search: search as string,
        status: status as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        page: parseInt(page as string) || 1,
        pageSize: parseInt(pageSize as string) || 20,
        timezone,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching COD reconciliation:", error);
      res.status(500).json({ message: "Failed to fetch COD reconciliation" });
    }
  });

  app.post(
    "/api/cod-reconciliation/reconcile",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        // Validate request body
        const validated = reconcileSchema.safeParse(req.body);
        if (!validated.success) {
          return res
            .status(400)
            .json({ message: validated.error.errors[0].message });
        }

        const { recordIds, settlementRef } = validated.data;
        const userId = getSessionUserId(req) || "unknown";

        // Verify all records belong to this merchant using direct DB lookup
        for (const recordId of recordIds) {
          const record = await storage.getCodRecordById(merchantId, recordId);
          if (!record) {
            return res
              .status(403)
              .json({ message: "Access denied to one or more records" });
          }
        }

        // Update all records (scoped by merchantId)
        const updated = await Promise.all(
          recordIds.map((id: string) =>
            storage.updateCodReconciliation(merchantId, id, {
              status: "received",
              courierSettlementRef: settlementRef || null,
              reconciliatedAt: new Date(),
              reconciliatedBy: userId,
            }),
          ),
        );

        res.json({ updated: updated.filter(Boolean).length });
      } catch (error) {
        console.error("Error reconciling COD:", error);
        res.status(500).json({ message: "Failed to reconcile COD" });
      }
    },
  );

  // Generate COD records from delivered orders
  app.post(
    "/api/cod-reconciliation/generate",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const result = await storage.generateCodRecordsFromOrders(merchantId);
        res.json({
          message: `Generated ${result.created} COD records (${result.skipped} already existed)`,
          ...result,
        });
      } catch (error) {
        console.error("Error generating COD records:", error);
        res.status(500).json({ message: "Failed to generate COD records" });
      }
    },
  );

  const codSyncProgress = new Map<string, { status: 'running' | 'done' | 'error'; processed: number; total: number; result?: any; error?: string; startedAt: Date }>();

  const STALE_PROGRESS_TTL_MS = 10 * 60 * 1000;
  setInterval(() => {
    const now = Date.now();
    Array.from(codSyncProgress.entries()).forEach(([merchantId, progress]) => {
      if (now - progress.startedAt.getTime() > STALE_PROGRESS_TTL_MS) {
        if (progress.status === 'running') {
          console.warn(`[COD Sync] Cleaning up stale COD sync progress for merchant ${merchantId} (started ${Math.round((now - progress.startedAt.getTime()) / 60000)}m ago)`);
          codSyncProgress.set(merchantId, {
            ...progress,
            status: 'error',
            error: 'Sync timed out after 10 minutes',
          });
        } else {
          codSyncProgress.delete(merchantId);
        }
      }
    });
    cleanupStaleManualSyncProgress();
  }, 60 * 1000);

  // Sync COD payment data from courier APIs (background job)
  app.post(
    "/api/cod-reconciliation/sync-payments",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const existing = codSyncProgress.get(merchantId);
        if (existing?.status === 'running') {
          return res.json({ success: true, status: 'already_running', message: "COD sync is already running." });
        }

        codSyncProgress.set(merchantId, { status: 'running', processed: 0, total: 0, startedAt: new Date() });

        (async () => {
          try {
            let totalUpdated = 0;
            let totalErrors = 0;
            let processed = 0;
            let totalRecords = 0;
            const courierResults: Record<string, { updated: number; errors: number; total: number }> = {};

            const leopardsCreds = await getCourierCredentials(merchantId, "leopards");
            const postexCreds = await getCourierCredentials(merchantId, "postex");

            let leopardsRecords: any[] = [];
            let postexRecords: any[] = [];

            if (leopardsCreds?.apiKey) {
              leopardsRecords = await storage.getPendingCodRecordsByCourier(merchantId, "Leopards Courier");
              courierResults.leopards = { updated: 0, errors: 0, total: leopardsRecords.length };
            }
            if (postexCreds?.apiKey) {
              postexRecords = await storage.getPendingCodRecordsByCourier(merchantId, "PostEx");
              courierResults.postex = { updated: 0, errors: 0, total: postexRecords.length };
            }

            totalRecords = leopardsRecords.length + postexRecords.length;
            const progress = codSyncProgress.get(merchantId)!;
            progress.total = totalRecords;

            if (leopardsCreds?.apiKey && leopardsRecords.length > 0) {
              const trackingNumbers = leopardsRecords.map((r) => r.trackingNumber).filter((tn): tn is string => !!tn);
              if (trackingNumbers.length > 0) {
                try {
                  const paymentResults = await leopardsService.getPaymentDetails(trackingNumbers, {
                    apiKey: leopardsCreds.apiKey,
                    apiPassword: leopardsCreds.apiSecret || undefined,
                  });

                  for (const payment of paymentResults) {
                    if (!payment.success) { processed++; progress.processed = processed; continue; }
                    const record = leopardsRecords.find((r) => r.trackingNumber === payment.trackingNumber);
                    if (!record) { processed++; progress.processed = processed; continue; }

                    const isSettled = payment.paymentStatus?.toLowerCase() === "paid" || payment.paymentStatus?.toLowerCase() === "settled";
                    const updateData: any = {
                      courierPaymentStatus: payment.paymentStatus || null,
                      courierPaymentRef: payment.invoiceChequeNo || null,
                      courierPaymentMethod: payment.paymentMethod || null,
                      courierSlipLink: payment.slipLink || null,
                      lastSyncedAt: new Date(),
                    };

                    const codAmt = Number(record.codAmount) || 0;
                    if (codAmt > 0 && !record.transactionFee) {
                      const existingFee = Number(record.courierFee) || 0;
                      const leopardsFee = existingFee > 0 ? existingFee : Math.round(codAmt * 0.025 * 100) / 100;
                      updateData.transactionFee = leopardsFee.toString();
                      updateData.transactionTax = "0";
                      if (!record.courierFee) {
                        updateData.courierFee = leopardsFee.toString();
                        updateData.netAmount = (codAmt - leopardsFee).toString();
                      }
                    }

                    if (payment.invoiceChequeDate) {
                      const chequeDate = new Date(payment.invoiceChequeDate);
                      if (!isNaN(chequeDate.getTime())) updateData.courierSettlementDate = chequeDate;
                    }

                    if (isSettled && record.status === "pending") {
                      updateData.status = "received";
                      updateData.courierSettlementRef = payment.invoiceChequeNo || payment.paymentMethod || "Courier confirmed";
                      updateData.reconciliatedAt = new Date();
                      updateData.reconciliatedBy = "system_sync";
                    }

                    await storage.updateCodReconciliation(merchantId, record.id, updateData);
                    courierResults.leopards.updated++;
                    totalUpdated++;
                    processed++;
                    progress.processed = processed;
                  }
                } catch (err) {
                  console.error("[COD Sync] Leopards payment fetch error:", err);
                  courierResults.leopards.errors++;
                  totalErrors++;
                }
              }
              processed = leopardsRecords.length;
              progress.processed = processed;
            }

            if (postexCreds?.apiKey && postexRecords.length > 0) {
              const POSTEX_COD_BATCH_SIZE = 5;
              for (let i = 0; i < postexRecords.length; i += POSTEX_COD_BATCH_SIZE) {
                const batch = postexRecords.slice(i, i + POSTEX_COD_BATCH_SIZE);

                const batchResults = await Promise.allSettled(
                  batch.map(async (record) => {
                    if (!record.trackingNumber) return 'skip';

                    const [financialResult, paymentResult] = await Promise.all([
                      postexService.getTrackingWithFinancials(record.trackingNumber, { apiToken: postexCreds.apiKey }),
                      postexService.getPaymentStatus(record.trackingNumber, { apiToken: postexCreds.apiKey }),
                    ]);

                    const updateData: any = { lastSyncedAt: new Date() };

                    if (financialResult.success) {
                      updateData.transactionFee = financialResult.transactionFee?.toString() || null;
                      updateData.transactionTax = financialResult.transactionTax?.toString() || null;
                      updateData.reversalFee = financialResult.reversalFee?.toString() || null;
                      updateData.reversalTax = financialResult.reversalTax?.toString() || null;
                      updateData.upfrontPayment = financialResult.upfrontPayment?.toString() || null;
                      updateData.reservePayment = financialResult.reservePayment?.toString() || null;
                      updateData.balancePayment = financialResult.balancePayment?.toString() || null;

                      const totalFees = (financialResult.transactionFee || 0) + (financialResult.transactionTax || 0);
                      if (totalFees > 0) {
                        updateData.courierFee = totalFees.toString();
                        const codAmt = Number(record.codAmount) || 0;
                        updateData.netAmount = (codAmt - totalFees).toString();
                      }
                    }

                    if (paymentResult.success) {
                      updateData.courierPaymentStatus = paymentResult.settled ? "Settled" : "Pending";
                      if (paymentResult.cprNumber1) updateData.courierPaymentRef = paymentResult.cprNumber1;
                      if (paymentResult.cprNumber2) {
                        updateData.courierPaymentRef = (updateData.courierPaymentRef ? updateData.courierPaymentRef + ", " : "") + paymentResult.cprNumber2;
                      }
                      if (paymentResult.settlementDate) {
                        const settleDate = new Date(paymentResult.settlementDate);
                        if (!isNaN(settleDate.getTime())) updateData.courierSettlementDate = settleDate;
                      }
                      if (paymentResult.settled && record.status === "pending") {
                        updateData.status = "received";
                        updateData.courierSettlementRef = updateData.courierPaymentRef || "PostEx settlement confirmed";
                        updateData.reconciliatedAt = new Date();
                        updateData.reconciliatedBy = "system_sync";
                      }
                    }

                    await storage.updateCodReconciliation(merchantId, record.id, updateData);
                    return 'updated';
                  })
                );

                for (const r of batchResults) {
                  if (r.status === 'fulfilled' && r.value === 'updated') {
                    courierResults.postex.updated++;
                    totalUpdated++;
                  } else if (r.status === 'rejected') {
                    courierResults.postex.errors++;
                    totalErrors++;
                  }
                }

                processed = leopardsRecords.length + Math.min(i + POSTEX_COD_BATCH_SIZE, postexRecords.length);
                progress.processed = processed;

                if (i + POSTEX_COD_BATCH_SIZE < postexRecords.length) {
                  await new Promise((resolve) => setTimeout(resolve, 300));
                }
              }
            }

            const result = {
              message: `Synced payment data: ${totalUpdated} records updated, ${totalErrors} errors`,
              totalUpdated,
              totalErrors,
              courierResults,
            };
            codSyncProgress.set(merchantId, { status: 'done', processed: totalRecords, total: totalRecords, result, startedAt: codSyncProgress.get(merchantId)!.startedAt });
            console.log(`[COD Sync] Done for merchant ${merchantId}: ${totalUpdated} updated, ${totalErrors} errors`);
          } catch (error: any) {
            console.error("Error syncing COD payments:", error);
            codSyncProgress.set(merchantId, { status: 'error', processed: 0, total: 0, error: error.message, startedAt: codSyncProgress.get(merchantId)!.startedAt });
          } finally {
            const progress = codSyncProgress.get(merchantId);
            if (progress && progress.status === 'running') {
              codSyncProgress.set(merchantId, {
                ...progress,
                status: 'error',
                error: 'Sync ended unexpectedly',
              });
            }
          }
        })();

        res.json({ success: true, status: 'started', message: "COD payment sync started in the background." });
      } catch (error) {
        console.error("Error starting COD sync:", error);
        res.status(500).json({ message: "Failed to start COD payment sync" });
      }
    },
  );

  app.get(
    "/api/cod-reconciliation/sync-progress",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const progress = codSyncProgress.get(merchantId);
        if (!progress) {
          return res.json({ status: 'idle' });
        }
        res.json(progress);
      } catch (error) {
        res.status(500).json({ message: "Failed to get sync progress" });
      }
    },
  );

  // Team Management
  app.get("/api/team", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const members = await storage.getTeamMembers(merchantId);
      res.json({ members, total: members.length });
    } catch (error) {
      console.error("Error fetching team:", error);
      res.status(500).json({ message: "Failed to fetch team" });
    }
  });

  app.post("/api/team/invite", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const validated = teamInviteSchema.safeParse(req.body);
      if (!validated.success) {
        return res
          .status(400)
          .json({ message: validated.error.errors[0].message });
      }

      const { email, role } = validated.data;
      const userId = (req.session as any).userId;

      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email));
      if (existingUser) {
        const existingMember = await db
          .select()
          .from(teamMembers)
          .where(
            and(
              eq(teamMembers.userId, existingUser.id),
              eq(teamMembers.merchantId, merchantId),
            ),
          );
        if (existingMember.length > 0) {
          return res
            .status(400)
            .json({ message: "This user is already a team member" });
        }
      }

      const existingInvite = await db
        .select()
        .from(teamInvites)
        .where(
          and(
            eq(teamInvites.email, email),
            eq(teamInvites.merchantId, merchantId),
            eq(teamInvites.status, "pending"),
          ),
        );
      if (existingInvite.length > 0) {
        return res
          .status(400)
          .json({
            message:
              "An invitation has already been sent to this email. Use resend to send again.",
          });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const [invite] = await db
        .insert(teamInvites)
        .values({
          merchantId,
          email,
          role: role || "agent",
          token,
          tokenHash,
          status: "pending",
          invitedBy: userId,
          expiresAt,
          sendCount: 0,
        })
        .returning();

      if (existingUser) {
        await db.insert(teamMembers).values({
          userId: existingUser.id,
          merchantId,
          role: role || "agent",
          isActive: true,
          joinedAt: new Date(),
        });

        if (!existingUser.merchantId) {
          await db
            .update(users)
            .set({ merchantId })
            .where(eq(users.id, existingUser.id));
        }

        await db
          .update(teamInvites)
          .set({
            status: "accepted",
            acceptedAt: new Date(),
            acceptedByUserId: existingUser.id,
          })
          .where(eq(teamInvites.id, invite.id));
      }

      const inviteUrl = `${req.protocol}://${req.get("host")}/invite/${token}`;

      let emailSent = false;
      let emailError: string | undefined;
      if (!existingUser) {
        const [merchant] = await db
          .select()
          .from(merchants)
          .where(eq(merchants.id, merchantId));
        const [inviter] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId));
        const inviterName = inviter
          ? `${inviter.firstName || ""} ${inviter.lastName || ""}`.trim() ||
            inviter.email ||
            "A team admin"
          : "A team admin";

        const emailResult = await sendInviteEmailSES({
          toEmail: email,
          merchantName: merchant?.name || "ShipFlow Team",
          role: role || "agent",
          inviteUrl,
          expiresAt,
          invitedByName: inviterName,
        });

        emailSent = emailResult.success;
        emailError = emailResult.error;

        await db
          .update(teamInvites)
          .set({
            sendCount: 1,
            lastSentAt: new Date(),
            lastEmailError: emailError || null,
          })
          .where(eq(teamInvites.id, invite.id));
      }

      res.json({
        invite: { ...invite, token: undefined },
        inviteUrl,
        autoJoined: !!existingUser,
        emailSent,
        emailError,
      });
    } catch (error) {
      console.error("Error inviting team member:", error);
      res.status(500).json({ message: "Failed to invite team member" });
    }
  });

  app.post(
    "/api/team/invite/:inviteId/resend",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const { inviteId } = req.params;
        const [invite] = await db
          .select()
          .from(teamInvites)
          .where(
            and(
              eq(teamInvites.id, inviteId),
              eq(teamInvites.merchantId, merchantId),
            ),
          );

        if (!invite) {
          return res.status(404).json({ message: "Invite not found" });
        }
        if (invite.status !== "pending") {
          return res
            .status(400)
            .json({ message: "Can only resend pending invitations" });
        }

        if (
          invite.lastSentAt &&
          Date.now() - invite.lastSentAt.getTime() < 60000
        ) {
          return res
            .status(429)
            .json({
              message: "Please wait at least 1 minute before resending",
            });
        }

        const inviteUrl = `${req.protocol}://${req.get("host")}/invite/${invite.token}`;
        const [merchant] = await db
          .select()
          .from(merchants)
          .where(eq(merchants.id, merchantId));

        const userId = (req.session as any).userId;
        const [inviter] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId));
        const inviterName = inviter
          ? `${inviter.firstName || ""} ${inviter.lastName || ""}`.trim() ||
            inviter.email ||
            "A team admin"
          : "A team admin";

        const emailResult = await sendInviteEmailSES({
          toEmail: invite.email,
          merchantName: merchant?.name || "ShipFlow Team",
          role: invite.role,
          inviteUrl,
          expiresAt:
            invite.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          invitedByName: inviterName,
        });

        await db
          .update(teamInvites)
          .set({
            sendCount: (invite.sendCount || 0) + 1,
            lastSentAt: new Date(),
            lastEmailError: emailResult.error || null,
          })
          .where(eq(teamInvites.id, invite.id));

        res.json({
          success: emailResult.success,
          emailError: emailResult.error,
          sendCount: (invite.sendCount || 0) + 1,
        });
      } catch (error) {
        console.error("Error resending invite:", error);
        res.status(500).json({ message: "Failed to resend invitation" });
      }
    },
  );

  app.delete(
    "/api/team/invite/:inviteId",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const { inviteId } = req.params;
        const [invite] = await db
          .select()
          .from(teamInvites)
          .where(
            and(
              eq(teamInvites.id, inviteId),
              eq(teamInvites.merchantId, merchantId),
            ),
          );

        if (!invite) {
          return res.status(404).json({ message: "Invite not found" });
        }
        if (invite.status !== "pending") {
          return res
            .status(400)
            .json({ message: "Can only revoke pending invitations" });
        }

        await db
          .update(teamInvites)
          .set({ status: "revoked" })
          .where(eq(teamInvites.id, invite.id));

        res.json({ message: "Invitation revoked" });
      } catch (error) {
        console.error("Error revoking invite:", error);
        res.status(500).json({ message: "Failed to revoke invitation" });
      }
    },
  );

  app.get("/api/team/invites", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const invites = await db
        .select({
          id: teamInvites.id,
          email: teamInvites.email,
          role: teamInvites.role,
          status: teamInvites.status,
          createdAt: teamInvites.createdAt,
          expiresAt: teamInvites.expiresAt,
          sendCount: teamInvites.sendCount,
          lastSentAt: teamInvites.lastSentAt,
          lastEmailError: teamInvites.lastEmailError,
          acceptedAt: teamInvites.acceptedAt,
        })
        .from(teamInvites)
        .where(eq(teamInvites.merchantId, merchantId))
        .orderBy(teamInvites.createdAt);

      res.json({ invites });
    } catch (error) {
      console.error("Error fetching invites:", error);
      res.status(500).json({ message: "Failed to fetch invites" });
    }
  });

  app.get(
    "/api/team/invite/:inviteId/link",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const { inviteId } = req.params;
        const [invite] = await db
          .select()
          .from(teamInvites)
          .where(
            and(
              eq(teamInvites.id, inviteId),
              eq(teamInvites.merchantId, merchantId),
            ),
          );

        if (!invite) {
          return res.status(404).json({ message: "Invite not found" });
        }
        if (invite.status !== "pending") {
          return res
            .status(400)
            .json({ message: "This invitation is no longer active" });
        }

        const inviteUrl = `${req.protocol}://${req.get("host")}/invite/${invite.token}`;
        res.json({ inviteUrl });
      } catch (error) {
        console.error("Error getting invite link:", error);
        res.status(500).json({ message: "Failed to get invite link" });
      }
    },
  );

  app.get("/api/team/invite/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const [invite] = await db
        .select()
        .from(teamInvites)
        .where(eq(teamInvites.token, token));

      if (!invite) {
        return res
          .status(404)
          .json({
            message: "This invitation link is invalid or has been revoked.",
          });
      }

      if (invite.status === "revoked") {
        return res
          .status(400)
          .json({
            message: "This invitation has been revoked by the team admin.",
          });
      }

      if (invite.status === "accepted") {
        return res
          .status(400)
          .json({ message: "This invitation has already been accepted." });
      }

      if (invite.status !== "pending") {
        return res
          .status(400)
          .json({ message: "This invitation is no longer valid." });
      }

      if (invite.expiresAt && new Date() > invite.expiresAt) {
        return res
          .status(400)
          .json({
            message:
              "This invitation has expired. Please ask the team admin to send a new one.",
          });
      }

      const [merchant] = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, invite.merchantId));

      res.json({
        email: invite.email,
        role: invite.role,
        merchantName: merchant?.name || "Unknown",
        merchantId: invite.merchantId,
        expiresAt: invite.expiresAt,
      });
    } catch (error) {
      console.error("Error fetching invite:", error);
      res.status(500).json({ message: "Failed to fetch invite" });
    }
  });

  app.post(
    "/api/team/invite/:token/accept",
    isAuthenticated,
    async (req, res) => {
      try {
        const { token } = req.params;
        const userId = (req.session as any).userId;

        const [invite] = await db
          .select()
          .from(teamInvites)
          .where(eq(teamInvites.token, token));

        if (!invite) {
          return res.status(404).json({ message: "Invite not found" });
        }

        if (invite.status === "revoked") {
          return res
            .status(400)
            .json({ message: "This invitation has been revoked" });
        }

        if (invite.status === "accepted") {
          return res
            .status(400)
            .json({ message: "This invitation has already been accepted" });
        }

        if (invite.status !== "pending") {
          return res
            .status(400)
            .json({ message: "This invitation is no longer valid" });
        }

        if (invite.expiresAt && new Date() > invite.expiresAt) {
          return res
            .status(400)
            .json({ message: "This invitation has expired" });
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId));
        if (!user) {
          return res.status(401).json({ message: "User not found" });
        }

        if (user.email !== invite.email) {
          return res
            .status(403)
            .json({
              message: "This invitation was sent to a different email address",
            });
        }

        const existing = await db
          .select()
          .from(teamMembers)
          .where(
            and(
              eq(teamMembers.userId, userId),
              eq(teamMembers.merchantId, invite.merchantId),
            ),
          );

        if (existing.length > 0) {
          await db
            .update(teamInvites)
            .set({
              status: "accepted",
              acceptedAt: new Date(),
              acceptedByUserId: userId,
            })
            .where(eq(teamInvites.id, invite.id));
          return res.json({
            message: "You are already a member of this team",
            merchantId: invite.merchantId,
          });
        }

        await db.insert(teamMembers).values({
          userId,
          merchantId: invite.merchantId,
          role: invite.role,
          isActive: true,
          joinedAt: new Date(),
        });

        await db
          .update(users)
          .set({ merchantId: invite.merchantId })
          .where(eq(users.id, userId));

        await db
          .update(teamInvites)
          .set({
            status: "accepted",
            acceptedAt: new Date(),
            acceptedByUserId: userId,
          })
          .where(eq(teamInvites.id, invite.id));

        res.json({
          message: "You have joined the team!",
          merchantId: invite.merchantId,
        });
      } catch (error) {
        console.error("Error accepting invite:", error);
        res.status(500).json({ message: "Failed to accept invite" });
      }
    },
  );

  app.post(
    "/api/team/invite/:token/accept-with-signup",
    async (req, res) => {
      try {
        const { token } = req.params;
        const { firstName, lastName, password } = req.body;

        if (!firstName || !password) {
          return res.status(400).json({ message: "First name and password are required" });
        }

        if (password.length < 6) {
          return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const [invite] = await db
          .select()
          .from(teamInvites)
          .where(eq(teamInvites.token, token));

        if (!invite) {
          return res.status(404).json({ message: "Invite not found" });
        }

        if (invite.status === "revoked") {
          return res.status(400).json({ message: "This invitation has been revoked" });
        }

        if (invite.status === "accepted") {
          return res.status(400).json({ message: "This invitation has already been accepted" });
        }

        if (invite.status !== "pending") {
          return res.status(400).json({ message: "This invitation is no longer valid" });
        }

        if (invite.expiresAt && new Date() > invite.expiresAt) {
          return res.status(400).json({ message: "This invitation has expired" });
        }

        const [existingUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, invite.email));

        if (existingUser) {
          return res.status(400).json({
            message: "An account with this email already exists. Please log in and accept the invite from your dashboard.",
          });
        }

        const bcrypt = await import("bcrypt");
        const passwordHash = await bcrypt.hash(password, 12);

        const newUser = await db.transaction(async (tx) => {
          const updated = await tx
            .update(teamInvites)
            .set({
              status: "accepted",
              acceptedAt: new Date(),
            })
            .where(and(eq(teamInvites.id, invite.id), eq(teamInvites.status, "pending")))
            .returning();

          if (updated.length === 0) {
            throw new Error("Invite is no longer available");
          }

          const [createdUser] = await tx
            .insert(users)
            .values({
              email: invite.email,
              firstName: firstName.trim(),
              lastName: lastName?.trim() || null,
              passwordHash,
              role: "USER",
              isActive: true,
              merchantId: invite.merchantId,
            })
            .returning();

          await tx.insert(teamMembers).values({
            userId: createdUser.id,
            merchantId: invite.merchantId,
            role: invite.role,
            isActive: true,
            joinedAt: new Date(),
          });

          await tx
            .update(teamInvites)
            .set({ acceptedByUserId: createdUser.id })
            .where(eq(teamInvites.id, invite.id));

          return createdUser;
        });

        await new Promise<void>((resolve, reject) => {
          req.session.regenerate((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        (req.session as any).userId = newUser.id;
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        res.json({
          message: "Account created and team joined!",
          merchantId: invite.merchantId,
        });
      } catch (error) {
        console.error("Error accepting invite with signup:", error);
        res.status(500).json({ message: "Failed to create account" });
      }
    },
  );

  app.patch("/api/team/:id/role", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      // Validate request body
      const validated = teamRoleUpdateSchema.safeParse(req.body);
      if (!validated.success) {
        return res
          .status(400)
          .json({ message: validated.error.errors[0].message });
      }

      // Verify team member exists and belongs to this merchant
      const memberId = req.params.id as string;
      const existingMember = await storage.getTeamMemberById(
        merchantId,
        memberId,
      );
      if (!existingMember) {
        return res.status(404).json({ message: "Team member not found" });
      }

      // Update role (scoped by merchantId)
      const member = await storage.updateTeamMemberRole(
        merchantId,
        memberId,
        validated.data.role,
      );
      res.json(member);
    } catch (error) {
      console.error("Error updating role:", error);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.delete("/api/team/:id", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      // Verify team member exists and belongs to this merchant
      const memberId = req.params.id as string;
      const existingMember = await storage.getTeamMemberById(
        merchantId,
        memberId,
      );
      if (!existingMember) {
        return res.status(404).json({ message: "Team member not found" });
      }

      // Delete (scoped by merchantId)
      await storage.deleteTeamMember(merchantId, memberId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing member:", error);
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  // Integrations
  app.get("/api/integrations", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const shopifyStore = await storage.getShopifyStore(merchantId);
      const couriers = await storage.getCourierAccounts(merchantId);

      // Filter out demo store in production if needed, or just return real data
      const isShopifyConnected = !!(
        shopifyStore?.isConnected &&
        shopifyStore?.accessToken &&
        shopifyStore.accessToken !== "demo-access-token"
      );

      const envCredentials: Record<
        string,
        { hasKey: boolean; hasSecret: boolean }
      > = {
        leopards: {
          hasKey: !!process.env.LEOPARDS_API_KEY,
          hasSecret: !!process.env.LEOPARDS_API_PASSWORD,
        },
        postex: {
          hasKey: !!process.env.POSTEX_API_TOKEN,
          hasSecret: false,
        },
      };

      res.json({
        shopify: {
          isConnected: isShopifyConnected,
          shopDomain: shopifyStore?.shopDomain || null,
          lastSyncAt: shopifyStore?.lastSyncAt || null,
        },
        couriers: couriers.map((c) => {
          const settings = (c.settings as Record<string, any>) || {};
          return {
            id: c.id,
            name: c.courierName,
            isActive: c.isActive,
            accountNumber: c.accountNumber,
            hasDbCredentials: !!(c.apiKey || c.apiSecret),
            useEnvCredentials: !!settings.useEnvCredentials,
            settings,
          };
        }),
        envCredentials,
      });
    } catch (error) {
      console.error("Error fetching integrations:", error);
      res.status(500).json({ message: "Failed to fetch integrations" });
    }
  });

  // Shopify connect schema
  const shopifyConnectSchema = z.object({
    storeDomain: z.string().min(1, "Store domain is required"),
  });

  app.post(
    "/api/integrations/shopify/connect",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const validated = shopifyConnectSchema.safeParse(req.body);
        if (!validated.success) {
          return res
            .status(400)
            .json({ message: validated.error.errors[0].message });
        }

        const { storeDomain } = validated.data;
        const fullDomain = storeDomain.includes(".myshopify.com")
          ? storeDomain
          : `${storeDomain}.myshopify.com`;

        // Check if store already exists for this merchant
        const existingStore = await storage.getShopifyStore(merchantId);

        if (existingStore) {
          // Update existing store
          await storage.updateShopifyStore(existingStore.id, {
            shopDomain: fullDomain,
            isConnected: true,
            accessToken: "demo-access-token", // In production, this comes from OAuth
          });
        } else {
          // Create new store connection
          await storage.createShopifyStore({
            merchantId,
            shopDomain: fullDomain,
            accessToken: "demo-access-token",
            isConnected: true,
          });
        }

        // Trigger sync for last 2 months
        await shopifyService.syncOrders(merchantId, storeDomain);

        res.json({
          success: true,
          message: "Shopify store connected successfully",
        });
      } catch (error) {
        console.error("Error connecting Shopify:", error);
        res.status(500).json({ message: "Failed to connect Shopify" });
      }
    },
  );

  // Manual Shopify connection with access token or legacy API key/password (bypasses OAuth)
  app.post(
    "/api/integrations/shopify/manual-connect",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const { storeDomain, accessToken, apiKey, apiPassword } = req.body;

        if (!storeDomain) {
          return res.status(400).json({ message: "Store domain is required" });
        }

        // Need either access token OR legacy api key/password
        const hasModernToken = !!accessToken;
        const hasLegacyCredentials = apiKey && apiPassword;

        if (!hasModernToken && !hasLegacyCredentials) {
          return res
            .status(400)
            .json({
              message: "Either access token or API key/password is required",
            });
        }

        // Validate store domain format
        const shopDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
        if (!shopDomainRegex.test(storeDomain)) {
          return res
            .status(400)
            .json({ message: "Invalid store domain format" });
        }

        // Validate credentials by making a test API call
        try {
          let testResponse;

          if (hasModernToken) {
            // Modern access token auth
            testResponse = await fetch(
              `https://${storeDomain}/admin/api/2025-01/shop.json`,
              {
                headers: {
                  "X-Shopify-Access-Token": accessToken,
                  "Content-Type": "application/json",
                },
              },
            );
          } else {
            // Legacy API key/password auth (Basic Auth)
            const credentials = Buffer.from(
              `${apiKey}:${apiPassword}`,
            ).toString("base64");
            testResponse = await fetch(
              `https://${storeDomain}/admin/api/2025-01/shop.json`,
              {
                headers: {
                  Authorization: `Basic ${credentials}`,
                  "Content-Type": "application/json",
                },
              },
            );
          }

          if (!testResponse.ok) {
            const errorText = await testResponse.text();
            console.error("Shopify API error:", testResponse.status, errorText);
            return res
              .status(400)
              .json({
                message: "Invalid credentials - could not connect to Shopify",
              });
          }
        } catch (err) {
          console.error("Shopify connection error:", err);
          return res
            .status(400)
            .json({ message: "Could not verify credentials with Shopify" });
        }

        const tokenToStore = hasModernToken
          ? accessToken
          : `${apiKey}:${apiPassword}`;
        const encryptedTokenToStore = encryptToken(tokenToStore);

        const existingStore = await storage.getShopifyStore(merchantId);

        if (existingStore) {
          await storage.updateShopifyStore(existingStore.id, {
            shopDomain: storeDomain,
            accessToken: encryptedTokenToStore,
            isConnected: true,
            lastSyncAt: new Date(),
          });
        } else {
          await storage.createShopifyStore({
            merchantId,
            shopDomain: storeDomain,
            accessToken: encryptedTokenToStore,
            scopes: "read_orders",
            isConnected: true,
          });
        }

        // Trigger sync for last 2 months
        await shopifyService.syncOrders(merchantId, storeDomain);

        res.json({
          success: true,
          message: "Shopify store connected successfully",
        });
      } catch (error) {
        console.error("Error manually connecting Shopify:", error);
        res.status(500).json({ message: "Failed to connect Shopify store" });
      }
    },
  );

  app.post(
    "/api/integrations/shopify/disconnect",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const store = await storage.getShopifyStore(merchantId);
        if (store) {
          await storage.updateShopifyStore(store.id, { isConnected: false });
        }
        res.json({ success: true });
      } catch (error) {
        console.error("Error disconnecting Shopify:", error);
        res.status(500).json({ message: "Failed to disconnect Shopify" });
      }
    },
  );

  app.post(
    "/api/integrations/shopify/sync",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const store = await storage.getShopifyStore(merchantId);
        if (!store || !store.isConnected) {
          return res
            .status(400)
            .json({ message: "Shopify store is not connected" });
        }

        if (!store.accessToken || store.accessToken === "demo-access-token") {
          shopifySyncProgress.set(merchantId, {
            status: 'running',
            processed: 0,
            total: 0,
            created: 0,
            updated: 0,
          });
          (async () => {
            try {
              const result = await syncShopifyOrders(merchantId, store.shopDomain!);
              shopifySyncProgress.set(merchantId, {
                status: 'done',
                processed: result.synced + result.total,
                total: result.total,
                created: result.synced,
                updated: result.total,
                ...(shopifySyncProgress.get(merchantId) && { completedAt: Date.now() }),
              });
            } catch (error: any) {
              shopifySyncProgress.set(merchantId, {
                status: 'error',
                processed: 0,
                total: 0,
                created: 0,
                updated: 0,
                error: error.message,
                ...(shopifySyncProgress.get(merchantId) && { completedAt: Date.now() }),
              });
            }
          })();
          return res.json({ started: true });
        }

        const { waitForMerchantSyncLock, releaseMerchantSyncLock, acquireMerchantSyncLock } =
          await import("./services/autoSync");
        
        if (!acquireMerchantSyncLock(merchantId)) {
          const existing = shopifySyncProgress.get(merchantId);
          if (existing?.status === 'running') {
            return res
              .status(409)
              .json({
                message:
                  "A sync is currently running. Please wait or check the progress.",
              });
          }
        }

        shopifySyncProgress.set(merchantId, {
          status: 'running',
          processed: 0,
          total: 0,
          created: 0,
          updated: 0,
        });

        (async () => {
          try {
            const forceFullSync = req.body?.forceFullSync === true;
            const result = await shopifyService.syncOrders(
              merchantId,
              store.shopDomain!,
              forceFullSync,
              (processed, total) => {
                shopifySyncProgress.set(merchantId, {
                  status: 'running',
                  processed,
                  total,
                  created: 0,
                  updated: 0,
                });
              }
            );
            shopifySyncProgress.set(merchantId, {
              status: 'done',
              processed: result.total,
              total: result.total,
              created: result.synced,
              updated: result.updated,
              ...(shopifySyncProgress.get(merchantId) && { completedAt: Date.now() }),
            });
          } catch (error: any) {
            console.error("Error syncing Shopify:", error);
            shopifySyncProgress.set(merchantId, {
              status: 'error',
              processed: 0,
              total: 0,
              created: 0,
              updated: 0,
              error: error.message,
              ...(shopifySyncProgress.get(merchantId) && { completedAt: Date.now() }),
            });
          } finally {
            releaseMerchantSyncLock(merchantId);
          }
        })();

        res.json({ started: true });
      } catch (error: any) {
        console.error("Error starting Shopify sync:", error);
        res
          .status(500)
          .json({ message: "Failed to start sync with Shopify. Please try again." });
      }
    },
  );

  app.get(
    "/api/integrations/shopify/sync-status",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const { getLastSyncResult, isSyncRunning } = await import(
          "./services/autoSync"
        );
        const lastResult = getLastSyncResult(merchantId);
        const running = isSyncRunning();
        res.json({
          autoSyncEnabled: true,
          intervalSeconds: 30,
          isRunning: running,
          lastSync: lastResult,
        });
      } catch (error) {
        res.status(500).json({ message: "Failed to get sync status" });
      }
    },
  );

  app.get(
    "/api/integrations/shopify/sync-progress",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const progress = shopifySyncProgress.get(merchantId);
        if (!progress) {
          return res.json({
            status: 'idle',
            processed: 0,
            total: 0,
            created: 0,
            updated: 0,
          });
        }
        res.json(progress);
      } catch (error) {
        res.status(500).json({ message: "Failed to get sync progress" });
      }
    },
  );

  // ============================================
  // SHOPIFY IMPORT JOB ENDPOINTS
  // ============================================
  app.post("/api/shopify/import/start", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const store = await storage.getShopifyStore(merchantId);
      if (!store || !store.isConnected || !store.accessToken) {
        return res
          .status(400)
          .json({
            message:
              "Shopify store is not connected. Please connect your store first.",
          });
      }

      const { getActiveImportJob, validateShopifyConnection, startImportJob } =
        await import("./services/importJobRunner");

      const existingJob = await getActiveImportJob(merchantId);
      if (existingJob) {
        return res.json({
          jobId: existingJob.id,
          message: "Import already in progress",
          alreadyRunning: true,
        });
      }

      const validation = await validateShopifyConnection(
        store.shopDomain!,
        store.accessToken,
      );
      if (!validation.valid) {
        return res
          .status(400)
          .json({ message: validation.error || "Shopify connection failed" });
      }

      const merchant = await storage.getMerchant(merchantId);
      const merchantTz = (merchant as any)?.timezone || DEFAULT_TIMEZONE;
      const syncFromStr = merchant?.shopifySyncFromDate
        ? new Date(merchant.shopifySyncFromDate).toISOString().split('T')[0]
        : null;
      const startDate = syncFromStr
        ? new Date(toMerchantStartOfDay(syncFromStr, merchantTz))
        : undefined;

      const job = await startImportJob({
        merchantId,
        shopDomain: store.shopDomain!,
        accessToken: store.accessToken,
        batchSize: 100,
        startDate,
      });

      res.json({ jobId: job.id, message: "Import started" });
    } catch (error: any) {
      console.error("Error starting import:", error);
      res
        .status(500)
        .json({ message: error.message || "Failed to start import" });
    }
  });

  app.get("/api/shopify/import/status", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const jobId = req.query.jobId as string;

      const { getImportJob, getLatestImportJob } = await import(
        "./services/importJobRunner"
      );
      let job;
      if (jobId) {
        job = await getImportJob(jobId);
        if (job && job.merchantId !== merchantId) {
          return res
            .status(403)
            .json({ message: "Not authorized to view this job" });
        }
      } else {
        job = await getLatestImportJob(merchantId);
      }

      if (!job) {
        return res.json({ job: null });
      }

      res.json({
        job: {
          id: job.id,
          status: job.status,
          processedCount: job.processedCount,
          createdCount: job.createdCount,
          updatedCount: job.updatedCount,
          failedCount: job.failedCount,
          totalFetched: job.totalFetched,
          currentPage: job.currentPage,
          batchSize: job.batchSize,
          startDate: job.startDate,
          lastError: job.lastError,
          lastErrorStage: job.lastErrorStage,
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
        },
      });
    } catch (error: any) {
      console.error("Error getting import status:", error);
      res.status(500).json({ message: "Failed to get import status" });
    }
  });

  app.post("/api/shopify/import/cancel", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { jobId } = req.body;
      if (!jobId) {
        return res.status(400).json({ message: "jobId is required" });
      }

      const { getImportJob, cancelImportJob } = await import(
        "./services/importJobRunner"
      );
      const job = await getImportJob(jobId);
      if (!job || job.merchantId !== merchantId) {
        return res.status(404).json({ message: "Import job not found" });
      }

      await cancelImportJob(jobId);
      res.json({ message: "Import cancelled" });
    } catch (error: any) {
      console.error("Error cancelling import:", error);
      res.status(500).json({ message: "Failed to cancel import" });
    }
  });

  app.post("/api/shopify/import/resume", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { jobId } = req.body;
      if (!jobId) {
        return res.status(400).json({ message: "jobId is required" });
      }

      const store = await storage.getShopifyStore(merchantId);
      if (!store || !store.accessToken) {
        return res
          .status(400)
          .json({ message: "Shopify store is not connected" });
      }

      const { getImportJob, resumeImportJob } = await import(
        "./services/importJobRunner"
      );
      const job = await getImportJob(jobId);
      if (!job || job.merchantId !== merchantId) {
        return res.status(404).json({ message: "Import job not found" });
      }
      if (job.status !== "FAILED") {
        return res.status(400).json({ message: "Can only resume failed jobs" });
      }

      const resumed = await resumeImportJob(jobId, store.accessToken);
      if (!resumed) {
        return res.status(400).json({ message: "Could not resume job" });
      }

      res.json({ jobId: resumed.id, message: "Import resumed" });
    } catch (error: any) {
      console.error("Error resuming import:", error);
      res.status(500).json({ message: "Failed to resume import" });
    }
  });

  // Fix city data for existing orders using GraphQL
  // This is needed because Shopify Basic plan restricts PII in REST API
  // but GraphQL returns some fields like city
  app.post(
    "/api/integrations/shopify/fix-city-data",
    isAuthenticated,
    async (req, res) => {
      try {
        const { merchantId } = req.body.user;

        const store = await storage.getShopifyStore(merchantId);
        if (
          !store ||
          !store.isConnected ||
          !store.accessToken ||
          !store.shopDomain
        ) {
          return res
            .status(400)
            .json({ message: "Shopify store not connected" });
        }

        // Get orders with missing city data
        const ordersWithMissingCity = await storage.getOrdersWithMissingCity(
          merchantId,
          500,
        );

        if (ordersWithMissingCity.length === 0) {
          return res.json({
            success: true,
            message: "No orders need city data update",
            updated: 0,
          });
        }

        console.log(
          `[Fix City Data] Found ${ordersWithMissingCity.length} orders with missing city, triggering full re-sync...`,
        );

        const result = await shopifyService.syncOrders(
          merchantId,
          store.shopDomain,
          true,
        );

        res.json({
          success: true,
          message: `Full re-sync complete: ${result.synced} new, ${result.updated} updated orders with complete data`,
          updated: result.updated,
          processed: result.total,
        });
      } catch (error: any) {
        console.error("Error fixing city data:", error);
        res
          .status(500)
          .json({ message: error.message || "Failed to fix city data" });
      }
    },
  );

  app.get(
    "/api/shopify/debug/oauth-config",
    isAuthenticated,
    async (req, res) => {
      try {
        const shop =
          typeof req.query.shop === "string" ? req.query.shop : undefined;
        const config = shopifyService.getOAuthConfig(shop);
        res.json(config);
      } catch (error) {
        res.status(500).json({ message: "Failed to get OAuth config" });
      }
    },
  );

  app.get("/api/shopify/auth-url", isAuthenticated, async (req, res) => {
    try {
      if (shopifyService.hasHostMismatch()) {
        return res
          .status(500)
          .json({
            message:
              "OAuth configuration error: SHOPIFY_APP_URL and SHOPIFY_APP_REDIRECT_URL hosts do not match. Contact admin.",
          });
      }
      const { shop } = req.query;
      if (!shop || typeof shop !== "string") {
        return res.status(400).json({ message: "Shop parameter is required" });
      }
      const shopDomain = shop.includes(".myshopify.com")
        ? shop
        : `${shop}.myshopify.com`;
      const shopDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
      if (!shopDomainRegex.test(shopDomain)) {
        return res.status(400).json({ message: "Invalid shop domain format" });
      }

      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const merchant = await storage.getMerchant(merchantId);
      let merchantCreds: { clientId: string } | undefined;
      const usingMerchantCreds = !!(
        merchant?.shopifyAppClientId && merchant?.shopifyAppClientSecret
      );
      if (usingMerchantCreds) {
        merchantCreds = { clientId: merchant.shopifyAppClientId! };
        console.log(
          `[Shopify OAuth] Using merchant-specific clientId for merchant ${merchantId}`,
        );
      }

      const state = crypto.randomBytes(16).toString("hex");
      const credSource = usingMerchantCreds ? "merchant" : "env";
      oauthStateStore.set(state, {
        merchantId,
        shopDomain,
        credSource,
        createdAt: Date.now(),
      });
      await storeOAuthStateInDb(state, { merchantId, shopDomain, credSource });
      console.log(
        `[Shopify OAuth] Generated state ${state.substring(0, 8)}... for merchant ${merchantId}, stored in memory + DB`,
      );
      (req.session as any).shopifyState = state;
      (req.session as any).shopDomain = shopDomain;
      (req.session as any).shopifyCredSource = usingMerchantCreds
        ? "merchant"
        : "env";
      (req.session as any).shopifyMerchantId = merchantId;
      const installUrl = shopifyService.getInstallUrl(
        shopDomain,
        state,
        merchantCreds,
      );

      const canonicalHost = shopifyService.getCanonicalHost();
      req.session.save((err: any) => {
        if (err) console.warn("[Shopify OAuth] Session save error:", err);
        res.json({ authUrl: installUrl, state, canonicalHost });
      });
    } catch (error) {
      console.error("Error generating Shopify auth URL:", error);
      res.status(500).json({ message: "Failed to generate auth URL" });
    }
  });

  app.get("/api/shopify/install", async (req, res) => {
    try {
      const { shop } = req.query;
      if (!shop || typeof shop !== "string") {
        return res.status(400).json({ message: "Shop parameter is required" });
      }

      const shopDomain = shop.includes(".myshopify.com")
        ? shop
        : `${shop}.myshopify.com`;

      // Validate shop domain format (must be valid Shopify store domain)
      const shopDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
      if (!shopDomainRegex.test(shopDomain)) {
        return res.status(400).json({ message: "Invalid shop domain format" });
      }

      const state = crypto.randomBytes(16).toString("hex");

      (req.session as any).shopifyState = state;
      (req.session as any).shopDomain = shopDomain;

      const installUrl = shopifyService.getInstallUrl(shopDomain, state);
      res.redirect(installUrl);
    } catch (error) {
      console.error("Error initiating Shopify install:", error);
      res.status(500).json({ message: "Failed to initiate Shopify install" });
    }
  });

  app.get("/api/shopify/callback", async (req: any, res) => {
    try {
      const canonicalHost = shopifyService.getCanonicalHost();
      const incomingHost = req.hostname || req.headers.host?.split(":")[0];
      if (canonicalHost && incomingHost && incomingHost !== canonicalHost) {
        const canonicalUrl = `https://${canonicalHost}${req.originalUrl}`;
        console.log(
          `[Shopify OAuth] Redirecting callback from ${incomingHost} to canonical host ${canonicalHost}`,
        );
        return res.redirect(302, canonicalUrl);
      }

      const { code, shop, state, hmac } = req.query;

      if (!code || !shop || !state) {
        return res.redirect(
          "/settings/shopify?shopify=error&message=Missing+required+parameters",
        );
      }

      let storedOAuth = oauthStateStore.get(state as string);

      if (!storedOAuth) {
        const dbState = await getOAuthStateFromDb(state as string);
        if (dbState) {
          storedOAuth = { ...dbState, createdAt: Date.now() };
          console.log(
            `[Shopify OAuth Callback] State recovered from DB for ${(state as string).substring(0, 8)}...`,
          );
        }
      }

      const savedState = req.session?.shopifyState;
      const sessionMatch = state === savedState;

      console.log(
        `[Shopify OAuth Callback] State check: received=${(state as string).substring(0, 8)}..., sessionMatch=${sessionMatch}, memoryHit=${oauthStateStore.has(state as string)}, dbHit=${!!storedOAuth}`,
      );

      if (!storedOAuth && !sessionMatch) {
        console.warn(
          "[Shopify OAuth Callback] State mismatch - no matching state found",
          { received: state, sessionId: req.sessionID },
        );
        return res.redirect(
          "/settings/shopify?shopify=error&message=Invalid+state+parameter",
        );
      }

      oauthStateStore.delete(state as string);
      try {
        const { pool } = await import("./db");
        pool
          .query(`DELETE FROM oauth_states WHERE state=$1`, [state])
          .catch(() => {});
      } catch {}
      delete req.session.shopifyState;

      const expectedShop =
        storedOAuth?.shopDomain || (req.session as any)?.shopDomain;
      if (expectedShop && expectedShop !== shop) {
        console.warn(
          `[Shopify OAuth Callback] Shop domain mismatch: expected=${expectedShop}, received=${shop}`,
        );
        return res.redirect(
          "/settings/shopify?shopify=error&message=Shop+domain+mismatch",
        );
      }

      const shopDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
      if (!shopDomainRegex.test(shop as string)) {
        return res.redirect(
          "/settings/shopify?shopify=error&message=Invalid+shop+domain",
        );
      }

      let merchantId: string | undefined;
      let credSource = "env";

      if (storedOAuth) {
        merchantId = storedOAuth.merchantId;
        credSource = storedOAuth.credSource;
      } else {
        const userId = getSessionUserId(req);
        if (!userId) {
          return res.redirect(
            "/settings/shopify?shopify=error&message=Not+authenticated",
          );
        }
        merchantId =
          (req.session as any).shopifyMerchantId ||
          (await storage.getUserMerchantId(userId));
        credSource = (req.session as any).shopifyCredSource || "env";
      }

      if (!merchantId) {
        return res.redirect(
          "/settings/shopify?shopify=error&message=No+merchant+account",
        );
      }

      let merchantCreds: { clientId: string; clientSecret: string } | undefined;
      if (credSource === "merchant") {
        const merchant = await storage.getMerchant(merchantId);
        if (merchant?.shopifyAppClientId && merchant?.shopifyAppClientSecret) {
          merchantCreds = {
            clientId: merchant.shopifyAppClientId,
            clientSecret: decryptToken(merchant.shopifyAppClientSecret),
          };
          console.log(
            `[Shopify OAuth Callback] Using merchant-specific credentials for merchant ${merchantId}`,
          );
        } else {
          console.warn(
            `[Shopify OAuth Callback] Session says merchant creds but none found, falling back to env`,
          );
        }
      }
      delete (req.session as any).shopifyCredSource;
      delete (req.session as any).shopifyMerchantId;

      if (hmac) {
        const queryParams: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.query)) {
          if (typeof value === "string") {
            queryParams[key] = value;
          }
        }
        const isValid = shopifyService.validateHmac(
          queryParams,
          merchantCreds
            ? { clientSecret: merchantCreds.clientSecret }
            : undefined,
        );
        if (!isValid) {
          console.warn("HMAC validation failed");
          return res.redirect(
            "/onboarding?shopify=error&message=Invalid+signature",
          );
        }
      }

      const { accessToken, scope } = await shopifyService.exchangeCodeForToken(
        shop as string,
        code as string,
        merchantCreds,
      );

      const requestedScopes = (process.env.SHOPIFY_APP_SCOPES || 'read_orders,write_orders,read_fulfillments,write_fulfillments,read_inventory,write_webhooks,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders').split(',').map(s => s.trim());
      const grantedScopes = scope ? scope.split(',').map((s: string) => s.trim()) : [];
      const isScopeSatisfied = (required: string, granted: string[]): boolean => {
        if (granted.includes(required)) return true;
        if (required === 'read_orders' && (granted.includes('read_all_orders') || granted.includes('write_orders'))) return true;
        if (required.startsWith('read_')) {
          const resource = required.replace('read_', '');
          if (granted.includes(`write_${resource}`)) return true;
        }
        return false;
      };
      const missingScopes = requestedScopes.filter(s => !isScopeSatisfied(s, grantedScopes));
      
      console.log(`[Shopify OAuth Callback] Scopes granted by Shopify: ${scope}`);
      console.log(`[Shopify OAuth Callback] Missing scopes after aliasing: ${missingScopes.length > 0 ? missingScopes.join(', ') : 'NONE'}`);
      if (missingScopes.length > 0) {
        console.warn(`[Shopify OAuth Callback] WARNING: Missing scopes not granted by Shopify: ${missingScopes.join(', ')}`);
        console.warn(`[Shopify OAuth Callback] This may cause write-back features (tags, fulfillments, address updates) to fail with 403 errors.`);
        console.warn(`[Shopify OAuth Callback] To fix: In Shopify Admin > Settings > Apps > ${shop} > API access, ensure all required scopes are approved.`);
      }

      const encryptedToken = encryptToken(accessToken);

      const existingStore = await storage.getShopifyStore(merchantId);

      if (existingStore) {
        await storage.updateShopifyStore(existingStore.id, {
          shopDomain: shop as string,
          accessToken: encryptedToken,
          scopes: scope,
          isConnected: true,
          lastSyncAt: new Date(),
        });
      } else {
        await storage.createShopifyStore({
          merchantId,
          shopDomain: shop as string,
          accessToken: encryptedToken,
          scopes: scope,
          isConnected: true,
        });
      }

      try {
        const shopInfoRes = await fetch(
          `https://${shop}/admin/api/2025-01/shop.json`,
          { headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" } }
        );
        if (shopInfoRes.ok) {
          const shopData = await shopInfoRes.json();
          const shopTimezone = shopData?.shop?.iana_timezone;
          if (shopTimezone) {
            await storage.updateMerchant(merchantId, { timezone: shopTimezone } as any);
            console.log(`[Shopify OAuth] Set merchant timezone to ${shopTimezone}`);
          }
        }
      } catch (tzErr) {
        console.error("[Shopify OAuth] Failed to fetch shop timezone:", tzErr);
      }

      const merchantBeforeUpdate = await storage.getMerchant(merchantId);
      const isOnboardingComplete =
        merchantBeforeUpdate?.onboardingStep === "COMPLETED";

      if (!isOnboardingComplete) {
        try {
          await storage.updateMerchant(merchantId, {
            onboardingStep: "SHOPIFY_CONNECTED",
          } as any);
        } catch (e) {
          console.error("Error advancing onboarding to SHOPIFY_CONNECTED:", e);
        }
      }

      try {
        await registerShopifyWebhooks(merchantId);
      } catch (webhookErr) {
        console.error("Error registering Shopify webhooks:", webhookErr);
      }

      shopifyService
        .syncOrders(merchantId, shop as string)
        .then(() => {
          if (!isOnboardingComplete) {
            storage
              .updateMerchant(merchantId!, {
                onboardingStep: "ORDERS_SYNCED",
              } as any)
              .catch((e) =>
                console.error(
                  "Error advancing onboarding to ORDERS_SYNCED:",
                  e,
                ),
              );
          }
        })
        .catch((err) => console.error("Background sync error:", err));

      delete req.session.shopifyState;
      delete req.session.shopDomain;

      const redirectPath = isOnboardingComplete
        ? "/settings/shopify"
        : "/onboarding";
      res.redirect(`${redirectPath}?shopify=connected`);
    } catch (error) {
      console.error("Error in Shopify callback:", error);
      const errorRedirect = "/settings/shopify";
      res.redirect(
        `${errorRedirect}?shopify=error&message=` +
          encodeURIComponent(String(error)),
      );
    }
  });

  // PostEx Webhook Route (no auth - public endpoint for PostEx to push status updates)
  app.post("/webhooks/postex/status-update", async (req: any, res) => {
    const webhookSecret = process.env.POSTEX_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn("[PostEx Webhook] POSTEX_WEBHOOK_SECRET not configured — rejecting request");
      res.status(403).json({ error: "Webhook not configured" });
      return;
    }

    const headerToken = req.headers["x-webhook-secret"] || req.headers["authorization"];
    if (headerToken !== webhookSecret && headerToken !== `Bearer ${webhookSecret}`) {
      console.warn("[PostEx Webhook] Invalid webhook secret header — rejecting");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    res.status(200).json({ received: true });

    try {
      const payload = req.body;
      if (!payload) {
        console.warn("[PostEx Webhook] Empty payload");
        return;
      }

      const trackingNumber = payload.trackingNumber || payload.tracking_number || payload.cn || payload.consignmentNumber || payload.TrackingNumber;
      const rawStatus = payload.status || payload.orderStatus || payload.Status || payload.transactionStatus;

      if (!trackingNumber || !rawStatus) {
        console.warn("[PostEx Webhook] Missing trackingNumber or status in payload:", JSON.stringify(payload).slice(0, 500));
        return;
      }

      console.log(`[PostEx Webhook] Received status update: tracking=${trackingNumber}, status=${rawStatus}`);

      (async () => {
        try {
          const matchingOrders = await db.select().from(orders)
            .where(
              and(
                eq(orders.courierTracking, trackingNumber),
                sql`LOWER(${orders.courierName}) LIKE '%postex%'`
              )
            );

          if (matchingOrders.length > 1) {
            console.warn(`[PostEx Webhook] Multiple orders found for tracking ${trackingNumber} across ${matchingOrders.length} merchants — skipping to prevent cross-tenant update`);
            return;
          }

          if (matchingOrders.length === 0) {
            console.warn(`[PostEx Webhook] No order found for tracking number: ${trackingNumber}`);
            return;
          }

          const order = matchingOrders[0];
          const merchantId = order.merchantId;

          let customMappings: Record<string, string> | undefined;
          try {
            const mappingRows = await storage.getCourierStatusMappings(merchantId, 'postex');
            if (mappingRows && mappingRows.length > 0) {
              customMappings = {};
              for (const m of mappingRows) {
                customMappings[m.courierStatus] = m.normalizedStatus;
              }
            }
          } catch {}

          const { normalizeStatus, isValidUniversalStatus } = await import("./services/statusNormalization");
          const { normalizedStatus, mapped } = normalizeStatus(
            rawStatus,
            'postex',
            order.shipmentStatus,
            undefined,
            order.workflowStatus,
            customMappings,
          );

          if (!mapped) {
            try {
              await storage.recordUnmappedStatus(merchantId, 'postex', rawStatus, trackingNumber);
            } catch {}
          }

          if (!isValidUniversalStatus(normalizedStatus)) {
            console.warn(`[PostEx Webhook] Invalid normalized status "${normalizedStatus}" for tracking ${trackingNumber}`);
            return;
          }

          if (normalizedStatus === order.shipmentStatus) {
            console.log(`[PostEx Webhook] Status unchanged for ${trackingNumber}: ${normalizedStatus}`);
            return;
          }

          await storage.updateOrder(merchantId, order.id, {
            shipmentStatus: normalizedStatus,
            courierRawStatus: rawStatus,
            lastTrackingUpdate: new Date(),
          });

          const freshOrder = await storage.getOrderById(merchantId, order.id);
          if (freshOrder) {
            await autoTransitionOrder(merchantId, freshOrder, normalizedStatus, rawStatus);
          }

          console.log(`[PostEx Webhook] Updated order ${order.orderNumber}: ${order.shipmentStatus} -> ${normalizedStatus} (raw: ${rawStatus})`);
        } catch (err: any) {
          console.error(`[PostEx Webhook] Error processing tracking ${trackingNumber}:`, err.message);
        }
      })();
    } catch (error: any) {
      console.error("[PostEx Webhook] Error:", error.message);
    }
  });

  // Shopify Webhook Routes (no auth - verified via HMAC)
  app.post("/webhooks/shopify/orders-create", async (req: any, res) => {
    res.status(200).json({ received: true });
    try {
      const hmac = req.headers["x-shopify-hmac-sha256"] as string;
      const shopDomain = req.headers["x-shopify-shop-domain"] as string;
      const webhookId = req.headers["x-shopify-webhook-id"] as string;
      const rawBody = req.rawBody as Buffer;

      if (!rawBody || !hmac) {
        console.warn("[Webhook] orders/create: Missing HMAC or body");
        return;
      }

      if (!webhookHandler.verifyHmac(rawBody, hmac)) {
        console.warn("[Webhook] HMAC verification failed for orders/create");
        return;
      }

      webhookHandler
        .processOrderWebhook("orders/create", shopDomain, rawBody, webhookId)
        .catch((err) =>
          console.error("[Webhook] Background processing error:", err),
        );
    } catch (error) {
      console.error("[Webhook] orders/create error:", error);
    }
  });

  app.post("/webhooks/shopify/orders-updated", async (req: any, res) => {
    res.status(200).json({ received: true });
    try {
      const hmac = req.headers["x-shopify-hmac-sha256"] as string;
      const shopDomain = req.headers["x-shopify-shop-domain"] as string;
      const webhookId = req.headers["x-shopify-webhook-id"] as string;
      const rawBody = req.rawBody as Buffer;

      if (!rawBody || !hmac) {
        console.warn("[Webhook] orders/updated: Missing HMAC or body");
        return;
      }

      if (!webhookHandler.verifyHmac(rawBody, hmac)) {
        console.warn("[Webhook] HMAC verification failed for orders/updated");
        return;
      }

      webhookHandler
        .processOrderWebhook("orders/updated", shopDomain, rawBody, webhookId)
        .catch((err) =>
          console.error("[Webhook] Background processing error:", err),
        );
    } catch (error) {
      console.error("[Webhook] orders/updated error:", error);
    }
  });

  app.post("/webhooks/shopify/fulfillments-create", async (req: any, res) => {
    res.status(200).json({ received: true });
    try {
      const hmac = req.headers["x-shopify-hmac-sha256"] as string;
      const shopDomain = req.headers["x-shopify-shop-domain"] as string;
      const webhookId = req.headers["x-shopify-webhook-id"] as string;
      const rawBody = req.rawBody as Buffer;

      if (!rawBody || !hmac) {
        console.warn("[Webhook] fulfillments/create: Missing HMAC or body");
        return;
      }

      if (!webhookHandler.verifyHmac(rawBody, hmac)) {
        console.warn(
          "[Webhook] HMAC verification failed for fulfillments/create",
        );
        return;
      }

      webhookHandler
        .processFulfillmentWebhook(
          "fulfillments/create",
          shopDomain,
          rawBody,
          webhookId,
        )
        .catch((err) =>
          console.error("[Webhook] Background processing error:", err),
        );
    } catch (error) {
      console.error("[Webhook] fulfillments/create error:", error);
    }
  });

  app.post("/api/shopify/reconcile", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const store = await storage.getShopifyStore(merchantId);
      if (!store || !store.isConnected || !store.shopDomain) {
        return res.status(400).json({ message: "Shopify store not connected" });
      }

      const result = await shopifyService.syncOrders(
        merchantId,
        store.shopDomain,
        true,
      );
      res.json({
        success: true,
        ...result,
        message: `Full scan complete: ${result.synced} new, ${result.updated} updated`,
        lastSyncAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Error reconciling orders:", error);
      res
        .status(500)
        .json({ message: error.message || "Reconciliation failed" });
    }
  });

  // ============================================
  // SHOPIFY SCOPE VERIFICATION
  // ============================================
  app.get("/api/shopify/scopes", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const store = await storage.getShopifyStore(merchantId);
      if (!store || !store.isConnected) {
        return res.json({ connected: false, grantedScopes: [], missingScopes: [], requiredScopes: [] });
      }

      const requiredScopes = (process.env.SHOPIFY_APP_SCOPES || 'read_orders,write_orders,read_fulfillments,write_fulfillments,read_inventory,write_webhooks,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders').split(',').map(s => s.trim());
      const grantedScopes = store.scopes ? store.scopes.split(',').map(s => s.trim()) : [];

      const isScopeSatisfied = (required: string, granted: string[]): boolean => {
        if (granted.includes(required)) return true;
        if (required === 'read_orders' && (granted.includes('read_all_orders') || granted.includes('write_orders'))) return true;
        if (required === 'read_all_orders' && granted.includes('read_all_orders')) return true;
        if (required.startsWith('read_')) {
          const resource = required.replace('read_', '');
          if (granted.includes(`write_${resource}`)) return true;
        }
        return false;
      };

      const missingScopes = requiredScopes.filter(s => !isScopeSatisfied(s, grantedScopes));

      res.json({
        connected: true,
        shopDomain: store.shopDomain,
        grantedScopes,
        requiredScopes,
        missingScopes,
        hasScopeMismatch: missingScopes.length > 0,
        writeBackEnabled: isScopeSatisfied('write_orders', grantedScopes) && isScopeSatisfied('write_fulfillments', grantedScopes) && isScopeSatisfied('write_merchant_managed_fulfillment_orders', grantedScopes),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to check scopes" });
    }
  });

  app.get("/api/shopify/test-token", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const store = await storage.getShopifyStore(merchantId);
      if (!store || !store.accessToken || !store.shopDomain || !store.isConnected) {
        return res.json({ connected: false, error: "Shopify not connected" });
      }

      const accessToken = decryptToken(store.accessToken);
      const results: Record<string, any> = {
        shopDomain: store.shopDomain,
        storedScopes: store.scopes,
        tokenLength: accessToken.length,
        tokenPrefix: accessToken.substring(0, 6) + "...",
      };

      try {
        const readRes = await fetch(
          `https://${store.shopDomain}/admin/api/2025-01/orders.json?limit=1&status=any`,
          { headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" } }
        );
        results.readOrders = { status: readRes.status, ok: readRes.ok };
        if (!readRes.ok) {
          results.readOrders.body = await readRes.text();
        }
      } catch (e: any) {
        results.readOrders = { error: e.message };
      }

      try {
        const scopesRes = await fetch(
          `https://${store.shopDomain}/admin/oauth/access_scopes.json`,
          { headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" } }
        );
        if (scopesRes.ok) {
          const scopesData = await scopesRes.json();
          results.actualScopes = scopesData.access_scopes?.map((s: any) => s.handle) || [];
        } else {
          results.actualScopes = { status: scopesRes.status, body: await scopesRes.text() };
        }
      } catch (e: any) {
        results.actualScopes = { error: e.message };
      }

      try {
        const shopRes = await fetch(
          `https://${store.shopDomain}/admin/api/2025-01/shop.json`,
          { headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" } }
        );
        results.readShop = { status: shopRes.status, ok: shopRes.ok };
      } catch (e: any) {
        results.readShop = { error: e.message };
      }

      try {
        const foRes = await fetch(
          `https://${store.shopDomain}/admin/api/2025-01/fulfillment_orders.json?status=open&limit=1`,
          { headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" } }
        );
        results.readFulfillmentOrders = { status: foRes.status, ok: foRes.ok };
        if (!foRes.ok) {
          results.readFulfillmentOrders.body = await foRes.text();
        }
      } catch (e: any) {
        results.readFulfillmentOrders = { error: e.message };
      }

      console.log("[Shopify Token Test]", JSON.stringify(results, null, 2));
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Token test failed" });
    }
  });

  // ============================================
  // WEBHOOK MANAGEMENT ENDPOINTS
  // ============================================
  app.get("/api/shopify/webhooks/health", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const health = await checkWebhookHealth(merchantId);
      res.json(health);
    } catch (error: any) {
      console.error("Error checking webhook health:", error);
      res
        .status(500)
        .json({ message: error.message || "Failed to check webhook health" });
    }
  });

  app.post(
    "/api/shopify/webhooks/register",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const result = await registerShopifyWebhooks(merchantId);
        res.json({
          success: result.failed.length === 0,
          registered: result.registered,
          failed: result.failed,
          message:
            result.failed.length === 0
              ? `All ${result.registered.length} webhooks registered successfully`
              : `${result.registered.length} registered, ${result.failed.length} failed`,
        });
      } catch (error: any) {
        console.error("Error registering webhooks:", error);
        res
          .status(500)
          .json({ message: error.message || "Failed to register webhooks" });
      }
    },
  );

  // ============================================
  // DATA HEALTH & SYNC LOG ENDPOINTS
  // ============================================
  app.get("/api/data-health", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const [dataHealth, lastSync, recentSyncLogs] = await Promise.all([
        storage.getDataHealthStats(merchantId),
        storage.getShopifyStore(merchantId),
        storage.getRecentSyncLogs(merchantId, 10),
      ]);

      res.json({
        dataHealth,
        lastApiSyncAt: lastSync?.lastSyncAt || null,
        shopDomain: lastSync?.shopDomain || null,
        isConnected: lastSync?.isConnected || false,
        recentSyncLogs,
      });
    } catch (error) {
      console.error("Error fetching data health:", error);
      res.status(500).json({ message: "Failed to fetch data health" });
    }
  });

  app.get("/api/sync-logs", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const limit = parseInt(req.query.limit as string) || 20;
      const logs = await storage.getRecentSyncLogs(merchantId, limit);
      res.json({ logs });
    } catch (error) {
      console.error("Error fetching sync logs:", error);
      res.status(500).json({ message: "Failed to fetch sync logs" });
    }
  });

  app.post("/api/integrations/couriers", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const validated = courierAccountSchema.safeParse(req.body);
      if (!validated.success) {
        return res
          .status(400)
          .json({ message: validated.error.errors[0].message });
      }

      const {
        courierName,
        apiKey,
        apiSecret,
        accountNumber,
        useEnvCredentials,
        settings: incomingSettings,
      } = validated.data;

      const existing = (await storage.getCourierAccounts(merchantId)).find(
        (c) => c.courierName === courierName,
      );

      const settings: Record<string, any> = {
        useEnvCredentials: !!useEnvCredentials,
        ...incomingSettings,
      };

      if (existing) {
        const account = await storage.updateCourierAccount(existing.id, {
          apiKey: useEnvCredentials ? null : apiKey || existing.apiKey,
          apiSecret: useEnvCredentials ? null : apiSecret || existing.apiSecret,
          accountNumber: accountNumber || existing.accountNumber,
          settings,
          isActive: true,
        });
        res.json(account);
      } else {
        const account = await storage.createCourierAccount({
          merchantId,
          courierName,
          apiKey: useEnvCredentials ? null : apiKey || null,
          apiSecret: useEnvCredentials ? null : apiSecret || null,
          accountNumber: accountNumber || null,
          settings,
          isActive: true,
        });
        res.json(account);
      }
    } catch (error) {
      console.error("Error saving courier:", error);
      res.status(500).json({ message: "Failed to save courier" });
    }
  });

  app.post(
    "/api/integrations/couriers/test",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const { courierName } = req.body;
        if (!courierName)
          return res.status(400).json({ message: "courierName required" });

        const creds = await getCourierCredentials(merchantId, courierName);
        if (!creds) {
          return res.json({
            success: false,
            message: "No credentials configured",
          });
        }

        if (courierName === "leopards") {
          try {
            const resp = await fetch(
              "https://merchantapi.leopardscourier.com/api/getAllCities/format/json/",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  api_key: creds.apiKey,
                  api_password: creds.apiSecret,
                }),
              },
            );
            const data = await resp.json();
            if (data.status === 1) {
              return res.json({
                success: true,
                message: `Connected! ${data.city_list?.length || 0} cities available.`,
              });
            }
            return res.json({
              success: false,
              message: data.error || "Authentication failed",
            });
          } catch (err: any) {
            return res.json({ success: false, message: err.message });
          }
        }

        if (courierName === "postex") {
          try {
            const resp = await fetch(
              "https://api.postex.pk/services/integration/api/order/v2/get-operational-city",
              {
                headers: {
                  "Content-Type": "application/json",
                  token: creds.apiKey!,
                },
              },
            );
            const data = await resp.json();
            if (data.statusCode === "200") {
              return res.json({
                success: true,
                message: `Connected! ${data.dist?.length || 0} operational cities.`,
              });
            }
            return res.json({
              success: false,
              message: data.statusMessage || "Authentication failed",
            });
          } catch (err: any) {
            return res.json({ success: false, message: err.message });
          }
        }

        return res.json({
          success: false,
          message: `Test not available for ${courierName}`,
        });
      } catch (error) {
        console.error("Error testing courier:", error);
        res.status(500).json({ message: "Failed to test courier connection" });
      }
    },
  );

  app.post(
    "/api/integrations/postex/addresses",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const creds = await getCourierCredentials(merchantId, "postex");
        if (!creds || !creds.apiKey) {
          return res
            .status(400)
            .json({
              message:
                "PostEx credentials not configured. Save your API Token first.",
            });
        }

        const resp = await fetch(
          "https://api.postex.pk/services/integration/api/order/v1/get-merchant-address",
          {
            headers: {
              "Content-Type": "application/json",
              token: creds.apiKey,
            },
          },
        );
        const data = await resp.json();
        console.log(
          "[PostEx] Merchant addresses response:",
          JSON.stringify(data).substring(0, 500),
        );

        if (data.statusCode === "200" && data.dist) {
          return res.json({ success: true, addresses: data.dist });
        }
        return res.json({
          success: false,
          message: data.statusMessage || "Failed to fetch addresses",
        });
      } catch (error: any) {
        console.error("Error fetching PostEx addresses:", error);
        res
          .status(500)
          .json({
            message: error.message || "Failed to fetch PostEx addresses",
          });
      }
    },
  );

  app.get("/api/sidebar-preferences", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      const [user] = await db.select({
        sidebarMode: users.sidebarMode,
        sidebarPinnedPages: users.sidebarPinnedPages,
      }).from(users).where(eq(users.id, userId));
      res.json({
        sidebarMode: user?.sidebarMode || "advanced",
        sidebarPinnedPages: user?.sidebarPinnedPages || [],
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sidebar preferences" });
    }
  });

  app.patch("/api/sidebar-preferences", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      const { sidebarMode, sidebarPinnedPages } = req.body;
      const updates: any = { updatedAt: new Date() };
      if (sidebarMode && ["simple", "advanced"].includes(sidebarMode)) {
        updates.sidebarMode = sidebarMode;
      }
      if (Array.isArray(sidebarPinnedPages)) {
        updates.sidebarPinnedPages = sidebarPinnedPages;
      }
      await db.update(users).set(updates).where(eq(users.id, userId));
      const [updated] = await db.select({
        sidebarMode: users.sidebarMode,
        sidebarPinnedPages: users.sidebarPinnedPages,
      }).from(users).where(eq(users.id, userId));
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update sidebar preferences" });
    }
  });

  // Settings
  app.get("/api/settings", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const merchant = await storage.getMerchant(merchantId);

      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json({
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        phone: merchant.phone,
        address: merchant.address,
        city: merchant.city,
        notifications: {
          emailOrderUpdates: true,
          emailDeliveryAlerts: true,
          emailCodReminders: true,
        },
      });
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.patch("/api/settings", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      // Validate request body
      const validated = settingsUpdateSchema.safeParse(req.body);
      if (!validated.success) {
        return res
          .status(400)
          .json({ message: validated.error.errors[0].message });
      }

      const { name, email, phone, address, city } = validated.data;

      const updated = await storage.updateMerchant(merchantId, {
        name,
        email,
        phone,
        address,
        city,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  app.post("/api/couriers/sync-statuses", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { startManualCourierSync, getManualSyncProgress } = await import(
        "./services/courierSyncScheduler"
      );

      const existing = getManualSyncProgress(merchantId);
      if (existing?.status === 'running') {
        return res.json({
          success: true,
          status: 'already_running',
          message: "Courier sync is already running in the background.",
          startedAt: existing.startedAt,
        });
      }

      const courierFilter = (req.query.courier as string) || (req.body?.courier as string) || undefined;
      const started = startManualCourierSync(merchantId, courierFilter);
      if (!started) {
        return res.status(409).json({ message: "Courier sync is already running." });
      }

      res.json({
        success: true,
        status: 'started',
        message: "Courier sync started in the background. Check status for progress.",
      });
    } catch (error: any) {
      console.error("Error starting courier sync:", error);
      const userMessage = error.message?.includes('API') || error.message?.includes('401')
        ? "Courier API credentials may be invalid. Check your courier settings."
        : error.message || "Failed to start courier sync. Please try again.";
      res.status(500).json({ message: userMessage });
    }
  });

  app.get("/api/couriers/manual-sync-progress", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { getManualSyncProgress } = await import(
        "./services/courierSyncScheduler"
      );
      const progress = getManualSyncProgress(merchantId);
      if (!progress) {
        return res.json({ status: 'idle' });
      }
      res.json(progress);
    } catch (error) {
      res.status(500).json({ message: "Failed to get sync progress" });
    }
  });

  app.get("/api/couriers/postex-webhook-config", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const webhookUrl = `${req.protocol}://${req.get("host")}/webhooks/postex/status-update`;
      const headerKey = "x-webhook-secret";
      const headerValue = process.env.POSTEX_WEBHOOK_SECRET || "not-configured";

      res.json({
        webhookUrl,
        headerKey,
        headerValue,
      });
    } catch (error) {
      console.error("Error fetching PostEx webhook config:", error);
      res.status(500).json({ message: "Failed to fetch PostEx webhook config" });
    }
  });

  app.get("/api/couriers/sync-status", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { getLastCourierSyncResult, isCourierSyncRunning } = await import(
        "./services/courierSyncScheduler"
      );
      const lastResult = getLastCourierSyncResult(merchantId);

      res.json({
        autoSyncEnabled: true,
        intervalSeconds: 300,
        isRunning: isCourierSyncRunning(),
        lastResult: lastResult
          ? {
              timestamp: lastResult.timestamp,
              updated: lastResult.updated,
              failed: lastResult.failed,
              skipped: lastResult.skipped,
              total: lastResult.total,
              error: lastResult.error,
            }
          : null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get courier sync status" });
    }
  });

  // Track single shipment
  app.get(
    "/api/couriers/track/:courier/:trackingNumber",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const courier = req.params.courier as string;
        const trackingNumber = req.params.trackingNumber as string;
        const { trackShipment } = await import("./services/couriers");

        const creds = await getCourierCredentials(merchantId, courier);
        const credObj = creds
          ? {
              apiKey: creds.apiKey || undefined,
              apiSecret: creds.apiSecret || undefined,
            }
          : undefined;
        const result = await trackShipment(
          courier,
          trackingNumber,
          credObj,
          undefined,
          undefined,
          merchantId,
        );

        if (!result) {
          return res.status(400).json({ message: "Unknown courier" });
        }

        res.json(result);
      } catch (error) {
        console.error("Error tracking shipment:", error);
        res.status(500).json({ message: "Failed to track shipment" });
      }
    },
  );

  app.get(
    "/api/orders/:orderId/tracking-history",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const order = await storage.getOrderById(
          merchantId,
          req.params.orderId,
        );
        if (!order) {
          return res.status(404).json({ message: "Order not found" });
        }

        if (!order.courierName || !order.courierTracking) {
          return res.json({
            success: false,
            events: [],
            message: "No courier booking found for this order",
          });
        }

        const { trackShipment } = await import("./services/couriers");
        const creds = await getCourierCredentials(
          merchantId,
          order.courierName,
        );
        const credObj = creds
          ? {
              apiKey: creds.apiKey || undefined,
              apiSecret: creds.apiSecret || undefined,
            }
          : undefined;
        const result = await trackShipment(
          order.courierName,
          order.courierTracking,
          credObj,
          order.shipmentStatus,
          order.workflowStatus,
          merchantId,
        );

        if (!result || !result.success) {
          return res.json({
            success: false,
            events: [],
            message:
              result?.statusDescription || "Could not fetch tracking data",
            courierName: order.courierName,
            trackingNumber: order.courierTracking,
          });
        }

        res.json({
          success: true,
          courierName: order.courierName,
          trackingNumber: order.courierTracking,
          currentStatus: result.normalizedStatus,
          rawStatus: result.rawCourierStatus,
          statusDescription: result.statusDescription,
          lastUpdate: result.lastUpdate,
          events: result.events,
        });
      } catch (error) {
        console.error("Error fetching tracking history:", error);
        res.status(500).json({ message: "Failed to fetch tracking history" });
      }
    },
  );

  // ============================================
  // COURIER CITIES ENDPOINT
  // ============================================

  app.get("/api/booking/cities/:courier", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const courier = req.params.courier as string;
      if (!["leopards", "postex"].includes(courier)) {
        return res.status(400).json({ message: "Valid courier required" });
      }

      const creds = await getCourierCredentials(merchantId, courier);
      if (!creds) {
        return res
          .status(400)
          .json({ message: `No ${courier} credentials configured` });
      }

      if (courier === "leopards") {
        const { loadLeopardsCities } = await import(
          "./services/couriers/booking"
        );
        const cities = await loadLeopardsCities(
          creds.apiKey!,
          creds.apiSecret!,
        );
        res.json({
          courier,
          cities: cities.map((c) => ({
            id: c.id,
            name: c.name,
            shipmentTypes: c.shipmentTypes,
          })),
        });
      } else {
        const { loadPostExCities } = await import(
          "./services/couriers/booking"
        );
        const cities = await loadPostExCities(creds.apiKey!);
        res.json({
          courier,
          cities: cities.map((c) => ({
            name: c.name,
            isDeliveryCity: c.isDeliveryCity,
          })),
        });
      }
    } catch (error) {
      console.error("Error loading courier cities:", error);
      res.status(500).json({ message: "Failed to load cities" });
    }
  });

  // ============================================
  // COURIER BOOKING ENDPOINTS
  // ============================================

  app.post("/api/booking/preview", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { orderIds, courier } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ message: "Order IDs required" });
      }
      if (!courier || !["leopards", "postex"].includes(courier)) {
        return res
          .status(400)
          .json({ message: "Valid courier required (leopards or postex)" });
      }

      const {
        validateOrderForBooking,
        normalizePhone,
        matchCityForCourier,
        loadLeopardsCities,
        loadPostExCities,
      } = await import("./services/couriers/booking");

      const creds = await getCourierCredentials(merchantId, courier);
      let courierCities: Array<{ id?: number; name: string }> = [];
      if (creds) {
        if (courier === "leopards") {
          const leopCities = await loadLeopardsCities(
            creds.apiKey!,
            creds.apiSecret!,
          );
          courierCities = leopCities.map((c) => ({ id: c.id, name: c.name }));
        } else {
          const postCities = await loadPostExCities(creds.apiKey!);
          courierCities = postCities
            .filter((c) => c.isDeliveryCity)
            .map((c) => ({ name: c.name }));
        }
      }

      const fetchedOrders = await storage.getOrdersByIds(merchantId, orderIds);
      const existingJobs = await storage.getBookingJobsByOrderIds(
        merchantId,
        orderIds,
      );
      const bookedOrderIds = new Set(
        existingJobs
          .filter((j) => j.status === "success" && j.trackingNumber)
          .map((j) => j.orderId),
      );

      const buildProductDescription = (order: any): string => {
        const items = order.lineItems as any[];
        if (items && items.length > 0) {
          return items
            .map((i: any) => {
              const name = (i.name || i.title || "Item").trim();
              const variant = i.variant_title ? ` - ${i.variant_title}` : "";
              const qty = i.quantity > 1 ? ` x ${i.quantity}` : "";
              return `${name}${variant}${qty}`;
            })
            .join(" | ");
        }
        return order.itemSummary || "Order items";
      };

      type PreviewOrder = {
        orderId: string;
        orderNumber: string;
        customerName: string;
        city: string;
        address: string;
        phone: string;
        weight: number;
        pieces: number;
        productDescription: string;
        codAmount: number;
        amount: string;
        cityMatched: boolean;
        matchedCityName: string;
        matchedCityId?: number;
        missingFields?: string[];
      };

      const valid: PreviewOrder[] = [];
      const invalid: PreviewOrder[] = [];
      const alreadyBooked: Array<{
        orderId: string;
        orderNumber: string;
        trackingNumber: string;
      }> = [];

      for (const order of fetchedOrders) {
        if (order.workflowStatus !== "READY_TO_SHIP") {
          const cityMatch = matchCityForCourier(
            order.city || "",
            courierCities,
            courier,
          );
          invalid.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerName: order.customerName || "",
            city: order.city || "",
            address: order.shippingAddress || "",
            phone: normalizePhone(order.customerPhone),
            weight: 200,
            pieces: 1,
            productDescription: buildProductDescription(order),
            codAmount: parseFloat(order.codRemaining ?? order.totalAmount) || 0,
            amount: order.totalAmount,
            cityMatched: cityMatch.matched,
            matchedCityName: cityMatch.matchedCity,
            matchedCityId: cityMatch.matchedCityId,
            missingFields: ["Not in Ready to Ship status"],
          });
          continue;
        }

        if (
          (order.courierTracking && order.workflowStatus === "BOOKED") ||
          (bookedOrderIds.has(order.id) && order.workflowStatus === "BOOKED")
        ) {
          const existingJob = existingJobs.find(
            (j) => j.orderId === order.id && j.status === "success",
          );
          alreadyBooked.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            trackingNumber:
              existingJob?.trackingNumber || order.courierTracking || "Unknown",
          });
          continue;
        }

        const pieces = 1;
        const productDescription = buildProductDescription(order);
        const codAmount = parseFloat(order.codRemaining ?? order.totalAmount) || 0;
        const phone = normalizePhone(order.customerPhone);
        const cityMatch = matchCityForCourier(
          order.city || "",
          courierCities,
          courier,
        );

        const missing = validateOrderForBooking(order);
        if (missing.length > 0) {
          invalid.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerName: order.customerName || "",
            city: order.city || "",
            address: order.shippingAddress || "",
            phone,
            weight: 200,
            pieces,
            productDescription,
            codAmount,
            amount: order.totalAmount,
            cityMatched: cityMatch.matched,
            matchedCityName: cityMatch.matchedCity,
            matchedCityId: cityMatch.matchedCityId,
            missingFields: missing,
          });
        } else {
          valid.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            city: order.city || "",
            address: order.shippingAddress || "",
            phone,
            weight: 200,
            pieces,
            productDescription,
            codAmount,
            amount: order.totalAmount,
            cityMatched: cityMatch.matched,
            matchedCityName: cityMatch.matchedCity,
            matchedCityId: cityMatch.matchedCityId,
          });
        }
      }

      res.json({
        valid,
        invalid,
        alreadyBooked,
        courier,
        courierCities: courierCities.map((c) => ({
          id: (c as any).id,
          name: c.name,
        })),
      });
    } catch (error) {
      console.error("Error previewing booking:", error);
      res.status(500).json({ message: "Failed to preview booking" });
    }
  });

  app.post("/api/booking/book", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { orderIds, courier, orderOverrides } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ message: "Order IDs required" });
      }
      if (!courier || !["leopards", "postex"].includes(courier)) {
        return res.status(400).json({ message: "Valid courier required" });
      }

      const overridesMap = new Map<
        string,
        {
          weight?: number;
          mode?: string;
          customerName?: string;
          phone?: string;
          address?: string;
          city?: string;
          codAmount?: number;
          description?: string;
          pieces?: number;
        }
      >();
      if (orderOverrides && typeof orderOverrides === "object") {
        for (const [oid, ov] of Object.entries(orderOverrides)) {
          overridesMap.set(oid, ov as any);
        }
      }

      const creds = await getCourierCredentials(merchantId, courier);
      if (!creds) {
        return res
          .status(400)
          .json({
            message: `No ${courier} credentials configured. Go to Settings to add them.`,
          });
      }

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(400).json({ message: "Merchant not found" });
      }

      const courierAccount = (
        await storage.getCourierAccounts(merchantId)
      ).find((c) => c.courierName === courier);
      const courierSettings = courierAccount?.settings as Record<
        string,
        any
      > | null;

      let pickupAddressCode = courierSettings?.pickupAddressCode
        ? String(courierSettings.pickupAddressCode).trim()
        : "";
      let storeAddressCode = courierSettings?.storeAddressCode
        ? String(courierSettings.storeAddressCode).trim()
        : "";

      if (courier === "postex" && (!pickupAddressCode || !storeAddressCode)) {
        try {
          console.log(
            "[PostEx] Address codes missing/empty, auto-fetching from PostEx API...",
          );
          const addrResp = await fetch(
            "https://api.postex.pk/services/integration/api/order/v1/get-merchant-address",
            {
              headers: {
                "Content-Type": "application/json",
                token: creds.apiKey!,
              },
            },
          );
          const addrData = (await addrResp.json()) as any;
          if (
            addrData.statusCode === "200" &&
            Array.isArray(addrData.dist) &&
            addrData.dist.length > 0
          ) {
            for (const addr of addrData.dist) {
              const code = String(addr.addressCode).trim();
              if (addr.addressType === "Default Address" && !storeAddressCode) {
                storeAddressCode = code;
              }
              if (
                (addr.addressType === "Pickup/Return Address" ||
                  addr.addressType === "Pickup Address") &&
                !pickupAddressCode
              ) {
                pickupAddressCode = code;
              }
            }
            if (!pickupAddressCode)
              pickupAddressCode = String(addrData.dist[0].addressCode).trim();
            if (!storeAddressCode)
              storeAddressCode = String(addrData.dist[0].addressCode).trim();
            console.log(
              `[PostEx] Auto-resolved address codes: pickup="${pickupAddressCode}", store="${storeAddressCode}"`,
            );

            if (courierAccount) {
              const updatedSettings = {
                ...courierSettings,
                pickupAddressCode,
                storeAddressCode,
              };
              await storage.updateCourierAccount(courierAccount.id, {
                settings: updatedSettings,
              });
              console.log(
                "[PostEx] Persisted auto-fetched address codes to DB",
              );
            }
          } else {
            console.warn(
              "[PostEx] Could not auto-fetch addresses:",
              addrData.statusMessage || "No addresses returned",
            );
          }
        } catch (e) {
          console.error("[PostEx] Failed to auto-fetch address codes:", e);
        }
      }

      if (courier === "postex" && !pickupAddressCode) {
        return res.status(400).json({
          message:
            "Please sync pickup addresses from PostEx and select a valid pickup address code. Go to Integrations > PostEx and click 'Sync Addresses from PostEx'.",
        });
      }

      console.log(
        `[PostEx] Final address codes for booking: pickupAddressCode="${pickupAddressCode}" (type=${typeof pickupAddressCode})`,
      );

      const shipperInfo = {
        name: merchant.name || "ShipFlow Merchant",
        phone: merchant.phone || "",
        address: courierSettings?.shipperAddress || merchant.address || "",
        city: courierSettings?.shipperCity || merchant.city || "Lahore",
        shipperId: courierSettings?.shipperId || "2125655",
        pickupAddressCode,
        storeAddressCode,
      };

      const {
        validateOrderForBooking,
        orderToPacket,
        bookLeopardsBatch,
        bookPostExBulk,
        loadLeopardsCities,
        findLeopardsCity,
      } = await import("./services/couriers/booking");
      const { generateBatchLoadsheetPdf } = await import(
        "./services/pdfGenerator"
      );

      if (courier === "leopards") {
        const leopCities = await loadLeopardsCities(
          creds.apiKey!,
          creds.apiSecret!,
        );
        const originMatch = findLeopardsCity(shipperInfo.city, leopCities);
        if (!originMatch && !shipperInfo.shipperId) {
          return res.status(400).json({
            message: `Shipper city "${shipperInfo.city}" does not match any Leopards city and no Shipper ID is configured. Please go to Integrations > Leopards and set a valid Shipper City or Shipper ID.`,
          });
        } else if (!originMatch && shipperInfo.shipperId) {
          console.warn(
            `[Leopards] Shipper city "${shipperInfo.city}" does not match any Leopards city, but Shipper ID ${shipperInfo.shipperId} is set — Leopards will use registered origin.`,
          );
        } else if (originMatch) {
          console.log(
            `[Leopards] Shipper city "${shipperInfo.city}" matched to Leopards city: ${originMatch.name} (ID: ${originMatch.id})`,
          );
        }
      }

      const fetchedOrders = await storage.getOrdersByIds(merchantId, orderIds);
      const userId = getSessionUserId(req) || "system";
      const bookingActorName = await getSessionUserName(req);

      const batch = await storage.createShipmentBatch({
        merchantId,
        createdByUserId: userId,
        courierName: courier,
        batchType: orderIds.length > 1 ? "BULK" : "SINGLE",
        status: "CREATED",
        totalSelectedCount: orderIds.length,
        successCount: 0,
        failedCount: 0,
      });

      const results: Array<{
        orderId: string;
        orderNumber: string;
        success: boolean;
        trackingNumber?: string;
        slipUrl?: string;
        error?: string;
      }> = [];

      const toBook: typeof fetchedOrders = [];
      for (const order of fetchedOrders) {
        const existingJob = await storage.getBookingJob(
          merchantId,
          order.id,
          courier,
        );
        if (
          existingJob &&
          existingJob.status === "success" &&
          existingJob.trackingNumber &&
          order.courierTracking &&
          order.workflowStatus === "BOOKED"
        ) {
          results.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            success: true,
            trackingNumber: existingJob.trackingNumber,
            slipUrl: existingJob.slipUrl || undefined,
            error: "Already booked",
          });
          continue;
        }
        if (existingJob && existingJob.status === "processing") {
          const jobAgeMs = Date.now() - new Date(existingJob.createdAt).getTime();
          if (jobAgeMs < 5 * 60 * 1000) {
            results.push({
              orderId: order.id,
              orderNumber: order.orderNumber,
              success: false,
              error: "Booking in progress",
            });
            continue;
          }
        }

        const ovr = overridesMap.get(order.id);
        const orderForValidation = { ...order };
        if (ovr) {
          if (ovr.customerName)
            orderForValidation.customerName = ovr.customerName;
          if (ovr.phone) orderForValidation.customerPhone = ovr.phone;
          if (ovr.address) orderForValidation.shippingAddress = ovr.address;
          if (ovr.city) orderForValidation.city = ovr.city;
          if (ovr.codAmount !== undefined && ovr.codAmount > 0)
            orderForValidation.totalAmount = String(ovr.codAmount);
        }
        const missing = validateOrderForBooking(orderForValidation);
        if (missing.length > 0) {
          results.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            success: false,
            error: `Missing: ${missing.join(", ")}`,
          });
          continue;
        }

        toBook.push(order);
      }

      if (toBook.length === 0) {
        return res.json({
          successCount: results.filter((r) => r.success).length,
          failedCount: results.filter((r) => !r.success).length,
          results,
        });
      }

      const jobMap = new Map<string, string>();
      await Promise.all(toBook.map(async (order) => {
        const job = await storage.createBookingJob({
          merchantId,
          orderId: order.id,
          courierName: courier,
          status: "processing",
        });
        jobMap.set(order.id, job.id);
      }));

      const packets = toBook.map((order) => {
        const pkt = orderToPacket(order);
        const ovr = overridesMap.get(order.id);
        if (ovr) {
          if (ovr.weight) pkt.weight = ovr.weight;
          if (ovr.mode) pkt.mode = ovr.mode;
          if (ovr.customerName) pkt.customerName = ovr.customerName;
          if (ovr.phone) pkt.customerPhone = ovr.phone;
          if (ovr.address) pkt.shippingAddress = ovr.address;
          if (ovr.city) pkt.city = ovr.city;
          if (ovr.codAmount !== undefined) pkt.codAmount = ovr.codAmount;
          if (ovr.description) pkt.itemSummary = ovr.description;
          if (ovr.pieces !== undefined && ovr.pieces > 0) pkt.pieces = ovr.pieces;
        }
        return pkt;
      });

      let bookingResults: Array<{
        orderId: string;
        orderNumber: string;
        success: boolean;
        trackingNumber?: string;
        slipUrl?: string;
        error?: string;
        rawResponse?: any;
      }>;

      if (courier === "leopards") {
        bookingResults = await bookLeopardsBatch(
          packets,
          {
            apiKey: creds.apiKey!,
            apiPassword: creds.apiSecret!,
          },
          shipperInfo,
        );
      } else {
        bookingResults = await bookPostExBulk(
          packets,
          creds.apiKey!,
          shipperInfo,
        );
      }

      await Promise.all(bookingResults.map(async (br) => {
        const jobId = jobMap.get(br.orderId);
        if (jobId) {
          await storage.updateBookingJob(jobId, {
            status: br.success ? "success" : "failed",
            trackingNumber: br.trackingNumber || null,
            slipUrl: br.slipUrl || null,
            rawResponse: br.rawResponse || null,
            errorMessage: br.error || null,
          });
        }

        if (br.success && br.trackingNumber) {
          await storage.updateOrder(merchantId, br.orderId, {
            courierName: courier === "leopards" ? "Leopards" : "PostEx",
            courierTracking: br.trackingNumber,
            courierSlipUrl: br.slipUrl || null,
            bookingStatus: "BOOKED",
            bookingError: null,
            bookedAt: new Date(),
            shipmentStatus: "BOOKED",
          });

          await transitionOrder({
            merchantId,
            orderId: br.orderId,
            toStatus: "BOOKED",
            action: "courier_booked",
            actorUserId: userId,
            actorName: bookingActorName,
            actorType: "user",
            reason: `Booked with ${courier === "leopards" ? "Leopards" : "PostEx"} - ${br.trackingNumber}`,
          });

          const orderForFulfill = fetchedOrders.find(
            (o) => o.id === br.orderId,
          );
          if (orderForFulfill?.shopifyOrderId) {
            const courierDisplayName =
              courier === "leopards" ? "Leopards Courier" : "PostEx";
            writeBackFulfillment(
              merchantId,
              br.orderId,
              orderForFulfill.shopifyOrderId,
              br.trackingNumber!,
              courierDisplayName,
            ).then((fulfillResult) => {
              if (fulfillResult.success) {
                console.log(
                  `[Booking] Shopify fulfillment write-back succeeded for ${orderForFulfill.orderNumber}: ${fulfillResult.fulfillmentId || 'already fulfilled'}`,
                );
              } else {
                console.error(
                  `[Booking] Shopify fulfillment write-back FAILED for ${orderForFulfill.orderNumber}: ${fulfillResult.error}`,
                );
              }
            }).catch((err: any) => {
              console.error(
                `[Booking] Shopify fulfillment write-back error for ${orderForFulfill.orderNumber}:`,
                err.message,
              );
            });
          }
        } else {
          await storage.updateOrder(merchantId, br.orderId, {
            bookingStatus: "FAILED",
            bookingError: br.error || "Booking failed",
          });
        }

        results.push({
          orderId: br.orderId,
          orderNumber: br.orderNumber,
          success: br.success,
          trackingNumber: br.trackingNumber,
          slipUrl: br.slipUrl,
          error: br.error,
        });
      }));

      const successCount = results.filter((r) => r.success).length;
      const failedCount = results.filter((r) => !r.success).length;

      const batchStatus =
        failedCount === 0
          ? "SUCCESS"
          : successCount === 0
            ? "FAILED"
            : "PARTIAL_SUCCESS";
      await storage.updateShipmentBatch(batch.id, {
        successCount,
        failedCount,
        status: batchStatus,
      });

      await Promise.all(results.map((r) =>
        storage.createShipmentBatchItem({
          batchId: batch.id,
          orderId: r.orderId,
          orderNumber: r.orderNumber,
          bookingStatus: r.success ? "BOOKED" : "FAILED",
          bookingError: r.error || null,
          trackingNumber: r.trackingNumber || null,
          slipUrl: r.slipUrl || null,
          consigneeName:
            fetchedOrders.find((o) => o.id === r.orderId)?.customerName || null,
          consigneePhone:
            fetchedOrders.find((o) => o.id === r.orderId)?.customerPhone ||
            null,
          consigneeCity:
            fetchedOrders.find((o) => o.id === r.orderId)?.city || null,
          codAmount:
            (fetchedOrders.find((o) => o.id === r.orderId)?.codRemaining ??
              fetchedOrders.find((o) => o.id === r.orderId)?.totalAmount) ||
            null,
        })
      ));

      console.log(
        `[Booking] ${courier}: ${successCount} success, ${failedCount} failed out of ${results.length}, batch=${batch.id}`,
      );

      res.json({ successCount, failedCount, results, batchId: batch.id });

      const bgResults = [...results];
      const bgFetchedOrders = [...fetchedOrders];
      (async () => {
        try {
          await Promise.all(bgResults.filter((r) => r.success && r.trackingNumber).map(async (r) => {
            const order = bgFetchedOrders.find((o) => o.id === r.orderId);
            if (!order) return;

            const shipmentsList = await storage.getShipmentsByOrderId(
              merchantId,
              order.id,
            );
            const shipment = shipmentsList.find(
              (s) => s.trackingNumber === r.trackingNumber,
            );

            await storage.createShipmentPrintRecord({
              merchantId,
              shipmentId: shipment?.id || null,
              orderId: order.id,
              courierName: courier,
              trackingNumber: r.trackingNumber!,
              generatedByUserId: userId,
              pdfPath: null,
              source: "COURIER_NATIVE",
              isLatest: true,
            });
          }));

          const batchLoadsheetPath = await generateBatchLoadsheetPdf({
            batchId: batch.id,
            courierName: courier === "leopards" ? "Leopards" : "PostEx",
            createdBy: userId,
            createdAt: new Date().toLocaleDateString(),
            merchantName: merchant.name,
            totalCount: bgResults.length,
            successCount,
            failedCount,
            items: bgResults.map((r) => {
              const order = bgFetchedOrders.find((o) => o.id === r.orderId);
              return {
                orderNumber: r.orderNumber,
                trackingNumber: r.trackingNumber || "",
                consigneeName: order?.customerName || "",
                consigneeCity: order?.city || "",
                consigneePhone: order?.customerPhone || "",
                codAmount: Number(order?.totalAmount) || 0,
                status: r.success ? "BOOKED" : "FAILED",
                error: r.error,
              };
            }),
          });

          await storage.updateShipmentBatch(batch.id, {
            pdfBatchPath: batchLoadsheetPath,
          });
        } catch (pdfErr) {
          console.error("[Booking] Background PDF/print record error:", pdfErr);
        }
      })();
    } catch (error) {
      console.error("Error booking orders:", error);
      res.status(500).json({ message: "Failed to book orders" });
    }
  });

  // ============================================
  // SHIPMENT BATCHES & PRINT ROUTES
  // ============================================

  app.get("/api/shipment-batches", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const courier = req.query.courier as string;

      const result = await storage.getShipmentBatches(merchantId, {
        page,
        pageSize,
        courier,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching batches:", error);
      res.status(500).json({ message: "Failed to fetch batches" });
    }
  });

  app.get("/api/shipment-batches/:id", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const batch = await storage.getShipmentBatchById(
        merchantId,
        req.params.id,
      );
      if (!batch) {
        return res.status(404).json({ message: "Batch not found" });
      }

      const items = await storage.getShipmentBatchItems(batch.id);

      const bookedOrderIds = items
        .filter((item) => item.orderId && item.bookingStatus === "BOOKED")
        .map((item) => item.orderId);

      let printRecordMap: Record<string, string> = {};
      if (bookedOrderIds.length > 0) {
        const printRecords = await db
          .select({
            id: shipmentPrintRecords.id,
            orderId: shipmentPrintRecords.orderId,
          })
          .from(shipmentPrintRecords)
          .where(
            and(
              eq(shipmentPrintRecords.merchantId, merchantId),
              inArray(shipmentPrintRecords.orderId, bookedOrderIds),
              eq(shipmentPrintRecords.isLatest, true),
            ),
          );
        for (const pr of printRecords) {
          if (pr.orderId) printRecordMap[pr.orderId] = pr.id;
        }
      }

      const itemsWithPrint = items.map((item) => ({
        ...item,
        printRecordId: (item.orderId && printRecordMap[item.orderId]) || null,
      }));

      res.json({ batch, items: itemsWithPrint });
    } catch (error) {
      console.error("Error fetching batch details:", error);
      res.status(500).json({ message: "Failed to fetch batch details" });
    }
  });

  app.get("/api/print/batch/:id.pdf", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const batch = await storage.getShipmentBatchById(
        merchantId,
        req.params.id,
      );
      if (!batch || !batch.pdfBatchPath) {
        return res.status(404).json({ message: "Batch PDF not found" });
      }

      const { getPdfPath } = await import("./services/pdfGenerator");
      const pdfPath = getPdfPath(batch.pdfBatchPath);
      if (!pdfPath) {
        return res.status(404).json({ message: "PDF file not found on disk" });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="batch_${batch.id.substring(0, 8)}.pdf"`,
      );
      const fs = await import("fs");
      fs.createReadStream(pdfPath).pipe(res);
    } catch (error) {
      console.error("Error serving batch PDF:", error);
      res.status(500).json({ message: "Failed to serve PDF" });
    }
  });

  app.get("/api/print/shipment/:id.pdf", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const printRecord = await storage.getShipmentPrintRecordById(
        merchantId,
        req.params.id,
      );
      if (!printRecord || !printRecord.pdfPath) {
        return res.status(404).json({ message: "Print record not found" });
      }

      const { getPdfPath } = await import("./services/pdfGenerator");
      const pdfPath = getPdfPath(printRecord.pdfPath);
      if (!pdfPath) {
        return res.status(404).json({ message: "PDF file not found on disk" });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="awb_${printRecord.trackingNumber}.pdf"`,
      );
      const fs = await import("fs");
      fs.createReadStream(pdfPath).pipe(res);
    } catch (error) {
      console.error("Error serving shipment PDF:", error);
      res.status(500).json({ message: "Failed to serve PDF" });
    }
  });

  app.get("/api/print/order/:orderId", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const order = await storage.getOrderById(merchantId, req.params.orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const shipmentsList = await storage.getShipmentsByOrderId(
        merchantId,
        order.id,
      );
      const printRecords: any[] = [];
      for (const s of shipmentsList) {
        const record = await storage.getShipmentPrintRecord(merchantId, s.id);
        if (record) {
          printRecords.push({ ...record, shipment: s });
        }
      }

      res.json({
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          courierName: order.courierName,
          courierTracking: order.courierTracking,
        },
        shipments: shipmentsList,
        printRecords,
      });
    } catch (error) {
      console.error("Error fetching print info:", error);
      res.status(500).json({ message: "Failed to fetch print info" });
    }
  });

  app.post("/api/labels/data", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { orderIds } = req.body;
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ message: "orderIds array required" });
      }

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      const courierAcctList = await storage.getCourierAccounts(merchantId);
      const leopardsCreds = courierAcctList.find((c) => c.courierName === "leopards");
      const postexCreds = courierAcctList.find((c) => c.courierName === "postex");
      const leopardsSettings = (leopardsCreds?.settings || {}) as any;
      const postexSettings = (postexCreds?.settings || {}) as any;

      const labels: any[] = [];
      for (const orderId of orderIds.slice(0, 100)) {
        const order = await storage.getOrderById(merchantId, orderId);
        if (!order) continue;

        const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
        const products = lineItems.map((item: any) => ({
          name: item.name || item.title || "Item",
          qty: item.quantity || 1,
          sku: item.sku || "",
          variant: item.variantTitle || item.variant_title || "",
        }));

        const codAmount = Number(order.codRemaining ?? order.totalAmount) || 0;
        const isCOD = order.paymentMethod?.toLowerCase()?.includes("cod") ||
                      order.paymentStatus?.toLowerCase() === "pending" ||
                      codAmount > 0;

        labels.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          trackingNumber: order.courierTracking || "",
          courierName: order.courierName || "",
          customerName: order.customerName || "",
          customerPhone: order.customerPhone || "",
          customerEmail: order.customerEmail || "",
          shippingAddress: order.shippingAddress || "",
          city: order.city || "",
          province: order.province || "",
          postalCode: order.postalCode || "",
          country: order.country || "Pakistan",
          totalAmount: Number(order.totalAmount) || 0,
          codAmount,
          isCOD,
          totalQuantity: order.totalQuantity || 1,
          weight: Number(order.weight) || 0,
          pieces: 1,
          itemSummary: order.itemSummary || "",
          remark: [order.remark || order.notes, "Allow Open Parcel - Must Call Before Delivery - Handle With Care"].filter(Boolean).join(" - "),
          products,
          orderDate: order.orderDate,
          bookedAt: order.bookedAt,
          slipUrl: order.courierSlipUrl || "",
          shipper: {
            name: merchant.name || "",
            phone: merchant.phone || "",
            address: leopardsSettings?.shipperAddress || postexSettings?.shipperAddress || merchant.address || "",
            city: leopardsSettings?.shipperCity || postexSettings?.shipperCity || merchant.city || "",
            logoUrl: merchant.logoUrl || "",
          },
        });
      }

      res.json({ labels });
    } catch (error) {
      console.error("Error fetching label data:", error);
      res.status(500).json({ message: "Failed to fetch label data" });
    }
  });

  app.get("/api/couriers/postex/invoice", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const trackingNumber = String(req.query.trackingNumber || "").trim();
      if (!trackingNumber) {
        return res
          .status(400)
          .json({ message: "Missing trackingNumber query parameter" });
      }

      console.log(
        `[PostEx Invoice Route] Single invoice request: merchantId=${merchantId}, tracking=${trackingNumber}`,
      );

      const { generatePostExCustomSlip } = await import("./services/courierSlips");
      const order = await storage.getOrderByTracking(merchantId, trackingNumber);
      if (!order) {
        return res.status(404).json({ message: "Order not found for this tracking number" });
      }
      const merchant = await storage.getMerchant(merchantId);
      const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
      const itemsSummary = order.itemSummary || lineItems.map((li: any) => `${li.title || li.name || "Item"} x${li.quantity || 1}`).join(", ");
      const pdfBuffer = await generatePostExCustomSlip([{
        trackingNumber,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone || "",
        city: order.city || "",
        shippingAddress: order.shippingAddress || "",
        codAmount: parseFloat(String(order.totalAmount)) || 0,
        merchantName: merchant?.name || "",
        merchantAddress: merchant?.address || "",
        itemsSummary,
        totalQuantity: order.totalQuantity || 1,
        remarks: order.notes || "",
        bookedAt: order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB"),
      }]);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="postex-invoice-${trackingNumber}.pdf"`,
      );
      res.send(pdfBuffer);
    } catch (error) {
      console.error("[PostEx Invoice Route] Error:", error);
      res.status(500).json({ message: "Failed to fetch PostEx invoice" });
    }
  });

  app.post(
    "/api/couriers/postex/invoices",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const rawTrackingNumbers: string[] = req.body?.trackingNumbers;
        if (
          !Array.isArray(rawTrackingNumbers) ||
          rawTrackingNumbers.length === 0
        ) {
          return res
            .status(400)
            .json({
              message: "Missing or empty trackingNumbers array in request body",
            });
        }

        const trackingNumbers = rawTrackingNumbers
          .map((t) => String(t).trim())
          .filter(Boolean);
        if (trackingNumbers.length === 0) {
          return res
            .status(400)
            .json({ message: "No valid tracking numbers provided" });
        }

        console.log(
          `[PostEx Invoice Route] Bulk invoice request: merchantId=${merchantId}, count=${trackingNumbers.length}`,
        );

        const { generatePostExCustomSlip } = await import("./services/courierSlips");
        const merchant = await storage.getMerchant(merchantId);
        const postExContexts: Array<import("./services/courierSlips").PostExOrderContext> = [];
        const failedTrackingNumbers: string[] = [];

        for (const tn of trackingNumbers) {
          const order = await storage.getOrderByTracking(merchantId, tn);
          if (!order) {
            failedTrackingNumbers.push(tn);
            continue;
          }
          const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
          const itemsSummary = order.itemSummary || lineItems.map((li: any) => `${li.title || li.name || "Item"} x${li.quantity || 1}`).join(", ");
          postExContexts.push({
            trackingNumber: tn,
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            customerPhone: order.customerPhone || "",
            city: order.city || "",
            shippingAddress: order.shippingAddress || "",
            codAmount: parseFloat(String(order.totalAmount)) || 0,
            merchantName: merchant?.name || "",
            merchantAddress: merchant?.address || "",
            itemsSummary,
            totalQuantity: order.totalQuantity || 1,
            remarks: order.notes || "",
            bookedAt: order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB"),
          });
        }

        if (postExContexts.length === 0) {
          return res.status(404).json({
            message: "No orders found for the provided tracking numbers",
            failedTrackingNumbers,
          });
        }

        if (failedTrackingNumbers.length > 0) {
          res.setHeader("X-Partial-Failure", "true");
          res.setHeader(
            "X-Failed-Tracking-Numbers",
            failedTrackingNumbers.join(","),
          );
        }

        const pdfBuffer = await generatePostExCustomSlip(postExContexts);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="postex-invoices-bulk.pdf"`,
        );
        res.send(pdfBuffer);
      } catch (error) {
        console.error("[PostEx Invoice Route] Bulk error:", error);
        res.status(500).json({ message: "Failed to fetch PostEx invoices" });
      }
    },
  );

  app.get(
    "/api/print/native-slip/:orderId.pdf",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const order = await storage.getOrderById(
          merchantId,
          req.params.orderId,
        );
        if (!order || !order.courierTracking) {
          return res
            .status(404)
            .json({ message: "Order not found or not booked" });
        }

        const { fetchLeopardsSlip, fetchPostExSlip } = await import(
          "./services/courierSlips"
        );
        const courierNorm = normalizeCourierName(order.courierName || "");

        const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
        const orderItemsSummary = order.itemSummary || lineItems.map((li: any) => `${li.title || li.name || "Item"} x${li.quantity || 1}`).join(", ");

        let result;
        if (courierNorm === "leopards") {
          const creds = await getCourierCredentials(merchantId, "leopards");
          if (creds?.apiKey && creds?.apiSecret && order.courierTracking) {
            result = await fetchLeopardsSlip(order.courierSlipUrl || "", {
              apiKey: creds.apiKey,
              apiPassword: creds.apiSecret,
              trackingNumber: order.courierTracking,
            }, { itemsSummary: orderItemsSummary, quantity: order.totalQuantity || 1 });
          } else if (order.courierSlipUrl) {
            result = await fetchLeopardsSlip(order.courierSlipUrl, undefined, { itemsSummary: orderItemsSummary, quantity: order.totalQuantity || 1 });
          } else {
            return res
              .status(404)
              .json({
                message:
                  "No Leopards slip URL or credentials available for this order",
              });
          }
        } else if (courierNorm === "postex") {
          const { generatePostExCustomSlip } = await import("./services/courierSlips");
          const merchant = await storage.getMerchant(merchantId);
          const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
          const itemsSummary = order.itemSummary || lineItems.map((li: any) => `${li.title || li.name || "Item"} x${li.quantity || 1}`).join(", ");
          const pdfBuffer = await generatePostExCustomSlip([{
            trackingNumber: order.courierTracking!,
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            customerPhone: order.customerPhone || "",
            city: order.city || "",
            shippingAddress: order.shippingAddress || "",
            codAmount: parseFloat(String(order.totalAmount)) || 0,
            merchantName: merchant?.name || "",
            merchantAddress: merchant?.address || "",
            itemsSummary,
            totalQuantity: order.totalQuantity || 1,
            remarks: order.notes || "",
            bookedAt: order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB"),
          }]);
          result = { success: true, pdfBuffer };
        } else {
          return res
            .status(400)
            .json({
              message: `Native slips not supported for courier: ${order.courierName}`,
            });
        }

        if (!result.success || !result.pdfBuffer) {
          return res
            .status(502)
            .json({
              message: result.error || "Failed to fetch courier airway bill",
            });
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="awb_${order.orderNumber}_${order.courierTracking}.pdf"`,
        );
        res.send(result.pdfBuffer);
      } catch (error) {
        console.error("Error fetching native slip:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch courier airway bill" });
      }
    },
  );

  app.get(
    "/api/print/batch-awb/:batchId.pdf",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const batch = await storage.getShipmentBatchById(
          merchantId,
          req.params.batchId,
        );
        if (!batch) {
          return res.status(404).json({ message: "Batch not found" });
        }

        const items = await storage.getShipmentBatchItems(batch.id);
        const bookedItems = items.filter(
          (item) => item.bookingStatus === "BOOKED" && item.trackingNumber,
        );

        if (bookedItems.length === 0) {
          return res
            .status(404)
            .json({ message: "No booked items in this batch" });
        }

        const courierNorm = normalizeCourierName(batch.courierName || "");

        if (courierNorm === "postex") {
          const { generatePostExCustomSlip } = await import("./services/courierSlips");
          const merchant = await storage.getMerchant(merchantId);
          const postExContexts: Array<import("./services/courierSlips").PostExOrderContext> = [];
          for (const item of bookedItems) {
            const order = await storage.getOrderById(merchantId, item.orderId);
            if (!order) continue;
            const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
            const itemsSummary = order.itemSummary || lineItems.map((li: any) => `${li.title || li.name || "Item"} x${li.quantity || 1}`).join(", ");
            postExContexts.push({
              trackingNumber: item.trackingNumber || order.courierTracking || "",
              orderNumber: item.orderNumber || order.orderNumber,
              customerName: item.consigneeName || order.customerName,
              customerPhone: item.consigneePhone || order.customerPhone || "",
              city: item.consigneeCity || order.city || "",
              shippingAddress: order.shippingAddress || "",
              codAmount: parseFloat(String(item.codAmount || order.totalAmount)) || 0,
              merchantName: merchant?.name || "",
              merchantAddress: merchant?.address || "",
              itemsSummary,
              totalQuantity: order.totalQuantity || 1,
              remarks: order.notes || "",
              bookedAt: order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB"),
            });
          }
          if (postExContexts.length === 0) {
            return res.status(404).json({ message: "No valid PostEx orders found in batch" });
          }
          const pdfBuffer = await generatePostExCustomSlip(postExContexts);
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `inline; filename="batch_awb_${batch.id.substring(0, 8)}.pdf"`,
          );
          return res.send(pdfBuffer);
        }

        const errors: string[] = [];

        if (courierNorm === "leopards") {
          const { fetchLeopardsSlipData, fetchLeopardsSlip, combinePdfs } = await import("./services/courierSlips");
          const { generateAirwayBillPdfBuffer } = await import("./services/pdfGenerator");
          const leopardsCreds = await getCourierCredentials(merchantId, "leopards");

          const allBills: import("./services/pdfGenerator").AirwayBillData[] = [];
          const fallbackPdfBuffers: Buffer[] = [];

          for (const item of bookedItems) {
            const trackingNum = item.trackingNumber;
            const slipUrl = item.slipUrl;
            const order = await storage.getOrderById(merchantId, item.orderId);
            const bulkLineItems = Array.isArray(order?.lineItems) ? order.lineItems : [];
            const bulkItemsSummary = order?.itemSummary || bulkLineItems.map((li: any) => `${li.title || li.name || "Item"} x${li.quantity || 1}`).join(", ");
            const bulkOrderCtx = { itemsSummary: bulkItemsSummary, quantity: order?.totalQuantity || 1 };

            if (leopardsCreds?.apiKey && leopardsCreds?.apiSecret && trackingNum) {
              const dataResult = await fetchLeopardsSlipData("", {
                apiKey: leopardsCreds.apiKey,
                apiPassword: leopardsCreds.apiSecret,
                trackingNumber: trackingNum,
              }, bulkOrderCtx);
              if (dataResult.success && dataResult.bills) {
                allBills.push(...dataResult.bills);
                continue;
              }
            }

            const fallbackSlipUrl = slipUrl || order?.courierSlipUrl || "";
            if (fallbackSlipUrl || (leopardsCreds?.apiKey && trackingNum)) {
              const result = await fetchLeopardsSlip(
                fallbackSlipUrl,
                leopardsCreds?.apiKey && leopardsCreds?.apiSecret && trackingNum
                  ? { apiKey: leopardsCreds.apiKey, apiPassword: leopardsCreds.apiSecret, trackingNumber: trackingNum }
                  : undefined,
                bulkOrderCtx,
              );
              if (result?.success && result.pdfBuffer) {
                fallbackPdfBuffers.push(result.pdfBuffer);
              } else {
                errors.push(`${item.orderNumber}: ${result?.error || "Failed"}`);
              }
            } else {
              errors.push(`${item.orderNumber}: No slip URL or credentials`);
            }
          }

          if (allBills.length === 0 && fallbackPdfBuffers.length === 0) {
            return res.status(502).json({
              message: "Could not fetch any courier airway bills",
              errors,
            });
          }

          if (errors.length > 0) {
            console.warn(`[BatchAWB] ${errors.length} items failed:`, errors);
          }

          let finalPdf: Buffer;
          if (allBills.length > 0 && fallbackPdfBuffers.length === 0) {
            console.log(`[BatchAWB] Total invoices: ${allBills.length}`);
            finalPdf = await generateAirwayBillPdfBuffer(allBills);
          } else if (allBills.length === 0 && fallbackPdfBuffers.length > 0) {
            finalPdf = await combinePdfs(fallbackPdfBuffers);
          } else {
            const billsPdf = await generateAirwayBillPdfBuffer(allBills);
            finalPdf = await combinePdfs([billsPdf, ...fallbackPdfBuffers]);
          }

          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `inline; filename="batch_awb_${batch.id.substring(0, 8)}.pdf"`,
          );
          return res.send(finalPdf);
        }

        errors.push("Unsupported courier for batch AWB");
        return res.status(502).json({
          message: "Could not fetch any courier airway bills",
          errors,
        });
      } catch (error) {
        console.error("Error fetching batch AWB:", error);
        res.status(500).json({ message: "Failed to fetch batch airway bills" });
      }
    },
  );

  app.post(
    "/api/print/regenerate/:orderId",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const order = await storage.getOrderById(
          merchantId,
          req.params.orderId,
        );
        if (!order || !order.courierTracking) {
          return res
            .status(400)
            .json({ message: "Order not found or not booked" });
        }

        const merchant = await storage.getMerchant(merchantId);
        if (!merchant)
          return res.status(400).json({ message: "Merchant not found" });

        const userId = getSessionUserId(req) || "system";

        const shipmentsList = await storage.getShipmentsByOrderId(
          merchantId,
          order.id,
        );
        const shipment = shipmentsList.find(
          (s) => s.trackingNumber === order.courierTracking,
        );

        const printRecord = await storage.createShipmentPrintRecord({
          merchantId,
          shipmentId: shipment?.id || null,
          orderId: order.id,
          courierName: order.courierName || "unknown",
          trackingNumber: order.courierTracking,
          generatedByUserId: userId,
          pdfPath: null,
          source: "COURIER_NATIVE",
          isLatest: true,
        });

        res.json({ success: true, printRecordId: printRecord.id });
      } catch (error) {
        console.error("Error regenerating PDF:", error);
        res.status(500).json({ message: "Failed to regenerate PDF" });
      }
    },
  );

  // ============================================
  // LOADSHEET GENERATION (from Booked tab)
  // ============================================
  app.post(
    "/api/orders/generate-loadsheet",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const { orderIds } = req.body;
        if (!Array.isArray(orderIds) || orderIds.length === 0) {
          return res.status(400).json({ message: "No order IDs provided" });
        }

        const merchant = await storage.getMerchant(merchantId);
        if (!merchant)
          return res.status(400).json({ message: "Merchant not found" });

        const userId = getSessionUserId(req) || "system";
        const fetchedOrders = await storage.getOrdersByIds(
          merchantId,
          orderIds,
        );

        if (fetchedOrders.length === 0) {
          return res.status(400).json({ message: "No orders found" });
        }

        const bookedOrders = fetchedOrders.filter(
          (o) =>
            o.courierTracking &&
            (o.workflowStatus === "BOOKED" ||
              o.workflowStatus === "FULFILLED" ||
              o.workflowStatus === "DELIVERED" ||
              o.workflowStatus === "RETURN"),
        );

        if (bookedOrders.length === 0) {
          return res
            .status(400)
            .json({
              message:
                "No booked orders with tracking numbers found in selection",
            });
        }

        const batchId = crypto.randomUUID();
        const courierNames = [
          ...new Set(bookedOrders.map((o) => o.courierName || "Unknown")),
        ];
        const courierLabel =
          courierNames.length === 1 ? courierNames[0] : "Mixed";

        const batch = await storage.createShipmentBatch({
          merchantId,
          createdByUserId: userId,
          courierName: courierLabel,
          batchType: "LOADSHEET",
          status: "COMPLETED",
          totalSelectedCount: bookedOrders.length,
          successCount: bookedOrders.length,
          failedCount: 0,
          notes: `Loadsheet generated for ${bookedOrders.length} order(s)`,
        });

        const loadsheetItems: Array<{
          orderNumber: string;
          trackingNumber: string;
          consigneeName: string;
          consigneeCity: string;
          consigneePhone: string;
          codAmount: number;
          status: string;
        }> = [];

        for (const order of bookedOrders) {
          const itemData = {
            orderNumber: order.orderNumber || "N/A",
            trackingNumber: order.courierTracking || "N/A",
            consigneeName: order.customerName || "N/A",
            consigneeCity: order.city || "N/A",
            consigneePhone: order.customerPhone || "N/A",
            codAmount: Number(order.totalAmount || 0),
            status: "BOOKED",
          };
          loadsheetItems.push(itemData);

          await storage.createShipmentBatchItem({
            batchId: batch.id,
            orderId: order.id,
            orderNumber: order.orderNumber,
            bookingStatus: "SUCCESS",
            trackingNumber: order.courierTracking,
            consigneeName: order.customerName,
            consigneePhone: order.customerPhone,
            consigneeCity: order.city,
            codAmount: order.totalAmount,
          });

          const existingShipments = await storage.getShipmentsByOrderId(
            merchantId,
            order.id,
          );
          const matchingShipment = existingShipments.find(
            (s) => s.trackingNumber === order.courierTracking,
          );

          const loadsheetRecord = {
            batchId: batch.id,
            generatedAt: new Date().toISOString(),
            generatedBy: userId,
            orderNumber: order.orderNumber,
            trackingNumber: order.courierTracking,
            courierName: order.courierName,
            customerName: order.customerName,
            city: order.city,
            codAmount: Number(order.totalAmount || 0),
          };

          if (matchingShipment) {
            await storage.updateShipment(merchantId, matchingShipment.id, {
              loadsheetBatchId: batch.id,
              loadsheetGeneratedAt: new Date(),
              loadsheetData: loadsheetRecord,
            } as any);
          } else {
            await storage.createShipment({
              orderId: order.id,
              merchantId,
              courierName: order.courierName || "Unknown",
              trackingNumber: order.courierTracking,
              status: order.shipmentStatus || "booked",
              codAmount: order.totalAmount,
              loadsheetBatchId: batch.id,
              loadsheetGeneratedAt: new Date(),
              loadsheetData: loadsheetRecord,
            } as any);
          }
        }

        const { generateBatchLoadsheetPdf } = await import(
          "./services/pdfGenerator"
        );
        const pdfPath = await generateBatchLoadsheetPdf({
          batchId: batch.id,
          courierName: courierLabel,
          createdBy: userId,
          createdAt: new Date().toISOString(),
          merchantName:
            merchant.businessName || merchant.displayName || "Merchant",
          totalCount: bookedOrders.length,
          successCount: bookedOrders.length,
          failedCount: 0,
          items: loadsheetItems,
        });

        await storage.updateShipmentBatch(batch.id, {
          pdfBatchPath: pdfPath,
        });

        const bookedOnlyOrders = bookedOrders.filter(o => o.workflowStatus === "BOOKED");
        let transitioned = 0;
        let transitionSkipped = 0;

        if (bookedOnlyOrders.length > 0) {
          const bookedIds = bookedOnlyOrders.map(o => o.id);
          const now = new Date();
          const result = await bulkTransitionOrders({
            merchantId,
            orderIds: bookedIds,
            toStatus: "FULFILLED",
            action: "loadsheet_generation",
            actorUserId: userId,
            actorName: "Loadsheet Generator",
            actorType: "system",
            reason: `Loadsheet generated (batch: ${batch.id})`,
            extraData: {
              loadsheetBatchId: batch.id,
              loadsheetGeneratedAt: now,
              fulfilledAt: now,
              fulfilledBy: userId,
            } as any,
          });
          transitioned = result.updated;
          transitionSkipped = result.skipped;
          console.log(`[Loadsheet] Transitioned ${transitioned} orders BOOKED→FULFILLED, skipped ${transitionSkipped}`);
        }

        res.json({
          success: true,
          batchId: batch.id,
          pdfUrl: `/api/print/batch/${batch.id}.pdf`,
          totalOrders: bookedOrders.length,
          courierName: courierLabel,
          transitioned,
          transitionSkipped,
        });
      } catch (error) {
        console.error("Error generating loadsheet:", error);
        res.status(500).json({ message: "Failed to generate loadsheet" });
      }
    },
  );

  // ============================================
  // ONBOARDING ROUTES
  // ============================================
  const ONBOARDING_ORDER = [
    "ACCOUNT_CREATED",
    "SHOPIFY_CONNECTED",
    "ORDERS_SYNCED",
    "LEOPARDS_CONNECTED",
    "POSTEX_CONNECTED",
    "COMPLETED",
  ];

  // ============================================
  // COURIER STATUS MAPPINGS
  // ============================================

  app.get(
    "/api/courier-status-mappings",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const courierName = req.query.courier as string | undefined;
        const mappings = await storage.getCourierStatusMappings(
          merchantId,
          courierName,
        );

        if (mappings.length === 0) {
          const seeded = await storage.seedDefaultMappings(merchantId);
          const freshMappings = await storage.getCourierStatusMappings(
            merchantId,
            courierName,
          );
          return res.json({ mappings: freshMappings, seeded: true, ...seeded });
        }

        res.json({ mappings });
      } catch (error) {
        console.error("Error fetching courier status mappings:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch courier status mappings" });
      }
    },
  );

  app.post(
    "/api/courier-status-mappings",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const schema = z.object({
          courierName: z.string().min(1),
          courierStatus: z.string().min(1),
          normalizedStatus: z.string().min(1),
          workflowStage: z.string().optional(),
        });

        const parsed = schema.parse(req.body);
        const courierStatusKey = parsed.courierStatus.toLowerCase().trim();
        const mapping = await storage.upsertCourierStatusMapping({
          merchantId,
          courierName: parsed.courierName,
          courierStatus: courierStatusKey,
          normalizedStatus: parsed.normalizedStatus,
          workflowStage: parsed.workflowStage || null,
          isCustom: true,
        });

        const unmapped = await storage.getUnmappedStatuses(merchantId, false);
        for (const u of unmapped) {
          if (
            u.courierName === parsed.courierName &&
            u.rawStatus === courierStatusKey
          ) {
            await storage.resolveUnmappedStatus(merchantId, u.id);
          }
        }

        res.json({ mapping });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid mapping data", errors: error.errors });
        }
        console.error("Error creating courier status mapping:", error);
        res
          .status(500)
          .json({ message: "Failed to create courier status mapping" });
      }
    },
  );

  app.put(
    "/api/courier-status-mappings/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const schema = z.object({
          normalizedStatus: z.string().optional(),
          workflowStage: z.string().optional(),
        });

        const parsed = schema.parse(req.body);
        const existing = await storage.getCourierStatusMappings(merchantId);
        const target = existing.find((m) => m.id === req.params.id);
        if (!target)
          return res.status(404).json({ message: "Mapping not found" });

        const mapping = await storage.upsertCourierStatusMapping({
          merchantId,
          courierName: target.courierName,
          courierStatus: target.courierStatus,
          normalizedStatus: parsed.normalizedStatus || target.normalizedStatus,
          workflowStage:
            parsed.workflowStage !== undefined
              ? parsed.workflowStage || null
              : target.workflowStage,
          isCustom: true,
        });

        res.json({ mapping });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid mapping data", errors: error.errors });
        }
        console.error("Error updating courier status mapping:", error);
        res
          .status(500)
          .json({ message: "Failed to update courier status mapping" });
      }
    },
  );

  app.delete(
    "/api/courier-status-mappings/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        await storage.deleteCourierStatusMapping(merchantId, req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting courier status mapping:", error);
        res
          .status(500)
          .json({ message: "Failed to delete courier status mapping" });
      }
    },
  );

  app.post(
    "/api/courier-status-mappings/seed",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const result = await storage.seedDefaultMappings(merchantId);
        res.json(result);
      } catch (error) {
        console.error("Error seeding default mappings:", error);
        res.status(500).json({ message: "Failed to seed default mappings" });
      }
    },
  );

  app.post(
    "/api/courier-status-mappings/reset",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const courierName = req.body.courierName as string | undefined;
        await storage.resetCourierStatusMappings(merchantId, courierName);
        const result = await storage.seedDefaultMappings(merchantId);
        res.json({ ...result, reset: true });
      } catch (error) {
        console.error("Error resetting courier status mappings:", error);
        res
          .status(500)
          .json({ message: "Failed to reset courier status mappings" });
      }
    },
  );

  app.post(
    "/api/courier-status-mappings/save-all",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const { clearMappingsCache } = await import(
          "./services/couriers/index"
        );
        clearMappingsCache(merchantId);

        const allMappings = await storage.getCourierStatusMappings(merchantId);
        res.json({
          success: true,
          count: allMappings.length,
          message: `All ${allMappings.length} mappings saved successfully`,
        });
      } catch (error) {
        console.error("Error saving all mappings:", error);
        res.status(500).json({ message: "Failed to save mappings" });
      }
    },
  );

  app.post(
    "/api/courier-status-mappings/resync",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const { clearMappingsCache } = await import(
          "./services/couriers/index"
        );
        clearMappingsCache(merchantId);

        const { syncMerchantCourierStatuses } = await import(
          "./services/courierSyncScheduler"
        );
        const result = await syncMerchantCourierStatuses(merchantId);

        res.json({
          success: true,
          updated: result.updated,
          failed: result.failed,
          skipped: result.skipped,
          total: result.total,
        });
      } catch (error) {
        console.error("Error during save & resync:", error);
        res.status(500).json({ message: "Failed to resync courier statuses" });
      }
    },
  );

  app.get(
    "/api/unmapped-courier-statuses",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;
        const resolved =
          req.query.resolved === "true"
            ? true
            : req.query.resolved === "false"
              ? false
              : undefined;
        const statuses = await storage.getUnmappedStatuses(
          merchantId,
          resolved,
        );
        res.json(statuses);
      } catch (error) {
        console.error("Error fetching unmapped statuses:", error);
        res.status(500).json({ message: "Failed to fetch unmapped statuses" });
      }
    },
  );

  app.get(
    "/api/unmapped-courier-statuses/count",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;
        const count = await storage.getUnmappedStatusCount(merchantId);
        res.json({ count });
      } catch (error) {
        console.error("Error fetching unmapped status count:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch unmapped status count" });
      }
    },
  );

  app.post(
    "/api/unmapped-courier-statuses/:id/resolve",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;
        await storage.resolveUnmappedStatus(merchantId, req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error("Error resolving unmapped status:", error);
        res.status(500).json({ message: "Failed to resolve unmapped status" });
      }
    },
  );

  app.delete(
    "/api/unmapped-courier-statuses/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;
        await storage.dismissUnmappedStatus(merchantId, req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error("Error dismissing unmapped status:", error);
        res.status(500).json({ message: "Failed to dismiss unmapped status" });
      }
    },
  );

  app.patch(
    "/api/merchants/sync-from-date",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;
        const { syncFromDate } = req.body;
        if (!syncFromDate) {
          return res.status(400).json({ message: "syncFromDate is required" });
        }
        const date = new Date(syncFromDate);
        if (isNaN(date.getTime())) {
          return res.status(400).json({ message: "Invalid date format" });
        }
        const now = new Date();
        if (date > now) {
          return res.status(400).json({ message: "Sync-from date cannot be in the future" });
        }
        const earliest = new Date("2015-01-01T00:00:00.000Z");
        if (date < earliest) {
          return res.status(400).json({ message: "Sync-from date cannot be earlier than 2015" });
        }
        await storage.updateMerchant(merchantId, { shopifySyncFromDate: date } as any);
        res.json({ success: true, shopifySyncFromDate: date.toISOString() });
      } catch (error: any) {
        console.error("Error saving sync-from date:", error);
        res.status(500).json({ message: error.message || "Failed to save sync-from date" });
      }
    },
  );

  app.get(
    "/api/merchants/sync-from-date",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;
        const merchant = await storage.getMerchant(merchantId);
        res.json({ shopifySyncFromDate: merchant?.shopifySyncFromDate || null });
      } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to get sync-from date" });
      }
    },
  );

  app.post(
    "/api/onboarding/advance-step",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const merchant = await storage.getMerchant(merchantId);
        if (!merchant)
          return res.status(404).json({ message: "Merchant not found" });

        const currentIndex = ONBOARDING_ORDER.indexOf(
          merchant.onboardingStep || "ACCOUNT_CREATED",
        );
        if (currentIndex >= ONBOARDING_ORDER.length - 1) {
          return res.json({
            onboardingStep: "COMPLETED",
            message: "Already completed",
          });
        }

        const nextStep = ONBOARDING_ORDER[currentIndex + 1];
        await db
          .update(merchants)
          .set({ onboardingStep: nextStep })
          .where(eq(merchants.id, merchantId));

        res.json({ onboardingStep: nextStep });
      } catch (error) {
        console.error("Error advancing onboarding:", error);
        res.status(500).json({ message: "Failed to advance onboarding step" });
      }
    },
  );

  app.post(
    "/api/merchants/shopify-credentials",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const { clientId, clientSecret } = req.body;
        if (!clientId || typeof clientId !== "string") {
          return res.status(400).json({ message: "clientId is required" });
        }

        const updateData: any = {
          shopifyAppClientId: clientId.trim(),
          updatedAt: new Date(),
        };

        if (
          clientSecret &&
          typeof clientSecret === "string" &&
          clientSecret.trim()
        ) {
          updateData.shopifyAppClientSecret = encryptToken(clientSecret.trim());
        } else {
          const merchant = await storage.getMerchant(merchantId);
          if (!merchant?.shopifyAppClientSecret) {
            return res
              .status(400)
              .json({
                message: "clientSecret is required for first-time setup",
              });
          }
        }

        await db
          .update(merchants)
          .set(updateData)
          .where(eq(merchants.id, merchantId));

        console.log(
          `[Shopify] Merchant ${merchantId} saved their own Shopify app credentials (clientId=${clientId.trim().substring(0, 8)}...)`,
        );
        res.json({
          message: "Shopify app credentials saved",
          clientIdSet: true,
          clientSecretSet: true,
        });
      } catch (error: any) {
        console.error("Error saving Shopify credentials:", error);
        res.status(500).json({ message: "Failed to save Shopify credentials" });
      }
    },
  );

  app.get(
    "/api/merchants/shopify-credentials",
    isAuthenticated,
    async (req, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const merchant = await storage.getMerchant(merchantId);
        if (!merchant)
          return res.status(404).json({ message: "Merchant not found" });

        res.json({
          clientId: merchant.shopifyAppClientId || "",
          clientSecretSet: !!merchant.shopifyAppClientSecret,
        });
      } catch (error) {
        res.status(500).json({ message: "Failed to get Shopify credentials" });
      }
    },
  );

  // ============================================
  // ADMIN ROUTES (SUPER_ADMIN only)
  // ============================================
  async function requireSuperAdmin(req: any, res: any): Promise<string | null> {
    const userId = getSessionUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return null;
    }
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user || user.role !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Admin access required" });
      return null;
    }
    return userId;
  }

  app.get("/api/admin/diagnostics", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user || user.role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const merchantId = user.merchantId;
      if (!merchantId) {
        return res.status(400).json({ message: "No merchant associated" });
      }

      const [totalOrders] = (
        await db.execute(
          sql`SELECT COUNT(*)::int AS count FROM orders WHERE merchant_id = ${merchantId}`,
        )
      ).rows;
      const [uniqueShopify] = (
        await db.execute(
          sql`SELECT COUNT(DISTINCT shopify_order_id)::int AS count FROM orders WHERE merchant_id = ${merchantId} AND shopify_order_id IS NOT NULL`,
        )
      ).rows;
      const totalCount = (totalOrders as any).count || 0;
      const uniqueCount = (uniqueShopify as any).count || 0;
      const duplicatesCount = totalCount - uniqueCount;

      const shopifyStoreResult = (
        await db.execute(
          sql`SELECT shop_domain, is_connected, last_sync_at, webhook_status FROM shopify_stores WHERE merchant_id = ${merchantId} LIMIT 1`,
        )
      ).rows;
      const shopifyStore =
        shopifyStoreResult.length > 0 ? (shopifyStoreResult[0] as any) : null;

      const [shipmentsResult] = (
        await db.execute(
          sql`SELECT COUNT(*)::int AS count FROM shipments WHERE merchant_id = ${merchantId}`,
        )
      ).rows;
      const shipmentsCount = (shipmentsResult as any).count || 0;

      let webhookEventsCount = 0;
      try {
        const [webhookResult] = (
          await db.execute(
            sql`SELECT COUNT(*)::int AS count FROM shopify_webhook_events WHERE merchant_id = ${merchantId}`,
          )
        ).rows;
        webhookEventsCount = (webhookResult as any).count || 0;
      } catch {}

      const workflowRows = (
        await db.execute(
          sql`SELECT workflow_status, COUNT(*)::int AS count FROM orders WHERE merchant_id = ${merchantId} GROUP BY workflow_status`,
        )
      ).rows;
      const workflowCounts: Record<string, number> = {};
      for (const row of workflowRows) {
        const r = row as any;
        workflowCounts[r.workflow_status] = r.count;
      }

      res.json({
        totalOrders: totalCount,
        uniqueShopifyOrders: uniqueCount,
        duplicates: duplicatesCount,
        shopifyStore: shopifyStore
          ? {
              shopDomain: shopifyStore.shop_domain,
              isConnected: shopifyStore.is_connected,
              lastSyncAt: shopifyStore.last_sync_at,
              webhookStatus: shopifyStore.webhook_status,
            }
          : null,
        totalShipments: shipmentsCount,
        webhookEvents: webhookEventsCount,
        workflowCounts,
      });
    } catch (error) {
      console.error("Error fetching diagnostics:", error);
      res.status(500).json({ message: "Failed to fetch diagnostics" });
    }
  });

  app.get("/api/admin/merchants", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      const search = req.query.search as string | undefined;
      let merchantList;
      if (search) {
        merchantList = await db
          .select()
          .from(merchants)
          .where(
            or(
              ilike(merchants.name, `%${search}%`),
              ilike(merchants.email, `%${search}%`),
            ),
          );
      } else {
        merchantList = await db.select().from(merchants);
      }

      res.json(merchantList);
    } catch (error) {
      console.error("Error fetching merchants:", error);
      res.status(500).json({ message: "Failed to fetch merchants" });
    }
  });

  app.get("/api/admin/merchants/:id", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      const [merchant] = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, req.params.id));
      if (!merchant)
        return res.status(404).json({ message: "Merchant not found" });

      const merchantUsers = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          isActive: users.isActive,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(eq(users.merchantId, merchant.id));

      res.json({ ...merchant, users: merchantUsers });
    } catch (error) {
      console.error("Error fetching merchant:", error);
      res.status(500).json({ message: "Failed to fetch merchant" });
    }
  });

  app.post(
    "/api/admin/merchants/:id/suspend",
    isAuthenticated,
    async (req, res) => {
      try {
        const adminId = await requireSuperAdmin(req, res);
        if (!adminId) return;

        await db
          .update(merchants)
          .set({ status: "SUSPENDED" })
          .where(eq(merchants.id, req.params.id));
        await db.insert(adminActionLogs).values({
          adminUserId: adminId,
          actionType: "SUSPEND_MERCHANT",
          targetMerchantId: req.params.id,
          details: "Merchant suspended by admin",
        });

        res.json({ message: "Merchant suspended" });
      } catch (error) {
        console.error("Error suspending merchant:", error);
        res.status(500).json({ message: "Failed to suspend merchant" });
      }
    },
  );

  app.post(
    "/api/admin/merchants/:id/unsuspend",
    isAuthenticated,
    async (req, res) => {
      try {
        const adminId = await requireSuperAdmin(req, res);
        if (!adminId) return;

        await db
          .update(merchants)
          .set({ status: "ACTIVE" })
          .where(eq(merchants.id, req.params.id));
        await db.insert(adminActionLogs).values({
          adminUserId: adminId,
          actionType: "UNSUSPEND_MERCHANT",
          targetMerchantId: req.params.id,
          details: "Merchant unsuspended by admin",
        });

        res.json({ message: "Merchant unsuspended" });
      } catch (error) {
        res.status(500).json({ message: "Failed to unsuspend merchant" });
      }
    },
  );

  app.post(
    "/api/admin/merchants/:id/advance-onboarding",
    isAuthenticated,
    async (req, res) => {
      try {
        const adminId = await requireSuperAdmin(req, res);
        if (!adminId) return;

        const [merchant] = await db
          .select()
          .from(merchants)
          .where(eq(merchants.id, req.params.id));
        if (!merchant)
          return res.status(404).json({ message: "Merchant not found" });

        const currentIndex = ONBOARDING_ORDER.indexOf(
          merchant.onboardingStep || "ACCOUNT_CREATED",
        );
        if (currentIndex >= ONBOARDING_ORDER.length - 1) {
          return res.json({ onboardingStep: "COMPLETED" });
        }

        const nextStep = ONBOARDING_ORDER[currentIndex + 1];
        await db
          .update(merchants)
          .set({ onboardingStep: nextStep })
          .where(eq(merchants.id, req.params.id));
        await db.insert(adminActionLogs).values({
          adminUserId: adminId,
          actionType: "ADVANCE_ONBOARDING",
          targetMerchantId: req.params.id,
          details: `Advanced onboarding from ${merchant.onboardingStep} to ${nextStep}`,
        });

        res.json({ onboardingStep: nextStep });
      } catch (error) {
        res.status(500).json({ message: "Failed to advance onboarding" });
      }
    },
  );

  app.post("/api/admin/users/:id/block", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      await db
        .update(users)
        .set({ isActive: false })
        .where(eq(users.id, req.params.id));
      await db.insert(adminActionLogs).values({
        adminUserId: adminId,
        actionType: "BLOCK_USER",
        targetUserId: req.params.id,
        details: "User blocked by admin",
      });

      res.json({ message: "User blocked" });
    } catch (error) {
      res.status(500).json({ message: "Failed to block user" });
    }
  });

  app.post(
    "/api/admin/users/:id/unblock",
    isAuthenticated,
    async (req, res) => {
      try {
        const adminId = await requireSuperAdmin(req, res);
        if (!adminId) return;

        await db
          .update(users)
          .set({ isActive: true })
          .where(eq(users.id, req.params.id));
        await db.insert(adminActionLogs).values({
          adminUserId: adminId,
          actionType: "UNBLOCK_USER",
          targetUserId: req.params.id,
          details: "User unblocked by admin",
        });

        res.json({ message: "User unblocked" });
      } catch (error) {
        res.status(500).json({ message: "Failed to unblock user" });
      }
    },
  );

  app.post(
    "/api/admin/users/:id/reset-password",
    isAuthenticated,
    async (req, res) => {
      try {
        const adminId = await requireSuperAdmin(req, res);
        if (!adminId) return;

        const bcrypt = await import("bcrypt");
        const tempPassword = crypto.randomBytes(8).toString("hex");
        const passwordHash = await bcrypt.default.hash(tempPassword, 12);

        await db
          .update(users)
          .set({ passwordHash })
          .where(eq(users.id, req.params.id));
        await db.insert(adminActionLogs).values({
          adminUserId: adminId,
          actionType: "RESET_PASSWORD",
          targetUserId: req.params.id,
          details: "Password reset by admin",
        });

        res.json({ message: "Password reset", tempPassword });
      } catch (error) {
        res.status(500).json({ message: "Failed to reset password" });
      }
    },
  );

  // ============================================
  // SUPER ADMIN: PLATFORM DASHBOARD ANALYTICS
  // ============================================

  app.get("/api/admin/platform-stats", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      const [merchantCount] = (await db.execute(sql`SELECT COUNT(*)::int AS count FROM merchants`)).rows;
      const [activeCount] = (await db.execute(sql`SELECT COUNT(*)::int AS count FROM merchants WHERE status = 'ACTIVE'`)).rows;
      const [suspendedCount] = (await db.execute(sql`SELECT COUNT(*)::int AS count FROM merchants WHERE status = 'SUSPENDED'`)).rows;
      const [userCount] = (await db.execute(sql`SELECT COUNT(*)::int AS count FROM users`)).rows;
      const [activeUserCount] = (await db.execute(sql`SELECT COUNT(*)::int AS count FROM users WHERE is_active = true`)).rows;
      const [orderCount] = (await db.execute(sql`SELECT COUNT(*)::int AS count FROM orders`)).rows;
      const [shipmentCount] = (await db.execute(sql`SELECT COUNT(*)::int AS count FROM shipments`)).rows;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const [newMerchants30d] = (await db.execute(sql`SELECT COUNT(*)::int AS count FROM merchants WHERE created_at >= ${thirtyDaysAgo}`)).rows;
      const [newOrders30d] = (await db.execute(sql`SELECT COUNT(*)::int AS count FROM orders WHERE created_at >= ${thirtyDaysAgo}`)).rows;

      const planBreakdown = (await db.execute(sql`
        SELECT COALESCE(subscription_plan, 'free') AS plan, COUNT(*)::int AS count
        FROM merchants GROUP BY COALESCE(subscription_plan, 'free') ORDER BY count DESC
      `)).rows;

      const onboardingBreakdown = (await db.execute(sql`
        SELECT onboarding_step AS step, COUNT(*)::int AS count
        FROM merchants GROUP BY onboarding_step ORDER BY count DESC
      `)).rows;

      const topMerchants = (await db.execute(sql`
        SELECT m.id, m.name, m.email, m.status, m.subscription_plan,
          COUNT(o.id)::int AS order_count
        FROM merchants m
        LEFT JOIN orders o ON o.merchant_id = m.id
        GROUP BY m.id, m.name, m.email, m.status, m.subscription_plan
        ORDER BY order_count DESC LIMIT 10
      `)).rows;

      const recentSignups = (await db.execute(sql`
        SELECT id, name, email, status, subscription_plan, onboarding_step, created_at
        FROM merchants ORDER BY created_at DESC LIMIT 10
      `)).rows;

      res.json({
        totalMerchants: (merchantCount as any).count,
        activeMerchants: (activeCount as any).count,
        suspendedMerchants: (suspendedCount as any).count,
        totalUsers: (userCount as any).count,
        activeUsers: (activeUserCount as any).count,
        totalOrders: (orderCount as any).count,
        totalShipments: (shipmentCount as any).count,
        newMerchants30d: (newMerchants30d as any).count,
        newOrders30d: (newOrders30d as any).count,
        planBreakdown,
        onboardingBreakdown,
        topMerchants,
        recentSignups,
      });
    } catch (error) {
      console.error("Platform stats error:", error);
      res.status(500).json({ message: "Failed to fetch platform stats" });
    }
  });

  app.get("/api/admin/analytics/trends", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      const dailySignups = (await db.execute(sql`
        SELECT DATE(created_at) AS date, COUNT(*)::int AS count
        FROM merchants
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at) ORDER BY date
      `)).rows;

      const dailyOrders = (await db.execute(sql`
        SELECT DATE(created_at) AS date, COUNT(*)::int AS count
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at) ORDER BY date
      `)).rows;

      const workflowBreakdown = (await db.execute(sql`
        SELECT workflow_status AS status, COUNT(*)::int AS count
        FROM orders GROUP BY workflow_status ORDER BY count DESC
      `)).rows;

      const courierUsage = (await db.execute(sql`
        SELECT courier_name AS courier, COUNT(*)::int AS count
        FROM shipments WHERE courier_name IS NOT NULL
        GROUP BY courier_name ORDER BY count DESC
      `)).rows;

      const merchantsByCity = (await db.execute(sql`
        SELECT COALESCE(city, 'Unknown') AS city, COUNT(*)::int AS count
        FROM merchants GROUP BY COALESCE(city, 'Unknown') ORDER BY count DESC LIMIT 10
      `)).rows;

      res.json({ dailySignups, dailyOrders, workflowBreakdown, courierUsage, merchantsByCity });
    } catch (error) {
      console.error("Analytics trends error:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // ============================================
  // SUPER ADMIN: MERCHANT DEEP PEEK
  // ============================================

  app.get("/api/admin/merchants/:id/peek", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      const mid = req.params.id;
      const [merchant] = await db.select().from(merchants).where(eq(merchants.id, mid));
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });

      const merchantUsers = await db.select({
        id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName,
        role: users.role, isActive: users.isActive, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
      }).from(users).where(eq(users.merchantId, mid));

      const [orderStats] = (await db.execute(sql`
        SELECT COUNT(*)::int AS total,
          COUNT(CASE WHEN workflow_status = 'NEW' THEN 1 END)::int AS new_count,
          COUNT(CASE WHEN workflow_status = 'DELIVERED' THEN 1 END)::int AS delivered,
          COUNT(CASE WHEN workflow_status = 'CANCELLED' THEN 1 END)::int AS cancelled,
          COUNT(CASE WHEN workflow_status = 'RETURN' THEN 1 END)::int AS returned,
          COALESCE(SUM(CASE WHEN workflow_status = 'DELIVERED' THEN total_amount::numeric ELSE 0 END), 0)::text AS revenue
        FROM orders WHERE merchant_id = ${mid}
      `)).rows;

      const shopifyInfo = await db.select({
        shopDomain: shopifyStores.shopDomain,
        isConnected: shopifyStores.isConnected,
        lastSyncAt: shopifyStores.lastSyncAt,
      }).from(shopifyStores).where(eq(shopifyStores.merchantId, mid));

      const courierInfo = await db.select({
        courierName: courierAccounts.courierName,
        isActive: courierAccounts.isActive,
      }).from(courierAccounts).where(eq(courierAccounts.merchantId, mid));

      const [productStats] = (await db.execute(sql`
        SELECT COUNT(*)::int AS total,
          COUNT(CASE WHEN active = true THEN 1 END)::int AS active_count,
          COALESCE(SUM(stock_qty), 0)::int AS total_stock
        FROM accounting_products WHERE merchant_id = ${mid}
      `)).rows;

      const [accountingStats] = (await db.execute(sql`
        SELECT
          (SELECT COUNT(*)::int FROM parties WHERE merchant_id = ${mid}) AS total_parties,
          (SELECT COUNT(*)::int FROM cash_accounts WHERE merchant_id = ${mid}) AS total_accounts,
          (SELECT COUNT(*)::int FROM sales WHERE merchant_id = ${mid}) AS total_sales,
          (SELECT COUNT(*)::int FROM stock_receipts WHERE merchant_id = ${mid}) AS total_receipts
      `)).rows;

      const recentOrders = (await db.execute(sql`
        SELECT id, order_number, customer_name, total_amount, workflow_status, created_at
        FROM orders WHERE merchant_id = ${mid} ORDER BY created_at DESC LIMIT 10
      `)).rows;

      await db.insert(adminActionLogs).values({
        adminUserId: adminId,
        actionType: "PEEK_MERCHANT",
        targetMerchantId: mid,
        details: `Peeked into merchant: ${merchant.name}`,
      });

      res.json({
        merchant,
        users: merchantUsers,
        orderStats,
        shopify: shopifyInfo[0] || null,
        couriers: courierInfo,
        productStats,
        accountingStats,
        recentOrders,
      });
    } catch (error) {
      console.error("Merchant peek error:", error);
      res.status(500).json({ message: "Failed to peek merchant" });
    }
  });

  // ============================================
  // SUPER ADMIN: SUBSCRIPTION MANAGEMENT
  // ============================================

  app.put("/api/admin/merchants/:id/subscription", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      const { plan } = req.body;
      const validPlans = ["free", "starter", "professional", "enterprise"];
      if (!plan || !validPlans.includes(plan)) return res.status(400).json({ message: `Plan must be one of: ${validPlans.join(", ")}` });

      const [updated] = await db.update(merchants)
        .set({ subscriptionPlan: plan, updatedAt: new Date() })
        .where(eq(merchants.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ message: "Merchant not found" });

      await db.insert(adminActionLogs).values({
        adminUserId: adminId,
        actionType: "UPDATE_SUBSCRIPTION",
        targetMerchantId: req.params.id,
        details: `Changed subscription to: ${plan}`,
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update subscription" });
    }
  });

  // ============================================
  // SUPER ADMIN: DELETE MERCHANT
  // ============================================

  app.delete("/api/admin/merchants/:id", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      const mid = req.params.id;
      const [merchant] = await db.select().from(merchants).where(eq(merchants.id, mid));
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });

      await db.insert(adminActionLogs).values({
        adminUserId: adminId,
        actionType: "DELETE_MERCHANT",
        targetMerchantId: mid,
        details: `Deleted merchant: ${merchant.name} (${merchant.email})`,
      });

      await db.delete(merchants).where(eq(merchants.id, mid));
      res.json({ message: `Merchant "${merchant.name}" deleted successfully.` });
    } catch (error) {
      console.error("Delete merchant error:", error);
      res.status(500).json({ message: "Failed to delete merchant" });
    }
  });

  // ============================================
  // SUPER ADMIN: ALL USERS (cross-tenant)
  // ============================================

  app.get("/api/admin/users", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      const search = req.query.search as string | undefined;
      let query = db.select({
        id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName,
        role: users.role, isActive: users.isActive, merchantId: users.merchantId,
        lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
        merchantName: merchants.name, merchantStatus: merchants.status,
      }).from(users).leftJoin(merchants, eq(users.merchantId, merchants.id));

      const results = search
        ? await (query as any).where(or(ilike(users.email, `%${search}%`), ilike(users.firstName, `%${search}%`), ilike(users.lastName, `%${search}%`)))
        : await query;

      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // ============================================
  // SUPER ADMIN: AUDIT LOG
  // ============================================

  app.get("/api/admin/audit-log", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;
      const actionType = req.query.actionType as string | undefined;

      let results;
      if (actionType) {
        results = await db.select({
          id: adminActionLogs.id,
          adminUserId: adminActionLogs.adminUserId,
          actionType: adminActionLogs.actionType,
          targetMerchantId: adminActionLogs.targetMerchantId,
          targetUserId: adminActionLogs.targetUserId,
          details: adminActionLogs.details,
          createdAt: adminActionLogs.createdAt,
          adminEmail: users.email,
          adminName: users.firstName,
          merchantName: merchants.name,
        }).from(adminActionLogs)
          .leftJoin(users, eq(adminActionLogs.adminUserId, users.id))
          .leftJoin(merchants, eq(adminActionLogs.targetMerchantId, merchants.id))
          .where(eq(adminActionLogs.actionType, actionType))
          .orderBy(desc(adminActionLogs.createdAt))
          .limit(limit).offset(offset);
      } else {
        results = await db.select({
          id: adminActionLogs.id,
          adminUserId: adminActionLogs.adminUserId,
          actionType: adminActionLogs.actionType,
          targetMerchantId: adminActionLogs.targetMerchantId,
          targetUserId: adminActionLogs.targetUserId,
          details: adminActionLogs.details,
          createdAt: adminActionLogs.createdAt,
          adminEmail: users.email,
          adminName: users.firstName,
          merchantName: merchants.name,
        }).from(adminActionLogs)
          .leftJoin(users, eq(adminActionLogs.adminUserId, users.id))
          .leftJoin(merchants, eq(adminActionLogs.targetMerchantId, merchants.id))
          .orderBy(desc(adminActionLogs.createdAt))
          .limit(limit).offset(offset);
      }

      const [totalResult] = (await db.execute(sql`SELECT COUNT(*)::int AS count FROM admin_action_logs`)).rows;
      res.json({ logs: results, total: (totalResult as any).count });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch audit log" });
    }
  });

  // ============================================
  // SUPER ADMIN: CREATE MERCHANT
  // ============================================

  app.post("/api/admin/merchants/create", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      const createSchema = z.object({
        merchantName: z.string().min(1, "Business name is required"),
        email: z.string().email("Valid email is required"),
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().optional(),
        phone: z.string().optional(),
        city: z.string().optional(),
        subscriptionPlan: z.enum(["free", "starter", "professional", "enterprise"]).optional().default("free"),
        skipOnboarding: z.boolean().optional().default(false),
      });

      const body = createSchema.parse(req.body);

      const existing = await db.select().from(users).where(eq(users.email, body.email));
      if (existing.length > 0) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      const setupToken = crypto.randomBytes(32).toString("hex");
      const setupTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const normalizedPhone = normalizePakistaniPhone(body.phone);
      const slug = body.merchantName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") + "-" + Date.now().toString(36);

      const result = await db.transaction(async (tx) => {
        const [merchant] = await tx.insert(merchants).values({
          name: body.merchantName,
          slug,
          email: body.email,
          phone: normalizedPhone,
          city: body.city || null,
          status: "ACTIVE",
          subscriptionPlan: body.subscriptionPlan,
          onboardingStep: body.skipOnboarding ? "COMPLETED" : "ACCOUNT_CREATED",
        }).returning();

        const [user] = await tx.insert(users).values({
          email: body.email,
          firstName: body.firstName,
          lastName: body.lastName || null,
          role: "USER",
          isActive: true,
          merchantId: merchant.id,
          setupToken,
          setupTokenExpiresAt,
        }).returning();

        await tx.insert(teamMembers).values({
          userId: user.id,
          merchantId: merchant.id,
          role: "admin",
          joinedAt: new Date(),
        });

        return { merchant, user };
      });

      await db.insert(adminActionLogs).values({
        adminUserId: adminId,
        actionType: "create_merchant",
        targetMerchantId: result.merchant.id,
        targetUserId: result.user.id,
        details: `Merchant "${body.merchantName}" created by admin with plan: ${body.subscriptionPlan}`,
      });

      const setupUrl = `${req.protocol}://${req.get("host")}/merchant-setup/${setupToken}`;

      let emailSent = false;
      let emailError: string | undefined;
      try {
        const emailResult = await sendMerchantSetupEmail({
          toEmail: body.email,
          merchantName: body.merchantName,
          firstName: body.firstName,
          setupUrl,
          expiresAt: setupTokenExpiresAt,
        });
        emailSent = emailResult.success;
        if (!emailResult.success) emailError = emailResult.error;
      } catch (err: any) {
        emailError = err.message;
      }

      res.json({
        message: `Merchant "${body.merchantName}" created successfully. ${emailSent ? "Invite sent to " + body.email : "Account created but email failed to send."}`,
        emailSent,
        emailError,
        merchant: result.merchant,
        user: { id: result.user.id, email: result.user.email, firstName: result.user.firstName },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Admin create merchant error:", error);
      res.status(500).json({ message: "Failed to create merchant" });
    }
  });

  // ============================================
  // MERCHANT SETUP (Set password via invite link)
  // ============================================

  app.get("/api/merchant-setup/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const [user] = await db.select().from(users).where(eq(users.setupToken, token));
      if (!user) {
        return res.status(404).json({ message: "Invalid or expired setup link." });
      }
      if (user.setupTokenExpiresAt && new Date(user.setupTokenExpiresAt) < new Date()) {
        return res.status(410).json({ message: "This setup link has expired. Please contact your administrator." });
      }
      if (user.passwordHash) {
        return res.status(400).json({ message: "Account already set up. Please log in instead." });
      }

      let merchantName = null;
      if (user.merchantId) {
        const [m] = await db.select().from(merchants).where(eq(merchants.id, user.merchantId));
        merchantName = m?.name;
      }

      res.json({
        email: user.email,
        firstName: user.firstName,
        merchantName,
      });
    } catch (error) {
      console.error("Setup token validation error:", error);
      res.status(500).json({ message: "Failed to validate setup link" });
    }
  });

  app.post("/api/merchant-setup/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const { password } = req.body;

      if (!password || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const [user] = await db.select().from(users).where(eq(users.setupToken, token));
      if (!user) {
        return res.status(404).json({ message: "Invalid or expired setup link." });
      }
      if (user.setupTokenExpiresAt && new Date(user.setupTokenExpiresAt) < new Date()) {
        return res.status(410).json({ message: "This setup link has expired. Please contact your administrator." });
      }
      if (user.passwordHash) {
        return res.status(400).json({ message: "Account already set up. Please log in instead." });
      }

      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash(password, 12);

      await db.update(users).set({
        passwordHash,
        setupToken: null,
        setupTokenExpiresAt: null,
      }).where(eq(users.id, user.id));

      res.json({ message: "Password set successfully! You can now log in." });
    } catch (error) {
      console.error("Setup password error:", error);
      res.status(500).json({ message: "Failed to set password" });
    }
  });

  // ============================================
  // SUPER ADMIN: APPLICATION HEALTH
  // ============================================

  app.get("/api/admin/health", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      const startTime = Date.now();
      await db.execute(sql`SELECT 1`);
      const dbLatency = Date.now() - startTime;

      const [dbSize] = (await db.execute(sql`
        SELECT pg_size_pretty(pg_database_size(current_database())) AS size
      `)).rows;

      const [tableStats] = (await db.execute(sql`
        SELECT
          (SELECT COUNT(*)::int FROM orders) AS orders,
          (SELECT COUNT(*)::int FROM shipments) AS shipments,
          (SELECT COUNT(*)::int FROM merchants) AS merchants,
          (SELECT COUNT(*)::int FROM users) AS users,
          (SELECT COUNT(*)::int FROM accounting_products) AS products,
          (SELECT COUNT(*)::int FROM sales) AS sales
      `)).rows;

      const largeTables = (await db.execute(sql`
        SELECT relname AS table_name, n_live_tup::int AS row_count
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC LIMIT 15
      `)).rows;

      res.json({
        dbLatencyMs: dbLatency,
        dbSize: (dbSize as any).size,
        tableStats,
        largeTables,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch health" });
    }
  });

  app.get("/api/admin/sync-health", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      const courierMetrics = getCourierSyncMetrics();
      const shopifyMetrics = getShopifySyncMetrics();

      const now = Date.now();
      const merchantHealth: Record<string, any> = {};

      const allMerchantIds = new Set([
        ...courierMetrics.keys(),
        ...shopifyMetrics.keys(),
      ]);

      for (const merchantId of allMerchantIds) {
        const courier = courierMetrics.get(merchantId);
        const shopify = shopifyMetrics.get(merchantId);

        const courierLagMs = courier?.lastSyncTime
          ? now - courier.lastSyncTime.getTime()
          : null;
        const shopifyLagMs = shopify?.lastSyncTime
          ? now - shopify.lastSyncTime.getTime()
          : null;

        const courierLagWarning = courierLagMs !== null && courierLagMs > 15 * 60 * 1000;
        const shopifyLagWarning = shopifyLagMs !== null && shopifyLagMs > 15 * 60 * 1000;

        merchantHealth[merchantId] = {
          courier: courier
            ? {
                lastSyncTime: courier.lastSyncTime,
                lastSyncDurationMs: courier.lastSyncDurationMs,
                syncLagMs: courierLagMs,
                syncLagWarning: courierLagWarning,
                totalSyncs: courier.totalSyncs,
                totalErrors: courier.totalErrors,
                ordersProcessed: courier.ordersProcessed,
                lastError: courier.lastErrorMessage
                  ? { message: courier.lastErrorMessage, time: courier.lastErrorTime }
                  : null,
              }
            : null,
          shopify: shopify
            ? {
                lastSyncTime: shopify.lastSyncTime,
                lastSyncDurationMs: shopify.lastSyncDurationMs,
                syncLagMs: shopifyLagMs,
                syncLagWarning: shopifyLagWarning,
                totalSyncs: shopify.totalSyncs,
                totalErrors: shopify.totalErrors,
                ordersCreated: shopify.ordersCreated,
                ordersUpdated: shopify.ordersUpdated,
                lastError: shopify.lastErrorMessage
                  ? { message: shopify.lastErrorMessage, time: shopify.lastErrorTime }
                  : null,
              }
            : null,
        };
      }

      res.json({
        timestamp: new Date().toISOString(),
        merchants: merchantHealth,
        summary: {
          totalMerchants: allMerchantIds.size,
          merchantsWithCourierLagWarning: Object.values(merchantHealth).filter(
            (m: any) => m.courier?.syncLagWarning
          ).length,
          merchantsWithShopifyLagWarning: Object.values(merchantHealth).filter(
            (m: any) => m.shopify?.syncLagWarning
          ).length,
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sync health" });
    }
  });

  // ============================================
  // BULK CANCELLATION JOB ENDPOINTS
  // ============================================

  app.post(
    "/api/cancellation-jobs/preview",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const { identifiers, inputType } = req.body;
        if (
          !identifiers ||
          !Array.isArray(identifiers) ||
          identifiers.length === 0
        ) {
          return res
            .status(400)
            .json({ message: "identifiers array is required" });
        }
        if (
          !["ORDER_IDS", "SHOPIFY_NAMES", "TRACKING_NUMBERS"].includes(
            inputType,
          )
        ) {
          return res
            .status(400)
            .json({
              message:
                "inputType must be ORDER_IDS, SHOPIFY_NAMES, or TRACKING_NUMBERS",
            });
        }

        const { orders: allOrders } = await storage.getOrders(merchantId, {
          pageSize: 10000,
        });
        const matched: any[] = [];
        const notFound: string[] = [];

        for (const identifier of identifiers) {
          const trimmed = String(identifier).trim();
          if (!trimmed) continue;

          let found: any = null;
          if (inputType === "ORDER_IDS") {
            found = allOrders.find((o: any) => o.id === trimmed);
          } else if (inputType === "SHOPIFY_NAMES") {
            found = allOrders.find((o: any) => o.orderNumber === trimmed);
          } else if (inputType === "TRACKING_NUMBERS") {
            found = allOrders.find((o: any) => o.courierTracking === trimmed);
          }

          if (found) {
            matched.push({
              id: found.id,
              orderNumber: found.orderNumber,
              courierName: found.courierName,
              courierTracking: found.courierTracking,
              workflowStatus: found.workflowStatus,
              shopifyOrderId: found.shopifyOrderId,
              totalAmount: found.totalAmount,
              customerName: found.customerName,
              cancelledAt: found.cancelledAt,
              canCancelCourier:
                found.workflowStatus === "BOOKED" && !!found.courierTracking,
              canCancelShopify: !!found.shopifyOrderId && !found.cancelledAt,
            });
          } else {
            notFound.push(trimmed);
          }
        }

        res.json({
          matched,
          notFound,
          totalMatched: matched.length,
          totalNotFound: notFound.length,
        });
      } catch (error) {
        console.error("Error previewing cancellation:", error);
        res.status(500).json({ message: "Failed to preview cancellation" });
      }
    },
  );

  app.post("/api/cancellation-jobs", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { orderIds, jobType, inputType, forceShopifyCancel } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ message: "orderIds array is required" });
      }
      if (!["COURIER_CANCEL", "SHOPIFY_CANCEL", "BOTH"].includes(jobType)) {
        return res
          .status(400)
          .json({
            message: "jobType must be COURIER_CANCEL, SHOPIFY_CANCEL, or BOTH",
          });
      }

      const userId = getSessionUserId(req) || "system";

      const job = await storage.createCancellationJob({
        merchantId,
        jobType,
        status: "QUEUED",
        createdByUserId: userId,
        inputType: inputType || "ORDER_IDS",
        totalCount: orderIds.length,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        forceShopifyCancel: forceShopifyCancel || false,
      });

      const matchedOrders = await storage.getOrdersByIds(merchantId, orderIds);

      for (const order of matchedOrders) {
        const actions: string[] = [];
        if (
          (jobType === "COURIER_CANCEL" || jobType === "BOTH") &&
          order.courierTracking &&
          order.workflowStatus === "BOOKED"
        ) {
          actions.push("COURIER_CANCEL");
        }
        if (
          (jobType === "SHOPIFY_CANCEL" || jobType === "BOTH") &&
          order.shopifyOrderId &&
          !order.cancelledAt
        ) {
          actions.push("SHOPIFY_CANCEL");
        }

        if (actions.length === 0) {
          await storage.createCancellationJobItem({
            jobId: job.id,
            orderId: order.id,
            trackingNumber: order.courierTracking,
            shopifyOrderId: order.shopifyOrderId,
            orderNumber: order.orderNumber,
            action: jobType === "BOTH" ? "COURIER_CANCEL" : jobType,
            status: "SKIPPED",
            errorMessage: "No cancellable action available for this order",
          });
          continue;
        }

        for (const action of actions) {
          await storage.createCancellationJobItem({
            jobId: job.id,
            orderId: order.id,
            trackingNumber: order.courierTracking,
            shopifyOrderId: order.shopifyOrderId,
            orderNumber: order.orderNumber,
            action,
            status: "PENDING",
          });
        }
      }

      runCancellationJob(job.id, merchantId).catch((err) =>
        console.error(`[CancelJob] Background job error for ${job.id}:`, err),
      );

      res.json({ jobId: job.id, message: "Cancellation job started" });
    } catch (error) {
      console.error("Error creating cancellation job:", error);
      res.status(500).json({ message: "Failed to create cancellation job" });
    }
  });

  app.get("/api/cancellation-jobs", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const page = parseInt(String(req.query.page)) || 1;
      const pageSize = parseInt(String(req.query.pageSize)) || 20;

      const result = await storage.getCancellationJobs(merchantId, {
        page,
        pageSize,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching cancellation jobs:", error);
      res.status(500).json({ message: "Failed to fetch cancellation jobs" });
    }
  });

  app.get(
    "/api/cancellation-jobs/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const merchantId = await requireMerchant(req, res);
        if (!merchantId) return;

        const job = await storage.getCancellationJob(merchantId, req.params.id);
        if (!job) return res.status(404).json({ message: "Job not found" });

        const items = await storage.getCancellationJobItems(job.id);
        res.json({ ...job, items });
      } catch (error) {
        console.error("Error fetching cancellation job:", error);
        res.status(500).json({ message: "Failed to fetch cancellation job" });
      }
    },
  );

  async function runCancellationJob(jobId: string, merchantId: string) {
    console.log(`[CancelJob] Starting job ${jobId}`);

    await storage.updateCancellationJob(jobId, {
      status: "RUNNING",
      startedAt: new Date(),
    });

    const items = await storage.getCancellationJobItems(jobId);
    const pendingItems = items.filter((i) => i.status === "PENDING");
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = items.filter((i) => i.status === "SKIPPED").length;

    const store = await storage.getShopifyStore(merchantId);

    for (let i = 0; i < pendingItems.length; i++) {
      const item = pendingItems[i];

      try {
        if (item.action === "COURIER_CANCEL") {
          if (!item.trackingNumber) {
            await storage.updateCancellationJobItem(item.id, {
              status: "SKIPPED",
              errorMessage: "No tracking number",
            });
            skippedCount++;
            continue;
          }

          const order = item.orderId
            ? await storage.getOrderById(merchantId, item.orderId)
            : null;
          const courierName = order?.courierName || "";

          if (!courierName) {
            await storage.updateCancellationJobItem(item.id, {
              status: "SKIPPED",
              errorMessage: "No courier name on order",
            });
            skippedCount++;
            continue;
          }

          const creds = await getCourierCredentials(merchantId, courierName);
          if (!creds) {
            await storage.updateCancellationJobItem(item.id, {
              status: "FAILED",
              errorMessage: "Courier credentials not configured",
            });
            failedCount++;
            continue;
          }

          const result = await cancelCourierBooking(
            courierName,
            item.trackingNumber,
            {
              apiKey: creds.apiKey || undefined,
              apiSecret: creds.apiSecret || undefined,
            },
          );

          if (result.success) {
            await storage.updateCancellationJobItem(item.id, {
              status: "SUCCESS",
              courierResponse: result.rawResponse || {
                message: result.message,
              },
            });

            if (order && order.workflowStatus === "BOOKED") {
              await storage.updateOrderWorkflow(merchantId, order.id, {
                courierName: null,
                courierTracking: null,
                courierSlipUrl: null,
                bookingStatus: null,
                bookingError: null,
                bookedAt: null,
                shipmentStatus: "Unfulfilled",
                courierRawStatus: null,
              });
              await transitionOrder({
                merchantId,
                orderId: order.id,
                toStatus: "PENDING",
                action: "bulk_cancel_booking",
                actorUserId: "system",
                actorType: "system",
                reason: `Bulk cancellation job ${jobId}`,
              });
            }

            successCount++;
          } else {
            await storage.updateCancellationJobItem(item.id, {
              status: "FAILED",
              errorMessage: result.message,
              courierResponse: result.rawResponse,
            });
            failedCount++;
          }
        } else if (item.action === "SHOPIFY_CANCEL") {
          if (
            !item.shopifyOrderId ||
            !store?.shopDomain ||
            !store?.accessToken
          ) {
            await storage.updateCancellationJobItem(item.id, {
              status: "SKIPPED",
              errorMessage: !item.shopifyOrderId
                ? "No Shopify order ID"
                : "Shopify store not connected",
            });
            skippedCount++;
            continue;
          }

          const result = await cancelShopifyOrder(
            store.shopDomain,
            store.accessToken,
            item.shopifyOrderId,
            "other",
          );

          if (result.success) {
            await storage.updateCancellationJobItem(item.id, {
              status: "SUCCESS",
            });

            if (item.orderId) {
              await storage.updateOrderWorkflow(merchantId, item.orderId, {
                cancelledAt: new Date(),
              });
              await transitionOrder({
                merchantId,
                orderId: item.orderId,
                toStatus: "CANCELLED",
                action: "bulk_shopify_cancel",
                actorUserId: "system",
                actorType: "system",
                reason: `Bulk Shopify cancellation job ${jobId}`,
              });
            }
            successCount++;
          } else {
            await storage.updateCancellationJobItem(item.id, {
              status: "FAILED",
              errorMessage: result.error,
            });
            failedCount++;
          }
        }

        await storage.updateCancellationJob(jobId, {
          successCount,
          failedCount,
          skippedCount,
        });

        if (i < pendingItems.length - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (err: any) {
        console.error(`[CancelJob] Item ${item.id} error:`, err);
        await storage.updateCancellationJobItem(item.id, {
          status: "FAILED",
          errorMessage: err.message || "Unexpected error",
        });
        failedCount++;
      }
    }

    const finalStatus =
      failedCount === 0 ? "COMPLETED" : successCount > 0 ? "PARTIAL" : "FAILED";
    await storage.updateCancellationJob(jobId, {
      status: finalStatus,
      successCount,
      failedCount,
      skippedCount,
      finishedAt: new Date(),
    });

    console.log(
      `[CancelJob] Job ${jobId} finished: ${finalStatus} (success=${successCount}, failed=${failedCount}, skipped=${skippedCount})`,
    );
  }

  // ============================================
  // PRODUCTS / INVENTORY
  // ============================================

  app.get("/api/products", async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { search, status, page, pageSize } = req.query;
      const result = await storage.getProducts(merchantId, {
        search: search as string,
        status: status as string,
        page: page ? parseInt(page as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      });
      res.json(result);
    } catch (error: any) {
      console.error("[Products] Error fetching products:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/product-analytics", async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { dateFrom, dateTo } = req.query;

      const tz = await getMerchantTimezone(merchantId);
      let dateFilterSql = sql``;
      if (dateFrom) {
        dateFilterSql = sql`${dateFilterSql} AND o.order_date >= ${toMerchantStartOfDay(dateFrom as string, tz)}`;
      }
      if (dateTo) {
        dateFilterSql = sql`${dateFilterSql} AND o.order_date <= ${toMerchantEndOfDay(dateTo as string, tz)}`;
      }

      const [productResults, trendResults, perProductDailyResults] = await Promise.all([
        db.execute(sql`
          SELECT 
            item->>'name' as product_name,
            p.total_inventory as current_stock,
            p.image_url as image_url,
            p.shopify_product_id as shopify_product_id,
            SUM((item->>'quantity')::int) as total_ordered,
            SUM(CASE WHEN o.workflow_status IN ('BOOKED','FULFILLED','DELIVERED','RETURN') THEN (item->>'quantity')::int ELSE 0 END) as committed,
            SUM(CASE WHEN o.workflow_status IN ('FULFILLED','DELIVERED','RETURN') THEN (item->>'quantity')::int ELSE 0 END) as dispatched,
            SUM(CASE WHEN o.workflow_status = 'DELIVERED' THEN (item->>'quantity')::int ELSE 0 END) as delivered,
            SUM(CASE WHEN o.workflow_status = 'RETURN' THEN (item->>'quantity')::int ELSE 0 END) as returned,
            SUM(CASE WHEN o.workflow_status = 'CANCELLED' THEN (item->>'quantity')::int ELSE 0 END) as cancelled,
            COUNT(DISTINCT o.id) as order_count
          FROM orders o
          CROSS JOIN LATERAL jsonb_array_elements(o.line_items) as item
          LEFT JOIN products p ON LOWER(TRIM(p.title)) = LOWER(TRIM(item->>'name')) AND p.merchant_id = o.merchant_id
          WHERE o.merchant_id = ${merchantId}
            AND o.line_items IS NOT NULL
            ${dateFilterSql}
          GROUP BY item->>'name', p.total_inventory, p.image_url, p.shopify_product_id
          ORDER BY total_ordered DESC
        `),
        db.execute(sql`
          SELECT 
            TO_CHAR(o.order_date, 'YYYY-MM-DD') as date,
            SUM((item->>'quantity')::int) as total_ordered,
            SUM(CASE WHEN o.workflow_status IN ('BOOKED','FULFILLED','DELIVERED','RETURN') THEN (item->>'quantity')::int ELSE 0 END) as committed,
            SUM(CASE WHEN o.workflow_status IN ('FULFILLED','DELIVERED','RETURN') THEN (item->>'quantity')::int ELSE 0 END) as dispatched,
            SUM(CASE WHEN o.workflow_status = 'DELIVERED' THEN (item->>'quantity')::int ELSE 0 END) as delivered,
            SUM(CASE WHEN o.workflow_status = 'RETURN' THEN (item->>'quantity')::int ELSE 0 END) as returned
          FROM orders o
          CROSS JOIN LATERAL jsonb_array_elements(o.line_items) as item
          WHERE o.merchant_id = ${merchantId}
            AND o.line_items IS NOT NULL
            AND o.order_date IS NOT NULL
            ${dateFilterSql}
          GROUP BY TO_CHAR(o.order_date, 'YYYY-MM-DD')
          ORDER BY date ASC
        `),
        db.execute(sql`
          SELECT 
            item->>'name' as product_name,
            TO_CHAR(o.order_date, 'YYYY-MM-DD') as date,
            SUM((item->>'quantity')::int) as total_ordered,
            SUM(CASE WHEN o.workflow_status IN ('FULFILLED','DELIVERED','RETURN') THEN (item->>'quantity')::int ELSE 0 END) as dispatched
          FROM orders o
          CROSS JOIN LATERAL jsonb_array_elements(o.line_items) as item
          WHERE o.merchant_id = ${merchantId}
            AND o.line_items IS NOT NULL
            AND o.order_date IS NOT NULL
            ${dateFilterSql}
          GROUP BY item->>'name', TO_CHAR(o.order_date, 'YYYY-MM-DD')
          ORDER BY date ASC
        `),
      ]);

      const productData = (productResults as any).rows || productResults;
      const trendData = (trendResults as any).rows || trendResults;
      const perProductDailyData = (perProductDailyResults as any).rows || perProductDailyResults;

      const products = (productData as any[]).map((r: any) => ({
        productName: r.product_name,
        currentStock: r.current_stock ? parseInt(r.current_stock) : null,
        imageUrl: r.image_url,
        shopifyProductId: r.shopify_product_id,
        totalOrdered: parseInt(r.total_ordered),
        committed: parseInt(r.committed),
        dispatched: parseInt(r.dispatched),
        delivered: parseInt(r.delivered),
        returned: parseInt(r.returned),
        cancelled: parseInt(r.cancelled),
        orderCount: parseInt(r.order_count),
      }));

      const dailyTrend = (trendData as any[]).map((r: any) => ({
        date: r.date,
        totalOrdered: parseInt(r.total_ordered),
        committed: parseInt(r.committed),
        dispatched: parseInt(r.dispatched),
        delivered: parseInt(r.delivered),
        returned: parseInt(r.returned),
      }));

      const perProductDaily: Record<string, Array<{ date: string; totalOrdered: number; dispatched: number }>> = {};
      (perProductDailyData as any[]).forEach((r: any) => {
        const name = r.product_name;
        if (!perProductDaily[name]) perProductDaily[name] = [];
        perProductDaily[name].push({
          date: r.date,
          totalOrdered: parseInt(r.total_ordered),
          dispatched: parseInt(r.dispatched),
        });
      });

      const totals = products.reduce(
        (acc, p) => ({
          totalOrdered: acc.totalOrdered + p.totalOrdered,
          committed: acc.committed + p.committed,
          dispatched: acc.dispatched + p.dispatched,
          delivered: acc.delivered + p.delivered,
          returned: acc.returned + p.returned,
          cancelled: acc.cancelled + p.cancelled,
          totalStock: acc.totalStock + (p.currentStock || 0),
        }),
        { totalOrdered: 0, committed: 0, dispatched: 0, delivered: 0, returned: 0, cancelled: 0, totalStock: 0 }
      );

      res.json({ products, dailyTrend, perProductDaily, totals });
    } catch (error: any) {
      console.error("[ProductAnalytics] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/products/:id", async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const product = await storage.getProductById(merchantId, req.params.id);
      if (!product) return res.status(404).json({ error: "Product not found" });
      res.json(product);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/products/:id/purchases", async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const product = await storage.getProductById(merchantId, req.params.id);
      if (!product) return res.status(404).json({ error: "Product not found" });

      const results = await db.execute(sql`
        SELECT 
          o.id,
          o.order_number,
          o.customer_name,
          o.customer_phone,
          o.workflow_status,
          o.order_date,
          (item->>'quantity')::int as quantity,
          item->>'price' as unit_price
        FROM orders o
        CROSS JOIN LATERAL jsonb_array_elements(o.line_items) as item
        WHERE o.merchant_id = ${merchantId}
          AND o.line_items IS NOT NULL
          AND (
            item->>'productId' = ${product.shopifyProductId}
            OR (item->>'productId' IS NULL AND LOWER(TRIM(item->>'name')) = LOWER(TRIM(${product.title})))
          )
        ORDER BY o.order_date DESC
        LIMIT 100
      `);

      const rows = (results as any).rows || results;
      const purchases = (rows as any[]).map((r: any) => ({
        orderId: r.id,
        orderNumber: r.order_number,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        workflowStatus: r.workflow_status,
        orderDate: r.order_date,
        quantity: parseInt(r.quantity) || 0,
        unitPrice: r.unit_price,
      }));

      res.json({ purchases, totalPurchases: purchases.length });
    } catch (error: any) {
      console.error("Error fetching product purchases:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/products/sync", async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const store = await storage.getShopifyStore(merchantId);
      if (!store || !store.accessToken || !store.shopDomain || !store.isConnected) {
        return res.status(400).json({ error: "Shopify store not connected" });
      }

      const accessToken = decryptToken(store.accessToken);
      const shopifyProducts = await shopifyService.fetchAllProducts(store.shopDomain, accessToken);

      const allInventoryItemIds: string[] = [];
      let variantsWithoutInvId = 0;
      let totalVariants = 0;
      for (const sp of shopifyProducts) {
        for (const v of (sp.variants || [])) {
          totalVariants++;
          if (v.inventory_item_id) {
            allInventoryItemIds.push(String(v.inventory_item_id));
          } else {
            variantsWithoutInvId++;
          }
        }
      }

      console.log(`[Products Sync] ${totalVariants} total variants, ${allInventoryItemIds.length} with inventory_item_id, ${variantsWithoutInvId} without`);
      const costMap = await shopifyService.fetchInventoryItemCosts(store.shopDomain, accessToken, allInventoryItemIds);
      const costsFound = Array.from(costMap.values()).filter(v => v !== null && v !== "0.00").length;
      console.log(`[Products Sync] Cost data: ${costMap.size} items queried, ${costsFound} with non-zero cost values`);

      let synced = 0;
      for (const sp of shopifyProducts) {
        const totalInventory = (sp.variants || []).reduce((sum: number, v: any) => sum + (v.inventory_quantity || 0), 0);
        const variantsData = (sp.variants || []).map((v: any) => {
          const invItemId = v.inventory_item_id ? String(v.inventory_item_id) : null;
          return {
            id: String(v.id),
            title: v.title,
            sku: v.sku,
            price: v.price,
            compareAtPrice: v.compare_at_price,
            cost: invItemId ? (costMap.get(invItemId) ?? null) : null,
            inventoryQuantity: v.inventory_quantity || 0,
            inventoryItemId: invItemId,
            weight: v.weight,
            weightUnit: v.weight_unit,
            option1: v.option1,
            option2: v.option2,
            option3: v.option3,
          };
        });
        const imagesData = (sp.images || []).map((img: any) => ({
          id: String(img.id),
          src: img.src,
          alt: img.alt,
          position: img.position,
          width: img.width,
          height: img.height,
        }));

        await storage.upsertProduct(merchantId, String(sp.id), {
          title: sp.title,
          handle: sp.handle,
          vendor: sp.vendor,
          productType: sp.product_type,
          status: sp.status,
          imageUrl: sp.image?.src || (sp.images?.length > 0 ? sp.images[0].src : null),
          images: imagesData,
          tags: sp.tags || "",
          totalInventory,
          variants: variantsData,
        });
        synced++;
      }

      // Auto-backfill order line item images after product sync
      try {
        await backfillOrderLineItemImages(merchantId);
      } catch (backfillErr) {
        console.error("[Products Sync] Backfill warning:", backfillErr);
      }

      res.json({ success: true, synced, total: shopifyProducts.length });
    } catch (error: any) {
      console.error("[Products Sync] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Backfill order line item images from products table + raw_shopify_data
  async function backfillOrderLineItemImages(merchantId: string) {
    const { products: allProducts } = await storage.getProducts(merchantId, { pageSize: 10000 });

    // Build shopifyProductId → imageUrl map
    const productImageMap = new Map<string, string>();
    // Also build product title → imageUrl map for name-based fallback
    const productTitleMap = new Map<string, string>();
    for (const p of allProducts) {
      if (p.imageUrl) {
        productImageMap.set(p.shopifyProductId, p.imageUrl);
        productTitleMap.set(p.title.toLowerCase().trim(), p.imageUrl);
      }
    }

    let updated = 0;
    let page = 1;
    const pageSize = 100;
    while (true) {
      const { orders: batch, total } = await storage.getOrders(merchantId, { page, pageSize });
      if (batch.length === 0) break;

      for (const order of batch) {
        const lineItems = order.lineItems as Array<{ name: string; quantity: number; price: string | number; sku?: string; image?: string | null; productId?: string | null; variantId?: string | null; variantTitle?: string | null }> | null;
        if (!lineItems || lineItems.length === 0) continue;

        // Extract product data from raw_shopify_data using title-based matching
        const rawData = order.rawShopifyData as any;
        const rawLineItems = rawData?.line_items as Array<{ product_id?: number; variant_id?: number; variant_title?: string | null; title?: string; image?: { src?: string } }> | undefined;

        // Build title-based lookup from raw data (safe, not index-based)
        const rawByTitle = new Map<string, typeof rawLineItems extends Array<infer T> ? T : never>();
        if (rawLineItems) {
          for (const raw of rawLineItems) {
            if (raw.title) rawByTitle.set(raw.title.toLowerCase().trim(), raw as any);
          }
        }

        let changed = false;
        const enrichedItems = lineItems.map(item => {
          const updates: any = { ...item };
          // Match raw item by title, not by index
          const rawItem = rawByTitle.get((item.name || '').toLowerCase().trim());

          // Fill in productId from raw data if missing
          if (!updates.productId && rawItem?.product_id) {
            updates.productId = String(rawItem.product_id);
            changed = true;
          }
          if (!updates.variantId && rawItem?.variant_id) {
            updates.variantId = String(rawItem.variant_id);
            changed = true;
          }
          if (!updates.variantTitle && rawItem?.variant_title) {
            updates.variantTitle = rawItem.variant_title;
            changed = true;
          }

          // Now try to fill in image
          if (!updates.image) {
            // Try 1: Use raw Shopify line item image
            if (rawItem?.image?.src) {
              updates.image = rawItem.image.src;
              changed = true;
            }
            // Try 2: Match by productId from products table
            else if (updates.productId && productImageMap.has(updates.productId)) {
              updates.image = productImageMap.get(updates.productId);
              changed = true;
            }
            // Try 3: Match by product title
            else {
              const titleKey = (updates.name || '').toLowerCase().trim();
              if (titleKey && productTitleMap.has(titleKey)) {
                updates.image = productTitleMap.get(titleKey);
                changed = true;
              }
            }
          }

          return updates;
        });

        if (changed) {
          await storage.updateOrder(merchantId, order.id, { lineItems: enrichedItems } as any);
          updated++;
        }
      }

      if (page * pageSize >= total) break;
      page++;
    }
    console.log(`[Backfill] Updated ${updated} orders with product images for merchant ${merchantId}`);
    return updated;
  }

  app.post("/api/products/backfill-images", async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const updated = await backfillOrderLineItemImages(merchantId);
      res.json({ success: true, updated });
    } catch (error: any) {
      console.error("[Backfill] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // ACCOUNTING - EXPENSES
  // ============================================

  app.get("/api/expenses", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { category, startDate, endDate } = req.query;
      let query = db.select().from(expenses).where(eq(expenses.merchantId, merchantId));
      const conditions: any[] = [eq(expenses.merchantId, merchantId)];
      if (category && category !== "all") conditions.push(eq(expenses.category, category as string));
      if (startDate) conditions.push(gte(expenses.date, new Date(startDate as string)));
      if (endDate) conditions.push(lte(expenses.date, new Date(endDate as string)));
      const results = await db.select().from(expenses).where(and(...conditions)).orderBy(desc(expenses.date));
      res.json(results);
    } catch (error: any) {
      console.error("[Expenses] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/expenses", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const schema = z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        amount: z.string().or(z.number()),
        category: z.string().min(1),
        date: z.string(),
        paymentMethod: z.string().optional(),
        reference: z.string().optional(),
        isRecurring: z.boolean().optional(),
        recurringFrequency: z.string().optional(),
        notes: z.string().optional(),
      });
      const parsed = schema.parse(req.body);
      const [result] = await db.insert(expenses).values({
        merchantId,
        title: parsed.title,
        description: parsed.description || null,
        amount: String(parsed.amount),
        category: parsed.category,
        date: new Date(parsed.date),
        paymentMethod: parsed.paymentMethod || null,
        reference: parsed.reference || null,
        isRecurring: parsed.isRecurring || false,
        recurringFrequency: parsed.recurringFrequency || null,
        notes: parsed.notes || null,
      }).returning();
      res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
      console.error("[Expenses] Create error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/expenses/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { id } = req.params;
      const schema = z.object({
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        amount: z.string().or(z.number()).optional(),
        category: z.string().min(1).optional(),
        date: z.string().optional(),
        paymentMethod: z.string().optional(),
        reference: z.string().optional(),
        isRecurring: z.boolean().optional(),
        recurringFrequency: z.string().optional(),
        notes: z.string().optional(),
      });
      const parsed = schema.parse(req.body);
      const updateData: any = {};
      if (parsed.title !== undefined) updateData.title = parsed.title;
      if (parsed.description !== undefined) updateData.description = parsed.description;
      if (parsed.amount !== undefined) updateData.amount = String(parsed.amount);
      if (parsed.category !== undefined) updateData.category = parsed.category;
      if (parsed.date !== undefined) updateData.date = new Date(parsed.date);
      if (parsed.paymentMethod !== undefined) updateData.paymentMethod = parsed.paymentMethod;
      if (parsed.reference !== undefined) updateData.reference = parsed.reference;
      if (parsed.isRecurring !== undefined) updateData.isRecurring = parsed.isRecurring;
      if (parsed.recurringFrequency !== undefined) updateData.recurringFrequency = parsed.recurringFrequency;
      if (parsed.notes !== undefined) updateData.notes = parsed.notes;
      updateData.updatedAt = new Date();
      const [result] = await db.update(expenses).set(updateData).where(and(eq(expenses.id, id), eq(expenses.merchantId, merchantId))).returning();
      if (!result) return res.status(404).json({ error: "Expense not found" });
      res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
      console.error("[Expenses] Update error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/expenses/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { id } = req.params;
      const [result] = await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.merchantId, merchantId))).returning();
      if (!result) return res.status(404).json({ error: "Expense not found" });
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Expenses] Delete error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/expenses/summary", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { startDate, endDate } = req.query;
      const conditions: any[] = [eq(expenses.merchantId, merchantId)];
      if (startDate) conditions.push(gte(expenses.date, new Date(startDate as string)));
      if (endDate) conditions.push(lte(expenses.date, new Date(endDate as string)));
      const results = await db.select({
        category: expenses.category,
        total: sql<string>`SUM(${expenses.amount}::numeric)`,
        count: sql<number>`COUNT(*)::int`,
      }).from(expenses).where(and(...conditions)).groupBy(expenses.category);
      const totalResult = await db.select({
        total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)`,
      }).from(expenses).where(and(...conditions));
      res.json({ byCategory: results, total: totalResult[0]?.total || "0" });
    } catch (error: any) {
      console.error("[Expenses] Summary error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // ACCOUNTING - STOCK LEDGER
  // ============================================

  app.get("/api/stock-ledger", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { type, startDate, endDate } = req.query;
      const conditions: any[] = [eq(stockLedger.merchantId, merchantId)];
      if (type && type !== "all") conditions.push(eq(stockLedger.type, type as string));
      if (startDate) conditions.push(gte(stockLedger.date, new Date(startDate as string)));
      if (endDate) conditions.push(lte(stockLedger.date, new Date(endDate as string)));
      const results = await db.select().from(stockLedger).where(and(...conditions)).orderBy(desc(stockLedger.date));
      res.json(results);
    } catch (error: any) {
      console.error("[StockLedger] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/stock-ledger", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const schema = z.object({
        type: z.enum(["incoming", "outgoing", "return"]),
        productName: z.string().min(1),
        sku: z.string().optional(),
        quantity: z.number().int().positive(),
        unitPrice: z.string().or(z.number()),
        totalValue: z.string().or(z.number()),
        supplier: z.string().optional(),
        reference: z.string().optional(),
        date: z.string(),
        notes: z.string().optional(),
      });
      const parsed = schema.parse(req.body);
      const [result] = await db.insert(stockLedger).values({
        merchantId,
        type: parsed.type,
        productName: parsed.productName,
        sku: parsed.sku || null,
        quantity: parsed.quantity,
        unitPrice: String(parsed.unitPrice),
        totalValue: String(parsed.totalValue),
        supplier: parsed.supplier || null,
        reference: parsed.reference || null,
        date: new Date(parsed.date),
        notes: parsed.notes || null,
      }).returning();
      res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
      console.error("[StockLedger] Create error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/stock-ledger/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { id } = req.params;
      const schema = z.object({
        type: z.enum(["incoming", "outgoing", "return"]).optional(),
        productName: z.string().min(1).optional(),
        sku: z.string().optional(),
        quantity: z.number().int().positive().optional(),
        unitPrice: z.string().or(z.number()).optional(),
        totalValue: z.string().or(z.number()).optional(),
        supplier: z.string().optional(),
        reference: z.string().optional(),
        date: z.string().optional(),
        notes: z.string().optional(),
      });
      const parsed = schema.parse(req.body);
      const updateData: any = {};
      if (parsed.type !== undefined) updateData.type = parsed.type;
      if (parsed.productName !== undefined) updateData.productName = parsed.productName;
      if (parsed.sku !== undefined) updateData.sku = parsed.sku;
      if (parsed.quantity !== undefined) updateData.quantity = parsed.quantity;
      if (parsed.unitPrice !== undefined) updateData.unitPrice = String(parsed.unitPrice);
      if (parsed.totalValue !== undefined) updateData.totalValue = String(parsed.totalValue);
      if (parsed.supplier !== undefined) updateData.supplier = parsed.supplier;
      if (parsed.reference !== undefined) updateData.reference = parsed.reference;
      if (parsed.date !== undefined) updateData.date = new Date(parsed.date);
      if (parsed.notes !== undefined) updateData.notes = parsed.notes;
      updateData.updatedAt = new Date();
      const [result] = await db.update(stockLedger).set(updateData).where(and(eq(stockLedger.id, id), eq(stockLedger.merchantId, merchantId))).returning();
      if (!result) return res.status(404).json({ error: "Entry not found" });
      res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
      console.error("[StockLedger] Update error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/stock-ledger/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { id } = req.params;
      const [result] = await db.delete(stockLedger).where(and(eq(stockLedger.id, id), eq(stockLedger.merchantId, merchantId))).returning();
      if (!result) return res.status(404).json({ error: "Entry not found" });
      res.json({ success: true });
    } catch (error: any) {
      console.error("[StockLedger] Delete error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/stock-ledger/summary", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { startDate, endDate } = req.query;
      const conditions: any[] = [eq(stockLedger.merchantId, merchantId)];
      if (startDate) conditions.push(gte(stockLedger.date, new Date(startDate as string)));
      if (endDate) conditions.push(lte(stockLedger.date, new Date(endDate as string)));
      const results = await db.select({
        type: stockLedger.type,
        totalQty: sql<number>`COALESCE(SUM(${stockLedger.quantity}), 0)::int`,
        totalValue: sql<string>`COALESCE(SUM(${stockLedger.totalValue}::numeric), 0)`,
        count: sql<number>`COUNT(*)::int`,
      }).from(stockLedger).where(and(...conditions)).groupBy(stockLedger.type);
      res.json(results);
    } catch (error: any) {
      console.error("[StockLedger] Summary error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // ACCOUNTING - COURIER DUES
  // ============================================

  app.get("/api/courier-dues", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { courierName, status, startDate, endDate } = req.query;
      const conditions: any[] = [eq(courierDues.merchantId, merchantId)];
      if (courierName && courierName !== "all") conditions.push(eq(courierDues.courierName, courierName as string));
      if (status && status !== "all") conditions.push(eq(courierDues.status, status as string));
      if (startDate) conditions.push(gte(courierDues.date, new Date(startDate as string)));
      if (endDate) conditions.push(lte(courierDues.date, new Date(endDate as string)));
      const results = await db.select().from(courierDues).where(and(...conditions)).orderBy(desc(courierDues.date));
      res.json(results);
    } catch (error: any) {
      console.error("[CourierDues] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/courier-dues", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const schema = z.object({
        courierName: z.string().min(1),
        type: z.enum(["payable", "receivable"]),
        amount: z.string().or(z.number()),
        description: z.string().optional(),
        reference: z.string().optional(),
        dueDate: z.string().optional(),
        status: z.string().optional(),
        date: z.string(),
        notes: z.string().optional(),
      });
      const parsed = schema.parse(req.body);
      const [result] = await db.insert(courierDues).values({
        merchantId,
        courierName: parsed.courierName,
        type: parsed.type,
        amount: String(parsed.amount),
        description: parsed.description || null,
        reference: parsed.reference || null,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
        status: parsed.status || "pending",
        date: new Date(parsed.date),
        notes: parsed.notes || null,
      }).returning();
      res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
      console.error("[CourierDues] Create error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/courier-dues/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { id } = req.params;
      const schema = z.object({
        courierName: z.string().min(1).optional(),
        type: z.enum(["payable", "receivable"]).optional(),
        amount: z.string().or(z.number()).optional(),
        description: z.string().optional(),
        reference: z.string().optional(),
        dueDate: z.string().nullable().optional(),
        status: z.string().optional(),
        paidDate: z.string().nullable().optional(),
        date: z.string().optional(),
        notes: z.string().optional(),
      });
      const parsed = schema.parse(req.body);
      const updateData: any = {};
      if (parsed.courierName !== undefined) updateData.courierName = parsed.courierName;
      if (parsed.type !== undefined) updateData.type = parsed.type;
      if (parsed.amount !== undefined) updateData.amount = String(parsed.amount);
      if (parsed.description !== undefined) updateData.description = parsed.description;
      if (parsed.reference !== undefined) updateData.reference = parsed.reference;
      if (parsed.dueDate !== undefined) updateData.dueDate = parsed.dueDate ? new Date(parsed.dueDate) : null;
      if (parsed.status !== undefined) updateData.status = parsed.status;
      if (parsed.paidDate !== undefined) updateData.paidDate = parsed.paidDate ? new Date(parsed.paidDate) : null;
      if (parsed.date !== undefined) updateData.date = new Date(parsed.date);
      if (parsed.notes !== undefined) updateData.notes = parsed.notes;
      updateData.updatedAt = new Date();
      const [result] = await db.update(courierDues).set(updateData).where(and(eq(courierDues.id, id), eq(courierDues.merchantId, merchantId))).returning();
      if (!result) return res.status(404).json({ error: "Due not found" });
      res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
      console.error("[CourierDues] Update error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/courier-dues/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { id } = req.params;
      const [result] = await db.delete(courierDues).where(and(eq(courierDues.id, id), eq(courierDues.merchantId, merchantId))).returning();
      if (!result) return res.status(404).json({ error: "Due not found" });
      res.json({ success: true });
    } catch (error: any) {
      console.error("[CourierDues] Delete error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/courier-dues/summary", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { startDate, endDate } = req.query;
      const conditions: any[] = [eq(courierDues.merchantId, merchantId)];
      if (startDate) conditions.push(gte(courierDues.date, new Date(startDate as string)));
      if (endDate) conditions.push(lte(courierDues.date, new Date(endDate as string)));
      const results = await db.select({
        courierName: courierDues.courierName,
        type: courierDues.type,
        status: courierDues.status,
        total: sql<string>`COALESCE(SUM(${courierDues.amount}::numeric), 0)`,
        count: sql<number>`COUNT(*)::int`,
      }).from(courierDues).where(and(...conditions)).groupBy(courierDues.courierName, courierDues.type, courierDues.status);
      res.json(results);
    } catch (error: any) {
      console.error("[CourierDues] Summary error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // ACCOUNTING - FINANCIAL DASHBOARD
  // ============================================

  app.get("/api/financial-overview", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { startDate, endDate } = req.query;

      const expenseConditions: any[] = [eq(expenses.merchantId, merchantId)];
      const stockConditions: any[] = [eq(stockLedger.merchantId, merchantId)];
      const dueConditions: any[] = [eq(courierDues.merchantId, merchantId)];
      if (startDate) {
        const sd = new Date(startDate as string);
        expenseConditions.push(gte(expenses.date, sd));
        stockConditions.push(gte(stockLedger.date, sd));
        dueConditions.push(gte(courierDues.date, sd));
      }
      if (endDate) {
        const ed = new Date(endDate as string);
        expenseConditions.push(lte(expenses.date, ed));
        stockConditions.push(lte(stockLedger.date, ed));
        dueConditions.push(lte(courierDues.date, ed));
      }

      const [expenseTotal] = await db.select({
        total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)`,
        count: sql<number>`COUNT(*)::int`,
      }).from(expenses).where(and(...expenseConditions));

      const expensesByCategory = await db.select({
        category: expenses.category,
        total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)`,
      }).from(expenses).where(and(...expenseConditions)).groupBy(expenses.category).orderBy(desc(sql`SUM(${expenses.amount}::numeric)`));

      const stockSummary = await db.select({
        type: stockLedger.type,
        totalQty: sql<number>`COALESCE(SUM(${stockLedger.quantity}), 0)::int`,
        totalValue: sql<string>`COALESCE(SUM(${stockLedger.totalValue}::numeric), 0)`,
      }).from(stockLedger).where(and(...stockConditions)).groupBy(stockLedger.type);

      const courierSummary = await db.select({
        courierName: courierDues.courierName,
        type: courierDues.type,
        status: courierDues.status,
        total: sql<string>`COALESCE(SUM(${courierDues.amount}::numeric), 0)`,
      }).from(courierDues).where(and(...dueConditions)).groupBy(courierDues.courierName, courierDues.type, courierDues.status);

      const monthlyExpenses = await db.select({
        month: sql<string>`TO_CHAR(${expenses.date}, 'YYYY-MM')`,
        total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)`,
      }).from(expenses).where(and(...expenseConditions)).groupBy(sql`TO_CHAR(${expenses.date}, 'YYYY-MM')`).orderBy(sql`TO_CHAR(${expenses.date}, 'YYYY-MM')`);

      const recentExpenses = await db.select().from(expenses).where(and(...expenseConditions)).orderBy(desc(expenses.date)).limit(5);

      // Revenue from delivered orders
      const orderConditions: any[] = [eq(orders.merchantId, merchantId), eq(orders.workflowStatus, "DELIVERED")];
      if (startDate) orderConditions.push(gte(orders.orderDate, new Date(startDate as string)));
      if (endDate) orderConditions.push(lte(orders.orderDate, new Date(endDate as string)));
      const [orderRevenue] = await db.select({
        total: sql<string>`COALESCE(SUM(${orders.totalPrice}::numeric), 0)`,
        count: sql<number>`COUNT(*)::int`,
      }).from(orders).where(and(...orderConditions));

      res.json({
        expenses: { total: expenseTotal.total, count: expenseTotal.count, byCategory: expensesByCategory, monthly: monthlyExpenses, recent: recentExpenses },
        stock: stockSummary,
        courierDues: courierSummary,
        revenue: { total: orderRevenue.total, deliveredOrders: orderRevenue.count },
      });
    } catch (error: any) {
      console.error("[FinancialOverview] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
