import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3,
  TrendingUp,
  Package,
  CheckCircle2,
  Download,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useDateRange } from "@/contexts/date-range-context";
import { AIInsightsBanner } from "@/components/ai-insights-banner";
import { exportCsvWithDate } from "@/lib/exportCsv";
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

const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ffffff40"];

const darkTooltipStyle = {
  backgroundColor: "#0d1322",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  color: "rgba(255,255,255,0.9)",
};

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

  function handleExport() {
    const headers = [
      "Section", "Date", "Courier", "City", "Orders", "Delivered", "Returned",
      "Delivery Rate (%)", "Revenue",
    ];
    const rows: string[][] = [];

    for (const row of courierPerformance) {
      rows.push([
        "Courier Performance", "", row.courier, "", String(row.orders),
        String(row.delivered), String(row.returned),
        String(row.deliveryRate), "",
      ]);
    }

    for (const row of cityBreakdown) {
      rows.push([
        "City Breakdown", "", "", row.city, String(row.orders),
        String(row.delivered), "", "", row.revenue,
      ]);
    }

    for (const row of dailyOrders) {
      rows.push([
        "Daily Orders", row.date, "", "", String(row.orders),
        String(row.delivered), "", "", "",
      ]);
    }

    exportCsvWithDate("analytics", headers, rows);
  }

  const statCards = [
    {
      label: "Total Orders",
      value: overview?.totalOrders ?? 0,
      icon: Package,
      iconClass: "text-blue-400",
      iconBg: "bg-blue-500/10",
      valueClass: "text-white/90",
    },
    {
      label: "Delivered",
      value: overview?.totalDelivered ?? 0,
      icon: CheckCircle2,
      iconClass: "text-emerald-400",
      iconBg: "bg-emerald-500/10",
      valueClass: "text-emerald-400",
    },
    {
      label: "Delivery Rate",
      value: `${overview?.deliveryRate ?? 0}%`,
      icon: TrendingUp,
      iconClass: "text-amber-400",
      iconBg: "bg-amber-500/10",
      valueClass: "text-amber-400",
    },
    {
      label: "Total Revenue",
      value: `PKR ${overview?.totalRevenue ?? "0"}`,
      icon: BarChart3,
      iconClass: "text-emerald-400",
      iconBg: "bg-emerald-500/10",
      valueClass: "text-emerald-400",
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white/90">Analytics</h1>
          <p className="text-white/40 text-sm mt-0.5">Track performance and insights across your operations.</p>
        </div>
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={isLoading || (!courierPerformance.length && !cityBreakdown.length && !dailyOrders.length)}
          className="bg-white/[0.04] border-white/[0.08] text-white/70 hover:bg-white/[0.08] hover:text-white"
          data-testid="button-export-analytics"
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <AIInsightsBanner section="analytics" />

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="bg-[#0d1322] border-white/[0.08]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-8 h-8 rounded-lg ${card.iconBg} flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${card.iconClass}`} />
                  </div>
                </div>
                <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider">{card.label}</p>
                {isLoading ? (
                  <Skeleton className="h-7 w-20 mt-1" />
                ) : (
                  <p className={`text-xl font-bold mt-0.5 ${card.valueClass}`}>{card.value}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Orders Trend */}
        <Card className="bg-[#0d1322] border-white/[0.08]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white/80">Orders Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : dailyOrders.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={dailyOrders}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip contentStyle={darkTooltipStyle} />
                  <Legend wrapperStyle={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="orders"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="Orders"
                  />
                  <Line
                    type="monotone"
                    dataKey="delivered"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    name="Delivered"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-white/30 text-sm">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Courier Performance */}
        <Card className="bg-[#0d1322] border-white/[0.08]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white/80">Courier Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : courierPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={courierPerformance} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="courier"
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={80}
                  />
                  <Tooltip contentStyle={darkTooltipStyle} />
                  <Bar dataKey="delivered" fill="#10b981" name="Delivered" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="returned" fill="rgba(239,68,68,0.6)" name="Returned" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-white/30 text-sm">
                No courier data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* City Breakdown */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="bg-[#0d1322] border-white/[0.08]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white/80">Orders by City</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : cityBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={cityBreakdown.slice(0, 5)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    dataKey="orders"
                    label={({ city, percent }) => `${city} ${(percent * 100).toFixed(0)}%`}
                  >
                    {cityBreakdown.slice(0, 5).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={darkTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-white/30 text-sm">
                No city data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Cities Table */}
        <Card className="bg-[#0d1322] border-white/[0.08]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white/80">Top Cities by Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : cityBreakdown.length > 0 ? (
              <div className="space-y-2">
                {cityBreakdown.slice(0, 6).map((city, index) => (
                  <div key={city.city} className="flex items-center justify-between gap-4 px-3 py-2 rounded-lg hover:bg-blue-500/[0.06] transition-colors">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs text-white/30 font-medium w-4 text-right tabular-nums">{index + 1}</span>
                      <div>
                        <p className="text-sm font-medium text-white/80">{city.city}</p>
                        <p className="text-xs text-white/40">{city.orders} orders</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-emerald-400 tabular-nums">PKR {city.revenue}</p>
                      <p className="text-xs text-white/40">{city.delivered} delivered</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-white/30 text-sm">
                No city data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
