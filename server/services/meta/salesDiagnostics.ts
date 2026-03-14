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
    checks.push({ name: "Token Health", status: "pass", message: `Authenticated as ${(tokenResult.data as Record<string, string>).name}` });
  } else {
    const errMsg = (tokenResult.data as any)?.error?.message || "Token is invalid or expired";
    checks.push({ name: "Token Health", status: "fail", message: errMsg });
    return { passed: false, checks };
  }

  const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const acctResult = await metaGet(accessToken, actId, { fields: "account_id,name,account_status,currency,timezone_name" }, merchantId);
  if (acctResult.ok) {
    const data = acctResult.data as Record<string, unknown>;
    const statusCode = data.account_status as number;
    const statusLabel = AD_ACCOUNT_STATUS[statusCode] || `UNKNOWN(${statusCode})`;
    adAccountCurrency = typeof data.currency === "string" ? data.currency : undefined;

    if (statusCode === 1) {
      checks.push({ name: "Ad Account", status: "pass", message: `${data.name} (${statusLabel}, ${data.currency})` });
    } else {
      checks.push({ name: "Ad Account", status: "fail", message: `Account status: ${statusLabel}. Must be ACTIVE.` });
    }
  } else {
    checks.push({ name: "Ad Account", status: "fail", message: (acctResult.data as any)?.error?.message || "Cannot access ad account" });
  }

  if (pageId) {
    const pageResult = await metaGet(accessToken, pageId, { fields: "id,name,is_published" }, merchantId);
    if (pageResult.ok) {
      const data = pageResult.data as Record<string, unknown>;
      checks.push({
        name: "Facebook Page",
        status: data.is_published === false ? "warn" : "pass",
        message: data.is_published === false ? `${data.name} is unpublished` : String(data.name),
      });
    } else {
      checks.push({ name: "Facebook Page", status: "fail", message: (pageResult.data as any)?.error?.message || "Cannot access page" });
    }
  } else {
    checks.push({ name: "Facebook Page", status: "fail", message: "No Facebook Page selected" });
  }

  if (pageId) {
    const igResult = await metaGet(accessToken, pageId, { fields: "instagram_business_account{id,name,username}" }, merchantId);
    if (igResult.ok) {
      const igData = (igResult.data as any)?.instagram_business_account;
      if (igData) {
        checks.push({ name: "Instagram Account", status: "pass", message: `@${igData.username || igData.name} linked` });
      } else {
        checks.push({ name: "Instagram Account", status: "warn", message: "No Instagram Business account linked. Ads will run on Facebook only." });
      }
    } else {
      checks.push({ name: "Instagram Account", status: "warn", message: "No Instagram Business account linked." });
    }
  } else {
    checks.push({ name: "Instagram Account", status: "skip", message: "No page selected" });
  }

  if (pixelId) {
    const pixelResult = await metaGet(accessToken, pixelId, { fields: "id,name,last_fired_time" }, merchantId);
    if (pixelResult.ok) {
      const data = pixelResult.data as Record<string, unknown>;
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

  const permResult = await metaGet(accessToken, "me/permissions", {}, merchantId);
  if (permResult.ok) {
    const permData = permResult.data as { data?: Array<{ permission: string; status: string }> };
    const granted = (permData.data || []).filter(p => p.status === "granted").map(p => p.permission);
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
