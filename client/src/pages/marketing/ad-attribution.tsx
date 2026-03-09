import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DateRangePicker, dateRangeToParams } from "@/components/date-range-picker";
import { DateRange } from "react-day-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Target,
  RefreshCw,
  ChevronDown,
  Copy,
  Check,
  TrendingUp,
  ShoppingCart,
  DollarSign,
  BarChart2,
  Info,
  Loader2,
  ExternalLink,
  Megaphone,
  History,
} from "lucide-react";
import { SiFacebook } from "react-icons/si";

const UTM_TEMPLATE = "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{adset.id}}";

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(val);
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toUpperCase();
  if (s === "ACTIVE") return <Badge variant="secondary" className="text-[10px]">ACTIVE</Badge>;
  if (s === "PAUSED") return <Badge variant="outline" className="text-[10px]">PAUSED</Badge>;
  if (s === "ARCHIVED") return <Badge variant="outline" className="text-[10px]">ARCHIVED</Badge>;
  return <Badge variant="outline" className="text-[10px]">{s || "UNKNOWN"}</Badge>;
}

function WorkflowBadge({ status }: { status: string }) {
  return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
}

export default function AdAttribution() {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [guideOpen, setGuideOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);

  const dateParams = dateRangeToParams(dateRange);

  const { data, isLoading, refetch } = useQuery<{
    totalOrders: number;
    attributedOrders: number;
    attributionRate: number;
    attributedRevenue: number;
    campaigns: Array<{
      campaignId: string;
      campaignName: string;
      status: string;
      orderCount: number;
      revenue: number;
      orders: any[];
    }>;
  }>({
    queryKey: ["/api/marketing/attribution/summary", dateParams.dateFrom, dateParams.dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateParams.dateFrom) params.set("dateFrom", dateParams.dateFrom);
      if (dateParams.dateTo) params.set("dateTo", dateParams.dateTo);
      const res = await fetch(`/api/marketing/attribution/summary?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch attribution summary");
      return res.json();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/marketing/resolve-attribution"),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/attribution/summary"] });
      toast({
        title: "Attribution matched",
        description: `${result.matched} new orders matched. ${result.alreadyAttributed} already attributed.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const backfillMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/marketing/backfill-utm"),
    onSuccess: async (result: any) => {
      toast({
        title: "Backfill complete",
        description: `${result.updated} historical orders updated with UTM data. ${result.skipped} had no UTM params.`,
      });
      if (result.updated > 0) {
        resolveMutation.mutate();
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function copyTemplate() {
    navigator.clipboard.writeText(UTM_TEMPLATE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const campaigns = data?.campaigns ?? [];
  const allOrders = campaigns.flatMap(c => c.orders);
  const displayedOrders = selectedCampaign
    ? (campaigns.find(c => c.campaignId === selectedCampaign)?.orders ?? [])
    : allOrders;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ad Attribution</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track which Facebook campaign or ad each order came from</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => backfillMutation.mutate()}
            disabled={backfillMutation.isPending || resolveMutation.isPending}
            data-testid="button-backfill-utm"
          >
            {backfillMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <History className="w-3.5 h-3.5 mr-1.5" />}
            Backfill Historical
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => resolveMutation.mutate()}
            disabled={resolveMutation.isPending || backfillMutation.isPending}
            data-testid="button-resolve-attribution"
          >
            {resolveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Match Orders
          </Button>
        </div>
      </div>

      {/* UTM Setup Guide */}
      <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
        <Card className="border-border bg-muted/30">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">How to set up ad tracking — UTM Parameters</CardTitle>
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${guideOpen ? "rotate-180" : ""}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <p className="text-sm text-muted-foreground">
                When a customer clicks a Facebook ad and lands on your store, Shopify records the URL including any tracking parameters.
                By adding UTM parameters to your ad URLs, we can automatically match each order to the exact campaign and ad it came from.
              </p>
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">Step 1 — Copy this UTM template:</p>
                <div className="flex items-center gap-2 bg-background rounded-md border px-3 py-2">
                  <code className="text-xs text-green-400 flex-1 break-all">{UTM_TEMPLATE}</code>
                  <Button variant="ghost" size="sm" onClick={copyTemplate} className="shrink-0 h-7 px-2">
                    {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <p className="text-xs font-medium text-foreground">Step 2 — Add it to your Facebook Ads:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs ml-2">
                  <li>Open <strong className="text-foreground">Facebook Ads Manager</strong></li>
                  <li>Select a campaign → Ad Set → Ad and click <strong className="text-foreground">Edit</strong></li>
                  <li>Scroll to <strong className="text-foreground">Destination URL</strong> or <strong className="text-foreground">Website URL</strong></li>
                  <li>Click <strong className="text-foreground">Build a URL parameter</strong> or paste directly in the <strong className="text-foreground">URL Parameters</strong> field</li>
                  <li>Paste the template above — Facebook replaces <code className="text-green-400">{"{{campaign.id}}"}</code>, <code className="text-green-400">{"{{ad.id}}"}</code>, and <code className="text-green-400">{"{{adset.id}}"}</code> automatically</li>
                  <li>Save and publish. New orders from those ads will be auto-matched here.</li>
                </ol>
              </div>
              <p className="text-xs text-muted-foreground bg-yellow-500/10 border border-yellow-500/20 rounded px-3 py-2">
                <strong className="text-yellow-400">For past orders:</strong> If you already had UTM params set up on previous ads, click <strong className="text-foreground">Backfill Historical</strong> above — it will scan all existing orders for UTM data and match them to campaigns automatically. Orders placed before UTM params were ever added to your ads cannot be attributed.
              </p>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Total Orders",
            value: isLoading ? null : data?.totalOrders ?? 0,
            icon: ShoppingCart,
          },
          {
            label: "Attributed Orders",
            value: isLoading ? null : data?.attributedOrders ?? 0,
            icon: Target,
          },
          {
            label: "Attribution Rate",
            value: isLoading ? null : `${(data?.attributionRate ?? 0).toFixed(1)}%`,
            icon: BarChart2,
          },
          {
            label: "Attributed Revenue",
            value: isLoading ? null : formatCurrency(data?.attributedRevenue ?? 0),
            icon: DollarSign,
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <p className="text-xl font-bold">{stat.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Campaign Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="w-4 h-4" />
              Campaign Breakdown
            </CardTitle>
            {selectedCampaign && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedCampaign(null)} className="text-xs h-7">
                Clear filter
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No attributed orders yet</p>
              <p className="text-xs mt-1">Set up UTM parameters in your Facebook Ads, then click "Match Orders".</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Avg. Order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow
                    key={c.campaignId}
                    className={`cursor-pointer transition-colors ${selectedCampaign === c.campaignId ? "bg-muted/50" : "hover:bg-muted/30"}`}
                    onClick={() => setSelectedCampaign(selectedCampaign === c.campaignId ? null : c.campaignId)}
                    data-testid={`row-campaign-${c.campaignId}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <SiFacebook className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="font-medium text-sm truncate max-w-[280px]">{c.campaignName}</span>
                        <StatusBadge status={c.status} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{c.orderCount}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(c.revenue)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {c.orderCount > 0 ? formatCurrency(c.revenue / c.orderCount) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Order-Level Attribution Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            {selectedCampaign
              ? `Orders — ${campaigns.find(c => c.campaignId === selectedCampaign)?.campaignName ?? selectedCampaign}`
              : "All Attributed Orders"}
            <span className="text-xs text-muted-foreground font-normal ml-1">({displayedOrders.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : displayedOrders.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No attributed orders{selectedCampaign ? " for this campaign" : ""}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Ad</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedOrders.map((order) => (
                  <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                    <TableCell className="font-medium text-sm">{order.orderNumber}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{order.customerName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <SiFacebook className="w-3 h-3 text-blue-400 shrink-0" />
                        <span className="text-xs truncate max-w-[180px]">
                          {campaigns.find(c => c.campaignId === order.attributedCampaignId)?.campaignName ?? order.attributedCampaignId}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {order.adName ?? (order.attributedAdId ? <span className="font-mono text-[10px]">{order.attributedAdId}</span> : "—")}
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm">
                      {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(parseFloat(order.totalAmount || "0"))}
                    </TableCell>
                    <TableCell><WorkflowBadge status={order.workflowStatus} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {order.orderDate ? new Date(order.orderDate).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </TableCell>
                    <TableCell>
                      {(order.utmSource || order.utmCampaign) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button className="text-muted-foreground hover:text-foreground">
                              <Info className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-[260px] text-xs space-y-1">
                            {order.utmSource && <p><span className="text-muted-foreground">Source:</span> {order.utmSource}</p>}
                            {order.utmMedium && <p><span className="text-muted-foreground">Medium:</span> {order.utmMedium}</p>}
                            {order.utmCampaign && <p><span className="text-muted-foreground">Campaign:</span> {order.utmCampaign}</p>}
                            {order.utmContent && <p><span className="text-muted-foreground">Content (Ad ID):</span> {order.utmContent}</p>}
                            {order.utmTerm && <p><span className="text-muted-foreground">Term (AdSet ID):</span> {order.utmTerm}</p>}
                          </TooltipContent>
                        </Tooltip>
                      )}
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
