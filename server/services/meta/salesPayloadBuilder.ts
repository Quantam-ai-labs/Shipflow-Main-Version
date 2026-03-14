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
  instagramActorId?: string | null;
}

export type MetaPayload = Record<string, unknown>;

export function sanitizePayload(obj: MetaPayload): MetaPayload {
  const result: MetaPayload = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "number" && isNaN(value)) continue;
    if (Array.isArray(value)) {
      result[key] = value;
    } else if (typeof value === "object") {
      const cleaned = sanitizePayload(value as MetaPayload);
      if (Object.keys(cleaned).length > 0) {
        result[key] = cleaned;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function buildCampaignPayload(input: SalesLaunchInput): MetaPayload {
  const isCBO = input.budgetLevel === "CBO";
  const budgetCents = Math.round(input.dailyBudget * 100);

  const payload: MetaPayload = {
    name: input.adName,
    objective: "OUTCOME_SALES",
    status: "PAUSED",
    special_ad_categories: [] as string[],
    buying_type: "AUCTION",
  };

  if (isCBO) {
    payload.daily_budget = budgetCents;
    payload.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
  } else {
    payload.is_adset_budget_sharing_enabled = false;
  }

  return payload;
}

export function buildAdSetPayload(
  input: SalesLaunchInput,
  campaignId: string
): MetaPayload {
  const isABO = input.budgetLevel === "ABO";
  const budgetCents = Math.round(input.dailyBudget * 100);
  const hasPixel = !!input.pixelId;

  const payload: MetaPayload = {
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

export function buildCreativePayload(input: SalesLaunchInput): MetaPayload {
  if (input.mode === "UPLOAD_IMAGE") {
    return buildImageCreativePayload(input);
  } else if (input.mode === "UPLOAD_VIDEO") {
    return buildVideoCreativePayload(input);
  } else {
    return buildExistingPostCreativePayload(input);
  }
}

interface LinkData {
  image_hash: string | null | undefined;
  link: string | null | undefined;
  message: string;
  call_to_action: { type: string; value: { link: string | null | undefined } };
  name?: string;
  description?: string;
}

interface VideoData {
  video_id: string | null | undefined;
  message: string;
  call_to_action: { type: string; value: { link: string | null | undefined } };
  title?: string;
  link_description?: string;
}

interface ObjectStorySpec {
  page_id: string;
  link_data?: LinkData;
  video_data?: VideoData;
}

function buildImageCreativePayload(input: SalesLaunchInput): MetaPayload {
  const linkData: LinkData = {
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

  const objectStorySpec: ObjectStorySpec = {
    page_id: input.pageId,
    link_data: linkData,
  };

  return {
    name: `${input.adName} - Creative`,
    object_story_spec: objectStorySpec,
  };
}

function buildVideoCreativePayload(input: SalesLaunchInput): MetaPayload {
  const videoData: VideoData = {
    video_id: input.videoId,
    message: input.primaryText || "",
    call_to_action: {
      type: input.cta || "SHOP_NOW",
      value: { link: input.destinationUrl },
    },
  };
  if (input.headline) videoData.title = input.headline;
  if (input.description) videoData.link_description = input.description;

  const objectStorySpec: ObjectStorySpec = {
    page_id: input.pageId,
    video_data: videoData,
  };

  return {
    name: `${input.adName} - Creative`,
    object_story_spec: objectStorySpec,
  };
}

function buildExistingPostCreativePayload(input: SalesLaunchInput): MetaPayload {
  const payload: MetaPayload = {
    name: `${input.adName} - Creative`,
  };

  if (input.existingPostSource === "instagram") {
    payload.source_instagram_media_id = input.existingPostId;
  } else {
    payload.object_story_id = input.existingPostId;
  }

  return payload;
}

export function buildAdPayload(
  input: SalesLaunchInput,
  adsetId: string,
  creativeId: string
): MetaPayload {
  const payload: MetaPayload = {
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

  if (input.destinationUrl) {
    try {
      const hostname = new URL(input.destinationUrl).hostname;
      if (hostname) {
        payload.conversion_domain = hostname;
      }
    } catch {
    }
  }

  return payload;
}

export function validateAllPayloads(
  campaignPayload: MetaPayload,
  adsetPayload: MetaPayload,
  creativePayload: MetaPayload,
  adPayload: MetaPayload,
  input: SalesLaunchInput
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!campaignPayload.name) errors.push("Campaign missing name");
  if (!campaignPayload.objective) errors.push("Campaign missing objective");

  if (input.budgetLevel === "CBO") {
    const budget = campaignPayload.daily_budget as number | undefined;
    if (!budget || budget <= 0) {
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
    if (campaignPayload.is_adset_budget_sharing_enabled !== undefined) {
      errors.push("CBO mode: campaign must NOT include is_adset_budget_sharing_enabled");
    }
  } else {
    const adsetBudget = adsetPayload.daily_budget as number | undefined;
    if (!adsetBudget || adsetBudget <= 0) {
      errors.push("ABO mode: ad set must have daily_budget > 0");
    }
    if (campaignPayload.daily_budget) {
      errors.push("ABO mode: campaign must NOT have daily_budget");
    }
    if (campaignPayload.is_adset_budget_sharing_enabled !== false) {
      errors.push("ABO mode: campaign must have is_adset_budget_sharing_enabled = false");
    }
  }

  if (!adsetPayload.optimization_goal) errors.push("Ad set missing optimization_goal");
  if (!adsetPayload.targeting) errors.push("Ad set missing targeting");

  if (!adPayload.adset_id) {
    errors.push("Ad missing adset_id");
  }
  const creative = adPayload.creative as { creative_id?: string } | undefined;
  if (adPayload.adset_id && String(adPayload.adset_id) !== "__PENDING__" && !creative?.creative_id) {
    errors.push("Ad missing creative_id");
  }

  const storySpec = creativePayload.object_story_spec as ObjectStorySpec | undefined;
  if (input.mode === "UPLOAD_IMAGE" && !storySpec?.link_data?.image_hash) {
    errors.push("Image creative missing image_hash");
  }
  if (input.mode === "UPLOAD_VIDEO" && !storySpec?.video_data?.video_id) {
    errors.push("Video creative missing video_id");
  }
  if (input.mode === "EXISTING_POST" && !creativePayload.object_story_id && !creativePayload.source_instagram_media_id) {
    errors.push("Existing post creative missing post ID");
  }

  return { valid: errors.length === 0, errors };
}
