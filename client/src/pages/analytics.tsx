import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3,
  TrendingUp,
  Package,
  Truck,
  CheckCircle2,
  MapPin,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useDateRange } from "@/contexts/date-range-context";
import { AIInsightsBanner } from "@/components/ai-insights-banner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

interface AnalyticsData {
  overview: {
    totalOrders: number;
    totalDelivered: number;
    totalReturned: number;
    deliveryRate: number;
    avgDeliveryTime: number;
    totalRevenue: string;
  };
  courierPerformance: Array<{
    courier: string;
    orders: number;
    delivered: number;
    returned: number;
    deliveryRate: number;
  }>;
  cityBreakdown: Array<{
    city: string;
    orders: number;
    delivered: number;
    revenue: string;
  }>;
  dailyOrders: Array<{
    date: string;
    orders: number;
    delivered: number;
  }>;
}

const COLORS = ["hsl(220, 70%, 50%)", "hsl(160, 60%, 45%)", "hsl(35, 90%, 50%)", "hsl(280, 60%, 55%)", "hsl(350, 70%, 55%)"];

export default function Analytics() {
  const { dateRange, dateParams } = useDateRange();

  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics", { dateFrom: dateParams.dateFrom, dateTo: dateParams.dateTo }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateParams.dateFrom) params.set("dateFrom", dateParams.dateFrom);
      if (dateParams.dateTo) params.set("dateTo", dateParams.dateTo);
      const res = await fetch(`/api/analytics?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const overview = data?.overview;
  const courierPerformance = data?.courierPerformance ?? [];
  const cityBreakdown = data?.cityBreakdown ?? [];
  const dailyOrders = data?.dailyOrders ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Track performance and insights across your operations.</p>
        </div>
      </div>

      <AIInsightsBanner section="analytics" />

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">{overview?.totalOrders ?? 0}</p>
                )}
              </div>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Delivered</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">{overview?.totalDelivered ?? 0}</p>
                )}
              </div>
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Delivery Rate</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">{overview?.deliveryRate ?? 0}%</p>
                )}
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">PKR {overview?.totalRevenue ?? "0"}</p>
                )}
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Orders Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Orders Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : dailyOrders.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyOrders}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="orders"
                    stroke="hsl(220, 70%, 50%)"
                    strokeWidth={2}
                    dot={false}
                    name="Orders"
                  />
                  <Line
                    type="monotone"
                    dataKey="delivered"
                    stroke="hsl(160, 60%, 45%)"
                    strokeWidth={2}
                    dot={false}
                    name="Delivered"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Courier Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Courier Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : courierPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={courierPerformance} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="courier"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="delivered" fill="hsl(160, 60%, 45%)" name="Delivered" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="returned" fill="hsl(350, 70%, 55%)" name="Returned" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No courier data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* City Breakdown */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Orders by City
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : cityBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={cityBreakdown.slice(0, 5)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="orders"
                    label={({ city, percent }) => `${city} ${(percent * 100).toFixed(0)}%`}
                  >
                    {cityBreakdown.slice(0, 5).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No city data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Cities Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Top Cities by Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : cityBreakdown.length > 0 ? (
              <div className="space-y-4">
                {cityBreakdown.slice(0, 6).map((city, index) => (
                  <div key={city.city} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                        style={{ backgroundColor: `${COLORS[index % COLORS.length]}20`, color: COLORS[index % COLORS.length] }}
                      >
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{city.city}</p>
                        <p className="text-xs text-muted-foreground">{city.orders} orders</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">PKR {city.revenue}</p>
                      <p className="text-xs text-muted-foreground">{city.delivered} delivered</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                No city data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
