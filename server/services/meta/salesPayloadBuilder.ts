export type SalesCreativeMode = "UPLOAD_IMAGE" | "UPLOAD_VIDEO" | "EXISTING_POST";

export interface SalesLaunchInput {
  adName: string;
  mode: SalesCreativeMode;
  imageHash?: string | null;
  videoId?: string | null;
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

const PAKISTAN_CITIES = [
  { key: "2514942", name: "Karachi" },
  { key: "2517888", name: "Lahore" },
  { key: "2515510", name: "Islamabad" },
  { key: "2519689", name: "Rawalpindi" },
  { key: "2514582", name: "Faisalabad" },
  { key: "2518698", name: "Peshawar" },
  { key: "2517714", name: "Multan" },
  { key: "2515178", name: "Gujranwala" },
  { key: "2519353", name: "Quetta" },
  { key: "2520068", name: "Sialkot" },
  { key: "2514108", name: "Bahawalpur" },
  { key: "2520312", name: "Sargodha" },
  { key: "2513980", name: "Abbottabad" },
  { key: "2517352", name: "Mardan" },
  { key: "2520618", name: "Sukkur" },
  { key: "2516555", name: "Larkana" },
  { key: "2520083", name: "Sheikhupura" },
  { key: "2519510", name: "Rahim Yar Khan" },
  { key: "2516086", name: "Jhang" },
  { key: "2514384", name: "Dera Ghazi Khan" },
  { key: "2515024", name: "Gujrat" },
  { key: "2515384", name: "Hyderabad" },
  { key: "2514636", name: "Kasur" },
  { key: "2518334", name: "Okara" },
  { key: "2523683", name: "Wah Cantonment" },
  { key: "2514270", name: "Dera Ismail Khan" },
  { key: "2514330", name: "Chiniot" },
  { key: "2516140", name: "Jhelum" },
  { key: "2519946", name: "Sahiwal" },
  { key: "2514662", name: "Kamoke" },
  { key: "2514770", name: "Kohat" },
  { key: "2515006", name: "Hafizabad" },
  { key: "2517466", name: "Mirpur Khas" },
  { key: "2517718", name: "Muzaffargarh" },
  { key: "2514498", name: "Khanpur" },
  { key: "2521440", name: "Nawabshah" },
  { key: "2523789", name: "Jacobabad" },
  { key: "2516780", name: "Mansehra" },
  { key: "2520650", name: "Swabi" },
  { key: "2514088", name: "Bannu" },
  { key: "2517802", name: "Muzaffarabad" },
  { key: "2514214", name: "Chakwal" },
  { key: "2517234", name: "Mandi Bahauddin" },
  { key: "2514748", name: "Khairpur" },
  { key: "2514100", name: "Attock" },
  { key: "2516264", name: "Vehari" },
  { key: "2521606", name: "Tando Adam" },
  { key: "2520570", name: "Shikarpur" },
  { key: "2516032", name: "Jatoi" },
  { key: "2514818", name: "Layyah" },
  { key: "2516340", name: "Khuzdar" },
  { key: "2517568", name: "Mingora" },
  { key: "2514142", name: "Bhakkar" },
  { key: "2520200", name: "Mianwali" },
  { key: "2517924", name: "Narowal" },
  { key: "2514168", name: "Burewala" },
  { key: "2514862", name: "Lodhran" },
  { key: "2521640", name: "Tando Allahyar" },
  { key: "2514362", name: "Charsadda" },
  { key: "2514694", name: "Khanewal" },
  { key: "2514574", name: "Dadu" },
  { key: "2515240", name: "Haripur" },
  { key: "2517378", name: "Mian Channu" },
  { key: "2514798", name: "Kotli" },
  { key: "2517490", name: "Mirpur" },
  { key: "2514920", name: "Pakpattan" },
];

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
  const body: Record<string, any> = {
    name: `${input.adName} - Creative`,
  };

  if (input.existingPostSource === "instagram") {
    body.source_instagram_media_id = input.existingPostId;
  } else {
    body.object_story_id = input.existingPostId;
  }

  return body;
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
