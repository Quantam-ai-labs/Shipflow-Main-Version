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
  ArrowRightLeft,
  DollarSign,
  Ban,
  ChevronDown,
  ChevronUp,
  Bot,
  UserCircle,
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

function getWorkflowBadge(workflowStatus: string | null) {
  const status = workflowStatus || "NEW";
  const config: Record<string, { bg: string; label: string }> = {
    NEW: { bg: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", label: "New" },
    PENDING: { bg: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300", label: "Pending" },
    HOLD: { bg: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300", label: "Hold" },
    READY_TO_SHIP: { bg: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300", label: "Ready to Ship" },
    BOOKED: { bg: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300", label: "Booked" },
    FULFILLED: { bg: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300", label: "Fulfilled" },
    DELIVERED: { bg: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", label: "Delivered" },
    RETURN: { bg: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300", label: "Return" },
    CANCELLED: { bg: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400", label: "Cancelled" },
  };
  const c = config[status] || config.NEW;
  return <Badge className={c.bg} data-testid="badge-workflow-stage">{c.label}</Badge>;
}

function getShipmentStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    BOOKED: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    ARRIVED_AT_ORIGIN: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
    PICKED_UP: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
    IN_TRANSIT: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    ARRIVED_AT_DESTINATION: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    OUT_FOR_DELIVERY: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    DELIVERY_ATTEMPTED: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
    DELIVERED: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    DELIVERY_FAILED: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    READY_FOR_RETURN: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
    RETURN_IN_TRANSIT: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
    RETURNED_TO_SHIPPER: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
    CANCELLED: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  };
  return colorMap[status] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
}

function getShipmentStatusBadge(normalizedStatus: string | null, rawStatus?: string | null) {
  if (!normalizedStatus || normalizedStatus === "Unfulfilled" || normalizedStatus === "pending") return null;
  const bg = getShipmentStatusColor(normalizedStatus);
  const label = rawStatus || normalizedStatus.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  return <Badge variant="outline" className={bg} data-testid="badge-shipment-status">{label}</Badge>;
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
  { key: "BOOKED", label: "Booked", icon: Package, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-600", lightBg: "bg-blue-100 dark:bg-blue-950", ring: "ring-blue-600/30" },
  { key: "PICKED_UP", label: "Picked Up", icon: PackageCheck, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-600", lightBg: "bg-indigo-100 dark:bg-indigo-950", ring: "ring-indigo-600/30" },
  { key: "IN_TRANSIT", label: "In Transit", icon: Truck, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-600", lightBg: "bg-purple-100 dark:bg-purple-950", ring: "ring-purple-600/30" },
  { key: "OUT_FOR_DELIVERY", label: "Out for Delivery", icon: MapPinned, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-600", lightBg: "bg-amber-100 dark:bg-amber-950", ring: "ring-amber-600/30" },
  { key: "DELIVERED", label: "Delivered", icon: CheckCircle2, color: "text-green-600 dark:text-green-400", bg: "bg-green-600", lightBg: "bg-green-100 dark:bg-green-950", ring: "ring-green-600/30" },
];

const RETURN_STAGES = [
  { key: "DELIVERY_FAILED", label: "Failed", icon: AlertTriangle, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-600", lightBg: "bg-orange-100 dark:bg-orange-950", ring: "ring-orange-600/30" },
  { key: "READY_FOR_RETURN", label: "Ready for Return", icon: AlertTriangle, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-600", lightBg: "bg-orange-100 dark:bg-orange-950", ring: "ring-orange-600/30" },
  { key: "RETURN_IN_TRANSIT", label: "Return Transit", icon: RotateCcw, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-600", lightBg: "bg-rose-100 dark:bg-rose-950", ring: "ring-rose-600/30" },
  { key: "RETURNED_TO_SHIPPER", label: "Returned", icon: RotateCcw, color: "text-red-600 dark:text-red-400", bg: "bg-red-600", lightBg: "bg-red-100 dark:bg-red-950", ring: "ring-red-600/30" },
];

const CANCELLED_STAGE = { key: "CANCELLED", label: "Cancelled", icon: XCircle, color: "text-gray-600 dark:text-gray-400", bg: "bg-gray-500", lightBg: "bg-gray-100 dark:bg-gray-900", ring: "ring-gray-500/30" };

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

function getActivityIcon(entry: any) {
  if (entry._type === "status") {
    if (entry.actorType === "system") return Bot;
    if (entry.action === "revert") return RotateCcw;
    if (entry.toStatus === "CANCELLED") return XCircle;
    if (entry.toStatus === "BOOKED") return Truck;
    if (entry.toStatus === "DELIVERED") return CheckCircle2;
    return ArrowRightLeft;
  }
  switch (entry.changeType) {
    case "PAYMENT_ADDED":
    case "PAYMENT_MARK_PAID":
      return DollarSign;
    case "PAYMENT_DELETED":
    case "PAYMENT_REMOVED":
    case "PAYMENT_RESET":
      return Ban;
    case "BOOKING_CANCELLED":
    case "SHOPIFY_CANCELLED":
      return XCircle;
    case "REMARK_ADDED":
      return MessageSquare;
    case "FIELD_EDIT":
      return Edit3;
    default:
      return History;
  }
}

function getActivityColor(entry: any): string {
  if (entry._type === "status") {
    if (entry.toStatus === "CANCELLED") return "text-red-500 bg-red-100 dark:bg-red-950";
    if (entry.toStatus === "DELIVERED") return "text-green-500 bg-green-100 dark:bg-green-950";
    if (entry.toStatus === "BOOKED") return "text-blue-500 bg-blue-100 dark:bg-blue-950";
    if (entry.toStatus === "RETURN") return "text-rose-500 bg-rose-100 dark:bg-rose-950";
    if (entry.actorType === "system") return "text-sky-500 bg-sky-100 dark:bg-sky-950";
    return "text-indigo-500 bg-indigo-100 dark:bg-indigo-950";
  }
  switch (entry.changeType) {
    case "PAYMENT_ADDED":
    case "PAYMENT_MARK_PAID":
      return "text-emerald-500 bg-emerald-100 dark:bg-emerald-950";
    case "PAYMENT_DELETED":
    case "PAYMENT_REMOVED":
    case "PAYMENT_RESET":
      return "text-orange-500 bg-orange-100 dark:bg-orange-950";
    case "BOOKING_CANCELLED":
    case "SHOPIFY_CANCELLED":
      return "text-red-500 bg-red-100 dark:bg-red-950";
    case "REMARK_ADDED":
      return "text-violet-500 bg-violet-100 dark:bg-violet-950";
    case "FIELD_EDIT":
      return "text-amber-500 bg-amber-100 dark:bg-amber-950";
    default:
      return "text-muted-foreground bg-muted";
  }
}

function getActivityLabel(entry: any): string {
  if (entry._type === "status") {
    if (entry.action === "revert") return "Status Reverted";
    if (entry.action === "auto_12h_pending") return "Auto-moved to Pending";
    if (entry.action === "courier_booked") return "Courier Booked";
    if (entry.action === "cancel_booking") return "Booking Cancelled";
    if (entry.action === "shopify_cancel") return "Shopify Cancelled";
    return "Status Changed";
  }
  switch (entry.changeType) {
    case "PAYMENT_ADDED": return "Payment Added";
    case "PAYMENT_DELETED":
    case "PAYMENT_REMOVED": return "Payment Removed";
    case "PAYMENT_MARK_PAID": return "Marked Fully Paid";
    case "PAYMENT_RESET": return "Payments Reset";
    case "BOOKING_CANCELLED": return "Booking Cancelled";
    case "SHOPIFY_CANCELLED": return "Shopify Cancelled";
    case "REMARK_ADDED": return "Remark Added";
    case "FIELD_EDIT": return "Field Edited";
    default: return entry.changeType || "Change";
  }
}

function ActivityTimeline({ auditLog, changeLog }: { auditLog: any[] | undefined; changeLog: any[] | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED_COUNT = 5;

  const timeline: any[] = [];
  if (auditLog) {
    auditLog.forEach((e: any) => timeline.push({ ...e, _type: "status" as const, _time: new Date(e.createdAt).getTime() }));
  }
  if (changeLog) {
    changeLog.forEach((e: any) => timeline.push({ ...e, _type: "change" as const, _time: new Date(e.createdAt).getTime() }));
  }
  timeline.sort((a, b) => b._time - a._time);

  if (timeline.length === 0) return null;

  const visible = expanded ? timeline : timeline.slice(0, COLLAPSED_COUNT);
  const hasMore = timeline.length > COLLAPSED_COUNT;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="w-5 h-5" />
          Activity History
        </CardTitle>
        <Badge variant="secondary" className="text-xs">{timeline.length}</Badge>
      </CardHeader>
      <CardContent>
        <div className="relative" data-testid="audit-log-list">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-4">
            {visible.map((entry: any, idx: number) => {
              const Icon = getActivityIcon(entry);
              const colorCls = getActivityColor(entry);
              const label = getActivityLabel(entry);
              const actorDisplay = entry.actorName || (entry.actorType === "system" ? "System" : null);
              const timeStr = entry.createdAt ? formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true }) : "";

              return (
                <div key={`${entry._type}-${entry.id || idx}`} className="flex items-start gap-3 relative" data-testid={`activity-entry-${idx}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 ${colorCls}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{label}</span>
                      {actorDisplay && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <UserCircle className="w-3 h-3" />
                          {actorDisplay}
                        </span>
                      )}
                    </div>
                    {entry._type === "status" && (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">{entry.fromStatus}</Badge>
                        <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
                        <Badge variant="secondary" className="text-xs">{entry.toStatus}</Badge>
                      </div>
                    )}
                    {entry._type === "change" && entry.changeType === "FIELD_EDIT" && (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-xs font-medium capitalize">{(entry.fieldName || "").replace(/([A-Z])/g, ' $1').trim()}</span>
                        {entry.oldValue && (
                          <>
                            <span className="text-xs text-muted-foreground">from</span>
                            <span className="text-xs line-through text-muted-foreground/70 break-words">{entry.oldValue}</span>
                          </>
                        )}
                        <span className="text-xs text-muted-foreground">to</span>
                        <span className="text-xs font-medium break-words">{entry.newValue}</span>
                      </div>
                    )}
                    {entry._type === "change" && (entry.changeType === "PAYMENT_ADDED" || entry.changeType === "PAYMENT_DELETED" || entry.changeType === "PAYMENT_REMOVED") && entry.metadata && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {entry.metadata.amount ? `Rs ${entry.metadata.amount}` : ""}{entry.metadata.method ? ` via ${entry.metadata.method}` : ""}
                      </p>
                    )}
                    {entry._type === "change" && entry.changeType === "REMARK_ADDED" && entry.newValue && (
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">"{entry.newValue}"</p>
                    )}
                    {entry.reason && entry._type === "status" && (
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">{entry.reason}</p>
                    )}
                    <p className="text-xs text-muted-foreground/60 mt-0.5">{timeStr}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-3"
            onClick={() => setExpanded(!expanded)}
            data-testid="button-toggle-activity"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4 mr-1" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-1" />
                Show All ({timeline.length})
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function TrackingStageNode({ stage, isActive, isCurrent, isLast }: {
  stage: typeof PIPELINE_STAGES[0];
  isActive: boolean;
  isCurrent: boolean;
  isLast: boolean;
}) {
  const Icon = stage.icon;
  return (
    <div className="flex items-center" style={{ flex: isLast ? 0 : 1 }}>
      <div className="flex flex-col items-center gap-1.5 shrink-0">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
            isCurrent
              ? `${stage.bg} text-white ring-[3px] ${stage.ring} shadow-sm`
              : isActive
                ? `${stage.bg} text-white opacity-80`
                : "bg-muted text-muted-foreground/50"
          }`}
          data-testid={`tracking-stage-${stage.key}`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className={`text-[10px] text-center leading-tight whitespace-nowrap ${
          isCurrent ? "font-semibold " + stage.color : isActive ? "font-medium " + stage.color : "text-muted-foreground/60"
        }`}>
          {stage.label}
        </span>
      </div>
      {!isLast && (
        <div className="flex-1 h-[2px] mx-1.5 mt-[-18px]">
          <div className={`h-full rounded-full transition-all ${isActive ? stage.bg + " opacity-60" : "bg-muted"}`} />
        </div>
      )}
    </div>
  );
}

function CourierTrackingJourney({ orderId, order }: { orderId: string; order: OrderDetails }) {
  const [showAllEvents, setShowAllEvents] = useState(false);
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
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Truck className="w-6 h-6 text-muted-foreground/40" />
            </div>
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
  const visibleEvents = showAllEvents ? reversedEvents : reversedEvents.slice(0, 4);
  const hasMoreEvents = reversedEvents.length > 4;

  const currentStage = isCancelled
    ? CANCELLED_STAGE
    : activeIndex >= 0 ? pipeline[activeIndex] : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Tracking
            </CardTitle>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="font-mono text-[11px] px-2" data-testid="badge-tracking-number">
              {order.courierTracking}
            </Badge>
            <Badge variant="secondary" className="text-[11px] capitalize px-2" data-testid="badge-courier-name">
              {order.courierName}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-tracking"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {tracking?.rawStatus && currentStage && (
          <div className={`flex items-center gap-3 rounded-md px-3 py-2.5 ${currentStage.lightBg}`} data-testid="tracking-current-status">
            <CircleDot className={`w-4 h-4 shrink-0 ${currentStage.color}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${currentStage.color}`}>{tracking.rawStatus}</p>
              {tracking.lastUpdate && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {format(new Date(tracking.lastUpdate), "MMM dd, yyyy 'at' h:mm a")}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="relative px-2 pt-2 pb-1 overflow-x-auto" data-testid="tracking-pipeline">
          <div className="flex items-start min-w-[400px]">
            {pipeline.map((stage, idx) => (
              <TrackingStageNode
                key={stage.key}
                stage={stage}
                isActive={idx <= activeIndex}
                isCurrent={idx === activeIndex}
                isLast={idx === pipeline.length - 1 && !isCancelled}
              />
            ))}
            {isCancelled && (
              <TrackingStageNode
                stage={CANCELLED_STAGE}
                isActive={true}
                isCurrent={true}
                isLast={true}
              />
            )}
          </div>
        </div>

        {reversedEvents.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Activity Log</p>
                {hasMoreEvents && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-auto py-1 px-2"
                    onClick={() => setShowAllEvents(!showAllEvents)}
                    data-testid="button-toggle-events"
                  >
                    {showAllEvents ? "Show less" : `Show all (${reversedEvents.length})`}
                  </Button>
                )}
              </div>
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
              ) : (
                <div className="relative pl-6" data-testid="tracking-events-list">
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                  {visibleEvents.map((event, idx) => (
                    <div key={idx} className="relative flex items-start gap-3 pb-4 last:pb-0" data-testid={`tracking-event-${idx}`}>
                      <div className={`absolute left-[-17px] mt-1 shrink-0 ${
                        idx === 0
                          ? "w-[9px] h-[9px] rounded-full bg-primary ring-[3px] ring-primary/20"
                          : "w-[7px] h-[7px] rounded-full bg-muted-foreground/30 ml-px"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-snug ${idx === 0 ? "font-medium" : "text-muted-foreground"}`}>
                          {event.description || event.status}
                        </p>
                        {event.date && (
                          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                            {formatEventDate(event.date)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {!isLoading && reversedEvents.length === 0 && (
          <>
            <Separator />
            <p className="text-sm text-muted-foreground text-center py-2">No tracking events available from the courier.</p>
          </>
        )}
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

  const customerPhone = order?.customerPhone;
  const { data: customerHistoryData } = useQuery<{ phone: string; orderCount: number; orders: any[] }>({
    queryKey: ["/api/orders/customer-history", customerPhone],
    queryFn: async () => {
      const res = await fetch(`/api/orders/customer-history/${encodeURIComponent(customerPhone!)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!customerPhone,
    staleTime: 60 * 1000,
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
  const lineItems = order.lineItems as Array<{ name: string; quantity: number; price: string; sku?: string; image?: string | null; variantTitle?: string | null; productId?: string | null }> | null;

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
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">Order # {String(order.orderNumber).replace(/^#/, '')}</h1>
              {(order as any).orderSource === "shopify_draft_order" && (
                <Badge className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border-purple-200 dark:border-purple-700" data-testid="badge-draft-order">
                  Draft Order
                </Badge>
              )}
              {getWorkflowBadge(order.workflowStatus)}
              {getShipmentStatusBadge(order.shipmentStatus, (order as any).courierRawStatus)}
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
                    <div className="space-y-3">
                      {lineItems.map((item, index) => (
                        <div key={index} className="flex items-center gap-3 py-1" data-testid={`line-item-${index}`}>
                          <div className="w-12 h-12 rounded-md border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                            {item.image ? (
                              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm leading-tight">{item.name}</p>
                            {item.variantTitle && (
                              <p className="text-xs text-muted-foreground">{item.variantTitle}</p>
                            )}
                            {item.sku && (
                              <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-medium">PKR {Number(item.price).toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">x {item.quantity}</p>
                          </div>
                          <p className="text-sm font-semibold shrink-0 w-24 text-right">PKR {(Number(item.price) * item.quantity).toLocaleString()}</p>
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
          <ActivityTimeline auditLog={auditLog} changeLog={order?.changeLog} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                <User className="w-5 h-5" />
                Customer
                {isLocked && (
                  <Badge variant="outline" className="text-xs gap-1" data-testid="badge-locked-customer">
                    <Lock className="w-3 h-3" />
                    Locked
                  </Badge>
                )}
              </CardTitle>
              {!isLocked && !isEditingCustomer && (
                <Button variant="ghost" size="icon" onClick={startEditingCustomer} data-testid="button-edit-customer">
                  <Edit3 className="w-4 h-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {isEditingCustomer ? (
                <>
                  <div className="space-y-2">
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
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">City</label>
                        <Input value={editCity} onChange={(e) => setEditCity(e.target.value)} data-testid="input-edit-city" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Province</label>
                        <Input value={editProvince} onChange={(e) => setEditProvince(e.target.value)} data-testid="input-edit-province" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Postal Code</label>
                      <Input value={editPostalCode} onChange={(e) => setEditPostalCode(e.target.value)} data-testid="input-edit-postal-code" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Shipping Address</label>
                      <Textarea value={editShippingAddress} onChange={(e) => setEditShippingAddress(e.target.value)} className="min-h-[60px]" data-testid="input-edit-shipping-address" />
                    </div>
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
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <User className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium" data-testid="text-customer-name">{order.customerName}</span>
                    </div>
                    {order.customerPhone && (
                      <div className="flex items-center gap-2.5">
                        <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm" data-testid="text-customer-phone">{order.customerPhone}</span>
                      </div>
                    )}
                    {order.customerEmail && (
                      <div className="flex items-center gap-2.5">
                        <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate" data-testid="text-customer-email">{order.customerEmail}</span>
                      </div>
                    )}
                  </div>
                  <Separator />
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Shipping Address</p>
                    <div className="text-sm space-y-0.5">
                      <p data-testid="text-customer-name-address">{order.customerName}</p>
                      {order.shippingAddress && <p className="text-muted-foreground" data-testid="text-shipping-address">{order.shippingAddress}</p>}
                      <p className="text-muted-foreground" data-testid="text-customer-location">{order.city}{order.province ? `, ${order.province}` : ""}</p>
                      {order.postalCode && <p className="text-muted-foreground">{order.postalCode}</p>}
                      {order.customerPhone && <p className="text-muted-foreground">{order.customerPhone}</p>}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Customer Order History */}
          {customerHistoryData && customerHistoryData.orderCount > 1 && (
            <Card data-testid="card-customer-history">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Order History
                  <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-blue-200 dark:border-blue-700">
                    {customerHistoryData.orderCount} orders
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                  {customerHistoryData.orders
                    .filter((o: any) => String(o.id) !== String(id))
                    .map((o: any) => (
                    <Link
                      key={o.id}
                      href={`/orders/detail/${o.id}`}
                      className="flex items-center justify-between p-2 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer block"
                      data-testid={`history-order-link-${o.id}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-primary">{o.orderNumber}</span>
                          <Badge className={`text-[9px] px-1 py-0 ${
                            o.workflowStatus === "DELIVERED" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                            o.workflowStatus === "CANCELLED" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                            o.workflowStatus === "RETURN" ? "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" :
                            "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}>
                            {o.workflowStatus}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {o.orderDate ? format(new Date(o.orderDate), "MMM d, yyyy") : "No date"}
                        </span>
                      </div>
                      <span className="text-xs font-medium shrink-0 ml-2">{Number(o.totalAmount).toLocaleString()}</span>
                    </Link>
                  ))}
                  {customerHistoryData.orders.filter((o: any) => String(o.id) !== String(id)).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">This is their only order</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

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
