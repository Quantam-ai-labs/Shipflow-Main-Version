import { useState, useRef } from "react";
import {
  format,
  subDays,
  subMonths,
  subYears,
  startOfWeek,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  endOfWeek,
  endOfMonth,
  endOfQuarter,
  endOfYear,
} from "date-fns";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  className?: string;
  align?: "start" | "center" | "end";
}

type ViewMode = "presets" | "calendar";

const presets = [
  {
    label: "Last 7 days",
    getValue: () => ({ from: subDays(new Date(), 6), to: new Date() }),
  },
  {
    label: "Last 30 days",
    getValue: () => ({ from: subDays(new Date(), 29), to: new Date() }),
  },
  {
    label: "Last 90 days",
    getValue: () => ({ from: subDays(new Date(), 89), to: new Date() }),
  },
  {
    label: "Last 365 days",
    getValue: () => ({ from: subDays(new Date(), 364), to: new Date() }),
  },
  {
    label: "Last 12 months",
    getValue: () => ({ from: subMonths(new Date(), 12), to: new Date() }),
  },
  { divider: true, label: "divider-1", getValue: () => ({ from: new Date(), to: new Date() }) },
  {
    label: "Last week",
    getValue: () => {
      const lastWeekStart = startOfWeek(subDays(new Date(), 7), { weekStartsOn: 1 });
      const lastWeekEnd = endOfWeek(subDays(new Date(), 7), { weekStartsOn: 1 });
      return { from: lastWeekStart, to: lastWeekEnd };
    },
  },
  {
    label: "Last month",
    getValue: () => {
      const lm = subMonths(new Date(), 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    },
  },
  {
    label: "Last quarter",
    getValue: () => {
      const lq = subMonths(new Date(), 3);
      return { from: startOfQuarter(lq), to: endOfQuarter(lq) };
    },
  },
  {
    label: "Last year",
    getValue: () => {
      const ly = subYears(new Date(), 1);
      return { from: startOfYear(ly), to: endOfYear(ly) };
    },
  },
  { divider: true, label: "divider-2", getValue: () => ({ from: new Date(), to: new Date() }) },
  {
    label: "Week to date",
    getValue: () => ({
      from: startOfWeek(new Date(), { weekStartsOn: 1 }),
      to: new Date(),
    }),
  },
  {
    label: "Month to date",
    getValue: () => ({
      from: startOfMonth(new Date()),
      to: new Date(),
    }),
  },
  {
    label: "Quarter to date",
    getValue: () => ({
      from: startOfQuarter(new Date()),
      to: new Date(),
    }),
  },
  {
    label: "Year to date",
    getValue: () => ({
      from: startOfYear(new Date()),
      to: new Date(),
    }),
  },
];

function getPresetLabel(dateRange: DateRange | undefined): string | null {
  if (!dateRange?.from || !dateRange?.to) return null;
  const from = dateRange.from;
  const to = dateRange.to;
  for (const preset of presets) {
    if ('divider' in preset && preset.divider) continue;
    const val = preset.getValue();
    if (
      format(val.from, "yyyy-MM-dd") === format(from, "yyyy-MM-dd") &&
      format(val.to, "yyyy-MM-dd") === format(to, "yyyy-MM-dd")
    ) {
      return preset.label;
    }
  }
  return null;
}

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
  className,
  align = "end",
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("presets");
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(undefined);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setView("presets");
      setPendingRange(dateRange);
      setActivePreset(getPresetLabel(dateRange));
    }
  };

  const handlePreset = (preset: (typeof presets)[number]) => {
    if ('divider' in preset && preset.divider) return;
    const val = preset.getValue();
    onDateRangeChange(val);
    setActivePreset(preset.label);
    setOpen(false);
  };

  const handleClear = () => {
    onDateRangeChange(undefined);
    setActivePreset(null);
    setOpen(false);
  };

  const handleCustomClick = () => {
    setPendingRange(dateRange);
    setView("calendar");
  };

  const handleCalendarApply = () => {
    if (pendingRange?.from) {
      onDateRangeChange({
        from: pendingRange.from,
        to: pendingRange.to || pendingRange.from,
      });
    }
    setActivePreset(null);
    setOpen(false);
  };

  const handleCalendarCancel = () => {
    setView("presets");
  };

  const triggerLabel = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, "MM/dd/yyyy")} - ${format(dateRange.to, "MM/dd/yyyy")}`
      : format(dateRange.from, "MM/dd/yyyy")
    : "All dates";

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "justify-between text-left font-normal gap-2",
            !dateRange && "text-muted-foreground",
            className
          )}
          data-testid="button-date-range-picker"
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs">{triggerLabel}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align={align}
        sideOffset={4}
      >
        {view === "presets" ? (
          <div className="w-[180px]">
            <div className="max-h-[360px] overflow-y-auto py-1">
              <button
                className={cn(
                  "w-full text-left px-3 py-1.5 text-sm hover-elevate transition-colors",
                  !dateRange && "font-medium bg-accent/50"
                )}
                onClick={handleClear}
                data-testid="button-date-preset-all"
              >
                All dates
              </button>
              {presets.map((preset) => {
                if ('divider' in preset && preset.divider) {
                  return <div key={preset.label} className="my-1 border-t" />;
                }
                return (
                  <button
                    key={preset.label}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm hover-elevate transition-colors",
                      activePreset === preset.label && "font-medium bg-accent/50"
                    )}
                    onClick={() => handlePreset(preset)}
                    data-testid={`button-date-preset-${preset.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {preset.label}
                  </button>
                );
              })}
              <div className="my-1 border-t" />
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover-elevate transition-colors"
                onClick={handleCustomClick}
                data-testid="button-date-custom"
              >
                Custom range...
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3">
            <Calendar
              mode="range"
              defaultMonth={pendingRange?.from || new Date()}
              selected={pendingRange}
              onSelect={setPendingRange}
              numberOfMonths={2}
            />
            <div className="flex items-center justify-between border-t pt-3 mt-1">
              <span className="text-xs text-muted-foreground">
                {pendingRange?.from
                  ? `${format(pendingRange.from, "MM/dd/yyyy")} - ${format(pendingRange.to || pendingRange.from, "MM/dd/yyyy")}`
                  : "Select dates"}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCalendarCancel}
                  data-testid="button-date-cancel"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCalendarApply}
                  disabled={!pendingRange?.from}
                  data-testid="button-date-apply"
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function dateRangeToParams(dateRange: DateRange | undefined): { dateFrom?: string; dateTo?: string } {
  if (!dateRange?.from) return {};
  const params: { dateFrom?: string; dateTo?: string } = {};
  params.dateFrom = format(dateRange.from, "yyyy-MM-dd");
  if (dateRange.to) {
    params.dateTo = format(dateRange.to, "yyyy-MM-dd");
  }
  return params;
}
