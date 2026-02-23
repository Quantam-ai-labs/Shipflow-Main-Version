import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Activity, TrendingUp, DollarSign, Eye, MousePointer, ShoppingCart } from "lucide-react";

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

function formatNumber(val: number): string {
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
  return val.toLocaleString();
}

export default function LiveCampaigns() {
  const { data: campaigns, isLoading } = useQuery<any[]>({
    queryKey: ["/api/marketing/active-campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/marketing/active-campaigns", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch active campaigns");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const totalSpend = campaigns?.reduce((sum: number, c: any) => sum + c.todaySpend, 0) || 0;
  const totalRevenue = campaigns?.reduce((sum: number, c: any) => sum + c.todayRevenue, 0) || 0;
  const totalPurchases = campaigns?.reduce((sum: number, c: any) => sum + c.todayPurchases, 0) || 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="live-campaigns-page">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Activity className="w-5 h-5 text-green-500" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Live Campaign Monitor</h1>
          <p className="text-sm text-muted-foreground">Active campaigns · Auto-refreshes every 60 seconds</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid="card-live-active-count">
          <CardContent className="p-3">
            {isLoading ? <Skeleton className="h-12 w-full" /> : (
              <>
                <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                  <Activity className="w-3 h-3 text-green-500" />Active Campaigns
                </div>
                <div className="text-2xl font-bold">{campaigns?.length || 0}</div>
              </>
            )}
          </CardContent>
        </Card>
        <Card data-testid="card-live-today-spend">
          <CardContent className="p-3">
            {isLoading ? <Skeleton className="h-12 w-full" /> : (
              <>
                <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-red-500" />Today's Spend
                </div>
                <div className="text-2xl font-bold">{formatCurrency(totalSpend)}</div>
              </>
            )}
          </CardContent>
        </Card>
        <Card data-testid="card-live-today-revenue">
          <CardContent className="p-3">
            {isLoading ? <Skeleton className="h-12 w-full" /> : (
              <>
                <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-green-500" />Today's Revenue
                </div>
                <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
              </>
            )}
          </CardContent>
        </Card>
        <Card data-testid="card-live-today-purchases">
          <CardContent className="p-3">
            {isLoading ? <Skeleton className="h-12 w-full" /> : (
              <>
                <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                  <ShoppingCart className="w-3 h-3 text-purple-500" />Today's Purchases
                </div>
                <div className="text-2xl font-bold">{totalPurchases}</div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-live-campaigns-table">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            Active Campaigns
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-[10px]">
              LIVE
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><Skeleton className="h-[300px] w-full" /></div>
          ) : !campaigns || campaigns.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No active campaigns found. Sync your ads data from the Dashboard page first.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Campaign</TableHead>
                    <TableHead className="text-xs">Objective</TableHead>
                    <TableHead className="text-xs text-right">Today Spend</TableHead>
                    <TableHead className="text-xs text-right">Today Revenue</TableHead>
                    <TableHead className="text-xs text-right">Purchases</TableHead>
                    <TableHead className="text-xs text-right">ROAS</TableHead>
                    <TableHead className="text-xs text-right">Impressions</TableHead>
                    <TableHead className="text-xs text-right">Clicks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c: any, i: number) => (
                    <TableRow key={c.campaignId || i} data-testid={`row-live-campaign-${i}`}>
                      <TableCell className="text-sm font-medium max-w-[200px] truncate">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                          {c.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.objective || "-"}</TableCell>
                      <TableCell className="text-sm text-right">{formatCurrency(c.todaySpend)}</TableCell>
                      <TableCell className="text-sm text-right">{formatCurrency(c.todayRevenue)}</TableCell>
                      <TableCell className="text-sm text-right">{c.todayPurchases}</TableCell>
                      <TableCell className="text-sm text-right">
                        <span className={c.todayRoas >= 1 ? "text-green-600" : "text-red-600"}>
                          {c.todayRoas.toFixed(2)}x
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-right">{formatNumber(c.todayImpressions)}</TableCell>
                      <TableCell className="text-sm text-right">{formatNumber(c.todayClicks)}</TableCell>
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
