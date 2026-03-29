import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDateRange } from "@/contexts/date-range-context";
import { DateRangePicker } from "@/components/date-range-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronDown,
  ChevronRight,
  Package,
  TrendingUp,
  Truck,
  CheckCircle2,
  RotateCcw,
  XCircle,
  ArrowLeft,
  ShoppingBag,
  BarChart3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import { Link } from "wouter";

interface ProductAnalyticsData {
  products: Array<{
    productName: string;
    currentStock: number | null;
    imageUrl: string | null;
    shopifyProductId: string | null;
    totalOrdered: number;
    committed: number;
    dispatched: number;
    delivered: number;
    returned: number;
    cancelled: number;
    orderCount: number;
  }>;
  dailyTrend: Array<{
    date: string;
    totalOrdered: number;
    committed: number;
    dispatched: number;
    delivered: number;
    returned: number;
  }>;
  perProductDaily: Record<string, Array<{ date: string; totalOrdered: number; dispatched: number }>>;
  totals: {
    totalOrdered: number;
    committed: number;
    dispatched: number;
    delivered: number;
    returned: number;
    cancelled: number;
    totalStock: number;
  };
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}`;
}

export default function ProductAnalyticsPage() {
  const { dateRange, setDateRange, dateParams } = useDateRange();
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  const buildQueryUrl = () => {
    const params = new URLSearchParams();
    if (dateParams.dateFrom) params.set("dateFrom", dateParams.dateFrom);
    if (dateParams.dateTo) params.set("dateTo", dateParams.dateTo);
    return `/api/product-analytics?${params.toString()}`;
  };

  const { data, isLoading } = useQuery<ProductAnalyticsData>({
    queryKey: [buildQueryUrl()],
  });

  const toggleProduct = (name: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const totals = data?.totals;
  const products = data?.products || [];
  const dailyTrend = data?.dailyTrend || [];

  return (
    <div className="flex flex-col h-full overflow-auto" data-testid="page-product-analytics">
      <div className="flex items-center justify-between gap-4 p-4 border-b sticky top-0 bg-background z-10">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/products">
            <Button variant="ghost" size="icon" data-testid="button-back-products">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2" data-testid="text-page-title">
              <BarChart3 className="w-5 h-5" />
              Product Analytics
            </h1>
            <p className="text-sm text-muted-foreground">Stock, committed, and dispatched analysis</p>
          </div>
        </div>
        <DateRangePicker
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          data-testid="picker-date-range"
        />
      </div>

      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : totals ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card data-testid="card-total-stock">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Package className="w-4 h-4" />
                    Total Stock
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-total-stock">
                    {totals.totalStock.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Current inventory</p>
                </CardContent>
              </Card>
              <Card data-testid="card-committed">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <ShoppingBag className="w-4 h-4" />
                    Committed
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-committed">
                    {totals.committed.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Booked + dispatched units</p>
                </CardContent>
              </Card>
              <Card data-testid="card-dispatched">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Truck className="w-4 h-4" />
                    Dispatched
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-dispatched">
                    {totals.dispatched.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Fulfilled + delivered + returned</p>
                </CardContent>
              </Card>
              <Card data-testid="card-delivered">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <CheckCircle2 className="w-4 h-4" />
                    Delivered
                  </div>
                  <p className="text-2xl font-bold text-green-600" data-testid="text-delivered">
                    {totals.delivered.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {totals.dispatched > 0 ? `${Math.round((totals.delivered / totals.dispatched) * 100)}% delivery rate` : "No dispatches yet"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {dailyTrend.length > 1 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card data-testid="card-chart-trend">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Daily Orders & Dispatch Trend
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dailyTrend}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip
                            labelFormatter={formatDate}
                            contentStyle={{
                              backgroundColor: "hsl(var(--popover))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "6px",
                              color: "hsl(var(--popover-foreground))",
                            }}
                          />
                          <Legend />
                          <Area type="monotone" dataKey="totalOrdered" name="Ordered" fill="hsl(var(--chart-1))" stroke="hsl(var(--chart-1))" fillOpacity={0.15} />
                          <Area type="monotone" dataKey="dispatched" name="Dispatched" fill="hsl(var(--chart-2))" stroke="hsl(var(--chart-2))" fillOpacity={0.15} />
                          <Area type="monotone" dataKey="delivered" name="Delivered" fill="hsl(var(--chart-3))" stroke="hsl(var(--chart-3))" fillOpacity={0.15} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-chart-bar">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Top Products by Volume
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={products.slice(0, 8).map(p => ({
                            name: p.productName.length > 20 ? p.productName.substring(0, 20) + "..." : p.productName,
                            ordered: p.totalOrdered,
                            dispatched: p.dispatched,
                            delivered: p.delivered,
                          }))}
                          layout="vertical"
                        >
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--popover))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "6px",
                              color: "hsl(var(--popover-foreground))",
                            }}
                          />
                          <Legend />
                          <Bar dataKey="ordered" name="Ordered" fill="hsl(var(--chart-1))" radius={[0, 2, 2, 0]} />
                          <Bar dataKey="dispatched" name="Dispatched" fill="hsl(var(--chart-2))" radius={[0, 2, 2, 0]} />
                          <Bar dataKey="delivered" name="Delivered" fill="hsl(var(--chart-3))" radius={[0, 2, 2, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <Card data-testid="card-product-table">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Product Breakdown ({products.length} products)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Ordered</TableHead>
                      <TableHead className="text-right">Committed</TableHead>
                      <TableHead className="text-right">Dispatched</TableHead>
                      <TableHead className="text-right">Delivered</TableHead>
                      <TableHead className="text-right">Returned</TableHead>
                      <TableHead className="text-right">Cancelled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product, idx) => {
                      const isExpanded = expandedProducts.has(product.productName);
                      const productTrend = data?.perProductDaily?.[product.productName];
                      const hasChart = productTrend && productTrend.length > 1;

                      return (
                        <>
                          <TableRow
                            key={product.productName}
                            className="cursor-pointer hover-elevate"
                            onClick={() => toggleProduct(product.productName)}
                            data-testid={`row-product-${idx}`}
                          >
                            <TableCell className="w-8 pr-0">
                              {hasChart ? (
                                isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                              ) : <span className="w-4 h-4 inline-block" />}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {product.imageUrl ? (
                                  <img
                                    src={product.imageUrl}
                                    alt={product.productName}
                                    className="w-8 h-8 rounded object-cover border flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded border bg-muted flex items-center justify-center flex-shrink-0">
                                    <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                                  </div>
                                )}
                                <span className="font-medium text-sm truncate max-w-[250px]" title={product.productName}>
                                  {product.productName}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {product.currentStock !== null ? (
                                <Badge
                                  className={
                                    product.currentStock <= 0
                                      ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                      : product.currentStock <= 10
                                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  }
                                >
                                  {product.currentStock}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">N/A</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">{product.totalOrdered}</TableCell>
                            <TableCell className="text-right">
                              <span className="text-blue-400">{product.committed}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-orange-400">{product.dispatched}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-emerald-400">{product.delivered}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-red-400">{product.returned}</span>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{product.cancelled}</TableCell>
                          </TableRow>
                          {isExpanded && hasChart && (
                            <TableRow key={`${product.productName}-chart`}>
                              <TableCell colSpan={9} className="bg-muted/30 p-4">
                                <div className="space-y-2">
                                  <p className="text-sm font-medium text-muted-foreground">Daily trend for {product.productName}</p>
                                  <div className="h-40">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart data={productTrend}>
                                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                        <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <Tooltip
                                          labelFormatter={formatDate}
                                          contentStyle={{
                                            backgroundColor: "hsl(var(--popover))",
                                            border: "1px solid hsl(var(--border))",
                                            borderRadius: "6px",
                                            color: "hsl(var(--popover-foreground))",
                                          }}
                                        />
                                        <Legend />
                                        <Line type="monotone" dataKey="totalOrdered" name="Ordered" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="dispatched" name="Dispatched" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                                    <div className="text-center p-2 rounded-md bg-background border">
                                      <p className="text-xs text-muted-foreground">Stock</p>
                                      <p className="font-semibold">{product.currentStock ?? "N/A"}</p>
                                    </div>
                                    <div className="text-center p-2 rounded-md bg-background border">
                                      <p className="text-xs text-muted-foreground">Committed</p>
                                      <p className="font-semibold text-blue-400">{product.committed}</p>
                                    </div>
                                    <div className="text-center p-2 rounded-md bg-background border">
                                      <p className="text-xs text-muted-foreground">Dispatched</p>
                                      <p className="font-semibold text-orange-400">{product.dispatched}</p>
                                    </div>
                                    <div className="text-center p-2 rounded-md bg-background border">
                                      <p className="text-xs text-muted-foreground">Delivery Rate</p>
                                      <p className="font-semibold text-emerald-400">
                                        {product.dispatched > 0 ? `${Math.round((product.delivered / product.dispatched) * 100)}%` : "N/A"}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                    {products.length === 0 && !isLoading && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No product data found for the selected date range
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
