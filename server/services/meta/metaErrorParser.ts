export interface ParsedMetaError {
  message: string;
  type: string;
  code: number;
  subcode: number;
  errorUserTitle: string;
  errorUserMsg: string;
  fbtraceId: string;
  fixSuggestion: string;
  isTransient: boolean;
}

const TRANSIENT_CODES = new Set([1, 2, 4, 17, 341, 368]);

const SUBCODE_FIXES: Record<number, string> = {
  100: "One or more parameters are invalid. Check the raw error for the specific field.",
  190: "The access token is invalid or expired. Reconnect your Meta account.",
  1487301: "The access token has expired. Reconnect your Meta account.",
  1487366: "Your ad account is disabled. Contact Meta support or use a different ad account.",
  1487390: "The ad account has reached its spending limit. Increase the limit in Facebook Business Settings.",
  1487534: "The selected Facebook Page is not published or not accessible. Verify page status.",
  1815684: "The image does not meet Meta's requirements. Check dimensions (min 600x600) and format.",
  2490487: "Bid strategy is missing or invalid. The system should auto-set LOWEST_COST_WITHOUT_CAP.",
};

const CODE_FIXES: Record<number, string> = {
  1: "Meta API is temporarily unavailable. Try again in a few minutes.",
  2: "Temporary Meta API issue. Try again shortly.",
  4: "API rate limit reached. Wait a minute and retry.",
  10: "Insufficient permissions. Ensure your Meta app has ads_management permission.",
  17: "API call limit reached. Wait before making more requests.",
  100: "Invalid parameter sent to Meta. Check the raw error details.",
  190: "Access token is invalid. Reconnect your Meta account in Settings.",
  200: "Missing permission for this action. Check your Meta app permissions.",
  341: "Temporary API throttle. Wait and retry.",
  368: "Temporary block due to excessive API calls. Wait a few minutes.",
};

const PATTERN_FIXES: Array<{ pattern: string; fix: string }> = [
  { pattern: "Cannot Use Ad Set Budget Sharing", fix: "CBO/ABO conflict — budget placement is incorrect. Do not send is_adset_budget_sharing_enabled." },
  { pattern: "instagram_actor_id", fix: "Instagram user ID (instagram_user_id) is invalid or should not be sent for this creative type." },
  { pattern: "instagram_user_id", fix: "Instagram user ID is invalid or should not be sent for this creative type." },
  { pattern: "object_story_spec.*object_story_id", fix: "Both object_story_spec and object_story_id were sent. Only one should be used." },
  { pattern: "Invalid parameter", fix: "A parameter in the request is invalid. Check the raw Meta error for the specific field name." },
  { pattern: "daily_budget.*too low", fix: "The daily budget is below Meta's minimum. Increase the budget amount." },
  { pattern: "billing_event", fix: "Billing event is missing or invalid. Must be IMPRESSIONS for most objectives." },
];

export function parseMetaError(error: Record<string, unknown> | null | undefined): ParsedMetaError {
  const metaError = (error?.error as Record<string, unknown>) || error || {};

  const code = (metaError?.code as number) ?? 0;
  const subcode = (metaError?.error_subcode as number) ?? 0;
  const message = (metaError?.message as string) || (error?.message as string) || "Unknown Meta API error";
  const type = (metaError?.type as string) || "UnknownError";
  const errorUserTitle = (metaError?.error_user_title as string) || "";
  const errorUserMsg = (metaError?.error_user_msg as string) || "";
  const fbtraceId = (metaError?.fbtrace_id as string) || "";
  const isTransient = TRANSIENT_CODES.has(code);

  let fixSuggestion = "";
  if (subcode && SUBCODE_FIXES[subcode]) {
    fixSuggestion = SUBCODE_FIXES[subcode];
  } else if (code && CODE_FIXES[code]) {
    fixSuggestion = CODE_FIXES[code];
  } else {
    for (const { pattern, fix } of PATTERN_FIXES) {
      if (new RegExp(pattern, "i").test(message)) {
        fixSuggestion = fix;
        break;
      }
    }
  }

  if (!fixSuggestion) {
    fixSuggestion = errorUserMsg || "Review the raw Meta error response for details.";
  }

  return { message, type, code, subcode, errorUserTitle, errorUserMsg, fbtraceId, fixSuggestion, isTransient };
}

export function formatMetaErrorForUser(parsed: ParsedMetaError): string {
  const parts = [parsed.message];
  if (parsed.errorUserTitle) parts.push(`(${parsed.errorUserTitle})`);
  if (parsed.fixSuggestion && parsed.fixSuggestion !== parsed.message) {
    parts.push(`— Fix: ${parsed.fixSuggestion}`);
  }
  return parts.join(" ");
}
