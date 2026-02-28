import { format } from "date-fns";

function toDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

export function formatPkDate(d: Date | string | null | undefined): string {
  const date = toDate(d);
  if (!date) return "-";
  return format(date, "dd-MM-yyyy");
}

export function formatPkDateTime(d: Date | string | null | undefined): string {
  const date = toDate(d);
  if (!date) return "-";
  return format(date, "dd-MM-yyyy h:mm a");
}

export function formatPkDateTime24(d: Date | string | null | undefined): string {
  const date = toDate(d);
  if (!date) return "-";
  return format(date, "dd-MM-yyyy HH:mm");
}

export function formatPkShortDate(d: Date | string | null | undefined): string {
  const date = toDate(d);
  if (!date) return "-";
  return format(date, "dd MMM yyyy");
}

export function formatPkMonthYear(d: Date | string | null | undefined): string {
  const date = toDate(d);
  if (!date) return "-";
  return format(date, "MMM yyyy");
}
