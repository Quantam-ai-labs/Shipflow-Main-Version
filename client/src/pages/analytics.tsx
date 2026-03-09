import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Download,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useDateRange } from "@/contexts/date-range-context";
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

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Analytics</h1>
          <p className="text-xs text-muted-foreground">Performance and insights across operations</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={isLoading || (!courierPerformance.length && !cityBreakdown.length && !dailyOrders.length)}
          data-testid="button-export-analytics"
        >
          <Download className="w-3.5 h-3.5 mr-1" />
          Export
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="py-2 px-3">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Orders</span>
          {isLoading ? (
            <Skeleton className="h-6 w-14 mt-0.5" />
          ) : (
            <p className="text-base font-bold mt-0.5 tabular-nums">{overview?.totalOrders ?? 0}</p>
          )}
        </div>
        <div className="py-2 px-3">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Delivered</span>
          {isLoading ? (
            <Skeleton className="h-6 w-14 mt-0.5" />
          ) : (
            <p className="text-base font-bold mt-0.5 tabular-nums">{overview?.totalDelivered ?? 0}</p>
          )}
        </div>
        <div className="py-2 px-3">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Delivery Rate</span>
          {isLoading ? (
            <Skeleton className="h-6 w-14 mt-0.5" />
          ) : (
            <p className="text-base font-bold mt-0.5 tabular-nums">{overview?.deliveryRate ?? 0}%</p>
          )}
        </div>
        <div className="py-2 px-3">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Revenue</span>
          {isLoading ? (
            <Skeleton className="h-6 w-20 mt-0.5" />
          ) : (
            <p className="text-base font-bold mt-0.5 tabular-nums">PKR {overview?.totalRevenue ?? "0"}</p>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Orders Trend</p>
            {isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : dailyOrders.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dailyOrders}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="orders" stroke="hsl(220, 70%, 50%)" strokeWidth={1.5} dot={false} name="Orders" />
                  <Line type="monotone" dataKey="delivered" stroke="hsl(160, 60%, 45%)" strokeWidth={1.5} dot={false} name="Delivered" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-xs">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Courier Performance</p>
            {isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : courierPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={courierPerformance} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="courier" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Bar dataKey="delivered" fill="hsl(160, 60%, 45%)" name="Delivered" radius={[0, 2, 2, 0]} />
                  <Bar dataKey="returned" fill="hsl(350, 70%, 55%)" name="Returned" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-xs">
                No courier data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Orders by City</p>
            {isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : cityBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={cityBreakdown.slice(0, 5)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="orders"
                    label={({ city, percent }) => `${city} ${(percent * 100).toFixed(0)}%`}
                  >
                    {cityBreakdown.slice(0, 5).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-xs">
                No city data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Top Cities by Orders</p>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : cityBreakdown.length > 0 ? (
              <div className="space-y-2">
                {cityBreakdown.slice(0, 6).map((city, index) => (
                  <div key={city.city} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground font-medium w-3 text-right tabular-nums">{index + 1}</span>
                      <div>
                        <p className="text-xs font-medium">{city.city}</p>
                        <p className="text-[10px] text-muted-foreground">{city.orders} orders</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium tabular-nums">PKR {city.revenue}</p>
                      <p className="text-[10px] text-muted-foreground">{city.delivered} delivered</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-xs">
                No city data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
