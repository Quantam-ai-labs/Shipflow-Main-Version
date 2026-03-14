import { db } from "../../db";
import { adLaunchJobs, metaApiLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getCredentialsForMerchant, META_BASE_URL } from "../metaAds";
import { uploadImageToMeta } from "../metaAdLauncher";
import { runDiagnostics } from "./salesDiagnostics";
import { normalizeInput, validateLaunchInput, validateMediaReadiness, type ValidationIssue } from "./salesValidation";
import {
  buildCampaignPayload,
  buildAdSetPayload,
  buildCreativePayload,
  buildAdPayload,
  sanitizePayload,
  validateAllPayloads,
  type SalesLaunchInput,
  type MetaPayload,
} from "./salesPayloadBuilder";
import { parseMetaError, formatMetaErrorForUser, type ParsedMetaError } from "./metaErrorParser";

export interface LaunchStage {
  stage: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  message?: string;
  data?: Record<string, unknown>;
}

export interface LaunchResult {
  success: boolean;
  jobId: string;
  stages: LaunchStage[];
  campaignId?: string;
  adsetId?: string;
  creativeId?: string;
  adId?: string;
  validationIssues?: ValidationIssue[];
  error?: string;
  errorStage?: string;
  rawError?: Record<string, unknown> | null;
}

class MetaApiError extends Error {
  metaError: Record<string, unknown> | null;
  parsed: ParsedMetaError | null;
  constructor(message: string, metaError: Record<string, unknown> | null = null, parsed: ParsedMetaError | null = null) {
    super(message);
    this.metaError = metaError;
    this.parsed = parsed;
  }
}

function sanitizeForLog(body: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "access_token") { safe[k] = "***REDACTED***"; continue; }
    safe[k] = v;
  }
  return safe;
}

const TRANSIENT_ERROR_CODES = [1, 2, 4, 17, 341, 368];

async function loggedMetaPost(
  merchantId: string,
  jobId: string,
  stage: string,
  accessToken: string,
  endpoint: string,
  body: MetaPayload,
  maxRetries = 1
): Promise<Record<string, unknown>> {
  const url = `${META_BASE_URL}/${endpoint}`;
  const formData = new URLSearchParams();
  formData.set("access_token", accessToken);
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null) {
      formData.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
  }

  let lastError: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    const data = await response.json() as Record<string, unknown>;
    const errorObj = data?.error as Record<string, unknown> | undefined;
    const fbtraceId = (errorObj?.fbtrace_id as string) || response.headers?.get("x-fb-trace-id") || null;

    try {
      await db.insert(metaApiLogs).values({
        merchantId,
        launchJobId: jobId,
        stage,
        endpoint,
        method: "POST",
        requestJson: sanitizeForLog(body),
        responseJson: data,
        httpStatus: response.status,
        success: response.ok,
        fbtraceId,
      });
    } catch (logErr) {
      console.error("[SalesLaunch] Failed to write API log:", logErr);
    }

    if (response.ok) return data;

    const errCode = (errorObj?.code as number) || 0;
    lastError = data;

    if (TRANSIENT_ERROR_CODES.includes(errCode) && attempt < maxRetries) {
      continue;
    }

    const parsed = parseMetaError(data);
    throw new MetaApiError(formatMetaErrorForUser(parsed), data, parsed);
  }

  const parsed = parseMetaError(lastError);
  throw new MetaApiError(formatMetaErrorForUser(parsed), lastError, parsed);
}

async function updateJobStage(jobId: string, stage: string, updates: Record<string, unknown> = {}) {
  await db.update(adLaunchJobs)
    .set({ currentStage: stage, ...updates })
    .where(eq(adLaunchJobs.id, jobId));
}

async function persistStages(jobId: string, stages: LaunchStage[], extraFields: Record<string, unknown> = {}) {
  const currentStage = stages[stages.length - 1]?.stage || "unknown";
  await db.update(adLaunchJobs)
    .set({
      currentStage,
      resultJson: { stages, ...extraFields },
      ...extraFields,
    })
    .where(eq(adLaunchJobs.id, jobId));
}

export async function startSalesLaunch(
  merchantId: string,
  rawInput: Record<string, unknown>
): Promise<{ jobId: string }> {
  const input = normalizeInput(rawInput);

  const [job] = await db.insert(adLaunchJobs).values({
    merchantId,
    status: "running",
    launchType: "sales",
    campaignName: input.adName,
    objective: "OUTCOME_SALES",
    dailyBudget: String(input.dailyBudget),
    targeting: { geo_locations: { countries: ["PK"] } },
    creativeConfig: {},
    pageId: input.pageId,
    pixelId: input.pixelId || null,
    mode: input.mode,
    publishMode: input.publishMode,
    normalizedInput: input as unknown as Record<string, unknown>,
    currentStage: "normalize",
    resultJson: { stages: [{ stage: "normalize", status: "running" }] },
  }).returning();

  executeSalesLaunchAsync(merchantId, input, job.id).catch((err) => {
    console.error("[SalesLaunch] Unhandled async error for job", job.id, err);
  });

  return { jobId: job.id };
}

async function executeSalesLaunchAsync(
  merchantId: string,
  input: SalesLaunchInput,
  jobId: string
): Promise<void> {
  const stages: LaunchStage[] = [];

  try {
    stages.push({ stage: "normalize", status: "success" });
    await persistStages(jobId, stages);

    stages.push({ stage: "validate", status: "running" });
    await persistStages(jobId, stages);
    const issues = validateLaunchInput(input);
    await updateJobStage(jobId, "validate", { validationStatus: issues as unknown as Record<string, unknown>[] });

    if (issues.length > 0) {
      stages[stages.length - 1] = { stage: "validate", status: "failed", message: `${issues.length} validation issue(s)`, data: { issues } };
      await persistStages(jobId, stages, { status: "failed", errorMessage: issues.map(i => i.message).join("; "), errorSummary: "Validation failed" });
      return;
    }
    stages[stages.length - 1] = { stage: "validate", status: "success" };
    await persistStages(jobId, stages);

    stages.push({ stage: "diagnostics", status: "running" });
    await persistStages(jobId, stages);
    const creds = await getCredentialsForMerchant(merchantId);
    const diagnostics = await runDiagnostics({
      accessToken: creds.accessToken,
      adAccountId: creds.adAccountId,
      pageId: input.pageId,
      pixelId: input.pixelId,
      merchantId,
    });

    if (!diagnostics.passed) {
      const failedChecks = diagnostics.checks.filter(c => c.status === "fail");
      const msg = failedChecks.map(c => `${c.name}: ${c.message}`).join("; ");
      stages[stages.length - 1] = { stage: "diagnostics", status: "failed", message: msg, data: { checks: diagnostics.checks } };
      await persistStages(jobId, stages, { status: "failed", errorMessage: msg, errorSummary: "Diagnostics failed" });
      return;
    }
    stages[stages.length - 1] = { stage: "diagnostics", status: "success", data: { checks: diagnostics.checks } };
    await persistStages(jobId, stages);

    stages.push({ stage: "media_validation", status: "running" });
    await persistStages(jobId, stages);
    const mediaIssues = await validateMediaReadiness(input, creds.accessToken, merchantId);
    if (mediaIssues.length > 0) {
      const mediaMsg = mediaIssues.map(i => i.message).join("; ");
      stages[stages.length - 1] = { stage: "media_validation", status: "failed", message: mediaMsg };
      await persistStages(jobId, stages, { status: "failed", errorMessage: mediaMsg, errorSummary: "Media validation failed" });
      return;
    }
    stages[stages.length - 1] = { stage: "media_validation", status: "success" };
    await persistStages(jobId, stages);

    stages.push({ stage: "payload_preflight", status: "running" });
    await persistStages(jobId, stages);
    {
      const preflightCampaign = sanitizePayload(buildCampaignPayload(input));
      const preflightAdset = sanitizePayload(buildAdSetPayload(input, "__PENDING__"));
      const preflightCreative = sanitizePayload(buildCreativePayload(input));
      const preflightAd = sanitizePayload(buildAdPayload(input, "__PENDING__", "__PREVIEW__"));
      const preflightResult = validateAllPayloads(preflightCampaign, preflightAdset, preflightCreative, preflightAd, input);
      if (!preflightResult.valid) {
        const errMsg = `Payload preflight failed: ${preflightResult.errors.join("; ")}`;
        stages[stages.length - 1] = { stage: "payload_preflight", status: "failed", message: errMsg };
        await persistStages(jobId, stages, { status: "failed", errorMessage: errMsg, errorSummary: "Payload preflight failed" });
        return;
      }
    }
    stages[stages.length - 1] = { stage: "payload_preflight", status: "success" };
    await persistStages(jobId, stages);

    if (input.publishMode === "VALIDATE") {
      stages.push({ stage: "complete", status: "success", message: "Validation, diagnostics, and payload preflight passed. No objects created." });
      await persistStages(jobId, stages, { status: "validated" });
      return;
    }

    if (input.mode === "UPLOAD_IMAGE" && input.imageUrl && !input.imageHash) {
      stages.push({ stage: "media_upload", status: "running" });
      await persistStages(jobId, stages);
      try {
        const uploadResult = await uploadImageToMeta(merchantId, input.imageUrl);
        input.imageHash = uploadResult.hash;

        try {
          await db.insert(metaApiLogs).values({
            merchantId,
            launchJobId: jobId,
            stage: "media_upload_image",
            endpoint: `${creds.adAccountId}/adimages`,
            method: "POST",
            requestJson: { url: input.imageUrl },
            responseJson: { hash: uploadResult.hash, url: uploadResult.url },
            httpStatus: 200,
            success: true,
          });
        } catch (logErr) {
          console.warn("[SalesLaunch] Failed to write image upload log:", logErr instanceof Error ? logErr.message : logErr);
        }

        stages[stages.length - 1] = { stage: "media_upload", status: "success", message: `Image hash: ${uploadResult.hash}` };
        await persistStages(jobId, stages);
      } catch (uploadErr: unknown) {
        const uploadError = uploadErr instanceof Error ? uploadErr : new Error(String(uploadErr));
        try {
          await db.insert(metaApiLogs).values({
            merchantId,
            launchJobId: jobId,
            stage: "media_upload_image",
            endpoint: `${creds.adAccountId}/adimages`,
            method: "POST",
            requestJson: { url: input.imageUrl },
            responseJson: { error: uploadError.message },
            httpStatus: 0,
            success: false,
          });
        } catch (logErr) {
          console.warn("[SalesLaunch] Failed to write image upload error log:", logErr instanceof Error ? logErr.message : logErr);
        }

        stages[stages.length - 1] = { stage: "media_upload", status: "failed", message: uploadError.message };
        await persistStages(jobId, stages, { status: "failed", errorMessage: uploadError.message, errorSummary: "Media upload failed" });
        return;
      }
    }

    if (input.mode === "UPLOAD_VIDEO" && input.videoUrl && !input.videoId) {
      stages.push({ stage: "media_upload", status: "running" });
      await persistStages(jobId, stages);
      try {
        const videoEndpoint = `${creds.adAccountId}/advideos`;
        const formData = new URLSearchParams();
        formData.set("access_token", creds.accessToken);
        formData.set("file_url", input.videoUrl);
        const response = await fetch(`${META_BASE_URL}/${videoEndpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        });
        const data = await response.json() as Record<string, unknown>;

        try {
          await db.insert(metaApiLogs).values({
            merchantId,
            launchJobId: jobId,
            stage: "media_upload_video",
            endpoint: videoEndpoint,
            method: "POST",
            requestJson: { file_url: input.videoUrl },
            responseJson: data,
            httpStatus: response.status,
            success: response.ok,
          });
        } catch (logErr) {
          console.warn("[SalesLaunch] Failed to write video upload log:", logErr instanceof Error ? logErr.message : logErr);
        }

        if (!response.ok) {
          const errResponse = data as { error?: { message?: string } };
          throw new Error(errResponse?.error?.message || "Video upload failed");
        }
        input.videoId = data.id as string;
        stages[stages.length - 1] = { stage: "media_upload", status: "success", message: `Video ID: ${data.id}` };
        await persistStages(jobId, stages);
      } catch (uploadErr: unknown) {
        const uploadError = uploadErr instanceof Error ? uploadErr : new Error(String(uploadErr));
        stages[stages.length - 1] = { stage: "media_upload", status: "failed", message: uploadError.message };
        await persistStages(jobId, stages, { status: "failed", errorMessage: uploadError.message, errorSummary: "Media upload failed" });
        return;
      }
    }

    if (input.mode === "UPLOAD_VIDEO" && input.videoId) {
      stages.push({ stage: "media_readiness", status: "running" });
      await persistStages(jobId, stages);
      try {
        const maxPolls = 30;
        const pollInterval = 5000;
        let videoReady = false;
        for (let i = 0; i < maxPolls; i++) {
          const statusUrl = new URL(`${META_BASE_URL}/${input.videoId}`);
          statusUrl.searchParams.set("access_token", creds.accessToken);
          statusUrl.searchParams.set("fields", "id,status");
          const statusRes = await fetch(statusUrl.toString());
          const statusData = await statusRes.json() as Record<string, unknown>;
          const videoStatusObj = statusData?.status as { video_status?: string } | undefined;
          const videoStatus = videoStatusObj?.video_status;

          try {
            await db.insert(metaApiLogs).values({
              merchantId,
              launchJobId: jobId,
              stage: "media_readiness_poll",
              endpoint: input.videoId!,
              method: "GET",
              requestJson: { poll_attempt: i + 1, fields: "id,status" },
              responseJson: statusData,
              httpStatus: statusRes.status,
              success: statusRes.ok,
            });
          } catch (logErr) {
            console.warn("[SalesLaunch] Failed to write poll log:", logErr instanceof Error ? logErr.message : logErr);
          }

          if (videoStatus === "ready") {
            videoReady = true;
            break;
          }
          if (videoStatus === "error") {
            throw new Error("Video processing failed on Meta's side. Please try a different video.");
          }
          if (i < maxPolls - 1) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }
        }
        if (!videoReady) {
          throw new Error("Video processing timed out (2.5 minutes). The video may still be processing — try again in a few minutes.");
        }
        stages[stages.length - 1] = { stage: "media_readiness", status: "success", message: "Video is ready" };
        await persistStages(jobId, stages);
      } catch (pollErr: unknown) {
        const pollError = pollErr instanceof Error ? pollErr : new Error(String(pollErr));
        stages[stages.length - 1] = { stage: "media_readiness", status: "failed", message: pollError.message };
        await persistStages(jobId, stages, { status: "failed", errorMessage: pollError.message, errorSummary: "Video not ready" });
        return;
      }
    }

    const campaignPayload = sanitizePayload(buildCampaignPayload(input));
    const adsetPayloadPreview = sanitizePayload(buildAdSetPayload(input, "__PENDING__"));
    const creativePayload = sanitizePayload(buildCreativePayload(input));
    const adPayloadPreview = sanitizePayload(buildAdPayload(input, "__PENDING__", "__PREVIEW__"));

    const fullValidation = validateAllPayloads(campaignPayload, adsetPayloadPreview, creativePayload, adPayloadPreview, input);
    if (!fullValidation.valid) {
      const errMsg = `Payload validation failed: ${fullValidation.errors.join("; ")}`;
      console.error("[SalesLaunch] PRE-FLIGHT BLOCKED:", errMsg);
      stages.push({ stage: "campaign", status: "failed", message: errMsg });
      await persistStages(jobId, stages, { status: "failed", errorMessage: errMsg, errorSummary: "Payload validation failed" });
      return;
    }

    stages.push({ stage: "campaign", status: "running" });
    await persistStages(jobId, stages);
    console.log("[SalesLaunch] OUTGOING CAMPAIGN PAYLOAD:", JSON.stringify(campaignPayload, null, 2));
    const campaignResult = await loggedMetaPost(merchantId, jobId, "campaign", creds.accessToken, `${creds.adAccountId}/campaigns`, campaignPayload);
    const campaignId = campaignResult.id as string;
    stages[stages.length - 1] = { stage: "campaign", status: "success", data: { campaignId } };
    await persistStages(jobId, stages, { metaCampaignId: campaignId });

    stages.push({ stage: "adset", status: "running" });
    await persistStages(jobId, stages);
    const adsetPayload = sanitizePayload(buildAdSetPayload(input, campaignId));
    console.log("[SalesLaunch] OUTGOING ADSET PAYLOAD:", JSON.stringify(adsetPayload, null, 2));
    const adsetResult = await loggedMetaPost(merchantId, jobId, "adset", creds.accessToken, `${creds.adAccountId}/adsets`, adsetPayload);
    const adsetId = adsetResult.id as string;
    stages[stages.length - 1] = { stage: "adset", status: "success", data: { adsetId } };
    await persistStages(jobId, stages, { metaAdsetId: adsetId });

    stages.push({ stage: "creative", status: "running" });
    await persistStages(jobId, stages);
    console.log("[SalesLaunch] OUTGOING CREATIVE PAYLOAD:", JSON.stringify(creativePayload, null, 2));
    const creativeResult = await loggedMetaPost(merchantId, jobId, "creative", creds.accessToken, `${creds.adAccountId}/adcreatives`, creativePayload);
    const creativeId = creativeResult.id as string;
    stages[stages.length - 1] = { stage: "creative", status: "success", data: { creativeId } };
    await persistStages(jobId, stages, { metaCreativeId: creativeId });

    stages.push({ stage: "ad", status: "running" });
    await persistStages(jobId, stages);
    const adPayload = sanitizePayload(buildAdPayload(input, adsetId, creativeId));
    console.log("[SalesLaunch] OUTGOING AD PAYLOAD:", JSON.stringify(adPayload, null, 2));
    const adResult = await loggedMetaPost(merchantId, jobId, "ad", creds.accessToken, `${creds.adAccountId}/ads`, adPayload);
    const adId = adResult.id as string;
    stages[stages.length - 1] = { stage: "ad", status: "success", data: { adId } };
    await persistStages(jobId, stages, { metaAdId: adId });

    const finalStatus = input.publishMode === "PUBLISH" ? "launched" : "draft";

    if (input.publishMode === "PUBLISH") {
      stages.push({ stage: "publish", status: "running" });
      await persistStages(jobId, stages);
      try {
        await loggedMetaPost(merchantId, jobId, "publish_campaign", creds.accessToken, campaignId, { status: "ACTIVE" });
        await loggedMetaPost(merchantId, jobId, "publish_adset", creds.accessToken, adsetId, { status: "ACTIVE" });
        await loggedMetaPost(merchantId, jobId, "publish_ad", creds.accessToken, adId, { status: "ACTIVE" });
        stages[stages.length - 1] = { stage: "publish", status: "success" };
      } catch (pubErr: unknown) {
        const pubError = pubErr instanceof MetaApiError ? pubErr : pubErr instanceof Error ? pubErr : new Error(String(pubErr));
        stages[stages.length - 1] = { stage: "publish", status: "failed", message: `Created but failed to go live: ${pubError.message}` };
        await persistStages(jobId, stages, {
          status: "partial",
          metaAdId: adId,
          metaCreativeId: creativeId,
          errorMessage: `Publish failed: ${pubError.message}`,
          launchedAt: new Date(),
        });
        return;
      }
    }

    stages.push({ stage: "complete", status: "success", message: finalStatus === "launched" ? "Ad is live!" : "Ad created as draft (paused)." });
    await persistStages(jobId, stages, {
      status: finalStatus,
      metaAdId: adId,
      metaCreativeId: creativeId,
      launchedAt: new Date(),
    });

  } catch (caughtErr: unknown) {
    const error = caughtErr instanceof MetaApiError ? caughtErr : caughtErr instanceof Error ? caughtErr : new Error(String(caughtErr));
    const currentStage = stages[stages.length - 1]?.stage || "unknown";
    const errorData: Record<string, unknown> = {};
    if (error instanceof MetaApiError) {
      errorData.parsed = error.parsed;
      errorData.rawError = error.metaError;
    }
    stages[stages.length - 1] = { stage: currentStage, status: "failed", message: error.message, data: Object.keys(errorData).length > 0 ? errorData : undefined };

    await persistStages(jobId, stages, {
      status: "failed",
      errorMessage: error.message,
      errorSummary: `Failed at ${currentStage}: ${error.message}`,
    }).catch(() => {});
  }
}
