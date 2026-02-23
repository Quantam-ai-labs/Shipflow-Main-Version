import { db } from "../db";
import { adAccounts, adCampaigns, adSets, adCreatives, adInsights, marketingSyncLogs } from "@shared/schema";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

interface MetaApiOptions {
  accessToken: string;
  adAccountId: string;
}

function getCredentials(): MetaApiOptions {
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) {
    throw new Error("Facebook credentials not configured");
  }
  return {
    accessToken,
    adAccountId: adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`,
  };
}

async function metaApiFetch(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const creds = getCredentials();
  const url = new URL(`${META_BASE_URL}/${endpoint}`);
  url.searchParams.set("access_token", creds.accessToken);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[MetaAds] API error ${response.status}: ${errorBody}`);
    throw new Error(`Meta API error: ${response.status} - ${errorBody}`);
  }
  return response.json();
}

async function fetchAllPages(endpoint: string, params: Record<string, string> = {}): Promise<any[]> {
  let results: any[] = [];
  let url: string | null = null;

  const creds = getCredentials();
  const initialUrl = new URL(`${META_BASE_URL}/${endpoint}`);
  initialUrl.searchParams.set("access_token", creds.accessToken);
  initialUrl.searchParams.set("limit", "500");
  for (const [k, v] of Object.entries(params)) {
    initialUrl.searchParams.set(k, v);
  }
  url = initialUrl.toString();

  while (url) {
    const resp: globalThis.Response = await fetch(url);
    if (!resp.ok) {
      const errorBody = await resp.text();
      console.error(`[MetaAds] Paginated API error: ${errorBody}`);
      break;
    }
    const body: any = await resp.json();
    if (body.data) {
      results = results.concat(body.data);
    }
    url = body.paging?.next || null;
  }
  return results;
}

export async function syncAdAccount(merchantId: string): Promise<any> {
  const creds = getCredentials();
  const data = await metaApiFetch(creds.adAccountId, {
    fields: "account_id,name,currency,timezone_name,account_status",
  });

  const statusMap: Record<number, string> = { 1: "ACTIVE", 2: "DISABLED", 3: "UNSETTLED", 7: "PENDING_RISK_REVIEW", 100: "PENDING_CLOSURE" };

  const existing = await db.select().from(adAccounts)
    .where(and(eq(adAccounts.merchantId, merchantId), eq(adAccounts.accountId, data.account_id)));

  const accountData = {
    merchantId,
    provider: "facebook" as const,
    accountId: data.account_id,
    name: data.name,
    currency: data.currency,
    timezone: data.timezone_name,
    status: statusMap[data.account_status] || "UNKNOWN",
    lastSyncedAt: new Date(),
  };

  if (existing.length > 0) {
    await db.update(adAccounts).set(accountData).where(eq(adAccounts.id, existing[0].id));
    return existing[0].id;
  } else {
    const [inserted] = await db.insert(adAccounts).values(accountData).returning({ id: adAccounts.id });
    return inserted.id;
  }
}

export async function syncCampaigns(merchantId: string, adAccountDbId: string): Promise<number> {
  const creds = getCredentials();
  const campaigns = await fetchAllPages(`${creds.adAccountId}/campaigns`, {
    fields: "id,name,status,objective,daily_budget,lifetime_budget",
  });

  let count = 0;
  for (const c of campaigns) {
    await db.insert(adCampaigns).values({
      merchantId,
      adAccountId: adAccountDbId,
      campaignId: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      dailyBudget: c.daily_budget ? (parseFloat(c.daily_budget) / 100).toFixed(2) : null,
      lifetimeBudget: c.lifetime_budget ? (parseFloat(c.lifetime_budget) / 100).toFixed(2) : null,
    }).onConflictDoUpdate({
      target: [adCampaigns.merchantId, adCampaigns.campaignId],
      set: {
        name: sql`excluded.name`,
        status: sql`excluded.status`,
        objective: sql`excluded.objective`,
        dailyBudget: sql`excluded.daily_budget`,
        lifetimeBudget: sql`excluded.lifetime_budget`,
        updatedAt: new Date(),
      },
    });
    count++;
  }
  return count;
}

export async function syncAdSets(merchantId: string, adAccountDbId: string): Promise<number> {
  const creds = getCredentials();
  const adsets = await fetchAllPages(`${creds.adAccountId}/adsets`, {
    fields: "id,name,campaign_id,status,daily_budget,targeting",
  });

  let count = 0;
  for (const a of adsets) {
    await db.insert(adSets).values({
      merchantId,
      adAccountId: adAccountDbId,
      campaignId: a.campaign_id,
      adsetId: a.id,
      name: a.name,
      status: a.status,
      dailyBudget: a.daily_budget ? (parseFloat(a.daily_budget) / 100).toFixed(2) : null,
      targeting: a.targeting || null,
    }).onConflictDoUpdate({
      target: [adSets.merchantId, adSets.adsetId],
      set: {
        name: sql`excluded.name`,
        status: sql`excluded.status`,
        dailyBudget: sql`excluded.daily_budget`,
        targeting: sql`excluded.targeting`,
        updatedAt: new Date(),
      },
    });
    count++;
  }
  return count;
}

export async function syncAds(merchantId: string, adAccountDbId: string): Promise<number> {
  const creds = getCredentials();
  const ads = await fetchAllPages(`${creds.adAccountId}/ads`, {
    fields: "id,name,adset_id,status",
  });

  let count = 0;
  for (const ad of ads) {
    await db.insert(adCreatives).values({
      merchantId,
      adAccountId: adAccountDbId,
      adsetId: ad.adset_id,
      adId: ad.id,
      name: ad.name,
      status: ad.status,
    }).onConflictDoUpdate({
      target: [adCreatives.merchantId, adCreatives.adId],
      set: {
        name: sql`excluded.name`,
        status: sql`excluded.status`,
        updatedAt: new Date(),
      },
    });
    count++;
  }
  return count;
}

export async function syncInsights(merchantId: string, adAccountDbId: string, dateFrom: string, dateTo: string): Promise<number> {
  const creds = getCredentials();

  const actionFields = "actions,action_values,cost_per_action_type";
  const insightsData = await fetchAllPages(`${creds.adAccountId}/insights`, {
    fields: `campaign_id,impressions,reach,clicks,cpc,cpm,ctr,spend,frequency,video_views,${actionFields}`,
    level: "campaign",
    time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
    time_increment: "1",
  });

  let count = 0;
  for (const row of insightsData) {
    const actions = row.actions || [];
    const actionValues = row.action_values || [];
    const costPerAction = row.cost_per_action_type || [];

    const purchases = actions.find((a: any) => a.action_type === "purchase")?.value || 0;
    const revenue = actionValues.find((a: any) => a.action_type === "purchase")?.value || 0;
    const addToCart = actions.find((a: any) => a.action_type === "add_to_cart")?.value || 0;
    const initiateCheckout = actions.find((a: any) => a.action_type === "initiate_checkout")?.value || 0;
    const costPerPurchase = costPerAction.find((a: any) => a.action_type === "purchase")?.value || 0;

    await db.insert(adInsights).values({
      merchantId,
      adAccountId: adAccountDbId,
      entityId: row.campaign_id,
      entityType: "campaign",
      date: row.date_start,
      impressions: parseInt(row.impressions || "0"),
      reach: parseInt(row.reach || "0"),
      clicks: parseInt(row.clicks || "0"),
      spend: row.spend || "0",
      purchases: parseInt(purchases),
      revenue: String(revenue),
      cpc: row.cpc || "0",
      cpm: row.cpm || "0",
      ctr: row.ctr || "0",
      frequency: row.frequency || "0",
      addToCart: parseInt(addToCart),
      initiateCheckout: parseInt(initiateCheckout),
      videoViews: parseInt(row.video_views || "0"),
      costPerPurchase: String(costPerPurchase),
    }).onConflictDoUpdate({
      target: [adInsights.merchantId, adInsights.entityId, adInsights.entityType, adInsights.date],
      set: {
        impressions: sql`excluded.impressions`,
        reach: sql`excluded.reach`,
        clicks: sql`excluded.clicks`,
        spend: sql`excluded.spend`,
        purchases: sql`excluded.purchases`,
        revenue: sql`excluded.revenue`,
        cpc: sql`excluded.cpc`,
        cpm: sql`excluded.cpm`,
        ctr: sql`excluded.ctr`,
        frequency: sql`excluded.frequency`,
        addToCart: sql`excluded.add_to_cart`,
        initiateCheckout: sql`excluded.initiate_checkout`,
        videoViews: sql`excluded.video_views`,
        costPerPurchase: sql`excluded.cost_per_purchase`,
        updatedAt: new Date(),
      },
    });
    count++;
  }
  return count;
}

export async function fullSync(merchantId: string, dateFrom?: string, dateTo?: string): Promise<{ campaigns: number; adsets: number; ads: number; insights: number }> {
  const logId = await createSyncLog(merchantId, "full_sync", "in_progress");

  try {
    const adAccountDbId = await syncAdAccount(merchantId);
    const campaigns = await syncCampaigns(merchantId, adAccountDbId);
    const adsets = await syncAdSets(merchantId, adAccountDbId);
    const ads = await syncAds(merchantId, adAccountDbId);

    const now = new Date();
    const from = dateFrom || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const to = dateTo || now.toISOString().split("T")[0];
    const insights = await syncInsights(merchantId, adAccountDbId, from, to);

    await completeSyncLog(logId, "completed", campaigns + adsets + ads + insights);
    console.log(`[MetaAds] Full sync done: ${campaigns} campaigns, ${adsets} adsets, ${ads} ads, ${insights} insights`);
    return { campaigns, adsets, ads, insights };
  } catch (error: any) {
    await completeSyncLog(logId, "failed", 0, error.message);
    console.error(`[MetaAds] Full sync failed:`, error.message);
    throw error;
  }
}

export async function getInsightsSummary(merchantId: string, dateFrom: string, dateTo: string) {
  const result = await db.select({
    totalSpend: sql<string>`COALESCE(SUM(${adInsights.spend}::numeric), 0)`,
    totalRevenue: sql<string>`COALESCE(SUM(${adInsights.revenue}::numeric), 0)`,
    totalPurchases: sql<number>`COALESCE(SUM(${adInsights.purchases}), 0)`,
    totalImpressions: sql<number>`COALESCE(SUM(${adInsights.impressions}), 0)`,
    totalClicks: sql<number>`COALESCE(SUM(${adInsights.clicks}), 0)`,
    totalReach: sql<number>`COALESCE(SUM(${adInsights.reach}), 0)`,
  }).from(adInsights)
    .where(and(
      eq(adInsights.merchantId, merchantId),
      gte(adInsights.date, dateFrom),
      lte(adInsights.date, dateTo),
    ));

  const summary = result[0];
  const spend = parseFloat(summary.totalSpend);
  const revenue = parseFloat(summary.totalRevenue);

  return {
    totalSpend: spend,
    totalRevenue: revenue,
    totalPurchases: summary.totalPurchases,
    totalImpressions: summary.totalImpressions,
    totalClicks: summary.totalClicks,
    totalReach: summary.totalReach,
    roas: spend > 0 ? (revenue / spend) : 0,
    cpa: summary.totalPurchases > 0 ? (spend / summary.totalPurchases) : 0,
    avgCtr: summary.totalImpressions > 0 ? ((summary.totalClicks / summary.totalImpressions) * 100) : 0,
  };
}

export async function getCampaignInsights(merchantId: string, dateFrom: string, dateTo: string) {
  const result = await db.select({
    campaignId: adInsights.entityId,
    totalSpend: sql<string>`COALESCE(SUM(${adInsights.spend}::numeric), 0)`,
    totalRevenue: sql<string>`COALESCE(SUM(${adInsights.revenue}::numeric), 0)`,
    totalPurchases: sql<number>`COALESCE(SUM(${adInsights.purchases}), 0)`,
    totalImpressions: sql<number>`COALESCE(SUM(${adInsights.impressions}), 0)`,
    totalClicks: sql<number>`COALESCE(SUM(${adInsights.clicks}), 0)`,
    totalReach: sql<number>`COALESCE(SUM(${adInsights.reach}), 0)`,
    avgCpc: sql<string>`COALESCE(AVG(${adInsights.cpc}::numeric), 0)`,
    avgCtr: sql<string>`COALESCE(AVG(${adInsights.ctr}::numeric), 0)`,
  }).from(adInsights)
    .where(and(
      eq(adInsights.merchantId, merchantId),
      eq(adInsights.entityType, "campaign"),
      gte(adInsights.date, dateFrom),
      lte(adInsights.date, dateTo),
    ))
    .groupBy(adInsights.entityId);

  const campaigns = await db.select().from(adCampaigns).where(eq(adCampaigns.merchantId, merchantId));
  const campaignMap = new Map(campaigns.map(c => [c.campaignId, c]));

  return result.map(r => {
    const campaign = campaignMap.get(r.campaignId);
    const spend = parseFloat(r.totalSpend);
    const revenue = parseFloat(r.totalRevenue);
    return {
      campaignId: r.campaignId,
      name: campaign?.name || "Unknown",
      status: campaign?.status || "UNKNOWN",
      objective: campaign?.objective,
      spend,
      revenue,
      purchases: r.totalPurchases,
      impressions: r.totalImpressions,
      clicks: r.totalClicks,
      reach: r.totalReach,
      cpc: parseFloat(r.avgCpc),
      ctr: parseFloat(r.avgCtr),
      roas: spend > 0 ? revenue / spend : 0,
      cpa: r.totalPurchases > 0 ? spend / r.totalPurchases : 0,
    };
  });
}

export async function getDailyInsights(merchantId: string, dateFrom: string, dateTo: string) {
  return db.select({
    date: adInsights.date,
    totalSpend: sql<string>`COALESCE(SUM(${adInsights.spend}::numeric), 0)`,
    totalRevenue: sql<string>`COALESCE(SUM(${adInsights.revenue}::numeric), 0)`,
    totalPurchases: sql<number>`COALESCE(SUM(${adInsights.purchases}), 0)`,
    totalClicks: sql<number>`COALESCE(SUM(${adInsights.clicks}), 0)`,
    totalImpressions: sql<number>`COALESCE(SUM(${adInsights.impressions}), 0)`,
  }).from(adInsights)
    .where(and(
      eq(adInsights.merchantId, merchantId),
      gte(adInsights.date, dateFrom),
      lte(adInsights.date, dateTo),
    ))
    .groupBy(adInsights.date)
    .orderBy(adInsights.date);
}

export async function getActiveCampaigns(merchantId: string) {
  const campaigns = await db.select().from(adCampaigns)
    .where(and(eq(adCampaigns.merchantId, merchantId), eq(adCampaigns.status, "ACTIVE")));

  const today = new Date().toISOString().split("T")[0];
  const insights = await db.select({
    entityId: adInsights.entityId,
    spend: sql<string>`COALESCE(SUM(${adInsights.spend}::numeric), 0)`,
    revenue: sql<string>`COALESCE(SUM(${adInsights.revenue}::numeric), 0)`,
    purchases: sql<number>`COALESCE(SUM(${adInsights.purchases}), 0)`,
    impressions: sql<number>`COALESCE(SUM(${adInsights.impressions}), 0)`,
    clicks: sql<number>`COALESCE(SUM(${adInsights.clicks}), 0)`,
  }).from(adInsights)
    .where(and(
      eq(adInsights.merchantId, merchantId),
      eq(adInsights.date, today),
    ))
    .groupBy(adInsights.entityId);

  const insightMap = new Map(insights.map(i => [i.entityId, i]));

  return campaigns.map(c => {
    const todayData = insightMap.get(c.campaignId);
    const spend = todayData ? parseFloat(todayData.spend) : 0;
    const revenue = todayData ? parseFloat(todayData.revenue) : 0;
    return {
      ...c,
      todaySpend: spend,
      todayRevenue: revenue,
      todayPurchases: todayData?.purchases || 0,
      todayImpressions: todayData?.impressions || 0,
      todayClicks: todayData?.clicks || 0,
      todayRoas: spend > 0 ? revenue / spend : 0,
    };
  });
}

export async function getLastSyncInfo(merchantId: string) {
  const result = await db.select().from(marketingSyncLogs)
    .where(eq(marketingSyncLogs.merchantId, merchantId))
    .orderBy(desc(marketingSyncLogs.startedAt))
    .limit(1);
  return result[0] || null;
}

async function createSyncLog(merchantId: string, syncType: string, status: string): Promise<string> {
  const [log] = await db.insert(marketingSyncLogs).values({
    merchantId,
    syncType,
    status,
  }).returning({ id: marketingSyncLogs.id });
  return log.id;
}

async function completeSyncLog(logId: string, status: string, recordsProcessed: number, errorMessage?: string) {
  await db.update(marketingSyncLogs).set({
    status,
    recordsProcessed,
    errorMessage: errorMessage || null,
    completedAt: new Date(),
  }).where(eq(marketingSyncLogs.id, logId));
}

let syncIntervalId: ReturnType<typeof setInterval> | null = null;

export function startMarketingSyncScheduler() {
  if (syncIntervalId) return;

  console.log("[MetaAds] Starting marketing sync scheduler (every 15 min)");
  syncIntervalId = setInterval(async () => {
    try {
      const accounts = await db.select().from(adAccounts);
      for (const account of accounts) {
        try {
          await fullSync(account.merchantId);
        } catch (err: any) {
          console.error(`[MetaAds] Scheduled sync failed for merchant ${account.merchantId}:`, err.message);
        }
      }
    } catch (err: any) {
      console.error("[MetaAds] Scheduler error:", err.message);
    }
  }, 15 * 60 * 1000);
}
