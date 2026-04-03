import { useState } from "react";
import { AIInsightsBanner } from "@/components/ai-insights-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangePicker } from "@/components/date-range-picker";
import { useDateRange } from "@/contexts/date-range-context";
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
  Truck,
  Search,
  Filter,
  RefreshCw,
  Package,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Clock,
  X,
  Loader2,
  AlertTriangle,
  Settings2,
  Scale,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { formatPkDate, formatPkDateTime } from "@/lib/dateFormat";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { exportCsvWithDate } from "@/lib/exportCsv";

const workflowStatusOptions = [
  { value: "all", label: "All Stages" },
  { value: "FULFILLED", label: "Fulfilled" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "RETURN", label: "Return" },
];

const courierOptions = [
  { value: "all", label: "All Couriers" },
  { value: "leopards", label: "Leopards" },
  { value: "postex", label: "PostEx" },
  { value: "tcs", label: "TCS" },
];

const WORKFLOW_STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  'FULFILLED': { color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20", icon: Truck, label: "Fulfilled" },
  'DELIVERED': { color: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20", icon: CheckCircle2, label: "Delivered" },
  'RETURN': { color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20", icon: RotateCcw, label: "Return" },
};

function getWorkflowBadge(status: string) {
  const config = WORKFLOW_STATUS_CONFIG[status] || { color: "bg-muted text-muted-foreground", icon: Package, label: status };
  return <Badge className={`text-xs font-medium border ${config.color}`}>{config.label}</Badge>;
}

function getCourierStatusBadge(rawStatus: string) {
  const s = rawStatus.toLowerCase().trim();
  const isReturn = s.includes("return") || s.includes("undeliver") || s.includes("not deliver") || s.includes("failed") || s.includes("refused");
  if (isReturn) return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
      {rawStatus}
    </span>
  );
  const isDelivered = s === "delivered" || s.startsWith("delivered") || /\bdeliver(ed)?\b/.test(s);
  if (isDelivered) return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
      {rawStatus}
    </span>
  );
  if (s.includes("transit") || s.includes("pickup") || s.includes("dispatched") || s.includes("out for") || s.includes("in-transit")) return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
      {rawStatus}
    </span>
  );
  if (s.includes("pending") || s.includes("await") || s.includes("processing") || s.includes("booked")) return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
      {rawStatus}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
      {rawStatus}
    </span>
  );
}

interface ShipmentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  city: string | null;
  courierName: string | null;
  courierTracking: string | null;
  totalAmount: string | null;
  codRemaining: string | null;
  codPaymentStatus: string | null;
  workflowStatus: string;
  remark: string | null;
  orderDate: string | null;
  dispatchedAt: string | null;
  fulfilledAt: string | null;
  deliveredAt: string | null;
  returnedAt: string | null;
  shipmentStatus: string | null;
  courierRawStatus: string | null;
  courierWeight: string | null;
  lastTrackingUpdate: string | null;
  prepaidAmount: string | null;
  paymentMethod: string | null;
}

function getAgingBadge(order: ShipmentOrder) {
  const startDateStr = order.fulfilledAt ?? order.dispatchedAt ?? order.orderDate;
  if (!startDateStr) return <span className="text-muted-foreground/40 text-xs">—</span>;
  const start = new Date(startDateStr).getTime();
  const end =
    order.workflowStatus === "DELIVERED" && order.deliveredAt
      ? new Date(order.deliveredAt).getTime()
      : order.workflowStatus === "RETURN" && order.returnedAt
      ? new Date(order.returnedAt).getTime()
      : Date.now();
  const days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  if (days <= 4) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
        {days}d
      </span>
    );
  }
  if (days < 6) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 whitespace-nowrap">
        {days}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 whitespace-nowrap">
      {days}d
    </span>
  );
}

interface ShipmentsResponse {
  orders: ShipmentOrder[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
}

function Pagination({ page, totalPages, total, pageSize, onPrev, onNext, prevTestId, nextTestId }: {
  page: number; totalPages: number; total: number; pageSize: number;
  onPrev: () => void; onNext: () => void; prevTestId: string; nextTestId: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-4 p-3 border-t">
      <p className="text-sm text-muted-foreground">
        Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={page === 1} data-testid={prevTestId}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm">Page {page} of {totalPages}</span>
        <Button variant="outline" size="sm" onClick={onNext} disabled={page >= totalPages} data-testid={nextTestId}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function Shipments() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("shipments");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState("all");
  const [issuesActive, setIssuesActive] = useState(false);
  const [issuesDialogOpen, setIssuesDialogOpen] = useState(false);
  const [issuesSelection, setIssuesSelection] = useState<string[]>([]);
  const [courierFilter, setCourierFilter] = useState("all");
  const [weightFilter, setWeightFilter] = useState("all");
  const [agingFilter, setAgingFilter] = useState("all");
  const { dateRange, setDateRange, dateParams } = useDateRange();
  const [page, setPage] = useState(1);
  const pageSize = 100;

  const [remarkDialogOpen, setRemarkDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ShipmentOrder | null>(null);
  const [remarkValue, setRemarkValue] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [issueSearchQuery, setIssueSearchQuery] = useState("");

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const currentPageIds = shipmentOrders.map((o) => o.id);
    const allSelected = currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        currentPageIds.forEach((id) => next.delete(id));
      } else {
        currentPageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const { data: rawStatusesData } = useQuery<{ statuses: { status: string; count: number }[]; pendingStatuses: string[] }>({
    queryKey: ["/api/shipments/raw-statuses"],
    queryFn: async () => {
      const res = await fetch("/api/shipments/raw-statuses", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: activeTab === "shipments",
  });

  const { data: issuePresetData } = useQuery<{ statuses: string[] }>({
    queryKey: ["/api/merchants/issue-preset"],
    queryFn: async () => {
      const res = await fetch("/api/merchants/issue-preset", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const saveIssuePresetMutation = useMutation({
    mutationFn: async (statuses: string[]) => {
      const res = await apiRequest("PUT", "/api/merchants/issue-preset", { statuses });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants/issue-preset"] });
      toast({ title: "Issues preset saved" });
    },
  });

  const savedIssueStatuses = issuePresetData?.statuses ?? [];
  const allRawStatuses = rawStatusesData?.statuses ?? [];
  const pendingStatuses = rawStatusesData?.pendingStatuses ?? [];

  const queryParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(search && { search }),
    ...(statusFilter !== "all" && { workflowStatus: statusFilter }),
    ...(issuesActive && savedIssueStatuses.length > 0
      ? { rawStatuses: savedIssueStatuses.join(",") }
      : shipmentStatusFilter !== "all" ? { shipmentStatus: shipmentStatusFilter } : {}),
    ...(courierFilter !== "all" && { courier: courierFilter }),
    ...(weightFilter !== "all" && { weightFilter }),
    ...(agingFilter !== "all" && { agingFilter }),
    ...(!search && dateParams.dateFrom && { dateFrom: dateParams.dateFrom }),
    ...(!search && dateParams.dateTo && { dateTo: dateParams.dateTo }),
  });

  const { data, isLoading, refetch } = useQuery<ShipmentsResponse>({
    queryKey: ["/api/shipments", queryParams.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/shipments?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const shipmentOrders = data?.orders ?? [];
  const allCurrentPageSelected = shipmentOrders.length > 0 && shipmentOrders.every((o) => selectedIds.has(o.id));
  const someCurrentPageSelected = shipmentOrders.some((o) => selectedIds.has(o.id));
  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);
  const counts = data?.counts ?? {};
  const fulfilledCount = counts["FULFILLED"] ?? 0;
  const deliveredCount = counts["DELIVERED"] ?? 0;
  const returnCount = counts["RETURN"] ?? 0;
  const totalCount = fulfilledCount + deliveredCount + returnCount;
  const pendingCount = fulfilledCount;

  const updateRemarkMutation = useMutation({
    mutationFn: async ({ orderId, value }: { orderId: string; value: string }) => {
      const response = await apiRequest("PATCH", `/api/orders/${orderId}/remark`, { value });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Remark Updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/shipments"] });
      setRemarkDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openRemarkDialog = (order: ShipmentOrder) => {
    setSelectedOrder(order);
    setRemarkValue(order.remark || "");
    setRemarkDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-shipments-title">Shipments</h1>
          <p className="text-muted-foreground">All dispatched orders handed over to couriers.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setIsExporting(true);
              try {
                const headers = ["Order", "Customer Name", "Phone", "City", "Amount", "Courier", "Tracking", "Status", "Booked Date"];
                let ordersToExport: ShipmentOrder[];
                if (selectedIds.size > 0) {
                  const allOnCurrentPage = Array.from(selectedIds).every(id => shipmentOrders.find(o => o.id === id));
                  if (allOnCurrentPage) {
                    ordersToExport = shipmentOrders.filter((o) => selectedIds.has(o.id));
                  } else {
                    const res = await apiRequest("POST", "/api/orders/by-ids", { ids: Array.from(selectedIds) });
                    const data = await res.json();
                    ordersToExport = (data.orders || []).map((o: any) => ({
                      ...o,
                      courierName: o.courierProvider || o.courierName || "",
                      courierTracking: o.trackingNumber || o.courierTracking || "",
                    }));
                  }
                } else {
                  ordersToExport = shipmentOrders;
                }
                const rows = ordersToExport.map((order: any) => [
                  String(order.orderNumber || '').replace(/^#/, ''),
                  order.customerName || "",
                  order.customerPhone || "",
                  order.city || "",
                  order.totalAmount || "",
                  order.courierName || order.courierProvider || "",
                  order.courierTracking || order.trackingNumber || "",
                  order.courierRawStatus || order.workflowStatus || "",
                  order.dispatchedAt ? formatPkDate(order.dispatchedAt) : "",
                ]);
                exportCsvWithDate("shipments", headers, rows);
              } finally {
                setIsExporting(false);
              }
            }}
            disabled={(shipmentOrders.length === 0 && selectedIds.size === 0) || isExporting}
            data-testid="button-export-shipments"
          >
            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {selectedIds.size > 0 ? `Export Selected (${selectedIds.size})` : "Export"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-sync-shipments">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <AIInsightsBanner section="shipments" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-shipments" className="flex flex-wrap gap-1">
          <TabsTrigger value="shipments" data-testid="tab-shipments">
            <Truck className="w-4 h-4 mr-2" />
            Shipments
          </TabsTrigger>
        </TabsList>

        {/* ====== SHIPMENTS TAB ====== */}
        <TabsContent value="shipments" className="space-y-4 mt-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xl font-bold" data-testid="stat-total">{totalCount}</p>
                  <p className="text-xs text-muted-foreground">Total Dispatched</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-amber-500/30 dark:border-amber-500/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-xl font-bold text-amber-600 dark:text-amber-400" data-testid="stat-pending">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground">In Transit</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-emerald-500/30 dark:border-emerald-500/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400" data-testid="stat-delivered">{deliveredCount}</p>
                  <p className="text-xs text-muted-foreground">Delivered</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-red-500/30 dark:border-red-500/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <RotateCcw className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-xl font-bold text-red-600 dark:text-red-400" data-testid="stat-return">{returnCount}</p>
                  <p className="text-xs text-muted-foreground">Returned</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="border">
            <CardContent className="p-3">
              <div className="flex flex-col lg:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by tracking number, order, customer, or city..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="pl-10"
                    data-testid="input-search-shipments"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[150px]" data-testid="select-shipment-status">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {workflowStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={shipmentStatusFilter} onValueChange={(v) => { setShipmentStatusFilter(v); setIssuesActive(false); setPage(1); }}>
                    <SelectTrigger className="w-[190px]" data-testid="select-shipment-status-filter">
                      <Package className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Courier Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Courier Statuses</SelectItem>
                      {allRawStatuses.map((s) => (
                        <SelectItem key={s.status} value={s.status}>{s.status} ({s.count})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant={issuesActive ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (savedIssueStatuses.length === 0) {
                        setIssuesSelection([]);
                        setIssuesDialogOpen(true);
                      } else {
                        setIssuesActive(!issuesActive);
                        if (!issuesActive) setShipmentStatusFilter("all");
                        setPage(1);
                      }
                    }}
                    data-testid="button-issues-preset"
                  >
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    Issues{savedIssueStatuses.length > 0 ? ` (${savedIssueStatuses.length})` : ""}
                  </Button>
                  {savedIssueStatuses.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIssuesSelection([...savedIssueStatuses]);
                        setIssuesDialogOpen(true);
                      }}
                      data-testid="button-edit-issues"
                    >
                      <Settings2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Select value={courierFilter} onValueChange={(v) => { setCourierFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[150px]" data-testid="select-shipment-courier">
                      <Truck className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Courier" />
                    </SelectTrigger>
                    <SelectContent>
                      {courierOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={weightFilter} onValueChange={(v) => { setWeightFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[150px]" data-testid="select-shipment-weight">
                      <Scale className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Weight" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Weights</SelectItem>
                      <SelectItem value="500g">Up to 500g</SelectItem>
                      <SelectItem value="1kg">Up to 1 kg</SelectItem>
                      <SelectItem value="2kg">Up to 2 kg</SelectItem>
                      <SelectItem value="3kg">Up to 3 kg</SelectItem>
                      <SelectItem value="4kg">Up to 4 kg</SelectItem>
                      <SelectItem value="5kg">Up to 5 kg</SelectItem>
                      <SelectItem value="above5">Above 5 kg</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={agingFilter} onValueChange={(v) => { setAgingFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[175px]" data-testid="select-shipment-aging">
                      <Clock className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Aging" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Aging</SelectItem>
                      <SelectItem value="normal">Normal (≤4 days)</SelectItem>
                      <SelectItem value="delayed">Delayed (5 days)</SelectItem>
                      <SelectItem value="stuck">Stuck (6+ days)</SelectItem>
                    </SelectContent>
                  </Select>
                  <DateRangePicker
                    dateRange={dateRange}
                    onDateRangeChange={(range) => { setDateRange(range); setPage(1); }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/50 px-4 py-2" data-testid="selection-indicator-shipments">
              <span className="text-sm font-medium" data-testid="text-selection-count">{selectedIds.size} order{selectedIds.size !== 1 ? "s" : ""} selected</span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} data-testid="button-clear-selection">
                <X className="w-4 h-4 mr-1" />
                Clear selection
              </Button>
            </div>
          )}

          {/* Shipments Table */}
          <Card className="border">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                Shipments
                {data?.total !== undefined && (
                  <Badge className="ml-1 text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">{data.total} orders</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-32 flex-1" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                  ))}
                </div>
              ) : shipmentOrders.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <Table className="[&_th]:py-2.5 [&_td]:py-2.5 [&_th]:px-3 [&_td]:px-3">
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40 border-b">
                          <TableHead className="w-8">
                            <Checkbox
                              checked={allCurrentPageSelected ? true : someCurrentPageSelected ? "indeterminate" : false}
                              onCheckedChange={toggleSelectAll}
                              data-testid="checkbox-select-all-shipments"
                            />
                          </TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Order</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">City</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Courier</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tracking #</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Wt.</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Stage</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Aging</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Courier Status</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Remarks</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shipmentOrders.map((order) => (
                          <TableRow
                            key={order.id}
                            className="border-b hover:bg-muted/30 transition-colors"
                            data-testid={`shipment-row-${order.id}`}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(order.id)}
                                onCheckedChange={() => toggleSelect(order.id)}
                                data-testid={`checkbox-select-${order.id}`}
                              />
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/orders/detail/${order.id}`}
                                className="text-primary hover:underline font-semibold text-sm"
                                data-testid={`link-order-${order.id}`}
                              >
                                #{String(order.orderNumber || '').replace(/^#/, '')}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm leading-tight" data-testid={`text-customer-${order.id}`}>{order.customerName}</p>
                                {order.customerPhone && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{order.customerPhone}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{order.city || "—"}</TableCell>
                            <TableCell className="text-sm capitalize">{order.courierName || "—"}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{order.courierTracking || "—"}</TableCell>
                            <TableCell className="text-right text-sm font-semibold">
                              {order.totalAmount ? `PKR ${Number(order.totalAmount).toLocaleString()}` : "—"}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground" data-testid={`text-courier-weight-${order.id}`}>
                              {order.courierWeight ? `${Number(order.courierWeight).toFixed(0)}g` : "—"}
                            </TableCell>
                            <TableCell data-testid={`badge-status-${order.id}`}>
                              {getWorkflowBadge(order.workflowStatus)}
                            </TableCell>
                            <TableCell data-testid={`text-aging-${order.id}`}>
                              {getAgingBadge(order)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {order.courierRawStatus ? getCourierStatusBadge(order.courierRawStatus) : <span className="text-muted-foreground/40 text-xs">—</span>}
                            </TableCell>
                            <TableCell data-testid={`text-remark-${order.id}`}>
                              <button
                                className="text-left max-w-[180px] cursor-pointer hover-elevate rounded px-1 py-0.5"
                                onClick={() => openRemarkDialog(order)}
                                data-testid={`button-remark-${order.id}`}
                              >
                                {order.remark ? (
                                  <p className="text-xs text-muted-foreground truncate" title={order.remark}>{order.remark}</p>
                                ) : (
                                  <span className="text-muted-foreground/50 text-xs">Add...</span>
                                )}
                              </button>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                              {order.dispatchedAt
                                ? formatPkDateTime(order.dispatchedAt)
                                : order.orderDate
                                ? formatPkDate(order.orderDate)
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Pagination page={page} totalPages={totalPages} total={data?.total ?? 0} pageSize={pageSize}
                    onPrev={() => setPage(page - 1)} onNext={() => setPage(page + 1)}
                    prevTestId="button-prev-page" nextTestId="button-next-page" />
                </>
              ) : (
                <div className="text-center py-16">
                  <Truck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="font-medium mb-1">No shipments found</h3>
                  <p className="text-sm text-muted-foreground">
                    {search || statusFilter !== "all" || courierFilter !== "all"
                      ? "Try adjusting your filters"
                      : "Dispatched orders will appear here once they are fulfilled"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>


      <Dialog open={remarkDialogOpen} onOpenChange={setRemarkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="text-remark-dialog-title">
              Edit Remark — #{String(selectedOrder?.orderNumber || '').replace(/^#/, '')}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={remarkValue}
            onChange={(e) => setRemarkValue(e.target.value)}
            placeholder="Enter remark..."
            rows={4}
            data-testid="input-remark-textarea"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemarkDialogOpen(false)} data-testid="button-remark-cancel">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedOrder) {
                  updateRemarkMutation.mutate({ orderId: selectedOrder.id, value: remarkValue });
                }
              }}
              disabled={updateRemarkMutation.isPending}
              data-testid="button-remark-save"
            >
              {updateRemarkMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={issuesDialogOpen} onOpenChange={(open) => { setIssuesDialogOpen(open); if (!open) setIssueSearchQuery(""); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-issues-dialog-title">Configure Issues Preset</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            Select the courier statuses you want to follow up on. Only pending (non-finalized) statuses are shown.
          </p>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search statuses..."
              value={issueSearchQuery}
              onChange={(e) => setIssueSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="input-issue-search"
            />
          </div>
          {(() => {
            const filteredStatuses = pendingStatuses.filter((status) => status.toLowerCase().includes(issueSearchQuery.toLowerCase()));
            const allFilteredSelected = filteredStatuses.length > 0 && filteredStatuses.every((s) => issuesSelection.includes(s));
            const someFilteredSelected = filteredStatuses.some((s) => issuesSelection.includes(s));
            return (
              <>
                {filteredStatuses.length > 0 && (
                  <label className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer border-b border-border pb-3 mb-1" data-testid="checkbox-issue-select-all">
                    <Checkbox
                      checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setIssuesSelection((prev) => [...new Set([...prev, ...filteredStatuses])]);
                        } else {
                          setIssuesSelection((prev) => prev.filter((s) => !filteredStatuses.includes(s)));
                        }
                      }}
                    />
                    <span className="text-sm font-medium">Select All{issueSearchQuery ? ` (${filteredStatuses.length} results)` : ""}</span>
                  </label>
                )}
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {pendingStatuses.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No pending courier statuses found</p>
                  ) : filteredStatuses.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No statuses match your search</p>
                  ) : (
                    filteredStatuses.map((status) => (
                      <label
                        key={status}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                        data-testid={`checkbox-issue-${status}`}
                      >
                        <Checkbox
                          checked={issuesSelection.includes(status)}
                          onCheckedChange={(checked) => {
                            setIssuesSelection((prev) =>
                              checked ? [...prev, status] : prev.filter((s) => s !== status)
                            );
                          }}
                        />
                        <span className="text-sm">{status}</span>
                      </label>
                    ))
                  )}
                </div>
              </>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssuesDialogOpen(false)} data-testid="button-issues-cancel">
              Cancel
            </Button>
            <Button
              onClick={() => {
                saveIssuePresetMutation.mutate(issuesSelection);
                setIssuesDialogOpen(false);
                if (issuesSelection.length > 0) {
                  setIssuesActive(true);
                  setShipmentStatusFilter("all");
                  setPage(1);
                }
              }}
              disabled={saveIssuePresetMutation.isPending}
              data-testid="button-issues-save"
            >
              {saveIssuePresetMutation.isPending ? "Saving..." : `Save (${issuesSelection.length} selected)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
