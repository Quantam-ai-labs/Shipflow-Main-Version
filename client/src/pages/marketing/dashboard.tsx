import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RefreshCw,
  Loader2,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatPkShortDate, formatPkDateTime } from "@/lib/dateFormat";

const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 Days" },
  { value: "last30", label: "Last 30 Days" },
  { value: "mtd", label: "Month to Date" },
];

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

function formatNumber(val: number): string {
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
  return val.toLocaleString();
}

export default function MarketingDashboard() {
  const [preset, setPreset] = useState("last7");
  const { toast } = useToast();

  const { data: summary, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ["/api/marketing/summary", preset],
    queryFn: async () => {
      const res = await fetch(`/api/marketing/summary?preset=${preset}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery<any[]>({
    queryKey: ["/api/marketing/campaigns", preset],
    queryFn: async () => {
      const res = await fetch(`/api/marketing/campaigns?preset=${preset}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
  });

  const { data: dailyData, isLoading: dailyLoading } = useQuery<any[]>({
    queryKey: ["/api/marketing/daily", preset],
    queryFn: async () => {
      const res = await fetch(`/api/marketing/daily?preset=${preset}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch daily data");
      return res.json();
    },
  });

  const { data: syncStatus } = useQuery<any>({
    queryKey: ["/api/marketing/sync-status"],
    queryFn: async () => {
      const res = await fetch("/api/marketing/sync-status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sync status");
      return res.json();
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketing/sync");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Sync Complete", description: `Synced ${data.campaigns} campaigns, ${data.insights} insights` });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/daily"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/sync-status"] });
    },
    onError: (error: any) => {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const kpiCards = [
    { title: "Total Spend", value: summary ? formatCurrency(summary.totalSpend) : "-" },
    { title: "Total Revenue", value: summary ? formatCurrency(summary.totalRevenue) : "-" },
    { title: "ROAS", value: summary ? `${summary.roas.toFixed(2)}x` : "-" },
    { title: "CPA", value: summary ? formatCurrency(summary.cpa) : "-" },
    { title: "Purchases", value: summary ? formatNumber(summary.totalPurchases) : "-" },
    { title: "Impressions", value: summary ? formatNumber(summary.totalImpressions) : "-" },
  ];

  const chartData = dailyData?.map((d: any) => ({
    date: formatPkShortDate(d.date),
    spend: parseFloat(d.totalSpend),
    revenue: parseFloat(d.totalRevenue),
    purchases: d.totalPurchases,
  })) || [];

  const pieData = campaigns?.filter((c: any) => c.spend > 0).map((c: any, i: number) => ({
    name: c.name?.length > 20 ? c.name.substring(0, 20) + "..." : c.name,
    value: c.spend,
    color: CHART_COLORS[i % CHART_COLORS.length],
  })) || [];

  const sortedCampaigns = [...(campaigns || [])].sort((a: any, b: any) => b.spend - a.spend).map((c: any) => ({
    ...c,
    revenue: c.purchaseValue || c.revenue || 0,
  }));

  return (
    <div className="p-3 md:p-4 space-y-3 max-w-[1400px] mx-auto" data-testid="marketing-dashboard">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h1 className="text-lg font-semibold" data-testid="text-page-title">Ads Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            Facebook Ads performance
            {syncStatus?.lastSync && (
              <span className="ml-1.5">
                · Synced {syncStatus.lastSync.completedAt ? formatPkDateTime(syncStatus.lastSync.completedAt) : "never"}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={preset} onValueChange={setPreset} data-testid="select-date-preset">
            <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="trigger-date-preset">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map(p => (
                <SelectItem key={p.value} value={p.value} data-testid={`option-preset-${p.value}`}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync"
          >
            {syncMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
            Sync
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {kpiCards.map((card, i) => (
          <div key={i} className="py-2 px-3" data-testid={`card-kpi-${i}`}>
            {summaryLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{card.title}</span>
                <div className="text-base font-bold mt-0.5 tabular-nums" data-testid={`text-kpi-value-${i}`}>{card.value}</div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card data-testid="card-spend-revenue-chart">
          <CardContent className="p-3 pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Spend vs Revenue</p>
            {dailyLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-xs">
                No data available. Click Sync to fetch data.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name === "spend" ? "Spend" : "Revenue"]}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="spend" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Spend" />
                  <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={1.5} dot={false} name="Revenue" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-spend-distribution">
          <CardContent className="p-3 pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Spend Distribution</p>
            {campaignsLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : pieData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-xs">
                No campaign data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry: any, index: number) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-campaign-performance">
        <CardContent className="p-3 pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Campaign Performance</p>
          {campaignsLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : sortedCampaigns.length === 0 ? (
            <div className="h-[160px] flex items-center justify-center text-muted-foreground text-xs">
              No campaign data. Click Sync to fetch from Facebook.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sortedCampaigns.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={{ fontSize: 9 }}
                  tickFormatter={(v) => v.length > 16 ? v.substring(0, 16) + "..." : v}
                />
                <Tooltip formatter={(value: number, name: string) => [formatCurrency(value), name === "spend" ? "Spend" : "Revenue"]} contentStyle={{ fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="spend" fill="#ef4444" name="Spend" radius={[0, 2, 2, 0]} />
                <Bar dataKey="revenue" fill="#10b981" name="Revenue" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-campaigns-table">
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b">
            <p className="text-xs font-medium text-muted-foreground">All Campaigns</p>
          </div>
          {campaignsLoading ? (
            <div className="p-3"><Skeleton className="h-[160px] w-full" /></div>
          ) : sortedCampaigns.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-xs">
              No campaign data available. Click Sync to fetch from Facebook Ads.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold">Campaign</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Spend</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Revenue</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">Purchases</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">CPA</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">ROAS</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-right">CTR</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCampaigns.map((c: any, i: number) => (
                    <TableRow key={c.entityId || i} data-testid={`row-campaign-${i}`}>
                      <TableCell className="text-xs font-medium max-w-[200px] truncate py-1.5" data-testid={`text-campaign-name-${i}`}>
                        {c.name}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-1.5">{formatCurrency(c.spend)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-1.5">{formatCurrency(c.purchaseValue || c.revenue || 0)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-1.5">{c.purchases}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-1.5">{formatCurrency(c.cpa)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-1.5">
                        <span className={c.roas >= 1 ? "text-green-600" : "text-red-600"}>
                          {c.roas.toFixed(2)}x
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-1.5">{c.ctr.toFixed(2)}%</TableCell>
                      <TableCell className="text-center py-1.5">
                        <Badge
                          variant="secondary"
                          size="sm"
                          data-testid={`badge-campaign-status-${i}`}
                        >
                          {c.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
