import { db } from "../db";
import { adLaunchJobs, adMediaLibrary, merchants, customAudiences, adAutomationRules, adInsights, adCampaigns, adSets } from "@shared/schema";
import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { getCredentialsForMerchant, META_API_VERSION, META_BASE_URL } from "./metaAds";
import { decryptToken } from "./encryption";
import crypto from "crypto";

interface MetaWriteOptions {
  accessToken: string;
  adAccountId: string;
}

function sanitizePayload(body: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "access_token") { sanitized[k] = "***"; continue; }
    sanitized[k] = v;
  }
  return sanitized;
}

const TRANSIENT_ERROR_CODES = [1, 2, 4, 17, 341, 368];

async function metaApiPost(creds: MetaWriteOptions, endpoint: string, body: Record<string, any>, maxRetries = 2): Promise<any> {
  const url = `${META_BASE_URL}/${endpoint}`;
  const formData = new URLSearchParams();
  formData.set("access_token", creds.accessToken);
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null) {
      formData.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
      await new Promise(resolve => setTimeout(resolve, delay));
      console.log(`[MetaAdLauncher] Retry ${attempt}/${maxRetries} for POST ${endpoint}`);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    const data = await response.json();
    if (response.ok) return data;

    const errCode = data?.error?.code;
    const errMsg = data?.error?.message || `Meta API error ${response.status}`;
    lastError = new Error(errMsg);

    if (TRANSIENT_ERROR_CODES.includes(errCode) && attempt < maxRetries) {
      console.warn(`[MetaAdLauncher] Transient error (code ${errCode}) on POST ${endpoint}, will retry. Payload:`, JSON.stringify(sanitizePayload(body)));
      continue;
    }

    console.error(`[MetaAdLauncher] POST ${endpoint} failed (attempt ${attempt + 1}/${maxRetries + 1}):`, errMsg);
    console.error(`[MetaAdLauncher] Request payload:`, JSON.stringify(sanitizePayload(body)));
    throw lastError;
  }

  throw lastError || new Error(`Meta API POST ${endpoint} failed after retries`);
}

async function metaApiGet(creds: MetaWriteOptions, endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${META_BASE_URL}/${endpoint}`);
  url.searchParams.set("access_token", creds.accessToken);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const response = await fetch(url.toString());
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Meta API error ${response.status}`);
  }
  return data;
}

export async function fetchFacebookPages(merchantId: string): Promise<any[]> {
  const creds = await getCredentialsForMerchant(merchantId);
  const data = await metaApiGet(creds, "me/accounts", {
    fields: "id,name,access_token,category",
    limit: "100",
  });
  return data.data || [];
}

async function getPageAccessToken(merchantId: string, pageId: string): Promise<string> {
  const pages = await fetchFacebookPages(merchantId);
  const page = pages.find((p: any) => p.id === pageId);
  if (page?.access_token) return page.access_token;
  const creds = await getCredentialsForMerchant(merchantId);
  return creds.accessToken;
}

export async function fetchPagePosts(merchantId: string, pageId: string, search?: string): Promise<any[]> {
  const creds = await getCredentialsForMerchant(merchantId);
  const pageToken = await getPageAccessToken(merchantId, pageId);
  const fields = "id,message,full_picture,created_time,type,permalink_url,status_type,likes.summary(true),comments.summary(true),shares";

  let data: any;
  const promotableUrl = new URL(`${META_BASE_URL}/${pageId}/promotable_posts`);
  promotableUrl.searchParams.set("access_token", pageToken);
  promotableUrl.searchParams.set("fields", fields);
  promotableUrl.searchParams.set("limit", "50");
  const promotableRes = await fetch(promotableUrl.toString());
  const promotableData = await promotableRes.json();

  if (!promotableRes.ok) {
    const errorCode = promotableData?.error?.code;
    if (errorCode === 100) {
      console.log("[fetchPagePosts] promotable_posts not available (error #100), falling back to feed endpoint");
      const feedUrl = new URL(`${META_BASE_URL}/${pageId}/feed`);
      feedUrl.searchParams.set("access_token", pageToken);
      feedUrl.searchParams.set("fields", fields);
      feedUrl.searchParams.set("limit", "50");
      const feedRes = await fetch(feedUrl.toString());
      data = await feedRes.json();
      if (!feedRes.ok) {
        throw new Error(data?.error?.message || "Failed to fetch page feed");
      }
    } else {
      throw new Error(promotableData?.error?.message || "Failed to fetch page posts");
    }
  } else {
    data = promotableData;
  }

  let posts = data.data || [];
  if (search && search.trim()) {
    const q = search.toLowerCase();
    posts = posts.filter((p: any) =>
      (p.message || "").toLowerCase().includes(q) ||
      (p.id || "").toLowerCase().includes(q)
    );
  }
  return posts.map((p: any) => ({
    id: p.id,
    message: p.message || "",
    fullPicture: p.full_picture || "",
    createdTime: p.created_time,
    type: p.type || "status",
    statusType: p.status_type || "",
    permalinkUrl: p.permalink_url || "",
    likes: p.likes?.summary?.total_count || 0,
    comments: p.comments?.summary?.total_count || 0,
    shares: p.shares?.count || 0,
    source: "facebook",
  }));
}

export async function fetchInstagramMedia(merchantId: string, igAccountId: string, search?: string): Promise<any[]> {
  const creds = await getCredentialsForMerchant(merchantId);
  const url = new URL(`${META_BASE_URL}/${igAccountId}/media`);
  url.searchParams.set("access_token", creds.accessToken);
  url.searchParams.set("fields", "id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink");
  url.searchParams.set("limit", "50");
  const response = await fetch(url.toString());
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Failed to fetch Instagram media`);
  }
  let media = data.data || [];
  if (search && search.trim()) {
    const q = search.toLowerCase();
    media = media.filter((m: any) =>
      (m.caption || "").toLowerCase().includes(q) ||
      (m.id || "").toLowerCase().includes(q)
    );
  }
  return media.map((m: any) => ({
    id: m.id,
    message: m.caption || "",
    fullPicture: m.media_type === "VIDEO" ? (m.thumbnail_url || "") : (m.media_url || ""),
    mediaUrl: m.media_url || "",
    createdTime: m.timestamp,
    type: (m.media_type || "IMAGE").toLowerCase(),
    permalinkUrl: m.permalink || "",
    likes: m.like_count || 0,
    comments: m.comments_count || 0,
    shares: 0,
    source: "instagram",
  }));
}

export async function fetchBrandedContentPosts(merchantId: string, pageId: string, search?: string): Promise<any[]> {
  try {
    const creds = await getCredentialsForMerchant(merchantId);
    const pageToken = await getPageAccessToken(merchantId, pageId);
    const url = new URL(`${META_BASE_URL}/${pageId}/published_posts`);
    url.searchParams.set("access_token", pageToken);
    url.searchParams.set("fields", "id,message,full_picture,created_time,type,permalink_url,is_hidden,likes.summary(true),comments.summary(true),shares");
    url.searchParams.set("limit", "50");
    const response = await fetch(url.toString());
    const data = await response.json();
    if (!response.ok) return [];
    let posts = (data.data || []).filter((p: any) => p.type === "branded_content" || (p.message && p.message.includes("Paid partnership")));
    if (search && search.trim()) {
      const q = search.toLowerCase();
      posts = posts.filter((p: any) =>
        (p.message || "").toLowerCase().includes(q) ||
        (p.id || "").toLowerCase().includes(q)
      );
    }
    return posts.map((p: any) => ({
      id: p.id,
      message: p.message || "",
      fullPicture: p.full_picture || "",
      createdTime: p.created_time,
      type: p.type || "status",
      permalinkUrl: p.permalink_url || "",
      likes: p.likes?.summary?.total_count || 0,
      comments: p.comments?.summary?.total_count || 0,
      shares: p.shares?.count || 0,
      source: "partner",
    }));
  } catch {
    return [];
  }
}

export async function fetchPageVideos(merchantId: string, pageId: string, search?: string): Promise<any[]> {
  const pageToken = await getPageAccessToken(merchantId, pageId);
  const url = new URL(`${META_BASE_URL}/${pageId}/videos`);
  url.searchParams.set("access_token", pageToken);
  url.searchParams.set("fields", "id,title,description,source,picture,created_time,length,likes.summary(true),comments.summary(true)");
  url.searchParams.set("limit", "50");
  const response = await fetch(url.toString());
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Failed to fetch page videos");
  }
  let videos = data.data || [];
  if (search && search.trim()) {
    const q = search.toLowerCase();
    videos = videos.filter((v: any) =>
      (v.title || "").toLowerCase().includes(q) ||
      (v.description || "").toLowerCase().includes(q) ||
      (v.id || "").toLowerCase().includes(q)
    );
  }
  return videos.map((v: any) => ({
    id: `${pageId}_${v.id}`,
    message: v.title || v.description || "",
    fullPicture: v.picture || "",
    createdTime: v.created_time,
    type: "video",
    statusType: "added_video",
    permalinkUrl: v.source || "",
    likes: v.likes?.summary?.total_count || 0,
    comments: v.comments?.summary?.total_count || 0,
    shares: 0,
    source: "facebook",
    videoSource: v.source || "",
    duration: v.length || 0,
  }));
}

export async function fetchAdAccountImages(merchantId: string): Promise<any[]> {
  const creds = await getCredentialsForMerchant(merchantId);
  const data = await metaApiGet(creds, `${creds.adAccountId}/adimages`, {
    fields: "hash,name,url,width,height,created_time,status",
  });
  const images = data.data || [];
  return Object.values(images).filter((img: any) => img && typeof img === "object" && img.hash).map((img: any) => ({
    hash: img.hash,
    name: img.name || "",
    url: img.url || img.url_128 || "",
    width: img.width || 0,
    height: img.height || 0,
    createdTime: img.created_time,
    status: img.status || "ACTIVE",
  }));
}

export async function fetchAdAccountVideos(merchantId: string): Promise<any[]> {
  const creds = await getCredentialsForMerchant(merchantId);
  const data = await metaApiGet(creds, `${creds.adAccountId}/advideos`, {
    fields: "id,title,source,picture,created_time,length,status",
  });
  const videos = data.data || [];
  return videos.map((v: any) => ({
    id: v.id,
    title: v.title || "",
    source: v.source || "",
    picture: v.picture || "",
    createdTime: v.created_time,
    duration: v.length || 0,
    status: v.status || "ACTIVE",
  }));
}

export async function fetchAdAccountPixels(merchantId: string): Promise<any[]> {
  const creds = await getCredentialsForMerchant(merchantId);
  const data = await metaApiGet(creds, `${creds.adAccountId}/adspixels`, {
    fields: "id,name,last_fired_time",
  });
  return data.data || [];
}

export async function fetchAdAccountAdSets(merchantId: string, campaignId?: string): Promise<any[]> {
  const creds = await getCredentialsForMerchant(merchantId);
  const endpoint = campaignId
    ? `${campaignId}/adsets`
    : `${creds.adAccountId}/adsets`;
  const data = await metaApiGet(creds, endpoint, {
    fields: "id,name,status,effective_status,optimization_goal,daily_budget,lifetime_budget,targeting",
    limit: "200",
  });
  return data.data || [];
}

export async function createCampaign(
  merchantId: string,
  params: {
    name: string;
    objective: string;
    status?: string;
    specialAdCategories?: string[];
    dailyBudget?: string;
    lifetimeBudget?: string;
    budgetType?: "daily" | "lifetime";
    buyingType?: string;
    isCbo?: boolean;
    spendingLimit?: string;
  }
): Promise<string> {
  const creds = await getCredentialsForMerchant(merchantId);
  const body: Record<string, any> = {
    name: params.name,
    objective: params.objective,
    status: params.status || "PAUSED",
    special_ad_categories: params.specialAdCategories || [],
    buying_type: params.buyingType || "AUCTION",
  };

  if (params.isCbo) {
    if (params.budgetType === "lifetime" && params.lifetimeBudget) {
      body.lifetime_budget = Math.round(parseFloat(params.lifetimeBudget) * 100);
    } else if (params.dailyBudget) {
      body.daily_budget = Math.round(parseFloat(params.dailyBudget) * 100);
    }
    if (params.spendingLimit) {
      body.spend_cap = Math.round(parseFloat(params.spendingLimit) * 100);
    }
  }

  const result = await metaApiPost(creds, `${creds.adAccountId}/campaigns`, body);
  console.log(`[MetaAdLauncher] Campaign created: ${result.id}`);
  return result.id;
}

export async function createAdSet(
  merchantId: string,
  params: {
    name: string;
    campaignId: string;
    dailyBudget?: string;
    lifetimeBudget?: string;
    budgetType?: "daily" | "lifetime";
    optimizationGoal: string;
    billingEvent?: string;
    bidStrategy?: string;
    bidAmount?: string;
    targeting: any;
    promotedObject?: any;
    status?: string;
    startTime?: string;
    endTime?: string;
    isCbo?: boolean;
    useAdvantageAudience?: boolean;
  }
): Promise<string> {
  const creds = await getCredentialsForMerchant(merchantId);
  const body: Record<string, any> = {
    name: params.name,
    campaign_id: params.campaignId,
    optimization_goal: params.optimizationGoal,
    billing_event: params.billingEvent || "IMPRESSIONS",
    targeting: params.targeting,
    status: params.status || "PAUSED",
  };

  if (!params.isCbo) {
    if (params.budgetType === "lifetime" && params.lifetimeBudget) {
      body.lifetime_budget = Math.round(parseFloat(params.lifetimeBudget) * 100);
    } else {
      const budget = params.dailyBudget || "500";
      body.daily_budget = Math.round(parseFloat(budget) * 100);
    }
  }

  if (params.bidStrategy) {
    body.bid_strategy = params.bidStrategy;
  }
  if (params.bidAmount) {
    body.bid_amount = Math.round(parseFloat(params.bidAmount) * 100);
  }

  if (params.promotedObject) {
    body.promoted_object = params.promotedObject;
  }
  if (params.startTime) {
    body.start_time = params.startTime;
  }
  if (params.endTime) {
    body.end_time = params.endTime;
  }
  if (params.useAdvantageAudience) {
    body.use_advantage_audience = true;
  }

  const result = await metaApiPost(creds, `${creds.adAccountId}/adsets`, body);
  console.log(`[MetaAdLauncher] AdSet created: ${result.id}`);
  return result.id;
}

export async function createAdCreative(
  merchantId: string,
  params: {
    name: string;
    pageId: string;
    format?: "single_image" | "video" | "carousel" | "existing_post";
    existingPostId?: string;
    existingPostSource?: "facebook" | "instagram" | "partner";
    instagramActorId?: string;
    imageHash?: string;
    imageUrl?: string;
    videoId?: string;
    thumbnailUrl?: string;
    primaryText?: string;
    headline?: string;
    description?: string;
    linkUrl?: string;
    callToAction?: string;
    carouselCards?: Array<{
      imageUrl?: string;
      imageHash?: string;
      headline?: string;
      description?: string;
      linkUrl: string;
    }>;
  }
): Promise<string> {
  const creds = await getCredentialsForMerchant(merchantId);

  if (params.existingPostId) {
    const body: Record<string, any> = {
      name: params.name,
    };
    if (params.existingPostSource === "instagram") {
      body.source_instagram_media_id = params.existingPostId;
      if (params.instagramActorId) {
        body.instagram_actor_id = params.instagramActorId;
      }
    } else {
      body.object_story_id = params.existingPostId;
    }
    if (params.linkUrl) {
      body.call_to_action = {
        type: params.callToAction || "SHOP_NOW",
        value: { link: params.linkUrl },
      };
    }
    console.log(`[MetaAdLauncher] Creating AdCreative (existing post) with body:`, JSON.stringify(body));
    const result = await metaApiPost(creds, `${creds.adAccountId}/adcreatives`, body);
    console.log(`[MetaAdLauncher] AdCreative (existing post) created: ${result.id}`);
    return result.id;
  }

  const objectStorySpec: Record<string, any> = {
    page_id: params.pageId,
  };

  if (params.format === "carousel" && params.carouselCards?.length) {
    const childAttachments = params.carouselCards.map((card) => {
      const attachment: Record<string, any> = {
        link: card.linkUrl,
        call_to_action: { type: params.callToAction || "SHOP_NOW", value: { link: card.linkUrl } },
      };
      if (card.imageHash) attachment.image_hash = card.imageHash;
      else if (card.imageUrl) attachment.picture = card.imageUrl;
      if (card.headline) attachment.name = card.headline;
      if (card.description) attachment.description = card.description;
      return attachment;
    });
    objectStorySpec.link_data = {
      message: params.primaryText,
      link: params.linkUrl,
      child_attachments: childAttachments,
    };
  } else if (params.format === "video" || params.videoId) {
    const videoData: Record<string, any> = {
      video_id: params.videoId,
      message: params.primaryText,
      call_to_action: { type: params.callToAction || "SHOP_NOW", value: { link: params.linkUrl } },
    };
    if (params.description) videoData.link_description = params.description;
    if (params.headline) videoData.title = params.headline;
    if (params.imageHash) videoData.image_hash = params.imageHash;
    else if (params.thumbnailUrl) videoData.image_url = params.thumbnailUrl;
    objectStorySpec.video_data = videoData;
  } else {
    const linkData: Record<string, any> = {
      message: params.primaryText,
      link: params.linkUrl,
      call_to_action: { type: params.callToAction || "SHOP_NOW", value: { link: params.linkUrl } },
    };
    if (params.imageHash) linkData.image_hash = params.imageHash;
    else if (params.imageUrl) linkData.picture = params.imageUrl;
    if (params.headline) linkData.name = params.headline;
    if (params.description) linkData.description = params.description;
    objectStorySpec.link_data = linkData;
  }

  const body: Record<string, any> = {
    name: params.name,
    object_story_spec: objectStorySpec,
  };

  const result = await metaApiPost(creds, `${creds.adAccountId}/adcreatives`, body);
  console.log(`[MetaAdLauncher] AdCreative created: ${result.id}`);
  return result.id;
}

export async function createAd(
  merchantId: string,
  params: {
    name: string;
    adsetId: string;
    creativeId: string;
    status?: string;
  }
): Promise<string> {
  const creds = await getCredentialsForMerchant(merchantId);
  const body = {
    name: params.name,
    adset_id: params.adsetId,
    creative: { creative_id: params.creativeId },
    status: params.status || "PAUSED",
  };

  const result = await metaApiPost(creds, `${creds.adAccountId}/ads`, body);
  console.log(`[MetaAdLauncher] Ad created: ${result.id}`);
  return result.id;
}

export async function uploadImageToMeta(
  merchantId: string,
  imageUrl: string
): Promise<{ hash: string; url: string }> {
  const creds = await getCredentialsForMerchant(merchantId);
  const body = {
    url: imageUrl,
  };

  const result = await metaApiPost(creds, `${creds.adAccountId}/adimages`, body);
  const images = result.images;
  const firstKey = Object.keys(images)[0];
  return {
    hash: images[firstKey].hash,
    url: images[firstKey].url,
  };
}

export async function launchAd(
  merchantId: string,
  jobId: string,
  config: {
    campaignName: string;
    objective: string;
    dailyBudget: string;
    lifetimeBudget?: string;
    budgetType?: "daily" | "lifetime";
    budgetLevel?: "adset" | "campaign";
    spendingLimit?: string;
    bidStrategy?: string;
    bidAmount?: string;
    targeting: any;
    creative: {
      format?: "single_image" | "video" | "carousel" | "existing_post";
      existingPostId?: string;
      existingPostSource?: "facebook" | "instagram" | "partner";
      primaryText?: string;
      headline?: string;
      description?: string;
      linkUrl?: string;
      imageUrl?: string;
      imageHash?: string;
      videoId?: string;
      thumbnailUrl?: string;
      callToAction?: string;
      carouselCards?: Array<{
        imageUrl?: string;
        imageHash?: string;
        headline?: string;
        description?: string;
        linkUrl: string;
      }>;
    };
    pageId: string;
    instagramActorId?: string;
    pixelId?: string;
    conversionEvent?: string;
    optimizationGoal?: string;
    useAdvantageAudience?: boolean;
    status?: string;
    startTime?: string;
    endTime?: string;
  }
): Promise<{ campaignId: string; adsetId: string; adId: string }> {
  const isCbo = config.budgetLevel === "campaign";
  let currentStep = "Campaign";
  try {
    await db.update(adLaunchJobs)
      .set({ status: "launching" })
      .where(eq(adLaunchJobs.id, jobId));

    const isExistingPost = !!config.creative.existingPostId;

    let imageHash = config.creative.imageHash;
    if (!isExistingPost && !imageHash && config.creative.imageUrl && config.creative.format !== "carousel") {
      currentStep = "Image Upload";
      const uploaded = await uploadImageToMeta(merchantId, config.creative.imageUrl);
      imageHash = uploaded.hash;
    }

    currentStep = "Campaign";
    const campaignId = await createCampaign(merchantId, {
      name: config.campaignName,
      objective: config.objective,
      status: config.status || "PAUSED",
      isCbo,
      dailyBudget: config.dailyBudget,
      lifetimeBudget: config.lifetimeBudget,
      budgetType: config.budgetType,
      spendingLimit: config.spendingLimit,
    });

    let optimizationGoal = config.optimizationGoal;
    if (!optimizationGoal) {
      const objectiveDefaults: Record<string, string> = {
        OUTCOME_SALES: config.pixelId ? "OFFSITE_CONVERSIONS" : "LINK_CLICKS",
        OUTCOME_LEADS: config.pixelId ? "LEAD_GENERATION" : "LINK_CLICKS",
        OUTCOME_ENGAGEMENT: "POST_ENGAGEMENT",
        OUTCOME_AWARENESS: "REACH",
        OUTCOME_TRAFFIC: "LANDING_PAGE_VIEWS",
        OUTCOME_APP_PROMOTION: "LINK_CLICKS",
      };
      optimizationGoal = objectiveDefaults[config.objective] || (config.pixelId ? "OFFSITE_CONVERSIONS" : "LINK_CLICKS");
    }

    const conversionGoals = ["OFFSITE_CONVERSIONS", "LEAD_GENERATION"];
    if (conversionGoals.includes(optimizationGoal) && !config.pixelId) {
      optimizationGoal = "LINK_CLICKS";
    }
    const needsPromotedObject = config.pixelId && conversionGoals.includes(optimizationGoal);
    const promotedObject: Record<string, any> = {};
    if (needsPromotedObject) {
      promotedObject.pixel_id = config.pixelId;
      promotedObject.custom_event_type = config.conversionEvent || "PURCHASE";
    }

    currentStep = "Ad Set";
    const adsetId = await createAdSet(merchantId, {
      name: `${config.campaignName} - AdSet`,
      campaignId,
      dailyBudget: config.dailyBudget,
      lifetimeBudget: config.lifetimeBudget,
      budgetType: config.budgetType,
      bidStrategy: config.bidStrategy,
      bidAmount: config.bidAmount,
      optimizationGoal,
      targeting: config.targeting,
      useAdvantageAudience: config.useAdvantageAudience,
      promotedObject: Object.keys(promotedObject).length > 0 ? promotedObject : undefined,
      status: config.status || "PAUSED",
      startTime: config.startTime,
      endTime: config.endTime,
      isCbo,
    });

    currentStep = "Ad Creative";
    const creativeId = await createAdCreative(merchantId, {
      name: `${config.campaignName} - Creative`,
      pageId: config.pageId,
      format: config.creative.format,
      existingPostId: config.creative.existingPostId,
      existingPostSource: config.creative.existingPostSource,
      instagramActorId: config.instagramActorId,
      imageHash: isExistingPost ? undefined : imageHash,
      imageUrl: isExistingPost ? undefined : (!imageHash ? config.creative.imageUrl : undefined),
      videoId: isExistingPost ? undefined : config.creative.videoId,
      thumbnailUrl: isExistingPost ? undefined : config.creative.thumbnailUrl,
      primaryText: config.creative.primaryText,
      headline: config.creative.headline,
      description: config.creative.description,
      linkUrl: config.creative.linkUrl,
      callToAction: config.creative.callToAction,
      carouselCards: isExistingPost ? undefined : config.creative.carouselCards,
    });

    currentStep = "Ad";
    const adId = await createAd(merchantId, {
      name: `${config.campaignName} - Ad`,
      adsetId,
      creativeId,
      status: config.status || "PAUSED",
    });

    await db.update(adLaunchJobs)
      .set({
        status: "launched",
        metaCampaignId: campaignId,
        metaAdsetId: adsetId,
        metaAdId: adId,
        launchedAt: new Date(),
      })
      .where(eq(adLaunchJobs.id, jobId));

    return { campaignId, adsetId, adId };
  } catch (error: any) {
    const stepMsg = `[${currentStep}] ${error.message}`;
    await db.update(adLaunchJobs)
      .set({ status: "failed", errorMessage: stepMsg })
      .where(eq(adLaunchJobs.id, jobId));
    const enrichedError = new Error(error.message);
    (enrichedError as any).step = currentStep;
    throw enrichedError;
  }
}

export async function bulkLaunchAds(
  merchantId: string,
  ads: Array<{
    campaignName: string;
    objective: string;
    dailyBudget: string;
    targeting: any;
    creative: {
      primaryText: string;
      headline?: string;
      description?: string;
      linkUrl: string;
      imageUrl?: string;
      callToAction?: string;
    };
    pageId: string;
    pixelId?: string;
  }>
): Promise<{ total: number; succeeded: number; failed: number; results: Array<{ success: boolean; campaignId?: string; adSetId?: string; adId?: string; error?: string }> }> {
  const results: Array<{ success: boolean; campaignId?: string; adSetId?: string; adId?: string; error?: string }> = [];
  let succeeded = 0;
  let failed = 0;

  for (const ad of ads) {
    try {
      const campaignId = await createCampaign(merchantId, {
        name: ad.campaignName,
        objective: ad.objective,
        status: "PAUSED",
      });

      const adSetId = await createAdSet(merchantId, {
        name: `${ad.campaignName} - AdSet`,
        campaignId,
        dailyBudget: ad.dailyBudget,
        optimizationGoal: "OFFSITE_CONVERSIONS",
        targeting: ad.targeting || { geo_locations: { countries: ["PK"] } },
        status: "PAUSED",
      });

      const creativeId = await createAdCreative(merchantId, {
        name: `${ad.campaignName} - Creative`,
        pageId: ad.pageId,
        primaryText: ad.creative.primaryText,
        headline: ad.creative.headline,
        description: ad.creative.description,
        linkUrl: ad.creative.linkUrl,
        imageUrl: ad.creative.imageUrl,
        callToAction: ad.creative.callToAction,
      });

      const adId = await createAd(merchantId, {
        name: `${ad.campaignName} - Ad`,
        adsetId: adSetId,
        creativeId,
        status: "PAUSED",
      });

      results.push({ success: true, campaignId, adSetId, adId });
      succeeded++;
    } catch (error: any) {
      results.push({ success: false, error: error.message });
      failed++;
    }
  }

  return { total: ads.length, succeeded, failed, results };
}

export async function createCustomAudience(
  merchantId: string,
  params: {
    name: string;
    description?: string;
    audienceType: "customer_list" | "website";
    emails?: string[];
    phones?: string[];
    pixelId?: string;
    retentionDays?: number;
    rule?: any;
  }
): Promise<{ audienceId: string; dbId: string }> {
  const creds = await getCredentialsForMerchant(merchantId);

  const body: Record<string, any> = {
    name: params.name,
    description: params.description || "",
  };

  if (params.audienceType === "customer_list") {
    body.subtype = "CUSTOM";
    body.customer_file_source = "USER_PROVIDED_ONLY";
  } else if (params.audienceType === "website") {
    body.subtype = "WEBSITE";
    body.rule = params.rule || {
      inclusions: {
        operator: "or",
        rules: [{ event_sources: [{ id: params.pixelId, type: "pixel" }], retention_seconds: (params.retentionDays || 30) * 86400 }],
      },
    };
    body.prefill = true;
  }

  const result = await metaApiPost(creds, `${creds.adAccountId}/customaudiences`, body);
  const metaAudienceId = result.id;

  if (params.audienceType === "customer_list" && (params.emails?.length || params.phones?.length)) {
    const schema = [];
    const data: string[][] = [];

    if (params.emails?.length) {
      schema.push("EMAIL");
      for (const email of params.emails) {
        const hashed = crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
        data.push([hashed]);
      }
    }
    if (params.phones?.length) {
      const phoneIdx = schema.length;
      schema.push("PHONE");
      let i = 0;
      for (const phone of params.phones) {
        const normalized = phone.replace(/[^0-9+]/g, "");
        const hashed = crypto.createHash("sha256").update(normalized).digest("hex");
        if (i < data.length) {
          data[i].push(hashed);
        } else {
          const row = schema.map(() => "");
          row[phoneIdx] = hashed;
          data.push(row);
        }
        i++;
      }
    }

    const payload = { schema, data };
    await metaApiPost(creds, `${metaAudienceId}/users`, { payload });
  }

  const [dbRecord] = await db.insert(customAudiences).values({
    merchantId,
    metaAudienceId,
    name: params.name,
    description: params.description || null,
    audienceType: params.audienceType === "customer_list" ? "customer_list" : "website",
    subtype: params.audienceType === "customer_list" ? "CUSTOM" : "WEBSITE",
    source: params.audienceType,
    status: "active",
    retentionDays: params.retentionDays || null,
    pixelId: params.pixelId || null,
    rule: params.rule || null,
  }).returning();

  return { audienceId: metaAudienceId, dbId: dbRecord.id };
}

export async function createLookalikeAudience(
  merchantId: string,
  params: {
    name: string;
    sourceAudienceId: string;
    country: string;
    ratio: number;
  }
): Promise<{ audienceId: string; dbId: string }> {
  const creds = await getCredentialsForMerchant(merchantId);

  const body: Record<string, any> = {
    name: params.name,
    subtype: "LOOKALIKE",
    origin_audience_id: params.sourceAudienceId,
    lookalike_spec: JSON.stringify({
      type: "custom_ratio",
      ratio: params.ratio,
      country: params.country,
    }),
  };

  const result = await metaApiPost(creds, `${creds.adAccountId}/customaudiences`, body);
  const metaAudienceId = result.id;

  const [dbRecord] = await db.insert(customAudiences).values({
    merchantId,
    metaAudienceId,
    name: params.name,
    audienceType: "lookalike",
    subtype: "LOOKALIKE",
    source: "lookalike",
    status: "active",
    lookalikeSpec: { sourceAudienceId: params.sourceAudienceId, country: params.country, ratio: params.ratio },
  }).returning();

  return { audienceId: metaAudienceId, dbId: dbRecord.id };
}

export async function deleteCustomAudience(merchantId: string, audienceDbId: string): Promise<void> {
  const [audience] = await db.select().from(customAudiences)
    .where(and(eq(customAudiences.id, audienceDbId), eq(customAudiences.merchantId, merchantId)));

  if (!audience) throw new Error("Audience not found");

  if (audience.metaAudienceId) {
    const creds = await getCredentialsForMerchant(merchantId);
    try {
      const url = `${META_BASE_URL}/${audience.metaAudienceId}`;
      const formData = new URLSearchParams();
      formData.set("access_token", creds.accessToken);
      await fetch(url, { method: "DELETE", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formData.toString() });
    } catch (err: any) {
      console.warn(`[MetaAdLauncher] Failed to delete Meta audience ${audience.metaAudienceId}: ${err.message}`);
    }
  }

  await db.delete(customAudiences).where(eq(customAudiences.id, audienceDbId));
}

export async function bulkUpdateCampaignStatus(
  merchantId: string,
  campaignIds: string[],
  status: "ACTIVE" | "PAUSED"
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  const creds = await getCredentialsForMerchant(merchantId);
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const campaignId of campaignIds) {
    try {
      await metaApiPost(creds, campaignId, { status });
      succeeded++;
    } catch (error: any) {
      failed++;
      errors.push(`${campaignId}: ${error.message}`);
    }
  }

  return { succeeded, failed, errors };
}

export async function bulkUpdateCampaignBudget(
  merchantId: string,
  campaignIds: string[],
  action: "increase" | "decrease" | "set",
  value: number,
  budgetType: "daily" | "lifetime"
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  const creds = await getCredentialsForMerchant(merchantId);
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const campaignId of campaignIds) {
    try {
      if (action === "set") {
        const body: Record<string, any> = {};
        if (budgetType === "daily") body.daily_budget = Math.round(value * 100);
        else body.lifetime_budget = Math.round(value * 100);
        await metaApiPost(creds, campaignId, body);
      } else {
        const currentData = await metaApiGet(creds, campaignId, { fields: "daily_budget,lifetime_budget" });
        const currentBudget = parseFloat(budgetType === "daily" ? currentData.daily_budget : currentData.lifetime_budget) || 0;
        const multiplier = action === "increase" ? (1 + value / 100) : (1 - value / 100);
        const newBudget = Math.max(Math.round(currentBudget * multiplier), 100);
        const body: Record<string, any> = {};
        if (budgetType === "daily") body.daily_budget = newBudget;
        else body.lifetime_budget = newBudget;
        await metaApiPost(creds, campaignId, body);
      }
      succeeded++;
    } catch (error: any) {
      failed++;
      errors.push(`${campaignId}: ${error.message}`);
    }
  }

  return { succeeded, failed, errors };
}

export async function evaluateAutomationRules(merchantId: string): Promise<{ triggered: number; actions: string[] }> {
  const rules = await db.select().from(adAutomationRules)
    .where(and(eq(adAutomationRules.merchantId, merchantId), eq(adAutomationRules.enabled, true)));

  if (rules.length === 0) return { triggered: 0, actions: [] };

  const triggeredActions: string[] = [];
  const creds = await getCredentialsForMerchant(merchantId);

  for (const rule of rules) {
    try {
      const windowDays = rule.conditionWindow === "last_3d" ? 3 : rule.conditionWindow === "last_7d" ? 7 : rule.conditionWindow === "last_14d" ? 14 : rule.conditionWindow === "last_30d" ? 30 : 7;
      const dateTo = new Date().toISOString().split("T")[0];
      const dateFrom = new Date(Date.now() - windowDays * 86400000).toISOString().split("T")[0];

      const ruleEntityType = (rule as any).entityType || "campaign";

      let entities: { entityId: string; entityName: string; insightEntityType: string }[] = [];

      if (ruleEntityType === "adset") {
        const sets = await db.select().from(adSets)
          .where(and(eq(adSets.merchantId, merchantId), eq(adSets.effectiveStatus, "ACTIVE")));
        entities = sets.map(s => ({ entityId: s.adsetId, entityName: s.name, insightEntityType: "adset" }));
      } else {
        const campaigns = await db.select().from(adCampaigns)
          .where(and(eq(adCampaigns.merchantId, merchantId), eq(adCampaigns.effectiveStatus, "ACTIVE")));
        entities = campaigns.map(c => ({ entityId: c.campaignId, entityName: c.name, insightEntityType: "campaign" }));
      }

      for (const entity of entities) {
        const insights = await db.select({
          totalSpend: sql<string>`COALESCE(SUM(${adInsights.spend}::numeric), 0)`,
          totalPurchases: sql<number>`COALESCE(SUM(${adInsights.purchases}), 0)`,
          totalPurchaseValue: sql<string>`COALESCE(SUM(${adInsights.purchaseValue}::numeric), 0)`,
          totalImpressions: sql<number>`COALESCE(SUM(${adInsights.impressions}), 0)`,
          totalClicks: sql<number>`COALESCE(SUM(${adInsights.clicks}), 0)`,
        }).from(adInsights)
          .where(and(
            eq(adInsights.merchantId, merchantId),
            eq(adInsights.entityId, entity.entityId),
            eq(adInsights.entityType, entity.insightEntityType),
            gte(adInsights.date, dateFrom),
            lte(adInsights.date, dateTo),
          ));

        if (!insights[0]) continue;
        const spend = parseFloat(String(insights[0].totalSpend)) || 0;
        const purchases = insights[0].totalPurchases || 0;
        const purchaseValue = parseFloat(String(insights[0].totalPurchaseValue)) || 0;
        const impressions = insights[0].totalImpressions || 0;
        const clicks = insights[0].totalClicks || 0;

        let metricValue = 0;
        switch (rule.conditionMetric) {
          case "cpa": metricValue = purchases > 0 ? spend / purchases : spend > 0 ? Infinity : 0; break;
          case "roas": metricValue = spend > 0 ? purchaseValue / spend : 0; break;
          case "spend": metricValue = spend; break;
          case "cpc": metricValue = clicks > 0 ? spend / clicks : 0; break;
          case "cpm": metricValue = impressions > 0 ? (spend / impressions) * 1000 : 0; break;
          case "ctr": metricValue = impressions > 0 ? (clicks / impressions) * 100 : 0; break;
          case "purchases": metricValue = purchases; break;
          default: continue;
        }

        const threshold = parseFloat(String(rule.conditionValue)) || 0;
        let conditionMet = false;
        switch (rule.conditionOperator) {
          case ">": conditionMet = metricValue > threshold; break;
          case "<": conditionMet = metricValue < threshold; break;
          case ">=": conditionMet = metricValue >= threshold; break;
          case "<=": conditionMet = metricValue <= threshold; break;
          case "=": conditionMet = Math.abs(metricValue - threshold) < 0.01; break;
        }

        if (!conditionMet) continue;

        const entityLabel = ruleEntityType === "adset" ? "ad set" : "campaign";
        let actionDesc = "";
        try {
          switch (rule.actionType) {
            case "pause":
              await metaApiPost(creds, entity.entityId, { status: "PAUSED" });
              actionDesc = `Paused ${entityLabel} "${entity.entityName}" (${rule.conditionMetric} ${rule.conditionOperator} ${threshold}, actual: ${metricValue.toFixed(2)})`;
              break;
            case "increase_budget": {
              const pct = parseFloat(String(rule.actionValue)) || 20;
              const currentData = await metaApiGet(creds, entity.entityId, { fields: "daily_budget" });
              const currentBudget = parseFloat(currentData.daily_budget) || 0;
              const newBudget = Math.round(currentBudget * (1 + pct / 100));
              await metaApiPost(creds, entity.entityId, { daily_budget: newBudget });
              actionDesc = `Increased budget ${pct}% for ${entityLabel} "${entity.entityName}" (${currentBudget / 100} → ${newBudget / 100})`;
              break;
            }
            case "decrease_budget": {
              const pct = parseFloat(String(rule.actionValue)) || 20;
              const currentData = await metaApiGet(creds, entity.entityId, { fields: "daily_budget" });
              const currentBudget = parseFloat(currentData.daily_budget) || 0;
              const newBudget = Math.max(Math.round(currentBudget * (1 - pct / 100)), 100);
              await metaApiPost(creds, entity.entityId, { daily_budget: newBudget });
              actionDesc = `Decreased budget ${pct}% for ${entityLabel} "${entity.entityName}" (${currentBudget / 100} → ${newBudget / 100})`;
              break;
            }
            case "notify":
              actionDesc = `Rule triggered for ${entityLabel} "${entity.entityName}": ${rule.conditionMetric} ${rule.conditionOperator} ${threshold} (actual: ${metricValue.toFixed(2)})`;
              break;
          }
        } catch (actionErr: any) {
          actionDesc = `Failed action on ${entityLabel} "${entity.entityName}": ${actionErr.message}`;
        }

        if (actionDesc) {
          triggeredActions.push(actionDesc);
          await db.update(adAutomationRules)
            .set({ lastTriggeredAt: new Date(), triggerCount: sql`${adAutomationRules.triggerCount} + 1`, updatedAt: new Date() })
            .where(eq(adAutomationRules.id, rule.id));
        }
      }
    } catch (ruleErr: any) {
      console.error(`[AutomationRules] Error evaluating rule ${rule.id}: ${ruleErr.message}`);
    }
  }

  return { triggered: triggeredActions.length, actions: triggeredActions };
}

export async function bulkUpdateAdSetStatus(
  merchantId: string,
  adSetIds: string[],
  status: "ACTIVE" | "PAUSED"
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  const creds = await getCredentialsForMerchant(merchantId);
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const adSetId of adSetIds) {
    try {
      await metaApiPost(creds, adSetId, { status });
      succeeded++;
    } catch (error: any) {
      failed++;
      errors.push(`${adSetId}: ${error.message}`);
    }
  }

  return { succeeded, failed, errors };
}

export async function bulkUpdateAdSetBudget(
  merchantId: string,
  adSetIds: string[],
  action: "increase" | "decrease" | "set",
  value: number,
  budgetType: "daily" | "lifetime"
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  const creds = await getCredentialsForMerchant(merchantId);
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const adSetId of adSetIds) {
    try {
      if (action === "set") {
        const body: Record<string, any> = {};
        if (budgetType === "daily") body.daily_budget = Math.round(value * 100);
        else body.lifetime_budget = Math.round(value * 100);
        await metaApiPost(creds, adSetId, body);
      } else {
        const currentData = await metaApiGet(creds, adSetId, { fields: "daily_budget,lifetime_budget" });
        const currentBudget = parseFloat(budgetType === "daily" ? currentData.daily_budget : currentData.lifetime_budget) || 0;
        const multiplier = action === "increase" ? (1 + value / 100) : (1 - value / 100);
        const newBudget = Math.max(Math.round(currentBudget * multiplier), 100);
        const body: Record<string, any> = {};
        if (budgetType === "daily") body.daily_budget = newBudget;
        else body.lifetime_budget = newBudget;
        await metaApiPost(creds, adSetId, body);
      }
      succeeded++;
    } catch (error: any) {
      failed++;
      errors.push(`${adSetId}: ${error.message}`);
    }
  }

  return { succeeded, failed, errors };
}

export async function bulkUpdateTargeting(
  merchantId: string,
  adSetIds: string[],
  targetingUpdate: Record<string, any>
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  const creds = await getCredentialsForMerchant(merchantId);
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const adSetId of adSetIds) {
    try {
      const currentData = await metaApiGet(creds, adSetId, { fields: "targeting" });
      const mergedTargeting = { ...currentData.targeting, ...targetingUpdate };
      await metaApiPost(creds, adSetId, { targeting: JSON.stringify(mergedTargeting) });
      succeeded++;
    } catch (error: any) {
      failed++;
      errors.push(`${adSetId}: ${error.message}`);
    }
  }

  return { succeeded, failed, errors };
}
