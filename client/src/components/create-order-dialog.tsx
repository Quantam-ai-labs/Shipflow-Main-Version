import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  X,
  Plus,
  Minus,
  Loader2,
  Package,
  User,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  ExternalLink,
  ShoppingCart,
} from "lucide-react";
import type { Product } from "@shared/schema";

interface Variant {
  id: string;
  title: string;
  price: string;
  sku?: string;
  inventoryQuantity: number;
}

interface LineItem {
  shopifyVariantId: string;
  productTitle: string;
  variantTitle: string | null;
  imageUrl: string | null;
  price: number;
  quantity: number;
}

interface ShopifyCustomer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: {
    address1: string;
    city: string;
    province: string | null;
    zip: string | null;
    name: string;
  } | null;
}

interface CustomerForm {
  shopifyCustomerId?: string;
  name: string;
  phone: string;
  address: string;
  city: string;
}

interface CreateOrderResult {
  orderNumber: string;
  shopifyOrderId: string;
  invoiceUrl: string | null;
}

interface OrderSnapshot {
  lineItems: LineItem[];
  customer: CustomerForm;
  subtotal: number;
  discountAmount: number;
  discountType: "fixed" | "percentage";
  discountValue: string;
  discountExpanded: boolean;
  shipAmt: number;
  total: number;
  markAsPaid: boolean;
  note: string;
  tags: string;
  createdAt: string;
}

interface ProductPickerProps {
  open: boolean;
  onClose: () => void;
  onAdd: (items: LineItem[]) => void;
}

function ProductPicker({ open, onClose, onAdd }: ProductPickerProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<Map<string, { product: Product; variant: Variant; qty: number }>>(new Map());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery<{ products: Product[] }>({
    queryKey: ["/api/products", { search: debouncedSearch, pageSize: 50 }],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: "50" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/products?${params}`, { credentials: "include" });
      return res.json();
    },
  });

  const products = data?.products || [];

  function toggleVariant(product: Product, variant: Variant) {
    const key = variant.id;
    const next = new Map(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.set(key, { product, variant, qty: 1 });
    }
    setSelected(next);
  }

  function handleAdd() {
    const items: LineItem[] = Array.from(selected.values()).map(({ product, variant }) => ({
      shopifyVariantId: variant.id,
      productTitle: product.title,
      variantTitle: variant.title === "Default Title" ? null : variant.title,
      imageUrl: product.imageUrl || null,
      price: parseFloat(variant.price) || 0,
      quantity: 1,
    }));
    onAdd(items);
    setSelected(new Map());
    setSearch("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>Select products</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
              data-testid="input-product-search"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No products found</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="w-8 py-2 px-4"></th>
                  <th className="text-left py-2 px-2">Product</th>
                  <th className="text-right py-2 px-4">Available</th>
                  <th className="text-right py-2 px-4">Price</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const variants: Variant[] = Array.isArray(product.variants) ? product.variants as Variant[] : [];
                  const singleVariant = variants.length === 1 || (variants.length > 0 && variants[0].title === "Default Title");
                  return (
                    <ProductRow
                      key={product.id}
                      product={product}
                      variants={variants}
                      singleVariant={singleVariant}
                      selected={selected}
                      onToggle={toggleVariant}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {selected.size === 0 ? "0/500 variants selected" : `${selected.size} variant${selected.size !== 1 ? "s" : ""} selected`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleAdd} disabled={selected.size === 0} data-testid="button-add-products">Add</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProductRow({
  product, variants, singleVariant, selected, onToggle,
}: {
  product: Product;
  variants: Variant[];
  singleVariant: boolean;
  selected: Map<string, { product: Product; variant: Variant; qty: number }>;
  onToggle: (product: Product, variant: Variant) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (singleVariant && variants.length > 0) {
    const v = variants[0];
    const isSelected = selected.has(v.id);
    return (
      <tr
        key={v.id}
        className="border-b hover:bg-muted/30 cursor-pointer"
        onClick={() => onToggle(product, v)}
      >
        <td className="py-2 px-4">
          <Checkbox checked={isSelected} onCheckedChange={() => onToggle(product, v)} data-testid={`checkbox-variant-${v.id}`} />
        </td>
        <td className="py-2 px-2">
          <div className="flex items-center gap-3">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.title} className="w-10 h-10 object-cover rounded border" />
            ) : (
              <div className="w-10 h-10 bg-muted rounded border flex items-center justify-center">
                <Package className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
            <span className="font-medium line-clamp-2 max-w-xs">{product.title}</span>
          </div>
        </td>
        <td className="py-2 px-4 text-right">
          <span className={v.inventoryQuantity === 0 ? "text-amber-600" : "text-muted-foreground"}>
            {v.inventoryQuantity}
          </span>
        </td>
        <td className="py-2 px-4 text-right font-medium">PKR {parseFloat(v.price).toLocaleString()}</td>
      </tr>
    );
  }

  const productChecked = variants.some((v) => selected.has(v.id));
  return (
    <>
      <tr className="border-b bg-muted/10 cursor-pointer" onClick={() => setExpanded((e) => !e)}>
        <td className="py-2 px-4">
          <Checkbox checked={productChecked} onCheckedChange={() => setExpanded((e) => !e)} />
        </td>
        <td className="py-2 px-2" colSpan={3}>
          <div className="flex items-center gap-3">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.title} className="w-10 h-10 object-cover rounded border" />
            ) : (
              <div className="w-10 h-10 bg-muted rounded border flex items-center justify-center">
                <Package className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
            <span className="font-medium line-clamp-2 max-w-xs flex-1">{product.title}</span>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </td>
      </tr>
      {expanded && variants.map((v) => {
        const isSelected = selected.has(v.id);
        return (
          <tr
            key={v.id}
            className="border-b hover:bg-muted/30 cursor-pointer"
            onClick={() => onToggle(product, v)}
          >
            <td className="py-2 px-4 pl-10">
              <Checkbox checked={isSelected} onCheckedChange={() => onToggle(product, v)} data-testid={`checkbox-variant-${v.id}`} />
            </td>
            <td className="py-2 px-2 pl-14 text-muted-foreground">{v.title}</td>
            <td className="py-2 px-4 text-right">
              <span className={v.inventoryQuantity === 0 ? "text-amber-600" : "text-muted-foreground"}>
                {v.inventoryQuantity}
              </span>
            </td>
            <td className="py-2 px-4 text-right font-medium">PKR {parseFloat(v.price).toLocaleString()}</td>
          </tr>
        );
      })}
    </>
  );
}

interface CreateOrderDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateOrderDialog({ open, onClose }: CreateOrderDialogProps) {
  const { toast } = useToast();

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [customer, setCustomer] = useState<CustomerForm>({ name: "", phone: "", address: "", city: "" });
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [shopifyError, setShopifyError] = useState<string | null>(null);

  const [discountExpanded, setDiscountExpanded] = useState(false);
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [discountValue, setDiscountValue] = useState("");

  const [shippingExpanded, setShippingExpanded] = useState(false);
  const [shippingAmount, setShippingAmount] = useState("200");

  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [tagInput, setTagInput] = useState("");

  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [result, setResult] = useState<CreateOrderResult | null>(null);
  const [orderSnapshot, setOrderSnapshot] = useState<OrderSnapshot | null>(null);

  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const pendingSnapshotRef = useRef<OrderSnapshot | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCustomerSearch(customerSearch), 400);
    return () => clearTimeout(t);
  }, [customerSearch]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data: customerResults, isLoading: customersLoading } = useQuery<ShopifyCustomer[]>({
    queryKey: ["/api/shopify/customers/search", debouncedCustomerSearch],
    queryFn: async () => {
      if (!debouncedCustomerSearch) return [];
      const res = await fetch(`/api/shopify/customers/search?q=${encodeURIComponent(debouncedCustomerSearch)}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error || "Shopify not connected";
        setShopifyError(msg);
        return [];
      }
      setShopifyError(null);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!debouncedCustomerSearch,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/orders/create-draft", payload);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.error) {
        const isShopifyConn = /not connected|shopify/i.test(data.error);
        if (isShopifyConn) setShopifyError(data.error);
        toast({ title: "Failed to create order", description: data.error, variant: "destructive" });
        return;
      }
      setShopifyError(null);
      if (pendingSnapshotRef.current) {
        setOrderSnapshot(pendingSnapshotRef.current);
        pendingSnapshotRef.current = null;
      }
      setResult(data);
    },
    onError: (err: any) => {
      toast({ title: "Failed to create order", description: err.message, variant: "destructive" });
    },
  });

  function reset() {
    setLineItems([]);
    setCustomer({ name: "", phone: "", address: "", city: "" });
    setCustomerSearch("");
    setDebouncedCustomerSearch("");
    setShowNewCustomer(false);
    setDiscountExpanded(false);
    setDiscountValue("");
    setShippingExpanded(false);
    setShippingAmount("200");
    setMarkAsPaid(false);
    setNote("");
    setTags("");
    setTagInput("");
    setResult(null);
    setOrderSnapshot(null);
    setShopifyError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function selectCustomer(c: ShopifyCustomer) {
    setCustomer({
      shopifyCustomerId: c.id,
      name: c.name,
      phone: c.phone || "",
      address: c.address?.address1 || "",
      city: c.address?.city || "",
    });
    setCustomerSearch(c.name);
    setCustomerDropdownOpen(false);
    setShowNewCustomer(false);
  }

  function updateQty(idx: number, delta: number) {
    setLineItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
      )
    );
  }

  function removeItem(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addTag() {
    const val = tagInput.trim();
    if (!val) return;
    const existing = tags ? tags.split(",").map((t) => t.trim()) : [];
    if (!existing.includes(val)) {
      setTags([...existing, val].join(", "));
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    const existing = tags.split(",").map((t) => t.trim()).filter((t) => t !== tag);
    setTags(existing.join(", "));
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discVal = parseFloat(discountValue || "0") || 0;
  const shipAmt = shippingExpanded ? (parseFloat(shippingAmount || "0") || 0) : 0;
  const discountAmount = discountExpanded && discVal > 0
    ? discountType === "percentage"
      ? (subtotal * discVal) / 100
      : discVal
    : 0;
  const total = Math.max(0, subtotal - discountAmount + shipAmt);

  function handleSubmit() {
    if (lineItems.length === 0) {
      toast({ title: "No products added", description: "Add at least one product to create an order.", variant: "destructive" });
      return;
    }
    const payload = {
      customer: {
        shopifyCustomerId: customer.shopifyCustomerId,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
      },
      lineItems,
      discountType: discountExpanded && discVal > 0 ? discountType : null,
      discountValue: discountExpanded && discVal > 0 ? discVal : null,
      shippingAmount: shipAmt > 0 ? shipAmt : null,
      markAsPaid,
      note,
      tags,
    };
    pendingSnapshotRef.current = {
      lineItems,
      customer,
      subtotal,
      discountAmount,
      discountType,
      discountValue,
      discountExpanded,
      shipAmt,
      total,
      markAsPaid,
      note,
      tags,
      createdAt: new Date().toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }),
    };
    createMutation.mutate(payload);
  }

  if (result && orderSnapshot) {
    const snap = orderSnapshot;
    const tagList = snap.tags ? snap.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    return (
      <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Order Confirmed</p>
                <p className="text-lg font-bold font-mono leading-tight">{result.orderNumber}</p>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={snap.markAsPaid ? "default" : "secondary"} className="text-xs">
                {snap.markAsPaid ? "Paid" : "COD"}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">{snap.createdAt}</p>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* Customer */}
            {(snap.customer.name || snap.customer.phone || snap.customer.address) && (
              <div className="rounded-lg border bg-muted/20 p-4 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Customer</p>
                {snap.customer.name && <p className="font-medium text-sm">{snap.customer.name}</p>}
                {snap.customer.phone && <p className="text-sm text-muted-foreground">{snap.customer.phone}</p>}
                {(snap.customer.address || snap.customer.city) && (
                  <p className="text-sm text-muted-foreground">
                    {[snap.customer.address, snap.customer.city].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
            )}

            {/* Products */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Products</p>
              <div className="space-y-3">
                {snap.lineItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-3" data-testid={`invoice-item-${i}`}>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.productTitle} className="w-12 h-12 rounded-md object-cover border shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-md border bg-muted flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.productTitle}</p>
                      {item.variantTitle && item.variantTitle !== "Default Title" && (
                        <p className="text-xs text-muted-foreground">{item.variantTitle}</p>
                      )}
                      <p className="text-xs text-muted-foreground">Qty: {item.quantity} × PKR {item.price.toLocaleString()}</p>
                    </div>
                    <p className="text-sm font-semibold shrink-0">PKR {(item.price * item.quantity).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t" />

            {/* Charges */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Payment Summary</p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal ({snap.lineItems.reduce((s, i) => s + i.quantity, 0)} items)</span>
                <span>PKR {snap.subtotal.toLocaleString()}</span>
              </div>
              {snap.discountExpanded && snap.discountAmount > 0 && (
                <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                  <span>
                    Discount
                    {snap.discountType === "percentage" ? ` (${snap.discountValue}%)` : ""}
                  </span>
                  <span>− PKR {snap.discountAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {snap.shipAmt > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>PKR {snap.shipAmt.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold border-t pt-2 mt-1">
                <span>Total</span>
                <span>PKR {snap.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Payment Method</span>
                <span className={snap.markAsPaid ? "text-green-600 dark:text-green-400 font-medium" : "font-medium"}>
                  {snap.markAsPaid ? "Paid" : "Cash on Delivery (COD)"}
                </span>
              </div>
            </div>

            {/* Notes */}
            {snap.note && (
              <>
                <div className="border-t" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Note</p>
                  <p className="text-sm text-muted-foreground">{snap.note}</p>
                </div>
              </>
            )}

            {/* Tags */}
            {tagList.length > 0 && (
              <>
                <div className="border-t" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tagList.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer actions */}
          <div className="px-6 py-4 border-t shrink-0 flex flex-col gap-2">
            {result.invoiceUrl && (
              <Button asChild variant="outline" className="w-full gap-2" data-testid="link-view-invoice">
                <a href={result.invoiceUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" /> View Shopify Invoice
                </a>
              </Button>
            )}
            <div className="flex gap-2">
              <Button onClick={reset} className="flex-1" data-testid="button-create-another">
                Create Another Order
              </Button>
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Close
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
        <SheetContent side="right" className="w-full sm:max-w-none sm:w-[90vw] max-w-[1100px] flex flex-col p-0 overflow-hidden">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" /> Create Order
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] min-h-full">
              {/* LEFT COLUMN */}
              <div className="p-6 flex flex-col gap-6 border-r">
                {/* PRODUCTS */}
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h3 className="font-medium">Products</h3>
                  </div>
                  <div className="p-4 flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => setProductPickerOpen(true)} data-testid="button-browse-products">
                      <Search className="w-4 h-4" /> Browse
                    </Button>
                  </div>

                  {lineItems.length > 0 && (
                    <div className="border-t">
                      <div className="grid grid-cols-[1fr_auto_auto_auto] text-xs text-muted-foreground px-4 py-2 border-b">
                        <span>Product</span>
                        <span className="text-center w-24">Quantity</span>
                        <span className="text-right w-24">Total</span>
                        <span className="w-8"></span>
                      </div>
                      {lineItems.map((item, idx) => (
                        <div key={`${item.shopifyVariantId}-${idx}`} className="grid grid-cols-[1fr_auto_auto_auto] items-center px-4 py-3 border-b last:border-0 gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.productTitle} className="w-10 h-10 object-cover rounded border shrink-0" />
                            ) : (
                              <div className="w-10 h-10 bg-muted rounded border flex items-center justify-center shrink-0">
                                <Package className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{item.productTitle}</div>
                              {item.variantTitle && <div className="text-xs text-primary">{item.variantTitle}</div>}
                              <div className="text-xs text-muted-foreground">PKR {item.price.toLocaleString()}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 w-24 justify-center">
                            <Button variant="outline" size="icon" className="w-6 h-6" onClick={() => updateQty(idx, -1)} data-testid={`button-qty-minus-${idx}`}>
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                            <Button variant="outline" size="icon" className="w-6 h-6" onClick={() => updateQty(idx, 1)} data-testid={`button-qty-plus-${idx}`}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          <div className="w-24 text-right text-sm font-medium">
                            PKR {(item.price * item.quantity).toLocaleString()}
                          </div>
                          <div className="w-8 flex justify-end">
                            <Button variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground hover:text-destructive" onClick={() => removeItem(idx)} data-testid={`button-remove-item-${idx}`}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {lineItems.length === 0 && (
                    <div className="px-4 pb-4 text-sm text-muted-foreground">
                      No products added yet.
                    </div>
                  )}
                </div>

                {/* PAYMENT SUMMARY */}
                <div className="rounded-lg border bg-card">
                  <div className="px-4 py-3 border-b">
                    <h3 className="font-medium">Payment</h3>
                  </div>
                  <div className="p-4 flex flex-col gap-1 text-sm">
                    <div className="flex items-center justify-between py-1">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{lineItems.length} item{lineItems.length !== 1 ? "s" : ""} &nbsp; PKR {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>

                    {/* Discount row */}
                    <div>
                      <button
                        className="flex items-center justify-between w-full py-1 text-primary hover:underline text-sm text-left"
                        onClick={() => setDiscountExpanded((e) => !e)}
                        data-testid="button-toggle-discount"
                      >
                        <span>Add discount</span>
                        <span>
                          {discountExpanded && discountAmount > 0
                            ? `− PKR ${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : "—"}
                        </span>
                      </button>
                      {discountExpanded && (
                        <div className="mt-2 flex gap-2 items-center">
                          <Select value={discountType} onValueChange={(v) => setDiscountType(v as "fixed" | "percentage")}>
                            <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-discount-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fixed">Fixed amount</SelectItem>
                              <SelectItem value="percentage">Percentage</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min="0"
                            placeholder={discountType === "percentage" ? "%" : "PKR"}
                            value={discountValue}
                            onChange={(e) => setDiscountValue(e.target.value)}
                            className="w-32 h-8 text-sm"
                            data-testid="input-discount-value"
                          />
                        </div>
                      )}
                    </div>

                    {/* Shipping row */}
                    <div>
                      <button
                        className="flex items-center justify-between w-full py-1 text-primary hover:underline text-sm text-left"
                        onClick={() => setShippingExpanded((e) => !e)}
                        data-testid="button-toggle-shipping"
                      >
                        <span>Add shipping or delivery</span>
                        <span>
                          {shippingExpanded && shipAmt > 0
                            ? `PKR ${shipAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : "—"}
                        </span>
                      </button>
                      {shippingExpanded && (
                        <div className="mt-2 flex gap-2 items-center">
                          <Input
                            type="number"
                            min="0"
                            placeholder="Shipping amount"
                            value={shippingAmount}
                            onChange={(e) => setShippingAmount(e.target.value)}
                            className="w-40 h-8 text-sm"
                            data-testid="input-shipping-amount"
                          />
                          <span className="text-muted-foreground text-xs">PKR</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between py-2 border-t mt-1 font-semibold">
                      <span>Total</span>
                      <span>PKR {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>

                    {/* Payment toggle */}
                    <div className="pt-2 flex items-center gap-3 border-t">
                      <Checkbox
                        id="payment-due-later"
                        checked={!markAsPaid}
                        onCheckedChange={(v) => setMarkAsPaid(!v)}
                        data-testid="checkbox-payment-due-later"
                      />
                      <Label htmlFor="payment-due-later" className="cursor-pointer text-sm font-normal">
                        Payment due later (COD)
                      </Label>
                    </div>
                    {markAsPaid && (
                      <div className="pt-1 text-xs text-green-600 dark:text-green-400 font-medium pl-7">
                        ✓ Marking as paid
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="p-6 flex flex-col gap-6 bg-muted/20">
                {/* CUSTOMER */}
                <div className="rounded-lg border bg-card">
                  <div className="px-4 py-3 border-b">
                    <h3 className="font-medium flex items-center gap-2">
                      <User className="w-4 h-4" /> Customer
                    </h3>
                  </div>
                  <div className="p-4 flex flex-col gap-3">
                    {shopifyError && (
                      <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-400" data-testid="status-shopify-error">
                        ⚠ {shopifyError} — customer search unavailable
                      </div>
                    )}
                    <div className="relative" ref={customerDropdownRef}>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search or create a customer"
                          value={customerSearch}
                          onChange={(e) => {
                            setCustomerSearch(e.target.value);
                            setCustomerDropdownOpen(true);
                            if (!e.target.value) {
                              setCustomer({ name: "", phone: "", address: "", city: "" });
                            }
                          }}
                          onFocus={() => setCustomerDropdownOpen(true)}
                          className="pl-9 text-sm"
                          data-testid="input-customer-search"
                        />
                        {customersLoading && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      {customerDropdownOpen && debouncedCustomerSearch && (
                        <div className="absolute top-full left-0 right-0 z-50 bg-popover border rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
                          {(customerResults || []).length === 0 && !customersLoading ? (
                            <div className="p-3">
                              <button
                                className="w-full text-left text-sm text-primary hover:underline"
                                onClick={() => {
                                  setShowNewCustomer(true);
                                  setCustomer((c) => ({ ...c, name: customerSearch }));
                                  setCustomerDropdownOpen(false);
                                }}
                                data-testid="button-create-new-customer"
                              >
                                + Create "{customerSearch}" as new customer
                              </button>
                            </div>
                          ) : (
                            (customerResults || []).map((c) => (
                              <button
                                key={c.id}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex flex-col gap-0.5"
                                onClick={() => selectCustomer(c)}
                                data-testid={`option-customer-${c.id}`}
                              >
                                <span className="font-medium">{c.name}</span>
                                <span className="text-muted-foreground text-xs">{c.phone || c.email || "No contact"}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {(customer.shopifyCustomerId || showNewCustomer) && (
                      <div className="flex flex-col gap-2 mt-1">
                        <Input
                          placeholder="Full name"
                          value={customer.name}
                          onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                          className="text-sm"
                          data-testid="input-customer-name"
                        />
                        <Input
                          placeholder="Phone number"
                          value={customer.phone}
                          onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
                          className="text-sm"
                          data-testid="input-customer-phone"
                        />
                        <Input
                          placeholder="Address"
                          value={customer.address}
                          onChange={(e) => setCustomer((c) => ({ ...c, address: e.target.value }))}
                          className="text-sm"
                          data-testid="input-customer-address"
                        />
                        <Input
                          placeholder="City"
                          value={customer.city}
                          onChange={(e) => setCustomer((c) => ({ ...c, city: e.target.value }))}
                          className="text-sm"
                          data-testid="input-customer-city"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* NOTES */}
                <div className="rounded-lg border bg-card">
                  <div className="px-4 py-3 border-b">
                    <h3 className="font-medium">Notes</h3>
                  </div>
                  <div className="p-4">
                    <Textarea
                      placeholder="Add a note to this order..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="text-sm resize-none min-h-[80px]"
                      data-testid="textarea-order-note"
                    />
                  </div>
                </div>

                {/* TAGS */}
                <div className="rounded-lg border bg-card">
                  <div className="px-4 py-3 border-b">
                    <h3 className="font-medium">Tags</h3>
                  </div>
                  <div className="p-4 flex flex-col gap-2">
                    {tags && (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.split(",").map((t) => t.trim()).filter(Boolean).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
                            {tag}
                            <button onClick={() => removeTag(tag)} className="hover:text-destructive" data-testid={`button-remove-tag-${tag}`}>
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add tag..."
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                        className="text-sm h-8"
                        data-testid="input-tag"
                      />
                      <Button variant="outline" size="sm" onClick={addTag} className="h-8 px-3" data-testid="button-add-tag">
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="px-6 py-4 border-t bg-background shrink-0 flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              {lineItems.length > 0 && (
                <span>{lineItems.reduce((s, i) => s + i.quantity, 0)} item{lineItems.reduce((s, i) => s + i.quantity, 0) !== 1 ? "s" : ""} · PKR {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} disabled={createMutation.isPending}>Cancel</Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || lineItems.length === 0}
                className="min-w-32"
                data-testid="button-create-order"
              >
                {createMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</>
                ) : (
                  "Create Order"
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ProductPicker
        open={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        onAdd={(items) => setLineItems((prev) => {
          const next = [...prev];
          for (const item of items) {
            const existing = next.findIndex((i) => i.shopifyVariantId === item.shopifyVariantId);
            if (existing >= 0) {
              next[existing] = { ...next[existing], quantity: next[existing].quantity + 1 };
            } else {
              next.push(item);
            }
          }
          return next;
        })}
      />
    </>
  );
}
