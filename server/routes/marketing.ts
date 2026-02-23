import { Express, Response } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { adCampaigns, adAccounts, teamMembers } from "@shared/schema";
import {
  fullSync,
  getInsightsSummary,
  getCampaignInsights,
  getDailyInsights,
  getActiveCampaigns,
  getLastSyncInfo,
} from "../services/metaAds";

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
      const hasCredentials = !!(process.env.FACEBOOK_ACCESS_TOKEN && process.env.FACEBOOK_AD_ACCOUNT_ID);
      res.json({ lastSync, hasCredentials });
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
}
