export type SalesCreativeMode = "UPLOAD_IMAGE" | "UPLOAD_VIDEO" | "EXISTING_POST";

export interface SalesLaunchInput {
  adName: string;
  mode: SalesCreativeMode;
  imageHash?: string | null;
  imageUrl?: string | null;
  videoId?: string | null;
  videoUrl?: string | null;
  existingPostId?: string | null;
  existingPostSource?: "facebook" | "instagram" | null;
  adAccountId: string;
  pageId: string;
  instagramAccountId?: string | null;
  pixelId?: string | null;
  destinationUrl?: string | null;
  primaryText?: string | null;
  headline?: string | null;
  description?: string | null;
  cta?: string | null;
  dailyBudget: number;
  currency: string;
  startMode: "NOW" | "SCHEDULED";
  startTime?: string | null;
  publishMode: "VALIDATE" | "DRAFT" | "PUBLISH";
}

export function buildSalesCampaignPayload(input: SalesLaunchInput): Record<string, any> {
  return {
    name: input.adName,
    objective: "OUTCOME_SALES",
    status: "PAUSED",
    special_ad_categories: [],
    buying_type: "AUCTION",
    is_adset_budget_sharing_enabled: false,
  };
}

export function sanitizePayload(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "number" && isNaN(value)) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitizePayload(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function validateBudgetArchitecture(
  campaignPayload: Record<string, any>,
  adsetPayload: Record<string, any>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof campaignPayload.is_adset_budget_sharing_enabled !== "boolean") {
    errors.push("Campaign payload must include is_adset_budget_sharing_enabled as a boolean");
  }

  const forbiddenCampaignFields = ["bid_strategy", "daily_budget", "lifetime_budget", "budget_optimization"];
  for (const field of forbiddenCampaignFields) {
    if (field in campaignPayload) {
      errors.push(`Campaign payload must NOT include ${field} when using ad-set-level budget`);
    }
  }

  if (!adsetPayload.daily_budget || adsetPayload.daily_budget <= 0) {
    errors.push("Ad set payload must include daily_budget > 0");
  }

  return { valid: errors.length === 0, errors };
}

export function buildSalesAdSetPayload(
  input: SalesLaunchInput,
  campaignId: string
): Record<string, any> {
  const budgetCents = Math.round(input.dailyBudget * 100);

  const hasPixel = !!input.pixelId;
  const optimizationGoal = hasPixel ? "OFFSITE_CONVERSIONS" : "LINK_CLICKS";

  const targeting: Record<string, any> = {
    geo_locations: {
      countries: ["PK"],
    },
  };

  const payload: Record<string, any> = {
    name: `${input.adName} - Ad Set`,
    campaign_id: campaignId,
    optimization_goal: optimizationGoal,
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    daily_budget: budgetCents,
    targeting,
    status: "PAUSED",
    use_advantage_audience: true,
  };

  if (hasPixel) {
    payload.promoted_object = {
      pixel_id: input.pixelId,
      custom_event_type: "PURCHASE",
    };
  }

  if (input.startMode === "SCHEDULED" && input.startTime) {
    payload.start_time = input.startTime;
  }

  return payload;
}

export function buildImageSalesCreativePayload(
  input: SalesLaunchInput
): Record<string, any> {
  const linkData: Record<string, any> = {
    image_hash: input.imageHash,
    link: input.destinationUrl,
    message: input.primaryText || "",
    call_to_action: {
      type: input.cta || "SHOP_NOW",
      value: { link: input.destinationUrl },
    },
  };
  if (input.headline) linkData.name = input.headline;
  if (input.description) linkData.description = input.description;

  const objectStorySpec: Record<string, unknown> = {
    page_id: input.pageId,
    link_data: linkData,
  };
  if (input.instagramAccountId) {
    objectStorySpec.instagram_actor_id = input.instagramAccountId;
  }

  return {
    name: `${input.adName} - Creative`,
    object_story_spec: objectStorySpec,
  };
}

export function buildVideoSalesCreativePayload(
  input: SalesLaunchInput
): Record<string, any> {
  const videoData: Record<string, any> = {
    video_id: input.videoId,
    message: input.primaryText || "",
    call_to_action: {
      type: input.cta || "SHOP_NOW",
      value: { link: input.destinationUrl },
    },
  };
  if (input.headline) videoData.title = input.headline;
  if (input.description) videoData.link_description = input.description;

  const objectStorySpec: Record<string, unknown> = {
    page_id: input.pageId,
    video_data: videoData,
  };
  if (input.instagramAccountId) {
    objectStorySpec.instagram_actor_id = input.instagramAccountId;
  }

  return {
    name: `${input.adName} - Creative`,
    object_story_spec: objectStorySpec,
  };
}

export function buildExistingPostSalesCreativePayload(
  input: SalesLaunchInput
): Record<string, any> {
  const payload: Record<string, unknown> = {
    name: `${input.adName} - Creative`,
  };
  if (input.existingPostSource === "instagram") {
    payload.source_instagram_media_id = input.existingPostId;
  } else {
    payload.object_story_id = input.existingPostId;
  }
  return payload;
}

export function buildSalesAdPayload(
  input: SalesLaunchInput,
  adsetId: string,
  creativeId: string
): Record<string, any> {
  return {
    name: `${input.adName} - Ad`,
    adset_id: adsetId,
    creative: { creative_id: creativeId },
    status: "PAUSED",
  };
}
