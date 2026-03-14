import { META_BASE_URL } from "../metaAds";
import { db } from "../../db";
import { metaApiLogs } from "@shared/schema";

export interface DiagnosticCheck {
  name: string;
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
}

export interface DiagnosticsResult {
  passed: boolean;
  checks: DiagnosticCheck[];
  adAccountCurrency?: string;
}

interface MetaErrorResponse {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
}

interface MetaIgAccount {
  id?: string;
  name?: string;
  username?: string;
}

async function metaGet(
  accessToken: string,
  endpoint: string,
  params: Record<string, string> = {},
  merchantId?: string
): Promise<{ ok: boolean; data: Record<string, unknown>; status: number }> {
  const url = new URL(`${META_BASE_URL}/${endpoint}`);
  url.searchParams.set("access_token", accessToken);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const response = await fetch(url.toString());
  const data = await response.json() as Record<string, unknown>;

  if (merchantId) {
    try {
      await db.insert(metaApiLogs).values({
        merchantId,
        stage: "diagnostics",
        endpoint,
        method: "GET",
        requestJson: params,
        responseJson: data,
        httpStatus: response.status,
        success: response.ok,
      });
    } catch (logErr) {
      console.warn("[Diagnostics] Failed to write API log:", logErr instanceof Error ? logErr.message : logErr);
    }
  }

  return { ok: response.ok, data, status: response.status };
}

function extractErrorMessage(data: Record<string, unknown>, fallback: string): string {
  const errResponse = data as MetaErrorResponse;
  return errResponse?.error?.message || fallback;
}

const AD_ACCOUNT_STATUS: Record<number, string> = {
  1: "ACTIVE",
  2: "DISABLED",
  3: "UNSETTLED",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT",
  9: "IN_GRACE_PERIOD",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
};

export async function runDiagnostics(config: {
  accessToken: string;
  adAccountId: string;
  pageId: string;
  pixelId?: string | null;
  merchantId?: string;
}): Promise<DiagnosticsResult> {
  const { accessToken, adAccountId, pageId, pixelId, merchantId } = config;
  const checks: DiagnosticCheck[] = [];
  let adAccountCurrency: string | undefined;

  const tokenResult = await metaGet(accessToken, "me", { fields: "id,name" }, merchantId);
  if (tokenResult.ok) {
    const name = tokenResult.data.name as string | undefined;
    checks.push({ name: "Token Health", status: "pass", message: `Authenticated as ${name || "unknown"}` });
  } else {
    const errMsg = extractErrorMessage(tokenResult.data, "Token is invalid or expired");
    checks.push({ name: "Token Health", status: "fail", message: errMsg });
    return { passed: false, checks };
  }

  const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const acctResult = await metaGet(accessToken, actId, { fields: "account_id,name,account_status,currency,timezone_name" }, merchantId);
  if (acctResult.ok) {
    const data = acctResult.data;
    const statusCode = data.account_status as number;
    const statusLabel = AD_ACCOUNT_STATUS[statusCode] || `UNKNOWN(${statusCode})`;
    adAccountCurrency = typeof data.currency === "string" ? data.currency : undefined;

    if (statusCode === 1) {
      checks.push({ name: "Ad Account", status: "pass", message: `${data.name} (${statusLabel}, ${data.currency})` });
    } else {
      checks.push({ name: "Ad Account", status: "fail", message: `Account status: ${statusLabel}. Must be ACTIVE.` });
    }
  } else {
    checks.push({ name: "Ad Account", status: "fail", message: extractErrorMessage(acctResult.data, "Cannot access ad account") });
  }

  if (pageId) {
    const pageResult = await metaGet(accessToken, pageId, { fields: "id,name,is_published" }, merchantId);
    if (pageResult.ok) {
      const data = pageResult.data;
      checks.push({
        name: "Facebook Page",
        status: data.is_published === false ? "warn" : "pass",
        message: data.is_published === false ? `${data.name} is unpublished` : String(data.name),
      });
    } else {
      checks.push({ name: "Facebook Page", status: "fail", message: extractErrorMessage(pageResult.data, "Cannot access page") });
    }
  } else {
    checks.push({ name: "Facebook Page", status: "fail", message: "No Facebook Page selected" });
  }

  const adActIgResult = await metaGet(accessToken, `${actId}/instagram_accounts`, { fields: "id,username" }, merchantId);
  if (adActIgResult.ok) {
    const adActIgList = adActIgResult.data.data as Array<{ id: string; username?: string }> | undefined;
    if (adActIgList && adActIgList.length > 0) {
      const firstIg = adActIgList[0];
      checks.push({ name: "Instagram Account (Ad Account)", status: "pass", message: `@${firstIg.username || firstIg.id} linked to ad account` });
    } else {
      checks.push({ name: "Instagram Account (Ad Account)", status: "warn", message: "No Instagram account linked to ad account. Instagram post ads may fail — link your IG account in Meta Business Settings > Ad Accounts." });
    }
  } else {
    checks.push({ name: "Instagram Account (Ad Account)", status: "warn", message: "Could not check ad account Instagram accounts." });
  }

  if (pageId) {
    const igResult = await metaGet(accessToken, pageId, { fields: "instagram_business_account{id,name,username}" }, merchantId);
    if (igResult.ok) {
      const igData = igResult.data.instagram_business_account as MetaIgAccount | undefined;
      if (igData) {
        checks.push({ name: "Instagram Account (Page)", status: "pass", message: `@${igData.username || igData.name} linked to page` });
      } else {
        checks.push({ name: "Instagram Account (Page)", status: "warn", message: "No Instagram Business account linked to page. Ads will run on Facebook only." });
      }
    } else {
      checks.push({ name: "Instagram Account (Page)", status: "warn", message: "No Instagram Business account linked to page." });
    }
  } else {
    checks.push({ name: "Instagram Account (Page)", status: "skip", message: "No page selected" });
  }

  if (pixelId) {
    const pixelResult = await metaGet(accessToken, pixelId, { fields: "id,name,last_fired_time" }, merchantId);
    if (pixelResult.ok) {
      const data = pixelResult.data;
      let lastFired = "Never";
      if (data.last_fired_time) {
        try {
          const parsed = new Date(String(data.last_fired_time));
          lastFired = isNaN(parsed.getTime()) ? String(data.last_fired_time) : parsed.toISOString();
        } catch {
          lastFired = String(data.last_fired_time);
        }
      }
      checks.push({ name: "Pixel", status: "pass", message: `${data.name} (Last fired: ${lastFired})` });
    } else {
      checks.push({ name: "Pixel", status: "warn", message: "Pixel not accessible. Ads will use LINK_CLICKS optimization." });
    }
  } else {
    checks.push({ name: "Pixel", status: "warn", message: "No pixel selected. Ads will optimize for LINK_CLICKS." });
  }

  const fundingResult = await metaGet(accessToken, `${actId}/adspaymentcycle`, { fields: "data" }, merchantId);
  if (fundingResult.ok) {
    checks.push({ name: "Payment Method", status: "pass", message: "Payment method is configured" });
  } else {
    const fundingSourceResult = await metaGet(accessToken, `${actId}`, { fields: "funding_source_details" }, merchantId);
    if (fundingSourceResult.ok && fundingSourceResult.data.funding_source_details) {
      checks.push({ name: "Payment Method", status: "pass", message: "Payment method is configured" });
    } else {
      checks.push({ name: "Payment Method", status: "warn", message: "No payment method detected. Add a payment method in Meta Business Settings to run ads." });
    }
  }

  const permResult = await metaGet(accessToken, "me/permissions", {}, merchantId);
  if (permResult.ok) {
    const permList = permResult.data.data as Array<{ permission: string; status: string }> | undefined;
    const granted = (permList || []).filter(p => p.status === "granted").map(p => p.permission);
    const required = ["ads_management", "ads_read", "pages_show_list", "pages_read_engagement"];
    const missing = required.filter(p => !granted.includes(p));
    if (missing.length === 0) {
      checks.push({ name: "Permissions", status: "pass", message: "All required permissions granted" });
    } else {
      checks.push({ name: "Permissions", status: "fail", message: `Missing: ${missing.join(", ")}` });
    }
  } else {
    checks.push({ name: "Permissions", status: "warn", message: "Could not verify permissions" });
  }

  const passed = checks.every(c => c.status !== "fail");
  return { passed, checks, adAccountCurrency };
}
