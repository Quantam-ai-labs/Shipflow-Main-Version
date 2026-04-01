import { createContext, useContext, useState, useMemo, useCallback } from "react";
import { DateRange } from "react-day-picker";
import { dateRangeToParams, getPresetByLabel, getPresetLabel } from "@/components/date-range-picker";
import { format, parse, subDays } from "date-fns";

const STORAGE_KEY = "shipflow-date-range";
const DEFAULT_PRESET = "Last 7 days";

function getDefaultRange(): DateRange {
  const preset = getPresetByLabel(DEFAULT_PRESET);
  return preset ? preset.getValue() : { from: subDays(new Date(), 7), to: new Date() };
}

interface DateRangeContextValue {
  dateRange: DateRange | undefined;
  setDateRange: (range: DateRange | undefined) => void;
  dateParams: { dateFrom?: string; dateTo?: string };
}

const DateRangeContext = createContext<DateRangeContextValue | null>(null);

function serializeRange(range: DateRange | undefined): string {
  if (!range?.from) return "";
  const from = format(range.from, "yyyy-MM-dd");
  const to = range.to ? format(range.to, "yyyy-MM-dd") : from;
  return `custom:${from}:${to}`;
}

function deserializeRange(stored: string): DateRange | undefined {
  if (!stored) return undefined;
  if (stored.startsWith("preset:")) {
    const label = stored.slice(7);
    // Migrate stale "Today" default to "Last 7 days" (one-time persisted migration)
    if (label === "Today") {
      try { localStorage.setItem(STORAGE_KEY, `preset:${DEFAULT_PRESET}`); } catch {}
      return getDefaultRange();
    }
    const preset = getPresetByLabel(label);
    if (preset) return preset.getValue();
    // Unknown preset — fall back to default
    return getDefaultRange();
  }
  if (stored.startsWith("custom:")) {
    const parts = stored.split(":");
    if (parts.length >= 3) {
      const from = parse(parts[1], "yyyy-MM-dd", new Date());
      const to = parse(parts[2], "yyyy-MM-dd", new Date());
      if (!isNaN(from.getTime()) && !isNaN(to.getTime())) {
        return { from, to };
      }
    }
  }
  return undefined;
}

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [dateRange, setDateRangeState] = useState<DateRange | undefined>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const deserialized = deserializeRange(stored);
        if (deserialized) return deserialized;
      }
    } catch {}
    return getDefaultRange();
  });

  const setDateRange = useCallback((range: DateRange | undefined) => {
    setDateRangeState(range);
    try {
      if (range?.from) {
        const presetName = getPresetLabel(range);
        if (presetName) {
          localStorage.setItem(STORAGE_KEY, `preset:${presetName}`);
        } else {
          localStorage.setItem(STORAGE_KEY, serializeRange(range));
        }
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  }, []);

  const dateParams = useMemo(() => dateRangeToParams(dateRange), [dateRange]);

  return (
    <DateRangeContext.Provider value={{ dateRange, setDateRange, dateParams }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const context = useContext(DateRangeContext);
  if (!context) {
    throw new Error("useDateRange must be used within a DateRangeProvider");
  }
  return context;
}
