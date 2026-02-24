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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  RefreshCw,
  Package,
  ChevronLeft,
  ChevronRight,
  Box,
  Image as ImageIcon,
  Tag,
  AlertCircle,
  TrendingUp,
  ShoppingCart,
  Loader2,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import type { Product } from "@shared/schema";

const WORKFLOW_STATUS_COLORS: Record<string, string> = {
  'NEW': "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  'PENDING': "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  'HOLD': "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  'READY_TO_SHIP': "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  'BOOKED': "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  'FULFILLED': "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  'DELIVERED': "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  'RETURN': "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  'CANCELLED': "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

interface Purchase {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  workflowStatus: string;
  orderDate: string;
  quantity: number;
  unitPrice: string | null;
}

function PurchaseSummary({ productId }: { productId: string }) {
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<{ purchases: Purchase[]; totalPurchases: number }>({
    queryKey: [`/api/products/${productId}/purchases`],
    enabled: !!productId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2" data-testid="loading-purchases">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading purchase history...
      </div>
    );
  }

  const purchases = data?.purchases || [];

  if (purchases.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-3" data-testid="text-no-purchases">No purchase records found for this product.</p>
    );
  }

  return (
    <div className="border rounded-md overflow-hidden" data-testid="table-purchase-summary">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Order ID</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchases.map((p) => {
            const colorClass = WORKFLOW_STATUS_COLORS[p.workflowStatus] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
            return (
              <TableRow
                key={`${p.orderId}-${p.quantity}`}
                className="cursor-pointer"
                onClick={() => navigate(`/orders/${p.orderId}`)}
                data-testid={`row-purchase-${p.orderId}`}
              >
                <TableCell className="font-medium text-sm">
                  <div>
                    {p.customerName}
                    {p.customerPhone && (
                      <span className="block text-xs text-muted-foreground">{p.customerPhone}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm">#{p.orderNumber}</TableCell>
                <TableCell className="text-sm">{p.quantity}</TableCell>
                <TableCell>
                  <Badge className={`${colorClass} text-xs font-medium`} data-testid={`badge-purchase-status-${p.orderId}`}>
                    {p.workflowStatus.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

interface ProductVariant {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number;
  inventoryItemId: string | null;
  weight: number | null;
  weightUnit: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

interface ProductImage {
  id: string;
  src: string;
  alt: string | null;
  position: number;
  width: number;
  height: number;
}

export default function ShopifyProductsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
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

  const getImages = (product: Product): ProductImage[] => {
    if (!product.images) return [];
    return product.images as unknown as ProductImage[];
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
    if (variants.length === 0) return "N/A";
    const costs = variants.map(v => v.compareAtPrice ? parseFloat(v.compareAtPrice) : NaN).filter(p => !isNaN(p));
    if (costs.length === 0) return "N/A";
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

      <Card>
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
                <TableRow>
                  <TableHead className="w-[60px]"></TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Inventory</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Sale Price</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Vendor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => {
                  const variants = getVariants(product);
                  return (
                    <TableRow
                      key={product.id}
                      className="cursor-pointer hover-elevate"
                      onClick={() => setSelectedProduct(product)}
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

      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        {selectedProduct && (
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                {selectedProduct.imageUrl ? (
                  <img
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.title}
                    className="w-12 h-12 rounded-md object-cover border"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-md border flex items-center justify-center bg-muted">
                    <ImageIcon className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate" data-testid="text-detail-shopify-product-title">{selectedProduct.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusBadge(selectedProduct.status)}
                    {getInventoryBadge(selectedProduct.totalInventory || 0)}
                  </div>
                </div>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Vendor</p>
                  <p className="font-medium">{selectedProduct.vendor || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">{selectedProduct.productType || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Handle</p>
                  <p className="font-medium">{selectedProduct.handle || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Inventory</p>
                  <p className="font-medium">{selectedProduct.totalInventory || 0}</p>
                </div>
              </div>

              {selectedProduct.tags && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1.5">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProduct.tags.split(",").filter(Boolean).map((tag, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        <Tag className="w-3 h-3 mr-1" />
                        {tag.trim()}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Box className="w-4 h-4" />
                  Variants ({getVariants(selectedProduct).length})
                </h4>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variant</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Sale Price</TableHead>
                        <TableHead>Stock</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getVariants(selectedProduct).map((variant) => (
                        <TableRow key={variant.id} data-testid={`row-variant-${variant.id}`}>
                          <TableCell className="font-medium">{variant.title || "Default"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{variant.sku || "-"}</TableCell>
                          <TableCell className="text-sm" data-testid={`text-variant-cost-${variant.id}`}>
                            {variant.compareAtPrice ? `PKR ${parseFloat(variant.compareAtPrice).toLocaleString()}` : "-"}
                          </TableCell>
                          <TableCell className="text-sm" data-testid={`text-variant-sale-price-${variant.id}`}>PKR {parseFloat(variant.price).toLocaleString()}</TableCell>
                          <TableCell>{getInventoryBadge(variant.inventoryQuantity)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {getImages(selectedProduct).length > 1 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      Images ({getImages(selectedProduct).length})
                    </h4>
                    <div className="grid grid-cols-4 gap-2">
                      {getImages(selectedProduct).map((img) => (
                        <img
                          key={img.id}
                          src={img.src}
                          alt={img.alt || selectedProduct.title}
                          className="w-full aspect-square rounded-md object-cover border"
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" />
                  Purchase Summary
                </h4>
                <PurchaseSummary productId={selectedProduct.id} />
              </div>

              {selectedProduct.shopifySyncedAt && (
                <p className="text-xs text-muted-foreground text-right">
                  Last synced: {new Date(selectedProduct.shopifySyncedAt).toLocaleString()}
                </p>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
