import { db } from "../../db";
import { adLaunchJobs, metaApiLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getCredentialsForMerchant, META_BASE_URL } from "../metaAds";
import { runDiagnostics } from "./salesDiagnostics";
import { normalizeInput, validateLaunchInput, type ValidationIssue } from "./salesValidation";
import {
  buildSalesCampaignPayload,
  buildSalesAdSetPayload,
  buildImageSalesCreativePayload,
  buildVideoSalesCreativePayload,
  buildExistingPostSalesCreativePayload,
  buildSalesAdPayload,
  type SalesLaunchInput,
} from "./salesPayloadBuilder";
import { parseMetaError, formatMetaErrorForUser } from "./metaErrorParser";

export interface LaunchStage {
  stage: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  message?: string;
  data?: any;
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
  rawError?: any;
}

function sanitizeForLog(body: Record<string, any>): Record<string, any> {
  const safe: Record<string, any> = {};
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
  body: Record<string, any>,
  maxRetries = 1
): Promise<any> {
  const url = `${META_BASE_URL}/${endpoint}`;
  const formData = new URLSearchParams();
  formData.set("access_token", accessToken);
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null) {
      formData.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
  }

  let lastError: any = null;
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

    const data = await response.json();
    const fbtraceId = data?.error?.fbtrace_id || response.headers?.get("x-fb-trace-id") || null;

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

    const errCode = data?.error?.code;
    lastError = data;

    if (TRANSIENT_ERROR_CODES.includes(errCode) && attempt < maxRetries) {
      continue;
    }

    const parsed = parseMetaError(data);
    const err = new Error(formatMetaErrorForUser(parsed));
    (err as any).metaError = data;
    (err as any).parsed = parsed;
    throw err;
  }

  const parsed = parseMetaError(lastError);
  const err = new Error(formatMetaErrorForUser(parsed));
  (err as any).metaError = lastError;
  (err as any).parsed = parsed;
  throw err;
}

async function updateJobStage(jobId: string, stage: string, updates: Record<string, any> = {}) {
  await db.update(adLaunchJobs)
    .set({ currentStage: stage, ...updates })
    .where(eq(adLaunchJobs.id, jobId));
}

export async function executeSalesLaunch(
  merchantId: string,
  rawInput: any
): Promise<LaunchResult> {
  const stages: LaunchStage[] = [];
  let jobId = "";

  try {
    stages.push({ stage: "normalize", status: "running" });
    const input = normalizeInput(rawInput);
    stages[stages.length - 1] = { stage: "normalize", status: "success" };

    const [job] = await db.insert(adLaunchJobs).values({
      merchantId,
      status: "pending",
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
      normalizedInput: input as any,
      currentStage: "normalize",
    }).returning();
    jobId = job.id;

    stages.push({ stage: "validate", status: "running" });
    const issues = validateLaunchInput(input);
    await updateJobStage(jobId, "validate", { validationStatus: issues as any });

    if (issues.length > 0) {
      stages[stages.length - 1] = { stage: "validate", status: "failed", message: `${issues.length} validation issue(s)`, data: issues };
      await updateJobStage(jobId, "validate", { status: "failed", errorMessage: issues.map(i => i.message).join("; "), errorSummary: "Validation failed" });
      return { success: false, jobId, stages, validationIssues: issues, error: "Validation failed", errorStage: "validate" };
    }
    stages[stages.length - 1] = { stage: "validate", status: "success" };

    if (input.publishMode === "VALIDATE") {
      await updateJobStage(jobId, "complete", { status: "validated" });
      stages.push({ stage: "complete", status: "success", message: "Validation passed. No objects created." });
      return { success: true, jobId, stages };
    }

    stages.push({ stage: "diagnostics", status: "running" });
    const creds = await getCredentialsForMerchant(merchantId);
    const diagnostics = await runDiagnostics({
      accessToken: creds.accessToken,
      adAccountId: creds.adAccountId,
      pageId: input.pageId,
      pixelId: input.pixelId,
    });

    if (!diagnostics.passed) {
      const failedChecks = diagnostics.checks.filter(c => c.status === "fail");
      const msg = failedChecks.map(c => `${c.name}: ${c.message}`).join("; ");
      stages[stages.length - 1] = { stage: "diagnostics", status: "failed", message: msg, data: diagnostics.checks };
      await updateJobStage(jobId, "diagnostics", { status: "failed", errorMessage: msg, errorSummary: "Diagnostics failed" });
      return { success: false, jobId, stages, error: msg, errorStage: "diagnostics" };
    }
    stages[stages.length - 1] = { stage: "diagnostics", status: "success", data: diagnostics.checks };

    await updateJobStage(jobId, "campaign", { status: "launching" });
    stages.push({ stage: "campaign", status: "running" });
    const campaignPayload = buildSalesCampaignPayload(input);
    const campaignResult = await loggedMetaPost(merchantId, jobId, "campaign", creds.accessToken, `${creds.adAccountId}/campaigns`, campaignPayload);
    const campaignId = campaignResult.id;
    stages[stages.length - 1] = { stage: "campaign", status: "success", data: { campaignId } };
    await updateJobStage(jobId, "campaign", { metaCampaignId: campaignId });

    stages.push({ stage: "adset", status: "running" });
    const adsetPayload = buildSalesAdSetPayload(input, campaignId);
    const adsetResult = await loggedMetaPost(merchantId, jobId, "adset", creds.accessToken, `${creds.adAccountId}/adsets`, adsetPayload);
    const adsetId = adsetResult.id;
    stages[stages.length - 1] = { stage: "adset", status: "success", data: { adsetId } };
    await updateJobStage(jobId, "adset", { metaAdsetId: adsetId });

    stages.push({ stage: "creative", status: "running" });
    let creativePayload: Record<string, any>;
    if (input.mode === "UPLOAD_IMAGE") {
      creativePayload = buildImageSalesCreativePayload(input);
    } else if (input.mode === "UPLOAD_VIDEO") {
      creativePayload = buildVideoSalesCreativePayload(input);
    } else {
      creativePayload = buildExistingPostSalesCreativePayload(input);
    }
    const creativeResult = await loggedMetaPost(merchantId, jobId, "creative", creds.accessToken, `${creds.adAccountId}/adcreatives`, creativePayload);
    const creativeId = creativeResult.id;
    stages[stages.length - 1] = { stage: "creative", status: "success", data: { creativeId } };
    await updateJobStage(jobId, "creative", { metaCreativeId: creativeId });

    stages.push({ stage: "ad", status: "running" });
    const adPayload = buildSalesAdPayload(input, adsetId, creativeId);
    const adResult = await loggedMetaPost(merchantId, jobId, "ad", creds.accessToken, `${creds.adAccountId}/ads`, adPayload);
    const adId = adResult.id;
    stages[stages.length - 1] = { stage: "ad", status: "success", data: { adId } };

    const finalStatus = input.publishMode === "PUBLISH" ? "launched" : "draft";

    if (input.publishMode === "PUBLISH") {
      stages.push({ stage: "publish", status: "running" });
      try {
        await loggedMetaPost(merchantId, jobId, "publish_campaign", creds.accessToken, campaignId, { status: "ACTIVE" });
        await loggedMetaPost(merchantId, jobId, "publish_adset", creds.accessToken, adsetId, { status: "ACTIVE" });
        await loggedMetaPost(merchantId, jobId, "publish_ad", creds.accessToken, adId, { status: "ACTIVE" });
        stages[stages.length - 1] = { stage: "publish", status: "success" };
      } catch (pubErr: any) {
        stages[stages.length - 1] = { stage: "publish", status: "failed", message: `Created but failed to go live: ${pubErr.message}` };
        await updateJobStage(jobId, "publish", {
          status: "partial",
          metaAdId: adId,
          metaCreativeId: creativeId,
          errorMessage: `Publish failed: ${pubErr.message}`,
          resultJson: { campaignId, adsetId, creativeId, adId },
          launchedAt: new Date(),
        });
        return {
          success: false, jobId, stages, campaignId, adsetId, creativeId, adId,
          error: `Objects created but publish failed: ${pubErr.message}`, errorStage: "publish",
          rawError: (pubErr as any).metaError,
        };
      }
    }

    await updateJobStage(jobId, "complete", {
      status: finalStatus,
      metaAdId: adId,
      metaCreativeId: creativeId,
      resultJson: { campaignId, adsetId, creativeId, adId },
      launchedAt: new Date(),
    });

    stages.push({ stage: "complete", status: "success", message: finalStatus === "launched" ? "Ad is live!" : "Ad created as draft (paused)." });

    return { success: true, jobId, stages, campaignId, adsetId, creativeId, adId };

  } catch (err: any) {
    const currentStage = stages[stages.length - 1]?.stage || "unknown";
    stages[stages.length - 1] = { stage: currentStage, status: "failed", message: err.message, data: (err as any).parsed || null };

    if (jobId) {
      await updateJobStage(jobId, currentStage, {
        status: "failed",
        errorMessage: err.message,
        errorSummary: `Failed at ${currentStage}: ${err.message}`,
      }).catch(() => {});
    }

    return {
      success: false, jobId, stages,
      error: err.message, errorStage: currentStage,
      rawError: (err as any).metaError || null,
    };
  }
}
