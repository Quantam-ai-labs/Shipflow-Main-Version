export const DEFAULT_TIMEZONE = "Asia/Karachi";

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function getOffsetMinutes(timezone: string): number {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
  const now = new Date();
  const utcParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const tzParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const extract = (parts: Intl.DateTimeFormatPart[]) => {
    const get = (type: string) => {
      const val = parts.find((p) => p.type === type)?.value || "0";
      return parseInt(val, 10);
    };
    return new Date(
      Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"))
    );
  };

  const utcDate = extract(utcParts);
  const tzDate = extract(tzParts);
  return Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
}

function getOffsetMinutesForDate(dateUtc: Date, timezone: string): number {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
  const utcParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(dateUtc);

  const tzParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(dateUtc);

  const extract = (parts: Intl.DateTimeFormatPart[]) => {
    const get = (type: string) => {
      const val = parts.find((p) => p.type === type)?.value || "0";
      return parseInt(val, 10);
    };
    return new Date(
      Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"))
    );
  };

  const utcDate = extract(utcParts);
  const tzDate = extract(tzParts);
  return Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
}

export function toMerchantStartOfDay(dateStr: string, timezone: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const approxUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const offsetMinutes = getOffsetMinutesForDate(approxUtc, timezone);
  const localMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  localMidnight.setUTCMinutes(localMidnight.getUTCMinutes() - offsetMinutes);
  return localMidnight.toISOString();
}

export function toMerchantEndOfDay(dateStr: string, timezone: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const approxUtc = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  const offsetMinutes = getOffsetMinutesForDate(approxUtc, timezone);
  const localEndOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  localEndOfDay.setUTCMinutes(localEndOfDay.getUTCMinutes() - offsetMinutes);
  return localEndOfDay.toISOString();
}
