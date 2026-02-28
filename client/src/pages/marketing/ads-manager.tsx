import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  RefreshCw,
  Download,
  Search,
  Columns3,
  ChevronUp,
  ChevronDown,
  Loader2,
  ArrowUpDown,
  ToggleLeft,
  ToggleRight,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from "lucide-react";

const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 Days" },
  { value: "last14", label: "Last 14 Days" },
  { value: "last30", label: "Last 30 Days" },
  { value: "mtd", label: "Month to Date" },
  { value: "maximum", label: "Maximum" },
  { value: "custom", label: "Custom" },
];

const LEVELS = [
  { value: "campaign", label: "Campaigns" },
  { value: "adset", label: "Ad Sets" },
  { value: "ad", label: "Ads" },
];

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "DELETED", label: "Deleted" },
  { value: "ARCHIVED", label: "Archived" },
];

interface ColumnDef {
  key: string;
  label: string;
  align: "left" | "right" | "center";
  format?: "currency" | "number" | "percent" | "roas" | "text" | "status";
  sortable?: boolean;
  width?: string;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", align: "left", format: "text", sortable: true, width: "min-w-[200px] max-w-[300px]" },
  { key: "status", label: "Delivery", align: "center", format: "status", sortable: true },
  { key: "objective", label: "Objective", align: "left", format: "text", sortable: true },
  { key: "dailyBudget", label: "Budget", align: "right", format: "currency", sortable: true },
  { key: "spend", label: "Spend", align: "right", format: "currency", sortable: true },
  { key: "purchases", label: "Purchases", align: "right", format: "number", sortable: true },
  { key: "purchaseValue", label: "Purchase Value", align: "right", format: "currency", sortable: true },
  { key: "roas", label: "ROAS", align: "right", format: "roas", sortable: true },
  { key: "costPerPurchase", label: "Cost/Purchase", align: "right", format: "currency", sortable: true },
  { key: "impressions", label: "Impressions", align: "right", format: "number", sortable: true },
  { key: "reach", label: "Reach", align: "right", format: "number", sortable: true },
  { key: "frequency", label: "Frequency", align: "right", format: "number", sortable: true },
  { key: "linkClicks", label: "Link Clicks", align: "right", format: "number", sortable: true },
  { key: "landingPageViews", label: "Landing Page Views", align: "right", format: "number", sortable: true },
  { key: "ctr", label: "CTR", align: "right", format: "percent", sortable: true },
  { key: "cpc", label: "CPC", align: "right", format: "currency", sortable: true },
  { key: "cpm", label: "CPM", align: "right", format: "currency", sortable: true },
  { key: "viewContent", label: "View Content", align: "right", format: "number", sortable: true },
  { key: "addToCart", label: "Add to Cart", align: "right", format: "number", sortable: true },
  { key: "initiateCheckout", label: "Checkouts", align: "right", format: "number", sortable: true },
  { key: "costPerCheckout", label: "Cost/Checkout", align: "right", format: "currency", sortable: true },
  { key: "costPerAddToCart", label: "Cost/ATC", align: "right", format: "currency", sortable: true },
  { key: "costPerViewContent", label: "Cost/View Content", align: "right", format: "currency", sortable: true },
  { key: "videoViews", label: "Video Views", align: "right", format: "number", sortable: true },
  { key: "videoThruPlays", label: "ThruPlays", align: "right", format: "number", sortable: true },
  { key: "video3sViews", label: "3s Views", align: "right", format: "number", sortable: true },
  { key: "video95pViews", label: "95% Views", align: "right", format: "number", sortable: true },
  { key: "outboundClicks", label: "Outbound Clicks", align: "right", format: "number", sortable: true },
  { key: "clicks", label: "All Clicks", align: "right", format: "number", sortable: true },
];

const PRESETS: Record<string, { label: string; columns: string[] }> = {
  sales: {
    label: "Sales",
    columns: ["name", "status", "spend", "purchases", "purchaseValue", "roas", "costPerPurchase", "addToCart", "initiateCheckout", "cpm", "ctr", "linkClicks"],
  },
  funnel: {
    label: "Funnel",
    columns: ["name", "status", "spend", "viewContent", "costPerViewContent", "addToCart", "costPerAddToCart", "initiateCheckout", "costPerCheckout", "purchases", "costPerPurchase", "purchaseValue", "roas"],
  },
  traffic: {
    label: "Traffic",
    columns: ["name", "status", "spend", "impressions", "reach", "frequency", "linkClicks", "landingPageViews", "ctr", "cpc", "cpm"],
  },
  video: {
    label: "Video",
    columns: ["name", "status", "spend", "videoViews", "videoThruPlays", "video3sViews", "video95pViews", "impressions", "cpm"],
  },
  delivery: {
    label: "Delivery",
    columns: ["name", "status", "objective", "dailyBudget", "spend", "cpm", "frequency", "impressions", "reach"],
  },
};

const PAGE_SIZE = 25;

function getDateRangeFromPreset(preset: string): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString().split("T")[0];
  };
  switch (preset) {
    case "today": return { dateFrom: today, dateTo: today };
    case "yesterday": return { dateFrom: daysAgo(1), dateTo: daysAgo(1) };
    case "last7": return { dateFrom: daysAgo(6), dateTo: today };
    case "last14": return { dateFrom: daysAgo(13), dateTo: today };
    case "last30": return { dateFrom: daysAgo(29), dateTo: today };
    case "mtd": {
      const mtd = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      return { dateFrom: mtd, dateTo: today };
    }
    case "maximum": {
      const maxBack = new Date(now);
      maxBack.setMonth(maxBack.getMonth() - 36);
      return { dateFrom: maxBack.toISOString().split("T")[0], dateTo: today };
    }
    default: return { dateFrom: daysAgo(6), dateTo: today };
  }
}

function formatDateLabel(dateFrom: string, dateTo: string): string {
  const fmt = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  if (dateFrom === dateTo) return fmt(dateFrom);
  return `${fmt(dateFrom)} – ${fmt(dateTo)}`;
}

export default function AdsManager() {
  const [datePreset, setDatePreset] = useState("last7");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [level, setLevel] = useState("campaign");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [columnPreset, setColumnPreset] = useState("sales");
  const [visibleColumns, setVisibleColumns] = useState<string[]>(PRESETS.sales.columns);
  const [sortBy, setSortBy] = useState("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();

  const { dateFrom, dateTo } = useMemo(() => {
    if (datePreset === "custom" && customDateFrom && customDateTo) {
      return { dateFrom: customDateFrom, dateTo: customDateTo };
    }
    return getDateRangeFromPreset(datePreset);
  }, [datePreset, customDateFrom, customDateTo]);

  useEffect(() => {
    if (PRESETS[columnPreset]) {
      setVisibleColumns(PRESETS[columnPreset].columns);
    }
  }, [columnPreset]);

  useEffect(() => {
    setCurrentPage(1);
  }, [level, statusFilter, searchQuery, datePreset, customDateFrom, customDateTo]);

  const statusParam = statusFilter === "ALL" ? "" : statusFilter;

  const { data, isLoading, refetch } = useQuery<{
    rows: any[];
    totals: any;
    currency: string;
    timezone: string;
    dateFrom: string;
    dateTo: string;
    level: string;
  }>({
    queryKey: ["/api/marketing/meta/insights", dateFrom, dateTo, level, statusParam, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({ level, dateFrom, dateTo });
      if (statusParam) params.set("status", statusParam);
      if (searchQuery) params.set("search", searchQuery);
      const res = await fetch(`/api/marketing/meta/insights?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch insights");
      return res.json();
    },
    refetchInterval: autoRefresh ? 60000 : false,
  });

  const { data: metaStatus } = useQuery<any>({
    queryKey: ["/api/marketing/meta/status"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketing/meta/sync", { dateFrom, dateTo });
      return res.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Sync Complete",
        description: `Synced ${result.campaigns} campaigns, ${result.adsets} ad sets, ${result.ads} ads, ${result.insights} insights`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing"] });
    },
    onError: (error: any) => {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const currency = data?.currency || metaStatus?.account?.currency || "PKR";

  const formatCurrency = (val: number): string => {
    if (val === 0) return `${currency} 0`;
    return new Intl.NumberFormat("en-PK", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: val < 10 ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const formatNumber = (val: number): string => {
    if (val === 0) return "0";
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toLocaleString();
  };

  const formatCell = (value: any, format?: string): string => {
    if (value === null || value === undefined) return "-";
    const num = typeof value === "number" ? value : parseFloat(value);
    if (isNaN(num)) return String(value || "-");
    switch (format) {
      case "currency": return formatCurrency(num);
      case "number": return formatNumber(num);
      case "percent": return `${num.toFixed(2)}%`;
      case "roas": return `${num.toFixed(2)}x`;
      default: return String(value);
    }
  };

  const sortedRows = useMemo(() => {
    if (!data?.rows) return [];
    const rows = [...data.rows];
    rows.sort((a, b) => {
      const aVal = a[sortBy] ?? 0;
      const bVal = b[sortBy] ?? 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return rows;
  }, [data?.rows, sortBy, sortDir]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, currentPage]);

  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE);

  const toggleSort = (key: string) => {
    if (sortBy === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
  };

  const handleExportCSV = () => {
    const params = new URLSearchParams({ dateFrom, dateTo, level });
    if (statusParam) params.set("status", statusParam);
    window.open(`/api/marketing/meta/insights/csv?${params}`, "_blank");
  };

  const toggleColumnVisibility = (key: string) => {
    setVisibleColumns(prev => {
      if (prev.includes(key)) {
        if (key === "name") return prev;
        return prev.filter(c => c !== key);
      }
      return [...prev, key];
    });
    setColumnPreset("custom");
  };

  const activeColumns = ALL_COLUMNS.filter(c => visibleColumns.includes(c.key));

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      ACTIVE: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
      PAUSED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
      DELETED: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
      ARCHIVED: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
      WITH_ISSUES: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
      IN_PROCESS: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
    };
    return (
      <Badge className={`text-[10px] font-medium ${colors[status] || colors.ARCHIVED}`} data-testid="badge-status">
        {status}
      </Badge>
    );
  };

  const lastSyncTime = metaStatus?.lastSync?.completedAt
    ? new Date(metaStatus.lastSync.completedAt).toLocaleString("en-PK", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  const handlePresetChange = (val: string) => {
    if (val !== "custom") {
      setDatePreset(val);
      setCustomDateFrom("");
      setCustomDateTo("");
    } else {
      const { dateFrom: df, dateTo: dt } = getDateRangeFromPreset("last7");
      setCustomDateFrom(df);
      setCustomDateTo(dt);
      setDatePreset("custom");
    }
  };

  const activeDateLabel = datePreset === "custom"
    ? formatDateLabel(dateFrom, dateTo)
    : DATE_PRESETS.find(p => p.value === datePreset)?.label || "Last 7 Days";

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto" data-testid="ads-manager-page">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Ads Manager</h1>
            <p className="text-sm text-muted-foreground">
              {formatDateLabel(dateFrom, dateTo)}
              {lastSyncTime && <span className="ml-2">· Last synced {lastSyncTime}</span>}
              {metaStatus?.account?.currency && (
                <span className="ml-2">· {metaStatus.account.currency}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              data-testid="button-auto-refresh"
              className={autoRefresh ? "border-green-500 text-green-600" : ""}
            >
              {autoRefresh ? <ToggleRight className="w-4 h-4 mr-1 text-green-500" /> : <ToggleLeft className="w-4 h-4 mr-1" />}
              Auto
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync"
            >
              {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Sync Now
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV} data-testid="button-export-ads">
              <Download className="w-4 h-4 mr-1" />
              CSV
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" data-testid="button-date-range">
                <Calendar className="w-3.5 h-3.5" />
                {activeDateLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-2" align="start">
              <div className="space-y-1">
                {DATE_PRESETS.filter(p => p.value !== "custom").map(p => (
                  <button
                    key={p.value}
                    onClick={() => handlePresetChange(p.value)}
                    className={`w-full text-left text-xs px-3 py-2 rounded-md transition-colors ${datePreset === p.value ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
                    data-testid={`date-preset-${p.value}`}
                  >
                    {p.label}
                  </button>
                ))}
                <div className="border-t pt-2 mt-2">
                  <div className="px-3 pb-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Custom Range</div>
                  <div className="flex items-center gap-2 px-3">
                    <input
                      type="date"
                      value={customDateFrom || dateFrom}
                      onChange={(e) => {
                        setCustomDateFrom(e.target.value);
                        if (!customDateTo) setCustomDateTo(dateTo);
                        setDatePreset("custom");
                      }}
                      className="flex-1 text-xs border rounded px-2 py-1.5 bg-background"
                      data-testid="input-date-from"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input
                      type="date"
                      value={customDateTo || dateTo}
                      onChange={(e) => {
                        setCustomDateTo(e.target.value);
                        if (!customDateFrom) setCustomDateFrom(dateFrom);
                        setDatePreset("custom");
                      }}
                      className="flex-1 text-xs border rounded px-2 py-1.5 bg-background"
                      data-testid="input-date-to"
                    />
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="w-[120px] h-8 text-xs" data-testid="select-level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map(l => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[110px] h-8 text-xs" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={columnPreset} onValueChange={setColumnPreset}>
            <SelectTrigger className="w-[120px] h-8 text-xs" data-testid="select-column-preset">
              <SelectValue placeholder="Columns" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRESETS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
              {columnPreset === "custom" && <SelectItem value="custom">Custom</SelectItem>}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs" data-testid="button-columns-toggle">
                <Columns3 className="w-3.5 h-3.5 mr-1" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 max-h-[400px] overflow-y-auto">
              <DropdownMenuLabel className="text-xs">Toggle Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ALL_COLUMNS.map(col => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  checked={visibleColumns.includes(col.key)}
                  onCheckedChange={() => toggleColumnVisibility(col.key)}
                  disabled={col.key === "name"}
                  className="text-xs"
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name..."
              className="pl-7 h-8 w-[180px] text-xs"
              data-testid="input-search"
            />
          </div>
        </div>
      </div>

      {data?.totals && !isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          <Card>
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Spend</div>
              <div className="text-lg font-bold mt-0.5" data-testid="text-total-spend">{formatCurrency(data.totals.spend)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Purchases</div>
              <div className="text-lg font-bold mt-0.5" data-testid="text-total-purchases">{formatNumber(data.totals.purchases)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Revenue</div>
              <div className="text-lg font-bold mt-0.5" data-testid="text-total-revenue">{formatCurrency(data.totals.purchaseValue)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">ROAS</div>
              <div className="text-lg font-bold mt-0.5" data-testid="text-total-roas">
                <span className={data.totals.roas >= 1 ? "text-green-600" : "text-red-600"}>
                  {data.totals.roas.toFixed(2)}x
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Cost/Purchase</div>
              <div className="text-lg font-bold mt-0.5" data-testid="text-total-cpa">{formatCurrency(data.totals.costPerPurchase)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card data-testid="card-ads-table">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-[400px] w-full" />
            </div>
          ) : !data?.rows || data.rows.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-muted-foreground text-sm mb-3">
                No {level} data found for the selected period and filters.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                data-testid="button-sync-empty"
              >
                {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Sync from Facebook
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      {activeColumns.map(col => (
                        <TableHead
                          key={col.key}
                          className={`text-[11px] font-semibold uppercase tracking-wider cursor-pointer hover:bg-muted/50 select-none whitespace-nowrap ${col.width || ""} ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""}`}
                          onClick={() => col.sortable && toggleSort(col.key)}
                          data-testid={`th-${col.key}`}
                        >
                          <div className={`flex items-center gap-1 ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : ""}`}>
                            {col.label}
                            {col.sortable && sortBy === col.key && (
                              sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                            )}
                            {col.sortable && sortBy !== col.key && (
                              <ArrowUpDown className="w-3 h-3 opacity-30" />
                            )}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRows.map((row: any, i: number) => (
                      <TableRow key={row.entityId || i} className="hover:bg-muted/20" data-testid={`row-${level}-${i}`}>
                        {activeColumns.map(col => (
                          <TableCell
                            key={col.key}
                            className={`text-xs py-2 whitespace-nowrap ${col.width || ""} ${col.align === "right" ? "text-right tabular-nums" : col.align === "center" ? "text-center" : ""}`}
                          >
                            {col.key === "name" ? (
                              <div className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${row.status === "ACTIVE" ? "bg-green-500" : row.status === "PAUSED" ? "bg-yellow-500" : "bg-gray-400"}`} />
                                <span className="font-medium truncate max-w-[250px]" title={row.name} data-testid={`text-name-${i}`}>
                                  {row.name}
                                </span>
                              </div>
                            ) : col.key === "status" ? (
                              statusBadge(row.status)
                            ) : col.key === "roas" ? (
                              <span className={row.roas >= 1 ? "text-green-600 dark:text-green-400 font-medium" : row.roas > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                                {formatCell(row[col.key], col.format)}
                              </span>
                            ) : col.key === "dailyBudget" ? (
                              <span>{row.dailyBudget ? formatCurrency(row.dailyBudget) : row.lifetimeBudget ? `${formatCurrency(row.lifetimeBudget)} LT` : "-"}</span>
                            ) : (
                              <span className={row[col.key] === 0 ? "text-muted-foreground" : ""}>
                                {formatCell(row[col.key], col.format)}
                              </span>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}

                    <TableRow className="bg-muted/40 font-semibold border-t-2" data-testid="row-totals">
                      {activeColumns.map(col => (
                        <TableCell
                          key={col.key}
                          className={`text-xs py-2 font-bold whitespace-nowrap ${col.align === "right" ? "text-right tabular-nums" : col.align === "center" ? "text-center" : ""}`}
                        >
                          {col.key === "name" ? (
                            <span className="text-muted-foreground">
                              Total ({sortedRows.length} {level === "campaign" ? "campaigns" : level === "adset" ? "ad sets" : "ads"})
                            </span>
                          ) : col.key === "status" || col.key === "objective" || col.key === "dailyBudget" ? (
                            ""
                          ) : col.key === "roas" ? (
                            <span className={data.totals.roas >= 1 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                              {data.totals.roas?.toFixed(2)}x
                            </span>
                          ) : data.totals[col.key] !== undefined ? (
                            formatCell(data.totals[col.key], col.format)
                          ) : (
                            ""
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, sortedRows.length)} of {sortedRows.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </Button>
                    <span className="text-xs px-2">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
