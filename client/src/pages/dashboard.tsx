import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  RefreshCw,
  Search,
  X,
  Loader2,
  BarChart3,
  Target,
  RotateCcw,
  Edit3,
  Pause,
  XCircle,
  Undo2,
  Banknote,
  ShoppingCart,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Order, Shipment } from "@shared/schema";
import { Link } from "wouter";
import { useDateRange } from "@/contexts/date-range-context";
import { AIInsightsBanner } from "@/components/ai-insights-banner";
import { formatPkDateTime } from "@/lib/dateFormat";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import type { ValueType, NameType, Payload } from "recharts/types/component/DefaultTooltipContent";

/* ── Design tokens ──────────────────────────────────────────────────────── */
const BG = "#090e1a";
const CARD = "rgba(13,19,34,0.85)";
const BORDER = "rgba(255,255,255,0.07)";
const TEXT_MUTED = "rgba(255,255,255,0.4)";
const TEXT_DIM = "rgba(255,255,255,0.65)";
const TEXT = "rgba(255,255,255,0.92)";

const darkCard = {
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: "16px",
  backdropFilter: "blur(12px)",
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const DEFAULT_TAG_CONFIG = { confirm: "Robo-Confirm", pending: "Robo-Pending", cancel: "Robo-Cancel" };

function getRoboTagStyle(tag: string, tagConfig?: { confirm: string; pending: string; cancel: string } | null): string | null {
  const config = tagConfig || DEFAULT_TAG_CONFIG;
  const lowerTag = tag.toLowerCase();
  if (lowerTag === config.confirm.toLowerCase()) return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
  if (lowerTag === config.pending.toLowerCase()) return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300';
  if (lowerTag === config.cancel.toLowerCase()) return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
  return null;
}

function getRoboTags(tags: string[] | null | undefined, tagConfig?: { confirm: string; pending: string; cancel: string } | null): string[] {
  if (!tags || !Array.isArray(tags)) return [];
  const config = tagConfig || DEFAULT_TAG_CONFIG;
  const roboSet = new Set([config.confirm.toLowerCase(), config.pending.toLowerCase(), config.cancel.toLowerCase()]);
  return tags.filter(t => roboSet.has(t.toLowerCase()));
}

interface DashboardStats {
  totalOrders: number;
  pendingShipments: number;
  inTransit: number;
  booked: number;
  deliveredToday: number;
  totalDelivered: number;
  totalReturned: number;
  totalFailed: number;
  codPending: string;
  ordersTrend: number;
  deliveryRate: number;
}

interface RecentOrder extends Order {
  shipment?: Shipment;
}

function truncateStatus(status: string, wordCount: number = 3): string {
  const words = status.split(/\s+/);
  if (words.length <= wordCount) return status;
  return words.slice(0, wordCount).join(' ') + '...';
}

function getStatusBadgeColor(workflowStatus: string | null | undefined): string {
  switch (workflowStatus) {
    case 'BOOKED': return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case 'FULFILLED': return "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
    case 'DELIVERED': return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case 'RETURN': return "bg-red-500/20 text-red-300 border-red-500/30";
    case 'CANCELLED': return "bg-red-500/20 text-red-300 border-red-500/30";
    default: return "bg-white/10 text-white/50 border-white/15";
  }
}

function getStatusBadge(status: string, workflowStatus?: string | null) {
  const color = getStatusBadgeColor(workflowStatus);
  const label = truncateStatus(status);
  return (
    <Badge className={color} title={status}>
      {label}
    </Badge>
  );
}

const WORKFLOW_STAGE_LABELS: Record<string, string> = {
  NEW: "New", PENDING: "Pending", HOLD: "Hold", READY_TO_SHIP: "Ready to Ship",
  BOOKED: "Booked", FULFILLED: "Fulfilled", DELIVERED: "Delivered", RETURN: "Return", CANCELLED: "Cancelled",
};

const WORKFLOW_CHIP_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  NEW:          { bg: "rgba(148,163,184,0.12)", text: "#94a3b8", border: "rgba(148,163,184,0.2)" },
  PENDING:      { bg: "rgba(251,191,36,0.12)",  text: "#fbbf24", border: "rgba(251,191,36,0.25)" },
  HOLD:         { bg: "rgba(251,146,60,0.12)",  text: "#fb923c", border: "rgba(251,146,60,0.25)" },
  READY_TO_SHIP:{ bg: "rgba(59,130,246,0.12)",  text: "#60a5fa", border: "rgba(59,130,246,0.25)" },
  BOOKED:       { bg: "rgba(99,102,241,0.12)",  text: "#818cf8", border: "rgba(99,102,241,0.25)" },
  FULFILLED:    { bg: "rgba(168,85,247,0.12)",  text: "#c084fc", border: "rgba(168,85,247,0.25)" },
  DELIVERED:    { bg: "rgba(16,185,129,0.12)",  text: "#34d399", border: "rgba(16,185,129,0.25)" },
  RETURN:       { bg: "rgba(239,68,68,0.12)",   text: "#f87171", border: "rgba(239,68,68,0.25)" },
  CANCELLED:    { bg: "rgba(239,68,68,0.10)",   text: "#f87171", border: "rgba(239,68,68,0.2)"  },
};

function getStageFeatures(order: Order): string {
  const stage = order.workflowStatus || "NEW";
  switch (stage) {
    case "BOOKED":
    case "FULFILLED":
      return [order.courierName, order.courierTracking, order.shipmentStatus ? truncateStatus(order.shipmentStatus) : null].filter(Boolean).join(" | ");
    case "DELIVERED":
      return [order.courierName, order.courierTracking, "Delivered"].filter(Boolean).join(" | ");
    case "RETURN":
      return [order.courierName, order.courierTracking, order.shipmentStatus ? truncateStatus(order.shipmentStatus) : "Return"].filter(Boolean).join(" | ");
    case "CANCELLED": return "Cancelled";
    case "PENDING": return order.pendingReasonType || "Pending review";
    case "HOLD": return order.remark || "On hold";
    case "READY_TO_SHIP": return "Awaiting booking";
    default: return order.fulfillmentStatus || "";
  }
}

/* ── Dark KPI card ───────────────────────────────────────────────────────── */
function KpiCard({
  title, value, icon: Icon, trend, trendLabel, subtitle, accentColor, isLoading,
}: {
  title: string; value: string | number; icon: React.ElementType;
  trend?: number; trendLabel?: string; subtitle?: string;
  accentColor?: string; isLoading?: boolean;
}) {
  const accent = accentColor || "#3b82f6";
  if (isLoading) {
    return (
      <div style={{ ...darkCard, padding: "20px" }}>
        <div className="space-y-2">
          <Skeleton className="h-3 w-24 bg-white/10" />
          <Skeleton className="h-8 w-20 bg-white/10" />
          <Skeleton className="h-3 w-32 bg-white/10" />
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...darkCard, padding: "20px", borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: TEXT_MUTED }}>{title}</p>
          <p className="text-3xl font-bold" style={{ color: TEXT }}>{value}</p>
          {trend !== undefined && (
            <div className="flex items-center gap-1.5 text-xs mt-1">
              {trend >= 0
                ? <TrendingUp className="w-3 h-3" style={{ color: "#10b981" }} />
                : <TrendingDown className="w-3 h-3" style={{ color: "#f87171" }} />}
              <span style={{ color: trend >= 0 ? "#10b981" : "#f87171" }}>{trend >= 0 ? "+" : ""}{trend}%</span>
              {trendLabel && <span style={{ color: TEXT_MUTED }}>{trendLabel}</span>}
            </div>
          )}
          {subtitle && <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{subtitle}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${accent}20` }}>
          <Icon className="w-5 h-5" style={{ color: accent }} />
        </div>
      </div>
    </div>
  );
}

/* ── Horizontal progress bar metric ─────────────────────────────────────── */
function MetricBar({
  label, value, subtitle, color,
}: { label: string; value: number; subtitle?: string; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium" style={{ color: TEXT_DIM }}>{label}</span>
        <span className="text-sm font-bold" style={{ color: TEXT }}>{value}%</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div
          className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${Math.min(value, 100)}%`, background: color }}
        />
      </div>
      {subtitle && <p className="text-xs" style={{ color: TEXT_MUTED }}>{subtitle}</p>}
    </div>
  );
}

/* ── Custom recharts tooltip ─────────────────────────────────────────────── */
function DarkTooltip({ active, payload, label }: TooltipProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0d1322", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", padding: "10px 14px" }}>
      <p style={{ color: TEXT_MUTED, fontSize: "11px", marginBottom: "4px" }}>{label}</p>
      {(payload as Payload<ValueType, NameType>[]).map((p, i) => (
        <p key={i} style={{ color: p.color, fontSize: "13px", fontWeight: 600 }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

/* ── Order Search Section (full logic unchanged, dark styled) ──────────── */
function OrderSearchSection() {
  const [searchOrderNumber, setSearchOrderNumber] = useState("");
  const [searchTracking, setSearchTracking] = useState("");
  const [searchName, setSearchName] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [debouncedParams, setDebouncedParams] = useState({ searchOrderNumber: "", searchTracking: "", searchName: "", searchPhone: "" });
  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [remarkDialogOpen, setRemarkDialogOpen] = useState(false);
  const [selectedRemarkOrder, setSelectedRemarkOrder] = useState<Order | null>(null);
  const [remarkValue, setRemarkValue] = useState("");
  const [cancelConfirm, setCancelConfirm] = useState<{ open: boolean; orderId: string; type: "courier" | "shopify"; orderNumber?: string } | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidateOrderQueries = () => {
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === "string" && key.startsWith("/api/orders");
    }});
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
  };

  const { data: tagConfig } = useQuery<{ confirm: string; pending: string; cancel: string }>({
    queryKey: ["/api/settings/robo-tags"],
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedParams({
        searchOrderNumber: searchOrderNumber.trim(),
        searchTracking: searchTracking.trim(),
        searchName: searchName.trim(),
        searchPhone: searchPhone.trim(),
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [searchOrderNumber, searchTracking, searchName, searchPhone]);

  const hasSearch = Object.values(debouncedParams).some((v) => v.length >= 2);

  const queryParams = new URLSearchParams();
  if (debouncedParams.searchOrderNumber) queryParams.set("searchOrderNumber", debouncedParams.searchOrderNumber);
  if (debouncedParams.searchTracking) queryParams.set("searchTracking", debouncedParams.searchTracking);
  if (debouncedParams.searchName) queryParams.set("searchName", debouncedParams.searchName);
  if (debouncedParams.searchPhone) queryParams.set("searchPhone", debouncedParams.searchPhone);
  queryParams.set("pageSize", "50");

  const { data, isLoading } = useQuery<{ orders: Order[]; total: number }>({
    queryKey: [`/api/orders?${queryParams.toString()}`],
    enabled: hasSearch,
  });

  const results = data?.orders || [];

  const workflowMutation = useMutation({
    mutationFn: async ({ orderId, action, extra }: { orderId: string; action: string; extra?: any }) => {
      const res = await apiRequest("POST", `/api/orders/${orderId}/workflow`, { action, ...extra });
      return res.json();
    },
    onSuccess: () => { invalidateOrderQueries(); toast({ title: "Order updated" }); },
  });

  const customerUpdateMutation = useMutation({
    mutationFn: async ({ orderId, data }: { orderId: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/orders/${orderId}/customer`, data);
      return res.json();
    },
    onSuccess: () => { invalidateOrderQueries(); setEditingOrder(null); toast({ title: "Customer info updated" }); },
  });

  const updateRemarkMutation = useMutation({
    mutationFn: async ({ orderId, value }: { orderId: string; value: string }) => {
      const response = await apiRequest("PATCH", `/api/orders/${orderId}/remark`, { value });
      return response.json();
    },
    onSuccess: () => { toast({ title: "Remark Updated" }); invalidateOrderQueries(); setRemarkDialogOpen(false); },
    onError: (error: Error) => { toast({ title: "Error", description: error.message, variant: "destructive" }); },
  });

  const cancelBookingMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/orders/${orderId}/cancel-booking`);
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateOrderQueries();
      if (data.fulfillmentWarning) {
        toast({ title: "Booking cancelled", description: "Courier AWB cancelled and order moved to Ready to Ship, but Shopify fulfillment could not be reversed.", variant: "destructive" });
      } else {
        toast({ title: "Booking cancelled", description: "Courier AWB cancelled and order moved back to Ready to Ship" });
      }
      setCancelConfirm(null);
    },
    onError: (err: any) => {
      let description = "Failed to cancel booking";
      try {
        const raw = err.message || "";
        const jsonPart = raw.includes(": {") ? raw.substring(raw.indexOf(": {") + 2) : raw.includes(":{") ? raw.substring(raw.indexOf(":{") + 1) : "";
        if (jsonPart) { const parsed = JSON.parse(jsonPart); description = parsed.message || description; }
        else if (raw) { description = raw.replace(/^\d+:\s*/, ""); }
      } catch {
        const raw = err.message || "";
        description = raw.replace(/^\d+:\s*/, "") || description;
      }
      toast({ title: "Cannot cancel", description, variant: "destructive" });
      setCancelConfirm(null);
    },
  });

  const cancelShopifyMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/orders/${orderId}/cancel-shopify`, { reason: "other" });
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateOrderQueries();
      if (data.shopifyWarning) {
        toast({ title: "Order cancelled locally", description: "Shopify sync failed but order is cancelled in 1SOL.AI.", variant: "destructive" });
      } else {
        toast({ title: "Shopify order cancelled", description: "Order cancelled on Shopify and moved to Cancelled" });
      }
      setCancelConfirm(null);
    },
    onError: (err: any) => { invalidateOrderQueries(); toast({ title: "Cannot cancel", description: err.message || "Failed to cancel on Shopify", variant: "destructive" }); setCancelConfirm(null); },
  });

  const handleSingleAction = useCallback((orderId: string, action: string) => {
    workflowMutation.mutate({ orderId, action });
  }, [workflowMutation]);

  const openRemarkDialog = (order: Order) => {
    setSelectedRemarkOrder(order);
    setRemarkValue(order.remark || "");
    setRemarkDialogOpen(true);
  };

  const isPending = workflowMutation.isPending;

  const groupedResults = results.reduce<Record<string, Order[]>>((acc, order) => {
    const stage = order.workflowStatus || "NEW";
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(order);
    return acc;
  }, {});

  const stageOrder = ["NEW", "PENDING", "HOLD", "READY_TO_SHIP", "BOOKED", "FULFILLED", "DELIVERED", "RETURN", "CANCELLED"];
  const sortedStages = Object.keys(groupedResults).sort((a, b) => {
    const ai = stageOrder.indexOf(a);
    const bi = stageOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const handleClear = () => { setSearchOrderNumber(""); setSearchTracking(""); setSearchName(""); setSearchPhone(""); };
  const hasAnyInput = searchOrderNumber || searchTracking || searchName || searchPhone;

  const hasShipmentColumns = (stage: string) => ["BOOKED", "FULFILLED", "DELIVERED", "RETURN"].includes(stage);

  const renderActionButtons = (order: Order, stage: string) => (
    <div className="flex items-center justify-end gap-1">
      {(stage === "NEW" || stage === "PENDING" || stage === "HOLD") && (
        <Button size="icon" variant="ghost" className="h-7 w-7 text-green-400 hover:text-green-300"
          onClick={() => handleSingleAction(order.id, stage === "HOLD" ? "release-hold" : stage === "PENDING" ? "fix-confirm" : "confirm")}
          disabled={isPending} title={stage === "HOLD" ? "Release" : "Confirm"}
          data-testid={`button-search-confirm-${order.id}`}>
          <CheckCircle2 className="w-4 h-4" />
        </Button>
      )}
      {(stage === "NEW" || stage === "PENDING" || stage === "READY_TO_SHIP" || stage === "BOOKED" || stage === "FULFILLED") && (
        <Button size="icon" variant="ghost" className="h-7 w-7 text-white/50 hover:text-white"
          onClick={() => { setEditingOrder(order.id); setEditName(order.customerName || ""); setEditPhone(order.customerPhone || ""); setEditAddress(order.shippingAddress || ""); setEditCity(order.city || ""); }}
          title="Edit" data-testid={`button-search-edit-${order.id}`}>
          <Edit3 className="w-4 h-4" />
        </Button>
      )}
      {(stage === "NEW" || stage === "PENDING") && (
        <Button size="icon" variant="ghost" className="h-7 w-7 text-purple-400 hover:text-purple-300"
          onClick={() => handleSingleAction(order.id, "hold")} disabled={isPending} title="Hold"
          data-testid={`button-search-hold-${order.id}`}>
          <Pause className="w-4 h-4" />
        </Button>
      )}
      {stage === "HOLD" && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300"
          onClick={() => handleSingleAction(order.id, "move-to-pending")} disabled={isPending}
          data-testid={`button-search-to-pending-${order.id}`}>
          <Clock className="w-3.5 h-3.5 mr-1" />Pending
        </Button>
      )}
      {stage === "READY_TO_SHIP" && (
        <>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300"
            onClick={() => handleSingleAction(order.id, "pending")} disabled={isPending} title="Move to Pending"
            data-testid={`button-search-pending-rts-${order.id}`}>
            <Clock className="w-3.5 h-3.5 mr-1" />Pending
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-purple-400 hover:text-purple-300"
            onClick={() => handleSingleAction(order.id, "hold")} disabled={isPending} title="Hold"
            data-testid={`button-search-hold-rts-${order.id}`}>
            <Pause className="w-4 h-4" />
          </Button>
        </>
      )}
      {stage === "BOOKED" && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
          onClick={() => setCancelConfirm({ open: true, orderId: order.id, type: "courier", orderNumber: order.orderNumber })}
          disabled={cancelBookingMutation.isPending} data-testid={`button-search-cancel-awb-${order.id}`}>
          <Undo2 className="w-3.5 h-3.5 mr-1" />Cancel AWB
        </Button>
      )}
      {order.shopifyOrderId && !order.cancelledAt && stage === "BOOKED" && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-orange-400 hover:text-orange-300"
          onClick={() => setCancelConfirm({ open: true, orderId: order.id, type: "shopify", orderNumber: order.orderNumber })}
          disabled={cancelShopifyMutation.isPending} data-testid={`button-search-cancel-shopify-${order.id}`}>
          <XCircle className="w-3.5 h-3.5 mr-1" />Cancel Shopify
        </Button>
      )}
      {stage === "CANCELLED" && order.shopifyOrderId && !(order as any).isShopifyCancelled && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-orange-400 hover:text-orange-300"
          onClick={() => setCancelConfirm({ open: true, orderId: order.id, type: "shopify", orderNumber: order.orderNumber })}
          disabled={cancelShopifyMutation.isPending} data-testid={`button-search-cancel-shopify-cancelled-${order.id}`}>
          <XCircle className="w-3.5 h-3.5 mr-1" />Cancel on Shopify
        </Button>
      )}
      {stage !== "NEW" && stage !== "BOOKED" && stage !== "FULFILLED" && stage !== "DELIVERED" && stage !== "RETURN" && order.previousWorkflowStatus && (
        <Button size="icon" variant="ghost" className="h-7 w-7 text-white/30 hover:text-white/60"
          onClick={() => workflowMutation.mutate({ orderId: order.id, action: "revert" })} disabled={isPending} title="Revert"
          data-testid={`button-search-revert-${order.id}`}>
          <Undo2 className="w-4 h-4" />
        </Button>
      )}
      {(stage === "NEW" || stage === "PENDING" || stage === "HOLD" || stage === "READY_TO_SHIP") && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
          onClick={() => handleSingleAction(order.id, "cancel")} disabled={isPending}
          data-testid={`button-search-cancel-${order.id}`}>
          <XCircle className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );

  const inputClass = "text-sm bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-blue-500/40 focus-visible:border-blue-400/40";

  return (
    <>
      <div style={darkCard} className="p-5">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4" style={{ color: "#60a5fa" }} />
            <h3 className="text-sm font-semibold" style={{ color: TEXT }}>Order Search</h3>
          </div>
          {hasAnyInput && (
            <Button variant="ghost" size="sm" onClick={handleClear} className="text-white/40 hover:text-white/70 h-7 px-2 text-xs" data-testid="button-clear-search">
              <X className="w-3.5 h-3.5 mr-1" />Clear
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: TEXT_MUTED }}>Order ID</label>
            <div className="relative">
              <Package className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: TEXT_MUTED }} />
              <Input value={searchOrderNumber} onChange={(e) => setSearchOrderNumber(e.target.value)} placeholder="e.g. 23409" className={`${inputClass} pl-8`} data-testid="input-search-order-id" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: TEXT_MUTED }}>Tracking Number</label>
            <div className="relative">
              <Truck className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: TEXT_MUTED }} />
              <Input value={searchTracking} onChange={(e) => setSearchTracking(e.target.value)} placeholder="e.g. PW751350" className={`${inputClass} pl-8`} data-testid="input-search-tracking" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: TEXT_MUTED }}>Customer Name</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: TEXT_MUTED }} />
              <Input value={searchName} onChange={(e) => setSearchName(e.target.value)} placeholder="Search name" className={`${inputClass} pl-8`} data-testid="input-search-name" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: TEXT_MUTED }}>Phone Number</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: TEXT_MUTED }} />
              <Input value={searchPhone} onChange={(e) => setSearchPhone(e.target.value)} placeholder="Search phone" className={`${inputClass} pl-8`} data-testid="input-search-phone" />
            </div>
          </div>
        </div>

        {hasSearch && (
          <div className="mt-4">
            {isLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full bg-white/5" />)}</div>
            ) : results.length === 0 ? (
              <p className="text-center py-6 text-sm" style={{ color: TEXT_MUTED }}>No orders found</p>
            ) : (
              <div className="space-y-4">
                {sortedStages.map(stage => {
                  const orders = groupedResults[stage];
                  const chipStyle = WORKFLOW_CHIP_COLORS[stage] || WORKFLOW_CHIP_COLORS.NEW;
                  return (
                    <div key={stage}>
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: chipStyle.bg, color: chipStyle.text, border: `1px solid ${chipStyle.border}` }}>
                          {WORKFLOW_STAGE_LABELS[stage] || stage}
                        </span>
                        <span className="text-xs" style={{ color: TEXT_MUTED }}>{orders.length} order{orders.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: "rgba(255,255,255,0.04)", color: TEXT_MUTED }}>
                              <th className="text-left px-3 py-2 font-medium">Order</th>
                              <th className="text-left px-3 py-2 font-medium">Customer</th>
                              <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Amount</th>
                              {hasShipmentColumns(stage) && <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Shipment</th>}
                              <th className="text-right px-3 py-2 font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orders.map((order, i) => (
                              <tr key={order.id} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none" }} className="hover:bg-white/3 transition-colors">
                                <td className="px-3 py-2.5">
                                  <Link href={`/orders/detail/${order.id}`}>
                                    <span className="font-mono font-semibold cursor-pointer hover:text-blue-400 transition-colors" style={{ color: "#60a5fa" }}>
                                      #{String(order.orderNumber || '').replace(/^#/, '')}
                                    </span>
                                  </Link>
                                  {order.orderDate && <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{formatPkDateTime(order.orderDate)}</p>}
                                </td>
                                <td className="px-3 py-2.5">
                                  <p style={{ color: TEXT_DIM }}>{order.customerName || "—"}</p>
                                  {order.city && <p style={{ color: TEXT_MUTED }}>{order.city}</p>}
                                </td>
                                <td className="px-3 py-2.5 hidden sm:table-cell">
                                  {order.totalAmount && <p style={{ color: TEXT_DIM }}>PKR {order.totalAmount}</p>}
                                  <p style={{ color: TEXT_MUTED }} className="capitalize">{order.paymentMethod || "cod"}</p>
                                </td>
                                {hasShipmentColumns(stage) && (
                                  <td className="px-3 py-2.5 hidden md:table-cell">
                                    <p style={{ color: TEXT_MUTED }}>{getStageFeatures(order)}</p>
                                  </td>
                                )}
                                <td className="px-3 py-2.5">
                                  {editingOrder === order.id ? (
                                    <div className="flex gap-1 flex-wrap items-center justify-end">
                                      <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" className={`${inputClass} h-6 text-xs w-24`} />
                                      <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Phone" className={`${inputClass} h-6 text-xs w-24`} />
                                      <Input value={editCity} onChange={e => setEditCity(e.target.value)} placeholder="City" className={`${inputClass} h-6 text-xs w-20`} />
                                      <Button size="sm" className="h-6 text-xs px-2 bg-blue-600 hover:bg-blue-500 text-white"
                                        onClick={() => customerUpdateMutation.mutate({ orderId: order.id, data: { customerName: editName, customerPhone: editPhone, shippingAddress: editAddress, city: editCity } })}
                                        disabled={customerUpdateMutation.isPending}
                                        data-testid={`button-save-customer-${order.id}`}>Save</Button>
                                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-white/40" onClick={() => setEditingOrder(null)} data-testid={`button-cancel-edit-${order.id}`}>Cancel</Button>
                                    </div>
                                  ) : renderActionButtons(order, stage)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Remark dialog */}
      <Dialog open={remarkDialogOpen} onOpenChange={setRemarkDialogOpen}>
        <DialogContent className="bg-[#0d1322] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Update Remark</DialogTitle>
            <DialogDescription className="text-white/40">Order #{selectedRemarkOrder?.orderNumber}</DialogDescription>
          </DialogHeader>
          <Textarea value={remarkValue} onChange={e => setRemarkValue(e.target.value)} placeholder="Enter remark..." className="bg-white/5 border-white/10 text-white placeholder:text-white/30" rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="text-white/40" onClick={() => setRemarkDialogOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-500 text-white" onClick={() => selectedRemarkOrder && updateRemarkMutation.mutate({ orderId: selectedRemarkOrder.id, value: remarkValue })} disabled={updateRemarkMutation.isPending}>
              {updateRemarkMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel confirm dialog */}
      <AlertDialog open={cancelConfirm?.open ?? false} onOpenChange={open => !open && setCancelConfirm(null)}>
        <AlertDialogContent className="bg-[#0d1322] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Confirm Cancellation</AlertDialogTitle>
            <AlertDialogDescription className="text-white/40">
              {cancelConfirm?.type === "courier"
                ? `Cancel courier AWB for order #${cancelConfirm?.orderNumber}? This will move the order back to Ready to Ship.`
                : `Cancel order #${cancelConfirm?.orderNumber} on Shopify? This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Keep</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-500 text-white"
              onClick={() => {
                if (!cancelConfirm) return;
                if (cancelConfirm.type === "courier") cancelBookingMutation.mutate(cancelConfirm.orderId);
                else cancelShopifyMutation.mutate(cancelConfirm.orderId);
              }}>
              {(cancelBookingMutation.isPending || cancelShopifyMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm Cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface TrendDataPoint {
  day: string;
  date: string;
  orders: number;
}

/* ── Main Dashboard ──────────────────────────────────────────────────────── */
export default function Dashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { dateRange } = useDateRange();

  const statsParams = new URLSearchParams();
  if (dateRange?.from) statsParams.set("dateFrom", dateRange.from.toISOString().slice(0, 10));
  if (dateRange?.to) statsParams.set("dateTo", dateRange.to.toISOString().slice(0, 10));
  const statsUrl = `/api/dashboard/stats${statsParams.toString() ? `?${statsParams}` : ""}`;

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats", dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: () => fetch(statsUrl, { credentials: "include" }).then(r => r.json()),
  });

  const { data: workflowCounts, isLoading: countsLoading } = useQuery<Record<string, number>>({
    queryKey: ["/api/orders/workflow-counts"],
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery<RecentOrder[]>({
    queryKey: ["/api/orders/recent"],
  });

  const { data: trendData, isLoading: trendLoading } = useQuery<TrendDataPoint[]>({
    queryKey: ["/api/dashboard/trend"],
  });

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/orders/workflow-counts"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/orders/recent"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/dashboard/trend"] });
    toast({ title: "Dashboard refreshed" });
  };

  /* ── Derived metrics ── */
  const total = Object.values(workflowCounts ?? {}).reduce((s, v) => s + (v || 0), 0);
  const dispatched = (workflowCounts?.FULFILLED ?? 0) + (workflowCounts?.DELIVERED ?? 0) + (workflowCounts?.RETURN ?? 0);
  const delivered = workflowCounts?.DELIVERED ?? 0;
  const returned = workflowCounts?.RETURN ?? 0;
  const cancelled = workflowCounts?.CANCELLED ?? 0;
  const fulfilled = workflowCounts?.FULFILLED ?? 0;

  const fulfillmentRatio   = total      > 0 ? Math.round((dispatched / total) * 100)      : 0;
  const deliveryRatio      = dispatched > 0 ? Math.round((delivered  / dispatched) * 100)  : 0;
  const returnRatio        = dispatched > 0 ? Math.round((returned   / dispatched) * 100)  : 0;
  const cancellationRatio  = total      > 0 ? Math.round((cancelled  / total) * 100)       : 0;
  const pendingRatio       = dispatched > 0 ? Math.round((fulfilled  / dispatched) * 100)  : 0;

  return (
    <div className="relative min-h-full space-y-6" style={{ background: BG, margin: "-24px", padding: "24px" }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: TEXT }}>Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: TEXT_MUTED }}>Your logistics overview</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          className="text-white/40 hover:text-white/80 hover:bg-white/5 border border-white/8"
          data-testid="button-refresh-dashboard"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* ── AI banner ── */}
      <AIInsightsBanner section="dashboard" />

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="section-order-overview">
        <KpiCard
          title="Total Orders"
          value={statsLoading ? "—" : (stats?.totalOrders ?? 0).toLocaleString()}
          icon={ShoppingCart}
          trend={stats?.ordersTrend}
          trendLabel="vs last week"
          subtitle={`PKR ${stats?.codPending ?? "0"} COD pending`}
          accentColor="#3b82f6"
          isLoading={statsLoading}
        />
        <KpiCard
          title="Dispatched"
          value={countsLoading ? "—" : dispatched.toLocaleString()}
          icon={Truck}
          subtitle={`${workflowCounts?.BOOKED ?? 0} booked · ${workflowCounts?.FULFILLED ?? 0} in transit`}
          accentColor="#8b5cf6"
          isLoading={countsLoading}
        />
        <KpiCard
          title="Delivered"
          value={countsLoading ? "—" : delivered.toLocaleString()}
          icon={CheckCircle2}
          trend={stats?.deliveryRate}
          trendLabel="delivery rate"
          subtitle={`${stats?.deliveredToday ?? 0} today`}
          accentColor="#10b981"
          isLoading={countsLoading}
        />
        <KpiCard
          title="Cancelled"
          value={countsLoading ? "—" : cancelled.toLocaleString()}
          icon={XCircle}
          subtitle={`${returned} returned · ${cancellationRatio}% cancel rate`}
          accentColor="#f43f5e"
          isLoading={countsLoading}
        />
      </div>

      {/* ── Two-column grid: chart left, metrics right ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Chart (left, wider) — 7-day order trend */}
        <div style={darkCard} className="xl:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: TEXT }}>7-Day Order Trend</h3>
              <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>Daily orders placed in the last week</p>
            </div>
            <BarChart3 className="w-4 h-4" style={{ color: TEXT_MUTED }} />
          </div>
          {trendLoading ? (
            <Skeleton className="h-40 w-full bg-white/5 rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendData ?? []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fill: TEXT_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: TEXT_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<DarkTooltip />} />
                <Area type="monotone" dataKey="orders" name="Orders" stroke="#60a5fa" strokeWidth={2} fill="url(#blueGrad)" dot={{ fill: "#60a5fa", r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: "#3b82f6" }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Right panel: metrics + COD */}
        <div className="flex flex-col gap-4">

          {/* Performance metrics */}
          <div style={darkCard} className="p-5 flex-1">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-4 h-4" style={{ color: "#60a5fa" }} />
              <h3 className="text-sm font-semibold" style={{ color: TEXT }} data-testid="section-performance-metrics">Performance</h3>
            </div>
            {countsLoading ? (
              <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full bg-white/5" />)}</div>
            ) : (
              <div className="space-y-4">
                <MetricBar label="Fulfillment" value={fulfillmentRatio} subtitle={`${dispatched} / ${total} dispatched`} color="#3b82f6" />
                <MetricBar label="Delivery Rate" value={deliveryRatio} subtitle={`${delivered} / ${dispatched} delivered`} color="#10b981" />
                <MetricBar label="In Transit" value={pendingRatio} subtitle={`${fulfilled} / ${dispatched} en-route`} color="#8b5cf6" />
                <MetricBar label="Returns" value={returnRatio} subtitle={`${returned} / ${dispatched} returned`} color="#f59e0b" />
                <MetricBar label="Cancellations" value={cancellationRatio} subtitle={`${cancelled} / ${total} cancelled`} color="#f43f5e" />
              </div>
            )}
          </div>

          {/* COD pending */}
          <div style={{ ...darkCard, borderLeft: "3px solid #10b981" }} className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Banknote className="w-4 h-4" style={{ color: "#10b981" }} />
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: TEXT_MUTED }}>COD Pending</p>
            </div>
            {statsLoading
              ? <Skeleton className="h-8 w-32 bg-white/5" />
              : <p className="text-2xl font-bold" style={{ color: TEXT }}>PKR {stats?.codPending ?? "0"}</p>}
            <Link href="/cod">
              <Button variant="ghost" size="sm" className="mt-3 h-7 px-0 text-xs hover:bg-transparent" style={{ color: "#10b981" }} data-testid="button-view-cod">
                View Details <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Status breakdown chips ── */}
      <div style={darkCard} className="p-4">
        {countsLoading ? (
          <div className="flex gap-2 flex-wrap">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-20 rounded-full bg-white/5" />)}</div>
        ) : workflowCounts ? (
          <div className="flex gap-2 flex-wrap" data-testid="status-breakdown-chips">
            {[
              { key: "NEW", label: "New" }, { key: "PENDING", label: "Pending" }, { key: "HOLD", label: "Hold" },
              { key: "READY_TO_SHIP", label: "Ready to Ship" }, { key: "BOOKED", label: "Booked" }, { key: "FULFILLED", label: "Fulfilled" },
              { key: "DELIVERED", label: "Delivered" }, { key: "RETURN", label: "Return" }, { key: "CANCELLED", label: "Cancelled" },
            ]
              .filter(s => (workflowCounts[s.key] || 0) > 0)
              .map(s => {
                const c = WORKFLOW_CHIP_COLORS[s.key] || WORKFLOW_CHIP_COLORS.NEW;
                return (
                  <Link key={s.key} href={`/orders?workflowStatus=${s.key}`}>
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full cursor-pointer transition-all hover:brightness-125"
                      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                      data-testid={`chip-dashboard-${s.key}`}
                    >
                      {s.label}
                      <span className="font-bold">{(workflowCounts[s.key] || 0).toLocaleString()}</span>
                    </span>
                  </Link>
                );
              })}
          </div>
        ) : null}
      </div>

      {/* ── Order search ── */}
      <OrderSearchSection />

      {/* ── Recent orders ── */}
      <div style={darkCard} className="overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4" style={{ color: "#60a5fa" }} />
            <h3 className="text-sm font-semibold" style={{ color: TEXT }}>Recent Orders</h3>
          </div>
          <Link href="/orders">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs hover:bg-white/5" style={{ color: TEXT_MUTED }} data-testid="button-view-all-orders">
              View All <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
        {ordersLoading ? (
          <div className="divide-y divide-white/5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3.5">
                <Skeleton className="h-4 w-32 bg-white/5" />
                <Skeleton className="h-5 w-20 bg-white/5" />
              </div>
            ))}
          </div>
        ) : recentOrders && recentOrders.length > 0 ? (
          <div>
            {recentOrders.map((order, i) => (
              <Link key={order.id} href={`/orders/detail/${order.id}`}>
                <div
                  className="flex items-center justify-between px-5 py-3.5 cursor-pointer transition-colors"
                  style={{ borderTop: i > 0 ? `1px solid ${BORDER}` : "none" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(59,130,246,0.05)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  data-testid={`order-row-${order.id}`}
                >
                  <div>
                    <p className="font-semibold text-sm font-mono" style={{ color: "#60a5fa" }}>
                      #{String(order.orderNumber || '').replace(/^#/, '')}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                      {order.customerName} · {order.city}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-semibold" style={{ color: TEXT_DIM }}>PKR {order.totalAmount}</p>
                      <p className="text-xs capitalize" style={{ color: TEXT_MUTED }}>{order.paymentMethod}</p>
                    </div>
                    {getStatusBadge(order.shipmentStatus || "Unfulfilled", order.workflowStatus)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 px-4">
            <Package className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.15)" }} />
            <p className="text-sm font-medium" style={{ color: TEXT_DIM }}>No orders yet</p>
            <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>Orders from your Shopify store will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
}
