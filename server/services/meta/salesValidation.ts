import type { SalesLaunchInput } from "./salesPayloadBuilder";

export interface ValidationIssue {
  code: string;
  field: string;
  stage: "preflight" | "input" | "media" | "connection";
  message: string;
  fixSuggestion: string;
}

export function validateLaunchInput(input: SalesLaunchInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

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

  if (input.mode === "UPLOAD_IMAGE") {
    if (!input.imageHash) {
      issues.push({
        code: "MISSING_IMAGE_HASH",
        field: "imageHash",
        stage: "media",
        message: "Image must be uploaded before launch.",
        fixSuggestion: "Upload an image first.",
      });
    }
    if (!input.destinationUrl) {
      issues.push({
        code: "MISSING_URL",
        field: "destinationUrl",
        stage: "input",
        message: "Destination URL is required for image ads.",
        fixSuggestion: "Enter a website URL where users will be directed.",
      });
    }
    if (!input.primaryText) {
      issues.push({
        code: "MISSING_PRIMARY_TEXT",
        field: "primaryText",
        stage: "input",
        message: "Primary text is required for image ads.",
        fixSuggestion: "Add the main ad copy text.",
      });
    }
  }

  if (input.mode === "UPLOAD_VIDEO") {
    if (!input.videoId) {
      issues.push({
        code: "MISSING_VIDEO_ID",
        field: "videoId",
        stage: "media",
        message: "Video must be uploaded before launch.",
        fixSuggestion: "Upload a video first.",
      });
    }
    if (!input.destinationUrl) {
      issues.push({
        code: "MISSING_URL",
        field: "destinationUrl",
        stage: "input",
        message: "Destination URL is required for video ads.",
        fixSuggestion: "Enter a website URL where users will be directed.",
      });
    }
    if (!input.primaryText) {
      issues.push({
        code: "MISSING_PRIMARY_TEXT",
        field: "primaryText",
        stage: "input",
        message: "Primary text is required for video ads.",
        fixSuggestion: "Add the main ad copy text.",
      });
    }
  }

  if (input.mode === "EXISTING_POST") {
    if (!input.existingPostId) {
      issues.push({
        code: "MISSING_POST_ID",
        field: "existingPostId",
        stage: "media",
        message: "An existing post must be selected.",
        fixSuggestion: "Select a post from your Facebook Page.",
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

export function normalizeInput(raw: any): SalesLaunchInput {
  const trimOrNull = (val: any): string | null => {
    if (val === undefined || val === null) return null;
    const s = String(val).trim();
    return s === "" ? null : s;
  };

  const mode = raw.mode as SalesLaunchInput["mode"];

  const base: SalesLaunchInput = {
    adName: trimOrNull(raw.adName) || "",
    mode,
    adAccountId: trimOrNull(raw.adAccountId) || "",
    pageId: trimOrNull(raw.pageId) || "",
    pixelId: trimOrNull(raw.pixelId),
    dailyBudget: parseFloat(raw.dailyBudget) || 0,
    currency: trimOrNull(raw.currency) || "PKR",
    startMode: raw.startMode === "SCHEDULED" ? "SCHEDULED" : "NOW",
    startTime: trimOrNull(raw.startTime),
    publishMode: (["VALIDATE", "DRAFT", "PUBLISH"].includes(raw.publishMode) ? raw.publishMode : "VALIDATE") as SalesLaunchInput["publishMode"],
    imageHash: null,
    videoId: null,
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
    base.destinationUrl = trimOrNull(raw.destinationUrl);
    base.primaryText = trimOrNull(raw.primaryText);
    base.headline = trimOrNull(raw.headline);
    base.description = trimOrNull(raw.description);
    base.cta = trimOrNull(raw.cta) || "SHOP_NOW";
  } else if (mode === "UPLOAD_VIDEO") {
    base.videoId = trimOrNull(raw.videoId);
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
