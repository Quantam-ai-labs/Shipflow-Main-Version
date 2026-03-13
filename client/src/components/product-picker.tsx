import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, X, Package, ChevronRight, Check } from "lucide-react";
import type { Product } from "@shared/schema";

interface ProductVariant {
  id: number;
  title: string;
  price: string;
  sku?: string;
  inventory_quantity?: number;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
}

export interface PickedProduct {
  name: string;
  price: string;
  quantity: number;
  productId: string;
  variantId: string;
  variantTitle?: string;
  image?: string | null;
  sku?: string;
}

interface ProductPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (product: PickedProduct) => void;
}

export function ProductPicker({ open, onClose, onSelect }: ProductPickerProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebouncedSearch("");
      setSelectedProduct(null);
      setPage(1);
    }
  }, [open]);

  const { data, isLoading } = useQuery<{ products: Product[]; total: number }>({
    queryKey: ["/api/products", debouncedSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams({ status: "active", page: String(page), pageSize: "20" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/products?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load products");
      return res.json();
    },
    enabled: open,
  });

  const products = data?.products || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  const handleSelectVariant = useCallback((product: Product, variant: ProductVariant) => {
    const variantTitle = variant.title !== "Default Title" ? variant.title : undefined;
    const displayName = variantTitle ? `${product.title} - ${variantTitle}` : product.title;
    onSelect({
      name: displayName,
      price: variant.price || "0",
      quantity: 1,
      productId: product.shopifyProductId,
      variantId: String(variant.id),
      variantTitle: variantTitle || undefined,
      image: product.imageUrl,
      sku: variant.sku,
    });
    onClose();
  }, [onSelect, onClose]);

  const handleSelectProduct = useCallback((product: Product) => {
    const variants = (product.variants as ProductVariant[]) || [];
    if (variants.length <= 1) {
      const variant = variants[0];
      if (variant) {
        handleSelectVariant(product, variant);
      } else {
        onSelect({
          name: product.title,
          price: "0",
          quantity: 1,
          productId: product.shopifyProductId,
          variantId: "",
          image: product.imageUrl,
        });
        onClose();
      }
    } else {
      setSelectedProduct(product);
    }
  }, [handleSelectVariant, onSelect, onClose]);

  if (!open) return null;

  const variants = selectedProduct ? (selectedProduct.variants as ProductVariant[]) || [] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="modal-product-picker">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-base">
            {selectedProduct ? "Select Variant" : "Select Product"}
          </h3>
          <Button variant="ghost" size="icon" onClick={selectedProduct ? () => setSelectedProduct(null) : onClose} data-testid="button-close-product-picker">
            {selectedProduct ? <ChevronRight className="w-4 h-4 rotate-180" /> : <X className="w-4 h-4" />}
          </Button>
        </div>

        {!selectedProduct && (
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products..."
                className="pl-9"
                autoFocus
                data-testid="input-product-search"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          {selectedProduct ? (
            <div className="p-2 space-y-1">
              <div className="flex items-center gap-3 p-2 mb-2">
                {selectedProduct.imageUrl ? (
                  <img src={selectedProduct.imageUrl} alt={selectedProduct.title} className="w-10 h-10 rounded object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                    <Package className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <span className="font-medium text-sm">{selectedProduct.title}</span>
              </div>
              {variants.map((variant) => (
                <button
                  key={variant.id}
                  onClick={() => handleSelectVariant(selectedProduct, variant)}
                  className="w-full flex items-center justify-between gap-3 p-3 rounded-md hover:bg-accent text-left transition-colors"
                  data-testid={`button-select-variant-${variant.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{variant.title}</p>
                    {variant.sku && (
                      <p className="text-xs text-muted-foreground">SKU: {variant.sku}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium">PKR {Number(variant.price).toLocaleString()}</p>
                    {variant.inventory_quantity != null && (
                      <p className="text-xs text-muted-foreground">{variant.inventory_quantity} in stock</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : isLoading ? (
            <div className="p-3 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {debouncedSearch ? "No products found" : "No products synced yet"}
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {products.map((product) => {
                const variants = (product.variants as ProductVariant[]) || [];
                const hasMultipleVariants = variants.length > 1;
                const firstVariant = variants[0];
                return (
                  <button
                    key={product.id}
                    onClick={() => handleSelectProduct(product)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-md hover:bg-accent text-left transition-colors"
                    data-testid={`button-select-product-${product.shopifyProductId}`}
                  >
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.title} className="w-10 h-10 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{product.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {firstVariant && (
                          <span>PKR {Number(firstVariant.price).toLocaleString()}</span>
                        )}
                        {hasMultipleVariants && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">{variants.length} variants</Badge>
                        )}
                      </div>
                    </div>
                    {hasMultipleVariants && (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {!selectedProduct && totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t text-sm">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-product-picker-prev">
              Previous
            </Button>
            <span className="text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-product-picker-next">
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
