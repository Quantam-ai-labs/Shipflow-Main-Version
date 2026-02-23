import { Express, Response } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { adCampaigns, adAccounts, teamMembers, merchants } from "@shared/schema";
import {
  fullSync,
  getInsightsSummary,
  getCampaignInsights,
  getDailyInsights,
  getActiveCampaigns,
  getLastSyncInfo,
  getCredentialsForMerchant,
  testFacebookConnection,
} from "../services/metaAds";
import { encryptToken } from "../services/encryption";

const syncBodySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)").optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)").optional(),
  preset: z.enum(["today", "yesterday", "last7", "last30", "mtd"]).optional(),
}).optional();

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
      const parsed = syncBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      }
      const merchantId = await getMerchantId(req);
      const body = parsed.data || {};
      const result = await fullSync(merchantId, body.dateFrom, body.dateTo);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[Marketing] Sync error:", error.message);
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
      const campaigns = await getCampaignInsights(merchantId, dateFrom, dateTo);
      res.json(campaigns);
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
      const campaigns = await getActiveCampaigns(merchantId);
      res.json(campaigns);
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
}
