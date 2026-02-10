import { useState, useCallback, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Inbox,
  Clock,
  Pause,
  Truck,
  Package,
  XCircle,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Edit3,
  Undo2,
  Send,
  Copy,
  ExternalLink,
  Printer,
  Download,
  CreditCard,
  Plus,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Order } from "@shared/schema";
import { Link, useParams } from "wouter";
import { format, formatDistanceToNow, isPast } from "date-fns";

const STAGE_TO_STATUS: Record<string, string> = {
  new: "NEW",
  pending: "PENDING",
  hold: "HOLD",
  ready: "READY_TO_SHIP",
  fulfilled: "FULFILLED",
  cancelled: "CANCELLED",
};

const STAGE_TITLES: Record<string, string> = {
  NEW: "New Orders",
  PENDING: "Pending Orders",
  HOLD: "On Hold",
  READY_TO_SHIP: "Ready to Ship",
  FULFILLED: "Fulfilled Orders",
  CANCELLED: "Cancelled Orders",
};

const PENDING_REASON_TYPES = [
  { value: "INCOMPLETE_ADDRESS", label: "Incomplete Address" },
  { value: "MISSING_PHONE", label: "Missing Phone" },
  { value: "WRONG_CITY", label: "Wrong City" },
  { value: "CUSTOMER_NOT_RESPONDING", label: "Customer Not Responding" },
  { value: "CUSTOMER_REQUESTED_CHANGE", label: "Customer Requested Change" },
  { value: "FRAUD_SUSPECTED", label: "Fraud Suspected" },
  { value: "AUTO_24H", label: "Auto (24h)" },
  { value: "OTHER", label: "Other" },
];

const UNIVERSAL_STATUS_COLORS: Record<string, string> = {
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
  'RETURN_IN_TRANSIT': "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  'CANCELLED': "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  'Unfulfilled': "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const ROBO_TAG_CONFIG: Record<string, { label: string; className: string }> = {
  'Robo-Confirm': { label: 'Robo-Confirm', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  'Robo-Pending': { label: 'Robo-Pending', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  'Robo-Cancel': { label: 'Robo-Cancel', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
};

function getRoboTags(tags: string[] | null | undefined): string[] {
  if (!tags || !Array.isArray(tags)) return [];
  return tags.filter(t => ROBO_TAG_CONFIG[t]);
}

const UNIVERSAL_STATUS_LABELS: Record<string, string> = {
  'BOOKED': 'Booked', 'PICKED_UP': 'Picked Up', 'ARRIVED_AT_ORIGIN': 'At Origin',
  'IN_TRANSIT': 'In Transit', 'ARRIVED_AT_DESTINATION': 'At Destination',
  'OUT_FOR_DELIVERY': 'Out for Delivery', 'DELIVERY_ATTEMPTED': 'Attempted',
  'DELIVERED': 'Delivered', 'DELIVERY_FAILED': 'Failed',
  'RETURNED_TO_SHIPPER': 'Returned', 'RETURN_IN_TRANSIT': 'Return in Transit',
  'CANCELLED': 'Cancelled', 'Unfulfilled': 'Unfulfilled',
};

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function HoldCountdown({ holdUntil }: { holdUntil: string | Date }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const date = new Date(holdUntil);
  const expired = isPast(date);

  if (expired) {
    return <Badge variant="destructive" className="text-xs" data-testid="badge-hold-expired">Expired</Badge>;
  }

  return (
    <span className="text-xs text-muted-foreground" data-testid="text-hold-countdown">
      {formatDistanceToNow(date, { addSuffix: true })}
    </span>
  );
}

export default function Pipeline() {
  const params = useParams<{ stage: string }>();
  const activeTab = STAGE_TO_STATUS[params.stage || "new"] || "NEW";

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(300);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingReasonFilter, setPendingReasonFilter] = useState("all");

  const [cancelModal, setCancelModal] = useState<{ open: boolean; orderIds: string[] }>({ open: false, orderIds: [] });
  const [cancelReason, setCancelReason] = useState("");
  const [pendingModal, setPendingModal] = useState<{ open: boolean; orderIds: string[] }>({ open: false, orderIds: [] });
  const [pendingReasonType, setPendingReasonType] = useState("");
  const [pendingReason, setPendingReason] = useState("");
  const [holdModal, setHoldModal] = useState<{ open: boolean; orderIds: string[] }>({ open: false, orderIds: [] });
  const [holdUntil, setHoldUntil] = useState("");

  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");

  const [selectedCourier, setSelectedCourier] = useState<string>("leopards");
  const [bookingConfirmModal, setBookingConfirmModal] = useState<{ open: boolean; preview: any | null }>({ open: false, preview: null });
  const [bookingResultsModal, setBookingResultsModal] = useState<{ open: boolean; results: any | null }>({ open: false, results: null });
  const [isBookingLoading, setIsBookingLoading] = useState(false);
  const [previewChecked, setPreviewChecked] = useState<Set<string>>(new Set());
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, {
    weight: number; mode: string; customerName: string; phone: string;
    address: string; city: string; codAmount: number; description: string;
  }>>({});
  const [courierCities, setCourierCities] = useState<Array<{ id?: number; name: string }>>([]);

  const [paymentModal, setPaymentModal] = useState<{ open: boolean; orderId: string; orderNumber: string; totalAmount: number; prepaidAmount: number }>({ open: false, orderId: "", orderNumber: "", totalAmount: 0, prepaidAmount: 0 });
  const [quickPayAmount, setQuickPayAmount] = useState("");
  const [quickPayMethod, setQuickPayMethod] = useState("CASH");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    setSearch("");
    setPendingReasonFilter("all");
  }, [activeTab]);

  const { data, isLoading, isFetching } = useQuery<{ orders: Order[]; total: number }>({
    queryKey: ["/api/orders", { workflowStatus: activeTab, search: debouncedSearch, page, pageSize, pendingReasonType: activeTab === "PENDING" ? pendingReasonFilter : undefined }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("workflowStatus", activeTab);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (activeTab === "PENDING" && pendingReasonFilter !== "all") params.set("pendingReasonType", pendingReasonFilter);
      const res = await fetch(`/api/orders?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const orders = data?.orders || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const workflowMutation = useMutation({
    mutationFn: async ({ orderId, action, extra }: { orderId: string; action: string; extra?: any }) => {
      const res = await apiRequest("POST", `/api/orders/${orderId}/workflow`, { action, ...extra });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/workflow-counts"] });
    },
  });

  const bulkWorkflowMutation = useMutation({
    mutationFn: async ({ orderIds, action, extra }: { orderIds: string[]; action: string; extra?: any }) => {
      const res = await apiRequest("POST", "/api/orders/bulk-workflow", { orderIds, action, ...extra });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/workflow-counts"] });
      setSelectedIds(new Set());
      toast({ title: `${variables.orderIds.length} orders updated` });
    },
  });

  const customerUpdateMutation = useMutation({
    mutationFn: async ({ orderId, data }: { orderId: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/orders/${orderId}/customer`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setEditingOrder(null);
      toast({ title: "Customer info updated" });
    },
  });

  const quickPayMutation = useMutation({
    mutationFn: async ({ orderId, amount, method }: { orderId: string; amount: number; method: string }) => {
      return apiRequest("POST", `/api/orders/${orderId}/payments`, { amount, method });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setPaymentModal({ open: false, orderId: "", orderNumber: "", totalAmount: 0, prepaidAmount: 0 });
      setQuickPayAmount("");
      toast({ title: "Payment added" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to add payment", variant: "destructive" });
    },
  });

  const bulkMarkPrepaidMutation = useMutation({
    mutationFn: async ({ orderIds, method }: { orderIds: string[]; method: string }) => {
      return apiRequest("POST", "/api/orders/bulk-mark-prepaid", { orderIds, method });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setSelectedIds(new Set());
      toast({ title: "Orders marked as prepaid" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to mark as prepaid", variant: "destructive" });
    },
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === orders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map(o => o.id)));
    }
  }, [orders, selectedIds.size]);

  const handleSingleAction = useCallback((orderId: string, action: string) => {
    if (action === "cancel") {
      setCancelModal({ open: true, orderIds: [orderId] });
    } else if (action === "pending") {
      setPendingModal({ open: true, orderIds: [orderId] });
    } else if (action === "hold") {
      setHoldModal({ open: true, orderIds: [orderId] });
    } else {
      workflowMutation.mutate({ orderId, action });
    }
  }, [workflowMutation]);

  const handleBulkAction = useCallback((action: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (action === "cancel") {
      setCancelModal({ open: true, orderIds: ids });
    } else if (action === "pending") {
      setPendingModal({ open: true, orderIds: ids });
    } else if (action === "hold") {
      setHoldModal({ open: true, orderIds: ids });
    } else {
      bulkWorkflowMutation.mutate({ orderIds: ids, action });
    }
  }, [selectedIds, bulkWorkflowMutation]);

  const submitCancel = useCallback(() => {
    if (!cancelReason.trim()) return;
    if (cancelModal.orderIds.length === 1) {
      workflowMutation.mutate({ orderId: cancelModal.orderIds[0], action: "cancel", extra: { cancelReason } });
    } else {
      bulkWorkflowMutation.mutate({ orderIds: cancelModal.orderIds, action: "cancel", extra: { cancelReason } });
    }
    setCancelModal({ open: false, orderIds: [] });
    setCancelReason("");
  }, [cancelReason, cancelModal, workflowMutation, bulkWorkflowMutation]);

  const submitPending = useCallback(() => {
    if (!pendingReasonType) return;
    if (pendingModal.orderIds.length === 1) {
      workflowMutation.mutate({ orderId: pendingModal.orderIds[0], action: "pending", extra: { pendingReasonType, pendingReason } });
    } else {
      bulkWorkflowMutation.mutate({ orderIds: pendingModal.orderIds, action: "pending", extra: { pendingReasonType, pendingReason } });
    }
    setPendingModal({ open: false, orderIds: [] });
    setPendingReasonType("");
    setPendingReason("");
  }, [pendingReasonType, pendingReason, pendingModal, workflowMutation, bulkWorkflowMutation]);

  const submitHold = useCallback(() => {
    if (!holdUntil) return;
    if (holdModal.orderIds.length === 1) {
      workflowMutation.mutate({ orderId: holdModal.orderIds[0], action: "hold", extra: { holdUntil } });
    } else {
      bulkWorkflowMutation.mutate({ orderIds: holdModal.orderIds, action: "hold", extra: { holdUntil } });
    }
    setHoldModal({ open: false, orderIds: [] });
    setHoldUntil("");
  }, [holdUntil, holdModal, workflowMutation, bulkWorkflowMutation]);

  const handleBookSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsBookingLoading(true);
    try {
      const res = await apiRequest("POST", "/api/booking/preview", { orderIds: ids, courier: selectedCourier });
      const preview = await res.json();
      const checkedIds = new Set<string>(preview.valid.map((v: any) => v.orderId));
      setPreviewChecked(checkedIds);
      setCourierCities(preview.courierCities || []);
      const defaultMode = selectedCourier === "leopards" ? "Overnight" : "Normal";
      const overrides: Record<string, {
        weight: number; mode: string; customerName: string; phone: string;
        address: string; city: string; codAmount: number; description: string;
      }> = {};
      const allOrders = [...preview.valid, ...preview.invalid];
      for (const v of allOrders) {
        const cityToUse = v.cityMatched ? v.matchedCityName : v.city;
        overrides[v.orderId] = {
          weight: v.weight || 200,
          mode: defaultMode,
          customerName: v.customerName || "",
          phone: v.phone || "",
          address: v.address || "",
          city: cityToUse || "",
          codAmount: v.codAmount || 0,
          description: v.productDescription || "",
        };
      }
      setPreviewOverrides(overrides);
      setBookingConfirmModal({ open: true, preview });
    } catch (err: any) {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    } finally {
      setIsBookingLoading(false);
    }
  }, [selectedIds, selectedCourier, toast]);

  const checkedCount = previewChecked.size;

  const submitBooking = useCallback(async () => {
    if (!bookingConfirmModal.preview) return;
    const checkedIds = Array.from(previewChecked);
    if (checkedIds.length === 0) return;
    setBookingConfirmModal({ open: false, preview: null });
    setIsBookingLoading(true);
    try {
      const overridesPayload: Record<string, any> = {};
      for (const id of checkedIds) {
        if (previewOverrides[id]) overridesPayload[id] = previewOverrides[id];
      }
      const res = await apiRequest("POST", "/api/booking/book", {
        orderIds: checkedIds,
        courier: selectedCourier,
        orderOverrides: overridesPayload,
      });
      const data = await res.json();
      setBookingResultsModal({
        open: true,
        results: {
          summary: { success: data.successCount, failed: data.failedCount, total: data.results.length },
          results: data.results,
          batchId: data.batchId,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/workflow-counts"] });
      setSelectedIds(new Set());
    } catch (err: any) {
      toast({ title: "Booking failed", description: err.message, variant: "destructive" });
    } finally {
      setIsBookingLoading(false);
    }
  }, [bookingConfirmModal, previewChecked, previewOverrides, selectedCourier, queryClient, toast]);

  const copyTrackingNumbers = useCallback(() => {
    if (!bookingResultsModal.results) return;
    const trackingNums = bookingResultsModal.results.results
      .filter((r: any) => r.success && r.trackingNumber)
      .map((r: any) => r.trackingNumber)
      .join("\n");
    navigator.clipboard.writeText(trackingNums);
    toast({ title: "Tracking numbers copied" });
  }, [bookingResultsModal, toast]);

  const expiredHolds = useMemo(() => {
    if (activeTab !== "HOLD") return 0;
    return orders.filter(o => o.holdUntil && isPast(new Date(o.holdUntil))).length;
  }, [orders, activeTab]);

  const isPending = workflowMutation.isPending || bulkWorkflowMutation.isPending;

  return (
    <div className="h-full flex flex-col -m-4 md:-m-6">
      {/* Header + Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold mr-2" data-testid="text-page-title">{STAGE_TITLES[activeTab] || "Orders"}</h1>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 w-[200px] h-9"
              data-testid="input-search-pipeline"
            />
          </div>

          {activeTab === "PENDING" && (
            <Select value={pendingReasonFilter} onValueChange={v => { setPendingReasonFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[200px] h-9" data-testid="select-pending-reason-filter">
                <SelectValue placeholder="Reason Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reasons</SelectItem>
                {PENDING_REASON_TYPES.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {isFetching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {total > 0 && <span>{total.toLocaleString()} orders</span>}
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-b" data-testid="bulk-actions-bar">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-border" />

          {(activeTab === "NEW" || activeTab === "PENDING" || activeTab === "HOLD") && (
            <Button size="sm" onClick={() => handleBulkAction("confirm")} disabled={isPending} data-testid="bulk-confirm">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Confirm
            </Button>
          )}
          {(activeTab === "NEW" || activeTab === "PENDING" || activeTab === "HOLD") && (
            <Button size="sm" variant="destructive" onClick={() => handleBulkAction("cancel")} disabled={isPending} data-testid="bulk-cancel">
              <XCircle className="w-3.5 h-3.5 mr-1.5" />Cancel
            </Button>
          )}
          {activeTab === "NEW" && (
            <Button size="sm" variant="secondary" onClick={() => handleBulkAction("pending")} disabled={isPending} data-testid="bulk-pending">
              <Clock className="w-3.5 h-3.5 mr-1.5" />Pending
            </Button>
          )}
          {(activeTab === "NEW" || activeTab === "PENDING") && (
            <Button size="sm" variant="secondary" onClick={() => handleBulkAction("hold")} disabled={isPending} data-testid="bulk-hold">
              <Pause className="w-3.5 h-3.5 mr-1.5" />Hold
            </Button>
          )}
          {activeTab === "HOLD" && (
            <Button size="sm" onClick={() => handleBulkAction("release-hold")} disabled={isPending} data-testid="bulk-release">
              <Truck className="w-3.5 h-3.5 mr-1.5" />Release
            </Button>
          )}

          {(activeTab === "NEW" || activeTab === "PENDING" || activeTab === "HOLD" || activeTab === "READY_TO_SHIP") && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => bulkMarkPrepaidMutation.mutate({ orderIds: Array.from(selectedIds), method: "CASH" })}
              disabled={bulkMarkPrepaidMutation.isPending}
              data-testid="bulk-mark-prepaid"
            >
              <CreditCard className="w-3.5 h-3.5 mr-1.5" />Mark Prepaid
            </Button>
          )}

          {activeTab === "READY_TO_SHIP" && (
            <>
              <div className="h-4 w-px bg-border" />
              <Select value={selectedCourier} onValueChange={setSelectedCourier}>
                <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-courier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leopards">Leopards</SelectItem>
                  <SelectItem value="postex">PostEx</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleBookSelected} disabled={isBookingLoading || isPending} data-testid="button-book-selected">
                {isBookingLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                Book Selected
              </Button>
            </>
          )}

          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} data-testid="bulk-clear">
            Clear
          </Button>
        </div>
      )}

      {/* Expired Holds Banner */}
      {activeTab === "HOLD" && expiredHolds > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800" data-testid="banner-expired-holds">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span className="text-sm text-red-700 dark:text-red-300 font-medium">
            {expiredHolds} hold{expiredHolds > 1 ? "s" : ""} expired - action required
          </span>
        </div>
      )}

      {/* Orders Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            {activeTab === "NEW" ? (
              <>
                <CheckCircle2 className="w-16 h-16 text-green-400 mb-4" />
                <h3 className="text-lg font-medium mb-1">Inbox Zero</h3>
                <p className="text-muted-foreground text-sm">All new orders have been processed</p>
              </>
            ) : (
              <>
                <Package className="w-16 h-16 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium mb-1">No orders</h3>
                <p className="text-muted-foreground text-sm">No orders in this stage</p>
              </>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="border-b">
                {activeTab !== "CANCELLED" && activeTab !== "FULFILLED" && (
                  <th className="w-10 px-3 py-2.5 text-left">
                    <Checkbox
                      checked={selectedIds.size === orders.length && orders.length > 0}
                      onCheckedChange={toggleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </th>
                )}
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Order</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Customer</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">City</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Amount</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground hidden lg:table-cell">Items</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell" data-testid="header-tags">Tags</th>
                {activeTab === "PENDING" && (
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Reason</th>
                )}
                {activeTab === "HOLD" && (
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Hold Until</th>
                )}
                {activeTab === "FULFILLED" && (
                  <>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Courier</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                  </>
                )}
                {activeTab === "CANCELLED" && (
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Reason</th>
                )}
                {activeTab !== "FULFILLED" && (
                  <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr
                  key={order.id}
                  className={`border-b transition-colors hover-elevate ${
                    selectedIds.has(order.id) ? "bg-primary/5" : ""
                  } ${activeTab === "HOLD" && order.holdUntil && isPast(new Date(order.holdUntil)) ? "bg-red-50/50 dark:bg-red-950/30" : ""}`}
                  data-testid={`order-row-${order.id}`}
                >
                  {activeTab !== "CANCELLED" && activeTab !== "FULFILLED" && (
                    <td className="px-3 py-2.5">
                      <Checkbox
                        checked={selectedIds.has(order.id)}
                        onCheckedChange={() => toggleSelect(order.id)}
                        data-testid={`checkbox-order-${order.id}`}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <Link href={`/orders/detail/${order.id}`} className="font-medium text-sm hover:underline" data-testid={`link-order-${order.id}`}>
                      {order.orderNumber}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {order.orderDate ? format(new Date(order.orderDate), "MMM d, h:mm a") : ""}
                    </div>
                    {activeTab === "PENDING" && order.lastStatusChangedAt && (
                      <div className="text-xs text-amber-600 dark:text-amber-400" data-testid={`text-pending-duration-${order.id}`}>
                        Pending {formatDistanceToNow(new Date(order.lastStatusChangedAt))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {editingOrder === order.id && activeTab === "PENDING" ? (
                      <div className="space-y-1">
                        <Input
                          value={editPhone}
                          onChange={e => setEditPhone(e.target.value)}
                          placeholder="Phone"
                          className="h-7 text-xs"
                          data-testid={`input-edit-phone-${order.id}`}
                        />
                        <Input
                          value={editAddress}
                          onChange={e => setEditAddress(e.target.value)}
                          placeholder="Address"
                          className="h-7 text-xs"
                          data-testid={`input-edit-address-${order.id}`}
                        />
                        <Input
                          value={editCity}
                          onChange={e => setEditCity(e.target.value)}
                          placeholder="City"
                          className="h-7 text-xs"
                          data-testid={`input-edit-city-${order.id}`}
                        />
                        <div className="flex gap-1">
                          <Button size="sm" className="h-6 text-xs px-2" onClick={() => {
                            customerUpdateMutation.mutate({
                              orderId: order.id,
                              data: { customerPhone: editPhone, shippingAddress: editAddress, city: editCity }
                            });
                          }} data-testid={`button-save-edit-${order.id}`}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingOrder(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium text-sm truncate max-w-[150px]">{order.customerName}</div>
                        <div className="text-xs text-muted-foreground">{order.customerPhone || "No phone"}</div>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-sm">{order.city || "-"}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-sm">PKR {Number(order.totalAmount).toLocaleString()}</div>
                    {order.codPaymentStatus === "PAID" ? (
                      <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20" data-testid={`badge-prepaid-${order.id}`}>Prepaid</Badge>
                    ) : order.codPaymentStatus === "PARTIALLY_PAID" ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-amber-600">COD: PKR {Number(order.codRemaining ?? order.totalAmount).toLocaleString()}</span>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground capitalize">{order.paymentMethod}</div>
                    )}
                    {activeTab !== "FULFILLED" && activeTab !== "CANCELLED" && order.codPaymentStatus !== "PAID" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 px-1 text-xs text-muted-foreground mt-0.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPaymentModal({
                            open: true,
                            orderId: order.id,
                            orderNumber: order.orderNumber,
                            totalAmount: Number(order.totalAmount),
                            prepaidAmount: Number(order.prepaidAmount || 0),
                          });
                        }}
                        data-testid={`button-quick-pay-${order.id}`}
                      >
                        <Plus className="w-3 h-3 mr-0.5" />Pay
                      </Button>
                    )}
                  </td>
                  <td className="px-3 py-2.5 hidden lg:table-cell text-xs text-muted-foreground max-w-[150px] truncate">
                    {order.totalQuantity || 1} item{(order.totalQuantity || 1) > 1 ? "s" : ""}
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell" data-testid={`cell-tags-${order.id}`}>
                    <div className="flex flex-wrap gap-1">
                      {getRoboTags(order.tags as string[]).map(tag => (
                        <Badge key={tag} className={`text-xs ${ROBO_TAG_CONFIG[tag]?.className}`} data-testid={`badge-tag-${tag}-${order.id}`}>
                          {ROBO_TAG_CONFIG[tag]?.label}
                        </Badge>
                      ))}
                    </div>
                  </td>

                  {/* Pending-specific columns */}
                  {activeTab === "PENDING" && (
                    <td className="px-3 py-2.5">
                      <Badge variant="secondary" className="text-xs mb-1" data-testid={`badge-pending-reason-${order.id}`}>
                        {PENDING_REASON_TYPES.find(r => r.value === order.pendingReasonType)?.label || order.pendingReasonType || "Unknown"}
                      </Badge>
                      {order.pendingReason && (
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">{order.pendingReason}</div>
                      )}
                    </td>
                  )}

                  {/* Hold-specific columns */}
                  {activeTab === "HOLD" && (
                    <td className="px-3 py-2.5">
                      {order.holdUntil ? (
                        <div>
                          <div className="text-xs">{format(new Date(order.holdUntil), "MMM d, h:mm a")}</div>
                          <HoldCountdown holdUntil={order.holdUntil} />
                        </div>
                      ) : "-"}
                    </td>
                  )}

                  {/* Fulfilled-specific columns */}
                  {activeTab === "FULFILLED" && (
                    <>
                      <td className="px-3 py-2.5">
                        <div className="text-xs font-medium">{order.courierName || "-"}</div>
                        <div className="text-xs text-muted-foreground">{order.courierTracking || "-"}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge className={`text-xs ${UNIVERSAL_STATUS_COLORS[order.shipmentStatus || ""] || "bg-slate-100 text-slate-700"}`}
                          data-testid={`badge-status-${order.id}`}
                          title={order.courierRawStatus || undefined}>
                          {UNIVERSAL_STATUS_LABELS[order.shipmentStatus || ""] || order.shipmentStatus || "Unknown"}
                        </Badge>
                      </td>
                    </>
                  )}

                  {/* Cancelled-specific columns */}
                  {activeTab === "CANCELLED" && (
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-muted-foreground">{order.cancelReason || "No reason given"}</div>
                      {order.cancelledAt && (
                        <div className="text-xs text-muted-foreground/70">{format(new Date(order.cancelledAt), "MMM d, h:mm a")}</div>
                      )}
                    </td>
                  )}

                  {/* Action buttons */}
                  {activeTab !== "FULFILLED" && (
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(activeTab === "NEW" || activeTab === "PENDING" || activeTab === "HOLD") && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-600"
                            onClick={() => handleSingleAction(order.id, activeTab === "HOLD" ? "release-hold" : activeTab === "PENDING" ? "fix-confirm" : "confirm")}
                            disabled={isPending}
                            data-testid={`button-confirm-${order.id}`}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            {activeTab === "HOLD" ? "Release" : "Confirm"}
                          </Button>
                        )}
                        {activeTab === "PENDING" && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                            onClick={() => {
                              setEditingOrder(order.id);
                              setEditPhone(order.customerPhone || "");
                              setEditAddress(order.shippingAddress || "");
                              setEditCity(order.city || "");
                            }}
                            data-testid={`button-edit-${order.id}`}>
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {activeTab === "NEW" && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-amber-600"
                            onClick={() => handleSingleAction(order.id, "pending")}
                            disabled={isPending}
                            data-testid={`button-pending-${order.id}`}>
                            <Clock className="w-3.5 h-3.5 mr-1" />Pending
                          </Button>
                        )}
                        {(activeTab === "NEW" || activeTab === "PENDING") && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-purple-600"
                            onClick={() => handleSingleAction(order.id, "hold")}
                            disabled={isPending}
                            data-testid={`button-hold-${order.id}`}>
                            <Pause className="w-3.5 h-3.5 mr-1" />Hold
                          </Button>
                        )}
                        {activeTab === "HOLD" && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-amber-600"
                            onClick={() => handleSingleAction(order.id, "move-to-pending")}
                            disabled={isPending}
                            data-testid={`button-to-pending-${order.id}`}>
                            <Clock className="w-3.5 h-3.5 mr-1" />Pending
                          </Button>
                        )}
                        {activeTab === "READY_TO_SHIP" && (
                          <Badge variant="secondary" className="text-xs">Ready</Badge>
                        )}
                        {activeTab !== "NEW" && order.previousWorkflowStatus && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground"
                            onClick={() => workflowMutation.mutate({ orderId: order.id, action: "revert" })}
                            disabled={isPending}
                            data-testid={`button-revert-${order.id}`}>
                            <Undo2 className="w-3.5 h-3.5 mr-1" />Revert
                          </Button>
                        )}
                        {(activeTab === "NEW" || activeTab === "PENDING" || activeTab === "HOLD") && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600"
                            onClick={() => handleSingleAction(order.id, "cancel")}
                            disabled={isPending}
                            data-testid={`button-cancel-${order.id}`}>
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-1.5 border-t bg-background">
          <div className="text-xs text-muted-foreground" data-testid="text-total-orders">
            {total} orders
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => setPage(1)} disabled={page <= 1} data-testid="button-first-page">
              <ChevronsLeft className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} data-testid="button-prev-page">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Select value={String(page)} onValueChange={v => setPage(Number(v))}>
              <SelectTrigger className="h-8 w-auto min-w-[100px] text-xs" data-testid="select-page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: totalPages }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>Page {i + 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="icon" variant="ghost" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} data-testid="button-next-page">
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setPage(totalPages)} disabled={page >= totalPages} data-testid="button-last-page">
              <ChevronsRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      <Dialog open={cancelModal.open} onOpenChange={open => { if (!open) setCancelModal({ open: false, orderIds: [] }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {cancelModal.orderIds.length > 1 ? `${cancelModal.orderIds.length} Orders` : "Order"}</DialogTitle>
            <DialogDescription>Please provide a reason for cancellation.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Cancel reason..."
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            className="min-h-[80px]"
            data-testid="input-cancel-reason"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelModal({ open: false, orderIds: [] })}>Back</Button>
            <Button variant="destructive" onClick={submitCancel} disabled={!cancelReason.trim()} data-testid="button-submit-cancel">
              Cancel Order{cancelModal.orderIds.length > 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pending Modal */}
      <Dialog open={pendingModal.open} onOpenChange={open => { if (!open) setPendingModal({ open: false, orderIds: [] }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Pending</DialogTitle>
            <DialogDescription>Select the reason why {pendingModal.orderIds.length > 1 ? "these orders are" : "this order is"} pending.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={pendingReasonType} onValueChange={setPendingReasonType}>
              <SelectTrigger data-testid="select-pending-reason-type">
                <SelectValue placeholder="Select reason type" />
              </SelectTrigger>
              <SelectContent>
                {PENDING_REASON_TYPES.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Additional notes (optional)"
              value={pendingReason}
              onChange={e => setPendingReason(e.target.value)}
              className="min-h-[60px]"
              data-testid="input-pending-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingModal({ open: false, orderIds: [] })}>Back</Button>
            <Button onClick={submitPending} disabled={!pendingReasonType} data-testid="button-submit-pending">
              Mark Pending
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hold Modal */}
      <Dialog open={holdModal.open} onOpenChange={open => { if (!open) setHoldModal({ open: false, orderIds: [] }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hold {holdModal.orderIds.length > 1 ? `${holdModal.orderIds.length} Orders` : "Order"}</DialogTitle>
            <DialogDescription>Set the date and time until when this order should be held.</DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Hold Until</label>
            <Input
              type="datetime-local"
              value={holdUntil}
              onChange={e => setHoldUntil(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              data-testid="input-hold-until"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHoldModal({ open: false, orderIds: [] })}>Back</Button>
            <Button onClick={submitHold} disabled={!holdUntil} data-testid="button-submit-hold">
              Set Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking Confirmation Modal */}
      <Dialog open={bookingConfirmModal.open} onOpenChange={open => { if (!open) setBookingConfirmModal({ open: false, preview: null }); }}>
        <DialogContent className="max-w-[95vw] w-[1200px]">
          <DialogHeader>
            <DialogTitle>Confirm Booking via {selectedCourier === "leopards" ? "Leopards" : "PostEx"}</DialogTitle>
            <DialogDescription>Review and edit order details before booking. All fields except Order ID are editable.</DialogDescription>
          </DialogHeader>
          {bookingConfirmModal.preview && (() => {
            const allOrders = [
              ...bookingConfirmModal.preview.valid.map((v: any) => ({ ...v, _type: "valid" as const })),
              ...bookingConfirmModal.preview.invalid.map((v: any) => ({ ...v, _type: "invalid" as const })),
            ];
            const allValidIds = bookingConfirmModal.preview.valid.map((v: any) => v.orderId);
            const allChecked = allValidIds.length > 0 && allValidIds.every((id: string) => previewChecked.has(id));
            const courierName = bookingConfirmModal.preview.courier;
            const leopardsModes = ["Overnight", "Detain", "Overland"];
            const postexModes = ["Normal", "Reversed", "Replacement"];
            const modeOptions = courierName === "leopards" ? leopardsModes : postexModes;
            const updateField = (orderId: string, field: string, value: any) => {
              setPreviewOverrides(prev => ({
                ...prev,
                [orderId]: { ...prev[orderId], [field]: value },
              }));
            };
            return (
              <div className="space-y-3">
                {allOrders.length > 0 && (
                  <div className="overflow-x-auto max-h-[55vh] overflow-y-auto border rounded-md">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0 z-10">
                        <tr className="border-b">
                          <th className="px-1 py-2 text-left w-8">
                            <Checkbox
                              checked={allChecked}
                              onCheckedChange={(checked) => {
                                if (checked) setPreviewChecked(new Set(allValidIds));
                                else setPreviewChecked(new Set());
                              }}
                              data-testid="checkbox-preview-all"
                            />
                          </th>
                          <th className="px-1 py-2 text-left font-medium w-6">#</th>
                          <th className="px-1 py-2 text-left font-medium">Order</th>
                          <th className="px-1 py-2 text-left font-medium min-w-[100px]">Name</th>
                          <th className="px-1 py-2 text-left font-medium min-w-[100px]">Phone</th>
                          <th className="px-1 py-2 text-left font-medium min-w-[140px]">Address</th>
                          <th className="px-1 py-2 text-left font-medium min-w-[120px]">City</th>
                          <th className="px-1 py-2 text-left font-medium min-w-[70px]">COD</th>
                          <th className="px-1 py-2 text-left font-medium w-16">Gram</th>
                          <th className="px-1 py-2 text-left font-medium min-w-[100px]">Description</th>
                          <th className="px-1 py-2 text-left font-medium w-8">Pcs</th>
                          <th className="px-1 py-2 text-left font-medium min-w-[100px]">Type</th>
                          <th className="px-1 py-2 text-left font-medium w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {allOrders.map((order: any, idx: number) => {
                          const isValid = order._type === "valid";
                          const isChecked = previewChecked.has(order.orderId);
                          const ovr = previewOverrides[order.orderId];
                          const hasError = !isValid && order.missingFields?.length > 0;
                          const cityNotMatched = !order.cityMatched;
                          return (
                            <tr
                              key={order.orderId}
                              className={`border-b last:border-b-0 ${hasError ? "bg-red-50/50 dark:bg-red-950/20" : ""} ${!isChecked && isValid ? "opacity-50" : ""}`}
                              data-testid={`preview-row-${order.orderId}`}
                            >
                              <td className="px-1 py-1">
                                {isValid ? (
                                  <Checkbox
                                    checked={isChecked}
                                    onCheckedChange={(checked) => {
                                      const next = new Set(previewChecked);
                                      if (checked) next.add(order.orderId);
                                      else next.delete(order.orderId);
                                      setPreviewChecked(next);
                                    }}
                                    data-testid={`checkbox-preview-${order.orderId}`}
                                  />
                                ) : (
                                  <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                                )}
                              </td>
                              <td className="px-1 py-1 text-muted-foreground">{idx + 1}</td>
                              <td className="px-1 py-1 font-medium whitespace-nowrap">{order.orderNumber}</td>
                              <td className="px-1 py-1">
                                <Input
                                  className="h-6 text-xs px-1 min-w-[90px]"
                                  value={ovr?.customerName ?? order.customerName ?? ""}
                                  onChange={(e) => updateField(order.orderId, "customerName", e.target.value)}
                                  data-testid={`input-name-${order.orderId}`}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <Input
                                  className="h-6 text-xs px-1 font-mono min-w-[95px]"
                                  value={ovr?.phone ?? order.phone ?? ""}
                                  onChange={(e) => updateField(order.orderId, "phone", e.target.value)}
                                  data-testid={`input-phone-${order.orderId}`}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <Input
                                  className="h-6 text-xs px-1 min-w-[130px]"
                                  value={ovr?.address ?? order.address ?? ""}
                                  onChange={(e) => updateField(order.orderId, "address", e.target.value)}
                                  data-testid={`input-address-${order.orderId}`}
                                />
                              </td>
                              <td className="px-1 py-1">
                                {courierCities.length > 0 ? (
                                  <div className="flex flex-col gap-0.5">
                                    <Select
                                      value={ovr?.city ?? order.city ?? ""}
                                      onValueChange={(val) => updateField(order.orderId, "city", val)}
                                    >
                                      <SelectTrigger
                                        className={`h-6 text-xs px-1 min-w-[110px] ${cityNotMatched && !(ovr?.city && courierCities.some(c => c.name === ovr.city)) ? "border-orange-400 dark:border-orange-600" : ""}`}
                                        data-testid={`select-city-${order.orderId}`}
                                      >
                                        <SelectValue placeholder="Select city" />
                                      </SelectTrigger>
                                      <SelectContent className="max-h-[200px]">
                                        {courierCities.map((c) => (
                                          <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {cityNotMatched && !(ovr?.city && courierCities.some(c => c.name === ovr.city)) && (
                                      <span className="text-[9px] text-orange-500 leading-tight">No match: "{order.city}"</span>
                                    )}
                                  </div>
                                ) : (
                                  <Input
                                    className="h-6 text-xs px-1 min-w-[90px]"
                                    value={ovr?.city ?? order.city ?? ""}
                                    onChange={(e) => updateField(order.orderId, "city", e.target.value)}
                                    data-testid={`input-city-${order.orderId}`}
                                  />
                                )}
                              </td>
                              <td className="px-1 py-1">
                                <Input
                                  type="number"
                                  min={0}
                                  className="h-6 w-[65px] text-xs px-1 text-center"
                                  value={ovr?.codAmount ?? order.codAmount ?? 0}
                                  onChange={(e) => updateField(order.orderId, "codAmount", parseFloat(e.target.value) || 0)}
                                  data-testid={`input-cod-${order.orderId}`}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <Input
                                  type="number"
                                  min={1}
                                  className="h-6 w-16 text-xs px-1 text-center"
                                  value={ovr?.weight ?? 200}
                                  onChange={(e) => updateField(order.orderId, "weight", parseInt(e.target.value) || 200)}
                                  data-testid={`input-weight-${order.orderId}`}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <Input
                                  className="h-6 text-xs px-1 min-w-[90px]"
                                  value={ovr?.description ?? order.productDescription ?? ""}
                                  onChange={(e) => updateField(order.orderId, "description", e.target.value)}
                                  data-testid={`input-desc-${order.orderId}`}
                                />
                              </td>
                              <td className="px-1 py-1 text-center">{order.pieces || 1}</td>
                              <td className="px-1 py-1">
                                <Select
                                  value={ovr?.mode ?? modeOptions[0]}
                                  onValueChange={(val) => updateField(order.orderId, "mode", val)}
                                >
                                  <SelectTrigger className="h-6 min-w-[90px] text-xs px-1" data-testid={`select-mode-${order.orderId}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {modeOptions.map(m => (
                                      <SelectItem key={m} value={m}>{m}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-1 py-1">
                                {hasError && (
                                  <span className="text-red-500 text-[10px] whitespace-nowrap" title={order.missingFields.join(", ")}>
                                    {order.missingFields.join(", ")}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {bookingConfirmModal.preview.alreadyBooked?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Package className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-xs font-medium text-blue-600">{bookingConfirmModal.preview.alreadyBooked.length} already booked (skipped)</span>
                    </div>
                    <div className="space-y-0.5">
                      {bookingConfirmModal.preview.alreadyBooked.map((ab: any) => (
                        <div key={ab.orderId} className="flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded bg-blue-50 dark:bg-blue-950/30" data-testid={`preview-booked-${ab.orderId}`}>
                          <span className="font-medium">{ab.orderNumber}</span>
                          <span className="font-mono text-blue-700 dark:text-blue-400">{ab.trackingNumber}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground border-t pt-2">
                  <span>{checkedCount} of {bookingConfirmModal.preview.valid.length} orders selected for booking</span>
                  {bookingConfirmModal.preview.invalid.length > 0 && (
                    <span className="text-red-500">{bookingConfirmModal.preview.invalid.length} with errors (shown in table)</span>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBookingConfirmModal({ open: false, preview: null })} data-testid="button-cancel-booking">Back</Button>
            <Button
              onClick={submitBooking}
              disabled={checkedCount === 0}
              data-testid="button-confirm-booking"
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Book {checkedCount} Orders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking Results Modal */}
      <Dialog open={bookingResultsModal.open} onOpenChange={open => { if (!open) setBookingResultsModal({ open: false, results: null }); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Booking Results</DialogTitle>
            <DialogDescription>
              {bookingResultsModal.results && (
                <span>{bookingResultsModal.results.summary.success} of {bookingResultsModal.results.summary.total} orders booked successfully.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          {bookingResultsModal.results && (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {bookingResultsModal.results.results.filter((r: any) => r.success).length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-600">Booked Successfully</span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {bookingResultsModal.results.batchId && (
                        <Button size="sm" variant="outline" onClick={() => window.open(`/api/print/batch-awb/${bookingResultsModal.results.batchId}.pdf`, "_blank")} data-testid="button-download-awb">
                          <Printer className="w-3.5 h-3.5 mr-1" />Download Courier AWBs
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={copyTrackingNumbers} data-testid="button-copy-tracking">
                        <Copy className="w-3.5 h-3.5 mr-1" />Copy Tracking
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {bookingResultsModal.results.results.filter((r: any) => r.success).map((r: any) => (
                      <div key={r.orderId} className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded bg-green-50 dark:bg-green-950/30" data-testid={`result-success-${r.orderId}`}>
                        <span className="font-medium">{r.orderNumber}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-green-700 dark:text-green-400">{r.trackingNumber}</span>
                          {r.slipUrl && (
                            <a href={r.slipUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {bookingResultsModal.results.results.filter((r: any) => !r.success).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="w-4 h-4 text-red-600" />
                    <span className="text-sm font-medium text-red-600">Failed</span>
                  </div>
                  <div className="space-y-1.5">
                    {bookingResultsModal.results.results.filter((r: any) => !r.success).map((r: any) => (
                      <div key={r.orderId} className="text-xs px-3 py-2 rounded bg-red-50 dark:bg-red-950/30" data-testid={`result-failed-${r.orderId}`}>
                        <div className="font-medium mb-1">{r.orderNumber}</div>
                        <div className="text-red-600 dark:text-red-400 whitespace-pre-wrap break-words leading-relaxed">{r.error}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setBookingResultsModal({ open: false, results: null })} data-testid="button-close-results">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Payment Modal */}
      <Dialog open={paymentModal.open} onOpenChange={(open) => !open && setPaymentModal({ open: false, orderId: "", orderNumber: "", totalAmount: 0, prepaidAmount: 0 })}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add Payment - {paymentModal.orderNumber}</DialogTitle>
            <DialogDescription>
              Total: PKR {paymentModal.totalAmount.toLocaleString()} | Paid: PKR {paymentModal.prepaidAmount.toLocaleString()} | Remaining: PKR {Math.max(paymentModal.totalAmount - paymentModal.prepaidAmount, 0).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="number"
              placeholder="Payment amount"
              value={quickPayAmount}
              onChange={(e) => setQuickPayAmount(e.target.value)}
              data-testid="input-quick-pay-amount"
            />
            <Select value={quickPayMethod} onValueChange={setQuickPayMethod}>
              <SelectTrigger data-testid="select-quick-pay-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="BANK">Bank</SelectItem>
                <SelectItem value="JAZZCASH">JazzCash</SelectItem>
                <SelectItem value="EASYPAISA">Easypaisa</SelectItem>
                <SelectItem value="CARD">Card</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                quickPayMutation.mutate({
                  orderId: paymentModal.orderId,
                  amount: Math.max(paymentModal.totalAmount - paymentModal.prepaidAmount, 0),
                  method: quickPayMethod,
                });
              }}
              disabled={quickPayMutation.isPending || paymentModal.prepaidAmount >= paymentModal.totalAmount}
              data-testid="button-quick-mark-paid"
            >
              Mark Fully Paid
            </Button>
            <Button
              onClick={() => {
                const amt = parseFloat(quickPayAmount);
                if (!amt || amt <= 0) return;
                quickPayMutation.mutate({ orderId: paymentModal.orderId, amount: amt, method: quickPayMethod });
              }}
              disabled={quickPayMutation.isPending || !quickPayAmount}
              data-testid="button-quick-pay-submit"
            >
              {quickPayMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
              Add Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
