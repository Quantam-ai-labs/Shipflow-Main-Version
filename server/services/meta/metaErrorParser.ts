export interface ParsedMetaError {
  message: string;
  type: string;
  code: number;
  subcode: number;
  errorUserTitle: string;
  errorUserMsg: string;
  fbtraceId: string;
  fixSuggestion: string;
}

const SUBCODE_FIXES: Record<number, string> = {
  1487390: "The ad account has reached its spending limit. Increase the limit in Facebook Business Settings.",
  1487301: "The access token has expired. Reconnect your Meta account.",
  2490487: "Bid strategy is missing or invalid. The system should auto-set LOWEST_COST_WITHOUT_CAP.",
  1815684: "The image used does not meet Meta's requirements. Check dimensions (min 600x600) and format.",
  1487534: "The selected Facebook Page is not published or not accessible. Verify page status.",
  1487366: "Your ad account is disabled. Contact Meta support or use a different ad account.",
  100: "One or more parameters are invalid. Check the raw error for the specific field.",
  190: "The access token is invalid or expired. Reconnect your Meta account.",
  368: "API rate limit reached. Wait a few minutes and try again.",
  10: "Insufficient permissions. Ensure your Meta app has ads_management permission.",
};

const CODE_FIXES: Record<number, string> = {
  1: "Meta API is temporarily unavailable. Try again in a few minutes.",
  2: "Temporary Meta API issue. Try again shortly.",
  4: "API rate limit reached. Wait a minute and retry.",
  17: "API call limit reached. Wait before making more requests.",
  100: "Invalid parameter sent to Meta. Check the raw error details.",
  190: "Access token is invalid. Reconnect your Meta account in Settings.",
  200: "Missing permission for this action. Check your Meta app permissions.",
  341: "Temporary API throttle. Wait and retry.",
  368: "Temporary block due to excessive API calls. Wait a few minutes.",
};

export function parseMetaError(error: any): ParsedMetaError {
  const metaError = error?.error || error;

  const code = metaError?.code ?? 0;
  const subcode = metaError?.error_subcode ?? 0;
  const message = metaError?.message || error?.message || "Unknown Meta API error";
  const type = metaError?.type || "UnknownError";
  const errorUserTitle = metaError?.error_user_title || "";
  const errorUserMsg = metaError?.error_user_msg || "";
  const fbtraceId = metaError?.fbtrace_id || "";

  let fixSuggestion = "";
  if (subcode && SUBCODE_FIXES[subcode]) {
    fixSuggestion = SUBCODE_FIXES[subcode];
  } else if (code && CODE_FIXES[code]) {
    fixSuggestion = CODE_FIXES[code];
  } else if (message.includes("instagram_actor_id")) {
    fixSuggestion = "Instagram actor ID is invalid. The system should not send this field for existing post ads.";
  } else if (message.includes("object_story_spec") && message.includes("object_story_id")) {
    fixSuggestion = "Both object_story_spec and object_story_id were sent. Only one should be used per creative mode.";
  } else if (message.includes("Invalid parameter")) {
    fixSuggestion = "A parameter in the request is invalid. Check the raw Meta error for the specific field name.";
  } else if (errorUserMsg) {
    fixSuggestion = errorUserMsg;
  } else {
    fixSuggestion = "Review the raw Meta error response for details.";
  }

  return {
    message,
    type,
    code,
    subcode,
    errorUserTitle,
    errorUserMsg,
    fbtraceId,
    fixSuggestion,
  };
}

export function formatMetaErrorForUser(parsed: ParsedMetaError): string {
  const parts = [parsed.message];
  if (parsed.errorUserTitle) parts.push(`(${parsed.errorUserTitle})`);
  if (parsed.fixSuggestion && parsed.fixSuggestion !== parsed.message) {
    parts.push(`— Fix: ${parsed.fixSuggestion}`);
  }
  return parts.join(" ");
}
