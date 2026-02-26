import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Order, Shipment } from "@shared/schema";
import { Link, useLocation } from "wouter";
import { useDateRange } from "@/contexts/date-range-context";

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
  iconColor = "text-primary",
  isLoading = false,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: number;
  trendLabel?: string;
  iconColor?: string;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {trend !== undefined && (
              <div className="flex items-center gap-1 text-xs">
                {trend >= 0 ? (
                  <TrendingUp className="w-3 h-3 text-green-500" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-red-500" />
                )}
                <span className={trend >= 0 ? "text-green-600" : "text-red-600"}>
                  {trend >= 0 ? "+" : ""}{trend}%
                </span>
                <span className="text-muted-foreground">{trendLabel}</span>
              </div>
            )}
          </div>
          <div className={`w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center ${iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
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

function getStageFeatures(order: Order): string {
  const stage = order.workflowStatus || "NEW";
  switch (stage) {
    case "BOOKED":
    case "FULFILLED":
      return [order.courierName, order.courierTracking, order.shipmentStatus ? UNIVERSAL_STATUS_LABELS[order.shipmentStatus] || order.shipmentStatus : null].filter(Boolean).join(" | ");
    case "DELIVERED":
      return [order.courierName, order.courierTracking, "Delivered"].filter(Boolean).join(" | ");
    case "RETURN":
      return [order.courierName, order.courierTracking, order.shipmentStatus ? UNIVERSAL_STATUS_LABELS[order.shipmentStatus] || order.shipmentStatus : "Return"].filter(Boolean).join(" | ");
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
  const [, setLocation] = useLocation();

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
  queryParams.set("light", "1");
  queryParams.set("pageSize", "20");

  const { data, isLoading } = useQuery<{ orders: Order[]; total: number }>({
    queryKey: [`/api/orders?${queryParams.toString()}`],
    enabled: hasSearch,
  });

  const results = data?.orders || [];

  const handleClear = () => {
    setSearchOrderNumber("");
    setSearchTracking("");
    setSearchName("");
    setSearchPhone("");
  };

  const hasAnyInput = searchOrderNumber || searchTracking || searchName || searchPhone;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="w-5 h-5" />
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
                placeholder="e.g. 23409"
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
                placeholder="e.g. PW7513503972"
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
              <>
                <div className="hidden sm:grid grid-cols-[100px_1fr_140px_1fr_100px_1fr] gap-2 px-4 py-2 border-b text-xs font-medium text-muted-foreground">
                  <span>Order #</span>
                  <span>Customer</span>
                  <span>Contact</span>
                  <span>Address</span>
                  <span>Stage</span>
                  <span>Details</span>
                </div>
                <div className="max-h-[500px] overflow-y-auto divide-y">
                  {results.map((order) => {
                    const stage = order.workflowStatus || "NEW";
                    const features = getStageFeatures(order);
                    return (
                      <button
                        key={order.id}
                        onClick={() => setLocation(`/orders/detail/${order.id}`)}
                        className="w-full text-left px-4 py-3 hover-elevate"
                        data-testid={`search-result-${order.id}`}
                      >
                        <div className="sm:grid sm:grid-cols-[100px_1fr_140px_1fr_100px_1fr] gap-2 items-center">
                          <span className="font-medium text-sm" data-testid={`text-order-number-${order.id}`}>
                            #{order.orderNumber}
                          </span>
                          <span className="text-sm truncate" data-testid={`text-customer-name-${order.id}`}>
                            {order.customerName}
                          </span>
                          <span className="text-sm text-muted-foreground" data-testid={`text-customer-phone-${order.id}`}>
                            {order.customerPhone || "-"}
                          </span>
                          <span className="text-sm text-muted-foreground truncate" data-testid={`text-address-${order.id}`}>
                            {[order.shippingAddress, order.city].filter(Boolean).join(", ") || "-"}
                          </span>
                          <span>
                            <Badge className={`text-[10px] ${WORKFLOW_STAGE_COLORS[stage] || ""}`} data-testid={`badge-stage-${order.id}`}>
                              {WORKFLOW_STAGE_LABELS[stage] || stage}
                            </Badge>
                          </span>
                          <span className="text-xs text-muted-foreground truncate" data-testid={`text-features-${order.id}`}>
                            {features || "-"}
                          </span>
                        </div>
                        <div className="sm:hidden mt-1 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span>{order.customerPhone || ""}</span>
                          {order.city && <span>· {order.city}</span>}
                          <Badge className={`text-[10px] ${WORKFLOW_STAGE_COLORS[stage] || ""}`}>
                            {WORKFLOW_STAGE_LABELS[stage] || stage}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {(data?.total || 0) > results.length && (
                  <div className="px-4 py-2 text-xs text-muted-foreground text-center border-t">
                    Showing {results.length} of {data?.total} results
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
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
  const { data: workflowCounts, isLoading: countsLoading } = useQuery<Record<string, number>>({
    queryKey: [workflowCountsUrl],
    refetchInterval: 30000,
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery<RecentOrder[]>({
    queryKey: ["/api/orders/recent"],
    refetchInterval: 30000,
  });

  const handleRefresh = () => {
    refetchStats();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's your logistics overview.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={handleRefresh} variant="outline" size="sm" data-testid="button-refresh-dashboard">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <OrderSearchSection />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Orders"
          value={stats?.totalOrders?.toLocaleString() ?? 0}
          icon={Package}
          trend={stats?.ordersTrend}
          trendLabel="vs last week"
          isLoading={statsLoading}
        />
        <StatCard
          title="Delivered"
          value={stats?.totalDelivered?.toLocaleString() ?? 0}
          icon={CheckCircle2}
          trend={stats?.deliveryRate}
          trendLabel="delivery rate"
          iconColor="text-green-500"
          isLoading={statsLoading}
        />
        <StatCard
          title="Pending / Unfulfilled"
          value={stats?.pendingShipments?.toLocaleString() ?? 0}
          icon={Clock}
          iconColor="text-amber-500"
          isLoading={statsLoading}
        />
        <StatCard
          title="In Transit / Booked"
          value={((stats?.inTransit ?? 0) + (stats?.booked ?? 0)).toLocaleString()}
          icon={Truck}
          iconColor="text-blue-500"
          isLoading={statsLoading}
        />
      </div>

      {/* Status Breakdown */}
      <Card>
        <CardContent className="p-4">
          {countsLoading ? (
            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-24 rounded-full" />
              ))}
            </div>
          ) : workflowCounts ? (
            <div className="flex gap-2 flex-wrap" data-testid="status-breakdown-chips">
              {[
                { key: 'NEW', label: 'New', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
                { key: 'PENDING', label: 'Pending', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
                { key: 'HOLD', label: 'Hold', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
                { key: 'READY_TO_SHIP', label: 'Ready to Ship', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300' },
                { key: 'BOOKED', label: 'Booked', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
                { key: 'FULFILLED', label: 'Fulfilled', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' },
                { key: 'DELIVERED', label: 'Delivered', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
                { key: 'RETURN', label: 'Return', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
                { key: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400' },
              ]
                .filter(s => (workflowCounts[s.key] || 0) > 0)
                .map(s => (
                  <Link key={s.key} href={`/orders?workflowStatus=${s.key}`}>
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${s.color}`}
                      data-testid={`chip-dashboard-${s.key}`}
                    >
                      {s.label}
                      <span className="font-bold">{(workflowCounts[s.key] || 0).toLocaleString()}</span>
                    </span>
                  </Link>
                ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* COD Pending Card */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">COD Pending Collection</p>
                <p className="text-2xl font-bold">PKR {stats?.codPending ?? "0"}</p>
              </div>
            </div>
            <Link href="/cod">
              <Button variant="outline" data-testid="button-view-cod">
                View Details
                <ArrowUpRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Recent Orders */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
          <CardTitle className="text-lg font-semibold">Recent Orders</CardTitle>
          <Link href="/orders">
            <Button variant="ghost" size="sm" data-testid="button-view-all-orders">
              View All
              <ArrowUpRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : recentOrders && recentOrders.length > 0 ? (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <Link key={order.id} href={`/orders/detail/${order.id}`}>
                  <div className="flex items-center justify-between p-4 rounded-lg border hover-elevate cursor-pointer transition-colors" data-testid={`order-row-${order.id}`}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <Package className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">#{order.orderNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.customerName} • {order.city}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <p className="font-medium text-sm">PKR {order.totalAmount}</p>
                        <p className="text-xs text-muted-foreground capitalize">{order.paymentMethod}</p>
                      </div>
                      {getStatusBadge(order.shipmentStatus || "Unfulfilled")}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="font-medium mb-1">No orders yet</h3>
              <p className="text-sm text-muted-foreground">
                Orders from your Shopify store will appear here
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
