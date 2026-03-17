import { META_BASE_URL } from "../metaAds";
import { db } from "../../db";
import { metaApiLogs } from "@shared/schema";
import type { SalesLaunchInput, BudgetLevel, SalesLaunchAdSetInput, SalesLaunchAdInput } from "./salesPayloadBuilder";

export interface ValidationIssue {
  code: string;
  field: string;
  stage: "preflight" | "input" | "media" | "connection";
  message: string;
  fixSuggestion: string;
}

async function logApiCall(merchantId: string | undefined, endpoint: string, status: number, ok: boolean, data: unknown): Promise<void> {
  if (!merchantId) return;
  try {
    await db.insert(metaApiLogs).values({
      merchantId,
      stage: "validation",
      endpoint,
      method: "GET",
      requestJson: {},
      responseJson: data as Record<string, unknown>,
      httpStatus: status,
      success: ok,
    });
  } catch (logErr) {
    console.warn("[Validation] Failed to write API log:", logErr instanceof Error ? logErr.message : logErr);
  }
}

export function validateLaunchInput(input: SalesLaunchInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!input.adAccountId) {
    issues.push({ code: "MISSING_AD_ACCOUNT", field: "adAccountId", stage: "connection", message: "Ad Account ID is required.", fixSuggestion: "Select an ad account in Meta settings." });
  }
  if (!input.pageId) {
    issues.push({ code: "MISSING_PAGE", field: "pageId", stage: "connection", message: "Facebook Page is required.", fixSuggestion: "Select a connected Facebook Page before launch." });
  }
  if (!input.adName || !input.adName.trim()) {
    issues.push({ code: "MISSING_AD_NAME", field: "adName", stage: "input", message: "Campaign / Ad name is required.", fixSuggestion: "Enter a name for your campaign." });
  }
  if (input.adSets && input.adSets.length > 0) {
    for (let si = 0; si < input.adSets.length; si++) {
      const adSet = input.adSets[si];
      if (!adSet.targetCountries || adSet.targetCountries.length === 0) {
        issues.push({ code: "MISSING_TARGETING", field: `adSets[${si}].targetCountries`, stage: "input", message: `Ad Set ${si + 1}: At least one target country required.`, fixSuggestion: "Add a target country." });
      }
      if (input.budgetLevel === "ABO" && (!adSet.dailyBudget || adSet.dailyBudget < 1)) {
        issues.push({ code: "INVALID_BUDGET", field: `adSets[${si}].dailyBudget`, stage: "input", message: `Ad Set ${si + 1}: Budget must be at least 1.`, fixSuggestion: "Enter a valid daily budget." });
      }
      for (let ai = 0; ai < adSet.ads.length; ai++) {
        const ad = adSet.ads[ai];
        const prefix = `Set ${si + 1} Ad ${ai + 1}`;
        if (!["UPLOAD_IMAGE", "UPLOAD_VIDEO", "EXISTING_POST"].includes(ad.mode)) {
          issues.push({ code: "INVALID_MODE", field: `adSets[${si}].ads[${ai}].mode`, stage: "input", message: `${prefix}: Invalid creative mode.`, fixSuggestion: "Select a valid creative mode." });
        }
        if (!ad.destinationUrl) {
          issues.push({ code: "MISSING_URL", field: `adSets[${si}].ads[${ai}].destinationUrl`, stage: "input", message: `${prefix}: Destination URL required.`, fixSuggestion: "Enter a website URL." });
        }
        if (ad.mode === "UPLOAD_IMAGE" && !ad.imageHash && !ad.imageUrl) {
          issues.push({ code: "MISSING_IMAGE", field: `adSets[${si}].ads[${ai}].imageHash`, stage: "media", message: `${prefix}: Image required.`, fixSuggestion: "Upload an image." });
        }
        if (ad.mode === "UPLOAD_VIDEO" && !ad.videoId && !ad.videoUrl) {
          issues.push({ code: "MISSING_VIDEO", field: `adSets[${si}].ads[${ai}].videoId`, stage: "media", message: `${prefix}: Video required.`, fixSuggestion: "Upload a video." });
        }
        if (ad.mode === "EXISTING_POST" && !ad.existingPostId) {
          issues.push({ code: "MISSING_POST_ID", field: `adSets[${si}].ads[${ai}].existingPostId`, stage: "media", message: `${prefix}: Post required.`, fixSuggestion: "Select a post." });
        }
        if (ad.mode !== "EXISTING_POST" && !ad.primaryText) {
          issues.push({ code: "MISSING_PRIMARY_TEXT", field: `adSets[${si}].ads[${ai}].primaryText`, stage: "input", message: `${prefix}: Primary text required.`, fixSuggestion: "Add ad copy text." });
        }
      }
    }
  } else {
    if (!["UPLOAD_IMAGE", "UPLOAD_VIDEO", "EXISTING_POST"].includes(input.mode)) {
      issues.push({ code: "INVALID_MODE", field: "mode", stage: "input", message: "Creative mode must be UPLOAD_IMAGE, UPLOAD_VIDEO, or EXISTING_POST.", fixSuggestion: "Select a valid creative mode." });
    }

    if (input.mode === "UPLOAD_IMAGE") {
      if (!input.imageHash && !input.imageUrl) {
        issues.push({ code: "MISSING_IMAGE", field: "imageHash", stage: "media", message: "Image must be uploaded before launch.", fixSuggestion: "Upload an image first." });
      }
      if (!input.destinationUrl) {
        issues.push({ code: "MISSING_URL", field: "destinationUrl", stage: "input", message: "Destination URL is required for image ads.", fixSuggestion: "Enter a website URL." });
      }
      if (!input.primaryText) {
        issues.push({ code: "MISSING_PRIMARY_TEXT", field: "primaryText", stage: "input", message: "Primary text is required for image ads.", fixSuggestion: "Add the main ad copy text." });
      }
    }

    if (input.mode === "UPLOAD_VIDEO") {
      if (!input.videoId && !input.videoUrl) {
        issues.push({ code: "MISSING_VIDEO", field: "videoId", stage: "media", message: "Video must be uploaded before launch.", fixSuggestion: "Upload a video first." });
      }
      if (!input.destinationUrl) {
        issues.push({ code: "MISSING_URL", field: "destinationUrl", stage: "input", message: "Destination URL is required for video ads.", fixSuggestion: "Enter a website URL." });
      }
      if (!input.primaryText) {
        issues.push({ code: "MISSING_PRIMARY_TEXT", field: "primaryText", stage: "input", message: "Primary text is required for video ads.", fixSuggestion: "Add the main ad copy text." });
      }
    }

    if (input.mode === "EXISTING_POST") {
      if (!input.existingPostId) {
        issues.push({ code: "MISSING_POST_ID", field: "existingPostId", stage: "media", message: "An existing post must be selected.", fixSuggestion: "Select a post from your Facebook or Instagram Page." });
      }
      if (!input.destinationUrl) {
        issues.push({ code: "MISSING_URL", field: "destinationUrl", stage: "input", message: "Destination URL is required for sales ads using existing posts.", fixSuggestion: "Enter a website URL where users will be directed when they click the ad." });
      }
    }
  }

  if (input.destinationUrl) {
    try {
      const url = new URL(input.destinationUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        issues.push({ code: "INVALID_URL_PROTOCOL", field: "destinationUrl", stage: "input", message: "Destination URL must use http or https.", fixSuggestion: "Use a URL starting with https://" });
      }
    } catch {
      issues.push({ code: "INVALID_URL", field: "destinationUrl", stage: "input", message: "Destination URL is not valid.", fixSuggestion: "Enter a valid URL like https://example.com" });
    }
  }

  if (!input.dailyBudget || input.dailyBudget < 1) {
    issues.push({ code: "INVALID_BUDGET", field: "dailyBudget", stage: "input", message: "Daily budget must be at least 1.", fixSuggestion: "Enter a daily budget of at least 1." });
  }

  if (input.startMode === "SCHEDULED" && !input.startTime) {
    issues.push({ code: "MISSING_START_TIME", field: "startTime", stage: "input", message: "Start time is required when scheduling.", fixSuggestion: "Select a start date and time." });
  }

  return issues;
}

export async function validateConnection(accessToken: string, adAccountId: string, pageId: string, merchantId?: string): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  if (!accessToken) {
    issues.push({ code: "MISSING_TOKEN", field: "accessToken", stage: "connection", message: "Access token is missing.", fixSuggestion: "Reconnect your Meta account." });
    return issues;
  }
  if (!adAccountId) {
    issues.push({ code: "MISSING_AD_ACCOUNT", field: "adAccountId", stage: "connection", message: "Ad Account ID is required.", fixSuggestion: "Select an ad account in Meta settings." });
    return issues;
  }
  if (!pageId) {
    issues.push({ code: "MISSING_PAGE", field: "pageId", stage: "connection", message: "Facebook Page is required.", fixSuggestion: "Select a connected Facebook Page." });
    return issues;
  }

  try {
    const tokenUrl = new URL(`${META_BASE_URL}/me`);
    tokenUrl.searchParams.set("access_token", accessToken);
    tokenUrl.searchParams.set("fields", "id,name");
    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();
    await logApiCall(merchantId, "me", tokenRes.status, tokenRes.ok, tokenData);
    if (!tokenRes.ok) {
      issues.push({ code: "TOKEN_INVALID", field: "accessToken", stage: "connection", message: tokenData?.error?.message || "Access token is invalid.", fixSuggestion: "Reconnect your Meta account in Settings." });
      return issues;
    }
  } catch {
    issues.push({ code: "TOKEN_CHECK_FAILED", field: "accessToken", stage: "connection", message: "Could not verify access token.", fixSuggestion: "Check your internet connection." });
    return issues;
  }

  try {
    const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
    const acctUrl = new URL(`${META_BASE_URL}/${actId}`);
    acctUrl.searchParams.set("access_token", accessToken);
    acctUrl.searchParams.set("fields", "account_status");
    const acctRes = await fetch(acctUrl.toString());
    const acctData = await acctRes.json();
    await logApiCall(merchantId, actId, acctRes.status, acctRes.ok, acctData);
    if (!acctRes.ok) {
      issues.push({ code: "AD_ACCOUNT_INACCESSIBLE", field: "adAccountId", stage: "connection", message: acctData?.error?.message || "Cannot access ad account.", fixSuggestion: "Check your ad account permissions." });
    } else if (acctData.account_status !== 1) {
      issues.push({ code: "AD_ACCOUNT_NOT_ACTIVE", field: "adAccountId", stage: "connection", message: "Ad account is not active.", fixSuggestion: "Ensure your ad account is active and in good standing." });
    }
  } catch {
    issues.push({ code: "AD_ACCOUNT_CHECK_FAILED", field: "adAccountId", stage: "connection", message: "Could not verify ad account.", fixSuggestion: "Check your internet connection." });
  }

  try {
    const pageUrl = new URL(`${META_BASE_URL}/${pageId}`);
    pageUrl.searchParams.set("access_token", accessToken);
    pageUrl.searchParams.set("fields", "id,name,is_published");
    const pageRes = await fetch(pageUrl.toString());
    const pageData = await pageRes.json();
    await logApiCall(merchantId, pageId, pageRes.status, pageRes.ok, pageData);
    if (!pageRes.ok) {
      issues.push({ code: "PAGE_INACCESSIBLE", field: "pageId", stage: "connection", message: pageData?.error?.message || "Cannot access Facebook Page.", fixSuggestion: "Ensure you have admin access to this page." });
    }
  } catch {
    issues.push({ code: "PAGE_CHECK_FAILED", field: "pageId", stage: "connection", message: "Could not verify Facebook Page.", fixSuggestion: "Check your internet connection." });
  }

  return issues;
}

export async function validateMediaReadiness(
  input: SalesLaunchInput,
  accessToken: string,
  merchantId?: string,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  if (input.adSets && input.adSets.length > 0) {
    for (let si = 0; si < input.adSets.length; si++) {
      for (let ai = 0; ai < input.adSets[si].ads.length; ai++) {
        const ad = input.adSets[si].ads[ai];
        const syntheticInput: SalesLaunchInput = {
          ...input,
          mode: ad.mode,
          imageHash: ad.imageHash,
          imageUrl: ad.imageUrl,
          videoId: ad.videoId,
          videoUrl: ad.videoUrl,
          existingPostId: ad.existingPostId,
          existingPostSource: ad.existingPostSource,
          destinationUrl: ad.destinationUrl,
          adSets: undefined,
        };
        const adIssues = await validateMediaReadiness(syntheticInput, accessToken, merchantId);
        for (const issue of adIssues) {
          issues.push({ ...issue, field: `adSets[${si}].ads[${ai}].${issue.field}`, message: `Set ${si + 1} Ad ${ai + 1}: ${issue.message}` });
        }
      }
    }
    return issues;
  }

  if (input.mode === "UPLOAD_IMAGE" && input.imageHash) {
    try {
      const actId = input.adAccountId.startsWith("act_") ? input.adAccountId : `act_${input.adAccountId}`;
      const url = new URL(`${META_BASE_URL}/${actId}/adimages`);
      url.searchParams.set("access_token", accessToken);
      url.searchParams.set("hashes", JSON.stringify([input.imageHash]));
      const response = await fetch(url.toString());
      const data = await response.json();
      await logApiCall(merchantId, `${actId}/adimages?hashes`, response.status, response.ok, data);

      if (!response.ok || !data?.data || (Array.isArray(data.data) && data.data.length === 0)) {
        issues.push({ code: "IMAGE_HASH_NOT_FOUND", field: "imageHash", stage: "media", message: "Image hash not found on Meta. Re-upload the image.", fixSuggestion: "Re-upload the image and try again." });
      }
    } catch {
      issues.push({ code: "IMAGE_CHECK_FAILED", field: "imageHash", stage: "media", message: "Could not verify image on Meta.", fixSuggestion: "Check your connection and re-try." });
    }
  }

  if (input.mode === "UPLOAD_VIDEO" && input.videoId) {
    try {
      const url = new URL(`${META_BASE_URL}/${input.videoId}`);
      url.searchParams.set("access_token", accessToken);
      url.searchParams.set("fields", "id,status");
      const response = await fetch(url.toString());
      const data = await response.json();
      await logApiCall(merchantId, input.videoId, response.status, response.ok, data);

      if (!response.ok) {
        issues.push({ code: "VIDEO_NOT_FOUND", field: "videoId", stage: "media", message: "Video not found on Meta.", fixSuggestion: "Re-upload the video." });
      } else {
        const videoStatus = data?.status?.video_status;
        if (videoStatus === "error") {
          issues.push({ code: "VIDEO_PROCESSING_FAILED", field: "videoId", stage: "media", message: "Video processing failed on Meta.", fixSuggestion: "Upload a different video file." });
        } else if (videoStatus && videoStatus !== "ready") {
          issues.push({ code: "VIDEO_NOT_READY", field: "videoId", stage: "media", message: `Video still processing (${videoStatus}). Wait for it to finish.`, fixSuggestion: "Wait a few minutes and re-run validation." });
        }
      }
    } catch {
      issues.push({ code: "VIDEO_CHECK_FAILED", field: "videoId", stage: "media", message: "Could not verify video status.", fixSuggestion: "Check your connection and re-try." });
    }
  }

  if (input.mode === "EXISTING_POST" && input.existingPostId) {
    try {
      const fields = input.existingPostSource === "instagram" ? "id,caption,timestamp,media_type" : "id,message,created_time";
      const url = new URL(`${META_BASE_URL}/${input.existingPostId}`);
      url.searchParams.set("access_token", accessToken);
      url.searchParams.set("fields", fields);
      const response = await fetch(url.toString());
      const data = await response.json();
      await logApiCall(merchantId, input.existingPostId, response.status, response.ok, data);

      if (!response.ok) {
        issues.push({ code: "POST_NOT_ACCESSIBLE", field: "existingPostId", stage: "media", message: `Cannot access post: ${data?.error?.message || "unknown error"}`, fixSuggestion: "Ensure the post exists and you have admin access." });
      }
    } catch {
      issues.push({ code: "POST_CHECK_FAILED", field: "existingPostId", stage: "media", message: "Could not verify post accessibility.", fixSuggestion: "Check your connection and re-try." });
    }
  }

  return issues;
}

export function normalizeInput(raw: Record<string, unknown>): SalesLaunchInput {
  const trimOrNull = (val: unknown): string | null => {
    if (val === undefined || val === null) return null;
    const s = String(val).trim();
    return s === "" ? null : s;
  };

  const mode = String(raw.mode || "UPLOAD_IMAGE") as SalesLaunchInput["mode"];
  const publishModeRaw = String(raw.publishMode || "VALIDATE");
  const budgetLevelRaw = String(raw.budgetLevel || "ABO").toUpperCase();
  const budgetLevel = (budgetLevelRaw === "CBO" ? "CBO" : "ABO") as BudgetLevel;

  const base: SalesLaunchInput = {
    adName: trimOrNull(raw.adName) || "",
    mode,
    adAccountId: trimOrNull(raw.adAccountId) || "",
    pageId: trimOrNull(raw.pageId) || "",
    pixelId: trimOrNull(raw.pixelId),
    dailyBudget: parseFloat(String(raw.dailyBudget || 0)) || 0,
    currency: trimOrNull(raw.currency) || "PKR",
    budgetLevel,
    startMode: raw.startMode === "SCHEDULED" ? "SCHEDULED" : "NOW",
    startTime: trimOrNull(raw.startTime),
    publishMode: (["VALIDATE", "DRAFT", "PUBLISH"].includes(publishModeRaw) ? publishModeRaw : "VALIDATE") as SalesLaunchInput["publishMode"],
    imageHash: null,
    imageUrl: null,
    videoId: null,
    videoUrl: null,
    existingPostId: null,
    existingPostSource: null,
    destinationUrl: trimOrNull(raw.destinationUrl),
    primaryText: null,
    headline: null,
    description: null,
    cta: null,
  };

  if (mode === "UPLOAD_IMAGE") {
    base.imageHash = trimOrNull(raw.imageHash);
    base.imageUrl = trimOrNull(raw.imageUrl);
    base.primaryText = trimOrNull(raw.primaryText);
    base.headline = trimOrNull(raw.headline);
    base.description = trimOrNull(raw.description);
    base.cta = trimOrNull(raw.cta) || "SHOP_NOW";
  } else if (mode === "UPLOAD_VIDEO") {
    base.videoId = trimOrNull(raw.videoId);
    base.videoUrl = trimOrNull(raw.videoUrl);
    base.primaryText = trimOrNull(raw.primaryText);
    base.headline = trimOrNull(raw.headline);
    base.description = trimOrNull(raw.description);
    base.cta = trimOrNull(raw.cta) || "SHOP_NOW";
  } else if (mode === "EXISTING_POST") {
    base.existingPostId = trimOrNull(raw.existingPostId);
    base.existingPostSource = raw.existingPostSource === "instagram" ? "instagram" : "facebook";
    base.cta = trimOrNull(raw.cta) || "SHOP_NOW";
  }

  if (Array.isArray(raw.targetCountries) && raw.targetCountries.length > 0) {
    base.targetCountries = raw.targetCountries.filter((c: unknown) => typeof c === "string" && c.length === 2) as string[];
  }
  if (Array.isArray(raw.targetCities) && raw.targetCities.length > 0) {
    base.targetCities = (raw.targetCities as Array<{ key: string; name?: string }>)
      .filter((c: { key?: string }) => c && typeof c.key === "string" && c.key.length > 0)
      .map((c: { key: string; name?: string }) => ({ key: c.key, name: c.name || undefined }));
  }

  if (Array.isArray(raw.adSets) && raw.adSets.length > 0) {
    base.adSets = (raw.adSets as Array<Record<string, unknown>>).map((rawAdSet: Record<string, unknown>) => ({
      targetCountries: Array.isArray(rawAdSet.targetCountries) ? (rawAdSet.targetCountries as string[]).filter((c: unknown) => typeof c === "string") : [],
      targetCities: Array.isArray(rawAdSet.targetCities) ? (rawAdSet.targetCities as Array<{ key?: string; name?: string }>).filter((c: { key?: string }) => c && typeof c.key === "string").map((c: { key: string; name?: string }) => ({ key: c.key, ...(c.name ? { name: c.name } : {}) })) : [],
      dailyBudget: parseFloat(String(rawAdSet.dailyBudget || 0)) || 0,
      ads: Array.isArray(rawAdSet.ads) ? (rawAdSet.ads as Array<Record<string, unknown>>).map((rawAd: Record<string, unknown>) => ({
        mode: (["UPLOAD_IMAGE", "UPLOAD_VIDEO", "EXISTING_POST"].includes(String(rawAd.mode)) ? String(rawAd.mode) : "UPLOAD_IMAGE") as SalesLaunchAdInput["mode"],
        imageHash: trimOrNull(rawAd.imageHash),
        imageUrl: trimOrNull(rawAd.imageUrl),
        videoId: trimOrNull(rawAd.videoId),
        videoUrl: trimOrNull(rawAd.videoUrl),
        existingPostId: trimOrNull(rawAd.existingPostId),
        existingPostSource: rawAd.existingPostSource === "instagram" ? "instagram" as const : "facebook" as const,
        destinationUrl: trimOrNull(rawAd.destinationUrl),
        primaryText: trimOrNull(rawAd.primaryText),
        headline: trimOrNull(rawAd.headline),
        description: trimOrNull(rawAd.description),
        cta: trimOrNull(rawAd.cta) || "SHOP_NOW",
      })) : [],
    }));

    const firstAdSet = base.adSets[0];
    const firstAd = firstAdSet?.ads[0];
    if (firstAdSet) {
      if (firstAdSet.targetCountries?.length) base.targetCountries = firstAdSet.targetCountries;
      if (firstAdSet.targetCities?.length) base.targetCities = firstAdSet.targetCities;
    }
    if (firstAd) {
      base.mode = firstAd.mode;
      base.destinationUrl = firstAd.destinationUrl;
      base.primaryText = firstAd.primaryText;
      base.headline = firstAd.headline;
      base.description = firstAd.description;
      base.cta = firstAd.cta;
      base.imageHash = firstAd.imageHash;
      base.imageUrl = firstAd.imageUrl;
      base.videoId = firstAd.videoId;
      base.videoUrl = firstAd.videoUrl;
      base.existingPostId = firstAd.existingPostId;
      base.existingPostSource = firstAd.existingPostSource;
    }
  }

  return base;
}
