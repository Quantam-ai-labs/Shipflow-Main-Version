import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DateRangePicker, dateRangeToParams } from "@/components/date-range-picker";
import { DateRange } from "react-day-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Truck,
  CheckCircle,
  Loader2,
  Link2,
  Zap,
  Hand,
  HelpCircle,
  RefreshCw,
  ShoppingCart,
  Target,
  ChevronsUpDown,
  Search,
  X,
  Check,
  Pencil,
  Filter,
  ListOrdered,
  Type,
  ArrowUpCircle,
  Eye,
  AlertTriangle,
  Plus,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Layers,
} from "lucide-react";
import type { Product, CampaignJourneyEvent } from "@shared/schema";
import CampaignJourney, { isEvidenceReady } from "./campaign-journey";
import type { CampaignMetrics, Signal } from "./campaign-journey";

interface CampaignData {
  campaignId: string;
  campaignName: string;
  status: string;
  objective: string | null;
  adSpend: number;
  destinationUrl: string | null;
  matchType: "auto" | "name" | "manual" | "unmatched";
  product: {
    id: string;
    title: string;
    handle: string | null;
    imageUrl: string | null;
    salePrice: number;
    costPrice: number;
  } | null;
  orders: {
    total: number;
    dispatched: number;
    fulfilled: number;
    delivered: number;
  };
}

interface AdditionalProduct {
  id: string;
  title: string;
  imageUrl: string | null;
  salePrice: number;
  costPrice: number;
}

interface ProductOrderStat {
  productId: string;
  title: string;
  imageUrl: string | null;
  salePrice: number;
  costPrice: number;
  orders: {
    total: number;
    dispatched: number;
    fulfilled: number;
    delivered: number;
  };
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function formatUsd(val: number): string {
  return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "ACTIVE"
    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
    : status === "PAUSED"
    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
    : "bg-white/[0.06] text-white/60 border border-white/[0.12]";
  return <Badge className={`${cls} text-[8px] px-1 py-0 leading-tight`}>{status}</Badge>;
}

function MatchIndicator({ type }: { type: string }) {
  if (type === "auto") {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Zap className="w-3.5 h-3.5 text-green-500" />
        </TooltipTrigger>
        <TooltipContent>Auto-matched from ad destination URL</TooltipContent>
      </Tooltip>
    );
  }
  if (type === "name") {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Type className="w-3.5 h-3.5 text-amber-500" />
        </TooltipTrigger>
        <TooltipContent>Auto-matched from campaign name</TooltipContent>
      </Tooltip>
    );
  }
  if (type === "manual") {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Hand className="w-3.5 h-3.5 text-blue-500" />
        </TooltipTrigger>
        <TooltipContent>Manually matched</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger>
        <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent>No product matched — select one manually</TooltipContent>
    </Tooltip>
  );
}

type StatusFilter = "ALL" | "ACTIVE" | "PAUSED" | "ARCHIVED";
type OrderTypeForCalc = "total" | "dispatched" | "delivered" | "delivered_plus_dispatch75" | "total_minus_40" | "total_minus_25";

export default function AdsProfitability() {
  const { toast } = useToast();

  const [dollarRate, setDollarRate] = useState<string>("280");
  const [deliveryCharges, setDeliveryCharges] = useState<string>("0");
  const [packingExpense, setPackingExpense] = useState<string>("0");
  const [manualOverrides, setManualOverrides] = useState<Record<string, string>>({});
  const [multiProductOverrides, setMultiProductOverrides] = useState<Record<string, string[]>>({});
  const [openCombobox, setOpenCombobox] = useState<string | null>(null);
  const [multiSelectDialog, setMultiSelectDialog] = useState<string | null>(null);
  const [tempSelection, setTempSelection] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [collectionTab, setCollectionTab] = useState<"products" | "collections">("products");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [orderTypeForCalc, setOrderTypeForCalc] = useState<OrderTypeForCalc>("total");

  const [signalModal, setSignalModal] = useState<{
    campaignId: string;
    campaignName: string;
    signal: Signal;
  } | null>(null);
  const [signalNote, setSignalNote] = useState("");
  const [signalWindow, setSignalWindow] = useState("48");
  const [showProductSummary, setShowProductSummary] = useState(false);
  const [productSortBy, setProductSortBy] = useState<"netProfit" | "adSpend" | "orders" | "roas">("netProfit");

  const { data: journeyEventsData } = useQuery<{ events: CampaignJourneyEvent[] }>({
    queryKey: ["/api/marketing/journey/events"],
  });

  const currentSignals = useMemo(() => {
    const map = new Map<string, Signal>();
    const events = journeyEventsData?.events ?? [];
    const signalEvents = events.filter(e => e.actionType === "Signal Decision");
    for (const evt of signalEvents) {
      if (!map.has(evt.campaignKey) && evt.selectedSignal) {
        map.set(evt.campaignKey, evt.selectedSignal as Signal);
      }
    }
    return map;
  }, [journeyEventsData]);

  const signalMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/marketing/journey/events", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/journey/events"] });
      toast({ title: "Signal saved", description: "Signal decision recorded." });
      setSignalModal(null);
      setSignalNote("");
      setSignalWindow("48");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("shipflow-profitability-settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.dollarRate) setDollarRate(parsed.dollarRate);
        if (parsed.deliveryCharges) setDeliveryCharges(parsed.deliveryCharges);
        if (parsed.packingExpense) setPackingExpense(parsed.packingExpense);
        if (parsed.statusFilter) setStatusFilter(parsed.statusFilter);
        if (parsed.orderTypeForCalc) setOrderTypeForCalc(parsed.orderTypeForCalc);
        if (parsed.dateRangeFrom && parsed.dateRangeTo) {
          setDateRange({ from: new Date(parsed.dateRangeFrom), to: new Date(parsed.dateRangeTo) });
        }
        if (parsed.multiProductOverrides) setMultiProductOverrides(parsed.multiProductOverrides);
      }
    } catch {}
  }, []);

  const dateParams = dateRangeToParams(dateRange);

  useEffect(() => {
    localStorage.setItem(
      "shipflow-profitability-settings",
      JSON.stringify({
        dollarRate, deliveryCharges, packingExpense, statusFilter, orderTypeForCalc,
        dateRangeFrom: dateRange?.from?.toISOString() || null,
        dateRangeTo: dateRange?.to?.toISOString() || null,
        multiProductOverrides,
      })
    );
  }, [dollarRate, deliveryCharges, packingExpense, statusFilter, dateRange, orderTypeForCalc, multiProductOverrides]);

  const { data: calcData, isLoading } = useQuery<{ campaigns: CampaignData[] }>({
    queryKey: ["/api/marketing/profitability/calculator", dateParams.dateFrom, dateParams.dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateParams.dateFrom) params.set("dateFrom", dateParams.dateFrom);
      if (dateParams.dateTo) params.set("dateTo", dateParams.dateTo);
      const res = await fetch(`/api/marketing/profitability/calculator?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch calculator data");
      return res.json();
    },
  });

  const { data: productsData } = useQuery<{ products: Product[]; total: number }>({
    queryKey: ["/api/products", { pageSize: "500" }],
    queryFn: async () => {
      const res = await fetch("/api/products?pageSize=500", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
  });

  const { data: collectionsData } = useQuery<{ collections: { id: string; title: string; productsCount: number; productDbIds: string[] }[] }>({
    queryKey: ["/api/marketing/profitability/shopify-collections"],
  });
  const collectionsList = collectionsData?.collections ?? [];

  const allAdditionalProductIds = useMemo(() => {
    return [...new Set(Object.values(multiProductOverrides).flat())];
  }, [multiProductOverrides]);

  const { data: productStatsData } = useQuery<{ stats: ProductOrderStat[] }>({
    queryKey: ["/api/marketing/profitability/product-order-stats", dateParams.dateFrom, dateParams.dateTo, allAdditionalProductIds.join(",")],
    queryFn: async () => {
      if (allAdditionalProductIds.length === 0) return { stats: [] };
      const params = new URLSearchParams();
      if (dateParams.dateFrom) params.set("dateFrom", dateParams.dateFrom);
      if (dateParams.dateTo) params.set("dateTo", dateParams.dateTo);
      params.set("productIds", allAdditionalProductIds.join(","));
      const res = await fetch(`/api/marketing/profitability/product-order-stats?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch product stats");
      return res.json();
    },
    enabled: allAdditionalProductIds.length > 0,
  });

  const productOrderStats = useMemo(() => {
    const map: Record<string, { total: number; dispatched: number; fulfilled: number; delivered: number }> = {};
    for (const stat of productStatsData?.stats ?? []) {
      map[stat.productId] = stat.orders;
    }
    return map;
  }, [productStatsData]);

  const matchMutation = useMutation({
    mutationFn: async ({ campaignId, productId }: { campaignId: string; productId: string | null }) => {
      const res = await apiRequest("PUT", `/api/marketing/profitability/match/${campaignId}`, { productId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/profitability/calculator"] });
      toast({ title: "Product updated", description: "Campaign product match saved." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const rematchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketing/profitability/rematch", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/profitability/calculator"] });
      toast({ title: "Re-matched", description: `${data.matched} ads matched to products.` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const campaigns = calcData?.campaigns ?? [];
  const productsList = productsData?.products ?? [];
  const dRate = parseFloat(dollarRate) || 280;
  const delCharges = parseFloat(deliveryCharges) || 0;
  const packExp = parseFloat(packingExpense) || 0;

  const orderTypeLabel = orderTypeForCalc === "total" ? "Total Orders" : orderTypeForCalc === "dispatched" ? "Dispatched" : orderTypeForCalc === "delivered" ? "Delivered" : orderTypeForCalc === "delivered_plus_dispatch75" ? "Del + (Disp−25%)" : orderTypeForCalc === "total_minus_40" ? "Total − 40%" : "Total − 25%";

  function getOrderCount(orders: CampaignData["orders"]): number {
    if (orderTypeForCalc === "dispatched") return orders.dispatched;
    if (orderTypeForCalc === "delivered") return orders.delivered;
    if (orderTypeForCalc === "delivered_plus_dispatch75") return orders.delivered + Math.round(orders.fulfilled * 0.75);
    if (orderTypeForCalc === "total_minus_40") return Math.round(orders.total * 0.6);
    if (orderTypeForCalc === "total_minus_25") return Math.round(orders.total * 0.75);
    return orders.total;
  }

  const filteredCampaigns = campaigns.filter(c => {
    if (statusFilter === "ALL") return true;
    return c.status === statusFilter;
  }).sort((a, b) => {
    const statusOrder: Record<string, number> = { ACTIVE: 0, PAUSED: 1, ARCHIVED: 2 };
    const sa = statusOrder[a.status] ?? 3;
    const sb = statusOrder[b.status] ?? 3;
    if (sa !== sb) return sa - sb;
    return Number(b.campaignId) - Number(a.campaignId);
  });

  const computedRows = filteredCampaigns.map(c => {
    const overrideProductId = manualOverrides[c.campaignId];
    let product = c.product;
    let matchType = c.matchType;

    if (overrideProductId && overrideProductId !== c.product?.id) {
      const overrideProduct = productsList.find(p => p.id === overrideProductId);
      if (overrideProduct) {
        const variants = overrideProduct.variants as any[];
        let salePrice = 0, costPrice = 0;
        if (variants && Array.isArray(variants) && variants.length > 0) {
          salePrice = parseFloat(variants[0].price || "0");
          costPrice = parseFloat(variants[0].cost || "0");
        }
        product = {
          id: overrideProduct.id,
          title: overrideProduct.title,
          handle: overrideProduct.handle,
          imageUrl: overrideProduct.imageUrl,
          salePrice,
          costPrice,
        };
        matchType = "manual";
      }
    }

    const additionalIds = multiProductOverrides[c.campaignId] ?? [];
    const additionalProducts: AdditionalProduct[] = additionalIds.map(id => {
      const p = productsList.find(x => x.id === id);
      if (!p) return null;
      const variants = (p.variants as any[]) ?? [];
      let salePrice = 0, costPrice = 0;
      if (variants.length > 0) {
        salePrice = parseFloat(variants[0].price || "0");
        costPrice = parseFloat(variants[0].cost || "0");
      }
      return { id, title: p.title, imageUrl: p.imageUrl, salePrice, costPrice };
    }).filter((x): x is AdditionalProduct => x !== null);

    if (additionalProducts.length > 0 && product) {
      let totalRevenue = product.salePrice * c.orders.total;
      let totalCost = product.costPrice * c.orders.total;
      let totalOrdersCount = c.orders.total;
      let totalDispatched = c.orders.dispatched;
      let totalFulfilled = c.orders.fulfilled;
      let totalDelivered = c.orders.delivered;

      for (const ap of additionalProducts) {
        const apStats = productOrderStats[ap.id] ?? { total: 0, dispatched: 0, fulfilled: 0, delivered: 0 };
        totalRevenue += ap.salePrice * apStats.total;
        totalCost += ap.costPrice * apStats.total;
        totalOrdersCount += apStats.total;
        totalDispatched += apStats.dispatched;
        totalFulfilled += apStats.fulfilled;
        totalDelivered += apStats.delivered;
      }

      const blendedSalePrice = totalOrdersCount > 0 ? totalRevenue / totalOrdersCount : product.salePrice;
      const blendedCostPrice = totalOrdersCount > 0 ? totalCost / totalOrdersCount : product.costPrice;
      const combinedOrders = { total: totalOrdersCount, dispatched: totalDispatched, fulfilled: totalFulfilled, delivered: totalDelivered };
      const selectedOrdersCount = getOrderCount(combinedOrders);
      const cpa = selectedOrdersCount > 0 ? (c.adSpend / selectedOrdersCount) * dRate : 0;
      const profitMargin = blendedSalePrice - blendedCostPrice - cpa - delCharges - packExp;
      const netProfit = selectedOrdersCount > 0 ? profitMargin * selectedOrdersCount : -(c.adSpend * dRate);

      return {
        ...c,
        product: { ...product, salePrice: blendedSalePrice, costPrice: blendedCostPrice },
        primaryProduct: product,
        matchType,
        cpa,
        profitMargin,
        netProfit,
        selectedOrders: selectedOrdersCount,
        orders: combinedOrders,
        additionalProducts,
        isMultiProduct: true as const,
      };
    }

    const salePrice = product?.salePrice ?? 0;
    const costPrice = product?.costPrice ?? 0;
    const selectedOrders = getOrderCount(c.orders);
    const cpa = selectedOrders > 0 ? (c.adSpend / selectedOrders) * dRate : 0;
    const profitMargin = salePrice - costPrice - cpa - delCharges - packExp;
    const netProfit = selectedOrders > 0 ? profitMargin * selectedOrders : -(c.adSpend * dRate);

    return {
      ...c,
      product,
      primaryProduct: product,
      matchType,
      cpa,
      profitMargin,
      netProfit,
      selectedOrders,
      additionalProducts: [] as AdditionalProduct[],
      isMultiProduct: false as const,
    };
  });

  const mergedRows = (() => {
    const grouped = new Map<string, typeof computedRows>();
    for (const row of computedRows) {
      const key = row.product?.id ?? `unmatched-${row.campaignId}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.push(row);
      } else {
        grouped.set(key, [row]);
      }
    }
    return Array.from(grouped.values()).map(group => {
      if (group.length === 1) return group[0];
      const first = group[0];
      const mergedAdSpend = group.reduce((s, r) => s + r.adSpend, 0);
      const mergedOrders = first.orders;
      const statusOrder: Record<string, number> = { ACTIVE: 0, PAUSED: 1, ARCHIVED: 2 };
      const bestStatus = group.reduce((best, r) => (statusOrder[r.status] ?? 3) < (statusOrder[best] ?? 3) ? r.status : best, group[0].status);
      const bestMatch = group.some(r => r.matchType === "auto") ? "auto" as const : group.some(r => r.matchType === "name") ? "name" as const : group.some(r => r.matchType === "manual") ? "manual" as const : "unmatched" as const;
      const campaignName = group.map(r => r.campaignName).join(", ");
      const salePrice = first.product?.salePrice ?? 0;
      const costPrice = first.product?.costPrice ?? 0;
      const selectedOrders = getOrderCount(mergedOrders);
      const cpa = selectedOrders > 0 ? (mergedAdSpend / selectedOrders) * dRate : 0;
      const profitMargin = salePrice - costPrice - cpa - delCharges - packExp;
      const netProfit = selectedOrders > 0 ? profitMargin * selectedOrders : -(mergedAdSpend * dRate);
      return {
        ...first,
        campaignName,
        status: bestStatus,
        matchType: bestMatch,
        adSpend: mergedAdSpend,
        orders: mergedOrders,
        selectedOrders,
        cpa,
        profitMargin,
        netProfit,
        additionalProducts: first.additionalProducts,
        isMultiProduct: first.isMultiProduct,
        primaryProduct: first.primaryProduct,
      };
    });
  })();

  const totals = mergedRows.reduce(
    (acc, r) => ({
      adSpend: acc.adSpend + r.adSpend,
      totalOrders: acc.totalOrders + r.orders.total,
      dispatched: acc.dispatched + r.orders.dispatched,
      delivered: acc.delivered + r.orders.delivered,
      netProfit: acc.netProfit + r.netProfit,
    }),
    { adSpend: 0, totalOrders: 0, dispatched: 0, delivered: 0, netProfit: 0 }
  );

  const productSummary = useMemo(() => {
    const map = new Map<string, {
      productId: string;
      title: string;
      imageUrl: string | null;
      salePrice: number;
      costPrice: number;
      adSpend: number;
      orders: number;
      dispatched: number;
      delivered: number;
      netProfit: number;
      campaignCount: number;
      roas: number;
    }>();

    for (const row of computedRows) {
      if (!row.product) continue;
      const key = row.product.id;
      const existing = map.get(key);
      const selectedOrders = getOrderCount(row.orders);
      const rowCpa = selectedOrders > 0 ? (row.adSpend / selectedOrders) * dRate : 0;
      const rowProfit = selectedOrders > 0
        ? (row.product.salePrice - row.product.costPrice - rowCpa - delCharges - packExp) * selectedOrders
        : -(row.adSpend * dRate);
      if (existing) {
        existing.adSpend += row.adSpend;
        existing.orders += row.orders.total;
        existing.dispatched += row.orders.dispatched;
        existing.delivered += row.orders.delivered;
        existing.netProfit += rowProfit;
        existing.campaignCount += 1;
        const totalRevenue = existing.salePrice * existing.orders;
        const totalSpend = existing.adSpend * dRate;
        existing.roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
      } else {
        const spendPkr = row.adSpend * dRate;
        const revenue = row.product.salePrice * row.orders.total;
        map.set(key, {
          productId: key,
          title: row.product.title,
          imageUrl: row.product.imageUrl,
          salePrice: row.product.salePrice,
          costPrice: row.product.costPrice,
          adSpend: row.adSpend,
          orders: row.orders.total,
          dispatched: row.orders.dispatched,
          delivered: row.orders.delivered,
          netProfit: rowProfit,
          campaignCount: 1,
          roas: spendPkr > 0 ? revenue / spendPkr : 0,
        });
      }
    }

    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      if (productSortBy === "netProfit") return b.netProfit - a.netProfit;
      if (productSortBy === "adSpend") return b.adSpend - a.adSpend;
      if (productSortBy === "orders") return b.orders - a.orders;
      if (productSortBy === "roas") return b.roas - a.roas;
      return 0;
    });
    return arr;
  }, [computedRows, dRate, productSortBy, delCharges, packExp, orderTypeForCalc]);

  const handleProductOverride = (campaignId: string, productId: string) => {
    if (productId === "none") {
      setManualOverrides(prev => { const n = { ...prev }; delete n[campaignId]; return n; });
      matchMutation.mutate({ campaignId, productId: null });
    } else {
      setManualOverrides(prev => ({ ...prev, [campaignId]: productId }));
      matchMutation.mutate({ campaignId, productId });
    }
  };

  const openMultiSelectDialog = (campaignId: string, primaryProductId: string | null) => {
    const existing = multiProductOverrides[campaignId] ?? [];
    setTempSelection(existing);
    setProductSearch("");
    setCollectionTab("products");
    setMultiSelectDialog(campaignId);
  };

  const handleApplyMultiSelect = (campaignId: string) => {
    setMultiProductOverrides(prev => {
      if (tempSelection.length === 0) {
        const n = { ...prev };
        delete n[campaignId];
        return n;
      }
      return { ...prev, [campaignId]: tempSelection };
    });
    setMultiSelectDialog(null);
  };

  const toggleProductInTempSelection = (productId: string) => {
    setTempSelection(prev =>
      prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
    );
  };

  const toggleCollectionInTempSelection = (col: { productDbIds: string[] }, primaryProductId: string | null) => {
    const colIds = col.productDbIds.filter(id => id !== primaryProductId);
    const allSelected = colIds.every(id => tempSelection.includes(id));
    if (allSelected) {
      setTempSelection(prev => prev.filter(id => !colIds.includes(id)));
    } else {
      setTempSelection(prev => [...new Set([...prev, ...colIds])]);
    }
  };

  function handleSignalClick(campaignId: string, campaignName: string, signal: Signal) {
    setSignalNote("");
    setSignalWindow("48");
    setSignalModal({ campaignId, campaignName, signal });
  }

  function handleSignalConfirm() {
    if (!signalModal) return;
    const row = computedRows.find(r => r.campaignId === signalModal.campaignId);
    const snapshotBefore = row ? {
      spend_total: row.adSpend * dRate,
      net_profit_total: row.netProfit,
      cpa: row.cpa,
      margin_percent: row.product ? ((row.profitMargin / row.product.salePrice) * 100) : 0,
      delivered_count: row.orders.delivered,
      orders_count: row.orders.total,
      timestamp: new Date().toISOString(),
    } : null;

    signalMutation.mutate({
      campaignKey: signalModal.campaignId,
      actionType: "Signal Decision",
      selectedSignal: signalModal.signal,
      expectedOutcome: "",
      evaluationWindowHours: parseInt(signalWindow),
      notes: signalNote || null,
      snapshotBefore,
    });
  }

  const signalSuggestions: Record<Signal, string> = {
    Scale: "Scale carefully (+10\u201320%) after evaluation window if results confirm.",
    Watch: "Hold changes. Wait for evidence / evaluation window.",
    Risk: "Reduce exposure (-30%) or pause after evaluation confirms negative leverage.",
  };

  const campaignMetricsForJourney: CampaignMetrics[] = useMemo(() => {
    return computedRows.map(r => ({
      campaignId: r.campaignId,
      campaignName: r.campaignName,
      spend_total: r.adSpend * dRate,
      net_profit_total: r.netProfit,
      cpa: r.cpa,
      margin_percent: r.product ? ((r.profitMargin / (r.product.salePrice || 1)) * 100) : 0,
      delivered_count: r.orders.delivered,
      orders_count: r.orders.total,
    }));
  }, [computedRows, dRate]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-ads-profitability">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Ads Profitability Calculator
          </h1>
          <p className="text-muted-foreground">
            Campaign data pulled from Facebook Ads. Products auto-matched from destination URLs.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => rematchMutation.mutate()}
          disabled={rematchMutation.isPending}
          data-testid="button-rematch"
        >
          {rematchMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Re-match Products
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Calculation Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dollar-rate">USD to PKR Rate</Label>
              <div className="relative">
                <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="dollar-rate"
                  type="number"
                  value={dollarRate}
                  onChange={(e) => setDollarRate(e.target.value)}
                  className="pl-8"
                  placeholder="280"
                  data-testid="input-dollar-rate"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delivery-charges">Delivery Charges (per order)</Label>
              <div className="relative">
                <Truck className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="delivery-charges"
                  type="number"
                  value={deliveryCharges}
                  onChange={(e) => setDeliveryCharges(e.target.value)}
                  className="pl-8"
                  placeholder="0"
                  data-testid="input-delivery-charges"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="packing-expense">Packing Expense (per order)</Label>
              <div className="relative">
                <Package className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="packing-expense"
                  type="number"
                  value={packingExpense}
                  onChange={(e) => setPackingExpense(e.target.value)}
                  className="pl-8"
                  placeholder="0"
                  data-testid="input-packing-expense"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  Date Range
                </Label>
                <DateRangePicker
                  dateRange={dateRange}
                  onDateRangeChange={setDateRange}
                  align="start"
                  className="w-full"
                />
                <div className="flex flex-wrap gap-1 pt-1">
                  {[
                    { label: "7D", days: 7 },
                    { label: "14D", days: 14 },
                    { label: "30D", days: 30 },
                    { label: "90D", days: 90 },
                    { label: "All", days: 0 },
                  ].map(({ label, days }) => (
                    <button
                      key={label}
                      className="text-[10px] px-2 py-0.5 rounded border hover:bg-muted transition-colors"
                      onClick={() => {
                        if (days === 0) {
                          setDateRange(undefined);
                        } else {
                          const to = new Date();
                          const from = new Date();
                          from.setDate(from.getDate() - days);
                          setDateRange({ from, to });
                        }
                      }}
                      data-testid={`button-period-${label.toLowerCase()}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5" />
                  Campaign Status
                </Label>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                  <SelectTrigger data-testid="select-status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Campaigns</SelectItem>
                    <SelectItem value="ACTIVE">Active Only</SelectItem>
                    <SelectItem value="PAUSED">Paused Only</SelectItem>
                    <SelectItem value="ARCHIVED">Archived Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <ListOrdered className="w-3.5 h-3.5" />
                  Orders Used in CPA & Profit
                </Label>
                <Select value={orderTypeForCalc} onValueChange={(v) => setOrderTypeForCalc(v as OrderTypeForCalc)}>
                  <SelectTrigger data-testid="select-order-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total">Total Orders</SelectItem>
                    <SelectItem value="dispatched">Dispatched</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="delivered_plus_dispatch75">Delivered + (Dispatched − 25%)</SelectItem>
                    <SelectItem value="total_minus_40">Total − 40%</SelectItem>
                    <SelectItem value="total_minus_25">Total − 25%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Target className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium mb-1">No Facebook campaigns found</p>
            <p className="text-sm">Make sure your Facebook Ads are connected in Settings and data has been synced.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-[75vh]">
            <table className="w-full text-sm border-collapse table-fixed">
              <colgroup>
                <col style={{width: "6%"}} />
                <col style={{width: "16%"}} />
                <col style={{width: "12%"}} />
                <col style={{width: "6%"}} />
                <col style={{width: "6%"}} />
                <col style={{width: "6%"}} />
                <col style={{width: "5%"}} />
                <col style={{width: "7%"}} />
                <col style={{width: "6%"}} />
                <col style={{width: "7%"}} />
                <col style={{width: "8%"}} />
                <col style={{width: "10%"}} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[#0d1322]">
                <tr className="border-b border-white/[0.06]">
                  <th className="text-center text-white/40 text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5 border border-white/[0.06] whitespace-nowrap overflow-hidden">Status</th>
                  <th className="text-left text-white/40 text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5 border border-white/[0.06] truncate overflow-hidden">Campaign</th>
                  <th className="text-left text-white/40 text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5 border border-white/[0.06] truncate overflow-hidden">Product</th>
                  <th className="text-right text-white/40 text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5 border border-white/[0.06] whitespace-nowrap overflow-hidden">Sale Price</th>
                  <th className="text-right text-white/40 text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5 border border-white/[0.06] whitespace-nowrap overflow-hidden">Cost Price</th>
                  <th className="text-right text-white/40 text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5 border border-white/[0.06] whitespace-nowrap overflow-hidden">Ad Spend</th>
                  <th className="text-right text-white/40 text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5 border border-white/[0.06] whitespace-nowrap overflow-hidden">Orders</th>
                  <th className="text-right text-white/40 text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5 border border-white/[0.06] whitespace-nowrap overflow-hidden">Dispatched</th>
                  <th className="text-right text-white/40 text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5 border border-white/[0.06] whitespace-nowrap overflow-hidden">Delivered</th>
                  <th className="text-right text-white/40 text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5 border border-white/[0.06] whitespace-nowrap overflow-hidden">CPA (PKR)</th>
                  <th className="text-right text-white/40 text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5 border border-white/[0.06] whitespace-nowrap overflow-hidden">Profit Margin</th>
                  <th className="text-right text-white/40 text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5 border border-white/[0.06] whitespace-nowrap overflow-hidden">Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {mergedRows.map((row, idx) => (
                  <tr key={row.campaignId} className="hover:bg-blue-500/[0.06] transition-colors" data-testid={`row-campaign-${row.campaignId}`}>
                    <td className="border border-border px-2 py-1 text-xs text-center" data-testid={`text-status-${row.campaignId}`}>
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="border border-border px-2 py-1 text-xs overflow-hidden truncate">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-medium truncate block" data-testid={`text-campaign-name-${row.campaignId}`}>
                          {row.campaignName}
                        </span>
                        <div className="flex gap-1" data-testid={`signal-buttons-${row.campaignId}`}>
                          {(["Scale", "Watch", "Risk"] as Signal[]).map(sig => {
                            const active = currentSignals.get(row.campaignId);
                            const isActive = active === sig;
                            const colors: Record<Signal, { base: string; active: string }> = {
                              Scale: { base: "border-green-400 text-green-600 hover:bg-green-50 dark:hover:bg-green-950", active: "bg-green-500 text-white border-green-500" },
                              Watch: { base: "border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950", active: "bg-amber-500 text-white border-amber-500" },
                              Risk: { base: "border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-950", active: "bg-red-500 text-white border-red-500" },
                            };
                            return (
                              <button
                                key={sig}
                                onClick={(e) => { e.stopPropagation(); handleSignalClick(row.campaignId, row.campaignName, sig); }}
                                className={`px-1.5 py-0 text-[9px] leading-4 rounded-full border transition-colors ${isActive ? colors[sig].active : colors[sig].base}`}
                                data-testid={`button-signal-${sig.toLowerCase()}-${row.campaignId}`}
                              >
                                {sig}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </td>
                    <td className="border border-border px-2 py-1 text-xs overflow-hidden">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <MatchIndicator type={row.matchType} />
                          <Popover
                            open={openCombobox === row.campaignId}
                            onOpenChange={(open) => setOpenCombobox(open ? row.campaignId : null)}
                          >
                            <PopoverTrigger asChild>
                              {row.primaryProduct ? (
                                <button
                                  className="flex items-center gap-1.5 min-w-0 group cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-accent transition-colors"
                                  data-testid={`button-product-${row.campaignId}`}
                                >
                                  <Avatar className="h-5 w-5 rounded flex-shrink-0">
                                    <AvatarImage src={row.primaryProduct.imageUrl || undefined} alt={row.primaryProduct.title} />
                                    <AvatarFallback className="rounded text-[8px]">
                                      {row.primaryProduct.title.charAt(0)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-xs truncate" data-testid={`text-product-${row.campaignId}`}>
                                    {row.primaryProduct.title}
                                  </span>
                                </button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-[11px] justify-between font-normal text-muted-foreground"
                                  data-testid={`button-select-product-${row.campaignId}`}
                                >
                                  <Search className="w-3 h-3 mr-1" />
                                  Select...
                                </Button>
                              )}
                            </PopoverTrigger>
                            <PopoverContent className="w-[280px] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Type product name..." data-testid={`input-search-product-${row.campaignId}`} />
                                <CommandList>
                                  <CommandEmpty>No products found.</CommandEmpty>
                                  <CommandGroup>
                                    {row.primaryProduct && (
                                      <CommandItem
                                        value="__clear__"
                                        onSelect={() => {
                                          handleProductOverride(row.campaignId, "none");
                                          setOpenCombobox(null);
                                        }}
                                        className="text-muted-foreground"
                                        data-testid={`button-clear-product-${row.campaignId}`}
                                      >
                                        <X className="w-3.5 h-3.5 mr-2" />
                                        Clear selection
                                      </CommandItem>
                                    )}
                                    {productsList.map((p) => (
                                      <CommandItem
                                        key={p.id}
                                        value={p.title}
                                        onSelect={() => {
                                          handleProductOverride(row.campaignId, p.id);
                                          setOpenCombobox(null);
                                        }}
                                        data-testid={`option-product-${row.campaignId}-${p.id}`}
                                      >
                                        <Avatar className="h-6 w-6 rounded flex-shrink-0">
                                          <AvatarImage src={p.imageUrl || undefined} alt={p.title} />
                                          <AvatarFallback className="rounded text-[9px]">
                                            {p.title.charAt(0)}
                                          </AvatarFallback>
                                        </Avatar>
                                        <span className="truncate">{p.title}</span>
                                        {row.primaryProduct?.id === p.id && (
                                          <Check className="w-3.5 h-3.5 ml-auto text-green-500 flex-shrink-0" />
                                        )}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                        {row.primaryProduct && (
                          <div className="flex items-center gap-1.5 pl-5 mt-0.5">
                            {row.additionalProducts.length > 0 && (
                              <span className="text-[10px] text-blue-500 font-medium">
                                +{row.additionalProducts.length} more (blended)
                              </span>
                            )}
                            <button
                              onClick={() => openMultiSelectDialog(row.campaignId, row.primaryProduct?.id ?? null)}
                              className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                              data-testid={`button-manage-products-${row.campaignId}`}
                            >
                              {row.additionalProducts.length > 0 ? (
                                <><Pencil className="w-2.5 h-2.5" /> Edit</>
                              ) : (
                                <><Plus className="w-2.5 h-2.5" /> Add products</>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="border border-border px-2 py-1 text-xs text-right tabular-nums whitespace-nowrap" data-testid={`text-sale-price-${row.campaignId}`}>
                      {row.product ? (
                        <div>
                          {row.isMultiProduct && <div className="text-[9px] text-muted-foreground">Blended avg</div>}
                          {formatCurrency(row.product.salePrice)}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="border border-border px-2 py-1 text-xs text-right tabular-nums whitespace-nowrap" data-testid={`text-cost-price-${row.campaignId}`}>
                      {row.product ? (
                        <div>
                          {row.isMultiProduct && <div className="text-[9px] text-muted-foreground">Blended avg</div>}
                          {formatCurrency(row.product.costPrice)}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="border border-border px-2 py-1 text-xs text-right tabular-nums font-medium whitespace-nowrap" data-testid={`text-ad-spend-${row.campaignId}`}>
                      {formatUsd(row.adSpend)}
                    </td>
                    <td className="border border-border px-2 py-1 text-xs text-right tabular-nums whitespace-nowrap" data-testid={`text-total-orders-${row.campaignId}`}>
                      {row.orders.total}
                    </td>
                    <td className="border border-border px-2 py-1 text-xs text-right tabular-nums whitespace-nowrap" data-testid={`text-dispatched-${row.campaignId}`}>
                      {row.orders.dispatched}
                    </td>
                    <td className="border border-border px-2 py-1 text-xs text-right tabular-nums whitespace-nowrap" data-testid={`text-delivered-${row.campaignId}`}>
                      {row.orders.delivered}
                    </td>
                    <td className="border border-border px-2 py-1 text-xs text-right tabular-nums whitespace-nowrap" data-testid={`text-cpa-${row.campaignId}`}>
                      {row.orders.total > 0 ? formatCurrency(row.cpa) : "—"}
                    </td>
                    <td className="border border-border px-2 py-1 text-xs text-right whitespace-nowrap" data-testid={`text-profit-margin-${row.campaignId}`}>
                      {row.product ? (
                        <span className={`tabular-nums font-medium ${row.profitMargin >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {formatCurrency(row.profitMargin)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="border border-border px-2 py-1 text-xs text-right whitespace-nowrap" data-testid={`text-net-profit-${row.campaignId}`}>
                      {row.product ? (
                        <span className={`tabular-nums font-semibold flex items-center justify-end gap-1 ${row.netProfit >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {row.netProfit >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {formatCurrency(row.netProfit)}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
                {mergedRows.length > 0 && (
                  <tr className="bg-white/[0.04] font-semibold">
                    <td className="border border-border px-2 py-1.5 text-xs"></td>
                    <td className="border border-border px-2 py-1.5 text-xs font-semibold">Totals</td>
                    <td className="border border-border px-2 py-1.5 text-xs"></td>
                    <td className="border border-border px-2 py-1.5 text-xs"></td>
                    <td className="border border-border px-2 py-1.5 text-xs"></td>
                    <td className="border border-border px-2 py-1.5 text-xs text-right tabular-nums whitespace-nowrap" data-testid="text-total-ad-spend">
                      {formatUsd(totals.adSpend)}
                    </td>
                    <td className="border border-border px-2 py-1.5 text-xs text-right tabular-nums whitespace-nowrap" data-testid="text-total-all-orders">
                      {totals.totalOrders}
                    </td>
                    <td className="border border-border px-2 py-1.5 text-xs text-right tabular-nums whitespace-nowrap" data-testid="text-total-dispatched">
                      {totals.dispatched}
                    </td>
                    <td className="border border-border px-2 py-1.5 text-xs text-right tabular-nums whitespace-nowrap" data-testid="text-total-delivered">
                      {totals.delivered}
                    </td>
                    <td className="border border-border px-2 py-1.5 text-xs"></td>
                    <td className="border border-border px-2 py-1.5 text-xs"></td>
                    <td className="border border-border px-2 py-1.5 text-xs text-right whitespace-nowrap" data-testid="text-total-net-profit">
                      <span className={`tabular-nums ${totals.netProfit >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {formatCurrency(totals.netProfit)}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {computedRows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="bg-[#0d1322] border-white/[0.08]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-xs text-white/40 uppercase tracking-wider mb-1">
                <DollarSign className="w-4 h-4 text-amber-400" />
                Total Ad Spend
              </div>
              <p className="text-xl font-bold tabular-nums text-amber-400" data-testid="text-summary-ad-spend">
                {formatUsd(totals.adSpend)}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-[#0d1322] border-white/[0.08]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-xs text-white/40 uppercase tracking-wider mb-1">
                <ShoppingCart className="w-4 h-4 text-blue-400" />
                Total Orders
              </div>
              <p className="text-xl font-bold tabular-nums text-white/90" data-testid="text-summary-total-orders">
                {totals.totalOrders}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-[#0d1322] border-white/[0.08]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-xs text-white/40 uppercase tracking-wider mb-1">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                Total Delivered
              </div>
              <p className="text-xl font-bold tabular-nums text-white/90" data-testid="text-summary-delivered">
                {totals.delivered}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-[#0d1322] border-white/[0.08]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-xs text-white/40 uppercase tracking-wider mb-1">
                {totals.netProfit >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                Net Profit
              </div>
              <p className={`text-xl font-bold tabular-nums ${totals.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`} data-testid="text-summary-net-profit">
                {formatCurrency(totals.netProfit)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {productSummary.length > 0 && (
        <Card data-testid="card-product-summary">
          <CardHeader className="pb-2">
            <button
              className="flex items-center justify-between w-full"
              onClick={() => setShowProductSummary(!showProductSummary)}
              data-testid="button-toggle-product-summary"
            >
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Product-Level Breakdown ({productSummary.length} products)
              </CardTitle>
              {showProductSummary ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </CardHeader>
          {showProductSummary && (
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Sort by</Label>
                <Select value={productSortBy} onValueChange={(v) => setProductSortBy(v as typeof productSortBy)}>
                  <SelectTrigger className="h-7 text-xs w-[140px]" data-testid="select-product-sort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="netProfit">Net Profit</SelectItem>
                    <SelectItem value="adSpend">Ad Spend</SelectItem>
                    <SelectItem value="orders">Orders</SelectItem>
                    <SelectItem value="roas">ROAS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.04] border-b border-white/[0.06]">
                    <tr>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">Product</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">Campaigns</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">Ad Spend</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">Orders</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">Delivered</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">CPA</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">ROAS</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">Net Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productSummary.map((p) => {
                      const cpa = p.orders > 0 ? (p.adSpend * dRate) / p.orders : 0;
                      return (
                        <tr key={p.productId} className="border-t border-white/[0.06] hover:bg-blue-500/[0.06]" data-testid={`row-product-${p.productId}`}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6 rounded flex-shrink-0">
                                <AvatarImage src={p.imageUrl || undefined} alt={p.title} />
                                <AvatarFallback className="rounded text-[8px]">{p.title.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <span className="text-xs font-medium truncate max-w-[200px]" data-testid={`text-product-title-${p.productId}`}>{p.title}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{p.campaignCount}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{formatUsd(p.adSpend)}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{p.orders}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{p.delivered}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{formatCurrency(cpa)}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">
                            <Badge variant={p.roas >= 2 ? "default" : p.roas >= 1 ? "secondary" : "destructive"} className="text-[10px] px-1.5">
                              {p.roas.toFixed(2)}x
                            </Badge>
                          </td>
                          <td className={`px-3 py-2 text-right text-xs font-medium tabular-nums ${p.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {formatCurrency(p.netProfit)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {campaigns.length > 0 && (
        <CampaignJourney campaignMetrics={campaignMetricsForJourney} />
      )}

      <Dialog open={!!signalModal} onOpenChange={(open) => { if (!open) setSignalModal(null); }}>
        <DialogContent className="max-w-md" data-testid="dialog-signal-confirm">
          <DialogHeader>
            <DialogTitle>Confirm Signal Decision</DialogTitle>
          </DialogHeader>
          {signalModal && (
            <div className="space-y-4">
              <div>
                <Label className="text-muted-foreground text-xs">Campaign</Label>
                <p className="text-sm font-medium" data-testid="text-signal-campaign">{signalModal.campaignName}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Selected Signal</Label>
                <div className="mt-1">
                  <Badge variant="secondary" className="text-xs" data-testid="badge-signal-selected">
                    {signalModal.signal}
                  </Badge>
                </div>
              </div>
              <div className="bg-muted/50 rounded-md p-3">
                <p className="text-xs text-muted-foreground" data-testid="text-signal-suggestion">
                  {signalSuggestions[signalModal.signal]}
                </p>
              </div>
              {signalModal.signal === "Risk" && (() => {
                const metrics = campaignMetricsForJourney.find(m => m.campaignId === signalModal.campaignId);
                if (metrics && !isEvidenceReady(metrics)) {
                  return (
                    <div className="flex items-start gap-2 p-3 bg-muted rounded-md border" data-testid="warning-low-evidence">
                      <AlertTriangle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground">
                        Low evidence: new campaigns should usually stay Watch until threshold.
                      </p>
                    </div>
                  );
                }
                return null;
              })()}
              <div className="space-y-1.5">
                <Label className="text-xs">Evaluation Window</Label>
                <Select value={signalWindow} onValueChange={setSignalWindow}>
                  <SelectTrigger data-testid="select-signal-window">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">24 hours</SelectItem>
                    <SelectItem value="48">48 hours (default)</SelectItem>
                    <SelectItem value="72">72 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Note (optional, max 120 chars)</Label>
                <Input
                  value={signalNote}
                  onChange={(e) => setSignalNote(e.target.value.slice(0, 120))}
                  placeholder="Brief note..."
                  maxLength={120}
                  data-testid="input-signal-note"
                />
                <p className="text-[10px] text-muted-foreground text-right">{signalNote.length}/120</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignalModal(null)} data-testid="button-signal-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleSignalConfirm}
              disabled={signalMutation.isPending}
              data-testid="button-signal-confirm"
            >
              {signalMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Multi-product select dialog */}
      {(() => {
        const dialogRow = multiSelectDialog ? mergedRows.find(r => r.campaignId === multiSelectDialog) : null;
        if (!dialogRow) return null;
        const primaryId = dialogRow.primaryProduct?.id ?? null;
        const filteredProducts = productsList.filter(p =>
          p.id !== primaryId &&
          p.title.toLowerCase().includes(productSearch.toLowerCase())
        );
        const totalSelected = tempSelection.length;
        return (
          <Dialog open={!!multiSelectDialog} onOpenChange={(open) => { if (!open) setMultiSelectDialog(null); }}>
            <DialogContent className="max-w-lg max-h-[85vh] flex flex-col" data-testid="dialog-multi-product">
              <DialogHeader>
                <DialogTitle className="text-base">Manage Products for Campaign</DialogTitle>
                <p className="text-xs text-muted-foreground truncate">{dialogRow.campaignName}</p>
              </DialogHeader>

              <div className="flex border-b mb-2">
                <button
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${collectionTab === "products" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setCollectionTab("products")}
                  data-testid="tab-products"
                >
                  Products
                </button>
                {collectionsList.length > 0 && (
                  <button
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${collectionTab === "collections" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setCollectionTab("collections")}
                    data-testid="tab-collections"
                  >
                    Collections ({collectionsList.length})
                  </button>
                )}
              </div>

              {collectionTab === "products" && (
                <div className="flex flex-col gap-2 min-h-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="Search products..."
                        className="pl-8 h-8 text-sm"
                        data-testid="input-multiselect-search"
                      />
                    </div>
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                      onClick={() => {
                        const allIds = filteredProducts.map(p => p.id);
                        const allSelected = allIds.every(id => tempSelection.includes(id));
                        if (allSelected) {
                          setTempSelection(prev => prev.filter(id => !allIds.includes(id)));
                        } else {
                          setTempSelection(prev => [...new Set([...prev, ...allIds])]);
                        }
                      }}
                      data-testid="button-select-all"
                    >
                      {filteredProducts.every(p => tempSelection.includes(p.id)) && filteredProducts.length > 0 ? "Deselect All" : "Select All"}
                    </button>
                  </div>

                  {primaryId && (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/40 border border-border/50">
                      <div className="w-4 h-4 rounded border-2 border-primary bg-primary flex items-center justify-center flex-shrink-0">
                        <Check className="w-2.5 h-2.5 text-primary-foreground" />
                      </div>
                      <Avatar className="h-5 w-5 rounded flex-shrink-0">
                        <AvatarImage src={dialogRow.primaryProduct?.imageUrl || undefined} />
                        <AvatarFallback className="rounded text-[7px]">{dialogRow.primaryProduct?.title.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground truncate flex-1">{dialogRow.primaryProduct?.title}</span>
                      <span className="text-[10px] text-muted-foreground">Primary</span>
                    </div>
                  )}

                  <div className="overflow-y-auto flex-1 space-y-0.5 pr-1" style={{ maxHeight: "340px" }}>
                    {filteredProducts.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">No products found</p>
                    )}
                    {filteredProducts.map(p => {
                      const checked = tempSelection.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => toggleProductInTempSelection(p.id)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors hover:bg-accent ${checked ? "bg-accent/50" : ""}`}
                          data-testid={`checkbox-product-${p.id}`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${checked ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
                            {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                          </div>
                          <Avatar className="h-5 w-5 rounded flex-shrink-0">
                            <AvatarImage src={p.imageUrl || undefined} alt={p.title} />
                            <AvatarFallback className="rounded text-[7px]">{p.title.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs truncate flex-1">{p.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {collectionTab === "collections" && (
                <div className="overflow-y-auto flex-1 space-y-2 pr-1" style={{ maxHeight: "400px" }}>
                  {collectionsList.map(col => {
                    const colIds = col.productDbIds.filter(id => id !== primaryId);
                    const selectedCount = colIds.filter(id => tempSelection.includes(id)).length;
                    const allSelected = colIds.length > 0 && selectedCount === colIds.length;
                    return (
                      <button
                        key={col.id}
                        onClick={() => toggleCollectionInTempSelection(col, primaryId)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors hover:bg-accent ${allSelected ? "border-primary bg-accent/50" : "border-border"}`}
                        data-testid={`button-collection-${col.id}`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${allSelected ? "border-primary bg-primary" : selectedCount > 0 ? "border-primary bg-primary/20" : "border-muted-foreground/40"}`}>
                          {allSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                          {!allSelected && selectedCount > 0 && <div className="w-2 h-2 rounded-sm bg-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{col.title}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {col.productsCount} products
                            {selectedCount > 0 && ` · ${selectedCount} selected`}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <DialogFooter className="flex items-center justify-between border-t pt-3 mt-1">
                <span className="text-xs text-muted-foreground" data-testid="text-selected-count">
                  {totalSelected > 0 ? `${totalSelected} additional product${totalSelected === 1 ? "" : "s"} selected` : "No additional products"}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setMultiSelectDialog(null)}>Cancel</Button>
                  <Button size="sm" onClick={() => handleApplyMultiSelect(multiSelectDialog!)} data-testid="button-apply-multiselect">
                    Apply
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      <Card data-testid="card-column-guide">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="w-4 h-4" />
            Column Guide & Formulas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <div>
            <h3 className="font-semibold mb-2 text-base">Settings</h3>
            <div className="grid gap-2 text-muted-foreground">
              <p><span className="font-medium text-foreground">USD to PKR Rate</span> — The exchange rate used to convert Facebook ad spend (in USD) to Pakistani Rupees. Update this to match the current market rate.</p>
              <p><span className="font-medium text-foreground">Delivery Charges</span> — The courier/shipping cost you pay per order. Deducted from each order's profit calculation.</p>
              <p><span className="font-medium text-foreground">Packing Expense</span> — Any packaging cost per order (boxes, tape, labels, etc.). Deducted from each order's profit calculation.</p>
              <p><span className="font-medium text-foreground">Date Range</span> — Filters both ad spend (from Facebook insights) and Shopify orders to the selected date range. Use presets like "Last 7 days" or "Last 30 days" for quick selection, or choose a custom range from the calendar. Set to "All dates" to include everything.</p>
              <p><span className="font-medium text-foreground">Campaign Status</span> — Filter which campaigns are shown: All, Active only, Paused only, or Archived only.</p>
              <p><span className="font-medium text-foreground">Orders Used in CPA & Profit</span> — Choose which order count to use in CPA and Net Profit formulas: Total Orders (all orders), Dispatched (all shipped out), Delivered (confirmed delivery), Del + (Disp−25%) which adds Delivered count plus 75% of Fulfilled-only orders, Total − 40% (60% of total orders, accounting for 40% drop-off), or Total − 25% (75% of total orders, accounting for 25% drop-off).</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3 text-base">Table Columns</h3>
            <div className="grid gap-3 text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">Campaign</p>
                <p>The Facebook/Meta ad campaign name. This is pulled directly from your connected Facebook Ads account during sync. The status badge shows whether the campaign is Active, Paused, or Archived. The URL below shows the destination link from the ad creative.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Product</p>
                <p>The Shopify product linked to this campaign. Products are auto-matched by extracting the destination URL from the ad creative and matching the product handle (URL slug) against your Shopify catalog. A <span className="inline-flex items-center gap-1"><Zap className="w-3 h-3 text-green-500 inline" /></span> icon means it was auto-matched, <span className="inline-flex items-center gap-1"><Hand className="w-3 h-3 text-blue-500 inline" /></span> means you manually selected it, and <span className="inline-flex items-center gap-1"><HelpCircle className="w-3 h-3 inline" /></span> means no product has been matched yet. Click on any product (or the "Search product..." button) to search and select a different product.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Ad Spend</p>
                <p>Total amount spent on this campaign in USD, pulled from Facebook Ads insights. This is filtered by the date range selected at the top of the page.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Orders</p>
                <p>Total number of Shopify orders that contain the matched product within the selected date range. This counts all orders regardless of their fulfillment status.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Dispatched</p>
                <p>Orders that have left the warehouse. This includes orders with status: Fulfilled, Delivered, or Return (since returned orders were dispatched before being returned).</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Delivered</p>
                <p>Orders that have been successfully delivered to the customer. Only orders with "Delivered" status are counted here.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">CPA (Cost Per Acquisition)</p>
                <p>How much it costs you in PKR to acquire one order through this campaign. The order count used in this formula depends on your "Orders Used in CPA & Profit" setting (currently: <span className="font-medium text-foreground">{orderTypeLabel}</span>).</p>
                <p className="mt-1 font-mono text-xs bg-muted rounded px-2 py-1 inline-block">CPA = (Ad Spend USD ÷ {orderTypeLabel}) × Dollar Rate</p>
                <p className="mt-1">Example: If you spent $50 on ads and got 10 orders at a rate of Rs. 280/$ → CPA = ($50 ÷ 10) × 280 = Rs. 1,400 per order.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Profit Margin</p>
                <p>The per-unit profit (or loss) on each order after deducting all costs from the sale price.</p>
                <p className="mt-1 font-mono text-xs bg-muted rounded px-2 py-1 inline-block">Profit Margin = Sale Price − Cost Price − CPA − Delivery Charges − Packing Expense</p>
                <p className="mt-1">Sale Price and Cost Price are taken from the first variant of the matched Shopify product. A <span className="text-green-600 font-medium">green</span> value means you're making profit per order, <span className="text-red-600 font-medium">red</span> means a loss.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Net Profit</p>
                <p>The total profit (or loss) for the entire campaign — how much money this campaign actually made or lost you. Uses the same order count as CPA (currently: <span className="font-medium text-foreground">{orderTypeLabel}</span>).</p>
                <p className="mt-1 font-mono text-xs bg-muted rounded px-2 py-1 inline-block">Net Profit = Profit Margin × {orderTypeLabel}</p>
                <p className="mt-1">This is the bottom line. <span className="text-green-600 font-medium">Green with ↑</span> means the campaign is profitable, <span className="text-red-600 font-medium">Red with ↓</span> means it's losing money and you should consider optimizing or pausing it.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
