import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatPkDate } from "@/lib/dateFormat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Plus, Trash2, Copy, Undo2, Check, Save, ShoppingCart,
  Search, Printer, TrendingUp, Clock, Receipt, X, ChevronRight,
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  sellingPrice: string;
  stockQty: number;
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

interface SaleItemForm {
  productId: string;
  quantity: string;
  unitPrice: string;
}

interface PaymentLineForm {
  cashAccountId: string;
  amount: string;
}

interface SaleOrder {
  id: string;
  customerId: string | null;
  customerName: string | null;
  status: string;
  total: string;
  paidNow: string;
  remaining: string;
  paymentMode: string;
  referenceId: string | null;
  date: string;
  itemCount: number;
  itemsSummary: string;
}

interface SaleDetail {
  id: string;
  customerId: string | null;
  status: string;
  total: string;
  cogsTotal: string | null;
  grossProfit: string | null;
  paidNow: string;
  remaining: string;
  paymentMode: string;
  referenceId: string | null;
  date: string;
  notes: string | null;
  completedAt: string | null;
  customerName: string | null;
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    cogsPerUnit: string | null;
    cogsTotal: string | null;
    productName: string | null;
  }>;
  payments: Array<{
    id: string;
    cashAccountId: string;
    amount: string;
    accountName: string | null;
  }>;
}

const todayStr = () => new Date().toISOString().split("T")[0];

function formatPKR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs. 0";
  return `Rs. ${num.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function statusBadge(status: string) {
  switch (status) {
    case "DRAFT":
      return <Badge variant="outline" className="text-yellow-600 border-yellow-600 text-xs">Draft</Badge>;
    case "COMPLETED":
      return <Badge variant="outline" className="text-green-600 border-green-600 text-xs">Completed</Badge>;
    case "REVERSED":
      return <Badge variant="outline" className="text-red-600 border-red-600 text-xs">Reversed</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

const emptyItem: SaleItemForm = { productId: "", quantity: "", unitPrice: "" };
const emptyPayment: PaymentLineForm = { cashAccountId: "", amount: "" };

export default function SaleOrdersPage() {
  const { toast } = useToast();

  const urlEditId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("edit")
    : null;

  const [editingSaleId, setEditingSaleId] = useState<string | null>(urlEditId);
  const [formMode, setFormMode] = useState<"idle" | "new" | "edit" | "view">(urlEditId ? "edit" : "idle");
  const [urlHandled, setUrlHandled] = useState(false);

  useEffect(() => {
    if (urlEditId && !urlHandled) {
      setEditingSaleId(urlEditId);
      setFormMode("edit");
      setUrlHandled(true);
    }
  }, [urlEditId, urlHandled]);

  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState<SaleItemForm[]>([{ ...emptyItem }]);
  const [payments, setPayments] = useState<PaymentLineForm[]>([{ ...emptyPayment }]);
  const [paymentMode, setPaymentMode] = useState("RECEIVE_NOW");
  const [saleDate, setSaleDate] = useState(todayStr());
  const [notes, setNotes] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [saleStatus, setSaleStatus] = useState("DRAFT");
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");

  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("__all__");
  const [historyCustomer, setHistoryCustomer] = useState("__all__");

  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>("");
  const printRef = useRef<HTMLDivElement>(null);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/accounting/products"],
  });

  const { data: cashAccounts = [] } = useQuery<CashAccount[]>({
    queryKey: ["/api/accounting/cash-accounts"],
  });

  const { data: customers = [] } = useQuery<Party[]>({
    queryKey: ["/api/accounting/parties?type=customer"],
  });

  const { data: saleDetail, isLoading: saleLoading } = useQuery<SaleDetail>({
    queryKey: ["/api/accounting/sales", editingSaleId],
    enabled: !!editingSaleId,
  });

  const historyQs = useMemo(() => {
    const p = new URLSearchParams();
    if (historyStatus !== "__all__") p.set("status", historyStatus);
    if (historyCustomer !== "__all__") p.set("customerId", historyCustomer);
    return p.toString();
  }, [historyStatus, historyCustomer]);

  const { data: salesList = [], isLoading: historyLoading } = useQuery<SaleOrder[]>({
    queryKey: [`/api/accounting/sales${historyQs ? `?${historyQs}` : ""}`],
    refetchInterval: 10000,
  });

  const filteredSales = useMemo(() => {
    if (!historySearch.trim()) return salesList;
    const q = historySearch.toLowerCase();
    return salesList.filter(s =>
      s.customerName?.toLowerCase().includes(q) ||
      s.referenceId?.toLowerCase().includes(q) ||
      s.itemsSummary?.toLowerCase().includes(q)
    );
  }, [salesList, historySearch]);

  const todaySales = useMemo(() => {
    const today = todayStr();
    const completed = salesList.filter(s => s.status === "COMPLETED" && s.date?.startsWith(today));
    const revenue = completed.reduce((sum, s) => sum + parseFloat(s.total || "0"), 0);
    const outstanding = salesList
      .filter(s => s.status === "COMPLETED")
      .reduce((sum, s) => sum + parseFloat(s.remaining || "0"), 0);
    const drafts = salesList.filter(s => s.status === "DRAFT").length;
    return { count: completed.length, revenue, outstanding, drafts };
  }, [salesList]);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q));
  }, [products, productSearch]);

  const customerBalance = useQuery<{ partyBalanceBefore?: number; partyBalanceAfter?: number }>({
    queryKey: ["/api/accounting/party-balance", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/accounting/preview-balances", {
        partyId: customerId, amount: 0, operation: "sale",
      });
      return res.json();
    },
  });

  useEffect(() => {
    if (saleDetail && editingSaleId) {
      setCustomerId(saleDetail.customerId || "");
      setSaleStatus(saleDetail.status);
      setCompletedAt(saleDetail.completedAt || null);
      setPaymentMode(saleDetail.paymentMode || "RECEIVE_NOW");
      setSaleDate(saleDetail.date ? new Date(saleDetail.date).toISOString().split("T")[0] : todayStr());
      setNotes(saleDetail.notes || "");
      setReferenceId(saleDetail.referenceId || "");
      if (saleDetail.items.length > 0) {
        setItems(saleDetail.items.map(i => ({
          productId: i.productId,
          quantity: String(i.quantity),
          unitPrice: i.unitPrice,
        })));
      } else {
        setItems([{ ...emptyItem }]);
      }
      if (saleDetail.payments.length > 0) {
        setPayments(saleDetail.payments.map(p => ({
          cashAccountId: p.cashAccountId,
          amount: p.amount,
        })));
      } else {
        setPayments([{ ...emptyPayment }]);
      }
    }
  }, [saleDetail, editingSaleId]);

  function resetForm() {
    setEditingSaleId(null);
    setCustomerId("");
    setItems([{ ...emptyItem }]);
    setPayments([{ ...emptyPayment }]);
    setPaymentMode("RECEIVE_NOW");
    setSaleDate(todayStr());
    setNotes("");
    setReferenceId("");
    setSaleStatus("DRAFT");
    setCompletedAt(null);
    setFormMode("idle");
    setProductSearch("");
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
  }

  const createDraftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/accounting/sales", {
        customerId: customerId || undefined,
        items: items.filter(i => i.productId),
        payments: paymentMode === "RECEIVE_NOW" ? payments.filter(p => p.cashAccountId && p.amount) : [],
        paymentMode, date: saleDate, notes, referenceId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setEditingSaleId(data.sale.id);
      setSaleStatus("DRAFT");
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/sales"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create draft", description: err.message, variant: "destructive" });
    },
  });

  const autosaveMutation = useMutation({
    mutationFn: async () => {
      if (!editingSaleId) return;
      const res = await apiRequest("PATCH", `/api/accounting/sales/${editingSaleId}`, {
        customerId: customerId || undefined,
        items: items.filter(i => i.productId),
        payments: paymentMode === "RECEIVE_NOW" ? payments.filter(p => p.cashAccountId && p.amount) : [],
        paymentMode, date: saleDate, notes, referenceId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/sales"] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!editingSaleId) throw new Error("No sale to complete");
      await autosaveMutation.mutateAsync();
      const res = await apiRequest("POST", `/api/accounting/sales/${editingSaleId}/complete`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sale completed" });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/cash-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/reports/overview"] });
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to complete sale", description: err.message, variant: "destructive" });
    },
  });

  const reverseMutation = useMutation({
    mutationFn: async () => {
      if (!editingSaleId) throw new Error("No sale to reverse");
      const res = await apiRequest("POST", `/api/accounting/sales/${editingSaleId}/reverse`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sale reversed" });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/cash-accounts"] });
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to reverse sale", description: err.message, variant: "destructive" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!editingSaleId) throw new Error("No sale to duplicate");
      const res = await apiRequest("POST", `/api/accounting/sales/${editingSaleId}/duplicate`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Sale duplicated as draft" });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/sales"] });
      setEditingSaleId(data.sale.id);
      setSaleStatus("DRAFT");
      setFormMode("edit");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to duplicate", description: err.message, variant: "destructive" });
    },
  });

  const getFormSnapshot = useCallback(() => {
    return JSON.stringify({ customerId, items, payments, paymentMode, saleDate, notes, referenceId });
  }, [customerId, items, payments, paymentMode, saleDate, notes, referenceId]);

  useEffect(() => {
    if (!editingSaleId || saleStatus !== "DRAFT") return;
    const snap = getFormSnapshot();
    if (snap === lastSavedRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      lastSavedRef.current = snap;
      autosaveMutation.mutate();
    }, 1500);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  }, [editingSaleId, saleStatus, getFormSnapshot]);

  function getLineTotal(item: SaleItemForm): number {
    return (parseInt(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
  }

  const subtotal = items.reduce((s, i) => s + getLineTotal(i), 0);
  const paidNowTotal = paymentMode === "RECEIVE_NOW"
    ? payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0) : 0;
  const remainingAmount = subtotal - paidNowTotal;
  const prevBalance = customerBalance.data?.partyBalanceBefore ?? 0;
  const balanceAfterSale = prevBalance + remainingAmount;

  const canEdit = saleStatus === "DRAFT" ||
    (saleStatus === "COMPLETED" && completedAt &&
      (Date.now() - new Date(completedAt).getTime()) < 2 * 60 * 1000);
  const isViewOnly = formMode === "view" || saleStatus === "REVERSED" ||
    (saleStatus === "COMPLETED" && !canEdit);

  function handleStartNewSale() {
    resetForm();
    setFormMode("new");
    createDraftMutation.mutate();
  }

  function handleOpenSale(sale: SaleOrder) {
    setEditingSaleId(sale.id);
    const editable = sale.status === "DRAFT" || sale.status === "COMPLETED";
    setFormMode(editable ? "edit" : "view");
  }

  function isProductUsed(productId: string, currentIndex: number): boolean {
    return items.some((item, i) => i !== currentIndex && item.productId === productId);
  }

  function handlePrint() {
    window.print();
  }

  const formPanelContent = () => {
    if (formMode === "idle") {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center gap-4 py-16" data-testid="pos-idle-state">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <ShoppingCart className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-semibold" data-testid="text-idle-title">Ready to sell</h2>
            <p className="text-muted-foreground text-sm mt-1">Start a new sale or select an order from history</p>
          </div>
          <Button onClick={handleStartNewSale} disabled={createDraftMutation.isPending} size="lg" data-testid="button-new-sale-idle">
            <Plus className="w-4 h-4 mr-2" />
            {createDraftMutation.isPending ? "Creating..." : "New Sale"}
          </Button>
          {todaySales.drafts > 0 && (
            <p className="text-sm text-muted-foreground">
              {todaySales.drafts} held draft{todaySales.drafts > 1 ? "s" : ""} — select from history →
            </p>
          )}
        </div>
      );
    }

    if (saleLoading && editingSaleId) {
      return (
        <div className="space-y-4 p-1">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      );
    }

    return (
      <div className="space-y-4" data-testid="sell-form">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={resetForm} data-testid="button-back">
            <X className="w-4 h-4 mr-1" /> Close
          </Button>
          <div className="flex items-center gap-2">
            {statusBadge(saleStatus)}
            {autosaveMutation.isPending && (
              <span className="text-xs text-muted-foreground" data-testid="text-autosaving">Saving...</span>
            )}
          </div>
          {saleStatus === "COMPLETED" && saleDetail && (
            <Button variant="outline" size="sm" onClick={handlePrint} className="ml-auto" data-testid="button-print-receipt">
              <Printer className="w-4 h-4 mr-1" /> Print Receipt
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Sale Date</Label>
                <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)}
                  disabled={isViewOnly} data-testid="input-sale-date" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Customer</Label>
                <Select value={customerId || "__walkin__"} onValueChange={(v) => setCustomerId(v === "__walkin__" ? "" : v)} disabled={isViewOnly}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-sale-customer">
                    <SelectValue placeholder="Walk-in Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__walkin__">Walk-in Customer</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Reference / Invoice #</Label>
                <Input value={referenceId} onChange={(e) => setReferenceId(e.target.value)}
                  placeholder="INV-001" disabled={isViewOnly} data-testid="input-sale-reference" className="h-8 text-sm" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Items</CardTitle>
              {!isViewOnly && (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Search products..."
                      className="h-7 text-xs pl-6 w-36"
                      data-testid="input-product-search"
                    />
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => setItems([...items, { ...emptyItem }])} data-testid="button-add-item">
                    <Plus className="w-3 h-3 mr-1" /> Add
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%] text-xs">Product</TableHead>
                  <TableHead className="w-[12%] text-xs">Qty</TableHead>
                  <TableHead className="w-[18%] text-xs">Unit Price</TableHead>
                  <TableHead className="w-[18%] text-xs text-right">Total</TableHead>
                  {!isViewOnly && <TableHead className="w-[8%]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => {
                  const lineTotal = getLineTotal(item);
                  return (
                    <TableRow key={idx}>
                      <TableCell className="py-2">
                        <Select
                          value={item.productId || "__empty__"}
                          onValueChange={(v) => {
                            const next = [...items];
                            next[idx] = { ...next[idx], productId: v === "__empty__" ? "" : v };
                            const prod = products.find(p => p.id === v);
                            if (prod && !next[idx].unitPrice) next[idx].unitPrice = prod.sellingPrice || "";
                            setItems(next);
                          }}
                          disabled={isViewOnly}
                        >
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-item-product-${idx}`}>
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__empty__">Select product</SelectItem>
                            {filteredProducts.map((p) => (
                              <SelectItem key={p.id} value={p.id} disabled={isProductUsed(p.id, idx)}>
                                {p.name} — Stock: {p.stockQty}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="py-2">
                        <Input type="number" min="1" step="1" value={item.quantity}
                          onChange={(e) => { const next = [...items]; next[idx] = { ...next[idx], quantity: e.target.value }; setItems(next); }}
                          disabled={isViewOnly} className="h-8 text-xs" data-testid={`input-item-qty-${idx}`} />
                      </TableCell>
                      <TableCell className="py-2">
                        <Input type="number" min="0" step="0.01" value={item.unitPrice}
                          onChange={(e) => { const next = [...items]; next[idx] = { ...next[idx], unitPrice: e.target.value }; setItems(next); }}
                          disabled={isViewOnly} className="h-8 text-xs" data-testid={`input-item-price-${idx}`} />
                      </TableCell>
                      <TableCell className="text-right font-medium text-xs py-2" data-testid={`text-item-total-${idx}`}>
                        {formatPKR(lineTotal)}
                      </TableCell>
                      {!isViewOnly && (
                        <TableCell className="py-2">
                          {items.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => setItems(items.filter((_, i) => i !== idx))}
                              data-testid={`button-remove-item-${idx}`}>
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="mt-3 flex justify-end">
              <div className="text-right" data-testid="text-items-subtotal">
                <div className="text-xs text-muted-foreground">Subtotal</div>
                <div className="text-lg font-bold">{formatPKR(subtotal)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold">Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <RadioGroup value={paymentMode} onValueChange={setPaymentMode}
              className="flex gap-4" disabled={isViewOnly}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="RECEIVE_NOW" id="receive-now" data-testid="radio-receive-now" />
                <Label htmlFor="receive-now" className="text-sm">Receive Now</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="NO_PAYMENT" id="no-payment" data-testid="radio-no-payment" />
                <Label htmlFor="no-payment" className="text-sm">Full Credit</Label>
              </div>
            </RadioGroup>

            {paymentMode === "RECEIVE_NOW" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Payment Lines</Label>
                  {!isViewOnly && (
                    <Button variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => setPayments([...payments, { ...emptyPayment }])} data-testid="button-add-payment">
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  )}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60%] text-xs">Account</TableHead>
                      <TableHead className="w-[30%] text-xs">Amount</TableHead>
                      {!isViewOnly && <TableHead className="w-[10%]" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((pmt, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="py-2">
                          <Select value={pmt.cashAccountId || "__empty__"}
                            onValueChange={(v) => { const next = [...payments]; next[idx] = { ...next[idx], cashAccountId: v === "__empty__" ? "" : v }; setPayments(next); }}
                            disabled={isViewOnly}>
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-payment-account-${idx}`}>
                              <SelectValue placeholder="Select account" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__empty__">Select account</SelectItem>
                              {cashAccounts.map((a) => (
                                <SelectItem key={a.id} value={a.id}>{a.name} ({formatPKR(a.balance)})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-2">
                          <Input type="number" min="0" step="0.01" value={pmt.amount}
                            onChange={(e) => { const next = [...payments]; next[idx] = { ...next[idx], amount: e.target.value }; setPayments(next); }}
                            disabled={isViewOnly} className="h-8 text-xs" data-testid={`input-payment-amount-${idx}`} />
                        </TableCell>
                        {!isViewOnly && (
                          <TableCell className="py-2">
                            {payments.length > 1 && (
                              <Button variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => setPayments(payments.filter((_, i) => i !== idx))}
                                data-testid={`button-remove-payment-${idx}`}>
                                <Trash2 className="w-3 h-3 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {paymentMode === "NO_PAYMENT" && (
              <p className="text-xs text-muted-foreground" data-testid="text-credit-info">
                Full amount added to customer's receivable balance.
              </p>
            )}

            <Separator />
            <div className="grid grid-cols-3 gap-2 text-center" data-testid="text-payment-summary">
              <div>
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="text-base font-bold">{formatPKR(subtotal)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Paid</div>
                <div className="text-base font-bold text-green-600">{formatPKR(paidNowTotal)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Balance</div>
                <div className={`text-base font-bold ${remainingAmount > 0 ? "text-orange-600" : ""}`}>
                  {formatPKR(remainingAmount)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {customerId && (
          <Card data-testid="card-customer-balance">
            <CardContent className="pt-4 pb-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer Balance</div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Before This Sale</span>
                <span className="font-medium" data-testid="text-prev-balance">{formatPKR(prevBalance)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">After This Sale</span>
                <span className={`font-bold ${balanceAfterSale > 0 ? "text-orange-600" : "text-green-600"}`} data-testid="text-balance-after">
                  {formatPKR(balanceAfterSale)}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-4 pb-3">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..." disabled={isViewOnly}
              className="mt-1.5 text-sm min-h-[60px]" data-testid="input-sale-notes" />
          </CardContent>
        </Card>

        <div className="space-y-2" data-testid="action-buttons">
          {saleStatus === "DRAFT" && (
            <>
              <Button className="w-full" onClick={() => completeMutation.mutate()}
                disabled={completeMutation.isPending || subtotal <= 0} data-testid="button-complete-sale">
                <Check className="w-4 h-4 mr-2" />
                {completeMutation.isPending ? "Completing..." : "Complete Sale"}
              </Button>
              <Button className="w-full" variant="outline"
                onClick={() => { if (editingSaleId) { autosaveMutation.mutate(); toast({ title: "Draft saved — order held" }); } }}
                disabled={autosaveMutation.isPending} data-testid="button-save-draft">
                <Save className="w-4 h-4 mr-2" />
                Hold (Save Draft)
              </Button>
            </>
          )}

          {(saleStatus === "COMPLETED") && (
            <div className="flex gap-2">
              <Button className="flex-1" variant="outline" onClick={() => reverseMutation.mutate()}
                disabled={reverseMutation.isPending} data-testid="button-reverse-sale">
                <Undo2 className="w-4 h-4 mr-2" />
                Reverse
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => duplicateMutation.mutate()}
                disabled={duplicateMutation.isPending} data-testid="button-duplicate-sale">
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </Button>
            </div>
          )}

          {saleStatus === "REVERSED" && (
            <Button className="w-full" variant="outline" onClick={() => duplicateMutation.mutate()}
              disabled={duplicateMutation.isPending} data-testid="button-duplicate-sale">
              <Copy className="w-4 h-4 mr-2" />
              Duplicate as New Draft
            </Button>
          )}

          {saleStatus === "COMPLETED" && saleDetail && (
            <Card className="mt-2">
              <CardContent className="pt-3 pb-3 space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sale Summary</div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Revenue</span>
                  <span className="font-medium">{formatPKR(saleDetail.total)}</span>
                </div>
                {saleDetail.cogsTotal && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">COGS</span>
                    <span>{formatPKR(saleDetail.cogsTotal)}</span>
                  </div>
                )}
                {saleDetail.grossProfit && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Gross Profit</span>
                    <span className={`font-bold ${parseFloat(saleDetail.grossProfit) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatPKR(saleDetail.grossProfit)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4" data-testid="pos-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Point of Sale</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Create sales and manage order history</p>
        </div>
        <Button onClick={handleStartNewSale} disabled={createDraftMutation.isPending} data-testid="button-new-sale">
          <Plus className="w-4 h-4 mr-2" />
          {createDraftMutation.isPending ? "Creating..." : "New Sale"}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card data-testid="stat-today-sales">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Today's Sales</span>
            </div>
            <div className="text-xl font-bold mt-1">{todaySales.count}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-today-revenue">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Today's Revenue</span>
            </div>
            <div className="text-xl font-bold mt-1 text-green-600">{formatPKR(todaySales.revenue)}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-outstanding">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">Outstanding</span>
            </div>
            <div className={`text-xl font-bold mt-1 ${todaySales.outstanding > 0 ? "text-orange-500" : ""}`}>
              {formatPKR(todaySales.outstanding)}
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-drafts">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Save className="w-4 h-4 text-yellow-600" />
              <span className="text-xs text-muted-foreground">Held Drafts</span>
            </div>
            <div className={`text-xl font-bold mt-1 ${todaySales.drafts > 0 ? "text-yellow-600" : ""}`}>
              {todaySales.drafts}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="w-full lg:w-[58%] space-y-0" data-testid="pos-form-panel">
          {formPanelContent()}
        </div>

        <div className="w-full lg:w-[42%] lg:sticky lg:top-4" data-testid="pos-history-panel">
          <Card className="h-full">
            <CardHeader className="pb-3 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Order History</CardTitle>
                <span className="text-xs text-muted-foreground">{filteredSales.length} orders</span>
              </div>
              <div className="space-y-2 mt-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search by customer, ref..."
                    className="h-8 text-xs pl-8"
                    data-testid="input-history-search"
                  />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {(["__all__", "DRAFT", "COMPLETED", "REVERSED"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setHistoryStatus(s)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        historyStatus === s
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border text-muted-foreground hover:border-foreground/40"
                      }`}
                      data-testid={`filter-status-${s}`}
                    >
                      {s === "__all__" ? "All" : s === "DRAFT" ? "Drafts" : s === "COMPLETED" ? "Completed" : "Reversed"}
                    </button>
                  ))}
                </div>
                <Select value={historyCustomer} onValueChange={setHistoryCustomer}>
                  <SelectTrigger className="h-8 text-xs" data-testid="filter-history-customer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Customers</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                {historyLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : filteredSales.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm" data-testid="text-no-orders">
                    No orders found
                  </div>
                ) : (
                  <div className="divide-y" data-testid="history-list">
                    {filteredSales.map((sale) => {
                      const isActive = sale.id === editingSaleId;
                      return (
                        <button
                          key={sale.id}
                          onClick={() => handleOpenSale(sale)}
                          className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors hover:bg-muted/50 ${
                            isActive ? "bg-muted border-l-2 border-l-primary" : ""
                          }`}
                          data-testid={`row-order-${sale.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-medium truncate" data-testid={`text-order-customer-${sale.id}`}>
                                {sale.customerName || "Walk-in"}
                              </span>
                              {statusBadge(sale.status)}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span data-testid={`text-order-date-${sale.id}`}>{formatPkDate(sale.date)}</span>
                              {sale.referenceId && <span>· {sale.referenceId}</span>}
                              {sale.itemCount > 0 && <span>· {sale.itemCount} item{sale.itemCount > 1 ? "s" : ""}</span>}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-sm font-semibold" data-testid={`text-order-total-${sale.id}`}>
                              {formatPKR(sale.total)}
                            </div>
                            {parseFloat(sale.remaining) > 0 && (
                              <div className="text-xs text-orange-500" data-testid={`text-order-remaining-${sale.id}`}>
                                {formatPKR(sale.remaining)} due
                              </div>
                            )}
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {saleDetail && saleStatus === "COMPLETED" && (
        <div ref={printRef} className="hidden print:block fixed inset-0 bg-white p-8 z-50">
          <div className="max-w-sm mx-auto">
            <h2 className="text-xl font-bold text-center mb-1">Sales Receipt</h2>
            {saleDetail.referenceId && (
              <p className="text-center text-sm text-gray-500 mb-4">Ref: {saleDetail.referenceId}</p>
            )}
            <div className="text-sm space-y-1 mb-4">
              <div className="flex justify-between">
                <span>Date</span>
                <span>{formatPkDate(saleDetail.date)}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer</span>
                <span>{saleDetail.customerName || "Walk-in"}</span>
              </div>
            </div>
            <hr className="my-3" />
            <div className="space-y-1 mb-4">
              {saleDetail.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.productName} × {item.quantity}</span>
                  <span>{formatPKR(item.lineTotal)}</span>
                </div>
              ))}
            </div>
            <hr className="my-3" />
            <div className="space-y-1 text-sm">
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span>{formatPKR(saleDetail.total)}</span>
              </div>
              <div className="flex justify-between text-green-700">
                <span>Paid</span>
                <span>{formatPKR(saleDetail.paidNow)}</span>
              </div>
              {parseFloat(saleDetail.remaining) > 0 && (
                <div className="flex justify-between text-orange-600 font-medium">
                  <span>Balance Due</span>
                  <span>{formatPKR(saleDetail.remaining)}</span>
                </div>
              )}
            </div>
            {saleDetail.notes && (
              <p className="mt-4 text-xs text-gray-500 text-center">{saleDetail.notes}</p>
            )}
            <p className="mt-6 text-xs text-gray-400 text-center">Thank you for your business!</p>
          </div>
        </div>
      )}
    </div>
  );
}
