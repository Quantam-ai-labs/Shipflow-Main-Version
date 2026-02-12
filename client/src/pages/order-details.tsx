import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Package,
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Truck,
  Clock,
  CheckCircle2,
  MessageSquare,
  Send,
  History,
  Tag,
  Printer,
  Download,
  CreditCard,
  Plus,
  Trash2,
  RefreshCw,
  PackageCheck,
  MapPinned,
  RotateCcw,
  XCircle,
  CircleDot,
  AlertTriangle,
  Edit3,
  Lock,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Order, Shipment, ShipmentEvent, Remark } from "@shared/schema";
import { Link, useParams } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface OrderDetails extends Order {
  shipments: (Shipment & { events: ShipmentEvent[] })[];
  remarks: Remark[];
  changeLog?: any[];
}

function getStatusBadge(status: string | null) {
  const normalizedStatus = status || "unfulfilled";
  const statusConfig: Record<string, { bg: string; label: string }> = {
    unfulfilled: { bg: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", label: "Unfulfilled" },
    pending: { bg: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", label: "Pending" },
    booked: { bg: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", label: "Booked" },
    dispatched: { bg: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300", label: "Dispatched" },
    arrived: { bg: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300", label: "Arrived" },
    out_for_delivery: { bg: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300", label: "Out for Delivery" },
    delivered: { bg: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", label: "Delivered" },
    failed: { bg: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", label: "Failed" },
    reattempt: { bg: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300", label: "Reattempt" },
    returned: { bg: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300", label: "Returned" },
    cancelled: { bg: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400", label: "Cancelled" },
  };

  const config = statusConfig[normalizedStatus] || statusConfig.pending;
  return <Badge className={config.bg}>{config.label}</Badge>;
}

function getTrackingIcon(status: string) {
  const iconMap: Record<string, React.ElementType> = {
    booked: Package,
    picked: Truck,
    in_transit: Truck,
    out_for_delivery: Truck,
    delivered: CheckCircle2,
  };
  return iconMap[status] || Clock;
}

interface TrackingEvent {
  status: string;
  date: string;
  description: string;
}

interface TrackingHistoryData {
  success: boolean;
  courierName?: string;
  trackingNumber?: string;
  currentStatus?: string;
  rawStatus?: string;
  statusDescription?: string;
  lastUpdate?: string;
  events: TrackingEvent[];
  message?: string;
}

const PIPELINE_STAGES = [
  { key: "BOOKED", label: "Booked", icon: Package, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-600", ring: "ring-blue-600/20" },
  { key: "PICKED_UP", label: "Picked Up", icon: PackageCheck, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-600", ring: "ring-indigo-600/20" },
  { key: "IN_TRANSIT", label: "In Transit", icon: Truck, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-600", ring: "ring-purple-600/20" },
  { key: "OUT_FOR_DELIVERY", label: "Out for Delivery", icon: MapPinned, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-600", ring: "ring-amber-600/20" },
  { key: "DELIVERED", label: "Delivered", icon: CheckCircle2, color: "text-green-600 dark:text-green-400", bg: "bg-green-600", ring: "ring-green-600/20" },
];

const RETURN_STAGES = [
  { key: "DELIVERY_FAILED", label: "Failed", icon: AlertTriangle, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-600", ring: "ring-orange-600/20" },
  { key: "READY_FOR_RETURN", label: "Ready for Return", icon: AlertTriangle, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-600", ring: "ring-orange-600/20" },
  { key: "RETURN_IN_TRANSIT", label: "Return Transit", icon: RotateCcw, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-600", ring: "ring-rose-600/20" },
  { key: "RETURNED_TO_SHIPPER", label: "Returned", icon: RotateCcw, color: "text-red-600 dark:text-red-400", bg: "bg-red-600", ring: "ring-red-600/20" },
];

const CANCELLED_STAGE = { key: "CANCELLED", label: "Cancelled", icon: XCircle, color: "text-gray-600 dark:text-gray-400", bg: "bg-gray-500", ring: "ring-gray-500/20" };

function getStageIndex(status: string | undefined): { pipeline: typeof PIPELINE_STAGES; activeIndex: number; isReturn: boolean; isCancelled: boolean } {
  if (!status) return { pipeline: PIPELINE_STAGES, activeIndex: -1, isReturn: false, isCancelled: false };

  if (status === "CANCELLED") {
    return { pipeline: PIPELINE_STAGES, activeIndex: -1, isReturn: false, isCancelled: true };
  }

  const returnKeys = RETURN_STAGES.map(s => s.key);
  if (returnKeys.includes(status)) {
    const combined = [...PIPELINE_STAGES.slice(0, 3), ...RETURN_STAGES];
    const idx = combined.findIndex(s => s.key === status);
    return { pipeline: combined, activeIndex: idx, isReturn: true, isCancelled: false };
  }

  const mainIdx = PIPELINE_STAGES.findIndex(s => s.key === status);
  if (mainIdx >= 0) {
    return { pipeline: PIPELINE_STAGES, activeIndex: mainIdx, isReturn: false, isCancelled: false };
  }

  const intermediateMap: Record<string, number> = {
    "ARRIVED_AT_ORIGIN": 1,
    "ARRIVED_AT_DESTINATION": 3,
    "DELIVERY_ATTEMPTED": 3,
  };
  if (intermediateMap[status] !== undefined) {
    return { pipeline: PIPELINE_STAGES, activeIndex: intermediateMap[status], isReturn: false, isCancelled: false };
  }

  return { pipeline: PIPELINE_STAGES, activeIndex: 0, isReturn: false, isCancelled: false };
}

function CourierTrackingJourney({ orderId, order }: { orderId: string; order: OrderDetails }) {
  const { data: tracking, isLoading, refetch, isFetching } = useQuery<TrackingHistoryData>({
    queryKey: ["/api/orders", orderId, "tracking-history"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/tracking-history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tracking");
      return res.json();
    },
    enabled: !!(order.courierName && order.courierTracking),
    staleTime: 60000,
  });

  const hasCourier = !!(order.courierName && order.courierTracking);

  if (!hasCourier) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Shipment Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Truck className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium">No courier assigned yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Book this order with a courier to see tracking updates.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentStatus = tracking?.currentStatus || order.shipmentStatus || "BOOKED";
  const { pipeline, activeIndex, isCancelled } = getStageIndex(currentStatus);
  const events = tracking?.events || [];
  const reversedEvents = [...events].reverse();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Tracking Journey
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-xs" data-testid="badge-tracking-number">
              {order.courierTracking}
            </Badge>
            <Badge variant="secondary" className="text-xs capitalize" data-testid="badge-courier-name">
              {order.courierName}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-tracking"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Pipeline Visualization */}
        <div className="relative" data-testid="tracking-pipeline">
          <div className="flex items-center justify-between relative">
            {pipeline.map((stage, idx) => {
              const Icon = stage.icon;
              const isActive = idx <= activeIndex;
              const isCurrent = idx === activeIndex;
              return (
                <div key={stage.key} className="flex flex-col items-center relative z-10" style={{ flex: 1 }}>
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                      isCurrent
                        ? `${stage.bg} text-white ring-4 ${stage.ring}`
                        : isActive
                          ? `${stage.bg} text-white`
                          : "bg-muted text-muted-foreground"
                    }`}
                    data-testid={`tracking-stage-${stage.key}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] mt-1.5 text-center leading-tight max-w-[60px] ${
                    isCurrent ? "font-semibold " + stage.color : isActive ? stage.color : "text-muted-foreground"
                  }`}>
                    {stage.label}
                  </span>
                </div>
              );
            })}
            {isCancelled && (
              <div className="flex flex-col items-center relative z-10" style={{ flex: 1 }}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${CANCELLED_STAGE.bg} text-white ring-4 ${CANCELLED_STAGE.ring}`}>
                  <XCircle className="w-4 h-4" />
                </div>
                <span className={`text-[10px] mt-1.5 text-center font-semibold ${CANCELLED_STAGE.color}`}>
                  {CANCELLED_STAGE.label}
                </span>
              </div>
            )}
            {/* Progress line behind icons */}
            <div className="absolute top-[18px] left-0 right-0 h-0.5 bg-muted mx-8" />
            {activeIndex >= 0 && (
              <div
                className={`absolute top-[18px] left-0 h-0.5 mx-8 transition-all ${pipeline[Math.min(activeIndex, pipeline.length - 1)]?.bg || "bg-primary"}`}
                style={{ width: `${Math.min((activeIndex / (pipeline.length - 1)) * 100, 100)}%` }}
              />
            )}
          </div>
        </div>

        {/* Current Status Badge */}
        {tracking?.rawStatus && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <CircleDot className="w-3 h-3 shrink-0" />
            <span>Current: <span className="font-medium text-foreground">{tracking.rawStatus}</span></span>
            {tracking.lastUpdate && (
              <span className="ml-auto shrink-0">{format(new Date(tracking.lastUpdate), "MMM dd, h:mm a")}</span>
            )}
          </div>
        )}

        <Separator />

        {/* Event Timeline */}
        <div>
          <p className="text-sm font-medium mb-3">Activity Log</p>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="w-2 h-2 rounded-full mt-1.5 shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : reversedEvents.length > 0 ? (
            <div className="relative pl-5 space-y-0" data-testid="tracking-events-list">
              <div className="absolute left-[3px] top-1 bottom-1 w-px bg-border" />
              {reversedEvents.map((event, idx) => (
                <div key={idx} className="relative flex items-start gap-3 py-2" data-testid={`tracking-event-${idx}`}>
                  <div className={`absolute left-[-17px] w-[7px] h-[7px] rounded-full mt-1.5 shrink-0 ${
                    idx === 0 ? "bg-primary ring-2 ring-primary/20" : "bg-muted-foreground/40"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${idx === 0 ? "font-medium" : ""}`}>{event.description || event.status}</p>
                    {event.date && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatEventDate(event.date)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No tracking events available from the courier.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatEventDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      return dateStr;
    }
    return format(d, "MMM dd, yyyy 'at' h:mm a");
  } catch {
    return dateStr;
  }
}

export default function OrderDetails() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [newRemark, setNewRemark] = useState("");
  const [remarkType, setRemarkType] = useState("general");

  const { data: order, isLoading } = useQuery<OrderDetails>({
    queryKey: ["/api/orders", id],
  });

  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editCustomerEmail, setEditCustomerEmail] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editProvince, setEditProvince] = useState("");
  const [editPostalCode, setEditPostalCode] = useState("");
  const [editShippingAddress, setEditShippingAddress] = useState("");

  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editSubtotal, setEditSubtotal] = useState("");
  const [editShipping, setEditShipping] = useState("");
  const [editDiscount, setEditDiscount] = useState("");
  const [editLineItems, setEditLineItems] = useState<Array<{ name: string; quantity: number; price: string }>>([]);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const { data: auditLog } = useQuery<any[]>({
    queryKey: ["/api/orders", id, "audit-log"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${id}/audit-log`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit log");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: paymentData } = useQuery<{
    payments: any[];
    totalAmount: number;
    prepaidAmount: number;
    codRemaining: number;
    codPaymentStatus: string;
    isBooked: boolean;
  }>({
    queryKey: ["/api/orders", id, "payments"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${id}/payments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch payments");
      return res.json();
    },
    enabled: !!id,
  });

  const addPaymentMutation = useMutation({
    mutationFn: async (data: { amount: number; method: string; reference?: string; notes?: string }) => {
      return apiRequest("POST", `/api/orders/${id}/payments`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id, "payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      setPaymentAmount("");
      setPaymentRef("");
      setPaymentNotes("");
      toast({ title: "Payment added", description: "Payment recorded successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to add payment.", variant: "destructive" });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/orders/${id}/payments/mark-paid`, { method: paymentMethod });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id, "payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      toast({ title: "Marked as paid", description: "Order marked as fully paid." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to mark as paid.", variant: "destructive" });
    },
  });

  const resetPaymentsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/orders/${id}/payments/reset`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id, "payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      toast({ title: "Payments reset", description: "All payments have been removed." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to reset.", variant: "destructive" });
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      return apiRequest("DELETE", `/api/orders/${id}/payments/${paymentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id, "payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      toast({ title: "Payment deleted", description: "Payment removed and COD recalculated." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to delete payment.", variant: "destructive" });
    },
  });

  const handleAddPayment = () => {
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) return;
    addPaymentMutation.mutate({
      amount: amt,
      method: paymentMethod,
      reference: paymentRef || undefined,
      notes: paymentNotes || undefined,
    });
  };

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/print/regenerate/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Print Record Updated",
        description: "Print record refreshed successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to refresh print record.",
        variant: "destructive",
      });
    },
  });

  const addRemarkMutation = useMutation({
    mutationFn: async (data: { content: string; remarkType: string }) => {
      return apiRequest("POST", `/api/orders/${id}/remarks`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      setNewRemark("");
      toast({
        title: "Remark added",
        description: "Your remark has been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add remark. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async (updateData: Record<string, any>) => {
      return apiRequest("PATCH", `/api/orders/${id}/customer`, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      setIsEditingCustomer(false);
      setIsEditingSummary(false);
      toast({ title: "Order updated", description: "Changes saved successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update order.", variant: "destructive" });
    },
  });

  const handleAddRemark = () => {
    if (!newRemark.trim()) return;
    addRemarkMutation.mutate({ content: newRemark, remarkType });
  };

  const PICKED_UP_STATUSES = ['PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION', 'OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNED_TO_SHIPPER', 'READY_FOR_RETURN', 'RETURN_IN_TRANSIT'];
  const isLocked = order?.workflowStatus === "DELIVERED" || order?.workflowStatus === "RETURN" || order?.workflowStatus === "CANCELLED";

  const startEditingCustomer = () => {
    if (!order) return;
    setEditCustomerName(order.customerName || "");
    setEditCustomerPhone(order.customerPhone || "");
    setEditCustomerEmail(order.customerEmail || "");
    setEditCity(order.city || "");
    setEditProvince(order.province || "");
    setEditPostalCode(order.postalCode || "");
    setEditShippingAddress(order.shippingAddress || "");
    setIsEditingCustomer(true);
  };

  const handleSaveCustomer = () => {
    updateOrderMutation.mutate({
      customerName: editCustomerName,
      customerPhone: editCustomerPhone,
      customerEmail: editCustomerEmail,
      city: editCity,
      province: editProvince,
      postalCode: editPostalCode,
      shippingAddress: editShippingAddress,
    });
  };

  const startEditingSummary = () => {
    if (!order) return;
    const items = (order.lineItems as Array<{ name: string; quantity: number; price: string }>) || [];
    setEditLineItems(items.map(i => ({ ...i })));
    setEditSubtotal(String(order.subtotalAmount || 0));
    setEditShipping(String(order.shippingAmount || 0));
    setEditDiscount(String(order.discountAmount || 0));
    setIsEditingSummary(true);
  };

  const handleSaveSummary = () => {
    const subtotal = parseFloat(editSubtotal) || 0;
    const shipping = parseFloat(editShipping) || 0;
    const discount = parseFloat(editDiscount) || 0;
    const total = subtotal + shipping - discount;
    const totalQty = editLineItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    updateOrderMutation.mutate({
      subtotalAmount: String(subtotal),
      shippingAmount: String(shipping),
      discountAmount: String(discount),
      totalAmount: String(total),
      lineItems: editLineItems,
      totalQuantity: totalQty,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-16">
        <Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
        <h3 className="font-medium mb-1">Order not found</h3>
        <p className="text-sm text-muted-foreground mb-4">
          The order you're looking for doesn't exist or has been deleted.
        </p>
        <Link href="/orders">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Orders
          </Button>
        </Link>
      </div>
    );
  }

  const shipment = order.shipments?.[0];
  const lineItems = order.lineItems as Array<{ name: string; quantity: number; price: string }> | null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/orders">
            <Button variant="ghost" size="icon" data-testid="button-back-orders">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">Order # {order.orderNumber}</h1>
              {getStatusBadge(order.shipmentStatus)}
            </div>
            <p className="text-muted-foreground text-sm">
              {order.orderDate ? format(new Date(order.orderDate), "MMMM dd, yyyy 'at' h:mm a") : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                <User className="w-5 h-5" />
                Customer Details
                {isLocked && (
                  <Badge variant="outline" className="text-xs gap-1" data-testid="badge-locked-customer">
                    <Lock className="w-3 h-3" />
                    Locked - Booked
                  </Badge>
                )}
              </CardTitle>
              {!isLocked && !isEditingCustomer && (
                <Button variant="ghost" size="icon" onClick={startEditingCustomer} data-testid="button-edit-customer">
                  <Edit3 className="w-4 h-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditingCustomer ? (
                <>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Name</label>
                      <Input value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)} data-testid="input-edit-customer-name" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Phone</label>
                      <Input value={editCustomerPhone} onChange={(e) => setEditCustomerPhone(e.target.value)} data-testid="input-edit-customer-phone" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Email</label>
                      <Input value={editCustomerEmail} onChange={(e) => setEditCustomerEmail(e.target.value)} data-testid="input-edit-customer-email" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">City</label>
                      <Input value={editCity} onChange={(e) => setEditCity(e.target.value)} data-testid="input-edit-city" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Province</label>
                      <Input value={editProvince} onChange={(e) => setEditProvince(e.target.value)} data-testid="input-edit-province" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Postal Code</label>
                      <Input value={editPostalCode} onChange={(e) => setEditPostalCode(e.target.value)} data-testid="input-edit-postal-code" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Shipping Address</label>
                    <Textarea value={editShippingAddress} onChange={(e) => setEditShippingAddress(e.target.value)} className="min-h-[60px]" data-testid="input-edit-shipping-address" />
                  </div>
                  <div className="flex items-center gap-2 justify-end flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => setIsEditingCustomer(false)} disabled={updateOrderMutation.isPending} data-testid="button-cancel-customer-edit">
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveCustomer} disabled={updateOrderMutation.isPending} data-testid="button-save-customer">
                      {updateOrderMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <User className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium" data-testid="text-customer-name">{order.customerName}</p>
                        <p className="text-sm text-muted-foreground">Customer</p>
                      </div>
                    </div>
                    {order.customerPhone && (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <Phone className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium" data-testid="text-customer-phone">{order.customerPhone}</p>
                          <p className="text-sm text-muted-foreground">Phone</p>
                        </div>
                      </div>
                    )}
                    {order.customerEmail && (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <Mail className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium truncate max-w-[200px]" data-testid="text-customer-email">{order.customerEmail}</p>
                          <p className="text-sm text-muted-foreground">Email</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <MapPin className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium" data-testid="text-customer-location">{order.city}, {order.province}</p>
                        <p className="text-sm text-muted-foreground">Location</p>
                      </div>
                    </div>
                  </div>
                  {order.shippingAddress && (
                    <div className="pt-4 border-t">
                      <p className="text-sm text-muted-foreground mb-1">Shipping Address</p>
                      <p className="text-sm" data-testid="text-shipping-address">{order.shippingAddress}</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Courier Tracking Journey */}
          <CourierTrackingJourney orderId={id!} order={order} />

          {/* Remarks */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Remarks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Add a remark about this order..."
                  value={newRemark}
                  onChange={(e) => setNewRemark(e.target.value)}
                  className="min-h-[80px]"
                  data-testid="input-remark"
                />
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Select value={remarkType} onValueChange={setRemarkType}>
                  <SelectTrigger className="w-[160px]" data-testid="select-remark-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="follow_up">Follow Up</SelectItem>
                    <SelectItem value="issue">Issue</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAddRemark}
                  disabled={!newRemark.trim() || addRemarkMutation.isPending}
                  data-testid="button-add-remark"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {addRemarkMutation.isPending ? "Adding..." : "Add Remark"}
                </Button>
              </div>
              <Separator />
              <div className="space-y-4">
                {order.remarks && order.remarks.length > 0 ? (
                  order.remarks.map((remark) => (
                    <div key={remark.id} className="flex gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          U
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs capitalize">
                            {remark.remarkType?.replace(/_/g, " ")}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {remark.createdAt ? format(new Date(remark.createdAt), "MMM dd, h:mm a") : ""}
                          </span>
                        </div>
                        <p className="text-sm">{remark.content}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No remarks yet. Add one above.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Combined Activity History */}
          {((auditLog && auditLog.length > 0) || (order?.changeLog && order.changeLog.length > 0)) && (() => {
            const timeline: any[] = [];
            if (auditLog) {
              auditLog.forEach((e: any) => timeline.push({ ...e, _type: "status" as const, _time: new Date(e.createdAt).getTime() }));
            }
            if (order?.changeLog) {
              order.changeLog.forEach((e: any) => timeline.push({ ...e, _type: "change" as const, _time: new Date(e.createdAt).getTime() }));
            }
            timeline.sort((a, b) => b._time - a._time);

            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <History className="w-5 h-5" />
                    Activity History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3" data-testid="audit-log-list">
                    {timeline.map((entry: any, idx: number) => (
                      <div key={`${entry._type}-${entry.id || idx}`} className="flex items-start gap-3 text-sm" data-testid={`activity-entry-${idx}`}>
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          entry._type === "status" ? "bg-blue-400" :
                          entry.changeType === "BOOKING_CANCELLED" ? "bg-red-400" :
                          entry.changeType === "PAYMENT_ADDED" || entry.changeType === "PAYMENT_REMOVED" ? "bg-green-400" :
                          "bg-amber-400"
                        }`} />
                        <div className="flex-1 min-w-0">
                          {entry._type === "status" ? (
                            <>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-xs">{entry.fromStatus}</Badge>
                                <span className="text-muted-foreground text-xs">to</span>
                                <Badge variant="secondary" className="text-xs">{entry.toStatus}</Badge>
                                {entry.actorType === "system" && (
                                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">auto</Badge>
                                )}
                              </div>
                              {entry.reason && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.reason}</p>
                              )}
                            </>
                          ) : (
                            <>
                              {entry.changeType === "FIELD_EDIT" && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-medium capitalize">{(entry.fieldName || "").replace(/([A-Z])/g, ' $1').trim()}</span>
                                  <span className="text-xs text-muted-foreground">changed</span>
                                  {entry.oldValue && (
                                    <>
                                      <span className="text-xs text-muted-foreground">from</span>
                                      <span className="text-xs line-through text-muted-foreground/70 max-w-[120px] truncate">{entry.oldValue}</span>
                                    </>
                                  )}
                                  <span className="text-xs text-muted-foreground">to</span>
                                  <span className="text-xs font-medium max-w-[120px] truncate">{entry.newValue}</span>
                                </div>
                              )}
                              {entry.changeType === "BOOKING_CANCELLED" && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge variant="destructive" className="text-xs">Booking Cancelled</Badge>
                                  {entry.oldValue && <span className="text-xs text-muted-foreground">{entry.oldValue}</span>}
                                </div>
                              )}
                              {(entry.changeType === "PAYMENT_ADDED" || entry.changeType === "PAYMENT_REMOVED") && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge variant="outline" className="text-xs">{entry.changeType === "PAYMENT_ADDED" ? "Payment Added" : "Payment Removed"}</Badge>
                                  {entry.newValue && <span className="text-xs">{entry.newValue}</span>}
                                </div>
                              )}
                              {entry.actorName && (
                                <span className="text-xs text-muted-foreground">by {entry.actorName}</span>
                              )}
                            </>
                          )}
                          <p className="text-xs text-muted-foreground/70 mt-0.5">
                            {entry.createdAt ? formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true }) : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                Order Summary
                {isLocked && (
                  <Badge variant="outline" className="text-xs gap-1" data-testid="badge-locked-summary">
                    <Lock className="w-3 h-3" />
                    Locked - Booked
                  </Badge>
                )}
              </CardTitle>
              {!isLocked && !isEditingSummary && (
                <Button variant="ghost" size="icon" onClick={startEditingSummary} data-testid="button-edit-summary">
                  <Edit3 className="w-4 h-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {isEditingSummary ? (
                <>
                  <div className="space-y-2">
                    {editLineItems.map((item, index) => (
                      <div key={index} className="space-y-1 border rounded-md p-2">
                        <Input
                          value={item.name}
                          onChange={(e) => {
                            const updated = [...editLineItems];
                            updated[index] = { ...updated[index], name: e.target.value };
                            setEditLineItems(updated);
                          }}
                          placeholder="Item name"
                          data-testid={`input-edit-line-item-name-${index}`}
                        />
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {
                              const updated = [...editLineItems];
                              updated[index] = { ...updated[index], quantity: parseInt(e.target.value) || 0 };
                              setEditLineItems(updated);
                            }}
                            placeholder="Qty"
                            className="w-20"
                            data-testid={`input-edit-line-item-qty-${index}`}
                          />
                          <Input
                            type="number"
                            value={item.price}
                            onChange={(e) => {
                              const updated = [...editLineItems];
                              updated[index] = { ...updated[index], price: e.target.value };
                              setEditLineItems(updated);
                            }}
                            placeholder="Price"
                            className="flex-1"
                            data-testid={`input-edit-line-item-price-${index}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const updated = editLineItems.filter((_, i) => i !== index);
                              setEditLineItems(updated);
                            }}
                            data-testid={`button-remove-line-item-${index}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditLineItems([...editLineItems, { name: "", quantity: 1, price: "0" }])}
                      className="w-full"
                      data-testid="button-add-line-item"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Add Item
                    </Button>
                  </div>
                  <Separator />
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Subtotal</span>
                      <Input type="number" value={editSubtotal} onChange={(e) => setEditSubtotal(e.target.value)} className="w-28 text-right" data-testid="input-edit-subtotal" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Shipping</span>
                      <Input type="number" value={editShipping} onChange={(e) => setEditShipping(e.target.value)} className="w-28 text-right" data-testid="input-edit-shipping" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Discount</span>
                      <Input type="number" value={editDiscount} onChange={(e) => setEditDiscount(e.target.value)} className="w-28 text-right" data-testid="input-edit-discount" />
                    </div>
                    <Separator />
                    <div className="flex justify-between gap-2 font-semibold text-base">
                      <span>Total</span>
                      <span>PKR {((parseFloat(editSubtotal) || 0) + (parseFloat(editShipping) || 0) - (parseFloat(editDiscount) || 0)).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 justify-end flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => setIsEditingSummary(false)} disabled={updateOrderMutation.isPending} data-testid="button-cancel-summary-edit">
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveSummary} disabled={updateOrderMutation.isPending} data-testid="button-save-summary">
                      {updateOrderMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {lineItems && lineItems.length > 0 ? (
                    <div className="space-y-2">
                      {lineItems.map((item, index) => (
                        <div key={index} className="flex items-start justify-between gap-2 text-sm" data-testid={`line-item-${index}`}>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium leading-tight">{item.name}</p>
                            <p className="text-muted-foreground text-xs">Qty: {item.quantity}</p>
                          </div>
                          <p className="font-medium shrink-0">PKR {Number(item.price).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No line items</p>
                  )}
                  <Separator />
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span data-testid="text-subtotal">PKR {Number(order.subtotalAmount || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Shipping</span>
                      <span data-testid="text-shipping">PKR {Number(order.shippingAmount || 0).toLocaleString()}</span>
                    </div>
                    {order.discountAmount && Number(order.discountAmount) > 0 && (
                      <div className="flex justify-between gap-2 text-green-600">
                        <span>Discount</span>
                        <span data-testid="text-discount">-PKR {Number(order.discountAmount).toLocaleString()}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between gap-2 font-semibold text-base">
                      <span>Total</span>
                      <span data-testid="text-total">PKR {Number(order.totalAmount).toLocaleString()}</span>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Payment</span>
                    <Badge variant="outline" className="capitalize">
                      {order.paymentMethod || "COD"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <Badge
                      className={
                        order.paymentStatus === "paid"
                          ? "bg-green-500/10 text-green-600 border-green-500/20"
                          : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                      }
                    >
                      {order.paymentStatus?.replace(/\b\w/g, (l) => l.toUpperCase())}
                    </Badge>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Payments */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Payments
                {paymentData?.codPaymentStatus && paymentData.codPaymentStatus !== "UNPAID" && (
                  <Badge
                    className={
                      paymentData.codPaymentStatus === "PAID"
                        ? "bg-green-500/10 text-green-600 border-green-500/20"
                        : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                    }
                    data-testid="badge-payment-status"
                  >
                    {paymentData.codPaymentStatus === "PAID" ? "Prepaid" : "Partial"}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="font-medium" data-testid="text-payment-total">
                    PKR {(paymentData?.totalAmount ?? Number(order.totalAmount)).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="font-medium text-green-600" data-testid="text-payment-paid">
                    PKR {(paymentData?.prepaidAmount ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Remaining COD</span>
                  <span className="font-semibold" data-testid="text-payment-remaining">
                    PKR {(paymentData?.codRemaining ?? Number(order.totalAmount)).toLocaleString()}
                  </span>
                </div>
              </div>

              {paymentData?.isBooked && paymentData?.prepaidAmount > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  This order is already booked. COD cannot be changed unless rebooked.
                </p>
              )}

              {!paymentData?.isBooked && (paymentData?.codPaymentStatus !== "PAID") && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Amount"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        className="flex-1"
                        data-testid="input-payment-amount"
                      />
                      <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                        <SelectTrigger className="w-[120px]" data-testid="select-payment-method">
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
                    <Input
                      placeholder="Reference (optional)"
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      data-testid="input-payment-ref"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleAddPayment}
                        disabled={addPaymentMutation.isPending || !paymentAmount}
                        className="flex-1"
                        data-testid="button-add-payment"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add Payment
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markPaidMutation.mutate()}
                        disabled={markPaidMutation.isPending}
                        data-testid="button-mark-paid"
                      >
                        Mark Fully Paid
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {paymentData?.payments && paymentData.payments.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2" data-testid="payment-history">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">History</p>
                    {paymentData.payments.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 text-sm" data-testid={`payment-entry-${p.id}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">PKR {Number(p.amount).toLocaleString()}</span>
                            <Badge variant="outline" className="text-xs">{p.method}</Badge>
                          </div>
                          {p.reference && <p className="text-xs text-muted-foreground truncate">{p.reference}</p>}
                          <p className="text-xs text-muted-foreground/70">
                            {p.createdAt ? format(new Date(p.createdAt), "MMM dd, h:mm a") : ""}
                          </p>
                        </div>
                        {!paymentData.isBooked && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deletePaymentMutation.mutate(p.id)}
                            disabled={deletePaymentMutation.isPending}
                            data-testid={`button-delete-payment-${p.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {(paymentData?.prepaidAmount ?? 0) > 0 && !paymentData?.isBooked && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-xs text-muted-foreground"
                  onClick={() => resetPaymentsMutation.mutate()}
                  disabled={resetPaymentsMutation.isPending}
                  data-testid="button-reset-payments"
                >
                  Reset All Payments
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Tags */}
          {order.tags && Array.isArray(order.tags) && order.tags.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2" data-testid="text-tags-title">
                  <Tag className="w-5 h-5" />
                  Tags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2" data-testid="tags-list">
                  {(order.tags as string[]).map((tag, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className={
                        tag === 'Robo-Confirm' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                        tag === 'Robo-Pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' :
                        tag === 'Robo-Cancel' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                        ''
                      }
                      data-testid={`badge-tag-${index}`}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {order.courierTracking && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Printer className="w-5 h-5" />
                  Shipping & Print
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Courier</span>
                    <span className="font-medium capitalize" data-testid="text-print-courier">{order.courierName || "-"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Tracking #</span>
                    <span className="font-medium font-mono" data-testid="text-print-tracking">{order.courierTracking}</span>
                  </div>
                  {order.bookedAt && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Booked</span>
                      <span className="font-medium" data-testid="text-print-booked-date">
                        {format(new Date(order.bookedAt), "MMM dd, yyyy")}
                      </span>
                    </div>
                  )}
                </div>
                <Separator />
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    data-testid="button-print-airway-bill"
                    onClick={async () => {
                      try {
                        const isPostEx = (order.courierName || "").toLowerCase().includes("postex");
                        const fetchUrl = isPostEx
                          ? `/api/couriers/postex/invoice?trackingNumber=${encodeURIComponent(order.courierTracking!)}`
                          : `/api/print/native-slip/${(order as any).id}.pdf`;
                        const resp = await fetch(fetchUrl);
                        if (!resp.ok) {
                          const err = await resp.json().catch(() => ({ message: "Failed to fetch airway bill" }));
                          toast({ title: "Invoice Error", description: err.message, variant: "destructive" });
                          return;
                        }
                        const blob = await resp.blob();
                        if (blob.size === 0 || blob.type.includes("json")) {
                          toast({ title: "Invoice Error", description: "Invoice not available for this order", variant: "destructive" });
                          return;
                        }
                        const url = URL.createObjectURL(blob);
                        window.open(url, "_blank");
                        setTimeout(() => URL.revokeObjectURL(url), 60000);
                      } catch {
                        toast({ title: "Error", description: "Could not fetch airway bill", variant: "destructive" });
                      }
                    }}
                  >
                    <Printer className="w-4 h-4" />
                    Print Courier Airway Bill
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    data-testid="button-download-pdf"
                    onClick={async () => {
                      try {
                        const isPostEx = (order.courierName || "").toLowerCase().includes("postex");
                        const fetchUrl = isPostEx
                          ? `/api/couriers/postex/invoice?trackingNumber=${encodeURIComponent(order.courierTracking!)}`
                          : `/api/print/native-slip/${(order as any).id}.pdf`;
                        const resp = await fetch(fetchUrl);
                        if (!resp.ok) {
                          const err = await resp.json().catch(() => ({ message: "Failed to fetch airway bill" }));
                          toast({ title: "Invoice Error", description: err.message, variant: "destructive" });
                          return;
                        }
                        const blob = await resp.blob();
                        if (blob.size === 0 || blob.type.includes("json")) {
                          toast({ title: "Invoice Error", description: "Invoice not available for this order", variant: "destructive" });
                          return;
                        }
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `postex-invoice-${order.courierTracking}.pdf`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch {
                        toast({ title: "Error", description: "Could not download airway bill", variant: "destructive" });
                      }
                    }}
                  >
                    <Download className="w-4 h-4" />
                    Download Courier AWB
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
