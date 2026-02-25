import { Express, Response } from "express";
import { db } from "../db";
import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { z } from "zod";
import { adCampaigns, adAccounts, teamMembers, merchants, adProfitabilityEntries, orders, products } from "@shared/schema";
import {
  fullSync,
  quickSyncToday,
  getInsightsSummary,
  getInsightsForTable,
  getDailyInsights,
  getAdAccountInfo,
  getLastSyncInfo,
  getSyncRunStatus,
  getCredentialsForMerchant,
  testFacebookConnection,
} from "../services/metaAds";
import { encryptToken } from "../services/encryption";

function isAuthenticated(req: any, res: Response, next: Function) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

async function getMerchantId(req: any): Promise<string> {
  const userId = req.session?.userId;
  if (!userId) throw new Error("Not authenticated");
  const members = await db.select().from(teamMembers).where(eq(teamMembers.userId, userId));
  if (members.length === 0) throw new Error("No merchant found");
  return members[0].merchantId;
}

function getDateRange(req: any): { dateFrom: string; dateTo: string } {
  const { preset, dateFrom: qFrom, dateTo: qTo } = req.query;
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  if (qFrom && qTo) {
    return { dateFrom: qFrom, dateTo: qTo };
  }

  switch (preset) {
    case "today":
      return { dateFrom: today, dateTo: today };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { dateFrom: y.toISOString().split("T")[0], dateTo: y.toISOString().split("T")[0] };
    }
    case "last7": {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { dateFrom: d.toISOString().split("T")[0], dateTo: today };
    }
    case "last14": {
      const d = new Date(now);
      d.setDate(d.getDate() - 13);
      return { dateFrom: d.toISOString().split("T")[0], dateTo: today };
    }
    case "last30": {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { dateFrom: d.toISOString().split("T")[0], dateTo: today };
    }
    case "mtd": {
      const mtd = new Date(now.getFullYear(), now.getMonth(), 1);
      return { dateFrom: mtd.toISOString().split("T")[0], dateTo: today };
    }
    default: {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { dateFrom: d.toISOString().split("T")[0], dateTo: today };
    }
  }
}

export function registerMarketingRoutes(app: Express) {

  app.post("/api/marketing/sync", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { dateFrom, dateTo, level, force } = req.body || {};
      const result = await fullSync(merchantId, {
        dateFrom,
        dateTo,
        level: level || "campaign",
        force: force || false,
      });
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[Marketing] Sync error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketing/meta/sync", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { dateFrom, dateTo, level, force } = req.body || {};
      const result = await fullSync(merchantId, {
        dateFrom,
        dateTo,
        level: level || "campaign",
        force: force || false,
      });
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[Marketing] Meta sync error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketing/meta/insights", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { dateFrom, dateTo } = getDateRange(req);
      const level = (req.query.level as string) || "campaign";
      const statusFilter = req.query.status ? (req.query.status as string).split(",") : undefined;
      const search = req.query.search as string | undefined;

      if (!["campaign", "adset", "ad"].includes(level)) {
        return res.status(400).json({ error: "Invalid level. Must be campaign, adset, or ad." });
      }

      const result = await getInsightsForTable(merchantId, {
        level: level as "campaign" | "adset" | "ad",
        dateFrom,
        dateTo,
        statusFilter,
        search,
      });

      const account = await getAdAccountInfo(merchantId);

      res.json({
        rows: result.rows,
        totals: result.totals,
        dateFrom,
        dateTo,
        level,
        currency: account?.currency || "PKR",
        timezone: account?.timezone || "Asia/Karachi",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketing/meta/insights/csv", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { dateFrom, dateTo } = getDateRange(req);
      const level = (req.query.level as string) || "campaign";
      const statusFilter = req.query.status ? (req.query.status as string).split(",") : undefined;

      const result = await getInsightsForTable(merchantId, {
        level: level as "campaign" | "adset" | "ad",
        dateFrom,
        dateTo,
        statusFilter,
      });

      const headers = [
        "Name", "Status", "Objective", "Spend", "Purchases", "Purchase Value", "ROAS",
        "Cost Per Purchase", "Impressions", "Reach", "Frequency", "Link Clicks",
        "Landing Page Views", "CTR", "CPC", "CPM", "View Content", "Add to Cart",
        "Initiate Checkout", "Cost per Checkout", "Cost per Add to Cart",
      ];

      const n = (v: any, dec = 2) => (Number(v) || 0).toFixed(dec);
      const csvRows = result.rows.map((r: any) => [
        `"${(r.name || "").replace(/"/g, '""')}"`,
        r.status || "",
        r.objective || "",
        n(r.spend),
        r.purchases || 0,
        n(r.purchaseValue),
        n(r.roas),
        n(r.costPerPurchase),
        r.impressions || 0,
        r.reach || 0,
        n(r.frequency),
        r.linkClicks || 0,
        r.landingPageViews || 0,
        n(r.ctr),
        n(r.cpc),
        n(r.cpm),
        r.viewContent || 0,
        r.addToCart || 0,
        r.initiateCheckout || 0,
        n(r.costPerCheckout),
        n(r.costPerAddToCart),
      ].join(","));

      const csv = [headers.join(","), ...csvRows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="ads-report-${level}-${dateFrom}-${dateTo}.csv"`);
      res.send(csv);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketing/meta/status", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const lastSync = await getLastSyncInfo(merchantId);
      const syncRuns = await getSyncRunStatus(merchantId);
      const account = await getAdAccountInfo(merchantId);

      let hasCredentials = false;
      let credentialSource: "merchant" | "environment" | "none" = "none";
      try {
        const [merchant] = await db.select({
          facebookAccessToken: merchants.facebookAccessToken,
          facebookAdAccountId: merchants.facebookAdAccountId,
        }).from(merchants).where(eq(merchants.id, merchantId));
        if (merchant?.facebookAccessToken && merchant?.facebookAdAccountId) {
          hasCredentials = true;
          credentialSource = "merchant";
        } else if (process.env.FACEBOOK_ACCESS_TOKEN && process.env.FACEBOOK_AD_ACCOUNT_ID) {
          hasCredentials = true;
          credentialSource = "environment";
        }
      } catch {}

      res.json({
        hasCredentials,
        credentialSource,
        lastSync,
        syncRuns,
        account: account ? { currency: account.currency, timezone: account.timezone, name: account.name, status: account.status } : null,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketing/summary", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { dateFrom, dateTo } = getDateRange(req);
      const summary = await getInsightsSummary(merchantId, dateFrom, dateTo);
      res.json({ ...summary, dateFrom, dateTo });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketing/campaigns", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { dateFrom, dateTo } = getDateRange(req);
      const result = await getInsightsForTable(merchantId, {
        level: "campaign",
        dateFrom,
        dateTo,
      });
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketing/daily", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { dateFrom, dateTo } = getDateRange(req);
      const daily = await getDailyInsights(merchantId, dateFrom, dateTo);
      res.json(daily);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketing/active-campaigns", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const today = new Date().toISOString().split("T")[0];
      const result = await getInsightsForTable(merchantId, {
        level: "campaign",
        dateFrom: today,
        dateTo: today,
        statusFilter: ["ACTIVE"],
      });
      res.json(result.rows.map(r => ({
        ...r,
        todaySpend: r.spend,
        todayRevenue: r.purchaseValue,
        todayPurchases: r.purchases,
        todayImpressions: r.impressions,
        todayClicks: r.clicks,
        todayRoas: r.roas,
      })));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketing/sync-status", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const lastSync = await getLastSyncInfo(merchantId);
      let hasCredentials = false;
      let credentialSource: "merchant" | "environment" | "none" = "none";
      try {
        const [merchant] = await db.select({
          facebookAccessToken: merchants.facebookAccessToken,
          facebookAdAccountId: merchants.facebookAdAccountId,
        }).from(merchants).where(eq(merchants.id, merchantId));
        if (merchant?.facebookAccessToken && merchant?.facebookAdAccountId) {
          hasCredentials = true;
          credentialSource = "merchant";
        } else if (process.env.FACEBOOK_ACCESS_TOKEN && process.env.FACEBOOK_AD_ACCOUNT_ID) {
          hasCredentials = true;
          credentialSource = "environment";
        }
      } catch {}
      res.json({ lastSync, hasCredentials, credentialSource });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketing/all-campaigns", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const campaigns = await db.select().from(adCampaigns).where(eq(adCampaigns.merchantId, merchantId));
      res.json(campaigns);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketing/credentials", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const [merchant] = await db.select({
        facebookAppId: merchants.facebookAppId,
        facebookAppSecret: merchants.facebookAppSecret,
        facebookAccessToken: merchants.facebookAccessToken,
        facebookAdAccountId: merchants.facebookAdAccountId,
      }).from(merchants).where(eq(merchants.id, merchantId));

      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }

      const mask = (val: string | null) => val ? `${"•".repeat(Math.min(val.length, 20))}${val.slice(-4)}` : "";

      res.json({
        facebookAppId: merchant.facebookAppId || "",
        facebookAppSecret: merchant.facebookAppSecret ? mask(merchant.facebookAppSecret) : "",
        facebookAccessToken: merchant.facebookAccessToken ? mask(merchant.facebookAccessToken) : "",
        facebookAdAccountId: merchant.facebookAdAccountId || "",
        hasAppId: !!merchant.facebookAppId,
        hasAppSecret: !!merchant.facebookAppSecret,
        hasAccessToken: !!merchant.facebookAccessToken,
        hasAdAccountId: !!merchant.facebookAdAccountId,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const credentialsSchema = z.object({
    facebookAppId: z.string().optional(),
    facebookAppSecret: z.string().optional(),
    facebookAccessToken: z.string().optional(),
    facebookAdAccountId: z.string().optional(),
  });

  app.put("/api/marketing/credentials", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      }

      const updates: Record<string, any> = { updatedAt: new Date() };
      const data = parsed.data;

      if (data.facebookAppId !== undefined) updates.facebookAppId = data.facebookAppId || null;
      if (data.facebookAdAccountId !== undefined) updates.facebookAdAccountId = data.facebookAdAccountId || null;
      if (data.facebookAppSecret !== undefined && !data.facebookAppSecret.includes("•")) {
        updates.facebookAppSecret = data.facebookAppSecret ? encryptToken(data.facebookAppSecret) : null;
      }
      if (data.facebookAccessToken !== undefined && !data.facebookAccessToken.includes("•")) {
        updates.facebookAccessToken = data.facebookAccessToken ? encryptToken(data.facebookAccessToken) : null;
      }

      await db.update(merchants).set(updates).where(eq(merchants.id, merchantId));

      res.json({ success: true, message: "Facebook credentials saved successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketing/test-connection", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const creds = await getCredentialsForMerchant(merchantId);
      const result = await testFacebookConnection(creds);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/marketing/profitability", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const entries = await db
        .select()
        .from(adProfitabilityEntries)
        .where(eq(adProfitabilityEntries.merchantId, merchantId))
        .orderBy(adProfitabilityEntries.createdAt);
      res.json({ entries });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketing/profitability", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const schema = z.object({
        campaignName: z.string().min(1),
        productId: z.string().nullable().optional(),
        adSpend: z.string().refine((v) => !isNaN(Number(v)), "Must be a number").default("0"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

      const [entry] = await db.insert(adProfitabilityEntries).values({
        merchantId,
        campaignName: parsed.data.campaignName,
        productId: parsed.data.productId || null,
        adSpend: parsed.data.adSpend,
      }).returning();

      res.json({ entry });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/marketing/profitability/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { id } = req.params;
      const schema = z.object({
        campaignName: z.string().min(1).optional(),
        productId: z.string().nullable().optional(),
        adSpend: z.string().refine((v) => !isNaN(Number(v)), "Must be a number").optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (parsed.data.campaignName !== undefined) updates.campaignName = parsed.data.campaignName;
      if (parsed.data.productId !== undefined) updates.productId = parsed.data.productId;
      if (parsed.data.adSpend !== undefined) updates.adSpend = parsed.data.adSpend;

      const [entry] = await db
        .update(adProfitabilityEntries)
        .set(updates)
        .where(and(eq(adProfitabilityEntries.id, id), eq(adProfitabilityEntries.merchantId, merchantId)))
        .returning();

      if (!entry) return res.status(404).json({ error: "Entry not found" });
      res.json({ entry });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/marketing/profitability/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { id } = req.params;
      await db
        .delete(adProfitabilityEntries)
        .where(and(eq(adProfitabilityEntries.id, id), eq(adProfitabilityEntries.merchantId, merchantId)));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketing/profitability/stats", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { productIds, dateFrom, dateTo } = req.query;

      if (!productIds) return res.json({ stats: {} });

      const ids = (productIds as string).split(",").filter(Boolean);
      if (ids.length === 0) return res.json({ stats: {} });

      const productRows = await db
        .select({
          id: products.id,
          shopifyProductId: products.shopifyProductId,
          title: products.title,
          variants: products.variants,
        })
        .from(products)
        .where(and(eq(products.merchantId, merchantId), inArray(products.id, ids)));

      const shopifyProductIds = productRows.map(p => p.shopifyProductId);
      if (shopifyProductIds.length === 0) return res.json({ stats: {} });

      const conditions: any[] = [eq(orders.merchantId, merchantId)];
      if (dateFrom) conditions.push(gte(orders.orderDate, new Date(dateFrom as string)));
      if (dateTo) {
        const toDate = new Date(dateTo as string);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(orders.orderDate, toDate));
      }

      const allOrders = await db
        .select({
          id: orders.id,
          lineItems: orders.lineItems,
          workflowStatus: orders.workflowStatus,
        })
        .from(orders)
        .where(and(...conditions));

      const stats: Record<string, {
        totalOrders: number;
        dispatched: number;
        delivered: number;
        salePrice: number;
        costPrice: number;
        productTitle: string;
      }> = {};

      const shopifyIdToProductId = new Map<string, string>();
      for (const p of productRows) {
        shopifyIdToProductId.set(String(p.shopifyProductId), p.id);
        let salePrice = 0;
        let costPrice = 0;
        const variants = p.variants as any[];
        if (variants && Array.isArray(variants) && variants.length > 0) {
          salePrice = parseFloat(variants[0].price || "0");
          costPrice = parseFloat(variants[0].cost || "0");
        }
        stats[p.id] = { totalOrders: 0, dispatched: 0, delivered: 0, salePrice, costPrice, productTitle: p.title };
      }

      for (const order of allOrders) {
        const items = order.lineItems as any[];
        if (!items || !Array.isArray(items)) continue;

        const matchedProductIds = new Set<string>();
        for (const item of items) {
          const pid = shopifyIdToProductId.get(String(item.productId));
          if (pid) matchedProductIds.add(pid);
        }

        for (const pid of matchedProductIds) {
          const s = stats[pid];
          if (!s) continue;
          s.totalOrders++;
          const ws = order.workflowStatus;
          if (ws === "FULFILLED" || ws === "DELIVERED" || ws === "RETURN") {
            s.dispatched++;
          }
          if (ws === "DELIVERED") {
            s.delivered++;
          }
        }
      }

      res.json({ stats });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
