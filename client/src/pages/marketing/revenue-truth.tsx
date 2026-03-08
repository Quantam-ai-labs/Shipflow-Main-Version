import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DateRangePicker, dateRangeToParams } from "@/components/date-range-picker";
import { DateRange } from "react-day-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  AlertCircle,
  BarChart2,
  Package,
  Layers,
  Eye,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Minus,
} from "lucide-react";

const PKR = (v: number) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(v);

const pct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`);
const roasStr = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}x`);

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const s = status.toUpperCase();
  const color =
    s === "ACTIVE" ? "bg-green-500/15 text-green-400 border-green-500/30" :
    s === "PAUSED" ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" :
    "bg-muted text-muted-foreground";
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${color}`}>{s}</span>;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-muted-foreground text-xs">—</span>;
  const isPos = delta >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${isPos ? "text-red-400" : "text-green-400"}`}>
      {isPos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {pct(delta)}
    </span>
  );
}

function ProductBar({ title, percentage, revenue, quantity }: { title: string; percentage: number; revenue: number; quantity: number }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-foreground truncate max-w-[60%]" title={title}>{title}</span>
        <span className="text-muted-foreground shrink-0">{PKR(revenue)} · {quantity} pcs · {percentage}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-violet-500 rounded-full"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ── True ROAS Tab ─────────────────────────────────────────────────────────────
function TrueRoasTab({ dateRange }: { dateRange: DateRange | undefined }) {
  const params = dateRangeToParams(dateRange);
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/marketing/revenue-truth/roas", params.dateFrom, params.dateTo],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (params.dateFrom) p.set("dateFrom", params.dateFrom);
      if (params.dateTo) p.set("dateTo", params.dateTo);
      const r = await fetch(`/api/marketing/revenue-truth/roas?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const campaigns = data?.campaigns ?? [];
  const totals = data?.totals;

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Spend", value: PKR(totals.fbSpend), icon: DollarSign, color: "text-red-400" },
            { label: "Our Revenue", value: PKR(totals.ourRevenue), icon: TrendingUp, color: "text-green-400" },
            { label: "Our Real ROAS", value: roasStr(totals.ourRoas), icon: BarChart2, color: "text-violet-400" },
            { label: "FB Claimed Revenue", value: PKR(totals.fbRevenue), icon: Eye, color: "text-blue-400" },
            { label: "FB Reported ROAS", value: roasStr(totals.fbRoas), icon: BarChart2, color: "text-blue-400" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
                <p className="text-lg font-bold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Campaign ROAS Comparison</CardTitle>
          <p className="text-xs text-muted-foreground">
            "Our ROAS" is calculated from actual order revenue attributed to each campaign.
            "FB ROAS" is what Facebook reports. The <strong>Delta</strong> shows how much Facebook over- or under-claims — positive means Facebook is over-reporting.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <AlertCircle className="w-8 h-8 opacity-40" />
              <p className="text-sm">No campaign data for this period</p>
              <p className="text-xs opacity-70">Make sure you have Facebook credentials configured and have run the attribution match</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Our Orders</TableHead>
                  <TableHead className="text-right">Our Revenue</TableHead>
                  <TableHead className="text-right text-green-400">Our ROAS</TableHead>
                  <TableHead className="text-right">FB Revenue</TableHead>
                  <TableHead className="text-right text-blue-400">FB ROAS</TableHead>
                  <TableHead className="text-right">
                    <Tooltip>
                      <TooltipTrigger className="cursor-help underline decoration-dotted">Delta</TooltipTrigger>
                      <TooltipContent className="max-w-[220px] text-xs">
                        How much FB revenue differs from our attributed revenue. Positive = FB is over-claiming. Negative = FB is under-claiming.
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c: any) => (
                  <TableRow key={c.campaignId} data-testid={`row-campaign-${c.campaignId}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium max-w-[280px] truncate" title={c.campaignName}>{c.campaignName}</span>
                        <StatusBadge status={c.status} />
                      </div>
                      {c.objective && <p className="text-xs text-muted-foreground mt-0.5">{c.objective}</p>}
                    </TableCell>
                    <TableCell className="text-right text-sm">{c.fbSpend > 0 ? PKR(c.fbSpend) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right text-sm">{c.ourOrders > 0 ? c.ourOrders : <span className="text-muted-foreground">0</span>}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{c.ourRevenue > 0 ? PKR(c.ourRevenue) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">
                      {c.ourRoas != null ? (
                        <span className={`text-sm font-bold ${c.ourRoas >= 2 ? "text-green-400" : c.ourRoas >= 1 ? "text-yellow-400" : "text-red-400"}`}>
                          {roasStr(c.ourRoas)}
                        </span>
                      ) : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm text-blue-300">{c.fbRevenue > 0 ? PKR(c.fbRevenue) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">
                      {c.fbRoas != null ? (
                        <span className="text-sm text-blue-300">{roasStr(c.fbRoas)}</span>
                      ) : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <DeltaBadge delta={c.delta} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Product Attribution Tab ───────────────────────────────────────────────────
function ProductAttributionTab({ dateRange }: { dateRange: DateRange | undefined }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const params = dateRangeToParams(dateRange);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/marketing/revenue-truth/products", params.dateFrom, params.dateTo],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (params.dateFrom) p.set("dateFrom", params.dateFrom);
      if (params.dateTo) p.set("dateTo", params.dateTo);
      const r = await fetch(`/api/marketing/revenue-truth/products?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const campaigns = data?.campaigns ?? [];

  function toggle(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
        <Package className="w-10 h-10 opacity-30" />
        <p className="text-sm">No attributed orders found for this period</p>
        <p className="text-xs opacity-70">Run the attribution match on the Attribution page first</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Shows exactly which products each campaign sold — including collection-page ads with mixed baskets.
        Click a campaign to expand the full product breakdown.
      </p>
      {campaigns.map((c: any) => {
        const isOpen = expanded.has(c.campaignId);
        const topProduct = c.products[0];
        return (
          <Card key={c.campaignId} className="overflow-hidden" data-testid={`card-campaign-${c.campaignId}`}>
            <button
              className="w-full text-left"
              onClick={() => toggle(c.campaignId)}
              data-testid={`button-expand-${c.campaignId}`}
            >
              <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate max-w-[320px]" title={c.campaignName}>{c.campaignName}</span>
                      <StatusBadge status={c.campaignStatus} />
                    </div>
                    {!isOpen && topProduct && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Top product: {topProduct.title} ({topProduct.percentage}% of revenue)
                        {c.products.length > 1 && ` · +${c.products.length - 1} more`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-6 shrink-0 ml-4 text-right">
                  <div>
                    <p className="text-xs text-muted-foreground">Orders</p>
                    <p className="text-sm font-medium">{c.totalOrders}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Revenue</p>
                    <p className="text-sm font-bold text-green-400">{PKR(c.totalRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Products</p>
                    <p className="text-sm font-medium">{c.products.length}</p>
                  </div>
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-2.5 bg-muted/10">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Product breakdown by revenue</p>
                {c.products.map((p: any) => (
                  <ProductBar
                    key={p.title}
                    title={p.title}
                    percentage={p.percentage}
                    revenue={p.revenue}
                    quantity={p.quantity}
                  />
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ── Dark Traffic Tab ──────────────────────────────────────────────────────────
function DarkTrafficTab({ dateRange }: { dateRange: DateRange | undefined }) {
  const params = dateRangeToParams(dateRange);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/marketing/revenue-truth/dark", params.dateFrom, params.dateTo],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (params.dateFrom) p.set("dateFrom", params.dateFrom);
      if (params.dateTo) p.set("dateTo", params.dateTo);
      const r = await fetch(`/api/marketing/revenue-truth/dark?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const summary = data?.summary;
  const bySource = data?.bySource ?? [];
  const recent = data?.recentUnattributed ?? [];

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  const sourceColors: Record<string, string> = {
    "Attributed (FB Ads)": "bg-green-500",
    "Facebook Organic": "bg-blue-500",
    "Facebook (No UTM)": "bg-blue-400",
    "Google": "bg-yellow-500",
    "Instagram": "bg-pink-500",
    "TikTok": "bg-cyan-500",
    "Direct / Unknown": "bg-muted-foreground",
    "Other": "bg-violet-500",
  };

  const totalRev = summary?.totalRevenue ?? 1;

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Shows where your revenue is coming from — and how much of it can't be traced to any ad.
        High unattributed revenue is normal (direct traffic, organic search) but indicates how much your ads data understates your true reach.
      </p>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Orders", value: summary.totalOrders, icon: ShoppingCart, color: "text-blue-400" },
            { label: "Attributed Orders", value: summary.attributedOrders, icon: BarChart2, color: "text-green-400" },
            { label: "Attribution Rate", value: `${summary.attributionRate}%`, icon: TrendingUp, color: "text-violet-400" },
            { label: "Unattributed Revenue", value: PKR(summary.unattributedRevenue), icon: AlertCircle, color: "text-red-400" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
                <p className="text-lg font-bold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="w-4 h-4 text-muted-foreground" />
              Revenue by Traffic Source
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bySource.map((s: any) => {
              const pctVal = totalRev > 0 ? (s.revenue / totalRev * 100) : 0;
              const color = sourceColors[s.source] ?? "bg-violet-500";
              return (
                <div key={s.source} className="space-y-1" data-testid={`source-${s.source.replace(/\s+/g, "-").toLowerCase()}`}>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${color}`} />
                      <span className="text-foreground">{s.source}</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{s.orders} orders</span>
                      <span className="font-medium text-foreground">{PKR(s.revenue)}</span>
                      <span className="w-10 text-right">{pctVal.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pctVal}%` }} />
                  </div>
                </div>
              );
            })}
            {bySource.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No data for this period</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-400" />
              Attribution Gap
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary && (
              <>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Attributed Revenue</span>
                    <span className="text-green-400 font-medium">{PKR(summary.attributedRevenue)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${summary.attributionRate}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Unattributed Revenue</span>
                    <span className="text-muted-foreground font-medium">{PKR(summary.unattributedRevenue)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-muted-foreground/40 rounded-full"
                      style={{ width: `${100 - summary.attributionRate}%` }}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                  {summary.attributionRate < 30
                    ? "Attribution rate is low — add UTM parameters to your Facebook ad URLs to capture more orders."
                    : summary.attributionRate < 60
                    ? "Decent coverage. Run backfill on the Attribution page to recover more historical orders."
                    : "Good attribution coverage. The unattributed portion is likely direct / organic traffic."}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Recent Unattributed Orders</CardTitle>
          <p className="text-xs text-muted-foreground">Orders with no UTM data — showing their traffic source where available</p>
        </CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <TrendingUp className="w-8 h-8 opacity-30 text-green-400" />
              <p className="text-sm">All orders in this period are attributed</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Referring Site</TableHead>
                  <TableHead>Landing Site</TableHead>
                  <TableHead>FB Click</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((o: any) => (
                  <TableRow key={o.id} data-testid={`row-unattributed-${o.id}`}>
                    <TableCell className="text-sm font-medium">#{o.orderNumber}</TableCell>
                    <TableCell className="text-right text-sm">{PKR(o.totalAmount)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate" title={o.referringSite}>
                      {o.referringSite || <span className="text-muted-foreground/50 italic">none</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" title={o.landingSite}>
                      {o.landingSite ? (
                        <Tooltip>
                          <TooltipTrigger className="truncate max-w-[200px] block text-left">
                            {o.landingSite.replace(/^https?:\/\/[^/]+/, "")}
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs break-all text-xs">{o.landingSite}</TooltipContent>
                        </Tooltip>
                      ) : <span className="text-muted-foreground/50 italic">none</span>}
                    </TableCell>
                    <TableCell>
                      {o.hasFbClick ? (
                        <span className="text-xs text-blue-400 font-medium">Yes</span>
                      ) : (
                        <Minus className="w-3 h-3 text-muted-foreground/40" />
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-PK", { day: "2-digit", month: "short" }) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RevenueTruth() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    return { from, to };
  });

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Revenue Truth</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Ground-truth attribution — your actual order data vs what Facebook reports
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      <Tabs defaultValue="roas">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="roas" data-testid="tab-true-roas">True ROAS</TabsTrigger>
          <TabsTrigger value="products" data-testid="tab-product-attribution">Product Attribution</TabsTrigger>
          <TabsTrigger value="dark" data-testid="tab-dark-traffic">Dark Traffic</TabsTrigger>
        </TabsList>

        <TabsContent value="roas" className="mt-5">
          <TrueRoasTab dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="products" className="mt-5">
          <ProductAttributionTab dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="dark" className="mt-5">
          <DarkTrafficTab dateRange={dateRange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
