import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Package,
  Search,
  MoreVertical,
  Eye,
  Truck,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  X,
  Loader2,
  Filter,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Order } from "@shared/schema";
import { Link } from "wouter";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { DateRangePicker, dateRangeToParams } from "@/components/date-range-picker";

const STATUS_COLORS: Record<string, string> = {
  'BOOKED': "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  'PICKED_UP': "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  'ARRIVED_AT_ORIGIN': "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  'IN_TRANSIT': "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  'ARRIVED_AT_DESTINATION': "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  'OUT_FOR_DELIVERY': "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  'DELIVERY_ATTEMPTED': "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  'DELIVERED': "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  'DELIVERY_FAILED': "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  'RETURNED_TO_SHIPPER': "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  'READY_FOR_RETURN': "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  'RETURN_IN_TRANSIT': "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  'CANCELLED': "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  'Unfulfilled': "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const STATUS_LABELS: Record<string, string> = {
  'BOOKED': 'Booked',
  'PICKED_UP': 'Picked Up',
  'ARRIVED_AT_ORIGIN': 'At Origin',
  'IN_TRANSIT': 'In Transit',
  'ARRIVED_AT_DESTINATION': 'At Destination',
  'OUT_FOR_DELIVERY': 'Out for Delivery',
  'DELIVERY_ATTEMPTED': 'Attempted',
  'DELIVERED': 'Delivered',
  'DELIVERY_FAILED': 'Failed',
  'RETURNED_TO_SHIPPER': 'Returned',
  'READY_FOR_RETURN': 'Ready for Return',
  'RETURN_IN_TRANSIT': 'Return in Transit',
  'CANCELLED': 'Cancelled',
  'Unfulfilled': 'Unfulfilled',
};

function getStatusColor(status: string): string {
  return STATUS_COLORS[status] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
}

function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

const courierOptions = [
  { value: "all", label: "All Couriers" },
  { value: "leopards", label: "Leopards" },
  { value: "postex", label: "PostEx" },
  { value: "tcs", label: "TCS" },
];

function getStatusBadge(status: string | null, hasCourierTracking: boolean, rawStatus?: string | null, workflowStatus?: string | null) {
  const postBookedStages = ['BOOKED', 'FULFILLED', 'DELIVERED', 'RETURN'];
  const isPostBooked = workflowStatus && postBookedStages.includes(workflowStatus);
  if (!hasCourierTracking && isPostBooked && (!status || status === 'Unfulfilled' || status === 'pending' || status === 'BOOKED' || status === 'Awaiting Pickup')) {
    return <span className="text-muted-foreground text-xs" data-testid="badge-status-none">—</span>;
  }
  const displayStatus = (!hasCourierTracking && (!status || status === 'pending')) ? 'Unfulfilled' : (status || 'Unfulfilled');
  const colorClass = getStatusColor(displayStatus);
  const label = getStatusLabel(displayStatus);
  return <Badge className={`${colorClass} text-xs font-medium`} data-testid={`badge-status-${displayStatus.toLowerCase().replace(/\s+/g, '-')}`} title={rawStatus ? `Courier: ${rawStatus}` : undefined}>{label}</Badge>;
}

interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
}

export default function Orders() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(200);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const courierSyncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (courierSyncPollRef.current) clearInterval(courierSyncPollRef.current);
    };
  }, []);

  const [remarkDialogOpen, setRemarkDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [remarkValue, setRemarkValue] = useState("");

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    const timer = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const dateParams = dateRangeToParams(dateRange);

  const POST_BOOKING_STATUSES = new Set([
    "BOOKED", "PICKED_UP", "ARRIVED_AT_ORIGIN", "IN_TRANSIT", "ARRIVED_AT_DESTINATION",
    "OUT_FOR_DELIVERY", "DELIVERY_ATTEMPTED", "DELIVERED", "DELIVERY_FAILED",
    "RETURNED_TO_SHIPPER", "READY_FOR_RETURN", "RETURN_IN_TRANSIT", "CANCELLED",
  ]);
  const isPostBookingFilter = POST_BOOKING_STATUSES.has(statusFilter);

  const { data, isLoading, isFetching } = useQuery<OrdersResponse>({
    queryKey: ["/api/orders", { search: debouncedSearch, status: statusFilter, courier: courierFilter, city: cityFilter, dateFrom: debouncedSearch ? undefined : dateParams.dateFrom, dateTo: debouncedSearch ? undefined : dateParams.dateTo, page, pageSize, dateFilterField: isPostBookingFilter ? "bookedAt" : undefined, sortBy: isPostBookingFilter ? "bookedAt" : undefined }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (courierFilter && courierFilter !== "all") params.set("courier", courierFilter);
      if (cityFilter) params.set("city", cityFilter);
      if (!debouncedSearch && dateParams.dateFrom) params.set("dateFrom", dateParams.dateFrom);
      if (!debouncedSearch && dateParams.dateTo) params.set("dateTo", dateParams.dateTo);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (isPostBookingFilter) {
        params.set("dateFilterField", "bookedAt");
        params.set("sortBy", "bookedAt");
        params.set("sortDir", "desc");
      }
      const res = await fetch(`/api/orders?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const orders = data?.orders || [];

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allCurrentPageSelected = orders.length > 0 && orders.every(o => selectedIds.has(o.id));

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allCurrentPageSelected) {
        orders.forEach(o => next.delete(o.id));
      } else {
        orders.forEach(o => next.add(o.id));
      }
      return next;
    });
  }, [orders, allCurrentPageSelected]);

  // Fetch unique cities from the backend for filter dropdown
  const { data: citiesData } = useQuery<{ cities: string[] }>({
    queryKey: ["/api/orders/cities"],
    queryFn: async () => {
      const res = await fetch("/api/orders/cities", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
  const uniqueCities = citiesData?.cities || [];

  const { data: statusesData } = useQuery<{ statuses: { value: string; label: string }[] }>({
    queryKey: ["/api/orders/statuses"],
    queryFn: async () => {
      const res = await fetch("/api/orders/statuses", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
  const universalStatuses = statusesData?.statuses || [];
  const totalPages = Math.ceil((data?.total || 0) / pageSize);

  const syncOrdersMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/integrations/shopify/sync");
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Sync Complete",
        description: `Synced ${result.synced} new orders (${result.total} total).`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (error: Error) => {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const { data: syncStatus } = useQuery<{
    autoSyncEnabled: boolean;
    intervalSeconds: number;
    isRunning: boolean;
    lastSync: { timestamp: string; ordersCreated: number; ordersUpdated: number; totalFetched: number; error?: string } | null;
  }>({
    queryKey: ["/api/integrations/shopify/sync-status"],
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (syncStatus?.lastSync && (syncStatus.lastSync.ordersCreated > 0 || syncStatus.lastSync.ordersUpdated > 0)) {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    }
  }, [syncStatus?.lastSync?.timestamp]);

  const syncCourierStatusMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/couriers/sync-statuses");
      return response.json();
    },
    onSuccess: (result) => {
      if (result.status === 'started' || result.status === 'already_running') {
        toast({
          title: "Courier Sync Running",
          description: "Syncing all courier statuses in the background. This may take a moment.",
        });
        if (courierSyncPollRef.current) clearInterval(courierSyncPollRef.current);
        courierSyncPollRef.current = setInterval(async () => {
          try {
            const res = await fetch("/api/couriers/manual-sync-progress", { credentials: "include" });
            if (!res.ok) { if (courierSyncPollRef.current) clearInterval(courierSyncPollRef.current); return; }
            const progress = await res.json();
            if (progress.status === 'done' && progress.result) {
              if (courierSyncPollRef.current) clearInterval(courierSyncPollRef.current);
              const r = progress.result;
              const parts = [];
              if (r.updated > 0) parts.push(`${r.updated} updated`);
              if (r.failed > 0) parts.push(`${r.failed} failed`);
              if (r.skipped > 0) parts.push(`${r.skipped} skipped`);
              if (r.transitioned > 0) parts.push(`${r.transitioned} transitioned`);
              toast({
                title: r.updated > 0 ? "Courier Status Updated" : "Sync Complete",
                description: r.total === 0
                  ? "All shipments are already up to date."
                  : `${parts.join(', ')} out of ${r.total} shipments.`,
              });
              queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
            } else if (progress.status === 'error') {
              if (courierSyncPollRef.current) clearInterval(courierSyncPollRef.current);
              toast({ title: "Courier Sync Failed", description: progress.error || "Unknown error", variant: "destructive" });
            }
          } catch { if (courierSyncPollRef.current) clearInterval(courierSyncPollRef.current); }
        }, 3000);
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Status Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const updateRemarkMutation = useMutation({
    mutationFn: async ({ orderId, value }: { orderId: string; value: string }) => {
      const response = await apiRequest("PATCH", `/api/orders/${orderId}/remark`, { value });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Remark Updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setRemarkDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
  
  const missingCustomerCount = orders.filter(o => 
    !o.customerName || o.customerName === "Unknown" || o.customerName === "N/A"
  ).length;
  const showMissingDataWarning = orders.length >= 5 && missingCustomerCount > orders.length * 0.5;

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      let exportOrders: Order[];
      if (selectedIds.size > 0) {
        const allOnCurrentPage = Array.from(selectedIds).every(id => orders.find(o => o.id === id));
        if (allOnCurrentPage) {
          exportOrders = orders.filter(o => selectedIds.has(o.id));
        } else {
          const res = await apiRequest("POST", "/api/orders/by-ids", { ids: Array.from(selectedIds) });
          const data = await res.json();
          exportOrders = data.orders || [];
        }
      } else {
        exportOrders = orders;
      }
      if (!exportOrders.length) return;
      const csv = exportOrders.map((o: any) => 
        `"${String(o.orderNumber || '').replace(/^#/, '')}","${o.customerName}","${o.customerPhone || ""}","${o.city || ""}","${(o.shippingAddress || "").replace(/"/g, '""')}","${o.totalQuantity || 1}","${o.totalAmount}","${(o.tags || []).join(";")}","${o.courierTracking ? getStatusLabel(o.shipmentStatus || "BOOKED") : (['BOOKED','FULFILLED','DELIVERED','RETURN'].includes(o.workflowStatus) ? "—" : "Unfulfilled")}","${(o.remark || "").replace(/"/g, '""')}"`
      ).join("\n");
      const header = "Order ID,Customer Name,Phone,City,Address,Qty,Amount,Tags,Status,Remark\n";
      const blob = new Blob([header + csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orders-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      toast({ title: "Export Complete", description: `Exported ${exportOrders.length} orders.` });
    } finally {
      setIsExporting(false);
    }
  };

  const openRemarkDialog = (order: Order) => {
    setSelectedOrder(order);
    setRemarkValue(order.remark || "");
    setRemarkDialogOpen(true);
  };

  const clearAllFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setCourierFilter("all");
    setCityFilter("");
    setDateRange(undefined);
    setPage(1);
  };

  const hasActiveFilters = debouncedSearch || statusFilter !== "all" || courierFilter !== "all" || cityFilter || dateRange !== undefined;

  return (
    <div className="h-full flex flex-col">
      {showMissingDataWarning && (
        <div className="mx-4 mt-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-3" data-testid="banner-missing-customer-data">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-amber-800 dark:text-amber-200">Customer data missing for some orders.</span>{" "}
            <Link href="/settings/shopify" className="underline text-amber-700 dark:text-amber-300">Update Shopify permissions</Link> and re-sync.
          </div>
        </div>
      )}
      
      <div className="flex items-center justify-between gap-4 p-4 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold" data-testid="heading-orders">Orders</h1>
          {data?.total !== undefined && (
            <Badge variant="secondary" className="font-normal">
              {data.total.toLocaleString()} total
            </Badge>
          )}
          {isFetching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8 w-[180px] h-9"
              data-testid="input-search-orders"
            />
          </div>
          
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[180px] h-9" data-testid="select-status-filter">
              <Filter className="w-4 h-4 mr-1" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Unfulfilled">Unfulfilled</SelectItem>
              {universalStatuses.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={courierFilter} onValueChange={(v) => { setCourierFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[130px] h-9" data-testid="select-courier-filter">
              <Truck className="w-4 h-4 mr-1" />
              <SelectValue placeholder="Courier" />
            </SelectTrigger>
            <SelectContent>
              {courierOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-9 text-muted-foreground">
              <X className="w-4 h-4 mr-1" /> Clear
            </Button>
          )}
          
          <div className="h-6 w-px bg-border mx-1" />
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => syncCourierStatusMutation.mutate()}
            disabled={syncCourierStatusMutation.isPending}
            className="h-9"
            data-testid="button-sync-courier-status"
          >
            {syncCourierStatusMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Truck className="w-4 h-4 mr-2" />
            )}
            Sync Status
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => syncOrdersMutation.mutate()}
            disabled={syncOrdersMutation.isPending}
            className="h-9"
            data-testid="button-sync-orders"
          >
            {syncOrdersMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sync Orders
          </Button>

          {syncStatus?.autoSyncEnabled && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="status-auto-sync">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              {syncStatus.lastSync?.error ? (
                <span className="text-destructive">Error</span>
              ) : (
                <span>Live</span>
              )}
              {syncStatus.lastSync?.timestamp && !syncStatus.lastSync.error && (
                <span className="hidden sm:inline">
                  {(() => {
                    const secs = Math.round((Date.now() - new Date(syncStatus.lastSync.timestamp).getTime()) / 1000);
                    if (isNaN(secs) || secs < 0) return '';
                    return secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)}m ago`;
                  })()}
                </span>
              )}
            </div>
          )}
          
          <Button variant="outline" size="sm" onClick={handleExport} className="h-9" disabled={isExporting} data-testid="button-export-orders">
            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {selectedIds.size > 0 ? `Export Selected (${selectedIds.size})` : "Export"}
          </Button>
        </div>
      </div>

      <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-2 flex-wrap">
        <DateRangePicker
          dateRange={dateRange}
          onDateRangeChange={(range) => { setDateRange(range); setPage(1); }}
        />
        {isPostBookingFilter && (
          <Badge variant="outline" className="text-xs text-muted-foreground" data-testid="badge-booking-date-filter">
            Sorted by Booking Date
          </Badge>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="px-4 py-2 border-b bg-primary/10 flex items-center justify-between gap-2" data-testid="selection-indicator">
          <span className="text-sm font-medium" data-testid="text-selection-count">
            {selectedIds.size} order{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            data-testid="button-clear-selection"
          >
            <X className="w-4 h-4 mr-1" />
            Clear selection
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="flex items-center gap-4 py-2">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-28 flex-1" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse" data-testid="table-orders">
            <thead className="sticky top-0 bg-muted z-10">
              <tr className="border-b">
                <th className="p-2 pl-4 w-[40px]">
                  <Checkbox
                    checked={allCurrentPageSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all orders on this page"
                    data-testid="checkbox-select-all"
                  />
                </th>
                <th className="text-left p-2 w-[120px]">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className={`p-0.5 rounded hover:bg-muted ${statusFilter !== "all" ? "text-primary" : "text-muted-foreground"}`} data-testid="filter-status-dropdown">
                          <Filter className="w-3 h-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[200px] max-h-[300px] overflow-y-auto">
                        <DropdownMenuItem 
                          onSelect={() => { setStatusFilter("all"); setPage(1); }}
                          className={statusFilter === "all" ? "bg-muted font-medium" : ""}
                          data-testid="status-option-all"
                        >
                          All Statuses
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onSelect={() => { setStatusFilter("Unfulfilled"); setPage(1); }}
                          className={statusFilter === "Unfulfilled" ? "bg-muted font-medium" : ""}
                          data-testid="status-option-unfulfilled"
                        >
                          Unfulfilled
                        </DropdownMenuItem>
                        {universalStatuses.map((s) => (
                          <DropdownMenuItem 
                            key={s.value} 
                            onSelect={() => { setStatusFilter(s.value); setPage(1); }}
                            className={statusFilter === s.value ? "bg-muted font-medium" : ""}
                            data-testid={`status-option-${s.value.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            {s.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </th>
                <th className="text-left p-2 w-[100px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order ID</th>
                <th className="text-left p-2 w-[120px]">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">City</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className={`p-0.5 rounded hover:bg-muted ${cityFilter ? "text-primary" : "text-muted-foreground"}`} data-testid="filter-city-dropdown">
                          <Filter className="w-3 h-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[180px] max-h-[300px] overflow-y-auto">
                        <DropdownMenuItem 
                          onSelect={() => { setCityFilter(""); setPage(1); }} 
                          className={!cityFilter ? "bg-muted font-medium" : ""}
                          data-testid="city-option-all"
                        >
                          All Cities
                        </DropdownMenuItem>
                        {uniqueCities.map((city) => (
                          <DropdownMenuItem 
                            key={city} 
                            onSelect={() => { setCityFilter(city); setPage(1); }}
                            className={cityFilter === city ? "bg-muted font-medium" : ""}
                            data-testid={`city-option-${city.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            {city}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </th>
                <th className="text-left p-2 w-[160px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                <th className="text-left p-2 w-[120px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phone</th>
                <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Address</th>
                <th className="text-center p-2 w-[50px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
                <th className="text-right p-2 w-[90px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</th>
                <th className="text-left p-2 w-[140px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</th>
                <th className="text-left p-2 w-[160px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Remark</th>
                <th className="w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr key="empty-row">
                  <td colSpan={12} className="text-center py-12">
                    <Package className="w-10 h-10 mx-auto text-muted-foreground opacity-40 mb-3" />
                    <p className="text-muted-foreground">No orders found</p>
                    {hasActiveFilters && (
                      <Button variant="ghost" onClick={clearAllFilters} className="mt-2 text-primary">
                        Clear all filters
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                orders.map((order, idx) => (
                  <tr 
                    key={order.id} 
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    data-testid={`table-row-order-${order.id}`}
                  >
                    <td className="p-2 pl-4">
                      <Checkbox
                        checked={selectedIds.has(order.id)}
                        onCheckedChange={() => toggleSelect(order.id)}
                        aria-label={`Select order ${order.orderNumber}`}
                        data-testid={`checkbox-order-${order.id}`}
                      />
                    </td>
                    <td className="p-2">
                      {getStatusBadge(order.shipmentStatus, !!order.courierTracking, (order as any).courierRawStatus, order.workflowStatus)}
                    </td>
                    <td className="p-2">
                      <Link 
                        href={`/orders/${order.id}`} 
                        className="font-medium text-primary hover:underline"
                        data-testid={`link-order-${order.id}`}
                      >
                        {String(order.orderNumber || '').replace(/^#/, '')}
                      </Link>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {order.city || <span className="text-muted-foreground/50">-</span>}
                    </td>
                    <td className="p-2 font-medium truncate max-w-[160px]" title={order.customerName}>
                      {order.customerName}
                    </td>
                    <td className="p-2 text-muted-foreground font-mono text-xs">
                      {order.customerPhone || <span className="text-muted-foreground/50">-</span>}
                    </td>
                    <td className="p-2 text-muted-foreground text-xs truncate max-w-[200px]" title={order.shippingAddress || ""}>
                      {order.shippingAddress || <span className="text-muted-foreground/50">-</span>}
                    </td>
                    <td className="p-2 text-center font-medium">
                      {order.totalQuantity || 1}
                    </td>
                    <td className="p-2 text-right font-medium tabular-nums">
                      {Number(order.totalAmount).toLocaleString()}
                    </td>
                    <td className="p-2">
                      {order.tags && order.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {order.tags.slice(0, 2).map((tag, i) => (
                            <Badge 
                              key={`${order.id}-tag-${i}`} 
                              variant="secondary" 
                              className="text-[10px] py-0 px-1.5 font-normal"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {order.tags.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">+{order.tags.length - 2}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/50 text-xs">-</span>
                      )}
                    </td>
                    <td className="p-2">
                      <button 
                        onClick={() => openRemarkDialog(order)}
                        className="text-xs text-left hover:bg-muted p-1 rounded cursor-pointer w-full min-h-[24px] truncate block"
                        title={order.remark || "Add remark"}
                        data-testid={`button-remark-${order.id}`}
                      >
                        {order.remark || <span className="text-muted-foreground/50 italic">Add...</span>}
                      </button>
                    </td>
                    <td className="p-2 pr-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`button-order-menu-${order.id}`}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/orders/${order.id}`} className="cursor-pointer">
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          {order.courierTracking && (
                            <DropdownMenuItem>
                              <Truck className="w-4 h-4 mr-2" />
                              Track: {order.courierTracking}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t bg-background sticky bottom-0">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, data?.total ?? 0)} of {data?.total?.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Prev
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              data-testid="button-next-page"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={remarkDialogOpen} onOpenChange={setRemarkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Remark - {String(selectedOrder?.orderNumber || '').replace(/^#/, '')}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={remarkValue}
            onChange={(e) => setRemarkValue(e.target.value)}
            placeholder="Add a note about this order..."
            rows={4}
            data-testid="textarea-remark"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemarkDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedOrder && updateRemarkMutation.mutate({ orderId: selectedOrder.id, value: remarkValue })}
              disabled={updateRemarkMutation.isPending}
              data-testid="button-save-remark"
            >
              {updateRemarkMutation.isPending ? "Saving..." : "Save Remark"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
