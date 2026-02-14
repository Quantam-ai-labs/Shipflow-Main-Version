import { createContext, useContext, useState, useMemo, useEffect, useCallback } from "react";
import { DateRange } from "react-day-picker";
import { dateRangeToParams } from "@/components/date-range-picker";
import { format, parse } from "date-fns";

const STORAGE_KEY = "shipflow-date-range";

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
      return stored ? deserializeRange(stored) : undefined;
    } catch {
      return undefined;
    }
  });

  const setDateRange = useCallback((range: DateRange | undefined) => {
    setDateRangeState(range);
    try {
      if (range?.from) {
        localStorage.setItem(STORAGE_KEY, serializeRange(range));
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
