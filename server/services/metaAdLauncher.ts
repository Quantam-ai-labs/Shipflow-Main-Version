import { db } from "../db";
import { adLaunchJobs, adMediaLibrary, merchants } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getCredentialsForMerchant } from "./metaAds";
import { decryptToken } from "./encryption";

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

interface MetaWriteOptions {
  accessToken: string;
  adAccountId: string;
}

async function metaApiPost(creds: MetaWriteOptions, endpoint: string, body: Record<string, any>): Promise<any> {
  const url = `${META_BASE_URL}/${endpoint}`;
  const formData = new URLSearchParams();
  formData.set("access_token", creds.accessToken);
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null) {
      formData.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  const data = await response.json();
  if (!response.ok) {
    const errMsg = data?.error?.message || `Meta API error ${response.status}`;
    console.error(`[MetaAdLauncher] POST ${endpoint} failed:`, errMsg);
    throw new Error(errMsg);
  }
  return data;
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
    buyingType?: string;
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

  const result = await metaApiPost(creds, `${creds.adAccountId}/campaigns`, body);
  console.log(`[MetaAdLauncher] Campaign created: ${result.id}`);
  return result.id;
}

export async function createAdSet(
  merchantId: string,
  params: {
    name: string;
    campaignId: string;
    dailyBudget: string;
    optimizationGoal: string;
    billingEvent?: string;
    targeting: any;
    promotedObject?: any;
    status?: string;
    startTime?: string;
  }
): Promise<string> {
  const creds = await getCredentialsForMerchant(merchantId);
  const budgetInCents = Math.round(parseFloat(params.dailyBudget) * 100);
  const body: Record<string, any> = {
    name: params.name,
    campaign_id: params.campaignId,
    daily_budget: budgetInCents,
    optimization_goal: params.optimizationGoal,
    billing_event: params.billingEvent || "IMPRESSIONS",
    targeting: params.targeting,
    status: params.status || "PAUSED",
  };

  if (params.promotedObject) {
    body.promoted_object = params.promotedObject;
  }
  if (params.startTime) {
    body.start_time = params.startTime;
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
    imageHash?: string;
    imageUrl?: string;
    videoId?: string;
    primaryText: string;
    headline?: string;
    description?: string;
    linkUrl: string;
    callToAction?: string;
  }
): Promise<string> {
  const creds = await getCredentialsForMerchant(merchantId);

  const linkData: Record<string, any> = {
    message: params.primaryText,
    link: params.linkUrl,
    call_to_action: {
      type: params.callToAction || "SHOP_NOW",
      value: { link: params.linkUrl },
    },
  };

  if (params.imageHash) {
    linkData.image_hash = params.imageHash;
  } else if (params.imageUrl) {
    linkData.picture = params.imageUrl;
  }
  if (params.headline) {
    linkData.name = params.headline;
  }
  if (params.description) {
    linkData.description = params.description;
  }

  const objectStorySpec: Record<string, any> = {
    page_id: params.pageId,
  };

  if (params.videoId) {
    objectStorySpec.video_data = {
      video_id: params.videoId,
      message: params.primaryText,
      link_description: params.description || "",
      call_to_action: {
        type: params.callToAction || "SHOP_NOW",
        value: { link: params.linkUrl },
      },
      image_hash: params.imageHash,
    };
  } else {
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
    targeting: any;
    creative: {
      primaryText: string;
      headline?: string;
      description?: string;
      linkUrl: string;
      imageUrl?: string;
      imageHash?: string;
      callToAction?: string;
    };
    pageId: string;
    pixelId?: string;
    status?: string;
  }
): Promise<{ campaignId: string; adsetId: string; adId: string }> {
  try {
    await db.update(adLaunchJobs)
      .set({ status: "launching" })
      .where(eq(adLaunchJobs.id, jobId));

    let imageHash = config.creative.imageHash;
    if (!imageHash && config.creative.imageUrl) {
      const uploaded = await uploadImageToMeta(merchantId, config.creative.imageUrl);
      imageHash = uploaded.hash;
    }

    const campaignId = await createCampaign(merchantId, {
      name: config.campaignName,
      objective: config.objective,
      status: config.status || "PAUSED",
    });

    const promotedObject: Record<string, any> = {};
    if (config.pixelId) {
      promotedObject.pixel_id = config.pixelId;
      promotedObject.custom_event_type = "PURCHASE";
    }

    const adsetId = await createAdSet(merchantId, {
      name: `${config.campaignName} - AdSet`,
      campaignId,
      dailyBudget: config.dailyBudget,
      optimizationGoal: config.pixelId ? "OFFSITE_CONVERSIONS" : "LINK_CLICKS",
      targeting: config.targeting,
      promotedObject: Object.keys(promotedObject).length > 0 ? promotedObject : undefined,
      status: config.status || "PAUSED",
    });

    const creativeId = await createAdCreative(merchantId, {
      name: `${config.campaignName} - Creative`,
      pageId: config.pageId,
      imageHash,
      imageUrl: !imageHash ? config.creative.imageUrl : undefined,
      primaryText: config.creative.primaryText,
      headline: config.creative.headline,
      description: config.creative.description,
      linkUrl: config.creative.linkUrl,
      callToAction: config.creative.callToAction,
    });

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
    await db.update(adLaunchJobs)
      .set({ status: "failed", errorMessage: error.message })
      .where(eq(adLaunchJobs.id, jobId));
    throw error;
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
      const creds = await getWriteCredentials(merchantId);
      const actId = `act_${creds.adAccountId.replace("act_", "")}`;

      const campaignResult = await createCampaign(creds, {
        name: ad.campaignName,
        objective: ad.objective,
        status: "PAUSED",
        special_ad_categories: [],
      });

      const adSetResult = await createAdSet(creds, {
        campaign_id: campaignResult.id,
        name: `${ad.campaignName} - AdSet`,
        daily_budget: Math.round(parseFloat(ad.dailyBudget) * 100),
        billing_event: "IMPRESSIONS",
        optimization_goal: "OFFSITE_CONVERSIONS",
        targeting: ad.targeting || { geo_locations: { countries: ["PK"] } },
        status: "PAUSED",
      });

      const creativeData: any = {
        name: `${ad.campaignName} - Creative`,
        object_story_spec: {
          page_id: ad.pageId,
          link_data: {
            message: ad.creative.primaryText,
            link: ad.creative.linkUrl,
            name: ad.creative.headline,
            description: ad.creative.description,
            call_to_action: { type: ad.creative.callToAction || "SHOP_NOW" },
          },
        },
      };
      if (ad.creative.imageUrl) {
        creativeData.object_story_spec.link_data.picture = ad.creative.imageUrl;
      }

      const creativeResult = await createAdCreative(creds, creativeData);

      const adResult = await createAd(creds, {
        name: `${ad.campaignName} - Ad`,
        adset_id: adSetResult.id,
        creative: { creative_id: creativeResult.id },
        status: "PAUSED",
      });

      results.push({ success: true, campaignId: campaignResult.id, adSetId: adSetResult.id, adId: adResult.id });
      succeeded++;
    } catch (error: any) {
      results.push({ success: false, error: error.message });
      failed++;
    }
  }

  return { total: ads.length, succeeded, failed, results };
}

async function getWriteCredentials(merchantId: string): Promise<MetaWriteOptions> {
  const [merchant] = await db.select({
    facebookAccessToken: merchants.facebookAccessToken,
    facebookAdAccountId: merchants.facebookAdAccountId,
  }).from(merchants).where(eq(merchants.id, merchantId));

  if (!merchant?.facebookAccessToken || !merchant?.facebookAdAccountId) {
    throw new Error("Facebook not connected or ad account not configured");
  }

  return {
    accessToken: decryptToken(merchant.facebookAccessToken),
    adAccountId: merchant.facebookAdAccountId,
  };
}
