import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { formatPkDate } from "@/lib/dateFormat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Plus,
  Pencil,
  Trash2,
  Receipt,
  DollarSign,
  Calendar,
  Loader2,
  Filter,
  BarChart3,
  Download,
} from "lucide-react";
import { exportCsvWithDate } from "@/lib/exportCsv";
import type { Expense } from "@shared/schema";

const CATEGORIES = [
  "Rent",
  "Salaries",
  "Utilities",
  "Marketing",
  "Packaging",
  "Shipping",
  "Courier Fees",
  "Returns & Refunds",
  "Office Supplies",
  "Software & Tools",
  "Taxes",
  "Miscellaneous",
] as const;

const PAYMENT_METHODS = [
  "Cash",
  "Bank Transfer",
  "Online/Card",
  "Cheque",
  "Other",
] as const;

const RECURRING_FREQUENCIES = ["daily", "weekly", "monthly"] as const;

const expenseFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  amount: z.string().min(1, "Amount is required").refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Must be a positive number"),
  category: z.string().min(1, "Category is required"),
  date: z.string().min(1, "Date is required"),
  paymentMethod: z.string().optional(),
  reference: z.string().optional(),
  isRecurring: z.boolean().default(false),
  recurringFrequency: z.string().optional(),
  notes: z.string().optional(),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

function formatPKR(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "PKR 0";
  return `PKR ${num.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

interface ExpenseSummary {
  totalExpenses: number;
  categoryBreakdown: Record<string, number>;
}

export default function ExpenseTracker() {
  const { toast } = useToast();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null);

  const buildQueryUrl = () => {
    const params = new URLSearchParams();
    if (categoryFilter && categoryFilter !== "all") params.set("category", categoryFilter);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    const qs = params.toString();
    return `/api/expenses${qs ? `?${qs}` : ""}`;
  };

  const buildSummaryUrl = () => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    const qs = params.toString();
    return `/api/expenses/summary${qs ? `?${qs}` : ""}`;
  };

  const { data: expenses, isLoading } = useQuery<Expense[]>({
    queryKey: [buildQueryUrl()],
  });

  const { data: summary } = useQuery<ExpenseSummary>({
    queryKey: [buildSummaryUrl()],
  });

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      title: "",
      description: "",
      amount: "",
      category: "",
      date: format(new Date(), "yyyy-MM-dd"),
      paymentMethod: "",
      reference: "",
      isRecurring: false,
      recurringFrequency: "",
      notes: "",
    },
  });

  const isRecurring = form.watch("isRecurring");

  const createMutation = useMutation({
    mutationFn: (data: ExpenseFormValues) =>
      apiRequest("POST", "/api/expenses", {
        ...data,
        amount: data.amount,
        date: new Date(data.date).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/expenses") });
      toast({ title: "Expense created", description: "Expense has been added successfully." });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExpenseFormValues }) =>
      apiRequest("PUT", `/api/expenses/${id}`, {
        ...data,
        amount: data.amount,
        date: new Date(data.date).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/expenses") });
      toast({ title: "Expense updated", description: "Expense has been updated successfully." });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/expenses") });
      toast({ title: "Expense deleted", description: "Expense has been removed." });
      setDeleteExpense(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openAddDialog = () => {
    setEditingExpense(null);
    form.reset({
      title: "",
      description: "",
      amount: "",
      category: "",
      date: format(new Date(), "yyyy-MM-dd"),
      paymentMethod: "",
      reference: "",
      isRecurring: false,
      recurringFrequency: "",
      notes: "",
    });
    setDialogOpen(true);
  };

  const openEditDialog = (expense: Expense) => {
    setEditingExpense(expense);
    form.reset({
      title: expense.title,
      description: expense.description || "",
      amount: String(expense.amount),
      category: expense.category,
      date: expense.date ? format(new Date(expense.date), "yyyy-MM-dd") : "",
      paymentMethod: expense.paymentMethod || "",
      reference: expense.reference || "",
      isRecurring: expense.isRecurring || false,
      recurringFrequency: expense.recurringFrequency || "",
      notes: expense.notes || "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingExpense(null);
    form.reset();
  };

  const onSubmit = (values: ExpenseFormValues) => {
    if (editingExpense) {
      updateMutation.mutate({ id: editingExpense.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  const topCategories = summary?.categoryBreakdown
    ? Object.entries(summary.categoryBreakdown)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
    : [];

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-expenses-title">Expense Tracker</h1>
          <p className="text-sm text-muted-foreground">
            Track and manage your business expenses
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => {
              if (!expenses || expenses.length === 0) return;
              const headers = ["Date", "Category", "Description", "Amount", "Payment Method"];
              const rows = expenses.map((e) => [
                formatPkDate(e.date),
                e.category || "",
                e.description || e.title || "",
                String(e.amount ?? ""),
                e.paymentMethod || "",
              ]);
              exportCsvWithDate("expenses", headers, rows);
            }}
            disabled={!expenses || expenses.length === 0}
            data-testid="button-export-expenses"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button onClick={openAddDialog} data-testid="button-add-expense">
            <Plus className="w-4 h-4 mr-2" />
            Add Expense
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-total-expenses">
              {summary ? formatPKR(summary.totalExpenses) : <Skeleton className="h-8 w-32" />}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Entries</CardTitle>
            <Receipt className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-expense-count">
              {expenses ? expenses.length : <Skeleton className="h-8 w-16" />}
            </p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top Categories</CardTitle>
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {topCategories.length > 0 ? (
              <div className="flex items-center gap-3 flex-wrap">
                {topCategories.map(([cat, amt]) => (
                  <div key={cat} className="flex items-center gap-1.5">
                    <Badge variant="secondary">{cat}</Badge>
                    <span className="text-sm font-medium" data-testid={`text-category-total-${cat}`}>
                      {formatPKR(amt)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-category-filter">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-[160px]"
            data-testid="input-start-date"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-[160px]"
            data-testid="input-end-date"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !expenses || expenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center" data-testid="empty-state-expenses">
              <Receipt className="w-12 h-12 text-muted-foreground mb-3" />
              <h3 className="font-semibold text-lg mb-1">No expenses found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {categoryFilter !== "all" || startDate || endDate
                  ? "Try adjusting your filters"
                  : "Add your first expense to get started"}
              </p>
              {categoryFilter === "all" && !startDate && !endDate && (
                <Button onClick={openAddDialog} data-testid="button-add-expense-empty">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Expense
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id} data-testid={`row-expense-${expense.id}`}>
                    <TableCell className="text-sm" data-testid={`text-expense-date-${expense.id}`}>
                      {formatPkDate(expense.date)}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium" data-testid={`text-expense-title-${expense.id}`}>{expense.title}</p>
                        {expense.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[250px]">{expense.description}</p>
                        )}
                        {expense.isRecurring && (
                          <Badge variant="outline" className="text-xs mt-0.5">
                            Recurring ({expense.recurringFrequency})
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" data-testid={`badge-expense-category-${expense.id}`}>
                        {expense.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium" data-testid={`text-expense-amount-${expense.id}`}>
                      {formatPKR(expense.amount)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground" data-testid={`text-expense-payment-${expense.id}`}>
                      {expense.paymentMethod || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(expense)}
                          data-testid={`button-edit-expense-${expense.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteExpense(expense)}
                          data-testid={`button-delete-expense-${expense.id}`}
                        >
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
            <DialogTitle data-testid="text-dialog-title">
              {editingExpense ? "Edit Expense" : "Add Expense"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Expense title" {...field} data-testid="input-expense-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Optional description" {...field} data-testid="input-expense-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (PKR)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="0.00" {...field} data-testid="input-expense-amount" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-expense-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-expense-category">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Method</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-expense-payment-method">
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PAYMENT_METHODS.map((pm) => (
                            <SelectItem key={pm} value={pm}>{pm}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference</FormLabel>
                    <FormControl>
                      <Input placeholder="Invoice/receipt number" {...field} data-testid="input-expense-reference" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="isRecurring"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-2">
                    <FormLabel className="mt-0">Recurring Expense</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-recurring"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {isRecurring && (
                <FormField
                  control={form.control}
                  name="recurringFrequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frequency</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-recurring-frequency">
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {RECURRING_FREQUENCIES.map((freq) => (
                            <SelectItem key={freq} value={freq}>
                              {freq.charAt(0).toUpperCase() + freq.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional notes" {...field} data-testid="input-expense-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog} data-testid="button-cancel-expense">
                  Cancel
                </Button>
                <Button type="submit" disabled={isMutating} data-testid="button-save-expense">
                  {isMutating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingExpense ? "Update" : "Add"} Expense
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteExpense} onOpenChange={(open) => { if (!open) setDeleteExpense(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteExpense?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteExpense && deleteMutation.mutate(deleteExpense.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
