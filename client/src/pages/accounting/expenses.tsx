import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatPkDate } from "@/lib/dateFormat";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, CreditCard, History, AlertCircle, CheckCircle2, Clock } from "lucide-react";

interface Expense {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  amount: string | number;
  paidAmount?: string | number;
  remainingDue?: string | number;
  paymentStatus?: string;
  date?: string;
}

interface CashAccount {
  id: string;
  name: string;
  balance: string;
}

interface ExpenseType {
  id: string;
  name: string;
  category?: string;
}

interface PayFormData {
  expenseId: string;
  amount: string;
  cashAccountId: string;
  date: string;
}

interface CreateUnpaidFormData {
  amount: string;
  expenseTypeId: string;
  description: string;
  date: string;
}

interface ExpensePayment {
  id: string;
  amount: string | number;
  date?: string;
  note?: string;
}

const todayStr = () => new Date().toISOString().split("T")[0];

function formatPKR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs. 0";
  return `Rs. ${num.toLocaleString()}`;
}

function getStatusBadge(status?: string) {
  switch (status) {
    case "paid":
      return <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" data-testid="badge-status-paid">Paid</Badge>;
    case "partial":
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" data-testid="badge-status-partial">Partial</Badge>;
    default:
      return <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" data-testid="badge-status-unpaid">Unpaid</Badge>;
  }
}

export default function AccountingExpenses() {
  const { toast } = useToast();
  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const defaultTab = searchParams.get("tab") === "needs-payment" ? "needs-payment" : "all";

  const [activeTab, setActiveTab] = useState(defaultTab);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [historyExpenseId, setHistoryExpenseId] = useState<string | null>(null);
  const [payForm, setPayForm] = useState<PayFormData>({ expenseId: "", amount: "", cashAccountId: "", date: todayStr() });
  const [createForm, setCreateForm] = useState<CreateUnpaidFormData>({ amount: "", expenseTypeId: "", description: "", date: todayStr() });

  const { data: expensesList = [], isLoading } = useQuery<Expense[]>({
    queryKey: ["/api/accounting/expenses"],
  });

  const { data: cashAccounts = [] } = useQuery<CashAccount[]>({
    queryKey: ["/api/accounting/cash-accounts"],
  });

  const { data: expenseTypes = [] } = useQuery<ExpenseType[]>({
    queryKey: ["/api/accounting/expense-types"],
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<ExpensePayment[]>({
    queryKey: [`/api/accounting/expenses/${historyExpenseId}/payments`],
    enabled: !!historyExpenseId,
  });

  function invalidateAfterMutation() {
    queryClient.invalidateQueries({ queryKey: ["/api/accounting/expenses"] });
    queryClient.invalidateQueries({ queryKey: ["/api/accounting/expenses/unpaid"] });
    queryClient.invalidateQueries({ queryKey: ["/api/accounting/cash-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/accounting/reports/overview"] });
  }

  const payMutation = useMutation({
    mutationFn: async (data: PayFormData) => {
      const res = await apiRequest("POST", "/api/accounting/money-out/pay-expense", {
        expenseId: data.expenseId,
        amount: data.amount,
        cashAccountId: data.cashAccountId,
        date: data.date,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateAfterMutation();
      toast({ title: "Payment recorded successfully" });
      setPayDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to record payment", description: err.message, variant: "destructive" });
    },
  });

  const createUnpaidMutation = useMutation({
    mutationFn: async (data: CreateUnpaidFormData) => {
      const expType = expenseTypes.find((e) => e.id === data.expenseTypeId);
      const res = await apiRequest("POST", "/api/accounting/expenses/create-unpaid", {
        amount: data.amount,
        title: data.description || expType?.name || "Expense",
        category: expType?.name || "general",
        description: data.description || undefined,
        date: data.date,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateAfterMutation();
      toast({ title: "Unpaid expense created successfully" });
      setCreateDialogOpen(false);
      setCreateForm({ amount: "", expenseTypeId: "", description: "", date: todayStr() });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create expense", description: err.message, variant: "destructive" });
    },
  });

  function openPayDialog(expense: Expense) {
    const remaining = typeof expense.remainingDue === "string" ? expense.remainingDue : String(expense.remainingDue || 0);
    setPayForm({ expenseId: expense.id, amount: remaining, cashAccountId: "", date: todayStr() });
    setPayDialogOpen(true);
  }

  function handlePay() {
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) {
      toast({ title: "Valid amount is required", variant: "destructive" });
      return;
    }
    if (!payForm.cashAccountId) {
      toast({ title: "Cash account is required", variant: "destructive" });
      return;
    }
    payMutation.mutate(payForm);
  }

  function handleCreateUnpaid() {
    if (!createForm.amount || parseFloat(createForm.amount) <= 0) {
      toast({ title: "Valid amount is required", variant: "destructive" });
      return;
    }
    if (!createForm.expenseTypeId) {
      toast({ title: "Expense type is required", variant: "destructive" });
      return;
    }
    createUnpaidMutation.mutate(createForm);
  }

  const filteredExpenses = expensesList.filter((e) => {
    if (activeTab === "needs-payment") return e.paymentStatus === "unpaid" || e.paymentStatus === "partial";
    if (activeTab === "paid") return e.paymentStatus === "paid";
    return true;
  });

  const totalOutstanding = expensesList.reduce((sum, e) => {
    const r = typeof e.remainingDue === "string" ? parseFloat(e.remainingDue) : (e.remainingDue || 0);
    return sum + (isNaN(r) ? 0 : r);
  }, 0);
  const needsPaymentCount = expensesList.filter((e) => e.paymentStatus === "unpaid" || e.paymentStatus === "partial").length;
  const totalPaid = expensesList.reduce((sum, e) => {
    const p = typeof e.paidAmount === "string" ? parseFloat(e.paidAmount) : (e.paidAmount || 0);
    return sum + (isNaN(p) ? 0 : p);
  }, 0);

  return (
    <div className="space-y-6" data-testid="accounting-expenses">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Expenses</h1>
          <p className="text-muted-foreground mt-1">Track all expenses and their payment status</p>
        </div>
        <Button
          onClick={() => { setCreateForm({ amount: "", expenseTypeId: "", description: "", date: todayStr() }); setCreateDialogOpen(true); }}
          data-testid="button-create-unpaid"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Unpaid Expense
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-red-500/10 p-2">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400" data-testid="stat-outstanding">{formatPKR(totalOutstanding)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-amber-500/10 p-2">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Needs Payment</p>
              <p className="text-lg font-bold" data-testid="stat-needs-payment">{needsPaymentCount} expense{needsPaymentCount !== 1 ? "s" : ""}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-green-500/10 p-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Paid</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400" data-testid="stat-total-paid">{formatPKR(totalPaid)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="tabs-expenses">
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
          <TabsTrigger value="needs-payment" data-testid="tab-needs-payment">
            Needs Payment
            {needsPaymentCount > 0 && (
              <Badge className="ml-2 h-5 min-w-5 px-1 text-xs bg-red-500 text-white">{needsPaymentCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="paid" data-testid="tab-paid">Paid</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3" data-testid="table-skeleton">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground" data-testid="text-no-expenses">
              {activeTab === "needs-payment" ? "No unpaid expenses. Everything is paid up." :
               activeTab === "paid" ? "No paid expenses yet." :
               "No expenses found. Create one using the button above."}
            </div>
          ) : (
            <Table data-testid="table-expenses">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.map((expense) => {
                  const total = typeof expense.amount === "string" ? parseFloat(expense.amount) : expense.amount;
                  const paid = typeof expense.paidAmount === "string" ? parseFloat(expense.paidAmount) : (expense.paidAmount || 0);
                  const remaining = typeof expense.remainingDue === "string" ? parseFloat(expense.remainingDue) : (expense.remainingDue || (total - paid));
                  const needsPay = expense.paymentStatus === "unpaid" || expense.paymentStatus === "partial";
                  return (
                    <TableRow key={expense.id} data-testid={`row-expense-${expense.id}`}>
                      <TableCell data-testid={`text-expense-date-${expense.id}`}>{formatPkDate(expense.date)}</TableCell>
                      <TableCell className="font-medium" data-testid={`text-expense-desc-${expense.id}`}>
                        {expense.title || expense.description || "-"}
                      </TableCell>
                      <TableCell data-testid={`text-expense-category-${expense.id}`}>{expense.category || "-"}</TableCell>
                      <TableCell className="text-right" data-testid={`text-expense-total-${expense.id}`}>{formatPKR(total)}</TableCell>
                      <TableCell className="text-right" data-testid={`text-expense-paid-${expense.id}`}>{formatPKR(paid)}</TableCell>
                      <TableCell className="text-right" data-testid={`text-expense-remaining-${expense.id}`}>
                        {remaining > 0 ? (
                          <span className="text-red-600 dark:text-red-400">{formatPKR(remaining)}</span>
                        ) : formatPKR(remaining)}
                      </TableCell>
                      <TableCell data-testid={`text-expense-status-${expense.id}`}>{getStatusBadge(expense.paymentStatus)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {needsPay && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => openPayDialog(expense)}
                              data-testid={`button-pay-${expense.id}`}
                            >
                              <CreditCard className="w-3 h-3 mr-1" />
                              Pay
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setHistoryExpenseId(expense.id)}
                            data-testid={`button-history-${expense.id}`}
                          >
                            <History className="w-3 h-3 mr-1" />
                            History
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={payDialogOpen} onOpenChange={(open) => { if (!open) setPayDialogOpen(false); }}>
        <DialogContent data-testid="dialog-pay-expense">
          <DialogHeader>
            <DialogTitle>Pay Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pay-amount">Amount</Label>
              <Input
                id="pay-amount"
                type="number"
                step="0.01"
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                placeholder="0.00"
                data-testid="input-pay-amount"
              />
            </div>
            <div className="space-y-2">
              <Label>Cash Account *</Label>
              <Select value={payForm.cashAccountId} onValueChange={(v) => setPayForm({ ...payForm, cashAccountId: v })}>
                <SelectTrigger data-testid="select-pay-account">
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
              <Label htmlFor="pay-date">Date</Label>
              <Input
                id="pay-date"
                type="date"
                value={payForm.date}
                onChange={(e) => setPayForm({ ...payForm, date: e.target.value })}
                data-testid="input-pay-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)} data-testid="button-cancel-pay">Cancel</Button>
            <Button onClick={handlePay} disabled={payMutation.isPending} data-testid="button-submit-pay">
              {payMutation.isPending ? "Paying..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyExpenseId} onOpenChange={(open) => { if (!open) setHistoryExpenseId(null); }}>
        <DialogContent data-testid="dialog-payment-history">
          <DialogHeader>
            <DialogTitle>Payment History</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {paymentsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : payments.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground" data-testid="text-no-payments">
                No payments recorded for this expense yet.
              </div>
            ) : (
              <Table data-testid="table-payment-history">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => {
                    const amt = typeof payment.amount === "string" ? parseFloat(payment.amount) : payment.amount;
                    return (
                      <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                        <TableCell>{formatPkDate(payment.date)}</TableCell>
                        <TableCell className="text-right">{formatPKR(amt)}</TableCell>
                        <TableCell>{payment.note || "-"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialogOpen} onOpenChange={(open) => { if (!open) { setCreateDialogOpen(false); setCreateForm({ amount: "", expenseTypeId: "", description: "", date: todayStr() }); } }}>
        <DialogContent data-testid="dialog-create-unpaid">
          <DialogHeader>
            <DialogTitle>Create Unpaid Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="create-amount">Amount *</Label>
              <Input
                id="create-amount"
                type="number"
                step="0.01"
                value={createForm.amount}
                onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })}
                placeholder="0.00"
                data-testid="input-create-amount"
              />
            </div>
            <div className="space-y-2">
              <Label>Expense Type *</Label>
              <Select value={createForm.expenseTypeId} onValueChange={(v) => setCreateForm({ ...createForm, expenseTypeId: v })}>
                <SelectTrigger data-testid="select-create-expense-type">
                  <SelectValue placeholder="Select expense type" />
                </SelectTrigger>
                <SelectContent>
                  {expenseTypes.map((et) => (
                    <SelectItem key={et.id} value={et.id} data-testid={`option-expense-type-${et.id}`}>
                      {et.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-description">Description</Label>
              <Input
                id="create-description"
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                placeholder="Description"
                data-testid="input-create-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-date">Date</Label>
              <Input
                id="create-date"
                type="date"
                value={createForm.date}
                onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })}
                data-testid="input-create-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialogOpen(false); setCreateForm({ amount: "", expenseTypeId: "", description: "", date: todayStr() }); }} data-testid="button-cancel-create">
              Cancel
            </Button>
            <Button onClick={handleCreateUnpaid} disabled={createUnpaidMutation.isPending} data-testid="button-submit-create-unpaid">
              {createUnpaidMutation.isPending ? "Creating..." : "Create Unpaid Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
