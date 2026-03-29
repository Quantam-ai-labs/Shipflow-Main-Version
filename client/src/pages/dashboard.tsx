import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  AlertCircle,
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
  Send,
  Ban,
  Edit3,
  Pause,
  XCircle,
  Undo2,
  PenLine,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Order, Shipment } from "@shared/schema";
import { Link, useLocation } from "wouter";
import { useDateRange } from "@/contexts/date-range-context";
import { AIInsightsBanner } from "@/components/ai-insights-banner";
import { formatPkDateTime } from "@/lib/dateFormat";

const DEFAULT_TAG_CONFIG = { confirm: "Robo-Confirm", pending: "Robo-Pending", cancel: "Robo-Cancel" };

function getRoboTagStyle(tag: string, tagConfig?: { confirm: string; pending: string; cancel: string } | null): string | null {
  const config = tagConfig || DEFAULT_TAG_CONFIG;
  const lowerTag = tag.toLowerCase();
  if (lowerTag === config.confirm.toLowerCase()) return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  if (lowerTag === config.pending.toLowerCase()) return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
  if (lowerTag === config.cancel.toLowerCase()) return 'bg-red-500/10 text-red-400 border border-red-500/20';
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

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendLabel,
  subtitle,
  iconColor = "text-primary",
  isLoading = false,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: number;
  trendLabel?: string;
  subtitle?: string;
  iconColor?: string;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-[3px] border-l-primary">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-semibold">{value}</p>
            {trend !== undefined && (
              <div className="flex items-center gap-1 text-xs">
                {trend >= 0 ? (
                  <TrendingUp className="w-3 h-3 text-green-500" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-red-500" />
                )}
                <span className={trend >= 0 ? "text-green-500" : "text-red-500"}>
                  {trend >= 0 ? "+" : ""}{trend}%
                </span>
                <span className="text-muted-foreground">{trendLabel}</span>
              </div>
            )}
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-primary/10 shrink-0`}>
            <Icon className={`w-4 h-4 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiMetricCard({
  label,
  value,
  subtitle,
  icon: Icon,
  iconColor = "text-primary",
  isLoading = false,
}: {
  label: string;
  value: number;
  subtitle: string;
  icon: React.ElementType;
  iconColor?: string;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="bg-[#0d1322] border-white/[0.08]">
        <CardContent className="p-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#0d1322] border-white/[0.08]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-semibold text-white tabular-nums">{value}%</p>
            <p className="text-[11px] text-white/40">{subtitle}</p>
          </div>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/[0.06] shrink-0">
            <Icon className={`w-4 h-4 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const DASHBOARD_CHIP_COLORS: Record<string, string> = {
  NEW: "border-slate-500/40 text-slate-300 hover:border-slate-400/60",
  PENDING: "border-yellow-500/40 text-yellow-300 hover:border-yellow-400/60",
  HOLD: "border-orange-500/40 text-orange-300 hover:border-orange-400/60",
  READY_TO_SHIP: "border-blue-500/40 text-blue-300 hover:border-blue-400/60",
  BOOKED: "border-indigo-500/40 text-indigo-300 hover:border-indigo-400/60",
  FULFILLED: "border-purple-500/40 text-purple-300 hover:border-purple-400/60",
  DELIVERED: "border-green-500/40 text-green-300 hover:border-green-400/60",
  RETURN: "border-rose-500/40 text-rose-300 hover:border-rose-400/60",
  CANCELLED: "border-red-500/40 text-red-300 hover:border-red-400/60",
};

function truncateStatus(status: string, wordCount: number = 3): string {
  const words = status.split(/\s+/);
  if (words.length <= wordCount) return status;
  return words.slice(0, wordCount).join(' ') + '...';
}

function getStatusBadgeColor(workflowStatus: string | null | undefined): string {
  switch (workflowStatus) {
    case 'BOOKED': return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
    case 'FULFILLED': return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
    case 'DELIVERED': return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    case 'RETURN': return "bg-red-500/10 text-red-400 border border-red-500/20";
    case 'CANCELLED': return "bg-red-500/10 text-red-400 border border-red-500/20";
    default: return "bg-muted text-muted-foreground";
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
  NEW: "New",
  PENDING: "Pending",
  HOLD: "Hold",
  READY_TO_SHIP: "Ready to Ship",
  BOOKED: "Booked",
  FULFILLED: "Fulfilled",
  DELIVERED: "Delivered",
  RETURN: "Return",
  CANCELLED: "Cancelled",
};

const WORKFLOW_STAGE_COLORS: Record<string, string> = {
  NEW: "bg-muted text-muted-foreground",
  PENDING: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  HOLD: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  READY_TO_SHIP: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  BOOKED: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  FULFILLED: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  DELIVERED: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  RETURN: "bg-red-500/10 text-red-400 border border-red-500/20",
  CANCELLED: "bg-red-500/10 text-red-400 border border-red-500/20",
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
    case "CANCELLED":
      return "Cancelled";
    case "PENDING":
      return order.pendingReasonType || "Pending review";
    case "HOLD":
      return order.remark || "On hold";
    case "READY_TO_SHIP":
      return "Awaiting booking";
    default:
      return order.fulfillmentStatus || "";
  }
}

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
    onSuccess: () => {
      invalidateOrderQueries();
      toast({ title: "Order updated" });
    },
  });

  const customerUpdateMutation = useMutation({
    mutationFn: async ({ orderId, data }: { orderId: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/orders/${orderId}/customer`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidateOrderQueries();
      setEditingOrder(null);
      toast({ title: "Customer info updated" });
    },
  });

  const updateRemarkMutation = useMutation({
    mutationFn: async ({ orderId, value }: { orderId: string; value: string }) => {
      const response = await apiRequest("PATCH", `/api/orders/${orderId}/remark`, { value });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Remark Updated" });
      invalidateOrderQueries();
      setRemarkDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
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
    onError: (err: any) => {
      invalidateOrderQueries();
      toast({ title: "Cannot cancel", description: err.message || "Failed to cancel on Shopify", variant: "destructive" });
      setCancelConfirm(null);
    },
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

  const handleClear = () => {
    setSearchOrderNumber("");
    setSearchTracking("");
    setSearchName("");
    setSearchPhone("");
  };

  const hasAnyInput = searchOrderNumber || searchTracking || searchName || searchPhone;

  const hasShipmentColumns = (stage: string) => ["BOOKED", "FULFILLED", "DELIVERED", "RETURN"].includes(stage);
  const hasAddressProducts = (stage: string) => ["NEW", "PENDING"].includes(stage);

  const renderActionButtons = (order: Order, stage: string) => {
    return (
      <div className="flex items-center justify-end gap-1">
        {(stage === "NEW" || stage === "PENDING" || stage === "HOLD") && (
          <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600"
            onClick={() => handleSingleAction(order.id, stage === "HOLD" ? "release-hold" : stage === "PENDING" ? "fix-confirm" : "confirm")}
            disabled={isPending}
            title={stage === "HOLD" ? "Release" : "Confirm"}
            data-testid={`button-search-confirm-${order.id}`}>
            <CheckCircle2 className="w-4 h-4" />
          </Button>
        )}
        {(stage === "NEW" || stage === "PENDING" || stage === "READY_TO_SHIP" || stage === "BOOKED" || stage === "FULFILLED") && (
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => {
              setEditingOrder(order.id);
              setEditName(order.customerName || "");
              setEditPhone(order.customerPhone || "");
              setEditAddress(order.shippingAddress || "");
              setEditCity(order.city || "");
            }}
            title="Edit"
            data-testid={`button-search-edit-${order.id}`}>
            <Edit3 className="w-4 h-4" />
          </Button>
        )}
        {(stage === "NEW" || stage === "PENDING") && (
          <Button size="icon" variant="ghost" className="h-7 w-7 text-purple-600"
            onClick={() => handleSingleAction(order.id, "hold")}
            disabled={isPending}
            title="Hold"
            data-testid={`button-search-hold-${order.id}`}>
            <Pause className="w-4 h-4" />
          </Button>
        )}
        {stage === "HOLD" && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-amber-600"
            onClick={() => handleSingleAction(order.id, "move-to-pending")}
            disabled={isPending}
            data-testid={`button-search-to-pending-${order.id}`}>
            <Clock className="w-3.5 h-3.5 mr-1" />Pending
          </Button>
        )}
        {stage === "READY_TO_SHIP" && (
          <>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-amber-600"
              onClick={() => handleSingleAction(order.id, "pending")}
              disabled={isPending}
              title="Move to Pending"
              data-testid={`button-search-pending-rts-${order.id}`}>
              <Clock className="w-3.5 h-3.5 mr-1" />Pending
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-purple-600"
              onClick={() => handleSingleAction(order.id, "hold")}
              disabled={isPending}
              title="Hold"
              data-testid={`button-search-hold-rts-${order.id}`}>
              <Pause className="w-4 h-4" />
            </Button>
          </>
        )}
        {stage === "BOOKED" && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600"
            onClick={() => setCancelConfirm({ open: true, orderId: order.id, type: "courier", orderNumber: order.orderNumber })}
            disabled={cancelBookingMutation.isPending}
            data-testid={`button-search-cancel-awb-${order.id}`}>
            <Undo2 className="w-3.5 h-3.5 mr-1" />Cancel AWB
          </Button>
        )}
        {order.shopifyOrderId && !order.cancelledAt && stage === "BOOKED" && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-orange-600"
            onClick={() => setCancelConfirm({ open: true, orderId: order.id, type: "shopify", orderNumber: order.orderNumber })}
            disabled={cancelShopifyMutation.isPending}
            data-testid={`button-search-cancel-shopify-${order.id}`}>
            <XCircle className="w-3.5 h-3.5 mr-1" />Cancel Shopify
          </Button>
        )}
        {stage === "CANCELLED" && order.shopifyOrderId && !(order as any).isShopifyCancelled && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-orange-600"
            onClick={() => setCancelConfirm({ open: true, orderId: order.id, type: "shopify", orderNumber: order.orderNumber })}
            disabled={cancelShopifyMutation.isPending}
            data-testid={`button-search-cancel-shopify-cancelled-${order.id}`}>
            <XCircle className="w-3.5 h-3.5 mr-1" />Cancel on Shopify
          </Button>
        )}
        {stage !== "NEW" && stage !== "BOOKED" && stage !== "FULFILLED" && stage !== "DELIVERED" && stage !== "RETURN" && order.previousWorkflowStatus && (
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
            onClick={() => workflowMutation.mutate({ orderId: order.id, action: "revert" })}
            disabled={isPending}
            title="Revert"
            data-testid={`button-search-revert-${order.id}`}>
            <Undo2 className="w-4 h-4" />
          </Button>
        )}
        {(stage === "NEW" || stage === "PENDING" || stage === "HOLD" || stage === "READY_TO_SHIP") && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600"
            onClick={() => handleSingleAction(order.id, "cancel")}
            disabled={isPending}
            data-testid={`button-search-cancel-${order.id}`}>
            <XCircle className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    );
  };

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">
            Order Search
          </CardTitle>
          {hasAnyInput && (
            <Button variant="ghost" size="sm" onClick={handleClear} data-testid="button-clear-search">
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Order ID</label>
            <div className="relative">
              <Package className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={searchOrderNumber}
                onChange={(e) => setSearchOrderNumber(e.target.value)}
                placeholder="e.g. 23409, 23410"
                className="pl-8 text-sm"
                data-testid="input-search-order-id"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Tracking Number</label>
            <div className="relative">
              <Truck className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={searchTracking}
                onChange={(e) => setSearchTracking(e.target.value)}
                placeholder="e.g. PW751350, PW751351"
                className="pl-8 text-sm"
                data-testid="input-search-tracking"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Customer Name</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="e.g. Ahmed"
                className="pl-8 text-sm"
                data-testid="input-search-name"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Contact Number</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={searchPhone}
                onChange={(e) => setSearchPhone(e.target.value)}
                placeholder="e.g. 03001234567"
                className="pl-8 text-sm"
                data-testid="input-search-phone"
              />
            </div>
          </div>
        </div>

        {hasSearch && (
          <div className="border rounded-md">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching...
              </div>
            ) : results.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center" data-testid="text-no-results">
                No orders found matching your search criteria
              </div>
            ) : (
              <div className="max-h-[600px] overflow-y-auto">
                {sortedStages.map(stage => {
                  const stageOrders = groupedResults[stage];
                  return (
                    <div key={stage} data-testid={`search-group-${stage}`}>
                      <div className="sticky top-0 z-10 bg-muted px-4 py-1.5 border-b flex items-center gap-2">
                        <Badge className={`text-[10px] ${WORKFLOW_STAGE_COLORS[stage] || ""}`}>
                          {WORKFLOW_STAGE_LABELS[stage] || stage}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{stageOrders.length} order{stageOrders.length !== 1 ? "s" : ""}</span>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">Order</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">Customer</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs hidden md:table-cell">City</th>
                            {hasAddressProducts(stage) && (
                              <>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">Address</th>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">Products</th>
                              </>
                            )}
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">Amount (PKR)</th>
                            <th className="px-3 py-2 text-center font-medium text-muted-foreground text-xs hidden lg:table-cell w-[40px]">Items</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs hidden md:table-cell max-w-[100px]">Tags</th>
                            {stage === "PENDING" && (
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">Reason</th>
                            )}
                            {stage === "HOLD" && (
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">Hold Until</th>
                            )}
                            {hasShipmentColumns(stage) && (
                              <>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">Courier</th>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">Status</th>
                              </>
                            )}
                            {stage === "CANCELLED" && (
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">Reason</th>
                            )}
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">Remark</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground text-xs">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stageOrders.map(order => (
                            <tr key={order.id} className="border-b transition-colors hover-elevate" data-testid={`search-result-${order.id}`}>
                              <td className="px-3 py-1.5">
                                <div className="flex items-center gap-1.5">
                                  <Link href={`/orders/detail/${order.id}`} className="font-medium text-sm hover:underline" data-testid={`link-search-order-${order.id}`}>
                                    {String(order.orderNumber || '').replace(/^#/, '')}
                                  </Link>
                                  {order.orderSource === "shopify_draft_order" && (
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/30" title="Custom Order">
                                      <PenLine className="w-2.5 h-2.5 text-emerald-400" />
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {order.orderDate ? formatPkDateTime(order.orderDate) : ""}
                                </div>
                              </td>
                              <td className="px-3 py-1.5">
                                {editingOrder === order.id ? (
                                  <div className="space-y-1">
                                    <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" className="h-7 text-xs" data-testid={`input-search-edit-name-${order.id}`} />
                                    <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Phone" className="h-7 text-xs" data-testid={`input-search-edit-phone-${order.id}`} />
                                    <Input value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="Address" className="h-7 text-xs" data-testid={`input-search-edit-address-${order.id}`} />
                                    <Input value={editCity} onChange={e => setEditCity(e.target.value)} placeholder="City" className="h-7 text-xs" data-testid={`input-search-edit-city-${order.id}`} />
                                    <div className="flex gap-1">
                                      <Button size="sm" className="h-6 text-xs px-2" onClick={() => {
                                        customerUpdateMutation.mutate({
                                          orderId: order.id,
                                          data: { customerName: editName, customerPhone: editPhone, shippingAddress: editAddress, city: editCity }
                                        });
                                      }} data-testid={`button-search-save-edit-${order.id}`}>Save</Button>
                                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingOrder(null)}>Cancel</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="font-medium text-sm truncate max-w-[120px]" title={order.customerName || ""}>{order.customerName && order.customerName.length > 15 ? order.customerName.slice(0, 13) + ".." : order.customerName}</div>
                                    <div className="text-xs text-muted-foreground">{order.customerPhone || "No phone"}</div>
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-1.5 hidden md:table-cell text-sm truncate max-w-[100px]" title={order.city || ""}>{order.city && order.city.length > 15 ? order.city.slice(0, 13) + ".." : (order.city || "-")}</td>
                              {hasAddressProducts(stage) && (
                                <>
                                  <td className="px-3 py-1.5 max-w-[220px]">
                                    <div className="text-xs text-muted-foreground whitespace-normal leading-tight">{order.shippingAddress || "-"}</div>
                                  </td>
                                  <td className="px-3 py-1.5 max-w-[180px]">
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
                                  <Badge className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Prepaid</Badge>
                                ) : order.codPaymentStatus === "PARTIALLY_PAID" ? (
                                  <span className="text-xs text-amber-600">COD: {Number(order.codRemaining ?? order.totalAmount).toLocaleString()}</span>
                                ) : (
                                  <div className="text-xs text-muted-foreground capitalize">{order.paymentMethod}</div>
                                )}
                              </td>
                              <td className="px-3 py-1.5 hidden lg:table-cell text-center w-[40px]">
                                <span className="text-sm font-medium">{order.totalQuantity || 1}</span>
                              </td>
                              <td className="px-3 py-1.5 hidden md:table-cell max-w-[100px]">
                                <div className="flex flex-wrap gap-0.5">
                                  {getRoboTags(order.tags as string[], tagConfig).map(tag => (
                                    <Badge key={tag} className={`text-[10px] px-1.5 py-0 leading-4 ${getRoboTagStyle(tag, tagConfig) || ''}`}>
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </td>
                              {stage === "PENDING" && (
                                <td className="px-3 py-1.5">
                                  <Badge variant="secondary" className="text-xs">
                                    {order.pendingReasonType || "Unknown"}
                                  </Badge>
                                </td>
                              )}
                              {stage === "HOLD" && (
                                <td className="px-3 py-1.5">
                                  {order.holdUntil ? (
                                    <div className="text-xs">{formatPkDateTime(order.holdUntil)}</div>
                                  ) : "-"}
                                </td>
                              )}
                              {hasShipmentColumns(stage) && (
                                <>
                                  <td className="px-3 py-1.5">
                                    <div className="text-xs font-medium">{order.courierName || "-"}</div>
                                    <div className="text-xs text-muted-foreground">{order.courierTracking || "-"}</div>
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <Badge className={`text-xs ${getStatusBadgeColor(order.workflowStatus)}`}
                                      title={order.shipmentStatus || undefined}
                                      data-testid={`badge-search-status-${order.id}`}>
                                      {truncateStatus(order.shipmentStatus || "Unknown")}
                                    </Badge>
                                  </td>
                                </>
                              )}
                              {stage === "CANCELLED" && (
                                <td className="px-3 py-1.5">
                                  <div className="text-xs text-muted-foreground">{order.cancelReason || "No reason given"}</div>
                                  {order.cancelledAt && (
                                    <div className="text-xs text-muted-foreground/70">{formatPkDateTime(order.cancelledAt)}</div>
                                  )}
                                </td>
                              )}
                              <td className="px-3 py-1.5 max-w-[150px]">
                                <button
                                  className="text-left w-full cursor-pointer hover:opacity-80"
                                  onClick={() => openRemarkDialog(order)}
                                  data-testid={`button-search-remark-${order.id}`}
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
                              <td className="px-3 py-1.5 text-right">
                                {renderActionButtons(order, stage)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
                {(data?.total || 0) > results.length && (
                  <div className="px-4 py-2 text-xs text-muted-foreground text-center border-t">
                    Showing {results.length} of {data?.total} results
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    <Dialog open={remarkDialogOpen} onOpenChange={setRemarkDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Remark - {String(selectedRemarkOrder?.orderNumber || '').replace(/^#/, '')}</DialogTitle>
          <DialogDescription>Add or update the remark for this order.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={remarkValue}
          onChange={(e) => setRemarkValue(e.target.value)}
          placeholder="Enter remark..."
          rows={4}
          data-testid="textarea-search-remark"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRemarkDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (selectedRemarkOrder) {
                updateRemarkMutation.mutate({ orderId: selectedRemarkOrder.id, value: remarkValue });
              }
            }}
            disabled={updateRemarkMutation.isPending}
            data-testid="button-search-save-remark"
          >
            {updateRemarkMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!cancelConfirm?.open} onOpenChange={(open) => !open && setCancelConfirm(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {cancelConfirm?.type === "courier" ? "Cancel Courier Booking?" : "Cancel Shopify Order?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {cancelConfirm?.type === "courier" ? (
              <>This will cancel the AWB/tracking number with the courier and move order <span className="font-medium">{String(cancelConfirm?.orderNumber || '').replace(/^#/, '')}</span> back to Ready to Ship.</>
            ) : (
              <>This will cancel order <span className="font-medium">{String(cancelConfirm?.orderNumber || '').replace(/^#/, '')}</span> on Shopify. This action cannot be easily undone.</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-search-cancel-confirm-dismiss">Go Back</AlertDialogCancel>
          <AlertDialogAction
            data-testid="button-search-cancel-confirm-proceed"
            className="bg-destructive text-destructive-foreground"
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
    </>
  );
}

export default function Dashboard() {
  const { dateParams } = useDateRange();
  const { user } = useAuth();

  const statsQueryParams = new URLSearchParams();
  if (dateParams.dateFrom) statsQueryParams.set("dateFrom", dateParams.dateFrom);
  if (dateParams.dateTo) statsQueryParams.set("dateTo", dateParams.dateTo);
  const statsQueryString = statsQueryParams.toString();
  const statsUrl = `/api/dashboard/stats${statsQueryString ? `?${statsQueryString}` : ""}`;

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<DashboardStats>({
    queryKey: [statsUrl],
    refetchInterval: 30000,
  });

  const workflowCountsUrl = `/api/orders/workflow-counts${statsQueryString ? `?${statsQueryString}` : ""}`;
  const { data: workflowData, isLoading: countsLoading } = useQuery<Record<string, any>>({
    queryKey: [workflowCountsUrl],
    refetchInterval: 30000,
  });
  const workflowCounts = workflowData ? Object.fromEntries(Object.entries(workflowData).filter(([k]) => k !== "totalAmounts").map(([k, v]) => [k, Number(v) || 0])) as Record<string, number> : undefined;
  const workflowAmounts = (workflowData?.totalAmounts ?? {}) as Record<string, number>;

  const { data: recentOrders, isLoading: ordersLoading } = useQuery<RecentOrder[]>({
    queryKey: ["/api/orders/recent"],
    refetchInterval: 30000,
  });

  const { data: dailyCounts, isLoading: dailyLoading } = useQuery<{ date: string; count: number; label: string }[]>({
    queryKey: ["/api/dashboard/daily-counts"],
    refetchInterval: 60000,
  });

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const displayName = user?.sessionDisplayName || user?.firstName || "";
  const todayLabel = new Date().toLocaleDateString("en-PK", { weekday: "long", month: "long", day: "numeric" });

  const handleRefresh = () => {
    refetchStats();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-dashboard-greeting">
            {greeting}{displayName ? `, ${displayName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">{todayLabel} · Your logistics overview</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={handleRefresh} variant="outline" size="sm" data-testid="button-refresh-dashboard">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <AIInsightsBanner section="dashboard" />

      <OrderSearchSection />

      {(() => {
        const total = Object.values(workflowCounts ?? {}).reduce((sum, v) => sum + (v || 0), 0);
        const dispatched = (workflowCounts?.FULFILLED ?? 0) + (workflowCounts?.DELIVERED ?? 0) + (workflowCounts?.RETURN ?? 0);
        const pending = (workflowCounts?.NEW ?? 0) + (workflowCounts?.PENDING ?? 0) + (workflowCounts?.HOLD ?? 0) + (workflowCounts?.READY_TO_SHIP ?? 0) + (workflowCounts?.BOOKED ?? 0);
        const delivered = workflowCounts?.DELIVERED ?? 0;
        const cancelled = workflowCounts?.CANCELLED ?? 0;
        const returned = workflowCounts?.RETURN ?? 0;
        const fulfilled = workflowCounts?.FULFILLED ?? 0;

        const fmtCod = (amount: number) => `COD: PKR ${Math.round(amount).toLocaleString()}`;
        const totalCod = Object.values(workflowAmounts).reduce((sum, v) => sum + (v || 0), 0);
        const dispatchedCod = (workflowAmounts.FULFILLED ?? 0) + (workflowAmounts.DELIVERED ?? 0) + (workflowAmounts.RETURN ?? 0);
        const deliveredCod = workflowAmounts.DELIVERED ?? 0;
        const pendingCod = (workflowAmounts.NEW ?? 0) + (workflowAmounts.PENDING ?? 0) + (workflowAmounts.HOLD ?? 0) + (workflowAmounts.READY_TO_SHIP ?? 0) + (workflowAmounts.BOOKED ?? 0);
        const cancelledCod = workflowAmounts.CANCELLED ?? 0;

        const fulfillmentRatio = total > 0 ? Math.round((dispatched / total) * 100) : 0;
        const deliveryRatio = dispatched > 0 ? Math.round((delivered / dispatched) * 100) : 0;
        const returnRatio = dispatched > 0 ? Math.round((returned / dispatched) * 100) : 0;
        const cancellationRatio = total > 0 ? Math.round((cancelled / total) * 100) : 0;
        const pendingRatio = dispatched > 0 ? Math.round((fulfilled / dispatched) * 100) : 0;

        return (
          <>
            {/* ORDER OVERVIEW */}
            <div>
              <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-3" data-testid="section-order-overview">Order Overview</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <StatCard
                  title="Total Orders"
                  value={countsLoading ? "—" : total.toLocaleString()}
                  icon={Package}
                  trend={stats?.ordersTrend}
                  trendLabel="vs last week"
                  subtitle={countsLoading ? undefined : fmtCod(totalCod)}
                  isLoading={countsLoading}
                />
                <StatCard
                  title="Dispatched"
                  value={countsLoading ? "—" : dispatched.toLocaleString()}
                  icon={Send}
                  iconColor="text-muted-foreground"
                  subtitle={countsLoading ? undefined : fmtCod(dispatchedCod)}
                  isLoading={countsLoading}
                />
                <StatCard
                  title="Delivered"
                  value={countsLoading ? "—" : delivered.toLocaleString()}
                  icon={CheckCircle2}
                  iconColor="text-emerald-500"
                  subtitle={countsLoading ? undefined : fmtCod(deliveredCod)}
                  isLoading={countsLoading}
                />
                <StatCard
                  title="Pending"
                  value={countsLoading ? "—" : pending.toLocaleString()}
                  icon={Clock}
                  iconColor="text-amber-500"
                  subtitle={countsLoading ? undefined : fmtCod(pendingCod)}
                  isLoading={countsLoading}
                />
                <StatCard
                  title="Cancelled"
                  value={countsLoading ? "—" : cancelled.toLocaleString()}
                  icon={Ban}
                  iconColor="text-red-500"
                  subtitle={countsLoading ? undefined : fmtCod(cancelledCod)}
                  isLoading={countsLoading}
                />
              </div>
            </div>

            {/* PERFORMANCE METRICS */}
            <div>
              <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-3" data-testid="section-performance-metrics">Performance Metrics</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <KpiMetricCard
                  label="Fulfillment Ratio"
                  value={fulfillmentRatio}
                  subtitle={`${dispatched.toLocaleString()} dispatched / ${total.toLocaleString()} total`}
                  icon={Send}
                  iconColor="text-blue-400"
                  isLoading={countsLoading}
                />
                <KpiMetricCard
                  label="Cancellation Ratio"
                  value={cancellationRatio}
                  subtitle={`${cancelled.toLocaleString()} cancelled / ${total.toLocaleString()} total`}
                  icon={Ban}
                  iconColor="text-red-400"
                  isLoading={countsLoading}
                />
                <KpiMetricCard
                  label="Delivery Ratio"
                  value={deliveryRatio}
                  subtitle={`${delivered.toLocaleString()} delivered / ${dispatched.toLocaleString()} dispatched`}
                  icon={CheckCircle2}
                  iconColor="text-emerald-400"
                  isLoading={countsLoading}
                />
                <KpiMetricCard
                  label="Pending Ratio"
                  value={pendingRatio}
                  subtitle={`${fulfilled.toLocaleString()} fulfilled / ${dispatched.toLocaleString()} dispatched`}
                  icon={Clock}
                  iconColor="text-sky-400"
                  isLoading={countsLoading}
                />
                <KpiMetricCard
                  label="Return Ratio"
                  value={returnRatio}
                  subtitle={`${returned.toLocaleString()} returned / ${dispatched.toLocaleString()} dispatched`}
                  icon={TrendingDown}
                  iconColor="text-rose-400"
                  isLoading={countsLoading}
                />
              </div>
            </div>

            {/* ORDER STATUS CHIPS — full-width strip */}
            <Card className="bg-[#0d1322] border-white/[0.08]">
              <CardContent className="p-4">
                <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-3">Order Status</p>
                {countsLoading ? (
                  <div className="flex gap-2 flex-wrap">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-6 w-20 rounded-full" />
                    ))}
                  </div>
                ) : workflowCounts ? (
                  <div className="flex gap-1.5 flex-wrap" data-testid="status-breakdown-chips">
                    {[
                      { key: 'NEW', label: 'New' },
                      { key: 'PENDING', label: 'Pending' },
                      { key: 'HOLD', label: 'Hold' },
                      { key: 'READY_TO_SHIP', label: 'Ready to Ship' },
                      { key: 'BOOKED', label: 'Booked' },
                      { key: 'FULFILLED', label: 'Fulfilled' },
                      { key: 'DELIVERED', label: 'Delivered' },
                      { key: 'RETURN', label: 'Return' },
                      { key: 'CANCELLED', label: 'Cancelled' },
                    ]
                      .filter(s => (workflowCounts[s.key] || 0) > 0)
                      .map(s => (
                        <Link key={s.key} href={`/orders?workflowStatus=${s.key}`}>
                          <Badge
                            variant="outline"
                            className={`cursor-pointer text-xs bg-transparent ${DASHBOARD_CHIP_COLORS[s.key] || ""}`}
                            data-testid={`chip-dashboard-${s.key}`}
                          >
                            {s.label}
                            <span className="font-semibold ml-1">{(workflowCounts[s.key] || 0).toLocaleString()}</span>
                          </Badge>
                        </Link>
                      ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* CHART + RECENT ORDERS */}
            <div className="space-y-5">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">7-Day Order Volume</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dailyLoading ? (
                      <Skeleton className="h-[160px] w-full" />
                    ) : (
                      <ResponsiveContainer width="100%" height={160}>
                        <AreaChart data={dailyCounts ?? []} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                          <defs>
                            <linearGradient id="orderGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: "12px",
                              color: "hsl(var(--foreground))",
                            }}
                            formatter={(v: number) => [v, "Orders"]}
                            labelFormatter={(l) => l}
                          />
                          <Area
                            type="monotone"
                            dataKey="count"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            fill="url(#orderGradient)"
                            dot={false}
                            activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
                    <CardTitle className="text-sm font-medium">Recent Orders</CardTitle>
                    <Link href="/orders">
                      <Button variant="ghost" size="sm" data-testid="button-view-all-orders">
                        View All
                        <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    </Link>
                  </CardHeader>
                  <CardContent className="p-0">
                    {ordersLoading ? (
                      <div className="divide-y divide-border">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div key={i} className="flex items-center justify-between px-4 py-3">
                            <div className="space-y-1.5">
                              <Skeleton className="h-4 w-20" />
                              <Skeleton className="h-3 w-28" />
                            </div>
                            <Skeleton className="h-5 w-16" />
                          </div>
                        ))}
                      </div>
                    ) : recentOrders && recentOrders.length > 0 ? (
                      <div className="divide-y divide-border">
                        {recentOrders.map((order) => (
                          <Link key={order.id} href={`/orders/detail/${order.id}`}>
                            <div
                              className="flex items-center justify-between px-4 py-3 hover:bg-primary/5 cursor-pointer transition-colors"
                              data-testid={`order-row-${order.id}`}
                            >
                              <div>
                                <p className="font-medium text-sm">{String(order.orderNumber || '').replace(/^#/, '')}</p>
                                <p className="text-xs text-muted-foreground">
                                  {order.customerName} • {order.city}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right hidden sm:block">
                                  <p className="text-sm font-medium">PKR {order.totalAmount}</p>
                                  <p className="text-xs text-muted-foreground capitalize">{order.paymentMethod}</p>
                                </div>
                                {getStatusBadge(order.shipmentStatus || "Unfulfilled", order.workflowStatus)}
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-10 px-4">
                        <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-sm font-medium mb-0.5">No orders yet</p>
                        <p className="text-xs text-muted-foreground">
                          Orders from your Shopify store will appear here
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
            </div>
          </>
        );
      })()}
    </div>
  );
}
