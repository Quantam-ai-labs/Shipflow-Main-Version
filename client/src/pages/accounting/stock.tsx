import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { formatPkDate } from "@/lib/dateFormat";
import { exportCsvWithDate } from "@/lib/exportCsv";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Package, ArrowDownLeft, ArrowUpRight, RotateCcw, Plus, Pencil, Trash2,
  Loader2, Calendar, Filter, Download, ChevronDown, ChevronRight,
} from "lucide-react";
import type { StockLedgerEntry } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReceiptItem {
  productId: string;
  productName?: string;
  quantity: number | string;
  unitCost: number | string;
  lineTotal: string;
  allocatedExtra?: string;
  finalUnitCost?: string;
}

interface StockReceipt {
  id: string;
  supplierId: string;
  supplierName?: string;
  paymentType: string;
  extraCosts: string;
  itemsSubtotal: string;
  inventoryValue: string;
  description?: string;
  date: string;
  items: ReceiptItem[];
}

interface Product { id: string; name: string; }
interface CashAccount { id: string; name: string; balance: string; }
interface Party { id: string; name: string; type: string; }
interface FormItem { productId: string; quantity: string; unitCost: string; }

interface StockSummary {
  incoming: { totalQuantity: number; totalValue: number };
  outgoing: { totalQuantity: number; totalValue: number };
  return: { totalQuantity: number; totalValue: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split("T")[0];
const emptyItem = (): FormItem => ({ productId: "", quantity: "", unitCost: "" });

function formatPKR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs. 0";
  return `Rs. ${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const TYPE_BADGE_STYLES: Record<string, string> = {
  incoming: "bg-green-500/10 text-green-600 border-green-500/20",
  outgoing: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  return: "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

const TYPE_LABELS: Record<string, string> = {
  incoming: "Incoming",
  outgoing: "Outgoing",
  return: "Return",
};

const stockLedgerFormSchema = z.object({
  type: z.enum(["incoming", "outgoing", "return"], { required_error: "Type is required" }),
  productName: z.string().min(1, "Product name is required"),
  sku: z.string().optional(),
  quantity: z.string().min(1, "Quantity is required").refine(
    (v) => !isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)),
    "Must be a positive integer"
  ),
  unitPrice: z.string().min(1, "Unit price is required").refine(
    (v) => !isNaN(Number(v)) && Number(v) >= 0,
    "Must be a non-negative number"
  ),
  supplier: z.string().optional(),
  reference: z.string().optional(),
  date: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
});

type StockLedgerFormValues = z.infer<typeof stockLedgerFormSchema>;

// ─── Stock Receipts Tab ────────────────────────────────────────────────────────

function StockReceiptsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formItems, setFormItems] = useState<FormItem[]>([emptyItem()]);
  const [supplierId, setSupplierId] = useState("");
  const [paymentType, setPaymentType] = useState("PAID_NOW");
  const [cashAccountId, setCashAccountId] = useState("");
  const [extraCosts, setExtraCosts] = useState("");
  const [description, setDescription] = useState("");
  const [dateStr, setDateStr] = useState(todayStr());
  const [expandedReceipts, setExpandedReceipts] = useState<Set<string>>(new Set());

  const { data: receipts = [], isLoading } = useQuery<StockReceipt[]>({
    queryKey: ["/api/accounting/stock-receipts"],
  });
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/accounting/products"],
  });
  const { data: cashAccounts = [] } = useQuery<CashAccount[]>({
    queryKey: ["/api/accounting/cash-accounts"],
  });
  const { data: suppliers = [] } = useQuery<Party[]>({
    queryKey: ["/api/accounting/parties?type=supplier"],
  });

  function resetForm() {
    setFormItems([emptyItem()]);
    setSupplierId("");
    setPaymentType("PAID_NOW");
    setCashAccountId("");
    setExtraCosts("");
    setDescription("");
    setDateStr(todayStr());
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        items: formItems.map((i) => ({
          productId: i.productId,
          quantity: parseFloat(i.quantity),
          unitCost: parseFloat(i.unitCost),
        })),
        supplierId,
        paymentType,
        extraCosts: parseFloat(extraCosts) || 0,
        description: description || undefined,
        date: dateStr,
      };
      if (paymentType === "PAID_NOW") body.cashAccountId = cashAccountId;
      const res = await apiRequest("POST", "/api/accounting/stock-receipts", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/stock-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/cash-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/reports/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/parties"] });
      toast({ title: "Stock receipt recorded successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to record stock receipt", description: err.message, variant: "destructive" });
    },
  });

  function handleSubmit() {
    if (formItems.length === 0) { toast({ title: "Add at least one item", variant: "destructive" }); return; }
    for (let i = 0; i < formItems.length; i++) {
      const item = formItems[i];
      if (!item.productId) { toast({ title: `Item ${i + 1}: Select a product`, variant: "destructive" }); return; }
      if (!item.quantity || parseFloat(item.quantity) <= 0) { toast({ title: `Item ${i + 1}: Quantity must be > 0`, variant: "destructive" }); return; }
      if (item.unitCost === "" || parseFloat(item.unitCost) < 0) { toast({ title: `Item ${i + 1}: Unit cost must be >= 0`, variant: "destructive" }); return; }
    }
    const pIds = formItems.map((i) => i.productId);
    if (new Set(pIds).size !== pIds.length) { toast({ title: "Duplicate products found. Each product can only appear once.", variant: "destructive" }); return; }
    if (!supplierId) { toast({ title: "Supplier is required", variant: "destructive" }); return; }
    if (paymentType === "PAID_NOW" && !cashAccountId) { toast({ title: "Cash/Bank account is required for Paid Now", variant: "destructive" }); return; }
    createMutation.mutate();
  }

  function updateItem(index: number, field: keyof FormItem, value: string) {
    setFormItems((prev) => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }
  function addItem() { setFormItems((prev) => [...prev, emptyItem()]); }
  function removeItem(index: number) {
    if (formItems.length <= 1) return;
    setFormItems((prev) => prev.filter((_, i) => i !== index));
  }
  function getLineTotal(item: FormItem): number {
    return (parseFloat(item.quantity) || 0) * (parseFloat(item.unitCost) || 0);
  }
  function isProductUsed(productId: string, currentIndex: number): boolean {
    return formItems.some((item, i) => i !== currentIndex && item.productId === productId);
  }
  function toggleExpanded(id: string) {
    setExpandedReceipts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const itemsSubtotal = formItems.reduce((s, i) => s + getLineTotal(i), 0);
  const extraVal = parseFloat(extraCosts) || 0;
  const inventoryValue = itemsSubtotal + extraVal;

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-add-stock-receipt">
          <Plus className="w-4 h-4 mr-2" />
          Add Receipt
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : receipts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground" data-testid="text-no-receipts">
              No stock receipts yet. Add your first stock receipt.
            </div>
          ) : (
            <Table data-testid="table-stock-receipts">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Extra Costs</TableHead>
                  <TableHead className="text-right">Inventory Value</TableHead>
                  <TableHead>Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((receipt) => {
                  const expanded = expandedReceipts.has(receipt.id);
                  const itemCount = receipt.items?.length || 0;
                  const itemSummary = receipt.items?.map((i) => i.productName).filter(Boolean).join(", ") || "-";
                  return (
                    <React.Fragment key={receipt.id}>
                      <TableRow className="cursor-pointer" onClick={() => toggleExpanded(receipt.id)} data-testid={`row-receipt-${receipt.id}`}>
                        <TableCell>
                          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </TableCell>
                        <TableCell data-testid={`text-receipt-date-${receipt.id}`}>{formatPkDate(receipt.date)}</TableCell>
                        <TableCell data-testid={`text-receipt-supplier-${receipt.id}`}>{receipt.supplierName || "-"}</TableCell>
                        <TableCell className="max-w-[200px] truncate" data-testid={`text-receipt-items-${receipt.id}`}>
                          {itemCount} item{itemCount !== 1 ? "s" : ""}: {itemSummary}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-receipt-subtotal-${receipt.id}`}>{formatPKR(receipt.itemsSubtotal)}</TableCell>
                        <TableCell className="text-right" data-testid={`text-receipt-extra-${receipt.id}`}>{formatPKR(receipt.extraCosts)}</TableCell>
                        <TableCell className="text-right font-medium" data-testid={`text-receipt-total-${receipt.id}`}>{formatPKR(receipt.inventoryValue)}</TableCell>
                        <TableCell data-testid={`text-receipt-payment-${receipt.id}`}>
                          <Badge variant={receipt.paymentType === "CREDIT" ? "outline" : "secondary"} className="text-xs">
                            {receipt.paymentType === "CREDIT" ? "Credit" : "Paid"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {expanded && receipt.items?.map((item, idx) => (
                        <TableRow key={`${receipt.id}-item-${idx}`} className="bg-muted/30">
                          <TableCell /><TableCell /><TableCell />
                          <TableCell className="font-medium">{item.productName || "-"}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {item.quantity} x {formatPKR(item.unitCost)} = {formatPKR(item.lineTotal)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatPKR(item.allocatedExtra || "0")}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatPKR(item.finalUnitCost || "0")}/unit</TableCell>
                          <TableCell />
                        </TableRow>
                      ))}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-stock-receipt-form">
          <DialogHeader>
            <DialogTitle>Add Stock Receipt</DialogTitle>
            <DialogDescription>Record a purchase with multiple products from a single supplier.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base font-semibold">Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem} data-testid="button-add-item">
                  <Plus className="w-3 h-3 mr-1" /> Add Item
                </Button>
              </div>
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Product *</TableHead>
                      <TableHead className="w-[100px]">Qty *</TableHead>
                      <TableHead className="w-[120px]">Unit Cost *</TableHead>
                      <TableHead className="w-[120px] text-right">Line Total</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formItems.map((item, index) => {
                      const lt = getLineTotal(item);
                      return (
                        <TableRow key={index}>
                          <TableCell className="p-2">
                            <Select value={item.productId} onValueChange={(v) => {
                              if (isProductUsed(v, index)) { toast({ title: "Product already added", variant: "destructive" }); return; }
                              updateItem(index, "productId", v);
                            }}>
                              <SelectTrigger className="h-9" data-testid={`select-item-product-${index}`}>
                                <SelectValue placeholder="Select product" />
                              </SelectTrigger>
                              <SelectContent>
                                {products.map((p) => (
                                  <SelectItem key={p.id} value={p.id} disabled={isProductUsed(p.id, index)}>{p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="p-2">
                            <Input type="number" step="1" min="1" className="h-9" value={item.quantity}
                              onChange={(e) => updateItem(index, "quantity", e.target.value)}
                              placeholder="0" data-testid={`input-item-qty-${index}`} />
                          </TableCell>
                          <TableCell className="p-2">
                            <Input type="number" step="0.01" min="0" className="h-9" value={item.unitCost}
                              onChange={(e) => updateItem(index, "unitCost", e.target.value)}
                              placeholder="0.00" data-testid={`input-item-unitcost-${index}`} />
                          </TableCell>
                          <TableCell className="p-2 text-right font-medium" data-testid={`text-item-linetotal-${index}`}>
                            {lt > 0 ? formatPKR(lt) : "-"}
                          </TableCell>
                          <TableCell className="p-2">
                            {formItems.length > 1 && (
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
                                onClick={() => removeItem(index)} data-testid={`button-remove-item-${index}`}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="receipt-extracosts">Extra Costs (shipping / customs)</Label>
              <Input id="receipt-extracosts" type="number" step="0.01" min="0" value={extraCosts}
                onChange={(e) => setExtraCosts(e.target.value)} placeholder="0.00"
                data-testid="input-receipt-extracosts" />
            </div>

            <div className="bg-muted/50 rounded-md p-3 space-y-1 text-sm" data-testid="text-totals-preview">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items Subtotal</span>
                <span className="font-medium">{formatPKR(itemsSubtotal)}</span>
              </div>
              {extraVal > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Extra Costs</span>
                  <span className="font-medium">+ {formatPKR(extraVal)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="font-semibold">Inventory Value</span>
                <span className="font-bold text-base">{formatPKR(inventoryValue)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Supplier Party *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger data-testid="select-receipt-supplier">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id} data-testid={`option-supplier-${s.id}`}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Payment Type *</Label>
              <RadioGroup value={paymentType} onValueChange={(v) => { setPaymentType(v); if (v === "CREDIT") setCashAccountId(""); }}
                className="flex gap-4" data-testid="radio-payment-type">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="PAID_NOW" id="paid-now" data-testid="radio-paid-now" />
                  <Label htmlFor="paid-now" className="cursor-pointer font-normal">Paid Now</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="CREDIT" id="credit" data-testid="radio-credit" />
                  <Label htmlFor="credit" className="cursor-pointer font-normal">Pay Later (Credit)</Label>
                </div>
              </RadioGroup>
            </div>

            {paymentType === "PAID_NOW" && (
              <div className="space-y-2">
                <Label>Cash/Bank Account *</Label>
                <Select value={cashAccountId} onValueChange={setCashAccountId}>
                  <SelectTrigger data-testid="select-receipt-account"><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {cashAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} data-testid={`option-account-${a.id}`}>
                        {a.name} ({formatPKR(a.balance)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {paymentType === "CREDIT" && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-3 text-sm text-blue-300" data-testid="text-credit-info">
                This purchase will be added to the supplier's payable balance. Pay the supplier later via "Money Out".
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="receipt-description">Description</Label>
              <Input id="receipt-description" value={description}
                onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes"
                data-testid="input-receipt-description" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receipt-date">Date</Label>
              <Input id="receipt-date" type="date" value={dateStr}
                onChange={(e) => setDateStr(e.target.value)} data-testid="input-receipt-date" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} data-testid="button-cancel">Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit-receipt">
              {createMutation.isPending ? "Saving..." : "Add Stock Receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Stock Ledger Tab ──────────────────────────────────────────────────────────

function StockLedgerTab() {
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<StockLedgerEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<StockLedgerEntry | null>(null);

  const buildQueryUrl = () => {
    const params = new URLSearchParams();
    if (typeFilter && typeFilter !== "all") params.set("type", typeFilter);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    const qs = params.toString();
    return `/api/stock-ledger${qs ? `?${qs}` : ""}`;
  };

  const buildSummaryUrl = () => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    const qs = params.toString();
    return `/api/stock-ledger/summary${qs ? `?${qs}` : ""}`;
  };

  const { data: entries, isLoading } = useQuery<StockLedgerEntry[]>({ queryKey: [buildQueryUrl()] });
  const { data: summary } = useQuery<StockSummary>({ queryKey: [buildSummaryUrl()] });

  const form = useForm<StockLedgerFormValues>({
    resolver: zodResolver(stockLedgerFormSchema),
    defaultValues: {
      type: "incoming",
      productName: "",
      sku: "",
      quantity: "",
      unitPrice: "",
      supplier: "",
      reference: "",
      date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    },
  });

  const watchQuantity = form.watch("quantity");
  const watchUnitPrice = form.watch("unitPrice");
  const calculatedTotal = (() => {
    const qty = Number(watchQuantity);
    const price = Number(watchUnitPrice);
    return (!isNaN(qty) && !isNaN(price) && qty > 0 && price >= 0) ? qty * price : 0;
  })();

  const createMutation = useMutation({
    mutationFn: (data: StockLedgerFormValues) =>
      apiRequest("POST", "/api/stock-ledger", {
        ...data,
        quantity: Number(data.quantity),
        unitPrice: data.unitPrice,
        totalValue: String(Number(data.quantity) * Number(data.unitPrice)),
        date: new Date(data.date).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/stock-ledger") });
      toast({ title: "Entry created", description: "Stock ledger entry has been added." });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: StockLedgerFormValues }) =>
      apiRequest("PUT", `/api/stock-ledger/${id}`, {
        ...data,
        quantity: Number(data.quantity),
        unitPrice: data.unitPrice,
        totalValue: String(Number(data.quantity) * Number(data.unitPrice)),
        date: new Date(data.date).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/stock-ledger") });
      toast({ title: "Entry updated", description: "Stock ledger entry has been updated." });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/stock-ledger/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/stock-ledger") });
      toast({ title: "Entry deleted", description: "Stock ledger entry has been removed." });
      setDeleteEntry(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openAddDialog = () => {
    setEditingEntry(null);
    form.reset({ type: "incoming", productName: "", sku: "", quantity: "", unitPrice: "", supplier: "", reference: "", date: format(new Date(), "yyyy-MM-dd"), notes: "" });
    setDialogOpen(true);
  };

  const openEditDialog = (entry: StockLedgerEntry) => {
    setEditingEntry(entry);
    form.reset({
      type: entry.type as "incoming" | "outgoing" | "return",
      productName: entry.productName,
      sku: entry.sku || "",
      quantity: String(entry.quantity),
      unitPrice: String(entry.unitPrice),
      supplier: entry.supplier || "",
      reference: entry.reference || "",
      date: entry.date ? format(new Date(entry.date), "yyyy-MM-dd") : "",
      notes: entry.notes || "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditingEntry(null); form.reset(); };
  const onSubmit = (values: StockLedgerFormValues) => {
    if (editingEntry) updateMutation.mutate({ id: editingEntry.id, data: values });
    else createMutation.mutate(values);
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;
  const incomingSummary = summary?.incoming || { totalQuantity: 0, totalValue: 0 };
  const outgoingSummary = summary?.outgoing || { totalQuantity: 0, totalValue: 0 };
  const returnSummary = summary?.return || { totalQuantity: 0, totalValue: 0 };
  const netQty = incomingSummary.totalQuantity - outgoingSummary.totalQuantity - returnSummary.totalQuantity;
  const netValue = incomingSummary.totalValue - outgoingSummary.totalValue - returnSummary.totalValue;

  return (
    <>
      <div className="flex justify-end mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => {
            if (!entries || entries.length === 0) return;
            const headers = ["Date", "Product", "SKU", "Type", "Quantity", "Unit Price", "Total Value", "Supplier"];
            const rows = entries.map((e) => [
              formatPkDate(e.date), e.productName, e.sku || "",
              TYPE_LABELS[e.type] || e.type, String(e.quantity),
              String(e.unitPrice), String(e.totalValue), e.supplier || "",
            ]);
            exportCsvWithDate("stock-ledger", headers, rows);
          }} disabled={!entries || entries.length === 0} data-testid="button-export-stock-ledger">
            <Download className="w-4 h-4 mr-2" />Export
          </Button>
          <Button onClick={openAddDialog} data-testid="button-add-entry">
            <Plus className="w-4 h-4 mr-2" />Add Entry
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Incoming Stock</CardTitle>
            <ArrowDownLeft className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-incoming-value">{summary ? formatPKR(incomingSummary.totalValue) : <Skeleton className="h-8 w-32" />}</p>
            <p className="text-xs text-muted-foreground" data-testid="text-incoming-qty">{summary ? `${incomingSummary.totalQuantity.toLocaleString()} units` : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outgoing Stock</CardTitle>
            <ArrowUpRight className="w-4 h-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-outgoing-value">{summary ? formatPKR(outgoingSummary.totalValue) : <Skeleton className="h-8 w-32" />}</p>
            <p className="text-xs text-muted-foreground" data-testid="text-outgoing-qty">{summary ? `${outgoingSummary.totalQuantity.toLocaleString()} units` : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Returns</CardTitle>
            <RotateCcw className="w-4 h-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-return-value">{summary ? formatPKR(returnSummary.totalValue) : <Skeleton className="h-8 w-32" />}</p>
            <p className="text-xs text-muted-foreground" data-testid="text-return-qty">{summary ? `${returnSummary.totalQuantity.toLocaleString()} units` : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Stock</CardTitle>
            <Package className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-net-value">{summary ? formatPKR(netValue) : <Skeleton className="h-8 w-32" />}</p>
            <p className="text-xs text-muted-foreground" data-testid="text-net-qty">{summary ? `${netQty.toLocaleString()} units` : ""}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-type-filter">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="incoming">Incoming</SelectItem>
            <SelectItem value="outgoing">Outgoing</SelectItem>
            <SelectItem value="return">Return</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[160px]" data-testid="input-start-date" />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[160px]" data-testid="input-end-date" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !entries || entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center" data-testid="empty-state-stock-ledger">
              <Package className="w-12 h-12 text-muted-foreground mb-3" />
              <h3 className="font-semibold text-lg mb-1">No stock entries found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {typeFilter !== "all" || startDate || endDate ? "Try adjusting your filters" : "Add your first stock entry to get started"}
              </p>
              {typeFilter === "all" && !startDate && !endDate && (
                <Button onClick={openAddDialog} data-testid="button-add-entry-empty"><Plus className="w-4 h-4 mr-2" />Add Entry</Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit Price</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id} data-testid={`row-entry-${entry.id}`}>
                    <TableCell className="text-sm" data-testid={`text-entry-date-${entry.id}`}>{formatPkDate(entry.date)}</TableCell>
                    <TableCell><p className="font-medium" data-testid={`text-entry-product-${entry.id}`}>{entry.productName}</p></TableCell>
                    <TableCell className="text-sm text-muted-foreground" data-testid={`text-entry-sku-${entry.id}`}>{entry.sku || "-"}</TableCell>
                    <TableCell>
                      <Badge className={TYPE_BADGE_STYLES[entry.type] || ""} data-testid={`badge-entry-type-${entry.id}`}>
                        {TYPE_LABELS[entry.type] || entry.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm" data-testid={`text-entry-qty-${entry.id}`}>{entry.quantity.toLocaleString()}</TableCell>
                    <TableCell className="text-sm" data-testid={`text-entry-unit-price-${entry.id}`}>{formatPKR(entry.unitPrice)}</TableCell>
                    <TableCell className="font-medium" data-testid={`text-entry-total-${entry.id}`}>{formatPKR(entry.totalValue)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground" data-testid={`text-entry-supplier-${entry.id}`}>{entry.supplier || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(entry)} data-testid={`button-edit-entry-${entry.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteEntry(entry)} data-testid={`button-delete-entry-${entry.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">{editingEntry ? "Edit Stock Entry" : "Add Stock Entry"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger data-testid="select-entry-type"><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="incoming">Incoming</SelectItem>
                      <SelectItem value="outgoing">Outgoing</SelectItem>
                      <SelectItem value="return">Return</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="productName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Name</FormLabel>
                  <FormControl><Input placeholder="Enter product name" {...field} data-testid="input-product-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="sku" render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl><Input placeholder="Optional SKU" {...field} data-testid="input-sku" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl><Input type="date" {...field} data-testid="input-entry-date" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="quantity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl><Input type="number" step="1" min="1" placeholder="0" {...field} data-testid="input-quantity" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="unitPrice" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Price</FormLabel>
                    <FormControl><Input type="number" step="0.01" min="0" placeholder="0.00" {...field} data-testid="input-unit-price" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {calculatedTotal > 0 && (
                <div className="bg-muted/50 rounded-md p-3 text-sm flex justify-between">
                  <span className="text-muted-foreground">Total Value</span>
                  <span className="font-semibold">{formatPKR(calculatedTotal)}</span>
                </div>
              )}

              <FormField control={form.control} name="supplier" render={({ field }) => (
                <FormItem>
                  <FormLabel>Supplier</FormLabel>
                  <FormControl><Input placeholder="Optional supplier name" {...field} data-testid="input-supplier" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="reference" render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference</FormLabel>
                  <FormControl><Input placeholder="Invoice / PO number" {...field} data-testid="input-reference" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea placeholder="Any additional notes..." {...field} data-testid="input-notes" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button type="submit" disabled={isMutating} data-testid="button-submit-entry">
                  {isMutating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : editingEntry ? "Update Entry" : "Add Entry"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteEntry} onOpenChange={(open) => { if (!open) setDeleteEntry(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete stock entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the entry for <strong>{deleteEntry?.productName}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteEntry && deleteMutation.mutate(deleteEntry.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AccountingStock() {
  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const defaultTab = searchParams.get("tab") === "ledger" ? "ledger" : "receipts";
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <div className="space-y-6" data-testid="accounting-stock">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Stock</h1>
          <p className="text-muted-foreground mt-1">
            {activeTab === "receipts" ? "Record inventory purchases from suppliers" : "Track incoming, outgoing, and returned stock movements"}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="tabs-stock">
        <TabsList>
          <TabsTrigger value="receipts" data-testid="tab-receipts">Stock Receipts</TabsTrigger>
          <TabsTrigger value="ledger" data-testid="tab-ledger">Stock Ledger</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === "receipts" ? <StockReceiptsTab /> : <StockLedgerTab />}
    </div>
  );
}
