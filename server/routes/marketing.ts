import { Express, Request, Response } from "express";
import { db } from "../db";
import { eq, and, sql, gte, lte, inArray, isNull, isNotNull, desc } from "drizzle-orm";
import { z } from "zod";
import { toMerchantStartOfDay, toMerchantEndOfDay, DEFAULT_TIMEZONE } from "../utils/timezone";
import { adCampaigns, adAccounts, adCreatives, adInsights, teamMembers, merchants, adProfitabilityEntries, orders, products, insertCampaignJourneyEventSchema, campaignJourneyEvents, adLaunchJobs, adLaunchItems, adMediaLibrary, customAudiences, adAutomationRules, metaApiLogs } from "@shared/schema";
import { storage } from "../storage";
import { decryptToken } from "../services/encryption";
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
  META_API_VERSION,
  META_BASE_URL,
} from "../services/metaAds";
import { encryptToken } from "../services/encryption";
import {
  fetchFacebookPages,
  fetchAdAccountPixels,
  fetchPagePosts,
  fetchPageVideos,
  fetchInstagramMedia,
  fetchBrandedContentPosts,
  fetchAdAccountImages,
  fetchAdAccountVideos,
  launchAd,
  bulkLaunchAds,
  uploadImageToMeta,
  createCustomAudience,
  createLookalikeAudience,
  deleteCustomAudience,
  bulkUpdateCampaignStatus,
  bulkUpdateCampaignBudget,
  bulkUpdateAdSetStatus,
  bulkUpdateAdSetBudget,
  bulkUpdateTargeting,
  evaluateAutomationRules,
} from "../services/metaAdLauncher";
import { startSalesLaunch } from "../services/meta/salesLaunchService";
import { runDiagnostics } from "../services/meta/salesDiagnostics";
import { normalizeInput, validateLaunchInput, validateMediaReadiness, validateConnection, type ValidationIssue } from "../services/meta/salesValidation";
import { generateChatResponse, generateDashboardInsights, generateQuickStrategy } from "../services/aiInsights";
import { getMetaConfig } from "../utils/metaConfig";
import crypto from "crypto";

async function getOauthStateSecret(): Promise<string> {
  const config = await getMetaConfig();
  if (!config.facebookAppSecret) throw new Error("FACEBOOK_APP_SECRET is required for OAuth state signing");
  return config.facebookAppSecret;
}

async function createOauthState(merchantId: string): Promise<string> {
  const timestamp = Date.now().toString();
  const secret = await getOauthStateSecret();
  const payload = `${merchantId}:${timestamp}`;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(JSON.stringify({ merchantId, timestamp, hmac })).toString("base64url");
}

async function verifyOauthState(state: string): Promise<{ merchantId: string } | null> {
  try {
    const { merchantId, timestamp, hmac } = JSON.parse(Buffer.from(state, "base64url").toString());
    const secret = await getOauthStateSecret();
    const payload = `${merchantId}:${timestamp}`;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) return null;
    if (Date.now() - parseInt(timestamp) > 10 * 60 * 1000) return null;
    return { merchantId };
  } catch {
    return null;
  }
}
import { attributeOrdersToCampaigns, getAttributionSummary } from "../services/adAttribution";
import { parseUtmParams } from "../services/shopify";

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
        await getCredentialsForMerchant(merchantId);
        hasCredentials = true;
        credentialSource = "merchant";
      } catch (credErr: any) {
        console.log(`[Marketing] No credentials for merchant ${merchantId}: ${credErr.message}`);
      }

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
        await getCredentialsForMerchant(merchantId);
        hasCredentials = true;
        credentialSource = "merchant";
      } catch (credErr: any) {
        console.log(`[Marketing] No credentials for sync-status: ${credErr.message}`);
      }
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
        facebookAccessToken: merchants.facebookAccessToken,
        facebookAdAccountId: merchants.facebookAdAccountId,
      }).from(merchants).where(eq(merchants.id, merchantId));

      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }

      const mask = (val: string | null) => val ? `${"•".repeat(Math.min(val.length, 20))}${val.slice(-4)}` : "";

      res.json({
        facebookAccessToken: merchant.facebookAccessToken ? mask(merchant.facebookAccessToken) : "",
        facebookAdAccountId: merchant.facebookAdAccountId || "",
        hasAccessToken: !!merchant.facebookAccessToken,
        hasAdAccountId: !!merchant.facebookAdAccountId,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const credentialsSchema = z.object({
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

      if (data.facebookAdAccountId !== undefined) updates.facebookAdAccountId = data.facebookAdAccountId || null;
      if (data.facebookAccessToken !== undefined && !data.facebookAccessToken.includes("•")) {
        updates.facebookAccessToken = data.facebookAccessToken ? encryptToken(data.facebookAccessToken) : null;
      }

      await db.update(merchants).set(updates).where(eq(merchants.id, merchantId));

      res.json({ success: true, message: "Credentials saved successfully" });
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

  app.get("/api/marketing/profitability/product-order-stats", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { dateFrom, dateTo, productIds } = req.query;

      if (!productIds || typeof productIds !== "string") {
        return res.json({ stats: [] });
      }

      const productIdList = productIds.split(",").map((s: string) => s.trim()).filter(Boolean);
      if (productIdList.length === 0) return res.json({ stats: [] });

      const productRows = await db
        .select({
          id: products.id,
          title: products.title,
          imageUrl: products.imageUrl,
          shopifyProductId: products.shopifyProductId,
          variants: products.variants,
        })
        .from(products)
        .where(and(
          eq(products.merchantId, merchantId),
          inArray(products.id, productIdList),
        ));

      const productDetailsMap = new Map<string, { title: string; imageUrl: string | null; salePrice: number; costPrice: number; shopifyProductId: string }>();
      const shopifyProductIdToDbId = new Map<string, string>();

      for (const p of productRows) {
        const variants = p.variants as any[];
        let salePrice = 0, costPrice = 0;
        if (variants && Array.isArray(variants) && variants.length > 0) {
          salePrice = parseFloat(variants[0].price || "0");
          costPrice = parseFloat(variants[0].cost || "0");
        }
        productDetailsMap.set(p.id, { title: p.title, imageUrl: p.imageUrl, salePrice, costPrice, shopifyProductId: p.shopifyProductId });
        shopifyProductIdToDbId.set(p.shopifyProductId, p.id);
      }

      const merchantRow = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
      const tz = (merchantRow[0] as any)?.timezone || DEFAULT_TIMEZONE;

      const orderConditions: any[] = [eq(orders.merchantId, merchantId)];
      if (dateFrom) orderConditions.push(sql`${orders.orderDate} >= ${toMerchantStartOfDay(dateFrom as string, tz)}`);
      if (dateTo) orderConditions.push(sql`${orders.orderDate} <= ${toMerchantEndOfDay(dateTo as string, tz)}`);

      const allOrders = await db
        .select({ lineItems: orders.lineItems, workflowStatus: orders.workflowStatus })
        .from(orders)
        .where(and(...orderConditions));

      const orderStats = new Map<string, { total: number; dispatched: number; fulfilled: number; delivered: number }>();
      for (const id of productIdList) {
        orderStats.set(id, { total: 0, dispatched: 0, fulfilled: 0, delivered: 0 });
      }

      for (const order of allOrders) {
        const items = order.lineItems as any[];
        if (!items || !Array.isArray(items)) continue;

        const matched = new Set<string>();
        for (const item of items) {
          const dbId = shopifyProductIdToDbId.get(String(item.productId));
          if (dbId && orderStats.has(dbId)) matched.add(dbId);
        }

        for (const dbId of matched) {
          const s = orderStats.get(dbId)!;
          s.total++;
          const ws = order.workflowStatus;
          if (ws === "FULFILLED" || ws === "DELIVERED" || ws === "RETURN") s.dispatched++;
          if (ws === "FULFILLED") s.fulfilled++;
          if (ws === "DELIVERED") s.delivered++;
        }
      }

      const result = productIdList.map(id => {
        const details = productDetailsMap.get(id);
        const stats = orderStats.get(id) ?? { total: 0, dispatched: 0, fulfilled: 0, delivered: 0 };
        return {
          productId: id,
          title: details?.title ?? "Unknown",
          imageUrl: details?.imageUrl ?? null,
          salePrice: details?.salePrice ?? 0,
          costPrice: details?.costPrice ?? 0,
          orders: stats,
        };
      });

      res.json({ stats: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketing/profitability/shopify-collections", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);

      const store = await storage.getShopifyStore(merchantId);
      if (!store || !store.isConnected || !store.accessToken) {
        return res.json({ collections: [] });
      }

      const shopDomain = store.shopDomain;
      const plainToken = decryptToken(store.accessToken);
      const headers: Record<string, string> = plainToken.includes(":")
        ? { "Authorization": `Basic ${Buffer.from(plainToken).toString("base64")}` }
        : { "X-Shopify-Access-Token": plainToken };

      const fetchShopify = async (path: string) => {
        const r = await fetch(`https://${shopDomain}/admin/api/2025-01${path}`, { headers });
        if (!r.ok) return null;
        return r.json();
      };

      const [customData, smartData] = await Promise.all([
        fetchShopify("/custom_collections.json?limit=250&fields=id,title,products_count"),
        fetchShopify("/smart_collections.json?limit=250&fields=id,title,products_count"),
      ]);

      const rawCollections = [
        ...(customData?.custom_collections ?? []),
        ...(smartData?.smart_collections ?? []),
      ];

      const allProductRows = await db
        .select({ id: products.id, shopifyProductId: products.shopifyProductId })
        .from(products)
        .where(eq(products.merchantId, merchantId));

      const shopifyToDb = new Map(allProductRows.map(p => [p.shopifyProductId, p.id]));

      const collectionsWithProducts = await Promise.all(
        rawCollections.map(async (col: any) => {
          const productData = await fetchShopify(`/products.json?collection_id=${col.id}&fields=id&limit=250`);
          const shopifyProductIds = (productData?.products ?? []).map((p: any) => String(p.id));
          const productDbIds = shopifyProductIds
            .map((sid: string) => shopifyToDb.get(sid))
            .filter(Boolean) as string[];
          return {
            id: String(col.id),
            title: col.title,
            productsCount: productDbIds.length,
            productDbIds,
          };
        })
      );

      res.json({ collections: collectionsWithProducts.filter(c => c.productsCount > 0) });
    } catch (error: any) {
      console.error("[Collections] Error:", error.message);
      res.json({ collections: [] });
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

  app.post("/api/marketing/backfill-utm", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const ordersToBackfill = await db
        .select({ id: orders.id, landingSite: orders.landingSite })
        .from(orders)
        .where(and(eq(orders.merchantId, merchantId), isNull(orders.utmSource), isNotNull(orders.landingSite)));

      let updated = 0;
      let skipped = 0;

      for (const order of ordersToBackfill) {
        const utmData = parseUtmParams(order.landingSite);
        if (utmData.utmSource || utmData.utmCampaign || utmData.fbClickId) {
          await db
            .update(orders)
            .set({
              utmSource: utmData.utmSource,
              utmMedium: utmData.utmMedium,
              utmCampaign: utmData.utmCampaign,
              utmContent: utmData.utmContent,
              utmTerm: utmData.utmTerm,
              fbClickId: utmData.fbClickId,
            })
            .where(eq(orders.id, order.id));
          updated++;
        } else {
          skipped++;
        }
      }

      res.json({ updated, skipped, total: ordersToBackfill.length });
    } catch (error: any) {
      console.error("[Attribution] Error backfilling UTM data:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketing/resolve-attribution", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const result = await attributeOrdersToCampaigns(merchantId);
      res.json(result);
    } catch (error: any) {
      console.error("[Attribution] Error resolving attribution:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketing/attribution/summary", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { dateFrom, dateTo } = req.query;
      const summary = await getAttributionSummary(
        merchantId,
        dateFrom as string | undefined,
        dateTo as string | undefined,
      );
      res.json(summary);
    } catch (error: any) {
      console.error("[Attribution] Error fetching summary:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ── Revenue Truth endpoints ─────────────────────────────────────────────────

  app.get("/api/marketing/revenue-truth/roas", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { dateFrom, dateTo } = getDateRange(req);
      const merchant = await storage.getMerchant(merchantId);
      const tz = (merchant as any)?.timezone || DEFAULT_TIMEZONE;
      const fromTs = toMerchantStartOfDay(dateFrom, tz);
      const toTs = toMerchantEndOfDay(dateTo, tz);

      const campaignRows = await db.execute(sql`
        SELECT
          c.campaign_id,
          c.name AS campaign_name,
          c.effective_status AS status,
          c.objective,
          COUNT(DISTINCT o.id)::int AS our_orders,
          COALESCE(SUM(o.total_amount::numeric), 0)::float AS our_revenue
        FROM ad_campaigns c
        LEFT JOIN orders o
          ON o.attributed_campaign_id = c.campaign_id
          AND o.merchant_id = ${merchantId}
          AND o.created_at >= ${fromTs}
          AND o.created_at <= ${toTs}
        WHERE c.merchant_id = ${merchantId}
        GROUP BY c.campaign_id, c.name, c.effective_status, c.objective
        ORDER BY our_revenue DESC
      `);

      const insightRows = await db.execute(sql`
        SELECT
          entity_id AS campaign_id,
          SUM(spend::numeric)::float AS fb_spend,
          SUM(purchase_value::numeric)::float AS fb_revenue,
          SUM(purchases)::int AS fb_purchases
        FROM ad_insights
        WHERE merchant_id = ${merchantId}
          AND level = 'campaign'
          AND date >= ${dateFrom}
          AND date <= ${dateTo}
        GROUP BY entity_id
      `);

      const insightsMap = new Map<string, any>();
      for (const row of insightRows.rows as any[]) {
        insightsMap.set(row.campaign_id, row);
      }

      const campaigns = (campaignRows.rows as any[]).map((c) => {
        const fb = insightsMap.get(c.campaign_id) ?? {};
        const fbSpend = parseFloat(fb.fb_spend ?? 0);
        const fbRevenue = parseFloat(fb.fb_revenue ?? 0);
        const ourRevenue = parseFloat(c.our_revenue ?? 0);
        return {
          campaignId: c.campaign_id,
          campaignName: c.campaign_name,
          status: c.status,
          objective: c.objective,
          ourOrders: parseInt(c.our_orders ?? 0),
          ourRevenue,
          ourRoas: fbSpend > 0 ? +(ourRevenue / fbSpend).toFixed(2) : null,
          fbSpend,
          fbRevenue,
          fbPurchases: parseInt(fb.fb_purchases ?? 0),
          fbRoas: fbSpend > 0 ? +(fbRevenue / fbSpend).toFixed(2) : null,
          delta: fbSpend > 0 && ourRevenue > 0
            ? +((ourRevenue - fbRevenue) / fbRevenue * 100).toFixed(1)
            : null,
        };
      });

      const totalFbSpend = campaigns.reduce((s, c) => s + c.fbSpend, 0);
      const totalOurRevenue = campaigns.reduce((s, c) => s + c.ourRevenue, 0);
      const totalFbRevenue = campaigns.reduce((s, c) => s + c.fbRevenue, 0);
      const totalOurOrders = campaigns.reduce((s, c) => s + c.ourOrders, 0);

      res.json({
        campaigns,
        totals: {
          fbSpend: +totalFbSpend.toFixed(2),
          ourRevenue: +totalOurRevenue.toFixed(2),
          fbRevenue: +totalFbRevenue.toFixed(2),
          ourOrders: totalOurOrders,
          ourRoas: totalFbSpend > 0 ? +(totalOurRevenue / totalFbSpend).toFixed(2) : null,
          fbRoas: totalFbSpend > 0 ? +(totalFbRevenue / totalFbSpend).toFixed(2) : null,
        },
      });
    } catch (error: any) {
      console.error("[RevenueTruth] ROAS error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketing/revenue-truth/products", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { dateFrom, dateTo } = getDateRange(req);
      const merchant = await storage.getMerchant(merchantId);
      const tz = (merchant as any)?.timezone || DEFAULT_TIMEZONE;
      const fromTs = toMerchantStartOfDay(dateFrom, tz);
      const toTs = toMerchantEndOfDay(dateTo, tz);

      const productRows = await db.execute(sql`
        SELECT
          o.attributed_campaign_id AS campaign_id,
          c.name AS campaign_name,
          c.effective_status AS campaign_status,
          o.utm_content AS ad_id,
          cr.name AS ad_name,
          item->>'title' AS product_title,
          SUM((item->>'quantity')::int)::int AS total_quantity,
          ROUND(SUM((item->>'price')::numeric * (item->>'quantity')::int), 2)::float AS total_revenue,
          COUNT(DISTINCT o.id)::int AS order_count
        FROM orders o
        CROSS JOIN jsonb_array_elements(o.line_items) AS item
        LEFT JOIN ad_campaigns c
          ON c.campaign_id = o.attributed_campaign_id
          AND c.merchant_id = o.merchant_id
        LEFT JOIN ad_creatives cr
          ON cr.ad_id = o.utm_content
          AND cr.merchant_id = o.merchant_id
        WHERE o.merchant_id = ${merchantId}
          AND o.attributed_campaign_id IS NOT NULL
          AND o.line_items IS NOT NULL
          AND jsonb_typeof(o.line_items) = 'array'
          AND o.created_at >= ${fromTs}
          AND o.created_at <= ${toTs}
        GROUP BY
          o.attributed_campaign_id, c.name, c.effective_status,
          o.utm_content, cr.name, item->>'title'
        ORDER BY o.attributed_campaign_id, total_revenue DESC
      `);

      const campaignMap = new Map<string, any>();
      for (const row of productRows.rows as any[]) {
        const cid = row.campaign_id;
        if (!campaignMap.has(cid)) {
          campaignMap.set(cid, {
            campaignId: cid,
            campaignName: row.campaign_name ?? `Campaign ${cid}`,
            campaignStatus: row.campaign_status,
            totalRevenue: 0,
            totalOrders: 0,
            products: [],
          });
        }
        const camp = campaignMap.get(cid);
        camp.products.push({
          title: row.product_title,
          quantity: parseInt(row.total_quantity),
          revenue: parseFloat(row.total_revenue),
          orderCount: parseInt(row.order_count),
        });
        camp.totalRevenue += parseFloat(row.total_revenue);
        camp.totalOrders += parseInt(row.order_count);
      }

      const campaigns = Array.from(campaignMap.values()).map((c) => ({
        ...c,
        totalRevenue: +c.totalRevenue.toFixed(2),
        products: c.products.map((p: any) => ({
          ...p,
          percentage: c.totalRevenue > 0 ? +(p.revenue / c.totalRevenue * 100).toFixed(1) : 0,
        })),
      }));

      res.json({ campaigns });
    } catch (error: any) {
      console.error("[RevenueTruth] Products error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketing/revenue-truth/dark", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { dateFrom, dateTo } = getDateRange(req);
      const merchant = await storage.getMerchant(merchantId);
      const tz = (merchant as any)?.timezone || DEFAULT_TIMEZONE;
      const fromTs = toMerchantStartOfDay(dateFrom, tz);
      const toTs = toMerchantEndOfDay(dateTo, tz);

      const summaryRows = await db.execute(sql`
        SELECT
          COUNT(*)::int AS total_orders,
          COALESCE(SUM(total_amount::numeric), 0)::float AS total_revenue,
          COUNT(CASE WHEN utm_source IS NULL THEN 1 END)::int AS unattributed_orders,
          COALESCE(SUM(CASE WHEN utm_source IS NULL THEN total_amount::numeric END), 0)::float AS unattributed_revenue,
          COUNT(CASE WHEN utm_source IS NOT NULL THEN 1 END)::int AS attributed_orders,
          COALESCE(SUM(CASE WHEN utm_source IS NOT NULL THEN total_amount::numeric END), 0)::float AS attributed_revenue
        FROM orders
        WHERE merchant_id = ${merchantId}
          AND created_at >= ${fromTs}
          AND created_at <= ${toTs}
      `);

      const sourceRows = await db.execute(sql`
        SELECT
          CASE
            WHEN utm_source IS NOT NULL THEN 'Attributed (FB Ads)'
            WHEN fb_click_id IS NOT NULL THEN 'Facebook (No UTM)'
            WHEN referring_site ILIKE '%facebook%' OR referring_site ILIKE '%fb.com%' OR landing_site ILIKE '%facebook%' THEN 'Facebook Organic'
            WHEN referring_site ILIKE '%google%' OR referring_site ILIKE '%googleadservices%' THEN 'Google'
            WHEN referring_site ILIKE '%instagram%' THEN 'Instagram'
            WHEN referring_site ILIKE '%tiktok%' OR referring_site ILIKE '%tik-tok%' THEN 'TikTok'
            WHEN referring_site IS NULL OR referring_site = '' THEN 'Direct / Unknown'
            ELSE 'Other'
          END AS source,
          COUNT(*)::int AS orders,
          COALESCE(SUM(total_amount::numeric), 0)::float AS revenue
        FROM orders
        WHERE merchant_id = ${merchantId}
          AND created_at >= ${fromTs}
          AND created_at <= ${toTs}
        GROUP BY source
        ORDER BY revenue DESC
      `);

      const recentRows = await db.execute(sql`
        SELECT
          id,
          order_number,
          total_amount::float AS total_amount,
          referring_site,
          landing_site,
          utm_source,
          fb_click_id,
          created_at
        FROM orders
        WHERE merchant_id = ${merchantId}
          AND utm_source IS NULL
          AND created_at >= ${fromTs}
          AND created_at <= ${toTs}
        ORDER BY created_at DESC
        LIMIT 50
      `);

      const summary = summaryRows.rows[0] as any;
      res.json({
        summary: {
          totalOrders: summary.total_orders,
          totalRevenue: +parseFloat(summary.total_revenue).toFixed(2),
          attributedOrders: summary.attributed_orders,
          attributedRevenue: +parseFloat(summary.attributed_revenue).toFixed(2),
          unattributedOrders: summary.unattributed_orders,
          unattributedRevenue: +parseFloat(summary.unattributed_revenue).toFixed(2),
          attributionRate: summary.total_orders > 0
            ? +(summary.attributed_orders / summary.total_orders * 100).toFixed(1)
            : 0,
        },
        bySource: (sourceRows.rows as any[]).map((r) => ({
          source: r.source,
          orders: r.orders,
          revenue: +parseFloat(r.revenue).toFixed(2),
        })),
        recentUnattributed: (recentRows.rows as any[]).map((r) => ({
          id: r.id,
          orderNumber: r.order_number,
          totalAmount: parseFloat(r.total_amount),
          referringSite: r.referring_site,
          landingSite: r.landing_site,
          hasFbClick: !!r.fb_click_id,
          createdAt: r.created_at,
        })),
      });
    } catch (error: any) {
      console.error("[RevenueTruth] Dark traffic error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // META OAUTH CONNECT
  // ============================================

  app.get("/api/meta/oauth/url", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);

      const metaConf = await getMetaConfig();
      if (!metaConf.facebookAppId || !metaConf.facebookAppSecret) {
        return res.status(400).json({ error: "Facebook App credentials not configured. Contact your platform administrator." });
      }

      const redirectUri = `${req.protocol}://${req.get("host")}/api/meta/oauth/callback`;
      const scopes = [
        "ads_management",
        "ads_read",
        "business_management",
        "pages_show_list",
        "pages_read_engagement",
        "instagram_basic",
        "instagram_manage_insights",
      ].join(",");

      const stateToken = await createOauthState(merchantId);

      const oauthUrl = new URL(`https://www.facebook.com/${META_API_VERSION}/dialog/oauth`);
      oauthUrl.searchParams.set("client_id", metaConf.facebookAppId);
      oauthUrl.searchParams.set("redirect_uri", redirectUri);
      oauthUrl.searchParams.set("scope", scopes);
      oauthUrl.searchParams.set("state", stateToken);
      oauthUrl.searchParams.set("response_type", "code");

      res.json({ url: oauthUrl.toString(), redirectUri });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/meta/oauth/callback", async (req: any, res) => {
    try {
      const { code, state, error: fbError, error_description } = req.query;

      if (fbError) {
        console.error(`[MetaOAuth] Facebook error: ${fbError} - ${error_description}`);
        return res.redirect(`/settings?tab=marketing&oauth=error&message=${encodeURIComponent(error_description || fbError)}`);
      }

      if (!code || !state) {
        return res.redirect("/settings?tab=marketing&oauth=error&message=Missing+authorization+code");
      }

      const stateEntry = await verifyOauthState(state as string);
      if (!stateEntry) {
        return res.redirect("/settings?tab=marketing&oauth=error&message=Invalid+or+expired+state+parameter");
      }

      const merchantId = stateEntry.merchantId;

      const metaConf = await getMetaConfig();

      if (!metaConf.facebookAppId || !metaConf.facebookAppSecret) {
        return res.redirect("/settings?tab=marketing&oauth=error&message=Facebook+App+credentials+not+configured");
      }

      const redirectUri = `${req.protocol}://${req.get("host")}/api/meta/oauth/callback`;

      const tokenUrl = new URL(`${META_BASE_URL}/oauth/access_token`);
      tokenUrl.searchParams.set("client_id", metaConf.facebookAppId);
      tokenUrl.searchParams.set("redirect_uri", redirectUri);
      tokenUrl.searchParams.set("client_secret", metaConf.facebookAppSecret);
      tokenUrl.searchParams.set("code", code as string);

      const tokenRes = await fetch(tokenUrl.toString());
      if (!tokenRes.ok) {
        const errorText = await tokenRes.text().catch(() => "Unknown error");
        console.error("[MetaOAuth] Token exchange HTTP error:", tokenRes.status, errorText);
        return res.redirect(`/settings?tab=marketing&oauth=error&message=${encodeURIComponent("Token exchange failed: " + tokenRes.status)}`);
      }
      const tokenData = await tokenRes.json().catch(() => null);
      if (!tokenData || tokenData.error) {
        console.error("[MetaOAuth] Token exchange error:", tokenData?.error);
        return res.redirect(`/settings?tab=marketing&oauth=error&message=${encodeURIComponent(tokenData?.error?.message || "Token exchange failed")}`);
      }

      const shortToken = tokenData.access_token;

      const longTokenUrl = new URL(`${META_BASE_URL}/oauth/access_token`);
      longTokenUrl.searchParams.set("grant_type", "fb_exchange_token");
      longTokenUrl.searchParams.set("client_id", metaConf.facebookAppId);
      longTokenUrl.searchParams.set("client_secret", metaConf.facebookAppSecret);
      longTokenUrl.searchParams.set("fb_exchange_token", shortToken);

      const longTokenRes = await fetch(longTokenUrl.toString());
      let accessToken = shortToken;
      let expiresIn: number | undefined;
      if (longTokenRes.ok) {
        const longTokenData = await longTokenRes.json().catch(() => null);
        if (longTokenData?.access_token) {
          accessToken = longTokenData.access_token;
          expiresIn = longTokenData.expires_in;
        }
      } else {
        console.warn("[MetaOAuth] Long-lived token exchange failed, using short-lived token:", longTokenRes.status);
      }

      const adAccountsUrl = new URL(`${META_BASE_URL}/me/adaccounts`);
      adAccountsUrl.searchParams.set("access_token", accessToken);
      adAccountsUrl.searchParams.set("fields", "account_id,name,account_status,currency");
      adAccountsUrl.searchParams.set("limit", "50");

      const adAccountsRes = await fetch(adAccountsUrl.toString());
      const adAccountsData = adAccountsRes.ok ? await adAccountsRes.json().catch(() => ({ data: [] })) : { data: [] };
      const adAccountsList = adAccountsData.data || [];

      const pagesUrl = new URL(`${META_BASE_URL}/me/accounts`);
      pagesUrl.searchParams.set("access_token", accessToken);
      pagesUrl.searchParams.set("fields", "id,name");
      pagesUrl.searchParams.set("limit", "50");

      const pagesRes = await fetch(pagesUrl.toString());
      const pagesData = pagesRes.ok ? await pagesRes.json().catch(() => ({ data: [] })) : { data: [] };
      const pagesList = pagesData.data || [];

      const updates: Record<string, any> = {
        metaOauthAccessToken: encryptToken(accessToken),
        facebookOAuthConnected: true,
        updatedAt: new Date(),
      };

      if (expiresIn) {
        updates.metaOauthTokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
      }

      if (adAccountsList.length > 0) {
        const firstAccount = adAccountsList[0];
        updates.metaSelectedAdAccountId = firstAccount.account_id;
      }

      if (pagesList.length > 0) {
        updates.metaSelectedPageId = pagesList[0].id;
        updates.metaSelectedPageName = pagesList[0].name;
      }

      await db.update(merchants).set(updates).where(eq(merchants.id, merchantId));

      console.log(`[MetaOAuth] OAuth connected for merchant ${merchantId}. Ad accounts: ${adAccountsList.length}, Pages: ${pagesList.length}`);

      const adAccountsParam = encodeURIComponent(JSON.stringify(adAccountsList.map((a: any) => ({
        id: a.account_id,
        name: a.name,
      }))));

      res.redirect(`/settings?tab=marketing&oauth=success&adAccounts=${adAccountsParam}`);
    } catch (error: any) {
      console.error("[MetaOAuth] Callback error:", error);
      res.redirect(`/settings?tab=marketing&oauth=error&message=${encodeURIComponent(error.message)}`);
    }
  });

  app.get("/api/meta/oauth/status", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const [merchant] = await db.select({
        facebookOAuthConnected: merchants.facebookOAuthConnected,
        metaOauthAccessToken: merchants.metaOauthAccessToken,
        metaOauthTokenExpiresAt: merchants.metaOauthTokenExpiresAt,
        metaSelectedAdAccountId: merchants.metaSelectedAdAccountId,
        metaSelectedPageId: merchants.metaSelectedPageId,
        metaSelectedPageName: merchants.metaSelectedPageName,
        metaSelectedPixelId: merchants.metaSelectedPixelId,
        metaSelectedIgAccountId: merchants.metaSelectedIgAccountId,
        metaSelectedIgAccountName: merchants.metaSelectedIgAccountName,
      }).from(merchants).where(eq(merchants.id, merchantId));

      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }

      res.json({
        connected: !!merchant.facebookOAuthConnected,
        hasToken: !!merchant.metaOauthAccessToken,
        tokenExpiresAt: merchant.metaOauthTokenExpiresAt,
        pageId: merchant.metaSelectedPageId,
        pageName: merchant.metaSelectedPageName,
        pixelId: merchant.metaSelectedPixelId,
        adAccountId: merchant.metaSelectedAdAccountId,
        instagramAccountId: merchant.metaSelectedIgAccountId,
        instagramAccountName: merchant.metaSelectedIgAccountName,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/oauth/disconnect", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      await db.update(merchants).set({
        metaOauthAccessToken: null,
        metaOauthTokenExpiresAt: null,
        metaSelectedAdAccountId: null,
        metaSelectedPageId: null,
        metaSelectedPageName: null,
        metaSelectedPixelId: null,
        metaSelectedIgAccountId: null,
        metaSelectedIgAccountName: null,
        facebookOAuthConnected: false,
        updatedAt: new Date(),
      }).where(eq(merchants.id, merchantId));

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/meta/oauth/settings", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const schema = z.object({
        adAccountId: z.string().optional(),
        pageId: z.string().optional(),
        pageName: z.string().optional(),
        pixelId: z.string().optional(),
        instagramAccountId: z.string().optional(),
        instagramAccountName: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid data" });

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (parsed.data.adAccountId !== undefined) updates.metaSelectedAdAccountId = parsed.data.adAccountId;
      if (parsed.data.pageId !== undefined) updates.metaSelectedPageId = parsed.data.pageId;
      if (parsed.data.pageName !== undefined) updates.metaSelectedPageName = parsed.data.pageName;
      if (parsed.data.pixelId !== undefined) updates.metaSelectedPixelId = parsed.data.pixelId;
      if (parsed.data.instagramAccountId !== undefined) updates.metaSelectedIgAccountId = parsed.data.instagramAccountId;
      if (parsed.data.instagramAccountName !== undefined) updates.metaSelectedIgAccountName = parsed.data.instagramAccountName;

      await db.update(merchants).set(updates).where(eq(merchants.id, merchantId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/oauth/refresh-token", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const [merchant] = await db.select({
        metaOauthAccessToken: merchants.metaOauthAccessToken,
      }).from(merchants).where(eq(merchants.id, merchantId));

      if (!merchant?.metaOauthAccessToken) {
        return res.status(400).json({ error: "No access token to refresh" });
      }

      const metaConf = await getMetaConfig();

      if (!metaConf.facebookAppId || !metaConf.facebookAppSecret) {
        return res.status(400).json({ error: "Facebook App credentials not configured" });
      }

      const currentToken = decryptToken(merchant.metaOauthAccessToken);

      const refreshUrl = new URL(`${META_BASE_URL}/oauth/access_token`);
      refreshUrl.searchParams.set("grant_type", "fb_exchange_token");
      refreshUrl.searchParams.set("client_id", metaConf.facebookAppId);
      refreshUrl.searchParams.set("client_secret", metaConf.facebookAppSecret);
      refreshUrl.searchParams.set("fb_exchange_token", currentToken);

      const refreshRes = await fetch(refreshUrl.toString());
      if (!refreshRes.ok) {
        const errorText = await refreshRes.text().catch(() => "Unknown error");
        console.error("[MetaOAuth] Token refresh HTTP error:", refreshRes.status, errorText);
        return res.status(400).json({ error: `Token refresh failed (HTTP ${refreshRes.status})` });
      }
      const refreshData = await refreshRes.json().catch(() => null);

      if (!refreshData || refreshData.error) {
        return res.status(400).json({ error: refreshData?.error?.message || "Token refresh failed" });
      }

      const updates: Record<string, any> = {
        metaOauthAccessToken: encryptToken(refreshData.access_token),
        updatedAt: new Date(),
      };

      if (refreshData.expires_in) {
        updates.metaOauthTokenExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000);
      }

      await db.update(merchants).set(updates).where(eq(merchants.id, merchantId));

      res.json({
        success: true,
        expiresAt: updates.metaOauthTokenExpiresAt || null,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/meta/ad-accounts", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const creds = await getCredentialsForMerchant(merchantId);
      const token = creds.accessToken;
      const url = new URL(`${META_BASE_URL}/me/adaccounts`);
      url.searchParams.set("access_token", token);
      url.searchParams.set("fields", "account_id,name,account_status,currency");
      url.searchParams.set("limit", "50");

      const response = await fetch(url.toString());
      const data = await response.json();

      res.json({ adAccounts: (data.data || []).map((a: any) => ({
        id: a.account_id,
        name: a.name,
        status: a.account_status,
        currency: a.currency,
      })) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/meta/instagram-accounts", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const creds = await getCredentialsForMerchant(merchantId);
      const token = creds.accessToken;

      const [merchant] = await db.select({
        metaSelectedPageId: merchants.metaSelectedPageId,
      }).from(merchants).where(eq(merchants.id, merchantId));

      console.log("[IG-accounts] merchantId:", merchantId, "selectedPageId:", merchant?.metaSelectedPageId, "tokenLength:", token?.length);

      const igAccounts: any[] = [];

      if (merchant?.metaSelectedPageId) {
        const url = new URL(`${META_BASE_URL}/${merchant.metaSelectedPageId}`);
        url.searchParams.set("access_token", token);
        url.searchParams.set("fields", "instagram_business_account{id,name,username,profile_picture_url}");

        const response = await fetch(url.toString());
        const data = await response.json();
        console.log("[IG-accounts] Selected page IG response:", JSON.stringify(data));
        if (data.instagram_business_account) {
          igAccounts.push(data.instagram_business_account);
        }
      }

      const pagesUrl = new URL(`${META_BASE_URL}/me/accounts`);
      pagesUrl.searchParams.set("access_token", token);
      pagesUrl.searchParams.set("fields", "id,name,instagram_business_account{id,name,username,profile_picture_url}");
      pagesUrl.searchParams.set("limit", "50");

      const pagesRes = await fetch(pagesUrl.toString());
      const pagesData = await pagesRes.json();
      const pages = pagesData.data || [];
      console.log("[IG-accounts] Pages count:", pages.length, "Pages with IG:", pages.filter((p: any) => p.instagram_business_account).length);
      if (pagesData.error) {
        console.log("[IG-accounts] Pages API error:", JSON.stringify(pagesData.error));
      }

      for (const page of pages) {
        if (page.instagram_business_account) {
          const existing = igAccounts.find((ig) => ig.id === page.instagram_business_account.id);
          if (!existing) {
            igAccounts.push({
              ...page.instagram_business_account,
              pageName: page.name,
            });
          }
        }
      }

      console.log("[IG-accounts] Total IG accounts found:", igAccounts.length);
      res.json({ instagramAccounts: igAccounts });
    } catch (error: any) {
      console.error("[IG-accounts] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // META AD LAUNCHER ROUTES
  // ============================================

  app.get("/api/meta/pages", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const pages = await fetchFacebookPages(merchantId);
      res.json({ pages });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/meta/pixels", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const pixels = await fetchAdAccountPixels(merchantId);
      res.json({ pixels });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/meta/targeting-search", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const q = (req.query.q as string || "").trim();
      const type = (req.query.type as string) || "adinterest";
      if (!q || q.length < 2) {
        return res.json({ data: [] });
      }
      const creds = await getCredentialsForMerchant(merchantId);
      const url = new URL(`${META_BASE_URL}/search`);
      url.searchParams.set("access_token", creds.accessToken);
      url.searchParams.set("type", type);
      url.searchParams.set("q", q);
      url.searchParams.set("limit", "15");
      const response = await fetch(url.toString());
      if (!response.ok) {
        return res.json({ data: [] });
      }
      const data = await response.json();
      if (type === "adgeolocation") {
        res.json({ data: (data.data || []).map((item: any) => ({
          key: item.key,
          name: item.name,
          type: item.type,
          country_code: item.country_code,
          region: item.region,
          region_id: item.region_id,
          supports_city: item.supports_city,
          supports_region: item.supports_region,
        })) });
      } else {
        res.json({ data: (data.data || []).map((item: any) => ({ id: item.id, name: item.name, audience_size: item.audience_size, path: item.path, topic: item.topic })) });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/bulk-launch/:jobId/retry-failed", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { jobId } = req.params;

      const [job] = await db.select().from(adLaunchJobs).where(and(eq(adLaunchJobs.id, jobId), eq(adLaunchJobs.merchantId, merchantId)));
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const failedItems = await db.select().from(adLaunchItems)
        .where(and(eq(adLaunchItems.jobId, jobId), eq(adLaunchItems.status, "failed")));

      if (failedItems.length === 0) {
        return res.json({ success: true, retried: 0, message: "No failed items to retry" });
      }

      const pageId = job.pageId || "";
      let succeeded = 0;
      let failed = 0;

      for (const item of failedItems) {
        try {
          const ad = {
            campaignName: item.campaignName || "Retry",
            objective: job.objective || "OUTCOME_SALES",
            dailyBudget: job.dailyBudget || "500",
            targeting: job.targeting || { geo_locations: { countries: ["PK"] } },
            creative: {
              primaryText: item.primaryText || "",
              headline: item.headline || undefined,
              description: item.description || undefined,
              linkUrl: item.linkUrl || "",
              imageUrl: item.imageUrl || undefined,
              callToAction: item.callToAction || "SHOP_NOW",
            },
            pageId,
            pixelId: job.pixelId || undefined,
          };

          const result = await bulkLaunchAds(merchantId, [ad]);
          if (result.succeeded > 0) {
            await db.update(adLaunchItems).set({
              status: "completed",
              metaCampaignId: result.results[0]?.campaignId || null,
              metaAdsetId: result.results[0]?.adSetId || null,
              metaAdId: result.results[0]?.adId || null,
              errorMessage: null,
              launchedAt: new Date(),
            }).where(eq(adLaunchItems.id, item.id));
            succeeded++;
          } else {
            await db.update(adLaunchItems).set({
              errorMessage: result.results[0]?.error || "Retry failed",
            }).where(eq(adLaunchItems.id, item.id));
            failed++;
          }
        } catch (err: any) {
          await db.update(adLaunchItems).set({
            errorMessage: err.message,
          }).where(eq(adLaunchItems.id, item.id));
          failed++;
        }
      }

      const newStatus = failed === 0 ? "completed" : succeeded > 0 ? "partial" : "failed";
      await db.update(adLaunchJobs).set({ status: newStatus }).where(eq(adLaunchJobs.id, jobId));

      res.json({ success: true, retried: failedItems.length, succeeded, failed });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/meta/page-posts", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const [merchant] = await db.select({ pageId: merchants.metaSelectedPageId }).from(merchants).where(eq(merchants.id, merchantId));
      if (!merchant?.pageId) return res.json({ posts: [], _notConnected: true });
      const search = req.query.search as string | undefined;
      const includeVideos = req.query.includeVideos === "true";
      const [posts, videos] = await Promise.all([
        fetchPagePosts(merchantId, merchant.pageId, search),
        includeVideos ? fetchPageVideos(merchantId, merchant.pageId, search) : Promise.resolve([]),
      ]);
      const postIds = new Set(posts.map((p: any) => p.id));
      const uniqueVideos = videos.filter((v: any) => !postIds.has(v.id));
      const combined = [...posts, ...uniqueVideos].sort((a: any, b: any) =>
        new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
      );
      res.json({ posts: combined });
    } catch (error: any) {
      console.error("[page-posts] Error fetching Facebook posts:", error.message);
      res.json({ posts: [], _error: true, errorMessage: error.message });
    }
  });

  app.get("/api/meta/ig-media", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const explicitIgId = req.query.igAccountId as string | undefined;
      let igAccountId = explicitIgId || null;
      if (!igAccountId) {
        const [merchant] = await db.select({ igAccountId: merchants.metaSelectedIgAccountId }).from(merchants).where(eq(merchants.id, merchantId));
        igAccountId = merchant?.igAccountId || null;
      }
      if (!igAccountId) return res.json({ posts: [], _notConnected: true });
      const search = req.query.search as string | undefined;
      const posts = await fetchInstagramMedia(merchantId, igAccountId, search);
      res.json({ posts });
    } catch (error: any) {
      console.error("[ig-media] Error fetching Instagram media:", error.message);
      res.json({ posts: [], _error: true, errorMessage: error.message });
    }
  });

  app.get("/api/meta/branded-content-posts", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const [merchant] = await db.select({ pageId: merchants.metaSelectedPageId }).from(merchants).where(eq(merchants.id, merchantId));
      if (!merchant?.pageId) return res.json({ posts: [] });
      const search = req.query.search as string | undefined;
      const posts = await fetchBrandedContentPosts(merchantId, merchant.pageId, search);
      res.json({ posts });
    } catch (error: any) {
      console.error("[branded-content] Error fetching branded content:", error.message);
      res.json({ posts: [], _error: true, errorMessage: error.message });
    }
  });

  app.get("/api/meta/page-videos", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const [merchant] = await db.select({ pageId: merchants.metaSelectedPageId }).from(merchants).where(eq(merchants.id, merchantId));
      if (!merchant?.pageId) return res.json({ videos: [] });
      const search = req.query.search as string | undefined;
      const videos = await fetchPageVideos(merchantId, merchant.pageId, search);
      res.json({ videos });
    } catch (error: any) {
      console.error("[page-videos] Error fetching page videos:", error.message);
      res.json({ videos: [], _error: true, errorMessage: error.message });
    }
  });

  app.get("/api/meta/ad-account-images", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const [merchant] = await db.select({ adAccountId: merchants.metaSelectedAdAccountId }).from(merchants).where(eq(merchants.id, merchantId));
      if (!merchant?.adAccountId) return res.json({ images: [], _notConnected: true });
      const images = await fetchAdAccountImages(merchantId);
      res.json({ images });
    } catch (error: any) {
      console.error("[ad-account-images] Error fetching ad images:", error.message);
      res.json({ images: [], _error: true, errorMessage: error.message });
    }
  });

  app.get("/api/meta/ad-account-videos", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const [merchant] = await db.select({ adAccountId: merchants.metaSelectedAdAccountId }).from(merchants).where(eq(merchants.id, merchantId));
      if (!merchant?.adAccountId) return res.json({ videos: [], _notConnected: true });
      const videos = await fetchAdAccountVideos(merchantId);
      res.json({ videos });
    } catch (error: any) {
      console.error("[ad-account-videos] Error fetching ad videos:", error.message);
      res.json({ videos: [], _error: true, errorMessage: error.message });
    }
  });

  app.post("/api/meta/launch", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const schema = z.object({
        campaignName: z.string().min(1),
        objective: z.string().default("OUTCOME_SALES"),
        dailyBudget: z.string().optional(),
        lifetimeBudget: z.string().optional(),
        budgetType: z.enum(["daily", "lifetime"]).optional(),
        budgetLevel: z.enum(["adset", "campaign"]).optional(),
        spendingLimit: z.string().optional(),
        bidStrategy: z.string().optional(),
        bidAmount: z.string().optional(),
        targeting: z.any(),
        useAdvantageAudience: z.boolean().optional(),
        creative: z.object({
          format: z.enum(["single_image", "video", "carousel", "existing_post"]).optional(),
          existingPostId: z.string().optional(),
          existingPostSource: z.enum(["facebook", "instagram", "partner"]).optional(),
          primaryText: z.string().optional(),
          headline: z.string().optional(),
          description: z.string().optional(),
          linkUrl: z.string().url().optional(),
          imageUrl: z.string().optional(),
          imageHash: z.string().optional(),
          videoId: z.string().optional(),
          thumbnailUrl: z.string().optional(),
          callToAction: z.string().optional(),
          carouselCards: z.array(z.object({
            imageUrl: z.string().optional(),
            imageHash: z.string().optional(),
            headline: z.string().optional(),
            description: z.string().optional(),
            linkUrl: z.string().url(),
          })).optional(),
        }).refine(data => {
          if (data.format === "existing_post") return !!data.existingPostId;
          return !!data.primaryText && !!data.linkUrl;
        }, { message: "Existing post requires postId; other formats require primaryText and linkUrl" }),
        pageId: z.string().min(1),
        pixelId: z.string().optional(),
        conversionEvent: z.enum(["PURCHASE", "ADD_TO_CART", "INITIATE_CHECKOUT", "LEAD", "COMPLETE_REGISTRATION", "SEARCH", "VIEW_CONTENT", "CONTACT", "SUBSCRIBE"]).optional(),
        optimizationGoal: z.enum(["OFFSITE_CONVERSIONS", "LINK_CLICKS", "LANDING_PAGE_VIEWS", "IMPRESSIONS", "REACH", "POST_ENGAGEMENT", "VIDEO_VIEWS", "LEAD_GENERATION"]).optional(),
        status: z.string().optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid launch config", details: parsed.error.flatten() });
      }

      const config = parsed.data;

      const [job] = await db.insert(adLaunchJobs).values({
        merchantId,
        launchType: "single",
        campaignName: config.campaignName,
        objective: config.objective,
        dailyBudget: config.dailyBudget,
        targeting: config.targeting,
        creativeConfig: config.creative,
        pageId: config.pageId,
        pixelId: config.pixelId,
        status: "pending",
      }).returning();

      const result = await launchAd(merchantId, job.id, config);
      res.json({ success: true, jobId: job.id, ...result });
    } catch (error: any) {
      console.error("[MetaAdLauncher] Launch error:", error.message);
      res.status(500).json({
        error: error.message,
        step: (error as any).step || "Unknown",
      });
    }
  });

  app.post("/api/meta/bulk-launch", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const schema = z.object({
        ads: z.array(z.object({
          campaignName: z.string().min(1),
          objective: z.string().default("OUTCOME_SALES"),
          dailyBudget: z.string().min(1),
          targeting: z.any(),
          creative: z.object({
            primaryText: z.string().min(1),
            headline: z.string().optional(),
            description: z.string().optional(),
            linkUrl: z.string().url(),
            imageUrl: z.string().optional(),
            callToAction: z.string().optional(),
          }),
          pageId: z.string().min(1),
          pixelId: z.string().optional(),
        })).min(1).max(50),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid bulk launch config", details: parsed.error.flatten() });
      }

      const [job] = await db.insert(adLaunchJobs).values({
        merchantId,
        launchType: "bulk",
        campaignName: `Bulk Launch - ${parsed.data.ads.length} ads`,
        objective: parsed.data.ads[0]?.objective || "OUTCOME_SALES",
        dailyBudget: parsed.data.ads[0]?.dailyBudget || "0",
        targeting: parsed.data.ads[0]?.targeting || {},
        creativeConfig: { adCount: parsed.data.ads.length },
        pageId: parsed.data.ads[0]?.pageId,
        status: "processing",
      }).returning();

      const itemInserts = parsed.data.ads.map((ad) => ({
        jobId: job.id,
        merchantId,
        campaignName: ad.campaignName,
        primaryText: ad.creative.primaryText,
        headline: ad.creative.headline,
        description: ad.creative.description,
        imageUrl: ad.creative.imageUrl,
        linkUrl: ad.creative.linkUrl,
        callToAction: ad.creative.callToAction,
        status: "pending" as const,
      }));

      await db.insert(adLaunchItems).values(itemInserts);

      const result = await bulkLaunchAds(merchantId, parsed.data.ads);

      const completedItems = await db.select().from(adLaunchItems).where(eq(adLaunchItems.jobId, job.id));
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < result.results.length; i++) {
        const r = result.results[i];
        const item = completedItems[i];
        if (!item) continue;

        if (r.success) {
          successCount++;
          await db.update(adLaunchItems).set({
            status: "completed",
            metaCampaignId: r.campaignId,
            metaAdsetId: r.adSetId,
            metaAdId: r.adId,
            launchedAt: new Date(),
          }).where(eq(adLaunchItems.id, item.id));
        } else {
          failCount++;
          await db.update(adLaunchItems).set({
            status: "failed",
            errorMessage: r.error,
          }).where(eq(adLaunchItems.id, item.id));
        }
      }

      await db.update(adLaunchJobs).set({
        status: failCount === 0 ? "completed" : successCount > 0 ? "partial" : "failed",
        launchedAt: new Date(),
      }).where(eq(adLaunchJobs.id, job.id));

      res.json({ success: true, jobId: job.id, ...result });
    } catch (error: any) {
      console.error("[MetaAdLauncher] Bulk launch error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/meta/launch-jobs", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const jobs = await db.select()
        .from(adLaunchJobs)
        .where(eq(adLaunchJobs.merchantId, merchantId))
        .orderBy(desc(adLaunchJobs.createdAt))
        .limit(100);
      res.json({ jobs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/meta/launch-jobs/:jobId/items", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { jobId } = req.params;
      const items = await db.select()
        .from(adLaunchItems)
        .where(and(eq(adLaunchItems.jobId, jobId), eq(adLaunchItems.merchantId, merchantId)))
        .orderBy(adLaunchItems.createdAt);
      res.json({ items });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/meta/campaigns", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const creds = await getCredentialsForMerchant(merchantId);
      const token = creds.accessToken;
      const actId = `act_${creds.adAccountId.replace("act_", "")}`;

      const url = new URL(`${META_BASE_URL}/${actId}/campaigns`);
      url.searchParams.set("access_token", token);
      url.searchParams.set("fields", "id,name,status,objective,daily_budget,lifetime_budget,created_time,updated_time,start_time,stop_time");
      url.searchParams.set("limit", "100");

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.error) {
        return res.status(400).json({ error: data.error.message });
      }

      res.json({ campaigns: data.data || [] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/campaigns/:campaignId/status", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { campaignId } = req.params;
      const statusSchema = z.object({
        status: z.enum(["ACTIVE", "PAUSED"]),
      });
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid status" });

      const creds = await getCredentialsForMerchant(merchantId);
      const token = creds.accessToken;

      const response = await fetch(`${META_BASE_URL}/${campaignId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: parsed.data.status,
          access_token: token,
        }),
      });

      const data = await response.json();
      if (data.error) {
        return res.status(400).json({ error: data.error.message });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // META MEDIA LIBRARY
  // ============================================

  app.get("/api/meta/media-library", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const media = await db.select()
        .from(adMediaLibrary)
        .where(eq(adMediaLibrary.merchantId, merchantId))
        .orderBy(desc(adMediaLibrary.createdAt));
      res.json({ media });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/media-library", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const schema = z.object({
        name: z.string().min(1),
        type: z.enum(["image", "video"]).default("image"),
        url: z.string().url(),
        width: z.number().optional(),
        height: z.number().optional(),
        fileSize: z.number().optional(),
        tags: z.array(z.string()).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid media data", details: parsed.error.flatten() });
      }

      const [media] = await db.insert(adMediaLibrary).values({
        merchantId,
        ...parsed.data,
      }).returning();

      res.json({ media });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/meta/media-library/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      await db.delete(adMediaLibrary)
        .where(and(eq(adMediaLibrary.id, req.params.id), eq(adMediaLibrary.merchantId, merchantId)));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/media-library/:id/upload-to-meta", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const [media] = await db.select()
        .from(adMediaLibrary)
        .where(and(eq(adMediaLibrary.id, req.params.id), eq(adMediaLibrary.merchantId, merchantId)));

      if (!media) return res.status(404).json({ error: "Media not found" });

      const result = await uploadImageToMeta(merchantId, media.url);

      await db.update(adMediaLibrary)
        .set({ metaMediaHash: result.hash })
        .where(eq(adMediaLibrary.id, media.id));

      res.json({ success: true, hash: result.hash });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // CUSTOM AUDIENCES
  // ============================================

  app.get("/api/meta/audiences", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const audiences = await db.select()
        .from(customAudiences)
        .where(eq(customAudiences.merchantId, merchantId))
        .orderBy(desc(customAudiences.createdAt));
      res.json({ audiences });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/audiences", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const schema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        audienceType: z.enum(["customer_list", "website"]),
        emails: z.array(z.string()).optional(),
        phones: z.array(z.string()).optional(),
        pixelId: z.string().optional(),
        retentionDays: z.number().min(1).max(180).optional(),
      }).refine((data) => {
        if (data.audienceType === "website") {
          return !!data.pixelId && !!data.retentionDays;
        }
        if (data.audienceType === "customer_list") {
          return (data.emails && data.emails.length > 0) || (data.phones && data.phones.length > 0);
        }
        return true;
      }, { message: "Website audiences require pixelId and retentionDays. Customer list audiences require emails or phones." });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

      const result = await createCustomAudience(merchantId, parsed.data);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/audiences/lookalike", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const schema = z.object({
        name: z.string().min(1),
        sourceAudienceId: z.string().min(1),
        country: z.string().default("PK"),
        ratio: z.number().min(0.01).max(0.2).default(0.01),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

      const result = await createLookalikeAudience(merchantId, parsed.data);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/meta/audiences/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      await deleteCustomAudience(merchantId, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // BULK CAMPAIGN OPERATIONS
  // ============================================

  app.post("/api/meta/campaigns/bulk-status", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const schema = z.object({
        campaignIds: z.array(z.string()).min(1),
        status: z.enum(["ACTIVE", "PAUSED"]),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

      const result = await bulkUpdateCampaignStatus(merchantId, parsed.data.campaignIds, parsed.data.status);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/campaigns/bulk-budget", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const schema = z.object({
        campaignIds: z.array(z.string()).min(1),
        action: z.enum(["increase", "decrease", "set"]),
        value: z.number().positive(),
        budgetType: z.enum(["daily", "lifetime"]).default("daily"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

      const result = await bulkUpdateCampaignBudget(merchantId, parsed.data.campaignIds, parsed.data.action, parsed.data.value, parsed.data.budgetType);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/meta/adsets", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const creds = await getCredentialsForMerchant(merchantId);
      const token = creds.accessToken;
      const actId = `act_${creds.adAccountId.replace("act_", "")}`;

      const url = new URL(`${META_BASE_URL}/${actId}/adsets`);
      url.searchParams.set("access_token", token);
      url.searchParams.set("fields", "id,name,status,effective_status,daily_budget,lifetime_budget,targeting,campaign_id,optimization_goal,bid_strategy");
      url.searchParams.set("limit", "200");

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.error) {
        return res.status(400).json({ error: data.error.message });
      }

      res.json({ adSets: data.data || [] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/adsets/bulk-status", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const schema = z.object({
        adSetIds: z.array(z.string()).min(1),
        status: z.enum(["ACTIVE", "PAUSED"]),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

      const result = await bulkUpdateAdSetStatus(merchantId, parsed.data.adSetIds, parsed.data.status);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/adsets/bulk-budget", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const schema = z.object({
        adSetIds: z.array(z.string()).min(1),
        action: z.enum(["increase", "decrease", "set"]),
        value: z.number().positive(),
        budgetType: z.enum(["daily", "lifetime"]).default("daily"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

      const result = await bulkUpdateAdSetBudget(merchantId, parsed.data.adSetIds, parsed.data.action, parsed.data.value, parsed.data.budgetType);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/adsets/bulk-targeting", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const schema = z.object({
        adSetIds: z.array(z.string()).min(1),
        targeting: z.record(z.any()),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

      const result = await bulkUpdateTargeting(merchantId, parsed.data.adSetIds, parsed.data.targeting);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // AUTOMATION RULES
  // ============================================

  app.get("/api/meta/automation-rules", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const rules = await db.select()
        .from(adAutomationRules)
        .where(eq(adAutomationRules.merchantId, merchantId))
        .orderBy(desc(adAutomationRules.createdAt));
      res.json({ rules });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/automation-rules", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const schema = z.object({
        name: z.string().min(1),
        entityType: z.enum(["campaign", "adset"]).default("campaign"),
        conditionMetric: z.enum(["cpa", "roas", "spend", "cpc", "cpm", "ctr", "purchases"]),
        conditionOperator: z.enum([">", "<", ">=", "<=", "="]),
        conditionValue: z.string().refine(v => !isNaN(Number(v))),
        conditionWindow: z.enum(["last_3d", "last_7d", "last_14d", "last_30d"]).default("last_7d"),
        actionType: z.enum(["pause", "increase_budget", "decrease_budget", "notify"]),
        actionValue: z.string().optional(),
        notifyOnTrigger: z.boolean().default(true),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

      const [rule] = await db.insert(adAutomationRules).values({
        merchantId,
        ...parsed.data,
      }).returning();

      res.json({ rule });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/meta/automation-rules/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const schema = z.object({
        name: z.string().min(1).optional(),
        enabled: z.boolean().optional(),
        conditionMetric: z.enum(["cpa", "roas", "spend", "cpc", "cpm", "ctr", "purchases"]).optional(),
        conditionOperator: z.enum([">", "<", ">=", "<=", "="]).optional(),
        conditionValue: z.string().refine(v => !isNaN(Number(v))).optional(),
        conditionWindow: z.enum(["last_3d", "last_7d", "last_14d", "last_30d"]).optional(),
        actionType: z.enum(["pause", "increase_budget", "decrease_budget", "notify"]).optional(),
        actionValue: z.string().optional(),
        notifyOnTrigger: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

      const [rule] = await db.update(adAutomationRules)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(adAutomationRules.id, req.params.id), eq(adAutomationRules.merchantId, merchantId)))
        .returning();

      if (!rule) return res.status(404).json({ error: "Rule not found" });
      res.json({ rule });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/meta/automation-rules/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      await db.delete(adAutomationRules)
        .where(and(eq(adAutomationRules.id, req.params.id), eq(adAutomationRules.merchantId, merchantId)));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/automation-rules/evaluate", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const result = await evaluateAutomationRules(merchantId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/media-library/upload", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const schema = z.object({
        name: z.string().min(1),
        type: z.enum(["image", "video"]).default("image"),
        data: z.string().min(1),
        mimeType: z.string().min(1),
        fileSize: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid upload data", details: parsed.error.flatten() });
      }

      const { name, type, data, mimeType, fileSize, width, height } = parsed.data;

      const creds = await getCredentialsForMerchant(merchantId);
      const actId = `act_${creds.adAccountId.replace("act_", "")}`;
      const token = creds.accessToken;

      let metaHash: string | undefined;
      let metaUrl: string | undefined;

      if (type === "image") {
        const formBody = new URLSearchParams();
        formBody.set("access_token", token);
        formBody.set("bytes", data);

        const uploadRes = await fetch(`${META_BASE_URL}/${actId}/adimages`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formBody.toString(),
        });
        const uploadData = await uploadRes.json();

        if (uploadData.error) {
          return res.status(400).json({ error: uploadData.error.message });
        }

        const images = uploadData.images;
        if (images) {
          const firstKey = Object.keys(images)[0];
          metaHash = images[firstKey]?.hash;
          metaUrl = images[firstKey]?.url;
        }
      } else if (type === "video") {
        const boundary = `----FormBoundary${crypto.randomBytes(16).toString("hex")}`;
        const buffer = Buffer.from(data, "base64");

        const parts: Buffer[] = [];
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${token}\r\n`));
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="${name}"\r\nContent-Type: ${mimeType}\r\n\r\n`));
        parts.push(buffer);
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

        const body = Buffer.concat(parts);

        const uploadRes = await fetch(`${META_BASE_URL}/${actId}/advideos`, {
          method: "POST",
          headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
          body,
        });
        const uploadData = await uploadRes.json();

        if (uploadData.error) {
          return res.status(400).json({ error: uploadData.error.message });
        }

        metaHash = uploadData.id;
      }

      const [media] = await db.insert(adMediaLibrary).values({
        merchantId,
        name,
        type,
        url: metaUrl || `data:${mimeType};base64,${data.substring(0, 100)}...`,
        metaMediaHash: metaHash || null,
        width: width || null,
        height: height || null,
        fileSize: fileSize || null,
      }).returning();

      res.json({ media, metaHash, metaUrl });
    } catch (error: any) {
      console.error("[MetaMedia] Upload error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // WHATSAPP EMBEDDED SIGNUP
  // ============================================

  app.post("/api/whatsapp/embedded-signup", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { code, sessionWabaId, sessionPhoneId, wabaId: reqWabaId, phoneNumberId: reqPhoneId } = req.body;

      if (!code) {
        return res.status(400).json({ error: "Authorization code is required" });
      }

      const metaConf = await getMetaConfig();
      if (!metaConf.facebookAppId || !metaConf.facebookAppSecret) {
        return res.status(400).json({ error: "Facebook App credentials not configured" });
      }

      const tokenUrl = new URL(`${META_BASE_URL}/oauth/access_token`);
      tokenUrl.searchParams.set("client_id", metaConf.facebookAppId);
      tokenUrl.searchParams.set("client_secret", metaConf.facebookAppSecret);
      tokenUrl.searchParams.set("code", code);

      const tokenRes = await fetch(tokenUrl.toString());
      if (!tokenRes.ok) {
        const errText = await tokenRes.text().catch(() => "Unknown error");
        console.error("[WA-Signup] Token exchange failed:", tokenRes.status, errText);
        return res.status(400).json({ error: "Token exchange failed" });
      }

      const tokenData = await tokenRes.json() as any;
      if (!tokenData?.access_token) {
        return res.status(400).json({ error: "No access token received from Meta" });
      }

      const userToken = tokenData.access_token;

      const authHeaders = { "Authorization": `Bearer ${userToken}`, "Content-Type": "application/json" };

      let wabaId: string | null = sessionWabaId || reqWabaId || null;
      let phoneNumberId: string | null = sessionPhoneId || reqPhoneId || null;
      let displayPhone = "";
      let verifiedName = "";

      if (wabaId && phoneNumberId) {
        console.log(`[WA-Signup] Validating pre-captured IDs from sessionInfoListener — WABA: ${wabaId}, Phone: ${phoneNumberId}`);
        let validated = false;
        try {
          const phonesUrl = new URL(`${META_BASE_URL}/${wabaId}/phone_numbers`);
          phonesUrl.searchParams.set("fields", "id,display_phone_number,verified_name");
          const phonesRes = await fetch(phonesUrl.toString(), { headers: { "Authorization": `Bearer ${userToken}` } });
          if (phonesRes.ok) {
            const phonesData = await phonesRes.json() as any;
            const matchedPhone = (phonesData.data || []).find((p: any) => String(p.id) === String(phoneNumberId));
            if (matchedPhone) {
              displayPhone = matchedPhone.display_phone_number || "";
              verifiedName = matchedPhone.verified_name || "";
              validated = true;
              console.log(`[WA-Signup] Pre-captured IDs validated — Phone ${phoneNumberId} belongs to WABA ${wabaId}`);
            } else {
              console.warn(`[WA-Signup] Pre-captured phone ${phoneNumberId} not found under WABA ${wabaId}, falling back to server discovery`);
            }
          }
        } catch (e: any) {
          console.warn(`[WA-Signup] Could not validate pre-captured IDs:`, e.message);
        }
        if (!validated) {
          wabaId = null;
          phoneNumberId = null;
        }
      }

      if (!wabaId || !phoneNumberId) {
        const appToken = `${metaConf.facebookAppId}|${metaConf.facebookAppSecret}`;
        const debugUrl = new URL(`${META_BASE_URL}/debug_token`);
        debugUrl.searchParams.set("input_token", userToken);
        const debugRes = await fetch(debugUrl.toString(), { headers: { "Authorization": `Bearer ${appToken}` } });
        const debugData = debugRes.ok ? await debugRes.json().catch(() => null) : null;
        const granularScopes = debugData?.data?.granular_scopes || [];
        const waScope = granularScopes.find((s: any) => s.scope === "whatsapp_business_management");

        if (waScope?.target_ids?.length > 0) {
          wabaId = waScope.target_ids[0];
          console.log(`[WA-Signup] Found WABA ID from token debug: ${wabaId}`);
        }

        if (!wabaId) {
          const sharedWabaUrl = new URL(`${META_BASE_URL}/me/businesses`);
          sharedWabaUrl.searchParams.set("fields", "id,name");
          const bizRes = await fetch(sharedWabaUrl.toString(), { headers: { "Authorization": `Bearer ${userToken}` } });
          const bizData = bizRes.ok ? await bizRes.json().catch(() => ({ data: [] })) : { data: [] };

          for (const biz of (bizData.data || [])) {
            const wabaListUrl = new URL(`${META_BASE_URL}/${biz.id}/owned_whatsapp_business_accounts`);
            wabaListUrl.searchParams.set("fields", "id,name");
            const wabaRes = await fetch(wabaListUrl.toString(), { headers: { "Authorization": `Bearer ${userToken}` } });
            const wabaData = wabaRes.ok ? await wabaRes.json().catch(() => ({ data: [] })) : { data: [] };
            if (wabaData.data?.length > 0) {
              wabaId = wabaData.data[0].id;
              console.log(`[WA-Signup] Found WABA ID from business lookup: ${wabaId}`);
              break;
            }
          }
        }

        if (!wabaId) {
          return res.status(400).json({ error: "Could not find a WhatsApp Business Account. Please make sure you completed the signup." });
        }

        const phonesUrl = new URL(`${META_BASE_URL}/${wabaId}/phone_numbers`);
        phonesUrl.searchParams.set("fields", "id,display_phone_number,verified_name,quality_rating");
        const phonesRes = await fetch(phonesUrl.toString(), { headers: { "Authorization": `Bearer ${userToken}` } });
        const phonesData = phonesRes.ok ? await phonesRes.json().catch(() => ({ data: [] })) : { data: [] };
        const phoneNumbers = phonesData.data || [];

        if (phoneNumbers.length === 0) {
          return res.status(400).json({ error: "No phone numbers found on this WhatsApp Business Account. Please add a phone number in the Meta Business Manager and try again." });
        }

        const phone = phoneNumbers[0];
        phoneNumberId = phone.id;
        displayPhone = phone.display_phone_number || "";
        verifiedName = phone.verified_name || "";
      }

      const { randomUUID } = await import("crypto");
      let existingVerifyToken: string | null = null;
      const [existingMerchant] = await db.select({ waVerifyToken: merchants.waVerifyToken })
        .from(merchants).where(eq(merchants.id, merchantId)).limit(1);
      existingVerifyToken = existingMerchant?.waVerifyToken || randomUUID();

      await db.update(merchants).set({
        waPhoneNumberId: phoneNumberId,
        waAccessToken: userToken,
        waWabaId: wabaId,
        waVerifyToken: existingVerifyToken,
        waDisconnected: false,
        waPhoneRegistered: false,
        updatedAt: new Date(),
      }).where(eq(merchants.id, merchantId));

      const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const canonicalHost = `${proto}://${req.get("host")}`;
      const webhookUrl = `${canonicalHost}/webhooks/whatsapp/${merchantId}`;

      console.log(`[WA-Signup] WhatsApp Embedded Signup completed for merchant ${merchantId}. WABA: ${wabaId}, Phone: ${phoneNumberId} (${displayPhone})`);

      try {
        const subscribeUrl = new URL(`${META_BASE_URL}/${wabaId}/subscribed_apps`);
        const subscribeRes = await fetch(subscribeUrl.toString(), {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            override_callback_uri: webhookUrl,
            verify_token: existingVerifyToken,
          }),
        });
        const subscribeData = subscribeRes.ok ? await subscribeRes.json().catch(() => null) : null;
        if (!subscribeRes.ok) {
          const subErrData = await subscribeRes.json().catch(() => null);
          console.warn(`[WA-Signup] App subscription failed (${subscribeRes.status}):`, JSON.stringify(subErrData));
        } else {
          console.log(`[WA-Signup] App subscription with webhook override result:`, subscribeData);
        }
      } catch (subErr: any) {
        console.warn(`[WA-Signup] App subscription failed (non-blocking):`, subErr.message);
      }

      let registrationStatus: string = "pin_required";
      let registrationError: string | null = null;

      try {
        const autoRegUrl = new URL(`${META_BASE_URL}/${phoneNumberId}/register`);
        const autoRegRes = await fetch(autoRegUrl.toString(), {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messaging_product: "whatsapp" }),
        });
        const autoRegData = await autoRegRes.json().catch(() => null) as any;

        if (autoRegRes.ok) {
          registrationStatus = "success";
          registrationError = null;
          await db.update(merchants).set({
            waPhoneRegistered: true,
            updatedAt: new Date(),
          }).where(eq(merchants.id, merchantId));
          console.log(`[WA-Signup] Auto-registration succeeded for phone ${phoneNumberId} (merchant ${merchantId})`);
        } else {
          const errorSubcode = autoRegData?.error?.error_subcode;
          const errorMsg = autoRegData?.error?.error_user_msg || autoRegData?.error?.message || "";
          console.log(`[WA-Signup] Auto-registration failed (${autoRegRes.status}, subcode ${errorSubcode}): ${errorMsg}`);

          if (errorSubcode === 2388001) {
            registrationStatus = "pin_required";
            registrationError = "This number has two-step verification enabled. Enter your 6-digit PIN to complete registration.";
          } else {
            registrationStatus = "failed";
            registrationError = errorMsg || "Phone registration failed. You can retry below.";
          }
        }
      } catch (regErr: any) {
        console.warn(`[WA-Signup] Auto-registration error (non-blocking):`, regErr.message);
        registrationStatus = "failed";
        registrationError = "Could not auto-register phone. You can retry with your PIN below.";
      }

      res.json({
        success: true,
        wabaId,
        phoneNumberId,
        displayPhone,
        verifiedName,
        webhookUrl,
        verifyToken: existingVerifyToken,
        registrationStatus,
        registrationError,
      });
    } catch (error: any) {
      console.error("[WA-Signup] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/whatsapp/register-phone", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { pin } = req.body;

      if (!pin || typeof pin !== "string" || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
        return res.status(400).json({ error: "A valid 6-digit PIN is required. This is your WhatsApp two-step verification PIN." });
      }

      const [merchant] = await db.select({
        waPhoneNumberId: merchants.waPhoneNumberId,
        waAccessToken: merchants.waAccessToken,
      }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);

      if (!merchant?.waPhoneNumberId || !merchant?.waAccessToken) {
        return res.status(400).json({ error: "WhatsApp is not connected. Complete the Embedded Signup first." });
      }

      const registerUrl = new URL(`${META_BASE_URL}/${merchant.waPhoneNumberId}/register`);
      const registerRes = await fetch(registerUrl.toString(), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${merchant.waAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          pin,
        }),
      });
      const registerData = await registerRes.json().catch(() => null) as any;

      if (registerRes.ok) {
        console.log(`[WA-Register] Phone ${merchant.waPhoneNumberId} registered successfully for merchant ${merchantId}`);
        await db.update(merchants).set({
          waPhoneRegistered: true,
          updatedAt: new Date(),
        }).where(eq(merchants.id, merchantId));
        return res.json({ success: true, registrationStatus: "success" });
      }

      const errorSubcode = registerData?.error?.error_subcode;
      const is2fa = errorSubcode === 2388001;
      const errorMsg = registerData?.error?.error_user_msg || registerData?.error?.message || "Registration failed";
      console.error(`[WA-Register] Phone registration failed (${registerRes.status}):`, JSON.stringify(registerData));
      return res.status(400).json({
        error: errorMsg,
        registrationStatus: is2fa ? "2fa_required" : "failed",
      });
    } catch (error: any) {
      console.error("[WA-Register] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/whatsapp/embedded-signup/config", isAuthenticated, async (req: any, res) => {
    try {
      const metaConf = await getMetaConfig();
      if (!metaConf.facebookAppId) {
        return res.status(400).json({ error: "Facebook App not configured" });
      }
      res.json({ appId: metaConf.facebookAppId, configId: metaConf.whatsappEmbeddedSignupConfigId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // SALES LAUNCHER — Clean rebuild
  // ============================================

  app.post("/api/meta/sales/diagnostics", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);

      const creds = await getCredentialsForMerchant(merchantId);
      const [merchant] = await db.select({
        pageId: merchants.metaSelectedPageId,
        pixelId: merchants.metaSelectedPixelId,
      }).from(merchants).where(eq(merchants.id, merchantId));

      const pageId = req.body.pageId || merchant?.pageId || "";
      const pixelId = req.body.pixelId || merchant?.pixelId || null;

      const result = await runDiagnostics({
        accessToken: creds.accessToken,
        adAccountId: creds.adAccountId,
        pageId,
        pixelId: pixelId === "none" ? null : pixelId,
        merchantId,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/sales/validate", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);

      const normalized = normalizeInput(req.body);
      const fieldIssues = validateLaunchInput(normalized);

      let connectionIssues: ValidationIssue[] = [];
      let mediaIssues: ValidationIssue[] = [];
      try {
        const creds = await getCredentialsForMerchant(merchantId);
        connectionIssues = await validateConnection(creds.accessToken, creds.adAccountId, normalized.pageId, merchantId);

        if (connectionIssues.length === 0) {
          mediaIssues = await validateMediaReadiness(normalized, creds.accessToken, merchantId);
        }
      } catch (connErr: unknown) {
        const errMsg = connErr instanceof Error ? connErr.message : String(connErr);
        connectionIssues = [{ code: "CONNECTION_ERROR", field: "connection", stage: "connection" as const, message: errMsg, fixSuggestion: "Ensure your Meta account is connected." }];
      }

      const allIssues = [...fieldIssues, ...connectionIssues, ...mediaIssues];
      res.json({ valid: allIssues.length === 0, issues: allIssues, normalized });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/sales/launch", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const merchantId = await getMerchantId(req);

      const result = await startSalesLaunch(merchantId, req.body);
      res.json(result);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  app.post("/api/meta/sales/upload-image", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const creds = await getCredentialsForMerchant(merchantId);
      const endpoint = `${creds.adAccountId}/adimages`;

      const { imageUrl, imageBase64, filename } = req.body;
      if (!imageUrl && !imageBase64) return res.status(400).json({ error: "imageUrl or imageBase64 is required" });

      let result: { hash: string; url: string };

      if (imageBase64) {
        const formData = new URLSearchParams();
        formData.set("access_token", creds.accessToken);
        formData.set("bytes", imageBase64);
        if (filename) formData.set("name", filename);

        const response = await fetch(`${META_BASE_URL}/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        });
        const data = await response.json();

        try {
          await db.insert(metaApiLogs).values({
            merchantId,
            stage: "upload_image_file",
            endpoint,
            method: "POST",
            requestJson: { filename, bytes_length: imageBase64.length },
            responseJson: data,
            httpStatus: response.status,
            success: response.ok,
          });
        } catch (logErr) {
          console.warn("[Marketing] Failed to write image file upload log:", logErr instanceof Error ? logErr.message : logErr);
        }

        if (!response.ok) throw new Error(data?.error?.message || "Image file upload failed");
        const images = data?.images;
        if (!images || typeof images !== "object" || Object.keys(images).length === 0) {
          throw new Error("Meta returned success but no image data. Please try again.");
        }
        const firstKey = Object.keys(images)[0];
        result = { hash: images[firstKey].hash, url: images[firstKey].url };
      } else {
        result = await uploadImageToMeta(merchantId, imageUrl);

        try {
          await db.insert(metaApiLogs).values({
            merchantId,
            stage: "upload_image_url",
            endpoint,
            method: "POST",
            requestJson: { url: imageUrl },
            responseJson: { hash: result.hash, url: result.url },
            httpStatus: 200,
            success: true,
          });
        } catch (logErr) {
          console.warn("[Marketing] Failed to write image upload log:", logErr instanceof Error ? logErr.message : logErr);
        }
      }

      res.json({ success: true, imageHash: result.hash, imageUrl: result.url });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/meta/sales/upload-video", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);

      const { videoUrl, videoBase64, filename } = req.body;
      if (!videoUrl && !videoBase64) return res.status(400).json({ error: "videoUrl or videoBase64 is required" });

      const creds = await getCredentialsForMerchant(merchantId);
      const endpoint = `${creds.adAccountId}/advideos`;

      let response: Response;
      let data: any;

      if (videoBase64) {
        const binaryBuffer = Buffer.from(videoBase64, "base64");
        const boundary = `----FormBoundary${Date.now()}`;
        const fname = filename || "video.mp4";
        const bodyParts = [
          `--${boundary}\r\n`,
          `Content-Disposition: form-data; name="access_token"\r\n\r\n`,
          `${creds.accessToken}\r\n`,
          `--${boundary}\r\n`,
          `Content-Disposition: form-data; name="title"\r\n\r\n`,
          `${fname}\r\n`,
          `--${boundary}\r\n`,
          `Content-Disposition: form-data; name="source"; filename="${fname}"\r\n`,
          `Content-Type: video/mp4\r\n\r\n`,
        ];
        const prefix = Buffer.from(bodyParts.join(""));
        const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
        const fullBody = Buffer.concat([prefix, binaryBuffer, suffix]);

        response = await fetch(`${META_BASE_URL}/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
          body: fullBody,
        });
        data = await response.json();
      } else {
        const formData = new URLSearchParams();
        formData.set("access_token", creds.accessToken);
        formData.set("file_url", videoUrl);
        if (filename) formData.set("title", filename);

        response = await fetch(`${META_BASE_URL}/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        });
        data = await response.json();
      }

      try {
        await db.insert(metaApiLogs).values({
          merchantId,
          stage: videoBase64 ? "upload_video_file" : "upload_video_url",
          endpoint,
          method: "POST",
          requestJson: videoBase64 ? { filename, bytes_length: videoBase64.length } : { file_url: videoUrl },
          responseJson: data,
          httpStatus: response.status,
          success: response.ok,
        });
      } catch (logErr) {
        console.warn("[Marketing] Failed to write video upload log:", logErr instanceof Error ? logErr.message : logErr);
      }

      if (!response.ok) {
        throw new Error(data?.error?.message || "Video upload failed");
      }

      const videoStatus = data.status?.video_status || "processing";
      res.json({ success: true, videoId: data.id, status: videoStatus, pollRequired: videoStatus !== "ready" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/meta/sales/video-status/:videoId", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);

      const creds = await getCredentialsForMerchant(merchantId);
      const endpoint = `${req.params.videoId}`;
      const url = new URL(`${META_BASE_URL}/${endpoint}`);
      url.searchParams.set("access_token", creds.accessToken);
      url.searchParams.set("fields", "id,status,title,picture,length");

      const response = await fetch(url.toString());
      const data = await response.json();

      try {
        await db.insert(metaApiLogs).values({
          merchantId,
          stage: "video_status",
          endpoint,
          method: "GET",
          requestJson: { fields: "id,status,title,picture,length" },
          responseJson: data,
          httpStatus: response.status,
          success: response.ok,
        });
      } catch (logErr) {
        console.warn("[Marketing] Failed to write video status log:", logErr instanceof Error ? logErr.message : logErr);
      }

      if (!response.ok) {
        throw new Error(data?.error?.message || "Failed to check video status");
      }

      const videoStatus = data.status?.video_status || "processing";
      res.json({
        videoId: data.id,
        status: videoStatus,
        ready: videoStatus === "ready",
        title: data.title || "",
        picture: data.picture || "",
        length: data.length || 0,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/meta/sales/launch-jobs", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);

      const jobs = await db.select().from(adLaunchJobs)
        .where(eq(adLaunchJobs.merchantId, merchantId))
        .orderBy(desc(adLaunchJobs.createdAt))
        .limit(50);

      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/meta/sales/launch-jobs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);

      const [job] = await db.select().from(adLaunchJobs)
        .where(and(eq(adLaunchJobs.id, req.params.id), eq(adLaunchJobs.merchantId, merchantId)));

      if (!job) return res.status(404).json({ error: "Launch job not found" });

      const logs = await db.select().from(metaApiLogs)
        .where(eq(metaApiLogs.launchJobId, req.params.id))
        .orderBy(metaApiLogs.createdAt);

      res.json({ job, apiLogs: logs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
