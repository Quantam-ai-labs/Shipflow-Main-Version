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
}

async function metaGet(accessToken: string, endpoint: string, params: Record<string, string> = {}, merchantId?: string): Promise<{ ok: boolean; data: any; status: number }> {
  const url = new URL(`${META_BASE_URL}/${endpoint}`);
  url.searchParams.set("access_token", accessToken);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const response = await fetch(url.toString());
  const data = await response.json();

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
    } catch {}
  }

  return { ok: response.ok, data, status: response.status };
}

export async function runDiagnostics(config: {
  accessToken: string;
  adAccountId: string;
  pageId: string;
  pixelId?: string | null;
  merchantId?: string;
}): Promise<DiagnosticsResult> {
  const checks: DiagnosticCheck[] = [];

  const mid = config.merchantId;

  const tokenResult = await metaGet(config.accessToken, "me", { fields: "id,name" }, mid);
  if (tokenResult.ok) {
    checks.push({ name: "Token Health", status: "pass", message: `Authenticated as ${tokenResult.data.name}` });
  } else {
    checks.push({ name: "Token Health", status: "fail", message: tokenResult.data?.error?.message || "Token is invalid or expired" });
    return { passed: false, checks };
  }

  const adAccountId = config.adAccountId.startsWith("act_") ? config.adAccountId : `act_${config.adAccountId}`;
  const accountResult = await metaGet(config.accessToken, adAccountId, { fields: "account_id,name,account_status,currency,timezone_name" }, mid);
  if (accountResult.ok) {
    const statusMap: Record<number, string> = { 1: "ACTIVE", 2: "DISABLED", 3: "UNSETTLED", 7: "PENDING_RISK_REVIEW", 8: "PENDING_SETTLEMENT", 9: "IN_GRACE_PERIOD", 100: "PENDING_CLOSURE", 101: "CLOSED" };
    const statusCode = accountResult.data.account_status;
    const statusLabel = statusMap[statusCode] || `UNKNOWN(${statusCode})`;
    if (statusCode === 1) {
      checks.push({ name: "Ad Account", status: "pass", message: `${accountResult.data.name} (${statusLabel}, ${accountResult.data.currency})` });
    } else {
      checks.push({ name: "Ad Account", status: "fail", message: `Account status: ${statusLabel}. Must be ACTIVE to launch ads.` });
    }
  } else {
    checks.push({ name: "Ad Account", status: "fail", message: accountResult.data?.error?.message || "Cannot access ad account" });
  }

  if (config.pageId) {
    const pageResult = await metaGet(config.accessToken, config.pageId, { fields: "id,name,is_published" }, mid);
    if (pageResult.ok) {
      if (pageResult.data.is_published === false) {
        checks.push({ name: "Facebook Page", status: "warn", message: `${pageResult.data.name} is unpublished` });
      } else {
        checks.push({ name: "Facebook Page", status: "pass", message: pageResult.data.name });
      }
    } else {
      checks.push({ name: "Facebook Page", status: "fail", message: pageResult.data?.error?.message || "Cannot access Facebook Page" });
    }
  } else {
    checks.push({ name: "Facebook Page", status: "fail", message: "No Facebook Page selected" });
  }

  if (config.pageId) {
    const igResult = await metaGet(config.accessToken, config.pageId, { fields: "instagram_business_account{id,name,username}" }, mid);
    if (igResult.ok && igResult.data?.instagram_business_account) {
      const ig = igResult.data.instagram_business_account;
      checks.push({ name: "Instagram Account", status: "pass", message: `@${ig.username || ig.name} linked` });
    } else {
      checks.push({ name: "Instagram Account", status: "warn", message: "No Instagram Business account linked. Ads will run on Facebook only." });
    }
  }

  if (config.pixelId) {
    const pixelResult = await metaGet(config.accessToken, config.pixelId, { fields: "id,name,last_fired_time" }, mid);
    if (pixelResult.ok) {
      const lastFired = pixelResult.data.last_fired_time ? new Date(pixelResult.data.last_fired_time * 1000).toISOString() : "Never";
      checks.push({ name: "Pixel", status: "pass", message: `${pixelResult.data.name} (Last fired: ${lastFired})` });
    } else {
      checks.push({ name: "Pixel", status: "warn", message: "Pixel not accessible. Ads will use LINK_CLICKS optimization instead of conversions." });
    }
  } else {
    checks.push({ name: "Pixel", status: "warn", message: "No pixel selected. Ads will optimize for LINK_CLICKS instead of conversions." });
  }

  const permResult = await metaGet(config.accessToken, "me/permissions", {}, mid);
  if (permResult.ok) {
    const granted = (permResult.data.data || []).filter((p: any) => p.status === "granted").map((p: any) => p.permission);
    const required = ["ads_management", "ads_read", "pages_show_list", "pages_read_engagement"];
    const missing = required.filter(p => !granted.includes(p));
    if (missing.length === 0) {
      checks.push({ name: "Permissions", status: "pass", message: "All required permissions granted" });
    } else {
      checks.push({ name: "Permissions", status: "fail", message: `Missing permissions: ${missing.join(", ")}` });
    }
  } else {
    checks.push({ name: "Permissions", status: "warn", message: "Could not verify permissions" });
  }

  const passed = checks.every(c => c.status !== "fail");
  return { passed, checks };
}
