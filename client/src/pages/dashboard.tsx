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
  CheckCircle2,
  Clock,
  ArrowUpRight,
  RefreshCw,
  Search,
  X,
  Loader2,
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
import { formatPkDateTime } from "@/lib/dateFormat";

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

const UNIVERSAL_STATUS_COLORS: Record<string, string> = {
  'BOOKED': "bg-blue-500/10 text-blue-600 border-blue-500/20",
  'PICKED_UP': "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  'ARRIVED_AT_ORIGIN': "bg-purple-500/10 text-purple-600 border-purple-500/20",
  'IN_TRANSIT': "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  'ARRIVED_AT_DESTINATION': "bg-purple-500/10 text-purple-600 border-purple-500/20",
  'OUT_FOR_DELIVERY': "bg-amber-500/10 text-amber-600 border-amber-500/20",
  'DELIVERY_ATTEMPTED': "bg-orange-500/10 text-orange-600 border-orange-500/20",
  'DELIVERED': "bg-green-500/10 text-green-600 border-green-500/20",
  'DELIVERY_FAILED': "bg-red-500/10 text-red-600 border-red-500/20",
  'RETURNED_TO_SHIPPER': "bg-red-500/10 text-red-600 border-red-500/20",
  'READY_FOR_RETURN': "bg-orange-500/10 text-orange-600 border-orange-500/20",
  'RETURN_IN_TRANSIT': "bg-red-500/10 text-red-600 border-red-500/20",
  'CANCELLED': "bg-red-500/10 text-red-600 border-red-500/20",
  'Unfulfilled': "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

const UNIVERSAL_STATUS_LABELS: Record<string, string> = {
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

function getStatusBadge(status: string) {
  const color = UNIVERSAL_STATUS_COLORS[status] || "bg-gray-500/10 text-gray-600 border-gray-500/20";
  const label = UNIVERSAL_STATUS_LABELS[status] || status;

  return (
    <Badge className={color}>
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
  NEW: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  PENDING: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  HOLD: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  READY_TO_SHIP: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  BOOKED: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  FULFILLED: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  DELIVERED: "bg-green-500/10 text-green-600 border-green-500/20",
  RETURN: "bg-red-500/10 text-red-600 border-red-500/20",
  CANCELLED: "bg-red-500/10 text-red-600 border-red-500/20",
};

function OrderSearchSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
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
      setDebouncedQuery(searchQuery.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const hasSearch = debouncedQuery.length >= 2;

  const queryParams = new URLSearchParams();
  if (debouncedQuery) {
    queryParams.set("search", debouncedQuery);
  }
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

  const hasShipmentColumns = (stage: string) => ["BOOKED", "FULFILLED", "DELIVERED", "RETURN"].includes(stage);
  const hasAddressProducts = (stage: string) => ["NEW", "PENDING"].includes(stage);

  const renderActionButtons = (order: Order, stage: string) => {
    return (
      <div className="flex items-center justify-end gap-1">
        {(stage === "NEW" || stage === "PENDING" || stage === "HOLD") && (
          <Button size="icon" variant="ghost" className="text-green-600"
            onClick={() => handleSingleAction(order.id, stage === "HOLD" ? "release-hold" : stage === "PENDING" ? "fix-confirm" : "confirm")}
            disabled={isPending}
            title={stage === "HOLD" ? "Release" : "Confirm"}
            data-testid={`button-search-confirm-${order.id}`}>
            <CheckCircle2 className="w-3.5 h-3.5" />
          </Button>
        )}
        {(stage === "NEW" || stage === "PENDING" || stage === "READY_TO_SHIP" || stage === "BOOKED" || stage === "FULFILLED") && (
          <Button size="icon" variant="ghost"
            onClick={() => {
              setEditingOrder(order.id);
              setEditName(order.customerName || "");
              setEditPhone(order.customerPhone || "");
              setEditAddress(order.shippingAddress || "");
              setEditCity(order.city || "");
            }}
            title="Edit"
            data-testid={`button-search-edit-${order.id}`}>
            <Edit3 className="w-3.5 h-3.5" />
          </Button>
        )}
        {(stage === "NEW" || stage === "PENDING") && (
          <Button size="icon" variant="ghost" className="text-purple-600"
            onClick={() => handleSingleAction(order.id, "hold")}
            disabled={isPending}
            title="Hold"
            data-testid={`button-search-hold-${order.id}`}>
            <Pause className="w-3.5 h-3.5" />
          </Button>
        )}
        {stage === "HOLD" && (
          <Button size="icon" variant="ghost" className="text-amber-600"
            onClick={() => handleSingleAction(order.id, "move-to-pending")}
            disabled={isPending}
            title="Move to Pending"
            data-testid={`button-search-to-pending-${order.id}`}>
            <Clock className="w-3.5 h-3.5" />
          </Button>
        )}
        {stage === "READY_TO_SHIP" && (
          <>
            <Button size="icon" variant="ghost" className="text-amber-600"
              onClick={() => handleSingleAction(order.id, "pending")}
              disabled={isPending}
              title="Move to Pending"
              data-testid={`button-search-pending-rts-${order.id}`}>
              <Clock className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="text-purple-600"
              onClick={() => handleSingleAction(order.id, "hold")}
              disabled={isPending}
              title="Hold"
              data-testid={`button-search-hold-rts-${order.id}`}>
              <Pause className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
        {stage === "BOOKED" && (
          <Button size="icon" variant="ghost" className="text-red-600"
            onClick={() => setCancelConfirm({ open: true, orderId: order.id, type: "courier", orderNumber: order.orderNumber })}
            disabled={cancelBookingMutation.isPending}
            title="Cancel AWB"
            data-testid={`button-search-cancel-awb-${order.id}`}>
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
        )}
        {order.shopifyOrderId && !order.cancelledAt && stage === "BOOKED" && (
          <Button size="icon" variant="ghost" className="text-orange-600"
            onClick={() => setCancelConfirm({ open: true, orderId: order.id, type: "shopify", orderNumber: order.orderNumber })}
            disabled={cancelShopifyMutation.isPending}
            title="Cancel Shopify"
            data-testid={`button-search-cancel-shopify-${order.id}`}>
            <XCircle className="w-3.5 h-3.5" />
          </Button>
        )}
        {stage === "CANCELLED" && order.shopifyOrderId && !(order as any).isShopifyCancelled && (
          <Button size="icon" variant="ghost" className="text-orange-600"
            onClick={() => setCancelConfirm({ open: true, orderId: order.id, type: "shopify", orderNumber: order.orderNumber })}
            disabled={cancelShopifyMutation.isPending}
            title="Cancel on Shopify"
            data-testid={`button-search-cancel-shopify-cancelled-${order.id}`}>
            <XCircle className="w-3.5 h-3.5" />
          </Button>
        )}
        {stage !== "NEW" && stage !== "BOOKED" && stage !== "FULFILLED" && stage !== "DELIVERED" && stage !== "RETURN" && order.previousWorkflowStatus && (
          <Button size="icon" variant="ghost" className="text-muted-foreground"
            onClick={() => workflowMutation.mutate({ orderId: order.id, action: "revert" })}
            disabled={isPending}
            title="Revert"
            data-testid={`button-search-revert-${order.id}`}>
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
        )}
        {(stage === "NEW" || stage === "PENDING" || stage === "HOLD" || stage === "READY_TO_SHIP") && (
          <Button size="icon" variant="ghost" className="text-red-600"
            onClick={() => handleSingleAction(order.id, "cancel")}
            disabled={isPending}
            title="Cancel"
            data-testid={`button-search-cancel-${order.id}`}>
            <XCircle className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    );
  };

  return (
    <>
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by order ID, tracking number, customer name, or phone..."
          className="pl-9 text-sm"
          data-testid="input-unified-search"
        />
        {searchQuery && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setSearchQuery("")}
            data-testid="button-clear-search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {hasSearch && (
        <div className="border rounded-md mt-2">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground text-center" data-testid="text-no-results">
              No orders found
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto">
              {sortedStages.map(stage => {
                const stageOrders = groupedResults[stage];
                return (
                  <div key={stage} data-testid={`search-group-${stage}`}>
                    <div className="sticky top-0 z-10 bg-muted px-3 py-1 border-b flex items-center gap-2">
                      <Badge className={`text-[10px] ${WORKFLOW_STAGE_COLORS[stage] || ""}`}>
                        {WORKFLOW_STAGE_LABELS[stage] || stage}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{stageOrders.length}</span>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Order</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Customer</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground text-[10px] uppercase tracking-wider hidden md:table-cell">City</th>
                          {hasAddressProducts(stage) && (
                            <>
                              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Address</th>
                              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Products</th>
                            </>
                          )}
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Amount</th>
                          <th className="px-3 py-1.5 text-center font-medium text-muted-foreground text-[10px] uppercase tracking-wider hidden lg:table-cell w-[36px]">Qty</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground text-[10px] uppercase tracking-wider hidden md:table-cell max-w-[80px]">Tags</th>
                          {stage === "PENDING" && (
                            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Reason</th>
                          )}
                          {stage === "HOLD" && (
                            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Hold Until</th>
                          )}
                          {hasShipmentColumns(stage) && (
                            <>
                              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Courier</th>
                              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Status</th>
                            </>
                          )}
                          {stage === "CANCELLED" && (
                            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Reason</th>
                          )}
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Remark</th>
                          <th className="px-3 py-1.5 text-right font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stageOrders.map(order => (
                          <tr key={order.id} className="border-b transition-colors hover-elevate" data-testid={`search-result-${order.id}`}>
                            <td className="px-3 py-1">
                              <div className="flex items-center gap-1">
                                <Link href={`/orders/detail/${order.id}`} className="font-medium text-xs hover:underline" data-testid={`link-search-order-${order.id}`}>
                                  {String(order.orderNumber || '').replace(/^#/, '')}
                                </Link>
                                {order.orderSource === "shopify_draft_order" && (
                                  <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700" title="Custom Order">
                                    <PenLine className="w-2 h-2 text-green-700 dark:text-green-300" />
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {order.orderDate ? formatPkDateTime(order.orderDate) : ""}
                              </div>
                            </td>
                            <td className="px-3 py-1">
                              {editingOrder === order.id ? (
                                <div className="space-y-1">
                                  <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" className="h-6 text-xs" data-testid={`input-search-edit-name-${order.id}`} />
                                  <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Phone" className="h-6 text-xs" data-testid={`input-search-edit-phone-${order.id}`} />
                                  <Input value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="Address" className="h-6 text-xs" data-testid={`input-search-edit-address-${order.id}`} />
                                  <Input value={editCity} onChange={e => setEditCity(e.target.value)} placeholder="City" className="h-6 text-xs" data-testid={`input-search-edit-city-${order.id}`} />
                                  <div className="flex gap-1">
                                    <Button size="sm" className="h-5 text-[10px] px-2" onClick={() => {
                                      customerUpdateMutation.mutate({
                                        orderId: order.id,
                                        data: { customerName: editName, customerPhone: editPhone, shippingAddress: editAddress, city: editCity }
                                      });
                                    }} data-testid={`button-search-save-edit-${order.id}`}>Save</Button>
                                    <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2" onClick={() => setEditingOrder(null)}>Cancel</Button>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div className="font-medium text-xs truncate max-w-[110px]" title={order.customerName || ""}>{order.customerName && order.customerName.length > 15 ? order.customerName.slice(0, 13) + ".." : order.customerName}</div>
                                  <div className="text-[10px] text-muted-foreground">{order.customerPhone || "No phone"}</div>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-1 hidden md:table-cell text-xs truncate max-w-[90px]" title={order.city || ""}>{order.city && order.city.length > 15 ? order.city.slice(0, 13) + ".." : (order.city || "-")}</td>
                            {hasAddressProducts(stage) && (
                              <>
                                <td className="px-3 py-1 max-w-[200px]">
                                  <div className="text-[10px] text-muted-foreground whitespace-normal leading-tight">{order.shippingAddress || "-"}</div>
                                </td>
                                <td className="px-3 py-1 max-w-[160px]">
                                  <div className="text-[10px] text-muted-foreground leading-tight">
                                    {order.itemSummary ? order.itemSummary.split(' || ').map((item, i) => (
                                      <div key={i} className="truncate">{item}</div>
                                    )) : "-"}
                                  </div>
                                </td>
                              </>
                            )}
                            <td className="px-3 py-1">
                              <div className="font-medium text-xs">{Number(order.totalAmount).toLocaleString()}</div>
                              {order.codPaymentStatus === "PAID" ? (
                                <Badge className="text-[10px] bg-green-500/10 text-green-600 border-green-500/20">Prepaid</Badge>
                              ) : order.codPaymentStatus === "PARTIALLY_PAID" ? (
                                <span className="text-[10px] text-amber-600">COD: {Number(order.codRemaining ?? order.totalAmount).toLocaleString()}</span>
                              ) : (
                                <div className="text-[10px] text-muted-foreground capitalize">{order.paymentMethod}</div>
                              )}
                            </td>
                            <td className="px-3 py-1 hidden lg:table-cell text-center w-[36px]">
                              <span className="text-xs">{order.totalQuantity || 1}</span>
                            </td>
                            <td className="px-3 py-1 hidden md:table-cell max-w-[80px]">
                              <div className="flex flex-wrap gap-0.5">
                                {getRoboTags(order.tags as string[], tagConfig).map(tag => (
                                  <Badge key={tag} className={`text-[9px] px-1 py-0 leading-3 ${getRoboTagStyle(tag, tagConfig) || ''}`}>
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            {stage === "PENDING" && (
                              <td className="px-3 py-1">
                                <Badge variant="secondary" className="text-[10px]">
                                  {order.pendingReasonType || "Unknown"}
                                </Badge>
                              </td>
                            )}
                            {stage === "HOLD" && (
                              <td className="px-3 py-1">
                                {order.holdUntil ? (
                                  <div className="text-[10px]">{formatPkDateTime(order.holdUntil)}</div>
                                ) : "-"}
                              </td>
                            )}
                            {hasShipmentColumns(stage) && (
                              <>
                                <td className="px-3 py-1">
                                  <div className="text-xs font-medium">{order.courierName || "-"}</div>
                                  <div className="text-[10px] text-muted-foreground">{order.courierTracking || "-"}</div>
                                </td>
                                <td className="px-3 py-1">
                                  <Badge className={`text-[10px] ${UNIVERSAL_STATUS_COLORS[order.shipmentStatus || ""] || "bg-slate-100 text-slate-700"}`}
                                    title={order.courierRawStatus ? `Courier: ${order.courierRawStatus}` : undefined}
                                    data-testid={`badge-search-status-${order.id}`}>
                                    {UNIVERSAL_STATUS_LABELS[order.shipmentStatus || ""] || order.shipmentStatus || "Unknown"}
                                  </Badge>
                                </td>
                              </>
                            )}
                            {stage === "CANCELLED" && (
                              <td className="px-3 py-1">
                                <div className="text-[10px] text-muted-foreground">{order.cancelReason || "No reason given"}</div>
                                {order.cancelledAt && (
                                  <div className="text-[10px] text-muted-foreground/70">{formatPkDateTime(order.cancelledAt)}</div>
                                )}
                              </td>
                            )}
                            <td className="px-3 py-1 max-w-[120px]">
                              <button
                                className="text-left w-full cursor-pointer hover:opacity-80"
                                onClick={() => openRemarkDialog(order)}
                                data-testid={`button-search-remark-${order.id}`}
                              >
                                {order.remark ? (
                                  <span className="text-[10px] text-muted-foreground truncate block max-w-[110px]" title={order.remark}>
                                    {order.remark.length > 25 ? order.remark.slice(0, 23) + "..." : order.remark}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground/50 italic">Add...</span>
                                )}
                              </button>
                            </td>
                            <td className="px-3 py-1 text-right">
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
                <div className="px-3 py-1.5 text-[10px] text-muted-foreground text-center border-t">
                  Showing {results.length} of {data?.total}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
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

  const handleRefresh = () => {
    refetchStats();
  };

  const total = Object.values(workflowCounts ?? {}).reduce((sum, v) => sum + (v || 0), 0);
  const dispatched = (workflowCounts?.FULFILLED ?? 0) + (workflowCounts?.DELIVERED ?? 0) + (workflowCounts?.RETURN ?? 0);
  const pending = (workflowCounts?.NEW ?? 0) + (workflowCounts?.PENDING ?? 0) + (workflowCounts?.HOLD ?? 0) + (workflowCounts?.READY_TO_SHIP ?? 0) + (workflowCounts?.BOOKED ?? 0);
  const delivered = workflowCounts?.DELIVERED ?? 0;
  const cancelled = workflowCounts?.CANCELLED ?? 0;

  const totalCod = Object.values(workflowAmounts).reduce((sum, v) => sum + (v || 0), 0);
  const dispatchedCod = (workflowAmounts.FULFILLED ?? 0) + (workflowAmounts.DELIVERED ?? 0) + (workflowAmounts.RETURN ?? 0);
  const deliveredCod = workflowAmounts.DELIVERED ?? 0;
  const pendingCod = (workflowAmounts.NEW ?? 0) + (workflowAmounts.PENDING ?? 0) + (workflowAmounts.HOLD ?? 0) + (workflowAmounts.READY_TO_SHIP ?? 0) + (workflowAmounts.BOOKED ?? 0);
  const cancelledCod = workflowAmounts.CANCELLED ?? 0;
  const fmtCod = (amount: number) => `PKR ${Math.round(amount).toLocaleString()}`;

  const fulfillmentRatio = total > 0 ? Math.round((dispatched / total) * 100) : 0;
  const deliveryRatio = dispatched > 0 ? Math.round((delivered / dispatched) * 100) : 0;
  const returnRatio = dispatched > 0 ? Math.round(((workflowCounts?.RETURN ?? 0) / dispatched) * 100) : 0;
  const cancellationRatio = total > 0 ? Math.round((cancelled / total) * 100) : 0;
  const pendingRatio = dispatched > 0 ? Math.round(((workflowCounts?.FULFILLED ?? 0) / dispatched) * 100) : 0;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold" data-testid="text-dashboard-title">Dashboard</h1>
        <Button onClick={handleRefresh} variant="ghost" size="sm" data-testid="button-refresh-dashboard">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      <OrderSearchSection />

      {countsLoading ? (
        <div className="flex gap-6 flex-wrap">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-6 w-10" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-6 flex-wrap items-start" data-testid="section-order-overview">
          {[
            { label: "Total", value: total, cod: totalCod, trend: stats?.ordersTrend },
            { label: "Dispatched", value: dispatched, cod: dispatchedCod },
            { label: "Delivered", value: delivered, cod: deliveredCod },
            { label: "Pending", value: pending, cod: pendingCod },
            { label: "Cancelled", value: cancelled, cod: cancelledCod },
          ].map(item => (
            <div key={item.label} className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
              <p className="text-xl font-semibold tabular-nums">{item.value.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">{fmtCod(item.cod)}</p>
            </div>
          ))}
        </div>
      )}

      {!countsLoading && workflowCounts && (
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
                  variant="secondary"
                  className="cursor-pointer text-[10px]"
                  data-testid={`chip-dashboard-${s.key}`}
                >
                  {s.label}
                  <span className="font-semibold ml-1">{(workflowCounts[s.key] || 0).toLocaleString()}</span>
                </Badge>
              </Link>
            ))}
        </div>
      )}

      {countsLoading ? (
        <div className="flex gap-6 flex-wrap">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-10" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-6 flex-wrap items-start" data-testid="section-performance-metrics">
          {[
            { label: "Fulfillment", value: `${fulfillmentRatio}%`, sub: `${dispatched}/${total}` },
            { label: "Cancellation", value: `${cancellationRatio}%`, sub: `${cancelled}/${total}` },
            { label: "Delivery", value: `${deliveryRatio}%`, sub: `${delivered}/${dispatched}` },
            { label: "Pending", value: `${pendingRatio}%`, sub: `${workflowCounts?.FULFILLED ?? 0}/${dispatched}` },
            { label: "Return", value: `${returnRatio}%`, sub: `${workflowCounts?.RETURN ?? 0}/${dispatched}` },
          ].map(item => (
            <div key={item.label} className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
              <p className="text-lg font-semibold tabular-nums">{item.value}</p>
              <p className="text-[10px] text-muted-foreground tabular-nums">{item.sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between py-1 border-b">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">COD Pending</p>
          <p className="text-base font-semibold tabular-nums" data-testid="text-cod-pending">PKR {stats?.codPending ?? "0"}</p>
        </div>
        <Link href="/cod">
          <Button variant="ghost" size="sm" data-testid="button-view-cod">
            View
            <ArrowUpRight className="w-3 h-3 ml-1" />
          </Button>
        </Link>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Recent Orders</p>
          <Link href="/orders">
            <Button variant="ghost" size="sm" data-testid="button-view-all-orders">
              View All
              <ArrowUpRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
        {ordersLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between py-1.5">
                <div className="space-y-1">
                  <Skeleton className="h-3.5 w-16" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        ) : recentOrders && recentOrders.length > 0 ? (
          <div className="divide-y">
            {recentOrders.map((order) => (
              <Link key={order.id} href={`/orders/detail/${order.id}`}>
                <div className="flex items-center justify-between py-1.5 hover-elevate cursor-pointer" data-testid={`order-row-${order.id}`}>
                  <div className="min-w-0">
                    <p className="font-medium text-xs">{String(order.orderNumber || '').replace(/^#/, '')}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {order.customerName} · {order.city}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-medium tabular-nums">PKR {order.totalAmount}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{order.paymentMethod}</p>
                    </div>
                    {getStatusBadge(order.shipmentStatus || "Unfulfilled")}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Package className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No orders yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
