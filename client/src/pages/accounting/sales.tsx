import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Copy, Undo2, Check, Save, ArrowLeft } from "lucide-react";

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

const emptyItem: SaleItemForm = { productId: "", quantity: "", unitPrice: "" };
const emptyPayment: PaymentLineForm = { cashAccountId: "", amount: "" };

export default function AccountingSales() {
  const { toast } = useToast();
  const [location, navigate] = useLocation();

  const urlEditId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("edit")
    : null;

  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"idle" | "new" | "edit" | "view">("idle");
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

  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>("");

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
      toast({ title: "Draft created" });
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
      toast({ title: "Sale completed successfully" });
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

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [editingSaleId, saleStatus, getFormSnapshot]);

  function getLineTotal(item: SaleItemForm): number {
    const qty = parseInt(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    return qty * price;
  }

  const subtotal = items.reduce((s, i) => s + getLineTotal(i), 0);
  const paidNowTotal = paymentMode === "RECEIVE_NOW"
    ? payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
    : 0;
  const remainingAmount = subtotal - paidNowTotal;

  const prevBalance = customerBalance.data?.partyBalanceBefore ?? 0;
  const balanceAfterSale = prevBalance + remainingAmount;

  const canEdit = saleStatus === "DRAFT" ||
    (saleStatus === "COMPLETED" && completedAt &&
      (Date.now() - new Date(completedAt).getTime()) < 2 * 60 * 1000);
  const isViewOnly = formMode === "view" || saleStatus === "REVERSED" || (saleStatus === "COMPLETED" && !canEdit);

  async function handleStartNewSale() {
    setFormMode("new");
    resetForm();
    setFormMode("new");
    createDraftMutation.mutate();
  }

  function handleOpenSale(saleId: string, status: string) {
    setEditingSaleId(saleId);
    const editable = status === "DRAFT" || status === "COMPLETED";
    setFormMode(editable ? "edit" : "view");
  }

  function getProductName(productId: string): string {
    return products.find(p => p.id === productId)?.name || "";
  }

  function isProductUsed(productId: string, currentIndex: number): boolean {
    return items.some((item, i) => i !== currentIndex && item.productId === productId);
  }

  if (formMode !== "idle") {
    return (
      <div className="space-y-6" data-testid="sell-form">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={resetForm} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-form-title">
            {saleStatus === "DRAFT" ? "New Sale (Draft)" : saleStatus === "COMPLETED" ? "Completed Sale" : "Reversed Sale"}
          </h1>
          {saleStatus === "DRAFT" && (
            <Badge variant="outline" className="text-yellow-600 border-yellow-600" data-testid="badge-draft">Draft</Badge>
          )}
          {saleStatus === "COMPLETED" && (
            <Badge variant="outline" className="text-green-600 border-green-600" data-testid="badge-completed">Completed</Badge>
          )}
          {saleStatus === "REVERSED" && (
            <Badge variant="outline" className="text-red-600 border-red-600" data-testid="badge-reversed">Reversed</Badge>
          )}
          {autosaveMutation.isPending && (
            <span className="text-xs text-muted-foreground" data-testid="text-autosaving">Saving...</span>
          )}
        </div>

        {saleLoading && editingSaleId ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Sale Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Sale Date</Label>
                      <Input
                        type="date"
                        value={saleDate}
                        onChange={(e) => setSaleDate(e.target.value)}
                        disabled={isViewOnly}
                        data-testid="input-sale-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Customer *</Label>
                      <Select value={customerId || "__walkin__"} onValueChange={(v) => setCustomerId(v === "__walkin__" ? "" : v)} disabled={isViewOnly}>
                        <SelectTrigger data-testid="select-sale-customer">
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
                    <div className="space-y-2">
                      <Label>Reference / Invoice #</Label>
                      <Input
                        value={referenceId}
                        onChange={(e) => setReferenceId(e.target.value)}
                        placeholder="INV-001"
                        disabled={isViewOnly}
                        data-testid="input-sale-reference"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Items</CardTitle>
                    {!isViewOnly && (
                      <Button variant="outline" size="sm" onClick={() => setItems([...items, { ...emptyItem }])} data-testid="button-add-item">
                        <Plus className="w-4 h-4 mr-1" /> Add Item
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40%]">Product</TableHead>
                        <TableHead className="w-[15%]">Qty</TableHead>
                        <TableHead className="w-[20%]">Unit Price</TableHead>
                        <TableHead className="w-[15%] text-right">Total</TableHead>
                        {!isViewOnly && <TableHead className="w-[10%]" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, idx) => {
                        const lineTotal = getLineTotal(item);
                        return (
                          <TableRow key={idx}>
                            <TableCell>
                              <Select
                                value={item.productId || "__empty__"}
                                onValueChange={(v) => {
                                  const next = [...items];
                                  next[idx] = { ...next[idx], productId: v === "__empty__" ? "" : v };
                                  const prod = products.find(p => p.id === v);
                                  if (prod && !next[idx].unitPrice) {
                                    next[idx].unitPrice = prod.sellingPrice || "";
                                  }
                                  setItems(next);
                                }}
                                disabled={isViewOnly}
                              >
                                <SelectTrigger data-testid={`select-item-product-${idx}`}>
                                  <SelectValue placeholder="Select product" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__empty__">Select product</SelectItem>
                                  {products.map((p) => (
                                    <SelectItem key={p.id} value={p.id} disabled={isProductUsed(p.id, idx)}>
                                      {p.name} (Stock: {p.stockQty})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number" min="1" step="1"
                                value={item.quantity}
                                onChange={(e) => {
                                  const next = [...items];
                                  next[idx] = { ...next[idx], quantity: e.target.value };
                                  setItems(next);
                                }}
                                disabled={isViewOnly}
                                data-testid={`input-item-qty-${idx}`}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number" min="0" step="0.01"
                                value={item.unitPrice}
                                onChange={(e) => {
                                  const next = [...items];
                                  next[idx] = { ...next[idx], unitPrice: e.target.value };
                                  setItems(next);
                                }}
                                disabled={isViewOnly}
                                data-testid={`input-item-price-${idx}`}
                              />
                            </TableCell>
                            <TableCell className="text-right font-medium" data-testid={`text-item-total-${idx}`}>
                              {formatPKR(lineTotal)}
                            </TableCell>
                            {!isViewOnly && (
                              <TableCell>
                                {items.length > 1 && (
                                  <Button
                                    variant="ghost" size="icon"
                                    onClick={() => setItems(items.filter((_, i) => i !== idx))}
                                    data-testid={`button-remove-item-${idx}`}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <div className="mt-4 flex justify-end">
                    <div className="text-right space-y-1" data-testid="text-items-subtotal">
                      <div className="text-sm text-muted-foreground">Subtotal</div>
                      <div className="text-xl font-bold">{formatPKR(subtotal)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Payment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <RadioGroup
                    value={paymentMode}
                    onValueChange={(v) => setPaymentMode(v)}
                    className="flex gap-6"
                    disabled={isViewOnly}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="RECEIVE_NOW" id="receive-now" data-testid="radio-receive-now" />
                      <Label htmlFor="receive-now">Receive Now</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="NO_PAYMENT" id="no-payment" data-testid="radio-no-payment" />
                      <Label htmlFor="no-payment">No Payment (Full Credit)</Label>
                    </div>
                  </RadioGroup>

                  {paymentMode === "RECEIVE_NOW" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Payment Lines</Label>
                        {!isViewOnly && (
                          <Button variant="outline" size="sm" onClick={() => setPayments([...payments, { ...emptyPayment }])} data-testid="button-add-payment">
                            <Plus className="w-4 h-4 mr-1" /> Add Payment
                          </Button>
                        )}
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[60%]">Account</TableHead>
                            <TableHead className="w-[30%]">Amount</TableHead>
                            {!isViewOnly && <TableHead className="w-[10%]" />}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payments.map((pmt, idx) => (
                            <TableRow key={idx}>
                              <TableCell>
                                <Select
                                  value={pmt.cashAccountId || "__empty__"}
                                  onValueChange={(v) => {
                                    const next = [...payments];
                                    next[idx] = { ...next[idx], cashAccountId: v === "__empty__" ? "" : v };
                                    setPayments(next);
                                  }}
                                  disabled={isViewOnly}
                                >
                                  <SelectTrigger data-testid={`select-payment-account-${idx}`}>
                                    <SelectValue placeholder="Select account" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__empty__">Select account</SelectItem>
                                    {cashAccounts.map((a) => (
                                      <SelectItem key={a.id} value={a.id}>
                                        {a.name} ({formatPKR(a.balance)})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number" min="0" step="0.01"
                                  value={pmt.amount}
                                  onChange={(e) => {
                                    const next = [...payments];
                                    next[idx] = { ...next[idx], amount: e.target.value };
                                    setPayments(next);
                                  }}
                                  disabled={isViewOnly}
                                  data-testid={`input-payment-amount-${idx}`}
                                />
                              </TableCell>
                              {!isViewOnly && (
                                <TableCell>
                                  {payments.length > 1 && (
                                    <Button
                                      variant="ghost" size="icon"
                                      onClick={() => setPayments(payments.filter((_, i) => i !== idx))}
                                      data-testid={`button-remove-payment-${idx}`}
                                    >
                                      <Trash2 className="w-4 h-4 text-destructive" />
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
                    <p className="text-sm text-muted-foreground" data-testid="text-credit-info">
                      Full amount will be added to customer's receivable balance.
                    </p>
                  )}

                  <Separator />

                  <div className="grid grid-cols-3 gap-4 text-center" data-testid="text-payment-summary">
                    <div>
                      <div className="text-sm text-muted-foreground">Total</div>
                      <div className="text-lg font-bold">{formatPKR(subtotal)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Paid Now</div>
                      <div className="text-lg font-bold text-green-600">{formatPKR(paidNowTotal)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Remaining</div>
                      <div className={`text-lg font-bold ${remainingAmount > 0 ? "text-orange-600" : ""}`}>
                        {formatPKR(remainingAmount)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Additional notes..."
                    disabled={isViewOnly}
                    data-testid="input-sale-notes"
                  />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              {customerId && (
                <Card data-testid="card-customer-balance">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Customer Balance</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Previous Balance</span>
                      <span className="font-medium" data-testid="text-prev-balance">{formatPKR(prevBalance)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">After This Sale</span>
                      <span className={`font-bold ${balanceAfterSale > 0 ? "text-orange-600" : "text-green-600"}`} data-testid="text-balance-after">
                        {formatPKR(balanceAfterSale)}
                      </span>
                    </div>
                    {balanceAfterSale > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">Customer owes you</p>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {saleStatus === "DRAFT" && (
                    <>
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => {
                          if (editingSaleId) autosaveMutation.mutate();
                          toast({ title: "Draft saved" });
                        }}
                        disabled={autosaveMutation.isPending}
                        data-testid="button-save-draft"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Save Draft
                      </Button>
                      <Button
                        className="w-full"
                        onClick={() => completeMutation.mutate()}
                        disabled={completeMutation.isPending || subtotal <= 0}
                        data-testid="button-complete-sale"
                      >
                        <Check className="w-4 h-4 mr-2" />
                        {completeMutation.isPending ? "Completing..." : "Complete Sale"}
                      </Button>
                    </>
                  )}

                  {saleStatus === "COMPLETED" && canEdit && (
                    <>
                      <p className="text-xs text-muted-foreground">You can still edit this sale (within 2 minutes of completion).</p>
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => reverseMutation.mutate()}
                        disabled={reverseMutation.isPending}
                        data-testid="button-reverse-sale"
                      >
                        <Undo2 className="w-4 h-4 mr-2" />
                        Reverse
                      </Button>
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => duplicateMutation.mutate()}
                        disabled={duplicateMutation.isPending}
                        data-testid="button-duplicate-sale"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicate
                      </Button>
                    </>
                  )}

                  {saleStatus === "COMPLETED" && !canEdit && (
                    <>
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => reverseMutation.mutate()}
                        disabled={reverseMutation.isPending}
                        data-testid="button-reverse-sale"
                      >
                        <Undo2 className="w-4 h-4 mr-2" />
                        Reverse
                      </Button>
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => duplicateMutation.mutate()}
                        disabled={duplicateMutation.isPending}
                        data-testid="button-duplicate-sale"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicate
                      </Button>
                    </>
                  )}

                  {saleStatus === "REVERSED" && (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => duplicateMutation.mutate()}
                      disabled={duplicateMutation.isPending}
                      data-testid="button-duplicate-sale"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicate
                    </Button>
                  )}
                </CardContent>
              </Card>

              {saleStatus === "COMPLETED" && saleDetail && (
                <Card data-testid="card-sale-summary">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Sale Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Revenue</span>
                      <span className="font-medium">{formatPKR(saleDetail.total)}</span>
                    </div>
                    {saleDetail.cogsTotal && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">COGS</span>
                        <span className="font-medium">{formatPKR(saleDetail.cogsTotal)}</span>
                      </div>
                    )}
                    {saleDetail.grossProfit && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Profit</span>
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
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="accounting-sales">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Sell
          </h1>
          <p className="text-muted-foreground mt-1">
            Create sales invoices with multi-product and split payments
          </p>
        </div>
        <Button onClick={handleStartNewSale} disabled={createDraftMutation.isPending} data-testid="button-new-sale">
          <Plus className="w-4 h-4 mr-2" />
          {createDraftMutation.isPending ? "Creating..." : "New Sale"}
        </Button>
      </div>
    </div>
  );
}
