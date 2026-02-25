const TIMEZONE_OFFSETS: Record<string, number> = {
  "Asia/Karachi": 5 * 60,
  "Asia/Kolkata": 5 * 60 + 30,
  "Asia/Dubai": 4 * 60,
  "Asia/Riyadh": 3 * 60,
  "Asia/Shanghai": 8 * 60,
  "Europe/London": 0,
  "America/New_York": -5 * 60,
  "America/Los_Angeles": -8 * 60,
  "UTC": 0,
};

function getOffsetMinutes(timezone: string): number {
  if (TIMEZONE_OFFSETS[timezone] !== undefined) {
    return TIMEZONE_OFFSETS[timezone];
  }
  try {
    const now = new Date();
    const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
    const tzStr = now.toLocaleString("en-US", { timeZone: timezone });
    const diffMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();
    return Math.round(diffMs / 60000);
  } catch {
    return 5 * 60;
  }
}

export function toMerchantStartOfDay(dateStr: string, timezone: string): string {
  const offsetMinutes = getOffsetMinutes(timezone);
  const [year, month, day] = dateStr.split("-").map(Number);
  const localMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  localMidnight.setUTCMinutes(localMidnight.getUTCMinutes() - offsetMinutes);
  return localMidnight.toISOString();
}

export function toMerchantEndOfDay(dateStr: string, timezone: string): string {
  const offsetMinutes = getOffsetMinutes(timezone);
  const [year, month, day] = dateStr.split("-").map(Number);
  const localEndOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  localEndOfDay.setUTCMinutes(localEndOfDay.getUTCMinutes() - offsetMinutes);
  return localEndOfDay.toISOString();
}

export const DEFAULT_TIMEZONE = "Asia/Karachi";
