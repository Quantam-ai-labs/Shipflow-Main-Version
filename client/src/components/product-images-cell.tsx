import { useState } from "react";
import { Package } from "lucide-react";
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

  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  const maxVisible = 3;
  const visible = items.slice(0, maxVisible);
  const remaining = items.length - maxVisible;

  return (
    <>
      <div
        className="flex items-center gap-1 cursor-pointer group"
        onClick={() => setOpen(true)}
        data-testid={`product-images-${orderId}`}
      >
        {visible.map((item, i) => (
          <div
            key={i}
            className="w-7 h-7 rounded border border-border bg-muted/50 overflow-hidden flex-shrink-0 group-hover:border-primary/50 transition-colors"
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
                <Package className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
        {remaining > 0 && (
          <div className="w-7 h-7 rounded border border-border bg-muted/50 flex items-center justify-center flex-shrink-0 group-hover:border-primary/50 transition-colors">
            <span className="text-[10px] font-medium text-muted-foreground">+{remaining}</span>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Products</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {items.map((item, i) => (
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
                  <p className="text-sm font-medium leading-tight truncate" data-testid={`product-name-${i}`}>
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
                    {item.price && (
                      <span className="text-xs text-muted-foreground">
                        Rs {Number(item.price).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
