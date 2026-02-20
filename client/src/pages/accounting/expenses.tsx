import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

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

interface ExpensePayment {
  id: string;
  amount: string | number;
  date?: string;
  note?: string;
  cashAccountId?: string;
}

function formatPKR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs. 0";
  return `Rs. ${num.toLocaleString()}`;
}

function getStatusBadge(status?: string) {
  switch (status) {
    case "paid":
      return <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" data-testid="badge-status-paid">paid</Badge>;
    case "partial":
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" data-testid="badge-status-partial">partial</Badge>;
    default:
      return <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" data-testid="badge-status-unpaid">unpaid</Badge>;
  }
}

export default function AccountingExpenses() {
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);

  const { data: expensesList = [], isLoading } = useQuery<Expense[]>({
    queryKey: ["/api/accounting/expenses"],
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<ExpensePayment[]>({
    queryKey: [`/api/accounting/expenses/${selectedExpenseId}/payments`],
    enabled: !!selectedExpenseId,
  });

  return (
    <div className="space-y-6" data-testid="accounting-expenses">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          Expense History
        </h1>
        <p className="text-muted-foreground mt-1">
          View all expenses and their payment status
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3" data-testid="table-skeleton">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : expensesList.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground" data-testid="text-no-expenses">
              No expenses found. Expenses are created through the Money Out flow.
            </div>
          ) : (
            <Table data-testid="table-expenses">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expensesList.map((expense) => {
                  const total = typeof expense.amount === "string" ? parseFloat(expense.amount) : expense.amount;
                  const paid = typeof expense.paidAmount === "string" ? parseFloat(expense.paidAmount) : (expense.paidAmount || 0);
                  const remaining = typeof expense.remainingDue === "string" ? parseFloat(expense.remainingDue) : (expense.remainingDue || (total - paid));
                  return (
                    <TableRow
                      key={expense.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedExpenseId(expense.id)}
                      data-testid={`row-expense-${expense.id}`}
                    >
                      <TableCell data-testid={`text-expense-date-${expense.id}`}>
                        {expense.date ? format(new Date(expense.date), "dd MMM yyyy") : "-"}
                      </TableCell>
                      <TableCell className="font-medium" data-testid={`text-expense-desc-${expense.id}`}>
                        {expense.title || expense.description || "-"}
                      </TableCell>
                      <TableCell data-testid={`text-expense-category-${expense.id}`}>
                        {expense.category || "-"}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-expense-total-${expense.id}`}>
                        {formatPKR(total)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-expense-paid-${expense.id}`}>
                        {formatPKR(paid)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-expense-remaining-${expense.id}`}>
                        {formatPKR(remaining)}
                      </TableCell>
                      <TableCell data-testid={`text-expense-status-${expense.id}`}>
                        {getStatusBadge(expense.paymentStatus)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedExpenseId} onOpenChange={(open) => { if (!open) setSelectedExpenseId(null); }}>
        <DialogContent data-testid="dialog-payment-history">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">Payment History</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {paymentsLoading ? (
              <div className="space-y-3" data-testid="payments-skeleton">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
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
                        <TableCell data-testid={`text-payment-date-${payment.id}`}>
                          {payment.date ? format(new Date(payment.date), "dd MMM yyyy") : "-"}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-payment-amount-${payment.id}`}>
                          {formatPKR(amt)}
                        </TableCell>
                        <TableCell data-testid={`text-payment-note-${payment.id}`}>
                          {payment.note || "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
