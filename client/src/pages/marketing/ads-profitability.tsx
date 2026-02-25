import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDateRange } from "@/contexts/date-range-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Plus,
  Trash2,
  Calculator,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Truck,
  CheckCircle,
  Loader2,
} from "lucide-react";
import type { AdProfitabilityEntry, Product } from "@shared/schema";

interface ProductStats {
  totalOrders: number;
  dispatched: number;
  delivered: number;
  salePrice: number;
  costPrice: number;
  productTitle: string;
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

export default function AdsProfitability() {
  const { toast } = useToast();
  const { dateParams } = useDateRange();

  const [dollarRate, setDollarRate] = useState<string>("280");
  const [deliveryCharges, setDeliveryCharges] = useState<string>("0");
  const [packingExpense, setPackingExpense] = useState<string>("0");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("shipflow-profitability-settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.dollarRate) setDollarRate(parsed.dollarRate);
        if (parsed.deliveryCharges) setDeliveryCharges(parsed.deliveryCharges);
        if (parsed.packingExpense) setPackingExpense(parsed.packingExpense);
      }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "shipflow-profitability-settings",
      JSON.stringify({ dollarRate, deliveryCharges, packingExpense })
    );
  }, [dollarRate, deliveryCharges, packingExpense]);

  const { data: entriesData, isLoading: entriesLoading } = useQuery<{ entries: AdProfitabilityEntry[] }>({
    queryKey: ["/api/marketing/profitability"],
  });

  const { data: productsData } = useQuery<{ products: Product[]; total: number }>({
    queryKey: ["/api/products", { pageSize: "500" }],
    queryFn: async () => {
      const res = await fetch("/api/products?pageSize=500", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
  });

  const entries = entriesData?.entries ?? [];
  const productsList = productsData?.products ?? [];

  const productIds = useMemo(
    () => entries.map((e) => e.productId).filter(Boolean).join(","),
    [entries]
  );

  const { data: statsData, isLoading: statsLoading } = useQuery<{ stats: Record<string, ProductStats> }>({
    queryKey: ["/api/marketing/profitability/stats", productIds, dateParams.dateFrom, dateParams.dateTo],
    queryFn: async () => {
      if (!productIds) return { stats: {} };
      const params = new URLSearchParams();
      params.set("productIds", productIds);
      if (dateParams.dateFrom) params.set("dateFrom", dateParams.dateFrom);
      if (dateParams.dateTo) params.set("dateTo", dateParams.dateTo);
      const res = await fetch(`/api/marketing/profitability/stats?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: productIds.length > 0,
  });

  const stats = statsData?.stats ?? {};

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketing/profitability", {
        campaignName: "New Campaign",
        productId: null,
        adSpend: "0",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/profitability"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PUT", `/api/marketing/profitability/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/profitability"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/marketing/profitability/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/profitability"] });
      toast({ title: "Deleted", description: "Campaign entry removed." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const [editingField, setEditingField] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleFieldEdit = (id: string, field: string, currentValue: string) => {
    setEditingField({ id, field });
    setEditValue(currentValue);
  };

  const handleFieldSave = (id: string, field: string) => {
    updateMutation.mutate({ id, data: { [field]: editValue } });
    setEditingField(null);
  };

  const handleProductChange = (entryId: string, productId: string) => {
    updateMutation.mutate({ id: entryId, data: { productId: productId === "none" ? null : productId } });
  };

  const dRate = parseFloat(dollarRate) || 280;
  const delCharges = parseFloat(deliveryCharges) || 0;
  const packExp = parseFloat(packingExpense) || 0;

  const computedRows = entries.map((entry) => {
    const productStat = entry.productId ? stats[entry.productId] : null;
    const adSpend = parseFloat(entry.adSpend || "0");
    const totalOrders = productStat?.totalOrders ?? 0;
    const dispatched = productStat?.dispatched ?? 0;
    const delivered = productStat?.delivered ?? 0;
    const salePrice = productStat?.salePrice ?? 0;
    const costPrice = productStat?.costPrice ?? 0;

    const cpa = totalOrders > 0 ? (adSpend / totalOrders) * dRate : 0;
    const profitMargin = salePrice - costPrice - cpa - delCharges - packExp;
    const netProfit = profitMargin * totalOrders;

    return {
      ...entry,
      totalOrders,
      dispatched,
      delivered,
      salePrice,
      costPrice,
      cpa,
      profitMargin,
      netProfit,
      productTitle: productStat?.productTitle || "",
    };
  });

  const totals = computedRows.reduce(
    (acc, row) => ({
      adSpend: acc.adSpend + parseFloat(row.adSpend || "0"),
      totalOrders: acc.totalOrders + row.totalOrders,
      dispatched: acc.dispatched + row.dispatched,
      delivered: acc.delivered + row.delivered,
      netProfit: acc.netProfit + row.netProfit,
    }),
    { adSpend: 0, totalOrders: 0, dispatched: 0, delivered: 0, netProfit: 0 }
  );

  if (entriesLoading) {
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
            Track your ad campaign profitability by linking campaigns to products.
          </p>
        </div>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          data-testid="button-add-campaign"
        >
          {createMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-2" />
          )}
          Add Campaign
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Calculation Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Campaign Name</TableHead>
                  <TableHead className="min-w-[200px]">Product</TableHead>
                  <TableHead className="min-w-[120px] text-right">Ad Spend ($)</TableHead>
                  <TableHead className="text-right">Shopify Orders</TableHead>
                  <TableHead className="text-right">Dispatched</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">CPA (PKR)</TableHead>
                  <TableHead className="text-right">Profit Margin</TableHead>
                  <TableHead className="text-right">Net Profit</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {computedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                      No campaigns added yet. Click "Add Campaign" to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  computedRows.map((row) => {
                    const isEditingName = editingField?.id === row.id && editingField.field === "campaignName";
                    const isEditingSpend = editingField?.id === row.id && editingField.field === "adSpend";

                    return (
                      <TableRow key={row.id} data-testid={`row-campaign-${row.id}`}>
                        <TableCell>
                          {isEditingName ? (
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => handleFieldSave(row.id, "campaignName")}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleFieldSave(row.id, "campaignName");
                                if (e.key === "Escape") setEditingField(null);
                              }}
                              autoFocus
                              className="h-8 text-sm"
                              data-testid={`input-campaign-name-${row.id}`}
                            />
                          ) : (
                            <span
                              className="cursor-pointer hover:text-primary font-medium"
                              onClick={() => handleFieldEdit(row.id, "campaignName", row.campaignName)}
                              data-testid={`text-campaign-name-${row.id}`}
                            >
                              {row.campaignName}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={row.productId || "none"}
                            onValueChange={(val) => handleProductChange(row.id, val)}
                          >
                            <SelectTrigger className="h-8 text-sm" data-testid={`select-product-${row.id}`}>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">-- No Product --</SelectItem>
                              {productsList.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditingSpend ? (
                            <Input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => handleFieldSave(row.id, "adSpend")}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleFieldSave(row.id, "adSpend");
                                if (e.key === "Escape") setEditingField(null);
                              }}
                              autoFocus
                              className="h-8 text-sm w-24 ml-auto text-right"
                              data-testid={`input-ad-spend-${row.id}`}
                            />
                          ) : (
                            <span
                              className="cursor-pointer hover:text-primary tabular-nums"
                              onClick={() => handleFieldEdit(row.id, "adSpend", row.adSpend || "0")}
                              data-testid={`text-ad-spend-${row.id}`}
                            >
                              ${parseFloat(row.adSpend || "0").toLocaleString()}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums" data-testid={`text-total-orders-${row.id}`}>
                          {statsLoading ? <Skeleton className="h-4 w-8 ml-auto" /> : row.totalOrders}
                        </TableCell>
                        <TableCell className="text-right tabular-nums" data-testid={`text-dispatched-${row.id}`}>
                          {statsLoading ? <Skeleton className="h-4 w-8 ml-auto" /> : row.dispatched}
                        </TableCell>
                        <TableCell className="text-right tabular-nums" data-testid={`text-delivered-${row.id}`}>
                          {statsLoading ? <Skeleton className="h-4 w-8 ml-auto" /> : row.delivered}
                        </TableCell>
                        <TableCell className="text-right tabular-nums" data-testid={`text-cpa-${row.id}`}>
                          {statsLoading ? (
                            <Skeleton className="h-4 w-16 ml-auto" />
                          ) : (
                            formatCurrency(row.cpa)
                          )}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-profit-margin-${row.id}`}>
                          {statsLoading ? (
                            <Skeleton className="h-4 w-16 ml-auto" />
                          ) : (
                            <span className={`tabular-nums font-medium ${row.profitMargin >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {formatCurrency(row.profitMargin)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-net-profit-${row.id}`}>
                          {statsLoading ? (
                            <Skeleton className="h-4 w-20 ml-auto" />
                          ) : (
                            <span className={`tabular-nums font-semibold flex items-center justify-end gap-1 ${row.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {row.netProfit >= 0 ? (
                                <TrendingUp className="w-3.5 h-3.5" />
                              ) : (
                                <TrendingDown className="w-3.5 h-3.5" />
                              )}
                              {formatCurrency(row.netProfit)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteMutation.mutate(row.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-${row.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
                {computedRows.length > 0 && (
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>Totals</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right tabular-nums" data-testid="text-total-ad-spend">
                      ${totals.adSpend.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums" data-testid="text-total-all-orders">
                      {totals.totalOrders}
                    </TableCell>
                    <TableCell className="text-right tabular-nums" data-testid="text-total-dispatched">
                      {totals.dispatched}
                    </TableCell>
                    <TableCell className="text-right tabular-nums" data-testid="text-total-delivered">
                      {totals.delivered}
                    </TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right" data-testid="text-total-net-profit">
                      <span className={`tabular-nums ${totals.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(totals.netProfit)}
                      </span>
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {computedRows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <DollarSign className="w-4 h-4" />
                Total Ad Spend
              </div>
              <p className="text-xl font-bold tabular-nums" data-testid="text-summary-ad-spend">
                ${totals.adSpend.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Package className="w-4 h-4" />
                Total Orders
              </div>
              <p className="text-xl font-bold tabular-nums" data-testid="text-summary-total-orders">
                {totals.totalOrders}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <CheckCircle className="w-4 h-4" />
                Total Delivered
              </div>
              <p className="text-xl font-bold tabular-nums" data-testid="text-summary-delivered">
                {totals.delivered}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                {totals.netProfit >= 0 ? <TrendingUp className="w-4 h-4 text-green-600" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
                Net Profit
              </div>
              <p className={`text-xl font-bold tabular-nums ${totals.netProfit >= 0 ? "text-green-600" : "text-red-600"}`} data-testid="text-summary-net-profit">
                {formatCurrency(totals.netProfit)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
