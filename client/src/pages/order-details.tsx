import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Shield,
  UserCheck,
  DollarSign,
  Ban,
  ChevronDown,
  ChevronUp,
  Bot,
  UserCircle,
  PenLine,
  Loader2,
  X,
  Smartphone,
  MessageCircle,
  PhoneOff,
  BellOff,
  PhoneCall,
  Check,
  CheckCheck,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Order, Shipment, ShipmentEvent, Remark } from "@shared/schema";
import { ProductPicker, type PickedProduct } from "@/components/product-picker";
import { Link, useParams } from "wouter";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { formatPkDateTime, formatPkDate, formatPkShortDate } from "@/lib/dateFormat";
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
    PENDING: { bg: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300", label: "Confirmation Pending" },
    HOLD: { bg: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300", label: "Conflicting" },
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
    case "WHATSAPP_SENT":
      return Smartphone;
    case "WHATSAPP_CONFIRMED":
    case "WHATSAPP_CANCELLED":
    case "WHATSAPP_QUERY":
      return MessageCircle;
    case "ROBO_CONFIRMED":
    case "ROBO_CANCELLED":
      return Phone;
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
    case "WHATSAPP_SENT":
      return entry.newValue === "sent"
        ? "text-green-600 bg-green-100 dark:bg-green-950"
        : "text-red-500 bg-red-100 dark:bg-red-950";
    case "WHATSAPP_CONFIRMED":
    case "ROBO_CONFIRMED":
      return "text-green-600 bg-green-100 dark:bg-green-950";
    case "WHATSAPP_CANCELLED":
    case "ROBO_CANCELLED":
      return "text-red-500 bg-red-100 dark:bg-red-950";
    case "WHATSAPP_QUERY":
      return "text-blue-500 bg-blue-100 dark:bg-blue-950";
    default:
      return "text-muted-foreground bg-muted";
  }
}

function getActivityLabel(entry: any): string {
  if (entry._type === "status") {
    if (entry.action === "revert") return "Status Reverted";
    if (entry.action === "auto_12h_pending") return "Moved to Agent Queue (No Response)";
    if (entry.action === "courier_booked") return "Courier Booked";
    if (entry.action === "cancel_booking") return "Booking Cancelled";
    if (entry.action === "shopify_cancel") return "Shopify Cancelled";
    if (entry.action === "conflict_hold") return "Conflicting Responses — Needs Review";
    if (entry.action === "robocall_exhausted") return "All Calls Done — No Response";
    if (entry.action === "whatsapp_confirm") return "Confirmed via WhatsApp";
    if (entry.action === "whatsapp_cancel") return "Cancelled via WhatsApp";
    if (entry.action === "robocall_confirm") return "Confirmed via Call";
    if (entry.action === "robocall_cancel") return "Cancelled via Call";
    if (entry.action === "manual_confirm") return "Manually Confirmed";
    if (entry.action === "manual_cancel") return "Manually Cancelled";
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
    case "FIELD_EDIT": return "Order Edited";
    case "WHATSAPP_SENT": return entry.newValue === "sent" ? "WhatsApp Sent" : "WhatsApp Failed";
    case "WHATSAPP_CONFIRMED": return "Confirmed via WhatsApp";
    case "WHATSAPP_CANCELLED": return "Cancelled via WhatsApp";
    case "WHATSAPP_QUERY": return "Customer Sent a Question";
    case "ROBO_CONFIRMED": return "Confirmed via Call";
    case "ROBO_CANCELLED": return "Cancelled via Call";
    default: return entry.changeType?.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()) || "Change";
  }
}

type SmartEntry =
  | { kind: 'wa_attempt'; num: number; sent: any; response: any | null; hasFailed: boolean; noReplyMs: number; _time: number; key: string }
  | { kind: 'call_attempt'; num: number; sent: any; response: any | null; _time: number; key: string }
  | { kind: 'call_deferred'; event: any; _time: number; key: string }
  | { kind: 'confirmation'; event: any; _time: number; key: string }
  | { kind: 'status'; event: any; _time: number; key: string }
  | { kind: 'change'; event: any; _time: number; key: string };

function buildSmartTimeline(
  auditLog: any[] | undefined,
  changeLog: any[] | undefined,
  confirmationTimeline: any[] | undefined,
): SmartEntry[] {
  const SUPPRESS = new Set(['TAGS_WRITTEN', 'CHANNELS_CANCELLED', 'WA_REMINDERS_CANCELLED', 'ROBO_QUEUE_CANCELLED', 'STATUS_CHANGED']);

  const confAll = (confirmationTimeline || []).map(e => ({ ...e, _time: new Date(e.createdAt).getTime() }));
  const confAsc = confAll.filter(e => !SUPPRESS.has(e.eventType)).sort((a, b) => a._time - b._time);

  const consumed = new Set<number>();
  type ConsumedTransition = { time: number; toStatus: string | null };
  const consumedTransitions: ConsumedTransition[] = [];
  const result: SmartEntry[] = [];
  let waNum = 0;
  let callNum = 0;

  for (let i = 0; i < confAsc.length; i++) {
    if (consumed.has(i)) continue;
    const e = confAsc[i];

    if (e.eventType === 'WA_SENT' || e.eventType === 'WA_REMINDER_SENT') {
      waNum++;
      const sentRetryCount = e.retryCount ?? null;
      let rIdx = -1;
      for (let j = i + 1; j < confAsc.length; j++) {
        if (consumed.has(j)) continue;
        const et = confAsc[j].eventType;
        if (et === 'WA_RESPONSE') {
          const respRetryCount = confAsc[j].retryCount ?? null;
          const matchesByCount = sentRetryCount !== null
            ? (respRetryCount !== null && respRetryCount === sentRetryCount)
            : true;
          if (matchesByCount) { rIdx = j; break; }
        }
        if (et === 'WA_EXHAUSTED' || et === 'WA_SENT' || et === 'WA_REMINDER_SENT') break;
      }
      let hasFailed = false;
      for (let j = i + 1; j < confAsc.length; j++) {
        const et2 = confAsc[j].eventType;
        if (et2 === 'WA_PERMANENT_FAILURE') { hasFailed = true; break; }
        if (et2 === 'WA_SENT' || et2 === 'WA_REMINDER_SENT' || et2 === 'WA_EXHAUSTED') break;
      }
      consumed.add(i);
      if (rIdx >= 0) {
        consumed.add(rIdx);
        const rc = confAsc[rIdx].responseClassification;
        const toStatus = rc === 'confirm' ? 'CONFIRMED' : rc === 'cancel' ? 'CANCELLED' : null;
        if (toStatus !== null) consumedTransitions.push({ time: confAsc[rIdx]._time, toStatus });
      }
      const nextCapTime = confAsc[i + 1]?._time ?? Date.now();
      const noReplyMs = rIdx < 0 ? Math.max(0, nextCapTime - e._time) : 0;
      result.push({
        kind: 'wa_attempt', num: waNum, sent: e,
        response: rIdx >= 0 ? confAsc[rIdx] : null,
        hasFailed, noReplyMs,
        _time: e._time, key: `wa-${i}`,
      });

    } else if (e.eventType === 'CALL_ATTEMPTED') {
      callNum++;
      let rIdx = -1;
      for (let j = i + 1; j < confAsc.length; j++) {
        if (consumed.has(j)) continue;
        const et = confAsc[j].eventType;
        if (et === 'CALL_RESPONSE') { rIdx = j; break; }
        if (et === 'CALL_ATTEMPTED') break;
      }
      consumed.add(i);
      if (rIdx >= 0) {
        consumed.add(rIdx);
        const rc = confAsc[rIdx].responseClassification;
        const toStatus = rc === 'confirm' ? 'CONFIRMED' : rc === 'cancel' ? 'CANCELLED' : null;
        if (toStatus !== null) consumedTransitions.push({ time: confAsc[rIdx]._time, toStatus });
      }
      result.push({ kind: 'call_attempt', num: callNum, sent: e, response: rIdx >= 0 ? confAsc[rIdx] : null, _time: e._time, key: `call-${i}` });

    } else if (e.eventType === 'CALL_DEFERRED') {
      consumed.add(i);
      result.push({ kind: 'call_deferred', event: e, _time: e._time, key: `deferred-${i}` });

    } else if (e.eventType === 'MANUAL_OVERRIDE') {
      consumed.add(i);
      if (e.newStatus) consumedTransitions.push({ time: e._time, toStatus: e.newStatus });
      result.push({ kind: 'confirmation', event: e, _time: e._time, key: `conf-${i}` });

    } else if (e.eventType === 'ROBO_EXHAUSTED') {
      consumed.add(i);
      consumedTransitions.push({ time: e._time, toStatus: 'PENDING' });
      result.push({ kind: 'confirmation', event: e, _time: e._time, key: `conf-${i}` });

    } else {
      consumed.add(i);
      result.push({ kind: 'confirmation', event: e, _time: e._time, key: `conf-${i}` });
    }
  }

  const AUDIT_ACTIONS_ALWAYS_SUPPRESSED = new Set([
    'robocall_exhausted', 'whatsapp_confirm', 'whatsapp_cancel',
    'robocall_confirm', 'robocall_cancel', 'manual_confirm', 'manual_cancel',
  ]);

  const waSentOnlyTimes = confAll.filter(e => e.eventType === 'WA_SENT').map(e => e._time);

  const hasConsumedTransitions = consumedTransitions.length > 0;

  for (const e of (auditLog || []).map(e => ({ ...e, _type: 'status', _time: new Date(e.createdAt).getTime() }))) {
    const isRedundantAction = hasConsumedTransitions && AUDIT_ACTIONS_ALWAYS_SUPPRESSED.has(e.action);
    const isDuplicateTransition = consumedTransitions.some(ct =>
      Math.abs(ct.time - e._time) < 10000 &&
      ct.toStatus !== null && ct.toStatus === e.toStatus
    );
    if (isRedundantAction || isDuplicateTransition) continue;
    result.push({ kind: 'status', event: e, _time: e._time, key: `status-${e.id}` });
  }

  for (const e of (changeLog || []).map(e => ({ ...e, _type: 'change', _time: new Date(e.createdAt).getTime() }))) {
    if (e.changeType === 'WHATSAPP_SENT' && waSentOnlyTimes.some(t => Math.abs(t - e._time) < 60000)) continue;
    result.push({ kind: 'change', event: e, _time: e._time, key: `change-${e.id}` });
  }

  result.sort((a, b) => b._time - a._time);
  return result;
}

function OrderTimeline({ orderId, auditLog, changeLog }: { orderId: string; auditLog: any[] | undefined; changeLog: any[] | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED_COUNT = 5;
  const { toast } = useToast();

  const { data: confirmationData } = useQuery<{ timeline: any[] }>({
    queryKey: ["/api/orders", orderId, "confirmation-timeline"],
    staleTime: 30000,
  });

  const retryLogMutation = useMutation({
    mutationFn: async (logId: string) => {
      const res = await apiRequest("POST", `/api/whatsapp-logs/${logId}/retry`);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({ title: "WhatsApp message resent successfully" });
      } else {
        toast({ title: "Retry failed", description: data.error || "Unknown error", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "confirmation-timeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    },
    onError: (err: any) => {
      toast({ title: "Retry failed", description: err.message, variant: "destructive" });
    },
  });

  const retryOrderMutation = useMutation({
    mutationFn: async (toStatus?: string) => {
      const res = await apiRequest("POST", `/api/orders/${orderId}/retry-whatsapp`, { toStatus: toStatus || "NEW" });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({ title: "WhatsApp message resent successfully" });
      } else {
        toast({ title: "Retry failed", description: data.error || "Unknown error", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "confirmation-timeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    },
    onError: (err: any) => {
      toast({ title: "Retry failed", description: err.message, variant: "destructive" });
    },
  });

  const smartTimeline = buildSmartTimeline(auditLog, changeLog, confirmationData?.timeline);

  if (smartTimeline.length === 0) return null;

  const visible = expanded ? smartTimeline : smartTimeline.slice(0, COLLAPSED_COUNT);
  const hasMore = smartTimeline.length > COLLAPSED_COUNT;

  function renderCallOutcome(response: any) {
    if (!response) {
      return (
        <div className="mt-2 px-3 py-1.5 rounded-md bg-muted/50 border border-border flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Connecting...</span>
        </div>
      );
    }
    let api: Record<string, any> = {};
    try { api = (typeof response.apiResponse === 'string' ? JSON.parse(response.apiResponse) : response.apiResponse) || {}; } catch { api = {}; }
    const vs = api.voiceStatus as number | undefined;
    const dtmf = api.dtmf as number | null | undefined;
    const sec = api.voiceSec as number | undefined;
    const rc = response.responseClassification || '';
    const dur = sec != null && sec > 0
      ? `${Math.floor(sec / 60) > 0 ? `${Math.floor(sec / 60)}m ` : ''}${sec % 60}s`
      : null;

    if ((vs === 4 || rc === 'Answered') && dtmf === 1) {
      return (
        <div className="mt-2 px-3 py-2 rounded-md bg-green-50 dark:bg-green-950/60 border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
            <span className="text-sm font-semibold text-green-700 dark:text-green-300">Confirmed (pressed 1)</span>
          </div>
          {dur && <p className="text-xs text-muted-foreground mt-0.5 ml-6">Duration: {dur}</p>}
        </div>
      );
    }
    if ((vs === 4 || rc === 'Answered') && dtmf === 2) {
      return (
        <div className="mt-2 px-3 py-2 rounded-md bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            <span className="text-sm font-semibold text-red-700 dark:text-red-300">Cancelled (pressed 2)</span>
          </div>
          {dur && <p className="text-xs text-muted-foreground mt-0.5 ml-6">Duration: {dur}</p>}
        </div>
      );
    }
    if (vs === 4 || rc === 'Answered') {
      return (
        <div className="mt-2 px-3 py-2 rounded-md bg-orange-50 dark:bg-orange-950/60 border border-orange-200 dark:border-orange-800">
          <div className="flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-orange-500 shrink-0" />
            <span className="text-sm font-medium text-orange-700 dark:text-orange-300">Connected — No Button Pressed</span>
          </div>
          {dur && <p className="text-xs text-muted-foreground mt-0.5 ml-6">Duration: {dur}</p>}
        </div>
      );
    }
    if (vs === 5 || rc === 'Busy') {
      return (
        <div className="mt-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Line Busy</span>
          </div>
        </div>
      );
    }
    if (vs === 2 || rc === 'Congestion') {
      return (
        <div className="mt-2 px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <PhoneOff className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Network Issue</span>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-2 px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <PhoneOff className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Not Picked Up</span>
        </div>
      </div>
    );
  }

  function formatElapsed(ms: number): string {
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 1) return 'less than a minute';
    if (totalMin < 60) return `${totalMin}m`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  function renderWaOutcome(response: any, noReplyMs: number) {
    if (!response) {
      const elapsedLabel = noReplyMs > 0 ? `No reply after ${formatElapsed(noReplyMs)}` : 'No reply received';
      return <span className="text-xs text-muted-foreground italic">{elapsedLabel}</span>;
    }
    const cls = response.responseClassification || '';
    if (cls === 'confirm') return <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-200 dark:border-green-700">✓ Confirmed</Badge>;
    if (cls === 'cancel') return <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-red-200 dark:border-red-700">✗ Cancelled</Badge>;
    return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-blue-200 dark:border-blue-700">Sent a Question</Badge>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="w-5 h-5" />
          Order Timeline
        </CardTitle>
        <Badge variant="secondary" className="text-xs">{smartTimeline.length}</Badge>
      </CardHeader>
      <CardContent>
        <div className="relative" data-testid="order-timeline-list">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-4">
            {visible.map((entry, idx) => {

              if (entry.kind === 'wa_attempt') {
                const { num, sent, response, hasFailed, noReplyMs } = entry;
                const timeStr = sent.createdAt ? formatDistanceToNow(new Date(sent.createdAt), { addSuffix: true }) : '';
                const phoneMatch = (sent.note || '').match(/\b(92\d{10}|0\d{10}|\d{11})\b/);
                const phone = phoneMatch ? phoneMatch[0] : '';
                const tplMatch = (sent.note || '').match(/template:\s*(\S+)/);
                const template = tplMatch ? tplMatch[1] : '';
                return (
                  <div key={entry.key} className="flex items-start gap-3 relative" data-testid={`timeline-entry-${idx}`}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 text-green-500 bg-green-100 dark:bg-green-950">
                      <MessageCircle className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">WhatsApp Message #{num}</span>
                        <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 text-xs border-green-200 dark:border-green-800">whatsapp</Badge>
                      </div>
                      {(phone || template) && (
                        <p className="text-xs text-muted-foreground mt-0.5">{phone}{phone && template ? ' · ' : ''}{template ? `template: ${template}` : ''}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">Response:</span>
                        {renderWaOutcome(response, noReplyMs)}
                      </div>
                      {hasFailed && (
                        <Button variant="outline" size="sm" className="mt-1.5 h-6 text-xs gap-1.5 px-2"
                          disabled={retryOrderMutation.isPending} onClick={() => retryOrderMutation.mutate()}
                          data-testid={`retry-wa-confirmation-${sent.id}`}>
                          {retryOrderMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Retry WhatsApp
                        </Button>
                      )}
                      <p className="text-xs text-muted-foreground/60 mt-0.5">{timeStr}</p>
                    </div>
                  </div>
                );
              }

              if (entry.kind === 'call_attempt') {
                const { num, sent, response } = entry;
                const timeStr = sent.createdAt ? formatDistanceToNow(new Date(sent.createdAt), { addSuffix: true }) : '';
                return (
                  <div key={entry.key} className="flex items-start gap-3 relative" data-testid={`timeline-entry-${idx}`}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 text-indigo-500 bg-indigo-100 dark:bg-indigo-950">
                      <Phone className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">Call #{num}</span>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-xs border-blue-200 dark:border-blue-800">robocall</Badge>
                      </div>
                      {renderCallOutcome(response)}
                      <p className="text-xs text-muted-foreground/60 mt-1.5">{timeStr}</p>
                    </div>
                  </div>
                );
              }

              if (entry.kind === 'call_deferred') {
                const { event } = entry;
                const timeStr = event.createdAt ? formatDistanceToNow(new Date(event.createdAt), { addSuffix: true }) : '';
                return (
                  <div key={entry.key} className="flex items-start gap-3 relative" data-testid={`timeline-entry-${idx}`}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 text-sky-500 bg-sky-100 dark:bg-sky-950">
                      <Clock className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">Call Scheduled</span>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-xs border-blue-200 dark:border-blue-800">robocall</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">Outside call hours — will call between 10am–8pm</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">{timeStr}</p>
                    </div>
                  </div>
                );
              }

              if (entry.kind === 'confirmation') {
                const { event } = entry;
                const Icon = getTimelineEventIcon(event.eventType);
                const colorCls = getTimelineEventColor(event.eventType);
                const label = getTimelineEventLabel(event.eventType);
                const timeStr = event.createdAt ? formatDistanceToNow(new Date(event.createdAt), { addSuffix: true }) : '';
                return (
                  <div key={entry.key} className="flex items-start gap-3 relative" data-testid={`timeline-entry-${idx}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 ${colorCls}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{label}</span>
                        {getChannelBadge(event.channel)}
                      </div>
                      {(event.oldStatus || event.newStatus) && (
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {event.oldStatus && <Badge variant="outline" className="text-xs">{event.oldStatus}</Badge>}
                          {event.oldStatus && event.newStatus && <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />}
                          {event.newStatus && <Badge variant="secondary" className="text-xs">{event.newStatus}</Badge>}
                        </div>
                      )}
                      {event.note && <p className="text-xs text-muted-foreground mt-0.5 break-words">{event.note}</p>}
                      {event.errorDetails && event.eventType === 'WA_PERMANENT_FAILURE' && (
                        <Button variant="outline" size="sm" className="mt-1.5 h-6 text-xs gap-1.5 px-2"
                          disabled={retryOrderMutation.isPending} onClick={() => retryOrderMutation.mutate()}
                          data-testid={`retry-wa-confirmation-${event.id}`}>
                          {retryOrderMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Retry WhatsApp
                        </Button>
                      )}
                      <p className="text-xs text-muted-foreground/60 mt-0.5">{timeStr}</p>
                    </div>
                  </div>
                );
              }

              const ev = entry.event;
              const Icon = getActivityIcon(ev);
              const colorCls = getActivityColor(ev);
              const label = getActivityLabel(ev);
              const actorDisplay = ev.actorName || (ev.actorType === 'system' ? 'System' : null);
              const timeStr = ev.createdAt ? formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true }) : '';

              return (
                <div key={entry.key} className="flex items-start gap-3 relative" data-testid={`timeline-entry-${idx}`}>
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
                    {entry.kind === 'status' && (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">{ev.fromStatus}</Badge>
                        <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
                        <Badge variant="secondary" className="text-xs">{ev.toStatus}</Badge>
                      </div>
                    )}
                    {entry.kind === 'change' && ev.changeType === 'FIELD_EDIT' && (
                      <div className="mt-1 space-y-0.5">
                        {Array.isArray(ev.metadata?.changes) ? (
                          (ev.metadata.changes as { field: string; oldValue: string | null; newValue: string | null }[]).map((c, ci) => {
                            const clabel = c.field.replace(/([A-Z])/g, ' $1').trim();
                            if (c.field === 'lineItems') {
                              const summarize = (v: string | null) => {
                                if (!v) return '';
                                try {
                                  const items = JSON.parse(v);
                                  if (Array.isArray(items)) return items.map((i: any) => i.name || 'Item').join(', ');
                                } catch {}
                                return v.length > 80 ? v.slice(0, 80) + '...' : v;
                              };
                              return (
                                <div key={ci} className="flex flex-col gap-0.5">
                                  <span className="text-xs font-medium capitalize">Line Items</span>
                                  {c.oldValue && <span className="text-xs line-through text-muted-foreground/70 break-words">{summarize(c.oldValue)}</span>}
                                  <span className="text-xs break-words">{summarize(c.newValue)}</span>
                                </div>
                              );
                            }
                            return (
                              <div key={ci} className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-medium capitalize">{clabel}</span>
                                {c.oldValue != null && (
                                  <>
                                    <span className="text-xs text-muted-foreground">from</span>
                                    <span className="text-xs line-through text-muted-foreground/70">{c.oldValue}</span>
                                  </>
                                )}
                                <span className="text-xs text-muted-foreground">to</span>
                                <span className="text-xs font-medium">{c.newValue}</span>
                              </div>
                            );
                          })
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-medium capitalize">{(ev.fieldName || '').replace(/([A-Z])/g, ' $1').trim()}</span>
                            {ev.oldValue && (
                              <>
                                <span className="text-xs text-muted-foreground">from</span>
                                <span className="text-xs line-through text-muted-foreground/70 break-words">{ev.oldValue}</span>
                              </>
                            )}
                            <span className="text-xs text-muted-foreground">to</span>
                            <span className="text-xs font-medium break-words">{ev.newValue}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {entry.kind === 'change' && (ev.changeType === 'PAYMENT_ADDED' || ev.changeType === 'PAYMENT_DELETED' || ev.changeType === 'PAYMENT_REMOVED') && ev.metadata && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ev.metadata.amount ? `Rs ${ev.metadata.amount}` : ''}{ev.metadata.method ? ` via ${ev.metadata.method}` : ''}
                      </p>
                    )}
                    {entry.kind === 'change' && ev.changeType === 'REMARK_ADDED' && ev.newValue && (
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">"{ev.newValue}"</p>
                    )}
                    {entry.kind === 'change' && ev.changeType === 'WHATSAPP_SENT' && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {ev.metadata?.phone && <span className="text-xs text-muted-foreground font-mono">{ev.metadata.phone}</span>}
                        {ev.metadata?.templateName && <span className="text-xs text-muted-foreground">template: <span className="font-mono">{ev.metadata.templateName}</span></span>}
                        {ev.newValue === 'failed' && ev.metadata?.error && (
                          <span className="text-xs text-red-500 break-words" title={String(ev.metadata.error)}>
                            {(() => {
                              const err = String(ev.metadata.error);
                              try { const m = err.match(/"message"\s*:\s*"([^"]+)"/); if (m) return m[1]; } catch {}
                              return err.length > 80 ? err.slice(0, 80) + '...' : err;
                            })()}
                          </span>
                        )}
                        {ev.newValue === 'failed' && ev.id && (
                          <Button variant="outline" size="sm" className="h-6 text-xs gap-1.5 px-2"
                            disabled={retryLogMutation.isPending} onClick={() => retryLogMutation.mutate(ev.id)}
                            data-testid={`retry-wa-log-${ev.id}`}>
                            {retryLogMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            Retry
                          </Button>
                        )}
                      </div>
                    )}
                    {entry.kind === 'status' && ev.reason && (
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">{ev.reason}</p>
                    )}
                    <p className="text-xs text-muted-foreground/60 mt-0.5">{timeStr}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {hasMore && (
          <Button variant="ghost" size="sm" className="w-full mt-3" onClick={() => setExpanded(!expanded)} data-testid="button-toggle-timeline">
            {expanded ? (
              <><ChevronUp className="w-4 h-4 mr-1" />Show Less</>
            ) : (
              <><ChevronDown className="w-4 h-4 mr-1" />Show All ({smartTimeline.length})</>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function getConfirmationStatusBadge(status: string | null | undefined) {
  const s = (status || "pending").toLowerCase();
  const map: Record<string, { cls: string; label: string }> = {
    confirmed: { cls: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", label: "Confirmed" },
    cancelled: { cls: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", label: "Cancelled" },
    pending: { cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300", label: "Pending" },
    query: { cls: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", label: "Query" },
    conflict: { cls: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300", label: "Conflict" },
  };
  const c = map[s] || map.pending;
  return <Badge className={c.cls} data-testid="badge-confirmation-status">{c.label}</Badge>;
}

function getConfirmationSourceBadge(source: string | null | undefined) {
  if (!source) return null;
  const s = source.toLowerCase();
  const map: Record<string, { icon: React.ElementType; cls: string; label: string }> = {
    whatsapp: { icon: MessageCircle, cls: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", label: "WhatsApp" },
    robocall: { icon: Phone, cls: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", label: "Robocall" },
    manual: { icon: UserCheck, cls: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300", label: "Manual" },
  };
  const c = map[s] || { icon: Clock, cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", label: source };
  const Icon = c.icon;
  return (
    <Badge className={c.cls} data-testid="badge-confirmation-source">
      <Icon className="w-3 h-3 mr-1" />
      {c.label}
    </Badge>
  );
}

function ConfirmationStatusCard({ order, orderId }: { order: OrderDetails; orderId: string }) {
  const [resolutionNote, setResolutionNote] = useState("");
  const { toast } = useToast();

  const confirmMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/orders/${orderId}/manual-confirm`, { note: resolutionNote });
    },
    onSuccess: () => {
      toast({ title: "Order confirmed manually" });
      setResolutionNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "confirmation-timeline"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/orders/${orderId}/manual-cancel`, { note: resolutionNote });
    },
    onSuccess: () => {
      toast({ title: "Order cancelled manually" });
      setResolutionNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "confirmation-timeline"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const PRE_BOOKING_STATUSES = ["NEW", "PENDING", "HOLD", "READY_TO_SHIP"];
  const showResolution = PRE_BOOKING_STATUSES.includes(order.workflowStatus);

  return (
    <Card data-testid="card-confirmation-status">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Confirmation Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {getConfirmationStatusBadge((order as any).confirmationStatus)}
          {getConfirmationSourceBadge((order as any).confirmationSource)}
          {(order as any).confirmationLocked && (
            <Badge variant="outline" className="gap-1" data-testid="badge-confirmation-locked">
              <Lock className="w-3 h-3" />
              Locked
            </Badge>
          )}
        </div>

        {(order as any).conflictDetected && (
          <Alert variant="destructive" data-testid="alert-conflict">
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription>
              Conflicting responses detected. Manual resolution required.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-1 text-sm">
          {(order as any).waNotOnWhatsApp && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">WA Status</span>
              <Badge variant="outline" className="text-red-600 border-red-300 dark:border-red-700 gap-1" data-testid="badge-not-on-whatsapp">
                <PhoneOff className="w-3 h-3" />
                Not on WhatsApp
              </Badge>
            </div>
          )}
          {(order as any).waConfirmationSentAt && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">WA Sent</span>
              <span data-testid="text-wa-sent-time">
                {formatDistanceToNow(new Date((order as any).waConfirmationSentAt), { addSuffix: true })}
              </span>
            </div>
          )}
          {typeof (order as any).waAttemptCount === "number" && (order as any).waAttemptCount > 0 && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">WA Attempts</span>
              <span data-testid="text-wa-attempt-count">
                {(order as any).waAttemptCount}/3
              </span>
            </div>
          )}
          {(order as any).waResponseAt && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">WA Response</span>
              <span data-testid="text-wa-response-time">
                {formatDistanceToNow(new Date((order as any).waResponseAt), { addSuffix: true })}
              </span>
            </div>
          )}
        </div>

        {showResolution && (
          <>
            <Separator />
            <div className="space-y-2">
              <Input
                placeholder="Resolution note (required)"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                data-testid="input-resolution-note"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => confirmMutation.mutate()}
                  disabled={!resolutionNote.trim() || confirmMutation.isPending || cancelMutation.isPending}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  data-testid="button-manual-confirm"
                >
                  {confirmMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                  Manual Confirm
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => cancelMutation.mutate()}
                  disabled={!resolutionNote.trim() || confirmMutation.isPending || cancelMutation.isPending}
                  className="flex-1"
                  data-testid="button-manual-cancel"
                >
                  {cancelMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <XCircle className="w-3.5 h-3.5 mr-1" />}
                  Manual Cancel
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface ChatMessage {
  id: string;
  conversationId: string;
  direction: string;
  senderName: string | null;
  text: string | null;
  status: string | null;
  messageType: string | null;
  mediaUrl: string | null;
  createdAt: string;
}

function ChatStatusTicks({ status }: { status: string | null }) {
  if (status === "read") return <CheckCheck className="w-3 h-3 text-blue-400 inline-block ml-1" />;
  if (status === "delivered") return <CheckCheck className="w-3 h-3 text-muted-foreground inline-block ml-1" />;
  if (status === "sent") return <Check className="w-3 h-3 text-muted-foreground inline-block ml-1" />;
  return null;
}

function formatChatBubbleTime(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday " + format(d, "HH:mm");
  return format(d, "dd/MM/yy HH:mm");
}

function WhatsAppChatPopup({ open, onClose, customerPhone, customerName }: {
  open: boolean;
  onClose: () => void;
  customerPhone: string | null;
  customerName: string | null;
}) {
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);
  const { toast } = useToast();

  const { data: conversation, isLoading: convLoading } = useQuery<any>({
    queryKey: ["/api/support/conversations/by-phone", customerPhone],
    queryFn: async () => {
      if (!customerPhone) return null;
      const resp = await fetch(`/api/support/conversations/by-phone/${encodeURIComponent(customerPhone)}`, { credentials: "include" });
      if (resp.status === 404) return null;
      if (!resp.ok) throw new Error("Failed to load conversation");
      return resp.json();
    },
    enabled: open && !!customerPhone,
    staleTime: 5000,
  });

  const conversationId = conversation?.id;

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["/api/support/conversations", conversationId, "messages"],
    queryFn: async () => {
      if (!conversationId) return [];
      const resp = await fetch(`/api/support/conversations/${conversationId}/messages`, { credentials: "include" });
      return resp.json();
    },
    enabled: open && !!conversationId,
    refetchInterval: open ? 6000 : false,
    staleTime: 3000,
  });

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    const count = messages.length;
    if (count !== prevMsgCountRef.current) {
      prevMsgCountRef.current = count;
      setTimeout(scrollToBottom, 100);
    }
  }, [messages.length, scrollToBottom]);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      await apiRequest("POST", `/api/support/conversations/${conversationId}/messages`, { text });
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations", conversationId, "messages"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    const trimmed = messageText.trim();
    if (!trimmed || !conversationId) return;
    sendMutation.mutate(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg h-[70vh] flex flex-col p-0 gap-0" data-testid="dialog-whatsapp-chat">
        <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="w-5 h-5 text-green-600" />
            <span>{customerName || customerPhone || "Customer"}</span>
            {customerPhone && (
              <span className="text-xs text-muted-foreground font-normal">{customerPhone}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3" data-testid="chat-messages-area">
          {convLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !conversation ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2" data-testid="chat-empty-state">
              <MessageCircle className="w-10 h-10 opacity-30" />
              <p className="text-sm">No WhatsApp conversation found for this customer</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <MessageCircle className="w-10 h-10 opacity-30" />
              <p className="text-sm">No messages yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((msg) => {
                const isOutbound = msg.direction === "outbound";
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                    data-testid={`chat-message-${msg.id}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        isOutbound
                          ? "bg-green-600 text-white dark:bg-green-700"
                          : "bg-muted"
                      }`}
                    >
                      {msg.messageType && msg.messageType !== "text" && (
                        <div className="text-xs opacity-70 mb-1 italic">
                          {msg.messageType === "image" ? "📷 Image" :
                           msg.messageType === "audio" ? "🎵 Audio" :
                           msg.messageType === "video" ? "🎬 Video" :
                           msg.messageType === "document" ? "📄 Document" :
                           msg.messageType === "sticker" ? "🎨 Sticker" :
                           msg.messageType === "location" ? "📍 Location" :
                           msg.messageType}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap break-words leading-relaxed">
                        {msg.text || ""}
                      </div>
                      <div className={`text-[10px] mt-1 ${isOutbound ? "text-green-200" : "text-muted-foreground"} text-right`}>
                        {formatChatBubbleTime(msg.createdAt)}
                        {isOutbound && <ChatStatusTicks status={msg.status} />}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {conversation && (
          <div className="border-t px-4 py-3 flex gap-2 flex-shrink-0" data-testid="chat-input-area">
            <Input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Type a message..."
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              data-testid="input-chat-message"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!messageText.trim() || sendMutation.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-send-chat"
            >
              {sendMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuickActionsCard({ order, orderId }: { order: OrderDetails; orderId: string }) {
  const [chatOpen, setChatOpen] = useState(false);
  const { toast } = useToast();

  const robocallMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/orders/${orderId}/trigger-robocall`);
    },
    onSuccess: () => {
      toast({ title: "RoboCall initiated", description: `Calling ${order.customerPhone}...` });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    },
    onError: (err: Error) => {
      toast({ title: "RoboCall failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <>
      <Card data-testid="card-quick-actions">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <PhoneCall className="w-5 h-5" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full justify-start gap-2"
            variant="outline"
            onClick={() => robocallMutation.mutate()}
            disabled={robocallMutation.isPending || !order.customerPhone || ["BOOKED", "FULFILLED", "DELIVERED", "RETURN", "CANCELLED"].includes(order.workflowStatus || "")}
            data-testid="button-manual-robocall"
          >
            {robocallMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Phone className="w-4 h-4 text-blue-600" />
            )}
            Manual RoboCall
            {!order.customerPhone && (
              <span className="text-xs text-muted-foreground ml-auto">No phone</span>
            )}
          </Button>

          <Button
            className="w-full justify-start gap-2"
            variant="outline"
            onClick={() => setChatOpen(true)}
            disabled={!order.customerPhone}
            data-testid="button-open-whatsapp-chat"
          >
            <MessageCircle className="w-4 h-4 text-green-600" />
            Open WhatsApp Chat
            {!order.customerPhone && (
              <span className="text-xs text-muted-foreground ml-auto">No phone</span>
            )}
          </Button>

          {order.customerPhone && (
            <div className="text-xs text-muted-foreground pt-1">
              Customer: {order.customerPhone}
            </div>
          )}
        </CardContent>
      </Card>

      <WhatsAppChatPopup
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        customerPhone={order.customerPhone}
        customerName={order.customerName}
      />
    </>
  );
}

function getTimelineEventIcon(eventType: string): React.ElementType {
  const map: Record<string, React.ElementType> = {
    ORDER_IMPORTED: Clock,
    WA_SENT: MessageCircle,
    WA_RESPONSE: MessageCircle,
    WA_EXHAUSTED: AlertTriangle,
    WA_NOT_AVAILABLE: PhoneOff,
    WA_PERMANENT_FAILURE: XCircle,
    WA_REMINDER_SENT: MessageCircle,
    WA_REMINDERS_CANCELLED: BellOff,
    ROBO_QUEUE_CANCELLED: PhoneOff,
    ROBO_EXHAUSTED: AlertTriangle,
    CHANNELS_CANCELLED: Ban,
    MOVED_TO_PENDING: Clock,
    CALL_QUEUED: Phone,
    CALL_ATTEMPTED: Phone,
    CALL_RESPONSE: Phone,
    STATUS_CHANGED: Shield,
    TAGS_WRITTEN: Tag,
    MANUAL_OVERRIDE: UserCheck,
    ORDER_BOOKED: Package,
    LATE_RESPONSE_IGNORED: AlertTriangle,
  };
  return map[eventType] || Clock;
}

function getTimelineEventLabel(eventType: string): string {
  const map: Record<string, string> = {
    ORDER_IMPORTED: "Order Received",
    WA_SENT: "WhatsApp Message Sent",
    WA_RESPONSE: "Customer Replied",
    WA_EXHAUSTED: "No WhatsApp Reply — Switched to Calling",
    WA_NOT_AVAILABLE: "Not on WhatsApp — Switched to Calling",
    WA_PERMANENT_FAILURE: "WhatsApp Error — Switched to Calling",
    WA_REMINDER_SENT: "WhatsApp Reminder Sent",
    WA_REMINDERS_CANCELLED: "WhatsApp Reminders Stopped",
    ROBO_QUEUE_CANCELLED: "Call Queue Stopped",
    ROBO_EXHAUSTED: "All Calls Done — No Response",
    CHANNELS_CANCELLED: "Automation Stopped",
    MOVED_TO_PENDING: "Sent to Agent Queue",
    CALL_QUEUED: "Call Queued",
    CALL_ATTEMPTED: "Call Sent",
    CALL_RESPONSE: "Call Result",
    CALL_DEFERRED: "Call Scheduled",
    STATUS_CHANGED: "Status Changed",
    TAGS_WRITTEN: "Tags Updated",
    MANUAL_OVERRIDE: "Manual Confirmation",
    ORDER_BOOKED: "Order Booked",
    LATE_RESPONSE_IGNORED: "Response Arrived Too Late",
  };
  return map[eventType] || eventType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

function getTimelineEventColor(eventType: string): string {
  const map: Record<string, string> = {
    ORDER_IMPORTED: "text-blue-500 bg-blue-100 dark:bg-blue-950",
    WA_SENT: "text-green-500 bg-green-100 dark:bg-green-950",
    WA_RESPONSE: "text-green-600 bg-green-100 dark:bg-green-950",
    WA_EXHAUSTED: "text-orange-500 bg-orange-100 dark:bg-orange-950",
    WA_NOT_AVAILABLE: "text-orange-500 bg-orange-100 dark:bg-orange-950",
    WA_PERMANENT_FAILURE: "text-red-500 bg-red-100 dark:bg-red-950",
    WA_REMINDER_SENT: "text-teal-500 bg-teal-100 dark:bg-teal-950",
    WA_REMINDERS_CANCELLED: "text-gray-500 bg-gray-100 dark:bg-gray-950",
    ROBO_QUEUE_CANCELLED: "text-gray-500 bg-gray-100 dark:bg-gray-950",
    ROBO_EXHAUSTED: "text-orange-500 bg-orange-100 dark:bg-orange-950",
    CHANNELS_CANCELLED: "text-gray-600 bg-gray-100 dark:bg-gray-950",
    MOVED_TO_PENDING: "text-yellow-500 bg-yellow-100 dark:bg-yellow-950",
    CALL_QUEUED: "text-blue-500 bg-blue-100 dark:bg-blue-950",
    CALL_ATTEMPTED: "text-indigo-500 bg-indigo-100 dark:bg-indigo-950",
    CALL_RESPONSE: "text-indigo-600 bg-indigo-100 dark:bg-indigo-950",
    CALL_DEFERRED: "text-sky-500 bg-sky-100 dark:bg-sky-950",
    STATUS_CHANGED: "text-purple-500 bg-purple-100 dark:bg-purple-950",
    TAGS_WRITTEN: "text-sky-500 bg-sky-100 dark:bg-sky-950",
    MANUAL_OVERRIDE: "text-amber-500 bg-amber-100 dark:bg-amber-950",
    ORDER_BOOKED: "text-cyan-500 bg-cyan-100 dark:bg-cyan-950",
    LATE_RESPONSE_IGNORED: "text-orange-500 bg-orange-100 dark:bg-orange-950",
  };
  return map[eventType] || "text-muted-foreground bg-muted";
}

function getChannelBadge(channel: string | null | undefined) {
  if (!channel) return null;
  const c = channel.toLowerCase();
  const map: Record<string, string> = {
    whatsapp: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    robocall: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    manual: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    system: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  return <Badge className={map[c] || map.system} variant="outline">{channel}</Badge>;
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
            {(() => {
              const cn = order.courierName?.toLowerCase() || "";
              const trackingUrl = cn.includes("leopard")
                ? `https://merchantapi.leopardscourier.com/track?no=${encodeURIComponent(order.courierTracking!)}`
                : cn.includes("postex")
                  ? `https://postex.pk/tracking?cn=${encodeURIComponent(order.courierTracking!)}`
                  : null;
              return trackingUrl ? (
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="link-tracking-number"
                >
                  <Badge variant="outline" className="font-mono text-[11px] px-2 text-primary border-primary/40 hover:bg-primary/10 hover:border-primary cursor-pointer transition-colors underline underline-offset-2">
                    {order.courierTracking}
                  </Badge>
                </a>
              ) : (
                <Badge variant="outline" className="font-mono text-[11px] px-2" data-testid="badge-tracking-number">
                  {order.courierTracking}
                </Badge>
              );
            })()}
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
                  {formatPkDateTime(tracking.lastUpdate)}
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
    return formatPkDateTime(d);
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
    enabled: !!id,
  });

  const { data: tagConfig } = useQuery<{ confirm: string; pending: string; cancel: string }>({
    queryKey: ["/api/settings/robo-tags"],
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
  const [editLineItems, setEditLineItems] = useState<Array<{ name: string; quantity: number; price: string; productId?: string; variantId?: string; variantTitle?: string; image?: string | null; sku?: string }>>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productPickerTargetIndex, setProductPickerTargetIndex] = useState<number | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [showCancelShopifyConfirm, setShowCancelShopifyConfirm] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");

  const addTagMutation = useMutation({
    mutationFn: async (tag: string) => {
      const res = await apiRequest("POST", `/api/orders/${id}/tags`, { tag });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      setNewTagInput("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to add tag", description: error.message || "Please try again", variant: "destructive" });
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tag: string) => {
      const res = await apiRequest("DELETE", `/api/orders/${id}/tags`, { tag });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove tag", description: error.message || "Please try again", variant: "destructive" });
    },
  });

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

  const { data: waResponses } = useQuery<any[]>({
    queryKey: ["/api/orders", id, "whatsapp-responses"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${id}/whatsapp-responses`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
    refetchInterval: 30000,
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

  const cancelShopifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/orders/${id}/cancel-shopify`, { reason: "other" });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/workflow-counts"] });
      setShowCancelShopifyConfirm(false);
      if (data.shopifyWarning) {
        toast({ title: "Order cancelled locally", description: "Shopify sync failed but order is cancelled in 1SOL.AI.", variant: "destructive" });
      } else {
        toast({ title: "Cancelled on Shopify", description: "Order has been cancelled on Shopify successfully." });
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to cancel on Shopify.", variant: "destructive" });
      setShowCancelShopifyConfirm(false);
    },
  });

  const handleAddRemark = () => {
    if (!newRemark.trim()) return;
    addRemarkMutation.mutate({ content: newRemark, remarkType });
  };

  const PICKED_UP_STATUSES = ['PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION', 'OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNED_TO_SHIPPER', 'READY_FOR_RETURN', 'RETURN_IN_TRANSIT'];
  const isLocked = order?.workflowStatus === "DELIVERED" || order?.workflowStatus === "RETURN" || order?.workflowStatus === "CANCELLED";
  const lockedReason = order?.workflowStatus === "CANCELLED" ? "Cancelled" : order?.workflowStatus === "RETURN" ? "Returned" : order?.workflowStatus === "DELIVERED" ? "Delivered" : "Booked";
  const canCancelOnShopify = order?.workflowStatus === "CANCELLED" && (order as any).shopifyOrderId && (order as any).orderStatus !== "cancelled";

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
    const items = (order.lineItems as Array<{ name: string; quantity: number; price: string; productId?: string; variantId?: string; variantTitle?: string; image?: string | null; sku?: string }>) || [];
    setEditLineItems(items.map(i => ({ ...i })));
    setEditSubtotal(String(order.subtotalAmount || 0));
    setEditShipping(String(order.shippingAmount || 0));
    setEditDiscount(String(order.discountAmount || 0));
    setIsEditingSummary(true);
  };

  const handleProductPicked = (picked: PickedProduct) => {
    if (productPickerTargetIndex !== null && productPickerTargetIndex < editLineItems.length) {
      const updated = [...editLineItems];
      updated[productPickerTargetIndex] = {
        ...updated[productPickerTargetIndex],
        name: picked.name,
        price: picked.price,
        productId: picked.productId,
        variantId: picked.variantId,
        variantTitle: picked.variantTitle,
        image: picked.image,
        sku: picked.sku,
      };
      setEditLineItems(updated);
    } else {
      setEditLineItems([...editLineItems, {
        name: picked.name,
        price: picked.price,
        quantity: picked.quantity,
        productId: picked.productId,
        variantId: picked.variantId,
        variantTitle: picked.variantTitle,
        image: picked.image,
        sku: picked.sku,
      }]);
    }
    setProductPickerTargetIndex(null);
  };

  const lineItemWriteBackMutation = useMutation({
    mutationFn: async (lineItems: Array<{ name: string; quantity: number; price: string; productId?: string; variantId?: string }>) => {
      return apiRequest("POST", `/api/orders/${id}/line-items-writeback`, { lineItems });
    },
    onError: (err: any) => {
      toast({ title: "Shopify sync issue", description: "Order saved locally but Shopify sync failed: " + (err.message || "Unknown error"), variant: "destructive" });
    },
  });

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
    }, {
      onSuccess: () => {
        if (order?.shopifyOrderId) {
          lineItemWriteBackMutation.mutate(editLineItems);
        }
      },
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
        <Button variant="outline" onClick={() => window.history.back()} data-testid="button-back-orders-error">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Orders
          </Button>
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
          <Button variant="ghost" size="icon" data-testid="button-back-orders" onClick={() => window.history.back()}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold">Order {String(order.orderNumber).replace(/^#/, '')}</h1>
              {(order as any).orderSource === "shopify_draft_order" && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700" title="Custom Order" data-testid="badge-draft-order">
                  <PenLine className="w-3 h-3 text-green-700 dark:text-green-300" />
                </span>
              )}
              {getWorkflowBadge(order.workflowStatus)}
              {getShipmentStatusBadge(order.shipmentStatus, (order as any).courierRawStatus)}
              {canCancelOnShopify && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowCancelShopifyConfirm(true)}
                  disabled={cancelShopifyMutation.isPending}
                  data-testid="button-cancel-shopify"
                >
                  {cancelShopifyMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Cancel on Shopify
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {order.orderDate ? formatPkDateTime(order.orderDate) : ""}
            </p>
          </div>
        </div>
      </div>

      {showCancelShopifyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="modal-cancel-shopify">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Cancel on Shopify
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to cancel order <strong>{String(order.orderNumber || '').replace(/^#/, '')}</strong> on Shopify? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCancelShopifyConfirm(false)} disabled={cancelShopifyMutation.isPending} data-testid="button-cancel-shopify-no">
                  No, Keep It
                </Button>
                <Button variant="destructive" onClick={() => cancelShopifyMutation.mutate()} disabled={cancelShopifyMutation.isPending} data-testid="button-cancel-shopify-yes">
                  {cancelShopifyMutation.isPending && <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Yes, Cancel on Shopify
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ProductPicker
        open={showProductPicker}
        onClose={() => { setShowProductPicker(false); setProductPickerTargetIndex(null); }}
        onSelect={handleProductPicked}
      />

      <div className="grid md:grid-cols-2 gap-4">
        <ConfirmationStatusCard order={order} orderId={id!} />
        <QuickActionsCard order={order} orderId={id!} />
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
                    Locked - {lockedReason}
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
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setProductPickerTargetIndex(index);
                              setShowProductPicker(true);
                            }}
                            className="flex-1 text-left px-3 py-2 border rounded-md text-sm hover:bg-accent transition-colors truncate"
                            data-testid={`button-pick-product-${index}`}
                          >
                            {item.name || <span className="text-muted-foreground">Click to select product...</span>}
                          </button>
                          <Input
                            value={item.name}
                            onChange={(e) => {
                              const updated = [...editLineItems];
                              updated[index] = { ...updated[index], name: e.target.value, productId: undefined, variantId: undefined };
                              setEditLineItems(updated);
                            }}
                            placeholder="Or type manually"
                            className="w-32 text-xs"
                            data-testid={`input-edit-line-item-name-${index}`}
                          />
                        </div>
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
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setProductPickerTargetIndex(null);
                          setShowProductPicker(true);
                        }}
                        className="flex-1"
                        data-testid="button-add-line-item"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add from Products
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditLineItems([...editLineItems, { name: "", quantity: 1, price: "0" }])}
                        data-testid="button-add-manual-line-item"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Manual
                      </Button>
                    </div>
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
                            {remark.createdAt ? formatPkDateTime(remark.createdAt) : ""}
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

          {/* WhatsApp Customer Responses */}
          {(waResponses && waResponses.length > 0) && (
            <Card data-testid="card-whatsapp-responses">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-green-500" />
                  Customer WhatsApp Responses
                  <Badge variant="secondary" className="text-xs ml-1">{waResponses.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {waResponses.map((resp: any) => (
                  <div
                    key={resp.id}
                    className="flex gap-3 items-start p-3 rounded-lg bg-muted/40 border"
                    data-testid={`wa-response-${resp.id}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-medium" data-testid={`wa-phone-${resp.id}`}>+{resp.fromPhone}</span>
                        <Badge
                          variant="outline"
                          className="text-xs capitalize"
                          data-testid={`wa-type-${resp.id}`}
                        >
                          {resp.messageType}
                        </Badge>
                        <span className="text-xs text-muted-foreground ml-auto" data-testid={`wa-time-${resp.id}`}>
                          {new Date(resp.receivedAt).toLocaleString("en-PK", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit", hour12: true,
                          })}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words" data-testid={`wa-body-${resp.id}`}>
                        {resp.messageBody}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <OrderTimeline orderId={id!} auditLog={auditLog} changeLog={order?.changeLog} />
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
                          <span className="text-xs font-medium text-primary">{String(o.orderNumber || '').replace(/^#/, '')}</span>
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
                          {o.orderDate ? formatPkDate(o.orderDate) : "No date"}
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
                            {p.createdAt ? formatPkDateTime(p.createdAt) : ""}
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
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2" data-testid="text-tags-title">
                <Tag className="w-5 h-5" />
                Tags
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                const tags = Array.isArray(order.tags) ? (order.tags as string[]) : [];
                const tc = tagConfig || { confirm: "Robo-Confirm", pending: "Robo-Pending", cancel: "Robo-Cancel" };
                const getRoboStyle = (tag: string) => {
                  const lt = tag.toLowerCase();
                  if (lt === tc.confirm.toLowerCase()) return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
                  if (lt === tc.pending.toLowerCase()) return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300';
                  if (lt === tc.cancel.toLowerCase()) return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
                  return '';
                };
                return (
                  <>
                    {tags.length > 0 ? (
                      <div className="flex flex-wrap gap-2" data-testid="tags-list">
                        {tags.map((tag, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className={`${getRoboStyle(tag) || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'} pr-1 flex items-center gap-1`}
                            data-testid={`badge-tag-${index}`}
                          >
                            <span className="max-w-[120px] truncate">{tag}</span>
                            <button
                              onClick={() => removeTagMutation.mutate(tag)}
                              disabled={removeTagMutation.isPending}
                              className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 p-0.5"
                              data-testid={`button-remove-tag-${index}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground" data-testid="text-no-tags">No tags yet</p>
                    )}
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add a tag..."
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newTagInput.trim()) {
                            addTagMutation.mutate(newTagInput.trim());
                          }
                        }}
                        className="h-8 text-sm"
                        data-testid="input-add-tag"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3"
                        onClick={() => {
                          if (newTagInput.trim()) addTagMutation.mutate(newTagInput.trim());
                        }}
                        disabled={!newTagInput.trim() || addTagMutation.isPending}
                        data-testid="button-add-tag"
                      >
                        {addTagMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                        Add
                      </Button>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>

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
                        {formatPkShortDate(order.bookedAt)}
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
