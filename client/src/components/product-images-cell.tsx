import { useState } from "react";
import { Package, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LineItem {
  name?: string;
  title?: string;
  quantity?: number;
  price?: string | number;
  sku?: string;
  image?: string | null;
  variantTitle?: string | null;
  productId?: string | null;
  costPrice?: number;
}

interface ProductImagesCellProps {
  lineItems: LineItem[] | null | undefined;
  orderId?: string;
}

export function ProductImagesCell({ lineItems, orderId }: ProductImagesCellProps) {
  const [open, setOpen] = useState(false);

  let parsed = lineItems;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { parsed = null; }
  }
  const items: LineItem[] = Array.isArray(parsed) ? parsed : [];

  const { data: enrichedItems, isLoading } = useQuery<LineItem[]>({
    queryKey: ["/api/orders", orderId, "products-detail"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/products-detail`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: open && !!orderId,
  });

  const displayItems = enrichedItems || items;

  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  const maxVisible = 3;
  const visible = items.slice(0, maxVisible);
  const remaining = items.length - maxVisible;

  return (
    <>
      <div
        className="flex items-center gap-1.5 cursor-pointer group"
        onClick={() => setOpen(true)}
        data-testid={`product-images-${orderId}`}
      >
        {visible.map((item, i) => (
          <div key={i} className="flex items-center gap-1 flex-shrink-0">
            <div
              className="w-6 h-6 rounded border border-border bg-muted/50 overflow-hidden flex-shrink-0 group-hover:border-primary/50 transition-colors"
            >
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.name || item.title || "Product"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-3 h-3 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex flex-col leading-none">
              {(item.quantity != null && item.quantity > 1) && (
                <span className="text-[10px] font-medium text-muted-foreground" data-testid={`product-qty-${orderId}-${i}`}>x{item.quantity}</span>
              )}
              {item.variantTitle && (
                <span className="text-[10px] text-muted-foreground max-w-[60px] truncate" data-testid={`product-variant-${orderId}-${i}`}>{item.variantTitle}</span>
              )}
            </div>
          </div>
        ))}
        {remaining > 0 && (
          <div className="w-6 h-6 rounded border border-border bg-muted/50 flex items-center justify-center flex-shrink-0 group-hover:border-primary/50 transition-colors">
            <span className="text-[10px] font-medium text-muted-foreground">+{remaining}</span>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Products</DialogTitle>
          </DialogHeader>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {displayItems.map((item, i) => (
                <div
                  key={i}
                  className="flex gap-3 p-2 rounded-lg border bg-card"
                  data-testid={`product-detail-${i}`}
                >
                  <div className="w-16 h-16 rounded-md border bg-muted/50 overflow-hidden flex-shrink-0">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name || item.title || "Product"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight" data-testid={`product-name-${i}`}>
                      {item.name || item.title || "Unknown Product"}
                    </p>
                    {item.variantTitle && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.variantTitle}</p>
                    )}
                    {item.sku && (
                      <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs font-medium">Qty: {item.quantity || 1}</span>
                      {item.price != null && (
                        <span className="text-xs text-muted-foreground">
                          Sale: Rs {Number(item.price).toLocaleString()}
                        </span>
                      )}
                      {item.costPrice != null && item.costPrice > 0 && (
                        <span className="text-xs text-muted-foreground">
                          Cost: Rs {Number(item.costPrice).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
