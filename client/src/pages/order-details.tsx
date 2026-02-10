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

export default function OrderDetails() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [newRemark, setNewRemark] = useState("");
  const [remarkType, setRemarkType] = useState("general");

  const { data: order, isLoading } = useQuery<OrderDetails>({
    queryKey: ["/api/orders", id],
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

  const handleAddRemark = () => {
    if (!newRemark.trim()) return;
    addRemarkMutation.mutate({ content: newRemark, remarkType });
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
              <h1 className="text-2xl font-bold">Order #{order.orderNumber}</h1>
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
          {/* Customer Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5" />
                Customer Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">{order.customerName}</p>
                    <p className="text-sm text-muted-foreground">Customer</p>
                  </div>
                </div>
                {order.customerPhone && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <Phone className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{order.customerPhone}</p>
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
                      <p className="font-medium truncate max-w-[200px]">{order.customerEmail}</p>
                      <p className="text-sm text-muted-foreground">Email</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">{order.city}, {order.province}</p>
                    <p className="text-sm text-muted-foreground">Location</p>
                  </div>
                </div>
              </div>
              {order.shippingAddress && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-1">Shipping Address</p>
                  <p className="text-sm">{order.shippingAddress}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shipment Tracking */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Truck className="w-5 h-5" />
                Shipment Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              {shipment ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Courier</p>
                      <p className="font-medium capitalize">{shipment.courierName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Tracking Number</p>
                      <p className="font-medium font-mono">{shipment.trackingNumber || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      {getStatusBadge(shipment.status || "booked")}
                    </div>
                  </div>
                  <Separator />
                  {/* Timeline */}
                  <div className="space-y-4">
                    <p className="text-sm font-medium">Tracking History</p>
                    {shipment.events && shipment.events.length > 0 ? (
                      <div className="relative pl-6 space-y-4">
                        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />
                        {shipment.events.map((event, index) => {
                          const Icon = getTrackingIcon(event.status);
                          return (
                            <div key={event.id} className="relative flex items-start gap-4">
                              <div className={`absolute left-[-15px] w-6 h-6 rounded-full flex items-center justify-center ${
                                index === 0 ? "bg-primary text-primary-foreground" : "bg-muted"
                              }`}>
                                <Icon className="w-3 h-3" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm">{event.status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</p>
                                <p className="text-xs text-muted-foreground">{event.description}</p>
                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                  {event.location && <span>{event.location}</span>}
                                  {event.eventTime && (
                                    <span>{format(new Date(event.eventTime), "MMM dd, h:mm a")}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No tracking updates yet.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Truck className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="font-medium mb-1">No shipment assigned</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Assign a courier to start tracking this order.
                  </p>
                  <Button variant="outline" data-testid="button-assign-courier">
                    Assign Courier
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

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

          {/* Workflow Audit Log */}
          {auditLog && auditLog.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Status History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3" data-testid="audit-log-list">
                  {auditLog.map((entry: any) => (
                    <div key={entry.id} className="flex items-start gap-3 text-sm" data-testid={`audit-entry-${entry.id}`}>
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
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
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                          {entry.createdAt ? formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true }) : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Order Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lineItems && lineItems.length > 0 ? (
                <div className="space-y-2">
                  {lineItems.map((item, index) => (
                    <div key={index} className="flex items-start justify-between gap-2 text-sm">
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
                  <span>PKR {Number(order.subtotalAmount || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>PKR {Number(order.shippingAmount || 0).toLocaleString()}</span>
                </div>
                {order.discountAmount && Number(order.discountAmount) > 0 && (
                  <div className="flex justify-between gap-2 text-green-600">
                    <span>Discount</span>
                    <span>-PKR {Number(order.discountAmount).toLocaleString()}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between gap-2 font-semibold text-base">
                  <span>Total</span>
                  <span>PKR {Number(order.totalAmount).toLocaleString()}</span>
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
                    onClick={() => window.open(`/api/print/native-slip/${(order as any).id}.pdf`, "_blank")}
                  >
                    <Printer className="w-4 h-4" />
                    Print Courier Airway Bill
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    data-testid="button-download-pdf"
                    asChild
                  >
                    <a href={`/api/print/native-slip/${(order as any).id}.pdf`} download>
                      <Download className="w-4 h-4" />
                      Download Courier AWB
                    </a>
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
