import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { Plus, CreditCard } from "lucide-react";

interface UnpaidExpense {
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

const todayStr = () => new Date().toISOString().split("T")[0];

function formatPKR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs. 0";
  return `Rs. ${num.toLocaleString()}`;
}

export default function AccountingExpensesUnpaid() {
  const { toast } = useToast();
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [payForm, setPayForm] = useState<PayFormData>({ expenseId: "", amount: "", cashAccountId: "", date: todayStr() });
  const [createForm, setCreateForm] = useState<CreateUnpaidFormData>({ amount: "", expenseTypeId: "", description: "", date: todayStr() });

  const { data: unpaidExpenses = [], isLoading } = useQuery<UnpaidExpense[]>({
    queryKey: ["/api/accounting/expenses/unpaid"],
  });

  const { data: cashAccounts = [] } = useQuery<CashAccount[]>({
    queryKey: ["/api/accounting/cash-accounts"],
  });

  const { data: expenseTypes = [] } = useQuery<ExpenseType[]>({
    queryKey: ["/api/accounting/expense-types"],
  });

  function invalidateAfterMutation() {
    queryClient.invalidateQueries({ queryKey: ["/api/accounting/expenses/unpaid"] });
    queryClient.invalidateQueries({ queryKey: ["/api/accounting/cash-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/accounting/reports/overview"] });
    queryClient.invalidateQueries({ queryKey: ["/api/accounting/expenses"] });
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

  function openPayDialog(expense: UnpaidExpense) {
    const remaining = typeof expense.remainingDue === "string" ? expense.remainingDue : String(expense.remainingDue || 0);
    setPayForm({
      expenseId: expense.id,
      amount: remaining,
      cashAccountId: "",
      date: todayStr(),
    });
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

  return (
    <div className="space-y-6" data-testid="accounting-expenses-unpaid">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Needs Payment
          </h1>
          <p className="text-muted-foreground mt-1">
            Unpaid and partially paid expenses
          </p>
        </div>
        <Button onClick={() => { setCreateForm({ amount: "", expenseTypeId: "", description: "", date: todayStr() }); setCreateDialogOpen(true); }} data-testid="button-create-unpaid">
          <Plus className="w-4 h-4 mr-2" />
          Create Unpaid Expense
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
          ) : unpaidExpenses.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground" data-testid="text-no-unpaid">
              No unpaid expenses. All expenses are fully paid.
            </div>
          ) : (
            <Table data-testid="table-unpaid-expenses">
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid So Far</TableHead>
                  <TableHead className="text-right">Remaining Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unpaidExpenses.map((expense) => {
                  const total = typeof expense.amount === "string" ? parseFloat(expense.amount) : expense.amount;
                  const paid = typeof expense.paidAmount === "string" ? parseFloat(expense.paidAmount) : (expense.paidAmount || 0);
                  const remaining = typeof expense.remainingDue === "string" ? parseFloat(expense.remainingDue) : (expense.remainingDue || (total - paid));
                  return (
                    <TableRow key={expense.id} data-testid={`row-unpaid-${expense.id}`}>
                      <TableCell className="font-medium" data-testid={`text-unpaid-desc-${expense.id}`}>
                        {expense.title || expense.description || "-"}
                      </TableCell>
                      <TableCell data-testid={`text-unpaid-category-${expense.id}`}>
                        {expense.category || "-"}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-unpaid-total-${expense.id}`}>
                        {formatPKR(total)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-unpaid-paid-${expense.id}`}>
                        {formatPKR(paid)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-unpaid-remaining-${expense.id}`}>
                        <span className="text-red-600 dark:text-red-400">
                          {formatPKR(remaining)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => openPayDialog(expense)}
                          data-testid={`button-pay-expense-${expense.id}`}
                        >
                          <CreditCard className="w-4 h-4 mr-1" />
                          Pay
                        </Button>
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
            <DialogTitle data-testid="text-dialog-title">Pay Expense</DialogTitle>
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
            <Button variant="outline" onClick={() => setPayDialogOpen(false)} data-testid="button-cancel-pay">
              Cancel
            </Button>
            <Button onClick={handlePay} disabled={payMutation.isPending} data-testid="button-submit-pay">
              {payMutation.isPending ? "Paying..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialogOpen} onOpenChange={(open) => { if (!open) { setCreateDialogOpen(false); setCreateForm({ amount: "", expenseTypeId: "", description: "", date: todayStr() }); } }}>
        <DialogContent data-testid="dialog-create-unpaid">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title-create">Create Unpaid Expense</DialogTitle>
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
