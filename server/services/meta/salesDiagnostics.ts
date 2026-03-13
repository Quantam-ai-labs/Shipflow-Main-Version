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

interface MetaGetResult {
  ok: boolean;
  data: Record<string, unknown>;
  status: number;
}

async function metaGet(accessToken: string, endpoint: string, params: Record<string, string> = {}, merchantId?: string): Promise<MetaGetResult> {
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

export async function checkTokenHealth(accessToken: string, merchantId?: string): Promise<DiagnosticCheck> {
  const result = await metaGet(accessToken, "me", { fields: "id,name" }, merchantId);
  if (result.ok) {
    return { name: "Token Health", status: "pass", message: `Authenticated as ${(result.data as Record<string, string>).name}` };
  }
  const errData = result.data as Record<string, Record<string, string>>;
  return { name: "Token Health", status: "fail", message: errData?.error?.message || "Token is invalid or expired" };
}

export interface AdAccountCheckResult {
  check: DiagnosticCheck;
  currency?: string;
}

export async function checkAdAccountAccess(accessToken: string, rawAdAccountId: string, merchantId?: string): Promise<AdAccountCheckResult> {
  const adAccountId = rawAdAccountId.startsWith("act_") ? rawAdAccountId : `act_${rawAdAccountId}`;
  const result = await metaGet(accessToken, adAccountId, { fields: "account_id,name,account_status,currency,timezone_name" }, merchantId);
  if (result.ok) {
    const statusMap: Record<number, string> = { 1: "ACTIVE", 2: "DISABLED", 3: "UNSETTLED", 7: "PENDING_RISK_REVIEW", 8: "PENDING_SETTLEMENT", 9: "IN_GRACE_PERIOD", 100: "PENDING_CLOSURE", 101: "CLOSED" };
    const data = result.data as Record<string, unknown>;
    const statusCode = data.account_status as number;
    const statusLabel = statusMap[statusCode] || `UNKNOWN(${statusCode})`;
    const currency = typeof data.currency === "string" ? data.currency : undefined;
    if (statusCode === 1) {
      return { check: { name: "Ad Account", status: "pass", message: `${data.name} (${statusLabel}, ${data.currency})` }, currency };
    }
    return { check: { name: "Ad Account", status: "fail", message: `Account status: ${statusLabel}. Must be ACTIVE to launch ads.` }, currency };
  }
  const errData = result.data as Record<string, Record<string, string>>;
  return { check: { name: "Ad Account", status: "fail", message: errData?.error?.message || "Cannot access ad account" } };
}

export async function checkPageAccess(accessToken: string, pageId: string, merchantId?: string): Promise<DiagnosticCheck> {
  if (!pageId) {
    return { name: "Facebook Page", status: "fail", message: "No Facebook Page selected" };
  }
  const result = await metaGet(accessToken, pageId, { fields: "id,name,is_published" }, merchantId);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    if (data.is_published === false) {
      return { name: "Facebook Page", status: "warn", message: `${data.name} is unpublished` };
    }
    return { name: "Facebook Page", status: "pass", message: String(data.name) };
  }
  const errData = result.data as Record<string, Record<string, string>>;
  return { name: "Facebook Page", status: "fail", message: errData?.error?.message || "Cannot access Facebook Page" };
}

export async function checkInstagramAccount(accessToken: string, pageId: string, merchantId?: string): Promise<DiagnosticCheck> {
  if (!pageId) {
    return { name: "Instagram Account", status: "skip", message: "No page selected" };
  }
  const result = await metaGet(accessToken, pageId, { fields: "instagram_business_account{id,name,username}" }, merchantId);
  if (result.ok) {
    const data = result.data as Record<string, Record<string, string>>;
    if (data?.instagram_business_account) {
      const ig = data.instagram_business_account;
      return { name: "Instagram Account", status: "pass", message: `@${ig.username || ig.name} linked` };
    }
  }
  return { name: "Instagram Account", status: "warn", message: "No Instagram Business account linked. Ads will run on Facebook only." };
}

export async function checkPixelHealth(accessToken: string, pixelId: string | null | undefined, merchantId?: string): Promise<DiagnosticCheck> {
  if (!pixelId) {
    return { name: "Pixel", status: "warn", message: "No pixel selected. Ads will optimize for LINK_CLICKS instead of conversions." };
  }
  const result = await metaGet(accessToken, pixelId, { fields: "id,name,last_fired_time" }, merchantId);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    let lastFired = "Never";
    if (data.last_fired_time) {
      try {
        const parsed = new Date(String(data.last_fired_time));
        lastFired = isNaN(parsed.getTime()) ? String(data.last_fired_time) : parsed.toISOString();
      } catch {
        lastFired = String(data.last_fired_time);
      }
    }
    return { name: "Pixel", status: "pass", message: `${data.name} (Last fired: ${lastFired})` };
  }
  return { name: "Pixel", status: "warn", message: "Pixel not accessible. Ads will use LINK_CLICKS optimization instead of conversions." };
}

interface PermissionEntry {
  permission: string;
  status: string;
}

export async function checkPermissions(accessToken: string, merchantId?: string): Promise<DiagnosticCheck> {
  const result = await metaGet(accessToken, "me/permissions", {}, merchantId);
  if (result.ok) {
    const data = result.data as { data?: PermissionEntry[] };
    const granted = (data.data || []).filter((p) => p.status === "granted").map((p) => p.permission);
    const required = ["ads_management", "ads_read", "pages_show_list", "pages_read_engagement"];
    const missing = required.filter(p => !granted.includes(p));
    if (missing.length === 0) {
      return { name: "Permissions", status: "pass", message: "All required permissions granted" };
    }
    return { name: "Permissions", status: "fail", message: `Missing permissions: ${missing.join(", ")}` };
  }
  return { name: "Permissions", status: "warn", message: "Could not verify permissions" };
}

export async function runDiagnostics(config: {
  accessToken: string;
  adAccountId: string;
  pageId: string;
  pixelId?: string | null;
  merchantId?: string;
}): Promise<DiagnosticsResult> {
  const mid = config.merchantId;
  const checks: DiagnosticCheck[] = [];

  const tokenCheck = await checkTokenHealth(config.accessToken, mid);
  checks.push(tokenCheck);
  if (tokenCheck.status === "fail") {
    return { passed: false, checks };
  }

  const adAccountResult = await checkAdAccountAccess(config.accessToken, config.adAccountId, mid);
  checks.push(adAccountResult.check);
  checks.push(await checkPageAccess(config.accessToken, config.pageId, mid));
  checks.push(await checkInstagramAccount(config.accessToken, config.pageId, mid));
  checks.push(await checkPixelHealth(config.accessToken, config.pixelId, mid));
  checks.push(await checkPermissions(config.accessToken, mid));

  const passed = checks.every(c => c.status !== "fail");
  return { passed, checks, adAccountCurrency: adAccountResult.currency };
}
