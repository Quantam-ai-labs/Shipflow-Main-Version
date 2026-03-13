import { META_BASE_URL } from "../metaAds";
import { db } from "../../db";
import { metaApiLogs } from "@shared/schema";
import type { SalesLaunchInput } from "./salesPayloadBuilder";

export interface ValidationIssue {
  code: string;
  field: string;
  stage: "preflight" | "input" | "media" | "connection";
  message: string;
  fixSuggestion: string;
}

export function validateConnectionFields(input: SalesLaunchInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!input.adAccountId) {
    issues.push({
      code: "MISSING_AD_ACCOUNT",
      field: "adAccountId",
      stage: "connection",
      message: "Ad Account ID is required.",
      fixSuggestion: "Select an ad account in Meta settings.",
    });
  }

  if (!input.pageId) {
    issues.push({
      code: "MISSING_PAGE",
      field: "pageId",
      stage: "connection",
      message: "Facebook Page is required.",
      fixSuggestion: "Select a connected Facebook Page before launch.",
    });
  }

  return issues;
}

async function logValidationCall(merchantId: string | undefined, endpoint: string, status: number, ok: boolean, data: unknown): Promise<void> {
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
  } catch {}
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
    issues.push({ code: "MISSING_PAGE", field: "pageId", stage: "connection", message: "Facebook Page is required.", fixSuggestion: "Select a connected Facebook Page before launch." });
    return issues;
  }

  try {
    const tokenUrl = new URL(`${META_BASE_URL}/me`);
    tokenUrl.searchParams.set("access_token", accessToken);
    tokenUrl.searchParams.set("fields", "id,name");
    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();
    await logValidationCall(merchantId, "me", tokenRes.status, tokenRes.ok, tokenData);
    if (!tokenRes.ok) {
      issues.push({ code: "TOKEN_INVALID", field: "accessToken", stage: "connection", message: tokenData?.error?.message || "Access token is invalid or expired.", fixSuggestion: "Reconnect your Meta account in Settings." });
      return issues;
    }
  } catch {
    issues.push({ code: "TOKEN_CHECK_FAILED", field: "accessToken", stage: "connection", message: "Could not verify access token.", fixSuggestion: "Check your internet connection and try again." });
    return issues;
  }

  try {
    const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
    const acctUrl = new URL(`${META_BASE_URL}/${actId}`);
    acctUrl.searchParams.set("access_token", accessToken);
    acctUrl.searchParams.set("fields", "account_status");
    const acctRes = await fetch(acctUrl.toString());
    const acctData = await acctRes.json();
    await logValidationCall(merchantId, actId, acctRes.status, acctRes.ok, acctData);
    if (!acctRes.ok) {
      issues.push({ code: "AD_ACCOUNT_INACCESSIBLE", field: "adAccountId", stage: "connection", message: acctData?.error?.message || "Cannot access ad account.", fixSuggestion: "Check your ad account permissions." });
    } else if (acctData.account_status !== 1) {
      issues.push({ code: "AD_ACCOUNT_NOT_ACTIVE", field: "adAccountId", stage: "connection", message: "Ad account is not active.", fixSuggestion: "Ensure your ad account is active and in good standing." });
    }
  } catch {
    issues.push({ code: "AD_ACCOUNT_CHECK_FAILED", field: "adAccountId", stage: "connection", message: "Could not verify ad account.", fixSuggestion: "Check your internet connection and try again." });
  }

  try {
    const pageUrl = new URL(`${META_BASE_URL}/${pageId}`);
    pageUrl.searchParams.set("access_token", accessToken);
    pageUrl.searchParams.set("fields", "id,name,is_published");
    const pageRes = await fetch(pageUrl.toString());
    const pageData = await pageRes.json();
    await logValidationCall(merchantId, pageId, pageRes.status, pageRes.ok, pageData);
    if (!pageRes.ok) {
      issues.push({ code: "PAGE_INACCESSIBLE", field: "pageId", stage: "connection", message: pageData?.error?.message || "Cannot access Facebook Page.", fixSuggestion: "Ensure you have admin access to this page." });
    }
  } catch {
    issues.push({ code: "PAGE_CHECK_FAILED", field: "pageId", stage: "connection", message: "Could not verify Facebook Page.", fixSuggestion: "Check your internet connection and try again." });
  }

  return issues;
}

export function validateMediaReadiness(input: SalesLaunchInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (input.mode === "UPLOAD_IMAGE" && !input.imageHash && !input.imageUrl) {
    issues.push({
      code: "MISSING_IMAGE",
      field: "imageHash",
      stage: "media",
      message: "Image must be uploaded or image URL must be provided before launch.",
      fixSuggestion: "Upload an image first using the Upload Image tab.",
    });
  }

  if (input.mode === "UPLOAD_VIDEO" && !input.videoId && !input.videoUrl) {
    issues.push({
      code: "MISSING_VIDEO",
      field: "videoId",
      stage: "media",
      message: "Video must be uploaded or video URL must be provided before launch.",
      fixSuggestion: "Upload a video first using the Upload Video tab.",
    });
  }

  if (input.mode === "EXISTING_POST" && !input.existingPostId) {
    issues.push({
      code: "MISSING_POST_ID",
      field: "existingPostId",
      stage: "media",
      message: "An existing post must be selected.",
      fixSuggestion: "Select a post from your Facebook Page.",
    });
  }

  return issues;
}

export function validateLaunchInput(input: SalesLaunchInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  issues.push(...validateConnectionFields(input));
  issues.push(...validateMediaReadiness(input));

  if (!input.adName || !input.adName.trim()) {
    issues.push({
      code: "MISSING_AD_NAME",
      field: "adName",
      stage: "input",
      message: "Campaign / Ad name is required.",
      fixSuggestion: "Enter a name for your campaign.",
    });
  }

  if (!["UPLOAD_IMAGE", "UPLOAD_VIDEO", "EXISTING_POST"].includes(input.mode)) {
    issues.push({
      code: "INVALID_MODE",
      field: "mode",
      stage: "input",
      message: "Creative mode must be UPLOAD_IMAGE, UPLOAD_VIDEO, or EXISTING_POST.",
      fixSuggestion: "Select a valid creative mode.",
    });
  }

  if (input.mode === "UPLOAD_IMAGE" || input.mode === "UPLOAD_VIDEO") {
    if (!input.destinationUrl) {
      issues.push({
        code: "MISSING_URL",
        field: "destinationUrl",
        stage: "input",
        message: `Destination URL is required for ${input.mode === "UPLOAD_IMAGE" ? "image" : "video"} ads.`,
        fixSuggestion: "Enter a website URL where users will be directed.",
      });
    }
    if (!input.primaryText) {
      issues.push({
        code: "MISSING_PRIMARY_TEXT",
        field: "primaryText",
        stage: "input",
        message: `Primary text is required for ${input.mode === "UPLOAD_IMAGE" ? "image" : "video"} ads.`,
        fixSuggestion: "Add the main ad copy text.",
      });
    }
  }

  if (input.destinationUrl) {
    try {
      const url = new URL(input.destinationUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        issues.push({
          code: "INVALID_URL_PROTOCOL",
          field: "destinationUrl",
          stage: "input",
          message: "Destination URL must use http or https protocol.",
          fixSuggestion: "Use a URL starting with https://",
        });
      }
    } catch {
      issues.push({
        code: "INVALID_URL",
        field: "destinationUrl",
        stage: "input",
        message: "Destination URL is not a valid URL.",
        fixSuggestion: "Enter a valid URL like https://example.com",
      });
    }
  }

  if (!input.dailyBudget || input.dailyBudget < 1) {
    issues.push({
      code: "INVALID_BUDGET",
      field: "dailyBudget",
      stage: "input",
      message: "Daily budget must be at least 1.",
      fixSuggestion: "Enter a daily budget of at least 1 PKR.",
    });
  }

  if (input.startMode === "SCHEDULED" && !input.startTime) {
    issues.push({
      code: "MISSING_START_TIME",
      field: "startTime",
      stage: "input",
      message: "Start time is required when scheduling.",
      fixSuggestion: "Select a start date and time.",
    });
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

  const base: SalesLaunchInput = {
    adName: trimOrNull(raw.adName) || "",
    mode,
    adAccountId: trimOrNull(raw.adAccountId) || "",
    pageId: trimOrNull(raw.pageId) || "",
    pixelId: trimOrNull(raw.pixelId),
    dailyBudget: parseFloat(String(raw.dailyBudget || 0)) || 0,
    currency: trimOrNull(raw.currency) || "PKR",
    startMode: raw.startMode === "SCHEDULED" ? "SCHEDULED" : "NOW",
    startTime: trimOrNull(raw.startTime),
    publishMode: (["VALIDATE", "DRAFT", "PUBLISH"].includes(publishModeRaw) ? publishModeRaw : "VALIDATE") as SalesLaunchInput["publishMode"],
    imageHash: null,
    imageUrl: null,
    videoId: null,
    videoUrl: null,
    existingPostId: null,
    existingPostSource: null,
    destinationUrl: null,
    primaryText: null,
    headline: null,
    description: null,
    cta: null,
  };

  if (mode === "UPLOAD_IMAGE") {
    base.imageHash = trimOrNull(raw.imageHash);
    base.imageUrl = trimOrNull(raw.imageUrl);
    base.destinationUrl = trimOrNull(raw.destinationUrl);
    base.primaryText = trimOrNull(raw.primaryText);
    base.headline = trimOrNull(raw.headline);
    base.description = trimOrNull(raw.description);
    base.cta = trimOrNull(raw.cta) || "SHOP_NOW";
  } else if (mode === "UPLOAD_VIDEO") {
    base.videoId = trimOrNull(raw.videoId);
    base.videoUrl = trimOrNull(raw.videoUrl);
    base.destinationUrl = trimOrNull(raw.destinationUrl);
    base.primaryText = trimOrNull(raw.primaryText);
    base.headline = trimOrNull(raw.headline);
    base.description = trimOrNull(raw.description);
    base.cta = trimOrNull(raw.cta) || "SHOP_NOW";
  } else if (mode === "EXISTING_POST") {
    base.existingPostId = trimOrNull(raw.existingPostId);
    base.existingPostSource = raw.existingPostSource === "instagram" ? "instagram" : "facebook";
  }

  return base;
}
