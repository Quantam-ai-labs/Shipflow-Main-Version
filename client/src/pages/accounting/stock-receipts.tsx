import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";

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

interface FormItem {
  productId: string;
  quantity: string;
  unitCost: string;
}

const todayStr = () => new Date().toISOString().split("T")[0];

function formatPKR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs. 0";
  return `Rs. ${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const emptyItem = (): FormItem => ({ productId: "", quantity: "", unitCost: "" });

export default function AccountingStockReceipts() {
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
      const body: any = {
        items: formItems.map(i => ({
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
    if (formItems.length === 0) {
      toast({ title: "Add at least one item", variant: "destructive" }); return;
    }
    for (let i = 0; i < formItems.length; i++) {
      const item = formItems[i];
      if (!item.productId) { toast({ title: `Item ${i + 1}: Select a product`, variant: "destructive" }); return; }
      if (!item.quantity || parseFloat(item.quantity) <= 0) { toast({ title: `Item ${i + 1}: Quantity must be > 0`, variant: "destructive" }); return; }
      if (item.unitCost === "" || parseFloat(item.unitCost) < 0) { toast({ title: `Item ${i + 1}: Unit cost must be >= 0`, variant: "destructive" }); return; }
    }
    const pIds = formItems.map(i => i.productId);
    if (new Set(pIds).size !== pIds.length) { toast({ title: "Duplicate products found. Each product can only appear once.", variant: "destructive" }); return; }
    if (!supplierId) { toast({ title: "Supplier is required", variant: "destructive" }); return; }
    if (paymentType === "PAID_NOW" && !cashAccountId) { toast({ title: "Cash/Bank account is required for Paid Now", variant: "destructive" }); return; }
    createMutation.mutate();
  }

  function updateItem(index: number, field: keyof FormItem, value: string) {
    setFormItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  function addItem() {
    setFormItems(prev => [...prev, emptyItem()]);
  }

  function removeItem(index: number) {
    if (formItems.length <= 1) return;
    setFormItems(prev => prev.filter((_, i) => i !== index));
  }

  function getLineTotal(item: FormItem): number {
    const qty = parseFloat(item.quantity) || 0;
    const uc = parseFloat(item.unitCost) || 0;
    return qty * uc;
  }

  const itemsSubtotal = formItems.reduce((s, i) => s + getLineTotal(i), 0);
  const extraVal = parseFloat(extraCosts) || 0;
  const inventoryValue = itemsSubtotal + extraVal;

  function getProductName(productId: string): string {
    return products.find(p => p.id === productId)?.name || "";
  }

  function isProductUsed(productId: string, currentIndex: number): boolean {
    return formItems.some((item, i) => i !== currentIndex && item.productId === productId);
  }

  function toggleExpanded(receiptId: string) {
    setExpandedReceipts(prev => {
      const next = new Set(prev);
      if (next.has(receiptId)) next.delete(receiptId); else next.add(receiptId);
      return next;
    });
  }

  return (
    <div className="space-y-6" data-testid="accounting-stock-receipts">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Add Stock</h1>
          <p className="text-muted-foreground mt-1">Record inventory purchases from suppliers</p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-add-stock-receipt">
          <Plus className="w-4 h-4 mr-2" /> Add Stock Receipt
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3" data-testid="table-skeleton">
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
                  const itemSummary = receipt.items?.map(i => i.productName).filter(Boolean).join(", ") || "-";
                  return (
                    <React.Fragment key={receipt.id}>
                      <TableRow className="cursor-pointer" onClick={() => toggleExpanded(receipt.id)} data-testid={`row-receipt-${receipt.id}`}>
                        <TableCell>
                          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </TableCell>
                        <TableCell data-testid={`text-receipt-date-${receipt.id}`}>
                          {receipt.date ? format(new Date(receipt.date), "dd MMM yyyy") : "-"}
                        </TableCell>
                        <TableCell data-testid={`text-receipt-supplier-${receipt.id}`}>
                          {receipt.supplierName || "-"}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" data-testid={`text-receipt-items-${receipt.id}`}>
                          {itemCount} item{itemCount !== 1 ? "s" : ""}: {itemSummary}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-receipt-subtotal-${receipt.id}`}>
                          {formatPKR(receipt.itemsSubtotal)}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-receipt-extra-${receipt.id}`}>
                          {formatPKR(receipt.extraCosts)}
                        </TableCell>
                        <TableCell className="text-right font-medium" data-testid={`text-receipt-total-${receipt.id}`}>
                          {formatPKR(receipt.inventoryValue)}
                        </TableCell>
                        <TableCell data-testid={`text-receipt-payment-${receipt.id}`}>
                          <Badge variant={receipt.paymentType === "CREDIT" ? "outline" : "secondary"} className="text-xs">
                            {receipt.paymentType === "CREDIT" ? "Credit" : "Paid"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {expanded && receipt.items?.map((item, idx) => (
                        <TableRow key={`${receipt.id}-item-${idx}`} className="bg-muted/30">
                          <TableCell />
                          <TableCell />
                          <TableCell />
                          <TableCell className="font-medium">{item.productName || "-"}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {item.quantity} x {formatPKR(item.unitCost)} = {formatPKR(item.lineTotal)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatPKR(item.allocatedExtra || "0")}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatPKR(item.finalUnitCost || "0")}/unit
                          </TableCell>
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
            <DialogTitle data-testid="text-dialog-title">Add Stock Receipt</DialogTitle>
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
                              if (isProductUsed(v, index)) {
                                toast({ title: "Product already added", variant: "destructive" });
                                return;
                              }
                              updateItem(index, "productId", v);
                            }}>
                              <SelectTrigger className="h-9" data-testid={`select-item-product-${index}`}>
                                <SelectValue placeholder="Select product" />
                              </SelectTrigger>
                              <SelectContent>
                                {products.map((p) => (
                                  <SelectItem key={p.id} value={p.id} disabled={isProductUsed(p.id, index)}>
                                    {p.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="p-2">
                            <Input
                              type="number" step="1" min="1"
                              className="h-9"
                              value={item.quantity}
                              onChange={(e) => updateItem(index, "quantity", e.target.value)}
                              placeholder="0"
                              data-testid={`input-item-qty-${index}`}
                            />
                          </TableCell>
                          <TableCell className="p-2">
                            <Input
                              type="number" step="0.01" min="0"
                              className="h-9"
                              value={item.unitCost}
                              onChange={(e) => updateItem(index, "unitCost", e.target.value)}
                              placeholder="0.00"
                              data-testid={`input-item-unitcost-${index}`}
                            />
                          </TableCell>
                          <TableCell className="p-2 text-right font-medium" data-testid={`text-item-linetotal-${index}`}>
                            {lt > 0 ? formatPKR(lt) : "-"}
                          </TableCell>
                          <TableCell className="p-2">
                            {formItems.length > 1 && (
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(index)} data-testid={`button-remove-item-${index}`}>
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
              <Input
                id="receipt-extracosts" type="number" step="0.01" min="0"
                value={extraCosts}
                onChange={(e) => setExtraCosts(e.target.value)}
                placeholder="0.00"
                data-testid="input-receipt-extracosts"
              />
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
                    <SelectItem key={s.id} value={s.id} data-testid={`option-supplier-${s.id}`}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Payment Type *</Label>
              <RadioGroup
                value={paymentType}
                onValueChange={(v) => { setPaymentType(v); if (v === "CREDIT") setCashAccountId(""); }}
                className="flex gap-4"
                data-testid="radio-payment-type"
              >
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
                  <SelectTrigger data-testid="select-receipt-account">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
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
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-3 text-sm text-blue-800 dark:text-blue-200" data-testid="text-credit-info">
                This purchase will be added to the supplier's payable balance. Pay the supplier later via "Money Out".
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="receipt-description">Description</Label>
              <Input
                id="receipt-description" value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes"
                data-testid="input-receipt-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receipt-date">Date</Label>
              <Input
                id="receipt-date" type="date" value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                data-testid="input-receipt-date"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} data-testid="button-cancel">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit-receipt">
              {createMutation.isPending ? "Saving..." : "Add Stock Receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
