import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";

interface Sale {
  id: string;
  productId: string;
  productName?: string;
  quantity: number | string;
  salePrice: number | string;
  cogs?: number | string;
  margin?: number | string;
  marginPercent?: number | string;
  customerName?: string;
  accountName?: string;
  description?: string;
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

interface SaleFormData {
  productId: string;
  quantity: string;
  salePrice: string;
  cashAccountId: string;
  partyId: string;
  description: string;
  date: string;
}

const todayStr = () => new Date().toISOString().split("T")[0];

const emptyForm: SaleFormData = {
  productId: "", quantity: "", salePrice: "",
  cashAccountId: "", partyId: "", description: "", date: todayStr(),
};

function formatPKR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs. 0";
  return `Rs. ${num.toLocaleString()}`;
}

export default function AccountingSales() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState<SaleFormData>(emptyForm);

  const { data: salesList = [], isLoading } = useQuery<Sale[]>({
    queryKey: ["/api/accounting/sales"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/accounting/products"],
  });

  const { data: cashAccounts = [] } = useQuery<CashAccount[]>({
    queryKey: ["/api/accounting/cash-accounts"],
  });

  const { data: customers = [] } = useQuery<Party[]>({
    queryKey: ["/api/accounting/parties?type=customer"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: SaleFormData) => {
      const res = await apiRequest("POST", "/api/accounting/sales", {
        productId: data.productId,
        quantity: parseFloat(data.quantity),
        salePrice: parseFloat(data.salePrice),
        cashAccountId: data.cashAccountId,
        partyId: data.partyId || undefined,
        description: data.description || undefined,
        date: data.date,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/cash-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/reports/overview"] });
      toast({ title: "Sale recorded successfully" });
      setDialogOpen(false);
      setFormData(emptyForm);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to record sale", description: err.message, variant: "destructive" });
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
    if (!formData.salePrice || parseFloat(formData.salePrice) <= 0) {
      toast({ title: "Valid sale price is required", variant: "destructive" });
      return;
    }
    if (!formData.cashAccountId) {
      toast({ title: "Cash account is required", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  }

  return (
    <div className="space-y-6" data-testid="accounting-sales">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Sales
          </h1>
          <p className="text-muted-foreground mt-1">
            Record sales and track COGS and margins
          </p>
        </div>
        <Button onClick={() => { setFormData(emptyForm); setDialogOpen(true); }} data-testid="button-record-sale">
          <Plus className="w-4 h-4 mr-2" />
          Record Sale
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
          ) : salesList.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground" data-testid="text-no-sales">
              No sales recorded yet. Record your first sale.
            </div>
          ) : (
            <Table data-testid="table-sales">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Sale Price</TableHead>
                  <TableHead className="text-right">COGS</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Account</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesList.map((sale) => {
                  const qty = typeof sale.quantity === "string" ? parseFloat(sale.quantity) : sale.quantity;
                  const price = typeof sale.salePrice === "string" ? parseFloat(sale.salePrice) : sale.salePrice;
                  const cogs = typeof sale.cogs === "string" ? parseFloat(sale.cogs) : (sale.cogs || 0);
                  const totalRevenue = qty * price;
                  const marginAmt = totalRevenue - cogs;
                  const marginPct = totalRevenue > 0 ? ((marginAmt / totalRevenue) * 100).toFixed(1) : "0.0";
                  return (
                    <TableRow key={sale.id} data-testid={`row-sale-${sale.id}`}>
                      <TableCell data-testid={`text-sale-date-${sale.id}`}>
                        {sale.date ? format(new Date(sale.date), "dd MMM yyyy") : "-"}
                      </TableCell>
                      <TableCell className="font-medium" data-testid={`text-sale-product-${sale.id}`}>
                        {sale.productName || "-"}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-sale-qty-${sale.id}`}>
                        {qty}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-sale-price-${sale.id}`}>
                        {formatPKR(price)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-sale-cogs-${sale.id}`}>
                        {formatPKR(cogs)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-sale-margin-${sale.id}`}>
                        <span className={marginAmt >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                          {formatPKR(marginAmt)} ({marginPct}%)
                        </span>
                      </TableCell>
                      <TableCell data-testid={`text-sale-customer-${sale.id}`}>
                        {sale.customerName || "-"}
                      </TableCell>
                      <TableCell data-testid={`text-sale-account-${sale.id}`}>
                        {sale.accountName || "-"}
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
        <DialogContent data-testid="dialog-sale-form">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">Record Sale</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Product *</Label>
              <Select value={formData.productId} onValueChange={(v) => setFormData({ ...formData, productId: v })}>
                <SelectTrigger data-testid="select-sale-product">
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
            <div className="space-y-2">
              <Label htmlFor="sale-quantity">Quantity *</Label>
              <Input
                id="sale-quantity"
                type="number"
                step="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                placeholder="0"
                data-testid="input-sale-quantity"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sale-price">Sale Price per Unit *</Label>
              <Input
                id="sale-price"
                type="number"
                step="0.01"
                value={formData.salePrice}
                onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
                placeholder="0.00"
                data-testid="input-sale-price"
              />
            </div>
            <div className="space-y-2">
              <Label>Cash Account *</Label>
              <Select value={formData.cashAccountId} onValueChange={(v) => setFormData({ ...formData, cashAccountId: v })}>
                <SelectTrigger data-testid="select-sale-account">
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
            <div className="space-y-2">
              <Label>Customer Party (optional)</Label>
              <Select value={formData.partyId || "__none__"} onValueChange={(v) => setFormData({ ...formData, partyId: v === "__none__" ? "" : v })}>
                <SelectTrigger data-testid="select-sale-customer">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id} data-testid={`option-customer-${c.id}`}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sale-description">Description</Label>
              <Input
                id="sale-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description"
                data-testid="input-sale-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sale-date">Date</Label>
              <Input
                id="sale-date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                data-testid="input-sale-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setFormData(emptyForm); }} data-testid="button-cancel">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit-sale">
              {createMutation.isPending ? "Saving..." : "Record Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
