import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Order, Shipment } from "@shared/schema";
import { Link } from "wouter";

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

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery<RecentOrder[]>({
    queryKey: ["/api/orders/recent"],
    refetchInterval: 30000, // Auto-refresh every 30 seconds
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
        <Button onClick={handleRefresh} variant="outline" size="sm" data-testid="button-refresh-dashboard">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

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
                <Link key={order.id} href={`/orders/${order.id}`}>
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
