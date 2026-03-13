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
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    is_adset_budget_sharing_enabled: false,
  };
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

  return {
    name: `${input.adName} - Creative`,
    object_story_spec: {
      page_id: input.pageId,
      link_data: linkData,
    },
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

  return {
    name: `${input.adName} - Creative`,
    object_story_spec: {
      page_id: input.pageId,
      video_data: videoData,
    },
  };
}

export function buildExistingPostSalesCreativePayload(
  input: SalesLaunchInput
): Record<string, any> {
  return {
    name: `${input.adName} - Creative`,
    object_story_id: input.existingPostId,
  };
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
