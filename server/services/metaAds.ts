import { db } from "../db";
import { adAccounts, adCampaigns, adSets, adCreatives, adInsights, metaSyncRuns, marketingSyncLogs, merchants } from "@shared/schema";
import { eq, and, sql, desc, gte, lte, inArray, like } from "drizzle-orm";
import { decryptToken } from "./encryption";

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

interface MetaApiOptions {
  accessToken: string;
  adAccountId: string;
}

export async function getCredentialsForMerchant(merchantId: string): Promise<MetaApiOptions> {
  const [merchant] = await db.select().from(merchants).where(eq(merchants.id, merchantId));

  if (merchant?.facebookAccessToken && merchant?.facebookAdAccountId) {
    const adAccountId = merchant.facebookAdAccountId;
    return {
      accessToken: decryptToken(merchant.facebookAccessToken),
      adAccountId: adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`,
    };
  }

  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) {
    throw new Error("Facebook credentials not configured. Go to Settings > Marketing to add your Facebook App credentials.");
  }
  return {
    accessToken,
    adAccountId: adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`,
  };
}

export async function testFacebookConnection(creds: MetaApiOptions): Promise<{ success: boolean; accountName?: string; error?: string }> {
  try {
    const adAccountId = creds.adAccountId.startsWith("act_") ? creds.adAccountId : `act_${creds.adAccountId}`;
    const url = new URL(`${META_BASE_URL}/${adAccountId}`);
    url.searchParams.set("access_token", creds.accessToken);
    url.searchParams.set("fields", "account_id,name,account_status");

    const response = await fetch(url.toString());
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: { message: "Unknown error" } }));
      return { success: false, error: errorBody?.error?.message || `API returned status ${response.status}` };
    }
    const data = await response.json();
    return { success: true, accountName: data.name };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function metaApiFetch(creds: MetaApiOptions, endpoint: string, params: Record<string, string> = {}): Promise<any> {
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

async function fetchAllPages(creds: MetaApiOptions, endpoint: string, params: Record<string, string> = {}): Promise<any[]> {
  let results: any[] = [];
  const initialUrl = new URL(`${META_BASE_URL}/${endpoint}`);
  initialUrl.searchParams.set("access_token", creds.accessToken);
  initialUrl.searchParams.set("limit", "500");
  for (const [k, v] of Object.entries(params)) {
    initialUrl.searchParams.set(k, v);
  }
  let url: string | null = initialUrl.toString();

  let pageCount = 0;
  while (url && pageCount < 50) {
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
    pageCount++;
  }
  return results;
}

function parseActionValue(actions: any[], ...actionTypes: string[]): number {
  if (!actions || !Array.isArray(actions)) return 0;
  for (const type of actionTypes) {
    const found = actions.find((a: any) => a.action_type === type);
    if (found) return Math.round(parseFloat(found.value) || 0);
  }
  return 0;
}

function parseActionDecimal(actions: any[], ...actionTypes: string[]): string {
  if (!actions || !Array.isArray(actions)) return "0";
  for (const type of actionTypes) {
    const found = actions.find((a: any) => a.action_type === type);
    if (found) return String(found.value || "0");
  }
  return "0";
}

export async function syncAdAccount(merchantId: string): Promise<{ dbId: string; currency: string; timezone: string }> {
  const creds = await getCredentialsForMerchant(merchantId);
  const data = await metaApiFetch(creds, creds.adAccountId, {
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

  let dbId: string;
  if (existing.length > 0) {
    await db.update(adAccounts).set(accountData).where(eq(adAccounts.id, existing[0].id));
    dbId = existing[0].id;
  } else {
    const [inserted] = await db.insert(adAccounts).values(accountData).returning({ id: adAccounts.id });
    dbId = inserted.id;
  }
  return { dbId, currency: data.currency || "PKR", timezone: data.timezone_name || "Asia/Karachi" };
}

export async function syncCampaigns(merchantId: string, adAccountDbId: string): Promise<number> {
  const creds = await getCredentialsForMerchant(merchantId);
  const campaigns = await fetchAllPages(creds, `${creds.adAccountId}/campaigns`, {
    fields: "id,name,status,effective_status,configured_status,objective,buying_type,daily_budget,lifetime_budget,created_time",
    effective_status: JSON.stringify(["ACTIVE", "PAUSED", "ARCHIVED", "IN_PROCESS", "WITH_ISSUES"]),
  });

  let count = 0;
  for (const c of campaigns) {
    await db.insert(adCampaigns).values({
      merchantId,
      adAccountId: adAccountDbId,
      campaignId: c.id,
      name: c.name,
      status: c.status,
      effectiveStatus: c.effective_status,
      configuredStatus: c.configured_status,
      objective: c.objective,
      buyingType: c.buying_type,
      dailyBudget: c.daily_budget ? (parseFloat(c.daily_budget) / 100).toFixed(2) : null,
      lifetimeBudget: c.lifetime_budget ? (parseFloat(c.lifetime_budget) / 100).toFixed(2) : null,
      createdTime: c.created_time ? new Date(c.created_time) : null,
      rawJson: c,
    }).onConflictDoUpdate({
      target: [adCampaigns.merchantId, adCampaigns.campaignId],
      set: {
        name: sql`excluded.name`,
        status: sql`excluded.status`,
        effectiveStatus: sql`excluded.effective_status`,
        configuredStatus: sql`excluded.configured_status`,
        objective: sql`excluded.objective`,
        buyingType: sql`excluded.buying_type`,
        dailyBudget: sql`excluded.daily_budget`,
        lifetimeBudget: sql`excluded.lifetime_budget`,
        rawJson: sql`excluded.raw_json`,
        updatedAt: new Date(),
      },
    });
    count++;
  }
  return count;
}

export async function syncAdSets(merchantId: string, adAccountDbId: string): Promise<number> {
  const creds = await getCredentialsForMerchant(merchantId);
  const adsets = await fetchAllPages(creds, `${creds.adAccountId}/adsets`, {
    fields: "id,name,campaign_id,status,effective_status,optimization_goal,billing_event,daily_budget,lifetime_budget,promoted_object,targeting",
    effective_status: JSON.stringify(["ACTIVE", "PAUSED", "ARCHIVED", "IN_PROCESS", "WITH_ISSUES"]),
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
      effectiveStatus: a.effective_status,
      optimizationGoal: a.optimization_goal,
      billingEvent: a.billing_event,
      dailyBudget: a.daily_budget ? (parseFloat(a.daily_budget) / 100).toFixed(2) : null,
      lifetimeBudget: a.lifetime_budget ? (parseFloat(a.lifetime_budget) / 100).toFixed(2) : null,
      promotedObject: a.promoted_object || null,
      targeting: a.targeting || null,
      rawJson: a,
    }).onConflictDoUpdate({
      target: [adSets.merchantId, adSets.adsetId],
      set: {
        name: sql`excluded.name`,
        status: sql`excluded.status`,
        effectiveStatus: sql`excluded.effective_status`,
        optimizationGoal: sql`excluded.optimization_goal`,
        billingEvent: sql`excluded.billing_event`,
        dailyBudget: sql`excluded.daily_budget`,
        lifetimeBudget: sql`excluded.lifetime_budget`,
        promotedObject: sql`excluded.promoted_object`,
        targeting: sql`excluded.targeting`,
        rawJson: sql`excluded.raw_json`,
        updatedAt: new Date(),
      },
    });
    count++;
  }
  return count;
}

export async function syncAds(merchantId: string, adAccountDbId: string): Promise<number> {
  const creds = await getCredentialsForMerchant(merchantId);
  const ads = await fetchAllPages(creds, `${creds.adAccountId}/ads`, {
    fields: "id,name,adset_id,campaign_id,status,effective_status,creative{id}",
    effective_status: JSON.stringify(["ACTIVE", "PAUSED", "ARCHIVED", "IN_PROCESS", "WITH_ISSUES"]),
  });

  let count = 0;
  for (const ad of ads) {
    await db.insert(adCreatives).values({
      merchantId,
      adAccountId: adAccountDbId,
      campaignId: ad.campaign_id || null,
      adsetId: ad.adset_id,
      adId: ad.id,
      name: ad.name,
      status: ad.status,
      effectiveStatus: ad.effective_status,
      creativeId: ad.creative?.id || null,
      rawJson: ad,
    }).onConflictDoUpdate({
      target: [adCreatives.merchantId, adCreatives.adId],
      set: {
        name: sql`excluded.name`,
        status: sql`excluded.status`,
        effectiveStatus: sql`excluded.effective_status`,
        campaignId: sql`excluded.campaign_id`,
        creativeId: sql`excluded.creative_id`,
        rawJson: sql`excluded.raw_json`,
        updatedAt: new Date(),
      },
    });
    count++;
  }
  return count;
}

const INSIGHTS_FIELDS = [
  "campaign_id", "adset_id", "ad_id", "campaign_name", "adset_name", "ad_name",
  "impressions", "reach", "frequency", "clicks", "spend",
  "cpc", "cpm", "ctr",
  "inline_link_clicks",
  "outbound_clicks", "unique_outbound_clicks",
  "actions", "action_values", "cost_per_action_type",
  "purchase_roas",
  "video_play_actions", "video_thruplay_watched_actions",
  "video_p25_watched_actions", "video_p50_watched_actions",
  "video_p75_watched_actions", "video_p95_watched_actions",
  "video_30_sec_watched_actions",
].join(",");

export async function syncInsights(
  merchantId: string,
  adAccountDbId: string,
  dateFrom: string,
  dateTo: string,
  level: "campaign" | "adset" | "ad" = "campaign"
): Promise<number> {
  const creds = await getCredentialsForMerchant(merchantId);

  const entityTypeMap = { campaign: "campaign", adset: "adset", ad: "ad" };
  const entityIdField = { campaign: "campaign_id", adset: "adset_id", ad: "ad_id" };

  const insightsData = await fetchAllPages(creds, `${creds.adAccountId}/insights`, {
    fields: INSIGHTS_FIELDS,
    level,
    time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
    time_increment: "1",
  });

  let count = 0;
  for (const row of insightsData) {
    const actions = row.actions || [];
    const actionValues = row.action_values || [];
    const costPerAction = row.cost_per_action_type || [];

    const purchases = parseActionValue(actions, "purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase");
    const purchaseValueStr = parseActionDecimal(actionValues, "purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase");
    const purchaseValue = parseFloat(purchaseValueStr) || 0;
    const viewContent = parseActionValue(actions, "view_content", "offsite_conversion.fb_pixel_view_content");
    const addToCart = parseActionValue(actions, "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart");
    const initiateCheckout = parseActionValue(actions, "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout");
    const linkClicks = parseInt(row.inline_link_clicks || "0") || 0;
    const landingPageViews = parseActionValue(actions, "landing_page_view");

    const costPerPurchase = parseActionDecimal(costPerAction, "purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase");
    const costPerCheckout = parseActionDecimal(costPerAction, "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout");
    const costPerAddToCart = parseActionDecimal(costPerAction, "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart");
    const costPerViewContent = parseActionDecimal(costPerAction, "view_content", "offsite_conversion.fb_pixel_view_content");

    const spend = parseFloat(row.spend || "0");
    let roas: string | null = null;
    if (row.purchase_roas && Array.isArray(row.purchase_roas) && row.purchase_roas.length > 0) {
      roas = String(row.purchase_roas[0].value || "0");
    } else if (spend > 0 && purchaseValue > 0) {
      roas = (purchaseValue / spend).toFixed(4);
    }

    const outboundClicks = row.outbound_clicks
      ? (Array.isArray(row.outbound_clicks) ? parseInt(row.outbound_clicks[0]?.value || "0") : parseInt(row.outbound_clicks || "0"))
      : 0;
    const uniqueOutboundClicks = row.unique_outbound_clicks
      ? (Array.isArray(row.unique_outbound_clicks) ? parseInt(row.unique_outbound_clicks[0]?.value || "0") : parseInt(row.unique_outbound_clicks || "0"))
      : 0;

    const videoViews = row.video_play_actions
      ? parseInt(row.video_play_actions[0]?.value || "0")
      : 0;
    const videoThruPlays = row.video_thruplay_watched_actions
      ? parseInt(row.video_thruplay_watched_actions[0]?.value || "0")
      : 0;
    const video3sViews = row.video_30_sec_watched_actions
      ? parseInt(row.video_30_sec_watched_actions[0]?.value || "0")
      : 0;
    const video95pViews = row.video_p95_watched_actions
      ? parseInt(row.video_p95_watched_actions[0]?.value || "0")
      : 0;

    const entityId = row[entityIdField[level]];
    if (!entityId) continue;

    await db.insert(adInsights).values({
      merchantId,
      adAccountId: adAccountDbId,
      level,
      entityId,
      entityType: entityTypeMap[level],
      date: row.date_start,
      impressions: parseInt(row.impressions || "0"),
      reach: parseInt(row.reach || "0"),
      clicks: parseInt(row.clicks || "0"),
      spend: row.spend || "0",
      frequency: row.frequency || "0",
      cpc: row.cpc || null,
      cpm: row.cpm || null,
      ctr: row.ctr || null,
      linkClicks,
      landingPageViews,
      outboundClicks,
      uniqueOutboundClicks,
      viewContent,
      addToCart,
      initiateCheckout,
      purchases,
      purchaseValue: purchaseValueStr,
      roas,
      costPerPurchase: costPerPurchase !== "0" ? costPerPurchase : (purchases > 0 ? (spend / purchases).toFixed(2) : null),
      costPerCheckout: costPerCheckout !== "0" ? costPerCheckout : null,
      costPerAddToCart: costPerAddToCart !== "0" ? costPerAddToCart : null,
      costPerViewContent: costPerViewContent !== "0" ? costPerViewContent : null,
      videoViews,
      videoThruPlays,
      video3sViews,
      video95pViews,
      rawJson: row,
      rawActionsJson: actions.length > 0 ? actions : null,
      rawCostPerActionJson: costPerAction.length > 0 ? costPerAction : null,
    }).onConflictDoUpdate({
      target: [adInsights.merchantId, adInsights.entityId, adInsights.entityType, adInsights.date],
      set: {
        level: sql`excluded.level`,
        impressions: sql`excluded.impressions`,
        reach: sql`excluded.reach`,
        clicks: sql`excluded.clicks`,
        spend: sql`excluded.spend`,
        frequency: sql`excluded.frequency`,
        cpc: sql`excluded.cpc`,
        cpm: sql`excluded.cpm`,
        ctr: sql`excluded.ctr`,
        linkClicks: sql`excluded.link_clicks`,
        landingPageViews: sql`excluded.landing_page_views`,
        outboundClicks: sql`excluded.outbound_clicks`,
        uniqueOutboundClicks: sql`excluded.unique_outbound_clicks`,
        viewContent: sql`excluded.view_content`,
        addToCart: sql`excluded.add_to_cart`,
        initiateCheckout: sql`excluded.initiate_checkout`,
        purchases: sql`excluded.purchases`,
        purchaseValue: sql`excluded.purchase_value`,
        roas: sql`excluded.roas`,
        costPerPurchase: sql`excluded.cost_per_purchase`,
        costPerCheckout: sql`excluded.cost_per_checkout`,
        costPerAddToCart: sql`excluded.cost_per_add_to_cart`,
        costPerViewContent: sql`excluded.cost_per_view_content`,
        videoViews: sql`excluded.video_views`,
        videoThruPlays: sql`excluded.video_thru_plays`,
        video3sViews: sql`excluded.video_3s_views`,
        video95pViews: sql`excluded.video_95p_views`,
        rawJson: sql`excluded.raw_json`,
        rawActionsJson: sql`excluded.raw_actions_json`,
        rawCostPerActionJson: sql`excluded.raw_cost_per_action_json`,
        updatedAt: new Date(),
      },
    });
    count++;
  }
  return count;
}

export async function fullSync(
  merchantId: string,
  options?: { dateFrom?: string; dateTo?: string; level?: "campaign" | "adset" | "ad"; force?: boolean }
): Promise<{ campaigns: number; adsets: number; ads: number; insights: number; syncRunId: string }> {
  const { dateFrom: optFrom, dateTo: optTo, level = "campaign", force = false } = options || {};

  const [syncRun] = await db.insert(metaSyncRuns).values({
    merchantId,
    level,
    status: "running",
    dateFrom: optFrom || null,
    dateTo: optTo || null,
  }).returning({ id: metaSyncRuns.id });

  const logId = await createSyncLog(merchantId, "full_sync", "in_progress");

  try {
    const { dbId: adAccountDbId } = await syncAdAccount(merchantId);

    await db.update(metaSyncRuns).set({ adAccountId: adAccountDbId }).where(eq(metaSyncRuns.id, syncRun.id));

    const campaigns = await syncCampaigns(merchantId, adAccountDbId);
    const adsets = await syncAdSets(merchantId, adAccountDbId);
    const ads = await syncAds(merchantId, adAccountDbId);

    const now = new Date();
    const from = optFrom || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const to = optTo || now.toISOString().split("T")[0];

    let totalInsights = 0;
    totalInsights += await syncInsights(merchantId, adAccountDbId, from, to, "campaign");
    totalInsights += await syncInsights(merchantId, adAccountDbId, from, to, "adset");
    totalInsights += await syncInsights(merchantId, adAccountDbId, from, to, "ad");

    await db.update(metaSyncRuns).set({
      status: "completed",
      rowsUpserted: campaigns + adsets + ads + totalInsights,
      finishedAt: new Date(),
    }).where(eq(metaSyncRuns.id, syncRun.id));

    await completeSyncLog(logId, "completed", campaigns + adsets + ads + totalInsights);
    console.log(`[MetaAds] Full sync done: ${campaigns} campaigns, ${adsets} adsets, ${ads} ads, ${totalInsights} insights`);
    return { campaigns, adsets, ads, insights: totalInsights, syncRunId: syncRun.id };
  } catch (error: any) {
    await db.update(metaSyncRuns).set({
      status: "failed",
      errorMessage: error.message,
      finishedAt: new Date(),
    }).where(eq(metaSyncRuns.id, syncRun.id));
    await completeSyncLog(logId, "failed", 0, error.message);
    console.error(`[MetaAds] Full sync failed:`, error.message);
    throw error;
  }
}

export async function quickSyncToday(merchantId: string, level: "campaign" | "adset" | "ad" = "campaign", days: number = 7): Promise<number> {
  try {
    const { dbId: adAccountDbId } = await syncAdAccount(merchantId);
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const rangeStart = new Date(now);
    rangeStart.setDate(rangeStart.getDate() - (days - 1));
    const dateFrom = rangeStart.toISOString().split("T")[0];
    let total = 0;
    total += await syncInsights(merchantId, adAccountDbId, dateFrom, today, "campaign");
    total += await syncInsights(merchantId, adAccountDbId, dateFrom, today, "adset");
    total += await syncInsights(merchantId, adAccountDbId, dateFrom, today, "ad");
    return total;
  } catch (err: any) {
    console.error(`[MetaAds] Quick sync failed:`, err.message);
    return 0;
  }
}

export async function getInsightsForTable(
  merchantId: string,
  params: {
    level: "campaign" | "adset" | "ad";
    dateFrom: string;
    dateTo: string;
    statusFilter?: string[];
    search?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }
) {
  const { level, dateFrom, dateTo, statusFilter, search } = params;

  const entityType = level;

  const insightsQuery = db.select({
    entityId: adInsights.entityId,
    totalSpend: sql<string>`COALESCE(SUM(${adInsights.spend}::numeric), 0)`,
    totalImpressions: sql<number>`COALESCE(SUM(${adInsights.impressions}), 0)`,
    totalReach: sql<number>`COALESCE(SUM(${adInsights.reach}), 0)`,
    totalClicks: sql<number>`COALESCE(SUM(${adInsights.clicks}), 0)`,
    totalLinkClicks: sql<number>`COALESCE(SUM(${adInsights.linkClicks}), 0)`,
    totalLandingPageViews: sql<number>`COALESCE(SUM(${adInsights.landingPageViews}), 0)`,
    totalOutboundClicks: sql<number>`COALESCE(SUM(${adInsights.outboundClicks}), 0)`,
    totalViewContent: sql<number>`COALESCE(SUM(${adInsights.viewContent}), 0)`,
    totalAddToCart: sql<number>`COALESCE(SUM(${adInsights.addToCart}), 0)`,
    totalInitiateCheckout: sql<number>`COALESCE(SUM(${adInsights.initiateCheckout}), 0)`,
    totalPurchases: sql<number>`COALESCE(SUM(${adInsights.purchases}), 0)`,
    totalPurchaseValue: sql<string>`COALESCE(SUM(${adInsights.purchaseValue}::numeric), 0)`,
    totalVideoViews: sql<number>`COALESCE(SUM(${adInsights.videoViews}), 0)`,
    totalVideoThruPlays: sql<number>`COALESCE(SUM(${adInsights.videoThruPlays}), 0)`,
    totalVideo3sViews: sql<number>`COALESCE(SUM(${adInsights.video3sViews}), 0)`,
    totalVideo95pViews: sql<number>`COALESCE(SUM(${adInsights.video95pViews}), 0)`,
    avgFrequency: sql<string>`COALESCE(AVG(${adInsights.frequency}::numeric), 0)`,
  }).from(adInsights)
    .where(and(
      eq(adInsights.merchantId, merchantId),
      eq(adInsights.entityType, entityType),
      gte(adInsights.date, dateFrom),
      lte(adInsights.date, dateTo),
    ))
    .groupBy(adInsights.entityId);

  const insightsResults = await insightsQuery;

  let entities: any[] = [];
  if (level === "campaign") {
    const conditions: any[] = [eq(adCampaigns.merchantId, merchantId)];
    if (statusFilter && statusFilter.length > 0 && !statusFilter.includes("ALL")) {
      conditions.push(
        sql`COALESCE(${adCampaigns.effectiveStatus}, ${adCampaigns.status}) IN (${sql.join(statusFilter.map(s => sql`${s}`), sql`, `)})`
      );
    }
    if (search) {
      conditions.push(like(adCampaigns.name, `%${search}%`));
    }
    entities = await db.select().from(adCampaigns).where(and(...conditions));
  } else if (level === "adset") {
    const conditions: any[] = [eq(adSets.merchantId, merchantId)];
    if (statusFilter && statusFilter.length > 0 && !statusFilter.includes("ALL")) {
      conditions.push(
        sql`COALESCE(${adSets.effectiveStatus}, ${adSets.status}) IN (${sql.join(statusFilter.map(s => sql`${s}`), sql`, `)})`
      );
    }
    if (search) {
      conditions.push(like(adSets.name, `%${search}%`));
    }
    entities = await db.select().from(adSets).where(and(...conditions));
  } else {
    const conditions: any[] = [eq(adCreatives.merchantId, merchantId)];
    if (statusFilter && statusFilter.length > 0 && !statusFilter.includes("ALL")) {
      conditions.push(
        sql`COALESCE(${adCreatives.effectiveStatus}, ${adCreatives.status}) IN (${sql.join(statusFilter.map(s => sql`${s}`), sql`, `)})`
      );
    }
    if (search) {
      conditions.push(like(adCreatives.name, `%${search}%`));
    }
    entities = await db.select().from(adCreatives).where(and(...conditions));
  }

  const insightMap = new Map(insightsResults.map(i => [i.entityId, i]));

  const getEntityId = (e: any) => {
    if (level === "campaign") return e.campaignId;
    if (level === "adset") return e.adsetId;
    return e.adId;
  };

  const rows = entities.map(entity => {
    const id = getEntityId(entity);
    const ins = insightMap.get(id);
    const spend = ins ? parseFloat(String(ins.totalSpend)) || 0 : 0;
    const purchaseValue = ins ? parseFloat(String(ins.totalPurchaseValue)) || 0 : 0;
    const purchases = ins ? Number(ins.totalPurchases) || 0 : 0;
    const impressions = ins ? Number(ins.totalImpressions) || 0 : 0;
    const linkClicks = ins ? Number(ins.totalLinkClicks) || 0 : 0;
    const clicks = ins ? Number(ins.totalClicks) || 0 : 0;

    return {
      entityId: id,
      name: entity.name || "Unknown",
      status: entity.effectiveStatus || entity.status || "UNKNOWN",
      configuredStatus: entity.configuredStatus || entity.status,
      objective: level === "campaign" ? entity.objective : undefined,
      buyingType: level === "campaign" ? entity.buyingType : undefined,
      optimizationGoal: level === "adset" ? entity.optimizationGoal : undefined,
      dailyBudget: entity.dailyBudget ? parseFloat(entity.dailyBudget) : null,
      lifetimeBudget: entity.lifetimeBudget ? parseFloat(entity.lifetimeBudget) : null,
      campaignId: level !== "campaign" ? entity.campaignId : undefined,
      adsetId: level === "ad" ? entity.adsetId : undefined,
      spend,
      impressions,
      reach: ins ? Number(ins.totalReach) || 0 : 0,
      frequency: ins ? parseFloat(String(ins.avgFrequency)) || 0 : 0,
      clicks,
      linkClicks,
      landingPageViews: ins ? Number(ins.totalLandingPageViews) || 0 : 0,
      outboundClicks: ins ? Number(ins.totalOutboundClicks) || 0 : 0,
      viewContent: ins ? Number(ins.totalViewContent) || 0 : 0,
      addToCart: ins ? Number(ins.totalAddToCart) || 0 : 0,
      initiateCheckout: ins ? Number(ins.totalInitiateCheckout) || 0 : 0,
      purchases,
      purchaseValue,
      roas: spend > 0 ? purchaseValue / spend : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      costPerPurchase: purchases > 0 ? spend / purchases : 0,
      costPerCheckout: (ins ? Number(ins.totalInitiateCheckout) || 0 : 0) > 0 ? spend / Number(ins!.totalInitiateCheckout) : 0,
      costPerAddToCart: (ins ? Number(ins.totalAddToCart) || 0 : 0) > 0 ? spend / Number(ins!.totalAddToCart) : 0,
      costPerViewContent: (ins ? Number(ins.totalViewContent) || 0 : 0) > 0 ? spend / Number(ins!.totalViewContent) : 0,
      videoViews: ins ? Number(ins.totalVideoViews) || 0 : 0,
      videoThruPlays: ins ? Number(ins.totalVideoThruPlays) || 0 : 0,
      video3sViews: ins ? Number(ins.totalVideo3sViews) || 0 : 0,
      video95pViews: ins ? Number(ins.totalVideo95pViews) || 0 : 0,
    };
  });

  const totals = {
    spend: rows.reduce((s, r) => s + r.spend, 0),
    impressions: rows.reduce((s, r) => s + r.impressions, 0),
    reach: rows.reduce((s, r) => s + r.reach, 0),
    clicks: rows.reduce((s, r) => s + r.clicks, 0),
    linkClicks: rows.reduce((s, r) => s + r.linkClicks, 0),
    landingPageViews: rows.reduce((s, r) => s + r.landingPageViews, 0),
    viewContent: rows.reduce((s, r) => s + r.viewContent, 0),
    addToCart: rows.reduce((s, r) => s + r.addToCart, 0),
    initiateCheckout: rows.reduce((s, r) => s + r.initiateCheckout, 0),
    purchases: rows.reduce((s, r) => s + r.purchases, 0),
    purchaseValue: rows.reduce((s, r) => s + r.purchaseValue, 0),
    videoViews: rows.reduce((s, r) => s + r.videoViews, 0),
    roas: 0 as number,
    cpm: 0 as number,
    ctr: 0 as number,
    cpc: 0 as number,
    costPerPurchase: 0 as number,
  };
  totals.roas = totals.spend > 0 ? totals.purchaseValue / totals.spend : 0;
  totals.cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
  totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  totals.costPerPurchase = totals.purchases > 0 ? totals.spend / totals.purchases : 0;

  return { rows, totals };
}

export async function getInsightsSummary(merchantId: string, dateFrom: string, dateTo: string) {
  const result = await db.select({
    totalSpend: sql<string>`COALESCE(SUM(${adInsights.spend}::numeric), 0)`,
    totalPurchaseValue: sql<string>`COALESCE(SUM(${adInsights.purchaseValue}::numeric), 0)`,
    totalPurchases: sql<number>`COALESCE(SUM(${adInsights.purchases}), 0)`,
    totalImpressions: sql<number>`COALESCE(SUM(${adInsights.impressions}), 0)`,
    totalClicks: sql<number>`COALESCE(SUM(${adInsights.clicks}), 0)`,
    totalReach: sql<number>`COALESCE(SUM(${adInsights.reach}), 0)`,
  }).from(adInsights)
    .where(and(
      eq(adInsights.merchantId, merchantId),
      eq(adInsights.entityType, "campaign"),
      gte(adInsights.date, dateFrom),
      lte(adInsights.date, dateTo),
    ));

  const summary = result[0];
  const spend = parseFloat(summary.totalSpend);
  const purchaseValue = parseFloat(summary.totalPurchaseValue);

  return {
    totalSpend: spend,
    totalRevenue: purchaseValue,
    totalPurchases: summary.totalPurchases,
    totalImpressions: summary.totalImpressions,
    totalClicks: summary.totalClicks,
    totalReach: summary.totalReach,
    roas: spend > 0 ? (purchaseValue / spend) : 0,
    cpa: summary.totalPurchases > 0 ? (spend / summary.totalPurchases) : 0,
    avgCtr: summary.totalImpressions > 0 ? ((summary.totalClicks / summary.totalImpressions) * 100) : 0,
  };
}

export async function getDailyInsights(merchantId: string, dateFrom: string, dateTo: string) {
  return db.select({
    date: adInsights.date,
    totalSpend: sql<string>`COALESCE(SUM(${adInsights.spend}::numeric), 0)`,
    totalRevenue: sql<string>`COALESCE(SUM(${adInsights.purchaseValue}::numeric), 0)`,
    totalPurchases: sql<number>`COALESCE(SUM(${adInsights.purchases}), 0)`,
    totalClicks: sql<number>`COALESCE(SUM(${adInsights.clicks}), 0)`,
    totalImpressions: sql<number>`COALESCE(SUM(${adInsights.impressions}), 0)`,
  }).from(adInsights)
    .where(and(
      eq(adInsights.merchantId, merchantId),
      eq(adInsights.entityType, "campaign"),
      gte(adInsights.date, dateFrom),
      lte(adInsights.date, dateTo),
    ))
    .groupBy(adInsights.date)
    .orderBy(adInsights.date);
}

export async function getAdAccountInfo(merchantId: string) {
  const accounts = await db.select().from(adAccounts).where(eq(adAccounts.merchantId, merchantId));
  return accounts[0] || null;
}

export async function getLastSyncInfo(merchantId: string) {
  const result = await db.select().from(marketingSyncLogs)
    .where(eq(marketingSyncLogs.merchantId, merchantId))
    .orderBy(desc(marketingSyncLogs.startedAt))
    .limit(1);
  return result[0] || null;
}

export async function getSyncRunStatus(merchantId: string) {
  const runs = await db.select().from(metaSyncRuns)
    .where(eq(metaSyncRuns.merchantId, merchantId))
    .orderBy(desc(metaSyncRuns.startedAt))
    .limit(5);
  return runs;
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

  console.log("[MetaAds] Starting marketing sync scheduler (full historical backfill on start, 7-day sync every 120s)");

  (async () => {
    try {
      const accounts = await db.select().from(adAccounts);
      for (const account of accounts) {
        try {
          const existing = await db.select({ earliest: sql<string>`MIN(${adInsights.date})` })
            .from(adInsights)
            .where(eq(adInsights.merchantId, account.merchantId));
          const earliestDate = existing[0]?.earliest;
          const maxBack = new Date();
          maxBack.setMonth(maxBack.getMonth() - 36);
          const backfillFrom = maxBack.toISOString().split("T")[0];

          if (!earliestDate || earliestDate > backfillFrom) {
            const { dbId } = await syncAdAccount(account.merchantId);
            try {
              await syncCampaigns(account.merchantId, dbId);
              await syncAdSets(account.merchantId, dbId);
              await syncAds(account.merchantId, dbId);
            } catch (err: any) {
              console.error(`[MetaAds] Campaign metadata sync failed for ${account.merchantId}:`, err.message);
            }
            const now = new Date();
            const today = now.toISOString().split("T")[0];
            const chunkDays = 90;

            const backfillEnd = earliestDate 
              ? new Date(new Date(earliestDate).getTime() - 86400000).toISOString().split("T")[0]
              : today;
            console.log(`[MetaAds] Backfill gap: ${backfillFrom} to ${backfillEnd} for merchant ${account.merchantId}`);

            let chunkStart = new Date(backfillFrom);
            const endDate = new Date(backfillEnd);
            while (chunkStart <= endDate) {
              const chunkEnd = new Date(chunkStart);
              chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);
              if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());
              const from = chunkStart.toISOString().split("T")[0];
              const to = chunkEnd.toISOString().split("T")[0];
              console.log(`[MetaAds] Backfill chunk: ${from} to ${to}`);
              await syncInsights(account.merchantId, dbId, from, to, "campaign");
              await syncInsights(account.merchantId, dbId, from, to, "adset");
              await syncInsights(account.merchantId, dbId, from, to, "ad");
              chunkStart = new Date(chunkEnd);
              chunkStart.setDate(chunkStart.getDate() + 1);
            }
            await quickSyncToday(account.merchantId, "campaign", 37);
            console.log(`[MetaAds] Backfill completed for merchant ${account.merchantId}`);
          } else {
            const { dbId } = await syncAdAccount(account.merchantId);
            try {
              await syncCampaigns(account.merchantId, dbId);
              await syncAdSets(account.merchantId, dbId);
              await syncAds(account.merchantId, dbId);
            } catch (err: any) {
              console.error(`[MetaAds] Campaign metadata sync failed for ${account.merchantId}:`, err.message);
            }
            await quickSyncToday(account.merchantId, "campaign", 37);
            console.log(`[MetaAds] 37-day refresh completed for merchant ${account.merchantId}`);
          }
        } catch (err: any) {
          console.error(`[MetaAds] Initial backfill failed for merchant ${account.merchantId}:`, err.message);
        }
      }
    } catch (err: any) {
      console.error("[MetaAds] Initial backfill error:", err.message);
    }
  })();

  syncIntervalId = setInterval(async () => {
    try {
      const accounts = await db.select().from(adAccounts);
      for (const account of accounts) {
        try {
          await quickSyncToday(account.merchantId);
        } catch (err: any) {
          console.error(`[MetaAds] Quick sync failed for merchant ${account.merchantId}:`, err.message);
        }
      }
    } catch (err: any) {
      console.error("[MetaAds] Scheduler error:", err.message);
    }
  }, 120 * 1000);
}
