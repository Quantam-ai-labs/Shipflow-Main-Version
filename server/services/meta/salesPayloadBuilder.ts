export type SalesCreativeMode = "UPLOAD_IMAGE" | "UPLOAD_VIDEO" | "EXISTING_POST";

export type BudgetLevel = "CBO" | "ABO";

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
  budgetLevel: BudgetLevel;
  startMode: "NOW" | "SCHEDULED";
  startTime?: string | null;
  publishMode: "VALIDATE" | "DRAFT" | "PUBLISH";
}

export function sanitizePayload(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "number" && isNaN(value)) continue;
    if (Array.isArray(value)) {
      result[key] = value;
    } else if (typeof value === "object") {
      const cleaned = sanitizePayload(value);
      if (Object.keys(cleaned).length > 0) {
        result[key] = cleaned;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function buildCampaignPayload(input: SalesLaunchInput): Record<string, any> {
  const isCBO = input.budgetLevel === "CBO";
  const budgetCents = Math.round(input.dailyBudget * 100);

  const payload: Record<string, any> = {
    name: input.adName,
    objective: "OUTCOME_SALES",
    status: "PAUSED",
    special_ad_categories: [],
    buying_type: "AUCTION",
  };

  if (isCBO) {
    payload.daily_budget = budgetCents;
    payload.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
  }

  return payload;
}

export function buildAdSetPayload(
  input: SalesLaunchInput,
  campaignId: string
): Record<string, any> {
  const isABO = input.budgetLevel === "ABO";
  const budgetCents = Math.round(input.dailyBudget * 100);
  const hasPixel = !!input.pixelId;

  const payload: Record<string, any> = {
    name: `${input.adName} - Ad Set`,
    campaign_id: campaignId,
    optimization_goal: hasPixel ? "OFFSITE_CONVERSIONS" : "LINK_CLICKS",
    billing_event: "IMPRESSIONS",
    targeting: {
      geo_locations: {
        countries: ["PK"],
      },
    },
    status: "PAUSED",
  };

  if (isABO) {
    payload.daily_budget = budgetCents;
    payload.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
  }

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

export function buildCreativePayload(input: SalesLaunchInput): Record<string, any> {
  if (input.mode === "UPLOAD_IMAGE") {
    return buildImageCreativePayload(input);
  } else if (input.mode === "UPLOAD_VIDEO") {
    return buildVideoCreativePayload(input);
  } else {
    return buildExistingPostCreativePayload(input);
  }
}

function buildImageCreativePayload(input: SalesLaunchInput): Record<string, any> {
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

function buildVideoCreativePayload(input: SalesLaunchInput): Record<string, any> {
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

function buildExistingPostCreativePayload(input: SalesLaunchInput): Record<string, any> {
  const payload: Record<string, unknown> = {
    name: `${input.adName} - Creative`,
  };

  if (input.existingPostSource === "instagram") {
    payload.source_instagram_media_id = input.existingPostId;
  } else {
    payload.object_story_id = input.existingPostId;
  }

  if (input.instagramAccountId) {
    payload.instagram_actor_id = input.instagramAccountId;
  }

  return payload;
}

export function buildAdPayload(
  input: SalesLaunchInput,
  adsetId: string,
  creativeId: string
): Record<string, any> {
  const payload: Record<string, any> = {
    name: `${input.adName} - Ad`,
    adset_id: adsetId,
    creative: { creative_id: creativeId },
    status: "PAUSED",
  };

  if (input.pixelId) {
    payload.tracking_specs = [
      { "action.type": ["offsite_conversion"], fb_pixel: [input.pixelId] },
    ];
  }

  return payload;
}

export function validateAllPayloads(
  campaignPayload: Record<string, any>,
  adsetPayload: Record<string, any>,
  creativePayload: Record<string, any>,
  adPayload: Record<string, any>,
  input: SalesLaunchInput
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!campaignPayload.name) errors.push("Campaign missing name");
  if (!campaignPayload.objective) errors.push("Campaign missing objective");

  if (input.budgetLevel === "CBO") {
    if (!campaignPayload.daily_budget || campaignPayload.daily_budget <= 0) {
      errors.push("CBO mode: campaign must have daily_budget > 0");
    }
    if (!campaignPayload.bid_strategy) {
      errors.push("CBO mode: campaign must have bid_strategy");
    }
    if (adsetPayload.daily_budget) {
      errors.push("CBO mode: ad set must NOT have daily_budget (budget is on campaign)");
    }
    if (adsetPayload.bid_strategy) {
      errors.push("CBO mode: ad set must NOT have bid_strategy");
    }
  } else {
    if (!adsetPayload.daily_budget || adsetPayload.daily_budget <= 0) {
      errors.push("ABO mode: ad set must have daily_budget > 0");
    }
    if (campaignPayload.daily_budget) {
      errors.push("ABO mode: campaign must NOT have daily_budget");
    }
  }

  if (campaignPayload.is_adset_budget_sharing_enabled !== undefined) {
    errors.push("Campaign must NOT include is_adset_budget_sharing_enabled (Meta infers from budget placement)");
  }

  if (!adsetPayload.optimization_goal) errors.push("Ad set missing optimization_goal");
  if (!adsetPayload.targeting) errors.push("Ad set missing targeting");

  if (!adPayload.adset_id) {
    errors.push("Ad missing adset_id");
  }
  if (adPayload.adset_id && adPayload.adset_id !== "__PENDING__" && !adPayload.creative?.creative_id) {
    errors.push("Ad missing creative_id");
  }

  if (input.mode === "UPLOAD_IMAGE" && !creativePayload.object_story_spec?.link_data?.image_hash) {
    errors.push("Image creative missing image_hash");
  }
  if (input.mode === "UPLOAD_VIDEO" && !creativePayload.object_story_spec?.video_data?.video_id) {
    errors.push("Video creative missing video_id");
  }
  if (input.mode === "EXISTING_POST" && !creativePayload.object_story_id && !creativePayload.source_instagram_media_id) {
    errors.push("Existing post creative missing post ID");
  }

  return { valid: errors.length === 0, errors };
}
