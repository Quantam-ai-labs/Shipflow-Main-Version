import { useState } from "react";
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
import {
  RadioGroup, RadioGroupItem,
} from "@/components/ui/radio-group";
import { Plus } from "lucide-react";

interface StockReceipt {
  id: string;
  productId: string;
  productName?: string;
  quantity: number | string;
  unitCost: number | string;
  extraCosts?: number | string;
  totalLandedCost?: number | string;
  supplierName?: string;
  paymentType?: string;
  paidNow?: boolean;
  date: string;
}

interface Product {
  id: string;
  name: string;
}

interface CashAccount {
  id: string;
  name: string;
  balance: string;
}

interface Party {
  id: string;
  name: string;
  type: string;
}

interface ReceiptFormData {
  productId: string;
  quantity: string;
  unitCost: string;
  extraCosts: string;
  paymentType: string;
  cashAccountId: string;
  supplierId: string;
  description: string;
  date: string;
}

const todayStr = () => new Date().toISOString().split("T")[0];

const emptyForm: ReceiptFormData = {
  productId: "", quantity: "", unitCost: "", extraCosts: "",
  paymentType: "PAID_NOW", cashAccountId: "", supplierId: "", description: "", date: todayStr(),
};

function formatPKR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs. 0";
  return `Rs. ${num.toLocaleString()}`;
}

export default function AccountingStockReceipts() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState<ReceiptFormData>(emptyForm);

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

  const createMutation = useMutation({
    mutationFn: async (data: ReceiptFormData) => {
      const body: any = {
        productId: data.productId,
        supplierId: data.supplierId,
        quantity: parseFloat(data.quantity),
        unitCost: parseFloat(data.unitCost),
        extraCosts: data.extraCosts ? parseFloat(data.extraCosts) : 0,
        paymentType: data.paymentType,
        date: data.date,
        notes: data.description || undefined,
      };
      if (data.paymentType === "PAID_NOW") {
        body.cashAccountId = data.cashAccountId;
      }
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
      setFormData(emptyForm);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to record stock receipt", description: err.message, variant: "destructive" });
    },
  });

  function handleSubmit() {
    if (!formData.productId) {
      toast({ title: "Product is required", variant: "destructive" });
      return;
    }
    if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
      toast({ title: "Valid quantity is required", variant: "destructive" });
      return;
    }
    if (!formData.unitCost || parseFloat(formData.unitCost) <= 0) {
      toast({ title: "Valid unit cost is required", variant: "destructive" });
      return;
    }
    if (!formData.supplierId) {
      toast({ title: "Supplier is required", variant: "destructive" });
      return;
    }
    if (formData.paymentType === "PAID_NOW" && !formData.cashAccountId) {
      toast({ title: "Cash/Bank account is required for Paid Now", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  }

  const qty = parseFloat(formData.quantity) || 0;
  const uc = parseFloat(formData.unitCost) || 0;
  const ec = parseFloat(formData.extraCosts) || 0;
  const previewInventoryValue = (qty * uc) + ec;

  return (
    <div className="space-y-6" data-testid="accounting-stock-receipts">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Add Stock (Receipts)
          </h1>
          <p className="text-muted-foreground mt-1">
            Record inventory purchases and stock receipts
          </p>
        </div>
        <Button onClick={() => { setFormData(emptyForm); setDialogOpen(true); }} data-testid="button-add-stock-receipt">
          <Plus className="w-4 h-4 mr-2" />
          Add Stock Receipt
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3" data-testid="table-skeleton">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : receipts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground" data-testid="text-no-receipts">
              No stock receipts yet. Add your first stock receipt.
            </div>
          ) : (
            <Table data-testid="table-stock-receipts">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Extra Costs</TableHead>
                  <TableHead className="text-right">Total Landed Cost</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((receipt) => {
                  const qty = typeof receipt.quantity === "string" ? parseFloat(receipt.quantity) : receipt.quantity;
                  const unitCost = typeof receipt.unitCost === "string" ? parseFloat(receipt.unitCost) : receipt.unitCost;
                  const extra = typeof receipt.extraCosts === "string" ? parseFloat(receipt.extraCosts) : (receipt.extraCosts || 0);
                  const totalLanded = receipt.totalLandedCost
                    ? (typeof receipt.totalLandedCost === "string" ? parseFloat(receipt.totalLandedCost) : receipt.totalLandedCost)
                    : (qty * unitCost + extra);
                  const paymentLabel = receipt.paymentType === "CREDIT" ? "Credit" : "Paid";
                  return (
                    <TableRow key={receipt.id} data-testid={`row-receipt-${receipt.id}`}>
                      <TableCell data-testid={`text-receipt-date-${receipt.id}`}>
                        {receipt.date ? format(new Date(receipt.date), "dd MMM yyyy") : "-"}
                      </TableCell>
                      <TableCell className="font-medium" data-testid={`text-receipt-product-${receipt.id}`}>
                        {receipt.productName || "-"}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-receipt-qty-${receipt.id}`}>
                        {qty}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-receipt-unitcost-${receipt.id}`}>
                        {formatPKR(unitCost)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-receipt-extracosts-${receipt.id}`}>
                        {formatPKR(extra)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-receipt-totalcost-${receipt.id}`}>
                        {formatPKR(totalLanded)}
                      </TableCell>
                      <TableCell data-testid={`text-receipt-supplier-${receipt.id}`}>
                        {receipt.supplierName || "-"}
                      </TableCell>
                      <TableCell data-testid={`text-receipt-payment-${receipt.id}`}>
                        <Badge variant={receipt.paymentType === "CREDIT" ? "outline" : "secondary"} className="text-xs">
                          {paymentLabel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setFormData(emptyForm); } }}>
        <DialogContent data-testid="dialog-stock-receipt-form">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">Add Stock Receipt</DialogTitle>
            <DialogDescription>Record a new inventory purchase from a supplier.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Product *</Label>
              <Select value={formData.productId} onValueChange={(v) => setFormData({ ...formData, productId: v })}>
                <SelectTrigger data-testid="select-receipt-product">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id} data-testid={`option-product-${p.id}`}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="receipt-quantity">Quantity *</Label>
                <Input
                  id="receipt-quantity"
                  type="number"
                  step="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder="0"
                  data-testid="input-receipt-quantity"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="receipt-unitcost">Unit Cost *</Label>
                <Input
                  id="receipt-unitcost"
                  type="number"
                  step="0.01"
                  value={formData.unitCost}
                  onChange={(e) => setFormData({ ...formData, unitCost: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-receipt-unitcost"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="receipt-extracosts">Extra Costs (shipping/customs)</Label>
              <Input
                id="receipt-extracosts"
                type="number"
                step="0.01"
                value={formData.extraCosts}
                onChange={(e) => setFormData({ ...formData, extraCosts: e.target.value })}
                placeholder="0.00"
                data-testid="input-receipt-extracosts"
              />
            </div>

            {previewInventoryValue > 0 && (
              <div className="bg-muted/50 rounded-md p-3 text-sm" data-testid="text-inventory-preview">
                <span className="text-muted-foreground">Inventory Value: </span>
                <span className="font-semibold">{formatPKR(previewInventoryValue)}</span>
                <span className="text-muted-foreground ml-2">({qty} x {formatPKR(uc)}{ec > 0 ? ` + ${formatPKR(ec)} extra` : ""})</span>
              </div>
            )}

            <div className="space-y-2">
              <Label>Supplier Party *</Label>
              <Select value={formData.supplierId} onValueChange={(v) => setFormData({ ...formData, supplierId: v })}>
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
                value={formData.paymentType}
                onValueChange={(v) => setFormData({ ...formData, paymentType: v, cashAccountId: v === "CREDIT" ? "" : formData.cashAccountId })}
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

            {formData.paymentType === "PAID_NOW" && (
              <div className="space-y-2">
                <Label>Cash/Bank Account *</Label>
                <Select value={formData.cashAccountId} onValueChange={(v) => setFormData({ ...formData, cashAccountId: v })}>
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

            {formData.paymentType === "CREDIT" && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-3 text-sm text-blue-800 dark:text-blue-200" data-testid="text-credit-info">
                This purchase will be added to the supplier's payable balance. Use "Money Out" in the Money section to pay the supplier later.
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="receipt-description">Description</Label>
              <Input
                id="receipt-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description"
                data-testid="input-receipt-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receipt-date">Date</Label>
              <Input
                id="receipt-date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                data-testid="input-receipt-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setFormData(emptyForm); }} data-testid="button-cancel">
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
