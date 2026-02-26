import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Box,
  Image as ImageIcon,
  Tag,
  ShoppingCart,
  Package,
  Loader2,
  ExternalLink,
  BarChart2,
  Hash,
  Store,
  Layers,
} from "lucide-react";
import type { Product } from "@shared/schema";

const WORKFLOW_STATUS_COLORS: Record<string, string> = {
  NEW: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  HOLD: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  READY_TO_SHIP: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  BOOKED: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  FULFILLED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  DELIVERED: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  RETURN: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

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

interface ProductImage {
  id: string;
  src: string;
  alt: string | null;
  position: number;
  width: number;
  height: number;
}

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
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2" data-testid="loading-purchases">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading purchase history...
      </div>
    );
  }

  const purchases = data?.purchases || [];

  if (purchases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2" data-testid="text-no-purchases">
        <ShoppingCart className="w-8 h-8 opacity-30" />
        <p className="text-sm">No purchase records found for this product.</p>
      </div>
    );
  }

  const statusCounts: Record<string, number> = {};
  for (const p of purchases) {
    statusCounts[p.workflowStatus] = (statusCounts[p.workflowStatus] || 0) + 1;
  }

  const summaryCards = [
    {
      label: "Total",
      count: data?.totalPurchases ?? purchases.length,
      color: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
      border: "border-blue-200 dark:border-blue-800",
    },
    {
      label: "Not Dispatched",
      count: (statusCounts["NEW"] || 0) + (statusCounts["PENDING"] || 0) + (statusCounts["HOLD"] || 0) + (statusCounts["READY_TO_SHIP"] || 0),
      color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
      border: "border-slate-200 dark:border-slate-700",
    },
    {
      label: "Booked",
      count: statusCounts["BOOKED"] || 0,
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
      border: "border-blue-200 dark:border-blue-800",
    },
    {
      label: "Fulfilled",
      count: statusCounts["FULFILLED"] || 0,
      color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
      border: "border-indigo-200 dark:border-indigo-800",
    },
    {
      label: "Delivered",
      count: statusCounts["DELIVERED"] || 0,
      color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
      border: "border-green-200 dark:border-green-800",
    },
    ...(statusCounts["RETURN"] ? [{
      label: "Return",
      count: statusCounts["RETURN"],
      color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
      border: "border-red-200 dark:border-red-800",
    }] : []),
    ...(statusCounts["CANCELLED"] ? [{
      label: "Cancelled",
      count: statusCounts["CANCELLED"],
      color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
      border: "border-red-200 dark:border-red-800",
    }] : []),
  ];

  return (
    <div data-testid="table-purchase-summary">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2 mb-4" data-testid="purchase-stats-cards">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-lg border px-3 py-2.5 flex flex-col gap-0.5 ${card.color} ${card.border}`}
            data-testid={`stat-card-${card.label.toLowerCase()}`}
          >
            <span className="text-xs font-medium opacity-80">{card.label}</span>
            <span className="text-xl font-bold leading-none">{card.count}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground mb-2">
        Showing {purchases.length} of {data?.totalPurchases ?? purchases.length} total orders
      </div>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Customer</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Unit Price</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases.map((p) => {
              const colorClass =
                WORKFLOW_STATUS_COLORS[p.workflowStatus] ||
                "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
              return (
                <TableRow
                  key={`${p.orderId}-${p.quantity}`}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
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
                  <TableCell className="text-sm font-mono">#{p.orderNumber}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.orderDate ? new Date(p.orderDate).toLocaleDateString() : "-"}
                  </TableCell>
                  <TableCell className="text-sm font-medium">{p.quantity}</TableCell>
                  <TableCell className="text-sm">
                    {p.unitPrice ? `PKR ${parseFloat(p.unitPrice).toLocaleString()}` : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${colorClass} text-xs font-medium`} data-testid={`badge-purchase-status-${p.orderId}`}>
                      {p.workflowStatus.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function getVariants(product: Product): ProductVariant[] {
  if (!product.variants) return [];
  return product.variants as unknown as ProductVariant[];
}

function getImages(product: Product): ProductImage[] {
  if (!product.images) return [];
  return product.images as unknown as ProductImage[];
}

function getInventoryBadge(qty: number) {
  if (qty <= 0)
    return (
      <Badge className="bg-red-500/10 text-red-600 border-red-500/20" data-testid="badge-out-of-stock">
        Out of stock
      </Badge>
    );
  if (qty <= 5)
    return (
      <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20" data-testid="badge-low-stock">
        Low: {qty}
      </Badge>
    );
  return (
    <Badge className="bg-green-500/10 text-green-600 border-green-500/20" data-testid="badge-in-stock">
      {qty} in stock
    </Badge>
  );
}

function getStatusBadge(status: string | null) {
  if (status === "active")
    return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>;
  if (status === "draft")
    return <Badge className="bg-muted text-muted-foreground">Draft</Badge>;
  if (status === "archived")
    return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Archived</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function getPriceRange(variants: ProductVariant[]) {
  if (variants.length === 0) return "N/A";
  const prices = variants.map((v) => parseFloat(v.price)).filter((p) => !isNaN(p));
  if (prices.length === 0) return "N/A";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `PKR ${min.toLocaleString()}`;
  return `PKR ${min.toLocaleString()} – ${max.toLocaleString()}`;
}

function getCostRange(variants: ProductVariant[]) {
  if (variants.length === 0) return "";
  const costs = variants
    .map((v) => (v.cost ? parseFloat(v.cost) : NaN))
    .filter((p) => !isNaN(p));
  if (costs.length === 0) return "";
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  if (min === max) return `PKR ${min.toLocaleString()}`;
  return `PKR ${min.toLocaleString()} – ${max.toLocaleString()}`;
}

function calcMargin(cost: string | null, price: string): string {
  const c = cost ? parseFloat(cost) : NaN;
  const p = parseFloat(price);
  if (isNaN(c) || isNaN(p) || p === 0) return "-";
  const margin = ((p - c) / p) * 100;
  return `${margin.toFixed(1)}%`;
}

export default function ShopifyProductDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const productId = params.id;

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: [`/api/products/${productId}`],
    enabled: !!productId,
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-7 w-64" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <Skeleton className="lg:col-span-2 h-72 rounded-xl" />
          <div className="lg:col-span-3 space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-4 md:p-6 max-w-[1200px] mx-auto">
        <Button variant="ghost" onClick={() => navigate("/shopify-products")} className="mb-4" data-testid="button-back-product-detail">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Products
        </Button>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Package className="w-12 h-12 opacity-30" />
          <p className="text-lg font-medium">Product not found</p>
          <p className="text-sm">This product may have been removed or the ID is invalid.</p>
        </div>
      </div>
    );
  }

  const variants = getVariants(product);
  const images = getImages(product);
  const primaryImage = product.imageUrl || (images.length > 0 ? images[0].src : null);
  const additionalImages = images.filter((img) => img.src !== primaryImage);

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/shopify-products")}
          className="gap-2"
          data-testid="button-back-product-detail"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Products
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span
            className="hover:text-foreground cursor-pointer transition-colors"
            onClick={() => navigate("/shopify-products")}
            data-testid="link-breadcrumb-products"
          >
            Shopify Products
          </span>
          <span>/</span>
          <span className="text-foreground font-medium truncate max-w-[260px]" data-testid="text-breadcrumb-product-title">
            {product.title}
          </span>
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-2">
          <div className="rounded-xl border bg-muted/20 overflow-hidden aspect-square flex items-center justify-center" data-testid="img-product-primary-container">
            {primaryImage ? (
              <img
                src={primaryImage}
                alt={product.title}
                className="w-full h-full object-cover"
                data-testid="img-product-primary"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground p-8">
                <ImageIcon className="w-16 h-16 opacity-30" />
                <span className="text-sm">No image available</span>
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1" data-testid="gallery-product-images">
              {images.map((img) => (
                <img
                  key={img.id}
                  src={img.src}
                  alt={img.alt || product.title}
                  className="w-16 h-16 rounded-lg object-cover border flex-shrink-0 hover:border-primary transition-colors cursor-pointer"
                  data-testid={`img-gallery-${img.id}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-3 space-y-5">
          <div>
            <h1
              className="text-2xl font-bold leading-tight"
              data-testid="text-product-detail-title"
            >
              {product.title}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {getStatusBadge(product.status)}
              {getInventoryBadge(product.totalInventory || 0)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Store className="w-3 h-3" /> Vendor
              </p>
              <p className="text-sm font-medium" data-testid="text-product-vendor">
                {product.vendor || "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Layers className="w-3 h-3" /> Product Type
              </p>
              <p className="text-sm font-medium" data-testid="text-product-type">
                {product.productType || "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Hash className="w-3 h-3" /> Handle
              </p>
              <p className="text-sm font-mono text-muted-foreground" data-testid="text-product-handle">
                {product.handle || "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Package className="w-3 h-3" /> Total Inventory
              </p>
              <p className="text-sm font-medium" data-testid="text-product-inventory">
                {product.totalInventory ?? 0} units
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Sale Price Range</p>
              <p className="text-lg font-semibold" data-testid="text-product-price-range">
                {getPriceRange(variants)}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Cost Range</p>
              <p className="text-lg font-semibold text-muted-foreground" data-testid="text-product-cost-range">
                {getCostRange(variants) || "—"}
              </p>
            </div>
          </div>

          {product.tags && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Tag className="w-3 h-3" /> Tags
              </p>
              <div className="flex flex-wrap gap-1.5" data-testid="tags-product">
                {product.tags
                  .split(",")
                  .filter(Boolean)
                  .map((tag, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {tag.trim()}
                    </Badge>
                  ))}
              </div>
            </div>
          )}

          {product.shopifySyncedAt && (
            <p className="text-xs text-muted-foreground" data-testid="text-product-sync-time">
              Last synced: {new Date(product.shopifySyncedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <Card data-testid="card-variants">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Box className="w-4 h-4" />
            Variants
            <Badge variant="secondary" className="ml-1">{variants.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {variants.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              No variants found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Variant</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Sale Price</TableHead>
                    <TableHead>Margin</TableHead>
                    <TableHead>Compare At</TableHead>
                    <TableHead>Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variants.map((variant) => {
                    const margin = calcMargin(variant.cost, variant.price);
                    const marginNum = parseFloat(margin);
                    const marginColor =
                      isNaN(marginNum)
                        ? "text-muted-foreground"
                        : marginNum >= 40
                        ? "text-green-600"
                        : marginNum >= 20
                        ? "text-amber-600"
                        : "text-red-600";
                    return (
                      <TableRow key={variant.id} data-testid={`row-variant-${variant.id}`}>
                        <TableCell className="font-medium">
                          {variant.title || "Default"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">
                          {variant.sku || "—"}
                        </TableCell>
                        <TableCell className="text-sm" data-testid={`text-variant-cost-${variant.id}`}>
                          {variant.cost
                            ? `PKR ${parseFloat(variant.cost).toLocaleString()}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-medium" data-testid={`text-variant-sale-price-${variant.id}`}>
                          PKR {parseFloat(variant.price).toLocaleString()}
                        </TableCell>
                        <TableCell className={`text-sm font-semibold ${marginColor}`} data-testid={`text-variant-margin-${variant.id}`}>
                          {margin}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {variant.compareAtPrice
                            ? `PKR ${parseFloat(variant.compareAtPrice).toLocaleString()}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {getInventoryBadge(variant.inventoryQuantity)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-purchase-history">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            Purchase History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PurchaseSummary productId={product.id} />
        </CardContent>
      </Card>

      {product.handle && (
        <div className="flex justify-end">
          <a
            href={`https://admin.shopify.com/products/${product.shopifyProductId}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-shopify-admin"
          >
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="w-4 h-4" />
              View in Shopify Admin
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}
