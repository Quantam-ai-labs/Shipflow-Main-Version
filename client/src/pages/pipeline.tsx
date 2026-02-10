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
                    <div className="text-xs text-muted-foreground capitalize">{order.paymentMethod}</div>
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
    </div>
  );
}
