import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Eye,
  MousePointer,
  Target,
  ArrowUpRight,
  ArrowDownRight,
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
import { format } from "date-fns";

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
    { title: "Total Spend", value: summary ? formatCurrency(summary.totalSpend) : "-", icon: DollarSign, color: "text-red-500" },
    { title: "Total Revenue", value: summary ? formatCurrency(summary.totalRevenue) : "-", icon: ShoppingCart, color: "text-green-500" },
    { title: "ROAS", value: summary ? `${summary.roas.toFixed(2)}x` : "-", icon: TrendingUp, color: "text-blue-500" },
    { title: "CPA", value: summary ? formatCurrency(summary.cpa) : "-", icon: Target, color: "text-orange-500" },
    { title: "Purchases", value: summary ? formatNumber(summary.totalPurchases) : "-", icon: ShoppingCart, color: "text-purple-500" },
    { title: "Impressions", value: summary ? formatNumber(summary.totalImpressions) : "-", icon: Eye, color: "text-cyan-500" },
  ];

  const chartData = dailyData?.map((d: any) => ({
    date: format(new Date(d.date), "MMM d"),
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
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="marketing-dashboard">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Ads Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Facebook Ads performance overview
            {syncStatus?.lastSync && (
              <span className="ml-2">
                · Last synced {syncStatus.lastSync.completedAt ? format(new Date(syncStatus.lastSync.completedAt), "MMM d, h:mm a") : "never"}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={preset} onValueChange={setPreset} data-testid="select-date-preset">
            <SelectTrigger className="w-[160px]" data-testid="trigger-date-preset">
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
            {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Sync
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((card, i) => (
          <Card key={i} data-testid={`card-kpi-${i}`}>
            <CardContent className="p-3">
              {summaryLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <>
                  <div className="flex items-center gap-1.5 mb-1">
                    <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
                    <span className="text-[11px] text-muted-foreground font-medium">{card.title}</span>
                  </div>
                  <div className="text-lg font-bold" data-testid={`text-kpi-value-${i}`}>{card.value}</div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card data-testid="card-spend-revenue-chart">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Spend vs Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                No data available. Click Sync to fetch data.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis className="text-xs" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name === "spend" ? "Spend" : "Revenue"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="spend" stroke="#ef4444" strokeWidth={2} dot={false} name="Spend" />
                  <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} name="Revenue" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-spend-distribution">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Spend Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {campaignsLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : pieData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                No campaign data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry: any, index: number) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-campaign-performance">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Campaign Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {campaignsLoading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : sortedCampaigns.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              No campaign data. Click Sync to fetch from Facebook.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={sortedCampaigns.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v.length > 18 ? v.substring(0, 18) + "..." : v}
                />
                <Tooltip formatter={(value: number, name: string) => [formatCurrency(value), name === "spend" ? "Spend" : "Revenue"]} />
                <Legend />
                <Bar dataKey="spend" fill="#ef4444" name="Spend" radius={[0, 2, 2, 0]} />
                <Bar dataKey="revenue" fill="#10b981" name="Revenue" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-campaigns-table">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">All Campaigns</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {campaignsLoading ? (
            <div className="p-4"><Skeleton className="h-[200px] w-full" /></div>
          ) : sortedCampaigns.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No campaign data available. Click Sync to fetch from Facebook Ads.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Campaign</TableHead>
                    <TableHead className="text-xs text-right">Spend</TableHead>
                    <TableHead className="text-xs text-right">Revenue</TableHead>
                    <TableHead className="text-xs text-right">Purchases</TableHead>
                    <TableHead className="text-xs text-right">CPA</TableHead>
                    <TableHead className="text-xs text-right">ROAS</TableHead>
                    <TableHead className="text-xs text-right">CTR</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCampaigns.map((c: any, i: number) => (
                    <TableRow key={c.campaignId} data-testid={`row-campaign-${i}`}>
                      <TableCell className="text-sm font-medium max-w-[200px] truncate" data-testid={`text-campaign-name-${i}`}>
                        {c.name}
                      </TableCell>
                      <TableCell className="text-sm text-right">{formatCurrency(c.spend)}</TableCell>
                      <TableCell className="text-sm text-right">{formatCurrency(c.purchaseValue || c.revenue || 0)}</TableCell>
                      <TableCell className="text-sm text-right">{c.purchases}</TableCell>
                      <TableCell className="text-sm text-right">{formatCurrency(c.cpa)}</TableCell>
                      <TableCell className="text-sm text-right">
                        <span className={c.roas >= 1 ? "text-green-600" : "text-red-600"}>
                          {c.roas.toFixed(2)}x
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-right">{c.ctr.toFixed(2)}%</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={`text-[10px] ${c.status === "ACTIVE" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}
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
