import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
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
  Search,
  RefreshCw,
  Package,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  TrendingUp,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import type { Product } from "@shared/schema";

interface ProductVariant {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  cost: string | null;
  inventoryQuantity: number;
  inventoryItemId: string | null;
  weight: number | null;
  weightUnit: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

export default function ShopifyProductsPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const buildQueryUrl = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return `/api/products?${params.toString()}`;
  };

  const { data, isLoading } = useQuery<{ products: Product[]; total: number }>({
    queryKey: [buildQueryUrl()],
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/products/sync"),
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/products") });
      toast({ title: "Products synced", description: `${result.synced} products imported from Shopify.` });
    },
    onError: (error: any) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;
  const products = data?.products || [];

  const getVariants = (product: Product): ProductVariant[] => {
    if (!product.variants) return [];
    return product.variants as unknown as ProductVariant[];
  };

  const getInventoryBadge = (qty: number) => {
    if (qty <= 0) return <Badge className="bg-red-500/10 text-red-600 border-red-500/20" data-testid="badge-out-of-stock">Out of stock</Badge>;
    if (qty <= 5) return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20" data-testid="badge-low-stock">Low: {qty}</Badge>;
    return <Badge className="bg-green-500/10 text-green-600 border-green-500/20" data-testid="badge-in-stock">{qty} in stock</Badge>;
  };

  const getStatusBadge = (status: string | null) => {
    if (status === "active") return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>;
    if (status === "draft") return <Badge className="bg-muted text-muted-foreground">Draft</Badge>;
    if (status === "archived") return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Archived</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  const getPriceRange = (variants: ProductVariant[]) => {
    if (variants.length === 0) return "N/A";
    const prices = variants.map(v => parseFloat(v.price)).filter(p => !isNaN(p));
    if (prices.length === 0) return "N/A";
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) return `PKR ${min.toLocaleString()}`;
    return `PKR ${min.toLocaleString()} - ${max.toLocaleString()}`;
  };

  const getCostRange = (variants: ProductVariant[]) => {
    if (variants.length === 0) return "";
    const costs = variants.map(v => v.cost ? parseFloat(v.cost) : NaN).filter(p => !isNaN(p));
    if (costs.length === 0) return "";
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    if (min === max) return `PKR ${min.toLocaleString()}`;
    return `PKR ${min.toLocaleString()} - ${max.toLocaleString()}`;
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-shopify-products-title">Shopify Products</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} products` : "Loading..."} synced from Shopify
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/product-analytics">
            <Button variant="outline" data-testid="button-product-analytics">
              <TrendingUp className="w-4 h-4 mr-2" />
              Analytics
            </Button>
          </Link>
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-shopify-products"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Syncing..." : "Sync from Shopify"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[400px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
            data-testid="input-search-shopify-products"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]" data-testid="select-shopify-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-[#0d1322] border-white/[0.08]">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <Package className="w-12 h-12 text-muted-foreground mb-3" />
              <h3 className="font-semibold text-lg mb-1">No products found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search || statusFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Sync your products from Shopify to get started"}
              </p>
              {!search && statusFilter === "all" && (
                <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} data-testid="button-sync-empty-shopify">
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                  Sync from Shopify
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-white/[0.04] hover:bg-white/[0.04]">
                  <TableHead className="w-[60px] text-white/40 text-[11px] font-medium uppercase tracking-wider"></TableHead>
                  <TableHead className="text-white/40 text-[11px] font-medium uppercase tracking-wider">Product</TableHead>
                  <TableHead className="text-white/40 text-[11px] font-medium uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-white/40 text-[11px] font-medium uppercase tracking-wider">Inventory</TableHead>
                  <TableHead className="text-white/40 text-[11px] font-medium uppercase tracking-wider">Cost</TableHead>
                  <TableHead className="text-white/40 text-[11px] font-medium uppercase tracking-wider">Sale Price</TableHead>
                  <TableHead className="text-white/40 text-[11px] font-medium uppercase tracking-wider">Type</TableHead>
                  <TableHead className="text-white/40 text-[11px] font-medium uppercase tracking-wider">Vendor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => {
                  const variants = getVariants(product);
                  return (
                    <TableRow
                      key={product.id}
                      className="cursor-pointer hover-elevate"
                      onClick={() => navigate(`/shopify-products/${product.id}`)}
                      data-testid={`row-shopify-product-${product.id}`}
                    >
                      <TableCell>
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.title}
                            className="w-10 h-10 rounded-md object-cover border"
                            data-testid={`img-shopify-product-${product.id}`}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-md border flex items-center justify-center bg-muted">
                            <ImageIcon className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[300px]" data-testid={`text-shopify-product-title-${product.id}`}>{product.title}</p>
                          {variants.length > 1 && (
                            <p className="text-xs text-muted-foreground">{variants.length} variants</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(product.status)}</TableCell>
                      <TableCell>{getInventoryBadge(product.totalInventory || 0)}</TableCell>
                      <TableCell className="text-sm" data-testid={`text-cost-${product.id}`}>{getCostRange(variants)}</TableCell>
                      <TableCell className="text-sm" data-testid={`text-sale-price-${product.id}`}>{getPriceRange(variants)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{product.productType || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{product.vendor || "-"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({data?.total} products)
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              data-testid="button-prev-page-shopify"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              data-testid="button-next-page-shopify"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
