import { Express, Response } from "express";
import { db } from "../db";
import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { z } from "zod";
import { toMerchantStartOfDay, toMerchantEndOfDay, DEFAULT_TIMEZONE } from "../utils/timezone";
import { adCampaigns, adAccounts, adCreatives, adInsights, teamMembers, merchants, adProfitabilityEntries, orders, products, insertCampaignJourneyEventSchema, campaignJourneyEvents } from "@shared/schema";
import { storage } from "../storage";
import {
  fullSync,
  quickSyncToday,
  getInsightsSummary,
  getInsightsForTable,
  matchProductsForMerchant,
  getDailyInsights,
  getAdAccountInfo,
  getLastSyncInfo,
  getSyncRunStatus,
  getCredentialsForMerchant,
  testFacebookConnection,
} from "../services/metaAds";
import { encryptToken } from "../services/encryption";
import { generateChatResponse, generateDashboardInsights, generateQuickStrategy } from "../services/aiInsights";

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
      const merchant = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
      const tz = (merchant[0] as any)?.timezone || DEFAULT_TIMEZONE;
      if (dateFrom) conditions.push(sql`${orders.orderDate} >= ${toMerchantStartOfDay(dateFrom as string, tz)}`);
      if (dateTo) conditions.push(sql`${orders.orderDate} <= ${toMerchantEndOfDay(dateTo as string, tz)}`);

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
        fulfilled: number;
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
        stats[p.id] = { totalOrders: 0, dispatched: 0, fulfilled: 0, delivered: 0, salePrice, costPrice, productTitle: p.title };
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
          if (ws === "FULFILLED") {
            s.fulfilled++;
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

  app.get("/api/marketing/profitability/calculator", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { dateFrom, dateTo } = req.query;

      const campaigns = await db
        .select()
        .from(adCampaigns)
        .where(eq(adCampaigns.merchantId, merchantId));

      if (campaigns.length === 0) {
        return res.json({ campaigns: [] });
      }

      const campaignIds = campaigns.map(c => c.campaignId);

      const insightsConditions: any[] = [
        eq(adInsights.merchantId, merchantId),
        eq(adInsights.entityType, "campaign"),
      ];
      if (dateFrom) insightsConditions.push(gte(adInsights.date, dateFrom as string));
      if (dateTo) insightsConditions.push(lte(adInsights.date, dateTo as string));

      const spendData = await db
        .select({
          entityId: adInsights.entityId,
          totalSpend: sql<string>`COALESCE(SUM(${adInsights.spend}::numeric), 0)`,
        })
        .from(adInsights)
        .where(and(...insightsConditions))
        .groupBy(adInsights.entityId);

      const spendMap = new Map(spendData.map(s => [s.entityId, parseFloat(String(s.totalSpend)) || 0]));

      const allAds = await db
        .select({
          campaignId: adCreatives.campaignId,
          matchedProductId: adCreatives.matchedProductId,
          destinationUrl: adCreatives.destinationUrl,
        })
        .from(adCreatives)
        .where(and(
          eq(adCreatives.merchantId, merchantId),
          sql`${adCreatives.campaignId} IS NOT NULL`,
        ));

      const campaignProductMap = new Map<string, { productId: string | null; url: string | null }>();
      for (const ad of allAds) {
        if (ad.campaignId && ad.matchedProductId && !campaignProductMap.has(ad.campaignId)) {
          campaignProductMap.set(ad.campaignId, { productId: ad.matchedProductId, url: ad.destinationUrl });
        }
      }
      for (const ad of allAds) {
        if (ad.campaignId && !campaignProductMap.has(ad.campaignId)) {
          campaignProductMap.set(ad.campaignId, { productId: null, url: ad.destinationUrl });
        }
      }

      const allProductRows = await db
        .select({
          id: products.id,
          title: products.title,
          handle: products.handle,
          imageUrl: products.imageUrl,
          shopifyProductId: products.shopifyProductId,
          variants: products.variants,
        })
        .from(products)
        .where(eq(products.merchantId, merchantId));

      let productDetailsMap = new Map<string, { title: string; handle: string | null; imageUrl: string | null; salePrice: number; costPrice: number; shopifyProductId: string }>();
      for (const p of allProductRows) {
        let salePrice = 0, costPrice = 0;
        const variants = p.variants as any[];
        if (variants && Array.isArray(variants) && variants.length > 0) {
          salePrice = parseFloat(variants[0].price || "0");
          costPrice = parseFloat(variants[0].cost || "0");
        }
        productDetailsMap.set(p.id, {
          title: p.title,
          handle: p.handle,
          imageUrl: p.imageUrl,
          salePrice,
          costPrice,
          shopifyProductId: p.shopifyProductId,
        });
      }

      const nameMatchedCampaigns = new Set<string>();
      for (const campaign of campaigns) {
        const existing = campaignProductMap.get(campaign.campaignId);
        if (existing?.productId) continue;

        const campaignNameLower = (campaign.name || "").toLowerCase();
        if (!campaignNameLower) continue;

        let bestMatch: { id: string; score: number } | null = null;
        for (const [prodId, prod] of productDetailsMap) {
          if (prod.handle) {
            const handleLower = prod.handle.toLowerCase();
            const handleWords = handleLower.split("-").filter(w => w.length > 2);
            const matchingWords = handleWords.filter(w => campaignNameLower.includes(w));
            if (matchingWords.length >= 2 && matchingWords.length / handleWords.length >= 0.3) {
              const score = matchingWords.length / handleWords.length;
              if (!bestMatch || score > bestMatch.score) {
                bestMatch = { id: prodId, score };
              }
            }
          }

          const titleLower = prod.title.toLowerCase();
          const titleWords = titleLower.split(/[\s\-–&]+/).filter(w => w.length > 2);
          const campaignWords = campaignNameLower.split(/[\s\-–/]+/).filter(w => w.length > 2 && !/^\d+$/.test(w));
          const matchingTitleWords = campaignWords.filter(w => titleWords.some(tw => tw.includes(w) || w.includes(tw)));
          if (matchingTitleWords.length >= 2) {
            const score = matchingTitleWords.length / Math.max(campaignWords.length, 1);
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { id: prodId, score };
            }
          }
        }

        if (bestMatch && bestMatch.score >= 0.3) {
          campaignProductMap.set(campaign.campaignId, { productId: bestMatch.id, url: null });
          nameMatchedCampaigns.add(campaign.campaignId);
        }
      }

      const matchedProductIds = [...new Set(
        [...campaignProductMap.values()].map(v => v.productId).filter(Boolean) as string[]
      )];

      const orderConditions: any[] = [eq(orders.merchantId, merchantId)];
      const merchantRow = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
      const tzCalc = (merchantRow[0] as any)?.timezone || DEFAULT_TIMEZONE;
      if (dateFrom) orderConditions.push(sql`${orders.orderDate} >= ${toMerchantStartOfDay(dateFrom as string, tzCalc)}`);
      if (dateTo) {
        orderConditions.push(sql`${orders.orderDate} <= ${toMerchantEndOfDay(dateTo as string, tzCalc)}`);
      }

      let orderStats = new Map<string, { total: number; dispatched: number; fulfilled: number; delivered: number }>();
      if (matchedProductIds.length > 0) {
        const shopifyProductIdToDbId = new Map<string, string>();
        for (const [dbId, details] of productDetailsMap) {
          shopifyProductIdToDbId.set(details.shopifyProductId, dbId);
        }

        const allOrders = await db
          .select({
            lineItems: orders.lineItems,
            workflowStatus: orders.workflowStatus,
          })
          .from(orders)
          .where(and(...orderConditions));

        for (const [dbId] of productDetailsMap) {
          orderStats.set(dbId, { total: 0, dispatched: 0, fulfilled: 0, delivered: 0 });
        }

        for (const order of allOrders) {
          const items = order.lineItems as any[];
          if (!items || !Array.isArray(items)) continue;

          const matched = new Set<string>();
          for (const item of items) {
            const dbId = shopifyProductIdToDbId.get(String(item.productId));
            if (dbId) matched.add(dbId);
          }

          for (const dbId of matched) {
            const s = orderStats.get(dbId);
            if (!s) continue;
            s.total++;
            const ws = order.workflowStatus;
            if (ws === "FULFILLED" || ws === "DELIVERED" || ws === "RETURN") s.dispatched++;
            if (ws === "FULFILLED") s.fulfilled++;
            if (ws === "DELIVERED") s.delivered++;
          }
        }
      }

      const result = campaigns.map(campaign => {
        const spend = spendMap.get(campaign.campaignId) || 0;
        const productMapping = campaignProductMap.get(campaign.campaignId);
        const productId = productMapping?.productId || null;
        const product = productId ? productDetailsMap.get(productId) : null;
        const stats = productId ? orderStats.get(productId) : null;

        return {
          campaignId: campaign.campaignId,
          campaignName: campaign.name || "Unknown",
          status: campaign.effectiveStatus || campaign.status || "UNKNOWN",
          objective: campaign.objective,
          adSpend: spend,
          destinationUrl: productMapping?.url || null,
          matchType: productId ? (nameMatchedCampaigns.has(campaign.campaignId) ? "name" : "auto") : "unmatched",
          product: product ? {
            id: productId,
            title: product.title,
            handle: product.handle,
            imageUrl: product.imageUrl,
            salePrice: product.salePrice,
            costPrice: product.costPrice,
          } : null,
          orders: {
            total: stats?.total || 0,
            dispatched: stats?.dispatched || 0,
            fulfilled: stats?.fulfilled || 0,
            delivered: stats?.delivered || 0,
          },
        };
      });

      result.sort((a, b) => b.adSpend - a.adSpend);

      res.json({ campaigns: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/marketing/profitability/match/:campaignId", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { campaignId } = req.params;
      const { productId } = req.body;

      if (!productId) {
        await db.update(adCreatives)
          .set({ matchedProductId: null, updatedAt: new Date() })
          .where(and(eq(adCreatives.merchantId, merchantId), eq(adCreatives.campaignId, campaignId)));
        return res.json({ success: true });
      }

      const [product] = await db.select({ id: products.id })
        .from(products)
        .where(and(eq(products.merchantId, merchantId), eq(products.id, productId)));

      if (!product) return res.status(404).json({ error: "Product not found" });

      const campaignAds = await db.select({ id: adCreatives.id })
        .from(adCreatives)
        .where(and(eq(adCreatives.merchantId, merchantId), eq(adCreatives.campaignId, campaignId)));

      if (campaignAds.length === 0) {
        return res.status(404).json({ error: "No ads found for this campaign" });
      }

      await db.update(adCreatives)
        .set({ matchedProductId: productId, updatedAt: new Date() })
        .where(and(eq(adCreatives.merchantId, merchantId), eq(adCreatives.campaignId, campaignId)));

      res.json({ success: true, matched: campaignAds.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketing/profitability/rematch", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const matched = await matchProductsForMerchant(merchantId);
      res.json({ success: true, matched });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketing/journey/events", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const campaignKey = req.query.campaignKey as string | undefined;
      const events = await storage.getJourneyEvents(merchantId, campaignKey);
      res.json({ events });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketing/journey/events", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const schema = insertCampaignJourneyEventSchema.extend({
        notes: z.string().max(120).nullable().optional(),
        microTag: z.string().max(100).nullable().optional(),
      });
      const parsed = schema.parse({ ...req.body, merchantId });
      const event = await storage.createJourneyEvent(parsed);
      res.json({ event });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketing/journey/evaluate", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const allEvents = await storage.getJourneyEvents(merchantId);
      const now = new Date();
      let evaluated = 0;

      for (const evt of allEvents) {
        if (evt.snapshotAfter !== null) continue;
        if (!evt.createdAt) continue;
        const windowMs = (evt.evaluationWindowHours || 48) * 60 * 60 * 1000;
        const deadline = new Date(evt.createdAt.getTime() + windowMs);
        if (now < deadline) continue;

        const snapshotAfter = req.body.currentMetrics?.[evt.campaignKey] || null;
        if (snapshotAfter) {
          await storage.updateJourneyEventSnapshot(evt.id, snapshotAfter, now);
          evaluated++;
        }
      }

      res.json({ success: true, evaluated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const aiChatSchema = z.object({
    question: z.string().min(1).max(1000),
    dollarRate: z.number().min(1).max(1000).optional().default(280),
  });

  app.post("/api/marketing/ai/chat", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const parsed = aiChatSchema.parse(req.body);
      const result = await generateChatResponse(parsed.question.trim(), merchantId, parsed.dollarRate);
      res.json(result);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      console.error("AI chat error:", error);
      res.status(500).json({ error: "Failed to generate AI response" });
    }
  });

  app.get("/api/marketing/ai/insights", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const dollarRate = parseInt(req.query.dollarRate as string) || 280;
      const insights = await generateDashboardInsights(merchantId, dollarRate);
      res.json({ insights });
    } catch (error: any) {
      console.error("AI insights error:", error);
      res.status(500).json({ error: "Failed to generate insights" });
    }
  });

  app.get("/api/marketing/ai/strategy", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const dollarRate = parseInt(req.query.dollarRate as string) || 280;
      const strategy = await generateQuickStrategy(merchantId, dollarRate);
      res.json({ strategy });
    } catch (error: any) {
      console.error("AI strategy error:", error);
      res.status(500).json({ error: "Failed to generate strategy" });
    }
  });
}
