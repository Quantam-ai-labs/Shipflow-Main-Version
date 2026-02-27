import { useState, useCallback, useMemo, useEffect } from "react";
import { AIInsightsBanner } from "@/components/ai-insights-banner";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  FileText,
  History,
  PenLine,
  RefreshCw,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Order } from "@shared/schema";
import { Link, useParams } from "wouter";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { useDateRange } from "@/contexts/date-range-context";
import { useRef } from "react";

function CityAutocomplete({ value, onChange, cities, hasWarning, testId }: {
  value: string;
  onChange: (val: string) => void;
  cities: Array<{ id?: number; name: string }>;
  hasWarning?: boolean;
  testId?: string;
}) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value || ""); }, [value]);

  const filtered = useMemo(() => {
    if (!query) return cities.slice(0, 30);
    const q = query.toLowerCase();
    return cities.filter(c => c.name.toLowerCase().includes(q)).slice(0, 30);
  }, [query, cities]);

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        className={`h-8 text-xs px-1.5 min-w-[100px] border-0 shadow-none focus-visible:ring-1 bg-transparent ${hasWarning ? "ring-1 ring-orange-400 dark:ring-orange-600" : ""}`}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setTimeout(() => setOpen(false), 150); }}
        placeholder="Type city..."
        data-testid={testId}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 w-[220px] max-h-[200px] overflow-y-auto bg-popover border rounded-md shadow-lg mt-0.5">
          {filtered.map((c) => (
            <div
              key={c.name}
              className={`px-2 py-1 text-xs cursor-pointer hover-elevate ${c.name === value ? "bg-primary/10 font-medium" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(c.name);
                setQuery(c.name);
                setOpen(false);
              }}
              data-testid={`city-option-${c.name}`}
            >
              {c.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STAGE_TO_STATUS: Record<string, string> = {
  new: "NEW",
  pending: "PENDING",
  hold: "HOLD",
  ready: "READY_TO_SHIP",
  booked: "BOOKED",
  fulfilled: "FULFILLED",
  delivered: "DELIVERED",
  return: "RETURN",
  cancelled: "CANCELLED",
};

const STAGE_TITLES: Record<string, string> = {
  NEW: "New Orders",
  PENDING: "Pending Orders",
  HOLD: "On Hold",
  READY_TO_SHIP: "Ready to Ship",
  BOOKED: "Booked",
  FULFILLED: "Fulfilled",
  DELIVERED: "Delivered",
  RETURN: "Returned",
  CANCELLED: "Cancelled Orders",
};

const PENDING_REASON_TYPES = [
  { value: "INCOMPLETE_ADDRESS", label: "Address" },
  { value: "MISSING_PHONE", label: "Phone" },
  { value: "WRONG_CITY", label: "City" },
  { value: "CUSTOMER_NOT_RESPONDING", label: "No Response" },
  { value: "CUSTOMER_REQUESTED_CHANGE", label: "Change Req" },
  { value: "FRAUD_SUSPECTED", label: "Fraud" },
  { value: "AUTO_12H", label: "Auto" },
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
  'READY_FOR_RETURN': "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  'RETURN_IN_TRANSIT': "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  'RETURNED_TO_ORIGIN': "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
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
  'RETURNED_TO_SHIPPER': 'Returned', 'READY_FOR_RETURN': 'Ready for Return', 'RETURN_IN_TRANSIT': 'Return in Transit',
  'RETURNED_TO_ORIGIN': 'Returned to Origin', 'CANCELLED': 'Cancelled', 'Unfulfilled': 'Unfulfilled',
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
  const [pageSize] = useState(100);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingReasonFilter, setPendingReasonFilter] = useState("all");
  const [shipmentSubFilter, setShipmentSubFilter] = useState("all");
  const { dateRange, dateParams } = useDateRange();

  const [cancelModal, setCancelModal] = useState<{ open: boolean; orderIds: string[]; fromTab?: string }>({ open: false, orderIds: [] });
  const [cancelReason, setCancelReason] = useState("");
  const [cancelAlsoShopify, setCancelAlsoShopify] = useState(false);
  const [pendingModal, setPendingModal] = useState<{ open: boolean; orderIds: string[] }>({ open: false, orderIds: [] });
  const [pendingReasonType, setPendingReasonType] = useState("");
  const [pendingReason, setPendingReason] = useState("");
  const [holdModal, setHoldModal] = useState<{ open: boolean; orderIds: string[] }>({ open: false, orderIds: [] });
  const [holdUntil, setHoldUntil] = useState("");

  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
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
    pieces: number;
  }>>({});
  const [courierCities, setCourierCities] = useState<Array<{ id?: number; name: string }>>([]);

  const [paymentModal, setPaymentModal] = useState<{ open: boolean; orderId: string; orderNumber: string; totalAmount: number; prepaidAmount: number }>({ open: false, orderId: "", orderNumber: "", totalAmount: 0, prepaidAmount: 0 });
  const [quickPayAmount, setQuickPayAmount] = useState("");
  const [quickPayMethod, setQuickPayMethod] = useState("CASH");
  const [prepaidConfirmOpen, setPrepaidConfirmOpen] = useState(false);
  const [confirmActionModal, setConfirmActionModal] = useState<{ open: boolean; action: string; orderIds: string[]; description: string }>({ open: false, action: "", orderIds: [], description: "" });

  const [remarkDialogOpen, setRemarkDialogOpen] = useState(false);
  const [selectedRemarkOrder, setSelectedRemarkOrder] = useState<Order | null>(null);
  const [remarkValue, setRemarkValue] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    setSearch("");
    setPendingReasonFilter("all");
    setShipmentSubFilter("all");
  }, [activeTab]);

  const { data, isLoading, isFetching } = useQuery<{ orders: Order[]; total: number }>({
    queryKey: ["/api/orders", { workflowStatus: activeTab, search: debouncedSearch, page, pageSize, pendingReasonType: activeTab === "PENDING" ? pendingReasonFilter : undefined, shipmentStatus: shipmentSubFilter !== "all" ? shipmentSubFilter : undefined, dateFrom: dateParams.dateFrom, dateTo: dateParams.dateTo }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("workflowStatus", activeTab);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("light", "1");
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (activeTab === "PENDING" && pendingReasonFilter !== "all") params.set("pendingReasonType", pendingReasonFilter);
      if (shipmentSubFilter !== "all") params.set("shipmentStatus", shipmentSubFilter);
      if (dateParams.dateFrom) params.set("dateFrom", dateParams.dateFrom);
      if (dateParams.dateTo) params.set("dateTo", dateParams.dateTo);
      const res = await fetch(`/api/orders?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const SHIPMENT_SUB_TABS: Record<string, { value: string; label: string }[]> = {
    BOOKED: [
      { value: "all", label: "All" },
      { value: "BOOKED", label: "Awaiting Pickup" },
      { value: "PICKED_UP", label: "Picked Up" },
    ],
    FULFILLED: [
      { value: "all", label: "All" },
      { value: "PICKED_UP", label: "Picked Up" },
      { value: "ARRIVED_AT_ORIGIN", label: "At Origin" },
      { value: "IN_TRANSIT", label: "In Transit" },
      { value: "ARRIVED_AT_DESTINATION", label: "At Destination" },
      { value: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
      { value: "DELIVERY_ATTEMPTED", label: "Attempted" },
      { value: "DELIVERY_FAILED", label: "Failed" },
      { value: "READY_FOR_RETURN", label: "Ready for Return" },
      { value: "RETURN_PROCESSING", label: "Return Processing" },
    ],
    RETURN: [
      { value: "all", label: "All" },
      { value: "RETURN_IN_TRANSIT", label: "Return in Transit" },
      { value: "RETURNED_TO_ORIGIN", label: "Returned to Origin" },
      { value: "RETURNED_TO_SHIPPER", label: "Returned to Shipper" },
    ],
  };

  const orders = data?.orders || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const phoneNumbers = useMemo(() => {
    return orders
      .map(o => o.customerPhone)
      .filter((p): p is string => !!p && p.length > 0);
  }, [orders]);

  const { data: customerHistory } = useQuery<Record<string, { orderCount: number; lastOrderDate: string | null; orderDates: string[] }>>({
    queryKey: ["/api/orders/customer-history-batch", phoneNumbers],
    queryFn: async () => {
      if (phoneNumbers.length === 0) return {};
      const res = await apiRequest("POST", "/api/orders/customer-history-batch", { phoneNumbers });
      return res.json();
    },
    enabled: phoneNumbers.length > 0,
    staleTime: 60 * 1000,
  });

  const getProximityColor = useCallback((orderDate: string | Date | null | undefined, orderDates: string[]) => {
    if (!orderDate || orderDates.length <= 1) return null;
    const current = new Date(orderDate).getTime();
    let minDays = Infinity;
    for (const d of orderDates) {
      const t = new Date(d).getTime();
      if (t === current) continue;
      const diff = Math.abs(t - current) / (1000 * 60 * 60 * 24);
      if (diff < minDays) minDays = diff;
    }
    if (minDays === Infinity) return null;
    if (minDays <= 5) return "red";
    if (minDays <= 10) return "blue";
    return "green";
  }, []);

  const [historyPopup, setHistoryPopup] = useState<{ phone: string; customerName: string } | null>(null);

  const { data: historyDetail } = useQuery<{ phone: string; orderCount: number; orders: any[] }>({
    queryKey: ["/api/orders/customer-history", historyPopup?.phone],
    queryFn: async () => {
      const res = await fetch(`/api/orders/customer-history/${encodeURIComponent(historyPopup!.phone)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!historyPopup?.phone,
  });

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
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/workflow-counts"] });
      const previousStatus = activeTab;
      setSelectedIds(new Set());
      const actionLabel: Record<string, string> = { confirm: "confirmed", cancel: "cancelled", pending: "set to pending", hold: "put on hold", "release-hold": "released" };
      const label = actionLabel[variables.action] || "updated";
      const skipped = data?.skipped || 0;
      const updated = data?.updated || variables.orderIds.length;
      const skippedMsg = skipped > 0 ? ` (${skipped} skipped — already in target stage or transition not allowed)` : "";
      const canUndo = ["confirm", "release-hold"].includes(variables.action);
      if (canUndo) {
        const { dismiss } = toast({
          title: `${updated} order${updated !== 1 ? "s" : ""} ${label}${skippedMsg}`,
          description: "Click Undo to revert.",
          action: (
            <Button
              variant="outline"
              size="sm"
              data-testid="button-undo-workflow"
              onClick={() => {
                dismiss();
                const revertAction = previousStatus === "NEW" ? "revert-new" : previousStatus === "HOLD" ? "hold" : "pending";
                Promise.all(variables.orderIds.map(id =>
                  apiRequest("POST", `/api/orders/${id}/workflow`, { action: "revert" })
                )).then(() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/orders/workflow-counts"] });
                  toast({ title: "Action reverted", description: `${variables.orderIds.length} order${variables.orderIds.length > 1 ? "s" : ""} restored.` });
                }).catch(() => {
                  toast({ title: "Undo failed", description: "Some orders could not be reverted.", variant: "destructive" });
                });
              }}
            >
              <Undo2 className="w-3.5 h-3.5 mr-1" />Undo
            </Button>
          ),
          duration: 10000,
        });
      } else {
        toast({ title: `${updated} order${updated !== 1 ? "s" : ""} ${label}${skippedMsg}` });
      }
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setSelectedIds(new Set());
      const { orderIds } = variables;
      const { dismiss } = toast({
        title: `${orderIds.length} order${orderIds.length > 1 ? "s" : ""} marked as prepaid`,
        description: "Click Undo to revert this action.",
        action: (
          <Button
            variant="outline"
            size="sm"
            data-testid="button-undo-prepaid"
            onClick={() => {
              dismiss();
              Promise.all(orderIds.map(id =>
                apiRequest("POST", `/api/orders/${id}/payments/reset`)
              )).then(() => {
                queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
                toast({ title: "Prepaid status reverted", description: `${orderIds.length} order${orderIds.length > 1 ? "s" : ""} reset to unpaid.` });
              }).catch(() => {
                toast({ title: "Undo failed", description: "Some orders could not be reverted.", variant: "destructive" });
              });
            }}
          >
            <Undo2 className="w-3.5 h-3.5 mr-1" />Undo
          </Button>
        ),
        duration: 10000,
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to mark as prepaid", variant: "destructive" });
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

  const openRemarkDialog = (order: Order) => {
    setSelectedRemarkOrder(order);
    setRemarkValue(order.remark || "");
    setRemarkDialogOpen(true);
  };

  const [cancelConfirm, setCancelConfirm] = useState<{ open: boolean; orderId: string; type: "courier" | "shopify"; orderNumber?: string } | null>(null);

  const cancelBookingMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/orders/${orderId}/cancel-booking`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/workflow-counts"] });
      if (data.fulfillmentWarning) {
        toast({ title: "Booking cancelled", description: "Courier AWB cancelled and order moved to Ready to Ship, but Shopify fulfillment could not be reversed. You may need to cancel it manually in Shopify.", variant: "destructive" });
      } else {
        toast({ title: "Booking cancelled", description: "Courier AWB cancelled, Shopify fulfillment reversed, and order moved back to Ready to Ship" });
      }
      setCancelConfirm(null);
    },
    onError: (err: any) => {
      let description = "Failed to cancel booking";
      try {
        const raw = err.message || "";
        const jsonPart = raw.includes(": {") ? raw.substring(raw.indexOf(": {") + 2) : raw.includes(":{") ? raw.substring(raw.indexOf(":{") + 1) : "";
        if (jsonPart) {
          const parsed = JSON.parse(jsonPart);
          description = parsed.message || description;
        } else if (raw) {
          description = raw.replace(/^\d+:\s*/, "");
        }
      } catch {
        const raw = err.message || "";
        description = raw.replace(/^\d+:\s*/, "") || description;
      }
      toast({ title: "Cannot cancel", description, variant: "destructive" });
      setCancelConfirm(null);
    },
  });

  const bulkCleanupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/orders/bulk-cleanup-cancelled");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/workflow-counts"] });
      toast({ title: "Cleanup complete", description: `${data.cleaned} cancelled order(s) moved back to Ready to Ship` });
    },
    onError: () => {
      toast({ title: "Cleanup failed", description: "Could not clean up cancelled orders", variant: "destructive" });
    },
  });

  const loadsheetMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const res = await apiRequest("POST", "/api/orders/generate-loadsheet", { orderIds });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.pdfUrl) {
        window.open(data.pdfUrl, "_blank");
      }
      const transMsg = data.transitioned > 0
        ? ` ${data.transitioned} order(s) moved to Fulfilled.`
        : "";
      toast({ title: "Loadsheet generated", description: `Loadsheet created for ${data.totalOrders} order(s).${transMsg}` });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/workflow-counts"] });
    },
    onError: (err: any) => {
      toast({ title: "Loadsheet failed", description: err.message || "Failed to generate loadsheet", variant: "destructive" });
    },
  });

  const cancelShopifyMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/orders/${orderId}/cancel-shopify`, { reason: "other" });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/workflow-counts"] });
      if (data.shopifyWarning) {
        toast({ title: "Order cancelled locally", description: "Shopify sync failed but order is cancelled in ShipFlow. You may need to reconnect your Shopify store.", variant: "destructive" });
      } else {
        toast({ title: "Shopify order cancelled", description: "Order cancelled on Shopify and moved to Cancelled" });
      }
      setCancelConfirm(null);
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Cannot cancel", description: err.message || "Failed to cancel on Shopify", variant: "destructive" });
      setCancelConfirm(null);
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
      setCancelModal({ open: true, orderIds: [orderId], fromTab: activeTab });
      setCancelAlsoShopify(false);
    } else if (action === "pending" || action === "move-to-pending") {
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
      setCancelModal({ open: true, orderIds: ids, fromTab: activeTab });
      setCancelAlsoShopify(false);
    } else if (action === "pending") {
      setPendingModal({ open: true, orderIds: ids });
    } else if (action === "hold") {
      setHoldModal({ open: true, orderIds: ids });
    } else if (action === "confirm") {
      setConfirmActionModal({
        open: true,
        action: "confirm",
        orderIds: ids,
        description: `Move ${ids.length} order${ids.length > 1 ? "s" : ""} to Ready to Ship? This action can be undone.`,
      });
    } else {
      bulkWorkflowMutation.mutate({ orderIds: ids, action });
    }
  }, [selectedIds, bulkWorkflowMutation]);

  const submitCancel = useCallback(() => {
    if (!cancelReason.trim()) return;
    const extra: any = { cancelReason };
    if (cancelAlsoShopify) {
      extra.cancelOnShopify = true;
    }
    if (cancelModal.orderIds.length === 1) {
      workflowMutation.mutate({ orderId: cancelModal.orderIds[0], action: "cancel", extra });
    } else {
      bulkWorkflowMutation.mutate({ orderIds: cancelModal.orderIds, action: "cancel", extra });
    }
    setCancelModal({ open: false, orderIds: [] });
    setCancelReason("");
    setCancelAlsoShopify(false);
  }, [cancelReason, cancelAlsoShopify, cancelModal, workflowMutation, bulkWorkflowMutation]);

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
        pieces: number;
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
          pieces: v.pieces || 1,
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
      <div className="px-4 pt-3">
        <AIInsightsBanner section="pipeline" />
      </div>
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
          {total > 0 && <span className="font-extrabold text-[#ffffff] bg-[#00000000]">{total.toLocaleString()} orders</span>}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
              queryClient.invalidateQueries({ queryKey: ["/api/orders/workflow-counts"] });
            }}
            title="Refresh pipeline data"
            data-testid="button-refresh-pipeline"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
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
          {(activeTab === "NEW" || activeTab === "PENDING" || activeTab === "HOLD" || activeTab === "READY_TO_SHIP") && (
            <Button size="sm" variant="destructive" onClick={() => handleBulkAction("cancel")} disabled={isPending} data-testid="bulk-cancel">
              <XCircle className="w-3.5 h-3.5 mr-1.5" />Cancel
            </Button>
          )}
          {(activeTab === "NEW" || activeTab === "PENDING" || activeTab === "READY_TO_SHIP") && (
            <Button size="sm" variant="secondary" onClick={() => handleBulkAction("hold")} disabled={isPending} data-testid="bulk-hold">
              <Pause className="w-3.5 h-3.5 mr-1.5" />Hold
            </Button>
          )}
          {(activeTab === "READY_TO_SHIP") && (
            <Button size="sm" variant="secondary" onClick={() => handleBulkAction("pending")} disabled={isPending} data-testid="bulk-pending">
              <Clock className="w-3.5 h-3.5 mr-1.5" />Pending
            </Button>
          )}
          {activeTab === "HOLD" && (
            <Button size="sm" onClick={() => handleBulkAction("release-hold")} disabled={isPending} data-testid="bulk-release">
              <Truck className="w-3.5 h-3.5 mr-1.5" />Release
            </Button>
          )}
          {activeTab === "HOLD" && (
            <Button size="sm" variant="secondary" onClick={() => handleBulkAction("pending")} disabled={isPending} data-testid="bulk-pending-hold">
              <Clock className="w-3.5 h-3.5 mr-1.5" />Pending
            </Button>
          )}

          {(activeTab === "NEW" || activeTab === "PENDING" || activeTab === "HOLD" || activeTab === "READY_TO_SHIP") && (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPrepaidConfirmOpen(true)}
                disabled={bulkMarkPrepaidMutation.isPending}
                data-testid="bulk-mark-prepaid"
              >
                <CreditCard className="w-3.5 h-3.5 mr-1.5" />Mark Prepaid
              </Button>
              {selectedIds.size === 1 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const orderId = Array.from(selectedIds)[0];
                    const order = orders.find(o => o.id === orderId);
                    if (order && order.codPaymentStatus !== "PAID") {
                      setPaymentModal({
                        open: true,
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        totalAmount: Number(order.totalAmount),
                        prepaidAmount: Number(order.prepaidAmount || 0),
                      });
                    }
                  }}
                  data-testid="bulk-add-payment"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />Add Payment
                </Button>
              )}
            </>
          )}

          {activeTab === "BOOKED" && selectedIds.size > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const ids = Array.from(selectedIds).join(",");
                  window.open(`/print-labels?ids=${ids}`, "_blank");
                }}
                data-testid="bulk-print-labels"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" />Print Labels
              </Button>
              <Button
                size="sm"
                onClick={() => loadsheetMutation.mutate(Array.from(selectedIds))}
                disabled={loadsheetMutation.isPending}
                data-testid="bulk-generate-loadsheet"
              >
                {loadsheetMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 mr-1.5" />}
                Generate Loadsheet
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  Array.from(selectedIds).forEach(id => cancelBookingMutation.mutate(id));
                }}
                disabled={cancelBookingMutation.isPending}
                data-testid="bulk-cancel-booking"
              >
                <Undo2 className="w-3.5 h-3.5 mr-1.5" />Cancel Booking
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkCleanupMutation.mutate()}
                disabled={bulkCleanupMutation.isPending}
                data-testid="bulk-cleanup-cancelled"
              >
                {bulkCleanupMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5 mr-1.5" />}
                Cleanup Cancelled
              </Button>
            </>
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
      {/* Shipment Status Sub-Tabs */}
      {SHIPMENT_SUB_TABS[activeTab] && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b bg-muted/30 flex-wrap" data-testid="shipment-sub-tabs">
          {SHIPMENT_SUB_TABS[activeTab].map(tab => {
            const isActive = shipmentSubFilter === tab.value;
            return (
              <Button
                key={tab.value}
                size="sm"
                variant={isActive ? "default" : "outline"}
                className="text-xs gap-1"
                onClick={() => {
                  setShipmentSubFilter(tab.value);
                  setPage(1);
                  setSelectedIds(new Set());
                }}
                data-testid={`shipment-filter-${tab.value}`}
              >
                {tab.label}
                {isActive && (
                  <Badge variant="secondary" className="text-[10px] min-w-[1.25rem] justify-center">
                    {total}
                  </Badge>
                )}
              </Button>
            );
          })}
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
                {activeTab !== "CANCELLED" && activeTab !== "DELIVERED" && activeTab !== "RETURN" && (
                  <th className="w-10 px-3 py-2 text-left">
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
                <th className="px-2 py-2.5 text-center font-medium text-muted-foreground w-[40px]" data-testid="header-history">#</th>
                {(activeTab === "NEW" || activeTab === "PENDING") && (
                  <>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Address</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Products</th>
                  </>
                )}
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Amount (PKR)</th>
                <th className="px-3 py-2.5 text-center font-medium text-muted-foreground hidden lg:table-cell w-[40px]">Items</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell max-w-[100px]" data-testid="header-tags">Tags</th>
                {activeTab === "PENDING" && (
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Reason</th>
                )}
                {activeTab === "HOLD" && (
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Hold Until</th>
                )}
                {(activeTab === "BOOKED" || activeTab === "FULFILLED" || activeTab === "DELIVERED" || activeTab === "RETURN") && (
                  <>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Courier</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                  </>
                )}
                {activeTab === "CANCELLED" && (
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Reason</th>
                )}
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground" data-testid="header-remark">Remark</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr
                  key={order.id}
                  className={`border-b transition-colors hover-elevate ${
                    selectedIds.has(order.id) ? "bg-primary/5" : ""
                  } ${activeTab === "HOLD" && order.holdUntil && isPast(new Date(order.holdUntil)) ? "bg-red-50/50 dark:bg-red-950/30" : ""} ${
                    (() => {
                      const hist = order.customerPhone && customerHistory ? customerHistory[order.customerPhone] : null;
                      if (!hist || hist.orderCount <= 1) return "";
                      const c = getProximityColor(order.orderDate, hist.orderDates || []);
                      if (c === "red") return "bg-red-50/40 dark:bg-red-950/20 border-l-2 border-l-red-400 dark:border-l-red-600";
                      if (c === "blue") return "bg-blue-50/40 dark:bg-blue-950/20 border-l-2 border-l-blue-400 dark:border-l-blue-600";
                      return "bg-green-50/40 dark:bg-green-950/20 border-l-2 border-l-green-400 dark:border-l-green-600";
                    })()
                  }`}
                  data-testid={`order-row-${order.id}`}
                >
                  {activeTab !== "CANCELLED" && activeTab !== "DELIVERED" && activeTab !== "RETURN" && (
                    <td className="px-3 py-1.5">
                      <Checkbox
                        checked={selectedIds.has(order.id)}
                        onCheckedChange={() => toggleSelect(order.id)}
                        data-testid={`checkbox-order-${order.id}`}
                      />
                    </td>
                  )}
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/orders/detail/${order.id}`} className="font-medium text-sm hover:underline" data-testid={`link-order-${order.id}`}>
                        {order.orderNumber}
                      </Link>
                      {order.orderSource === "shopify_draft_order" && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700" title="Custom Order" data-testid={`badge-draft-${order.id}`}>
                          <PenLine className="w-2.5 h-2.5 text-green-700 dark:text-green-300" />
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {order.orderDate ? format(new Date(order.orderDate), "MMM d, h:mm a") : ""}
                    </div>
                    {activeTab === "PENDING" && order.lastStatusChangedAt && (
                      <div className="text-xs text-amber-600 dark:text-amber-400" data-testid={`text-pending-duration-${order.id}`}>
                        Pending {formatDistanceToNow(new Date(order.lastStatusChangedAt))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {editingOrder === order.id && (activeTab === "NEW" || activeTab === "PENDING" || activeTab === "READY_TO_SHIP" || activeTab === "BOOKED" || activeTab === "FULFILLED") ? (
                      <div className="space-y-1">
                        <Input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder="Name"
                          className="h-7 text-xs"
                          data-testid={`input-edit-name-${order.id}`}
                        />
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
                              data: { customerName: editName, customerPhone: editPhone, shippingAddress: editAddress, city: editCity }
                            });
                          }} data-testid={`button-save-edit-${order.id}`}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingOrder(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium text-sm truncate max-w-[120px]" title={order.customerName}>{order.customerName && order.customerName.length > 15 ? order.customerName.slice(0, 13) + ".." : order.customerName}</div>
                        <div className="text-xs text-muted-foreground">{order.customerPhone || "No phone"}</div>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 hidden md:table-cell text-sm truncate max-w-[100px]" title={order.city || ""}>{order.city && order.city.length > 15 ? order.city.slice(0, 13) + ".." : (order.city || "-")}</td>
                  <td className="px-1 py-1.5 text-center w-[40px]" data-testid={`cell-history-${order.id}`}>
                    {(() => {
                      const hist = order.customerPhone && customerHistory ? customerHistory[order.customerPhone] : null;
                      const count = hist?.orderCount || 0;
                      if (count <= 1) return <span className="text-[11px] text-muted-foreground">-</span>;
                      const color = getProximityColor(order.orderDate, hist?.orderDates || []);
                      const colorClasses = color === "red"
                        ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-red-200 dark:border-red-700"
                        : color === "blue"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-blue-200 dark:border-blue-700"
                        : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-200 dark:border-green-700";
                      return (
                        <button
                          className="cursor-pointer hover:opacity-80"
                          onClick={() => setHistoryPopup({ phone: order.customerPhone!, customerName: order.customerName || "Customer" })}
                          data-testid={`button-history-${order.id}`}
                        >
                          <Badge className={`text-[10px] px-1.5 py-0 leading-4 ${colorClasses}`}>
                            {count}
                          </Badge>
                        </button>
                      );
                    })()}
                  </td>
                  {(activeTab === "NEW" || activeTab === "PENDING") && (
                    <>
                      <td className="px-3 py-1.5 max-w-[220px]" data-testid={`cell-address-${order.id}`}>
                        <div className="text-xs text-muted-foreground whitespace-normal leading-tight">
                          {order.shippingAddress || "-"}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 max-w-[180px]" data-testid={`cell-products-${order.id}`}>
                        <div className="text-xs text-muted-foreground leading-tight">
                          {order.itemSummary ? order.itemSummary.split(' || ').map((item, i) => (
                            <div key={i} className="truncate">{item}</div>
                          )) : "-"}
                        </div>
                      </td>
                    </>
                  )}
                  <td className="px-3 py-1.5">
                    <div className="font-medium text-sm">{Number(order.totalAmount).toLocaleString()}</div>
                    {order.codPaymentStatus === "PAID" ? (
                      <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20" data-testid={`badge-prepaid-${order.id}`}>Prepaid</Badge>
                    ) : order.codPaymentStatus === "PARTIALLY_PAID" ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-amber-600">COD: {Number(order.codRemaining ?? order.totalAmount).toLocaleString()}</span>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground capitalize">{order.paymentMethod}</div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 hidden lg:table-cell text-center w-[40px]">
                    <span className="text-sm font-medium">{order.totalQuantity || 1}</span>
                  </td>
                  <td className="px-3 py-1.5 hidden md:table-cell max-w-[100px]" data-testid={`cell-tags-${order.id}`}>
                    <div className="flex flex-wrap gap-0.5">
                      {getRoboTags(order.tags as string[]).map(tag => (
                        <Badge key={tag} className={`text-[10px] px-1.5 py-0 leading-4 ${ROBO_TAG_CONFIG[tag]?.className}`} data-testid={`badge-tag-${tag}-${order.id}`}>
                          {ROBO_TAG_CONFIG[tag]?.label}
                        </Badge>
                      ))}
                    </div>
                  </td>

                  {/* Pending-specific columns */}
                  {activeTab === "PENDING" && (
                    <td className="px-3 py-1.5">
                      <Badge variant="secondary" className="text-xs" data-testid={`badge-pending-reason-${order.id}`}>
                        {PENDING_REASON_TYPES.find(r => r.value === order.pendingReasonType)?.label || order.pendingReasonType || "Unknown"}
                      </Badge>
                    </td>
                  )}

                  {/* Hold-specific columns */}
                  {activeTab === "HOLD" && (
                    <td className="px-3 py-1.5">
                      {order.holdUntil ? (
                        <div>
                          <div className="text-xs">{format(new Date(order.holdUntil), "MMM d, h:mm a")}</div>
                          <HoldCountdown holdUntil={order.holdUntil} />
                        </div>
                      ) : "-"}
                    </td>
                  )}

                  {/* Courier columns for booked/fulfilled/delivered/return */}
                  {(activeTab === "BOOKED" || activeTab === "FULFILLED" || activeTab === "DELIVERED" || activeTab === "RETURN") && (
                    <>
                      <td className="px-3 py-1.5">
                        <div className="text-xs font-medium">{order.courierName || "-"}</div>
                        <div className="text-xs text-muted-foreground">{order.courierTracking || "-"}</div>
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge className={`text-xs ${UNIVERSAL_STATUS_COLORS[order.shipmentStatus || ""] || "bg-slate-100 text-slate-700"}`}
                          data-testid={`badge-status-${order.id}`}
                          title={order.courierRawStatus ? `Courier: ${order.courierRawStatus}` : undefined}>
                          {UNIVERSAL_STATUS_LABELS[order.shipmentStatus || ""] || order.shipmentStatus || "Unknown"}
                        </Badge>
                      </td>
                    </>
                  )}

                  {/* Cancelled-specific columns */}
                  {activeTab === "CANCELLED" && (
                    <td className="px-3 py-1.5">
                      <div className="text-xs text-muted-foreground">{order.cancelReason || "No reason given"}</div>
                      {order.cancelledAt && (
                        <div className="text-xs text-muted-foreground/70">{format(new Date(order.cancelledAt), "MMM d, h:mm a")}</div>
                      )}
                    </td>
                  )}

                  {/* Remark column */}
                  <td className="px-3 py-1.5 max-w-[150px]" data-testid={`cell-remark-${order.id}`}>
                    <button
                      className="text-left w-full cursor-pointer hover:opacity-80"
                      onClick={() => openRemarkDialog(order)}
                      data-testid={`button-remark-${order.id}`}
                    >
                      {order.remark ? (
                        <span className="text-xs text-muted-foreground truncate block max-w-[140px]" title={order.remark}>
                          {order.remark.length > 30 ? order.remark.slice(0, 28) + "..." : order.remark}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50 italic">Add...</span>
                      )}
                    </button>
                  </td>

                  {/* Action buttons */}
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {(activeTab === "NEW" || activeTab === "PENDING" || activeTab === "HOLD") && (
                        <Button size="icon" variant="ghost" className="text-green-600"
                          onClick={() => handleSingleAction(order.id, activeTab === "HOLD" ? "release-hold" : activeTab === "PENDING" ? "fix-confirm" : "confirm")}
                          disabled={isPending}
                          title={activeTab === "HOLD" ? "Release" : "Confirm"}
                          data-testid={`button-confirm-${order.id}`}>
                          <CheckCircle2 className="w-4 h-4" />
                        </Button>
                      )}
                      {(activeTab === "NEW" || activeTab === "PENDING" || activeTab === "READY_TO_SHIP" || activeTab === "BOOKED" || activeTab === "FULFILLED") && (
                        <Button size="icon" variant="ghost"
                          onClick={() => {
                            setEditingOrder(order.id);
                            setEditName(order.customerName || "");
                            setEditPhone(order.customerPhone || "");
                            setEditAddress(order.shippingAddress || "");
                            setEditCity(order.city || "");
                          }}
                          title="Edit"
                          data-testid={`button-edit-${order.id}`}>
                          <Edit3 className="w-4 h-4" />
                        </Button>
                      )}
                      {(activeTab === "NEW" || activeTab === "PENDING") && (
                        <Button size="icon" variant="ghost" className="text-purple-600"
                          onClick={() => handleSingleAction(order.id, "hold")}
                          disabled={isPending}
                          title="Hold"
                          data-testid={`button-hold-${order.id}`}>
                          <Pause className="w-4 h-4" />
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
                        <>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-amber-600"
                            onClick={() => handleSingleAction(order.id, "pending")}
                            disabled={isPending}
                            title="Move to Pending"
                            data-testid={`button-pending-rts-${order.id}`}>
                            <Clock className="w-3.5 h-3.5 mr-1" />Pending
                          </Button>
                          <Button size="icon" variant="ghost" className="text-purple-600"
                            onClick={() => handleSingleAction(order.id, "hold")}
                            disabled={isPending}
                            title="Hold"
                            data-testid={`button-hold-rts-${order.id}`}>
                            <Pause className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {activeTab === "BOOKED" && (
                        <Button size="sm" variant="ghost" className="text-xs text-red-600"
                          onClick={() => setCancelConfirm({ open: true, orderId: order.id, type: "courier", orderNumber: order.orderNumber })}
                          disabled={cancelBookingMutation.isPending}
                          data-testid={`button-cancel-booking-${order.id}`}>
                          <Undo2 className="w-3.5 h-3.5 mr-1" />Cancel AWB
                        </Button>
                      )}
                      {order.shopifyOrderId && !order.cancelledAt && activeTab === "BOOKED" && (
                        <Button size="sm" variant="ghost" className="text-xs text-orange-600"
                          onClick={() => setCancelConfirm({ open: true, orderId: order.id, type: "shopify", orderNumber: order.orderNumber })}
                          disabled={cancelShopifyMutation.isPending}
                          data-testid={`button-cancel-shopify-${order.id}`}>
                          <XCircle className="w-3.5 h-3.5 mr-1" />Cancel Shopify
                        </Button>
                      )}
                      {activeTab === "CANCELLED" && order.shopifyOrderId && !(order as any).isShopifyCancelled && (
                        <Button size="sm" variant="ghost" className="text-xs text-orange-600"
                          onClick={() => setCancelConfirm({ open: true, orderId: order.id, type: "shopify", orderNumber: order.orderNumber })}
                          disabled={cancelShopifyMutation.isPending}
                          data-testid={`button-cancel-shopify-${order.id}`}>
                          <XCircle className="w-3.5 h-3.5 mr-1" />Cancel on Shopify
                        </Button>
                      )}
                      {activeTab !== "NEW" && activeTab !== "BOOKED" && activeTab !== "FULFILLED" && activeTab !== "DELIVERED" && activeTab !== "RETURN" && order.previousWorkflowStatus && (
                        <Button size="icon" variant="ghost" className="text-muted-foreground"
                          onClick={() => workflowMutation.mutate({ orderId: order.id, action: "revert" })}
                          disabled={isPending}
                          title="Revert"
                          data-testid={`button-revert-${order.id}`}>
                          <Undo2 className="w-4 h-4" />
                        </Button>
                      )}
                      {(activeTab === "NEW" || activeTab === "PENDING" || activeTab === "HOLD" || activeTab === "READY_TO_SHIP") && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600"
                          onClick={() => handleSingleAction(order.id, "cancel")}
                          disabled={isPending}
                          data-testid={`button-cancel-${order.id}`}>
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
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
            {shipmentSubFilter !== "all" ? `${orders.length} of ${total}` : total} orders
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
      <Dialog open={cancelModal.open} onOpenChange={open => { if (!open) { setCancelModal({ open: false, orderIds: [] }); setCancelAlsoShopify(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {cancelModal.orderIds.length > 1 ? `${cancelModal.orderIds.length} Orders` : "Order"}</DialogTitle>
            <DialogDescription>Choose how to cancel and provide a reason.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={true} disabled data-testid="checkbox-move-to-cancel" />
                <span>Move to Cancel</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={cancelAlsoShopify}
                  onCheckedChange={(v) => setCancelAlsoShopify(!!v)}
                  data-testid="checkbox-cancel-shopify"
                />
                <span>Also cancel on Shopify</span>
              </label>
            </div>
            <Textarea
              placeholder="Cancel reason..."
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              className="min-h-[80px]"
              data-testid="input-cancel-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCancelModal({ open: false, orderIds: [] }); setCancelAlsoShopify(false); }}>Back</Button>
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
        <DialogContent className="max-w-[97vw] w-[1500px]">
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
            const isCityMatchedForOrder = (order: any) => {
              const ovr = previewOverrides[order.orderId];
              const selectedCity = ovr?.city ?? order.city ?? "";
              if (!selectedCity) return false;
              if (courierCities.length === 0) return true;
              return courierCities.some(c => c.name.toLowerCase() === selectedCity.toLowerCase());
            };
            const checkedOrdersWithCityError = allOrders.filter(order => {
              if (order._type !== "valid") return false;
              if (!previewChecked.has(order.orderId)) return false;
              return !isCityMatchedForOrder(order);
            });
            const hasCityErrors = checkedOrdersWithCityError.length > 0;
            return (
              <div className="space-y-3">
                {allOrders.length > 0 && (
                  <div className="overflow-x-auto max-h-[60vh] overflow-y-auto border border-border">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-emerald-700 dark:bg-emerald-800 sticky top-0 z-10">
                        <tr>
                          <th className="px-2 py-2 text-left w-10 border border-emerald-600 dark:border-emerald-700 text-white">
                            <Checkbox
                              checked={allChecked}
                              onCheckedChange={(checked) => {
                                if (checked) setPreviewChecked(new Set(allValidIds));
                                else setPreviewChecked(new Set());
                              }}
                              className="border-white/60 data-[state=checked]:bg-white data-[state=checked]:text-emerald-700"
                              data-testid="checkbox-preview-all"
                            />
                          </th>
                          <th className="px-2 py-2 text-left font-semibold w-8 border border-emerald-600 dark:border-emerald-700 text-white text-xs">#</th>
                          <th className="px-2 py-2 text-left font-semibold w-20 border border-emerald-600 dark:border-emerald-700 text-white text-xs">Order</th>
                          <th className="px-2 py-2 text-left font-semibold min-w-[140px] border border-emerald-600 dark:border-emerald-700 text-white text-xs">Name</th>
                          <th className="px-2 py-2 text-left font-semibold min-w-[100px] border border-emerald-600 dark:border-emerald-700 text-white text-xs">Phone</th>
                          <th className="px-2 py-2 text-left font-semibold min-w-[350px] border border-emerald-600 dark:border-emerald-700 text-white text-xs">Address</th>
                          <th className="px-2 py-2 text-left font-semibold min-w-[90px] border border-emerald-600 dark:border-emerald-700 text-white text-xs">City</th>
                          <th className="px-2 py-2 text-left font-semibold min-w-[110px] border border-emerald-600 dark:border-emerald-700 text-white text-xs">Courier City</th>
                          <th className="px-2 py-2 text-left font-semibold w-20 border border-emerald-600 dark:border-emerald-700 text-white text-xs">COD</th>
                          <th className="px-2 py-2 text-left font-semibold w-20 border border-emerald-600 dark:border-emerald-700 text-white text-xs">Gram</th>
                          <th className="px-2 py-2 text-left font-semibold w-16 border border-emerald-600 dark:border-emerald-700 text-white text-xs">Pcs</th>
                          <th className="px-2 py-2 text-left font-semibold min-w-[110px] border border-emerald-600 dark:border-emerald-700 text-white text-xs">Type</th>
                          <th className="px-2 py-2 text-center font-semibold w-10 border border-emerald-600 dark:border-emerald-700" title="City Match Status">
                            <CheckCircle2 className="w-4 h-4 mx-auto text-white/80" />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {allOrders.map((order: any, idx: number) => {
                          const isValid = order._type === "valid";
                          const isChecked = previewChecked.has(order.orderId);
                          const ovr = previewOverrides[order.orderId];
                          const hasError = !isValid && order.missingFields?.length > 0;
                          const cityMatched = isCityMatchedForOrder(order);
                          const orderNum = String(order.orderNumber || "").replace(/^#/, "");
                          return (
                            <tr
                              key={order.orderId}
                              className={`${hasError ? "bg-red-50/50 dark:bg-red-950/20" : ""} ${!isChecked && isValid ? "opacity-40" : ""}`}
                              data-testid={`preview-row-${order.orderId}`}
                            >
                              <td className="px-2 py-1 border border-border">
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
                                  <AlertCircle className="w-4 h-4 text-red-500" />
                                )}
                              </td>
                              <td className="px-2 py-1 border border-border text-muted-foreground text-xs">{idx + 1}</td>
                              <td className="px-2 py-1 border border-border font-medium whitespace-nowrap text-xs" data-testid={`text-order-${order.orderId}`}>
                                {orderNum}
                                {hasError && (
                                  <span className="block text-red-500 text-[10px] font-normal" title={order.missingFields.join(", ")}>
                                    {order.missingFields.join(", ")}
                                  </span>
                                )}
                              </td>
                              <td className="px-1 py-0.5 border border-border">
                                <Input
                                  className="h-8 text-xs px-1.5 min-w-[130px] border-0 shadow-none focus-visible:ring-1 bg-transparent"
                                  value={ovr?.customerName ?? order.customerName ?? ""}
                                  onChange={(e) => updateField(order.orderId, "customerName", e.target.value)}
                                  data-testid={`input-name-${order.orderId}`}
                                />
                              </td>
                              <td className="px-1 py-0.5 border border-border">
                                <Input
                                  className="h-8 text-xs px-1.5 font-mono min-w-[90px] border-0 shadow-none focus-visible:ring-1 bg-transparent"
                                  value={ovr?.phone ?? order.phone ?? ""}
                                  onChange={(e) => updateField(order.orderId, "phone", e.target.value)}
                                  data-testid={`input-phone-${order.orderId}`}
                                />
                              </td>
                              <td className="px-1 py-0.5 border border-border">
                                <Input
                                  className="h-8 text-xs px-1.5 min-w-[330px] border-0 shadow-none focus-visible:ring-1 bg-transparent"
                                  value={ovr?.address ?? order.address ?? ""}
                                  onChange={(e) => updateField(order.orderId, "address", e.target.value)}
                                  data-testid={`input-address-${order.orderId}`}
                                />
                              </td>
                              <td className="px-2 py-1 border border-border">
                                <span className={`text-xs whitespace-nowrap ${!order.cityMatched ? "text-orange-500 font-medium" : "text-muted-foreground"}`} data-testid={`text-entered-city-${order.orderId}`}>
                                  {order.city || "-"}
                                </span>
                              </td>
                              <td className="px-1 py-0.5 border border-border">
                                {courierCities.length > 0 ? (
                                  <CityAutocomplete
                                    value={ovr?.city ?? order.city ?? ""}
                                    onChange={(val) => updateField(order.orderId, "city", val)}
                                    cities={courierCities}
                                    hasWarning={!cityMatched}
                                    testId={`input-city-${order.orderId}`}
                                  />
                                ) : (
                                  <Input
                                    className="h-8 text-xs px-1.5 min-w-[100px] border-0 shadow-none focus-visible:ring-1 bg-transparent"
                                    value={ovr?.city ?? order.city ?? ""}
                                    onChange={(e) => updateField(order.orderId, "city", e.target.value)}
                                    data-testid={`input-city-${order.orderId}`}
                                  />
                                )}
                              </td>
                              <td className="px-1 py-0.5 border border-border">
                                <Input
                                  type="number"
                                  min={0}
                                  className="h-8 w-[70px] text-xs px-1.5 text-center border-0 shadow-none focus-visible:ring-1 bg-transparent"
                                  value={ovr?.codAmount ?? order.codAmount ?? 0}
                                  onChange={(e) => updateField(order.orderId, "codAmount", parseFloat(e.target.value) || 0)}
                                  data-testid={`input-cod-${order.orderId}`}
                                />
                              </td>
                              <td className="px-1 py-0.5 border border-border">
                                <Input
                                  type="number"
                                  min={1}
                                  className="h-8 w-[70px] text-xs px-1.5 text-center border-0 shadow-none focus-visible:ring-1 bg-transparent"
                                  value={ovr?.weight ?? 200}
                                  onChange={(e) => updateField(order.orderId, "weight", parseInt(e.target.value) || 200)}
                                  data-testid={`input-weight-${order.orderId}`}
                                />
                              </td>
                              <td className="px-1 py-0.5 border border-border">
                                <Input
                                  type="number"
                                  min={1}
                                  className="h-8 w-[50px] text-xs px-1.5 text-center border-0 shadow-none focus-visible:ring-1 bg-transparent"
                                  value={ovr?.pieces ?? 1}
                                  onChange={(e) => updateField(order.orderId, "pieces", parseInt(e.target.value) || 1)}
                                  data-testid={`input-pieces-${order.orderId}`}
                                />
                              </td>
                              <td className="px-1 py-0.5 border border-border">
                                <Select
                                  value={ovr?.mode ?? modeOptions[0]}
                                  onValueChange={(val) => updateField(order.orderId, "mode", val)}
                                >
                                  <SelectTrigger className="h-8 min-w-[90px] text-xs px-1.5 border-0 shadow-none focus-visible:ring-1 bg-transparent" data-testid={`select-mode-${order.orderId}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {modeOptions.map(m => (
                                      <SelectItem key={m} value={m}>{m}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-2 py-1 border border-border text-center" data-testid={`city-status-${order.orderId}`}>
                                {cityMatched ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-500 mx-auto" />
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
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground pt-2 flex-wrap">
                  <span>{checkedCount} of {bookingConfirmModal.preview.valid.length} orders selected for booking</span>
                  <div className="flex items-center gap-3 flex-wrap">
                    {bookingConfirmModal.preview.invalid.length > 0 && (
                      <span className="text-red-500">{bookingConfirmModal.preview.invalid.length} with errors</span>
                    )}
                    {hasCityErrors && (
                      <span className="text-red-500 font-medium">
                        {checkedOrdersWithCityError.length} selected order{checkedOrdersWithCityError.length > 1 ? "s" : ""} with unmatched city - fix or deselect to proceed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBookingConfirmModal({ open: false, preview: null })} data-testid="button-cancel-booking">Back</Button>
            <Button
              onClick={submitBooking}
              disabled={checkedCount === 0 || (() => {
                if (!bookingConfirmModal.preview) return false;
                const allOrders = [
                  ...bookingConfirmModal.preview.valid.map((v: any) => ({ ...v, _type: "valid" })),
                  ...bookingConfirmModal.preview.invalid.map((v: any) => ({ ...v, _type: "invalid" })),
                ];
                return allOrders.some(order => {
                  if (order._type !== "valid") return false;
                  if (!previewChecked.has(order.orderId)) return false;
                  const ovr = previewOverrides[order.orderId];
                  const selectedCity = ovr?.city ?? order.city ?? "";
                  if (!selectedCity) return true;
                  if (courierCities.length === 0) return false;
                  return !courierCities.some((c: any) => c.name.toLowerCase() === selectedCity.toLowerCase());
                });
              })()}
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
                        <>
                        <Button size="sm" variant="outline" onClick={async () => {
                          try {
                            const resp = await fetch(`/api/print/batch-awb/${bookingResultsModal.results.batchId}.pdf`);
                            if (!resp.ok) {
                              const err = await resp.json().catch(() => ({ message: "Failed to fetch airway bills" }));
                              toast({ title: "Invoice Error", description: err.message, variant: "destructive" });
                              return;
                            }
                            const blob = await resp.blob();
                            if (blob.size === 0 || blob.type.includes("json")) {
                              toast({ title: "Invoice Error", description: "Invoices not available for this batch", variant: "destructive" });
                              return;
                            }
                            const url = URL.createObjectURL(blob);
                            window.open(url, "_blank");
                            setTimeout(() => URL.revokeObjectURL(url), 60000);
                          } catch {
                            toast({ title: "Error", description: "Could not fetch airway bills", variant: "destructive" });
                          }
                        }} data-testid="button-print-awb">
                          <Printer className="w-3.5 h-3.5 mr-1" />Print Courier AWBs
                        </Button>
                        <Button size="sm" variant="outline" onClick={async () => {
                          try {
                            const resp = await fetch(`/api/print/batch-awb/${bookingResultsModal.results.batchId}.pdf`);
                            if (!resp.ok) {
                              const err = await resp.json().catch(() => ({ message: "Failed to fetch airway bills" }));
                              toast({ title: "Invoice Error", description: err.message, variant: "destructive" });
                              return;
                            }
                            const blob = await resp.blob();
                            if (blob.size === 0 || blob.type.includes("json")) {
                              toast({ title: "Invoice Error", description: "Invoices not available for this batch", variant: "destructive" });
                              return;
                            }
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `courier-awbs-${bookingResultsModal.results.batchId.substring(0, 8)}.pdf`;
                            a.click();
                            URL.revokeObjectURL(url);
                          } catch {
                            toast({ title: "Error", description: "Could not download airway bills", variant: "destructive" });
                          }
                        }} data-testid="button-download-awb">
                          <Download className="w-3.5 h-3.5 mr-1" />Download AWBs
                        </Button>
                        </>
                      )}
                      <Button size="sm" variant="outline" onClick={() => {
                          const successIds = bookingResultsModal.results.results
                            .filter((r: any) => r.success)
                            .map((r: any) => r.orderId)
                            .join(",");
                          if (successIds) window.open(`/print-labels?ids=${successIds}`, "_blank");
                        }} data-testid="button-print-labels">
                          <Printer className="w-3.5 h-3.5 mr-1" />Print Labels
                        </Button>
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
                          {r.orderId && (
                            <a href={`/api/print/native-slip/${r.orderId}.pdf`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
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
      {/* Mark Prepaid Confirmation */}
      <AlertDialog open={prepaidConfirmOpen} onOpenChange={setPrepaidConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {selectedIds.size} order{selectedIds.size > 1 ? "s" : ""} as prepaid?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the selected order{selectedIds.size > 1 ? "s" : ""} as fully prepaid (COD = 0). You can undo this action immediately after via the notification.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-prepaid-confirm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-prepaid"
              onClick={() => {
                bulkMarkPrepaidMutation.mutate({ orderIds: Array.from(selectedIds), method: "CASH" });
                setPrepaidConfirmOpen(false);
              }}
            >
              Yes, Mark Prepaid
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Generic Confirm Action Dialog */}
      <AlertDialog open={confirmActionModal.open} onOpenChange={(open) => !open && setConfirmActionModal({ open: false, action: "", orderIds: [], description: "" })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
            <AlertDialogDescription>{confirmActionModal.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-generic-confirm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-generic-action"
              onClick={() => {
                bulkWorkflowMutation.mutate({ orderIds: confirmActionModal.orderIds, action: confirmActionModal.action });
                setConfirmActionModal({ open: false, action: "", orderIds: [], description: "" });
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={!!cancelConfirm?.open} onOpenChange={(open) => !open && setCancelConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {cancelConfirm?.type === "courier" ? "Cancel Courier Booking?" : "Cancel Shopify Order?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cancelConfirm?.type === "courier" ? (
                <>This will cancel the AWB/tracking number with the courier (Leopards/PostEx) and move order <span className="font-medium">{cancelConfirm?.orderNumber}</span> back to Pending. The courier will be notified via their API.</>
              ) : (
                <>This will cancel order <span className="font-medium">{cancelConfirm?.orderNumber}</span> on Shopify. This action cannot be easily undone. The order will be marked as cancelled both on Shopify and in ShipFlow.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-confirm-dismiss">Go Back</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-cancel-confirm-proceed"
              className="bg-red-600 hover:bg-red-700"
              disabled={cancelBookingMutation.isPending || cancelShopifyMutation.isPending}
              onClick={() => {
                if (!cancelConfirm) return;
                if (cancelConfirm.type === "courier") {
                  cancelBookingMutation.mutate(cancelConfirm.orderId);
                } else {
                  cancelShopifyMutation.mutate(cancelConfirm.orderId);
                }
              }}
            >
              {(cancelBookingMutation.isPending || cancelShopifyMutation.isPending) && (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              )}
              {cancelConfirm?.type === "courier" ? "Cancel AWB" : "Cancel on Shopify"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Remark Edit Dialog */}
      <Dialog open={remarkDialogOpen} onOpenChange={setRemarkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Remark - {selectedRemarkOrder?.orderNumber}</DialogTitle>
            <DialogDescription>Add or update the remark for this order.</DialogDescription>
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
              onClick={() => selectedRemarkOrder && updateRemarkMutation.mutate({ orderId: selectedRemarkOrder.id, value: remarkValue })}
              disabled={updateRemarkMutation.isPending}
              data-testid="button-save-remark"
            >
              {updateRemarkMutation.isPending ? "Saving..." : "Save Remark"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Customer Order History Dialog */}
      <Dialog open={!!historyPopup} onOpenChange={open => { if (!open) setHistoryPopup(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-4 h-4" />
              Customer Order History
            </DialogTitle>
            <DialogDescription>
              {historyPopup?.customerName} &middot; {historyPopup?.phone} &middot; {historyDetail?.orderCount || 0} orders
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {historyDetail?.orders && historyDetail.orders.length > 0 ? (
              <div className="space-y-2">
                {historyDetail.orders.map((o: any) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between p-2.5 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors"
                    data-testid={`history-order-${o.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/orders/detail/${o.id}`}
                          className="font-medium text-sm text-primary hover:underline"
                          onClick={() => setHistoryPopup(null)}
                          data-testid={`history-link-${o.id}`}
                        >
                          {o.orderNumber}
                        </Link>
                        <Badge className={`text-[10px] px-1.5 py-0 ${
                          o.workflowStatus === "DELIVERED" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                          o.workflowStatus === "CANCELLED" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                          o.workflowStatus === "RETURN" ? "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" :
                          "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}>
                          {o.workflowStatus}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {o.orderDate ? format(new Date(o.orderDate), "MMM d, yyyy h:mm a") : "No date"}
                        {o.city ? ` · ${o.city}` : ""}
                      </div>
                      {o.itemSummary && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">{o.itemSummary}</div>
                      )}
                    </div>
                    <div className="text-right ml-3 shrink-0">
                      <div className="font-medium text-sm">{Number(o.totalAmount).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{o.currency || "PKR"}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground text-sm py-8">Loading order history...</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
