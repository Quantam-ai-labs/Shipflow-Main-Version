import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Receipt, Users, ArrowLeftRight, Truck, CreditCard } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface CashMovement {
  id: string;
  type: "in" | "out";
  amount: string;
  description: string;
  date: string;
  accountName?: string;
  partyName?: string;
  cashAccountId?: string;
  partyId?: string;
}

interface CashAccount {
  id: string;
  name: string;
  type: string;
  balance: string;
}

interface Party {
  id: string;
  name: string;
  type: string;
}

interface ExpenseType {
  id: string;
  name: string;
  category?: string;
}

function formatPKR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs. 0";
  return `Rs. ${num.toLocaleString()}`;
}

const moneyInSchema = z.object({
  amount: z.string().min(1, "Amount is required").refine(v => parseFloat(v) > 0, "Amount must be positive"),
  cashAccountId: z.string().min(1, "Cash account is required"),
  partyId: z.string().optional(),
  description: z.string().optional(),
  date: z.string().min(1, "Date is required"),
});

const newExpenseSchema = z.object({
  amount: z.string().min(1, "Amount is required").refine(v => parseFloat(v) > 0, "Amount must be positive"),
  cashAccountId: z.string().min(1, "Cash account is required"),
  expenseTypeId: z.string().min(1, "Expense type is required"),
  description: z.string().optional(),
  date: z.string().min(1, "Date is required"),
});

const payPartySchema = z.object({
  amount: z.string().min(1, "Amount is required").refine(v => parseFloat(v) > 0, "Amount must be positive"),
  cashAccountId: z.string().min(1, "Cash account is required"),
  partyId: z.string().min(1, "Party is required"),
  description: z.string().optional(),
  date: z.string().min(1, "Date is required"),
});

const transferSchema = z.object({
  amount: z.string().min(1, "Amount is required").refine(v => parseFloat(v) > 0, "Amount must be positive"),
  fromAccountId: z.string().min(1, "Source account is required"),
  toAccountId: z.string().min(1, "Destination account is required"),
  description: z.string().optional(),
  date: z.string().min(1, "Date is required"),
});

type MoneyInForm = z.infer<typeof moneyInSchema>;
type NewExpenseForm = z.infer<typeof newExpenseSchema>;
type PayPartyForm = z.infer<typeof payPartySchema>;
type TransferForm = z.infer<typeof transferSchema>;

function invalidateAfterMutation() {
  queryClient.invalidateQueries({ queryKey: ["/api/accounting/cash-movements"] });
  queryClient.invalidateQueries({ queryKey: ["/api/accounting/cash-accounts"] });
  queryClient.invalidateQueries({ queryKey: ["/api/accounting/reports/overview"] });
}

const todayStr = () => new Date().toISOString().split("T")[0];

function TableSkeleton() {
  return (
    <div className="space-y-3" data-testid="table-skeleton">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function MoneyInDialog({
  open,
  onOpenChange,
  accounts,
  parties,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: CashAccount[];
  parties: Party[];
}) {
  const { toast } = useToast();
  const form = useForm<MoneyInForm>({
    resolver: zodResolver(moneyInSchema),
    defaultValues: { amount: "", cashAccountId: "", partyId: "", description: "", date: todayStr() },
  });

  const mutation = useMutation({
    mutationFn: async (data: MoneyInForm) => {
      const res = await apiRequest("POST", "/api/accounting/money-in", {
        amount: data.amount,
        cashAccountId: data.cashAccountId,
        partyId: data.partyId || undefined,
        note: data.description,
        date: data.date,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Money In recorded successfully" });
      invalidateAfterMutation();
      form.reset({ amount: "", cashAccountId: "", partyId: "", description: "", date: todayStr() });
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-money-in">
        <DialogHeader>
          <DialogTitle>Money In</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
          className="space-y-4"
          data-testid="form-money-in"
        >
          <div className="space-y-2">
            <Label htmlFor="money-in-amount">Amount</Label>
            <Input
              id="money-in-amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              data-testid="input-money-in-amount"
              {...form.register("amount")}
            />
            {form.formState.errors.amount && (
              <p className="text-sm text-destructive" data-testid="error-money-in-amount">
                {form.formState.errors.amount.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Cash Account</Label>
            <Select
              value={form.watch("cashAccountId")}
              onValueChange={(v) => form.setValue("cashAccountId", v)}
            >
              <SelectTrigger data-testid="select-money-in-account">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id} data-testid={`option-account-${a.id}`}>
                    {a.name} ({formatPKR(a.balance)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.cashAccountId && (
              <p className="text-sm text-destructive">{form.formState.errors.cashAccountId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Party (optional)</Label>
            <Select
              value={form.watch("partyId") || ""}
              onValueChange={(v) => form.setValue("partyId", v === "__none__" ? "" : v)}
            >
              <SelectTrigger data-testid="select-money-in-party">
                <SelectValue placeholder="Select party" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {parties.map((p) => (
                  <SelectItem key={p.id} value={p.id} data-testid={`option-party-${p.id}`}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="money-in-description">Description</Label>
            <Input
              id="money-in-description"
              placeholder="Description"
              data-testid="input-money-in-description"
              {...form.register("description")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="money-in-date">Date</Label>
            <Input
              id="money-in-date"
              type="date"
              data-testid="input-money-in-date"
              {...form.register("date")}
            />
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-submit-money-in">
            {mutation.isPending ? "Saving..." : "Record Money In"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoneyOutIntentDialog({
  open,
  onOpenChange,
  onSelectIntent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelectIntent: (intent: string) => void;
}) {
  const [, navigate] = useLocation();

  const intents = [
    {
      id: "pay-expense",
      label: "Pay Existing Expense",
      icon: Receipt,
      description: "Pay an unpaid expense",
    },
    {
      id: "new-expense",
      label: "New Expense",
      icon: CreditCard,
      description: "Record and pay a new expense",
    },
    {
      id: "pay-party",
      label: "Pay Party",
      icon: Users,
      description: "Make a payment to a party",
    },
    {
      id: "transfer",
      label: "Transfer Between Accounts",
      icon: ArrowLeftRight,
      description: "Move money between your accounts",
    },
    {
      id: "courier-settlement",
      label: "Courier Settlement",
      icon: Truck,
      description: "Record courier COD settlements",
    },
  ];

  const handleClick = (intentId: string) => {
    onOpenChange(false);
    if (intentId === "pay-expense") {
      navigate("/accounting/expenses-unpaid");
    } else if (intentId === "courier-settlement") {
      navigate("/accounting/settlements");
    } else {
      onSelectIntent(intentId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-money-out-intent">
        <DialogHeader>
          <DialogTitle>Money Out - Choose Action</DialogTitle>
        </DialogHeader>
        <div className="space-y-2" data-testid="money-out-options">
          {intents.map((intent) => (
            <Button
              key={intent.id}
              variant="outline"
              className="w-full justify-start gap-3"
              onClick={() => handleClick(intent.id)}
              data-testid={`button-intent-${intent.id}`}
            >
              <intent.icon className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <div className="font-medium">{intent.label}</div>
                <div className="text-xs text-muted-foreground">{intent.description}</div>
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewExpenseDialog({
  open,
  onOpenChange,
  accounts,
  expenseTypes,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: CashAccount[];
  expenseTypes: ExpenseType[];
}) {
  const { toast } = useToast();
  const form = useForm<NewExpenseForm>({
    resolver: zodResolver(newExpenseSchema),
    defaultValues: { amount: "", cashAccountId: "", expenseTypeId: "", description: "", date: todayStr() },
  });

  const mutation = useMutation({
    mutationFn: async (data: NewExpenseForm) => {
      const expType = expenseTypes.find((e) => e.id === data.expenseTypeId);
      const res = await apiRequest("POST", "/api/accounting/money-out/new-expense", {
        amount: data.amount,
        cashAccountId: data.cashAccountId,
        title: data.description || expType?.name || "Expense",
        category: expType?.name || "general",
        date: data.date,
        note: data.description,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "New expense recorded successfully" });
      invalidateAfterMutation();
      form.reset({ amount: "", cashAccountId: "", expenseTypeId: "", description: "", date: todayStr() });
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-new-expense">
        <DialogHeader>
          <DialogTitle>New Expense</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
          className="space-y-4"
          data-testid="form-new-expense"
        >
          <div className="space-y-2">
            <Label htmlFor="expense-amount">Amount</Label>
            <Input
              id="expense-amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              data-testid="input-expense-amount"
              {...form.register("amount")}
            />
            {form.formState.errors.amount && (
              <p className="text-sm text-destructive">{form.formState.errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Cash Account</Label>
            <Select
              value={form.watch("cashAccountId")}
              onValueChange={(v) => form.setValue("cashAccountId", v)}
            >
              <SelectTrigger data-testid="select-expense-account">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.cashAccountId && (
              <p className="text-sm text-destructive">{form.formState.errors.cashAccountId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Expense Type</Label>
            <Select
              value={form.watch("expenseTypeId")}
              onValueChange={(v) => form.setValue("expenseTypeId", v)}
            >
              <SelectTrigger data-testid="select-expense-type">
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
            {form.formState.errors.expenseTypeId && (
              <p className="text-sm text-destructive">{form.formState.errors.expenseTypeId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-description">Description</Label>
            <Input
              id="expense-description"
              placeholder="Description"
              data-testid="input-expense-description"
              {...form.register("description")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-date">Date</Label>
            <Input
              id="expense-date"
              type="date"
              data-testid="input-expense-date"
              {...form.register("date")}
            />
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-submit-new-expense">
            {mutation.isPending ? "Saving..." : "Record Expense"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayPartyDialog({
  open,
  onOpenChange,
  accounts,
  parties,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: CashAccount[];
  parties: Party[];
}) {
  const { toast } = useToast();
  const form = useForm<PayPartyForm>({
    resolver: zodResolver(payPartySchema),
    defaultValues: { amount: "", cashAccountId: "", partyId: "", description: "", date: todayStr() },
  });

  const mutation = useMutation({
    mutationFn: async (data: PayPartyForm) => {
      const res = await apiRequest("POST", "/api/accounting/money-out/pay-party", {
        amount: data.amount,
        cashAccountId: data.cashAccountId,
        partyId: data.partyId,
        note: data.description,
        date: data.date,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Party payment recorded successfully" });
      invalidateAfterMutation();
      form.reset({ amount: "", cashAccountId: "", partyId: "", description: "", date: todayStr() });
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-pay-party">
        <DialogHeader>
          <DialogTitle>Pay Party</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
          className="space-y-4"
          data-testid="form-pay-party"
        >
          <div className="space-y-2">
            <Label htmlFor="pay-party-amount">Amount</Label>
            <Input
              id="pay-party-amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              data-testid="input-pay-party-amount"
              {...form.register("amount")}
            />
            {form.formState.errors.amount && (
              <p className="text-sm text-destructive">{form.formState.errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Cash Account</Label>
            <Select
              value={form.watch("cashAccountId")}
              onValueChange={(v) => form.setValue("cashAccountId", v)}
            >
              <SelectTrigger data-testid="select-pay-party-account">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.cashAccountId && (
              <p className="text-sm text-destructive">{form.formState.errors.cashAccountId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Party</Label>
            <Select
              value={form.watch("partyId")}
              onValueChange={(v) => form.setValue("partyId", v)}
            >
              <SelectTrigger data-testid="select-pay-party-party">
                <SelectValue placeholder="Select party" />
              </SelectTrigger>
              <SelectContent>
                {parties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.partyId && (
              <p className="text-sm text-destructive">{form.formState.errors.partyId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-party-description">Description</Label>
            <Input
              id="pay-party-description"
              placeholder="Description"
              data-testid="input-pay-party-description"
              {...form.register("description")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-party-date">Date</Label>
            <Input
              id="pay-party-date"
              type="date"
              data-testid="input-pay-party-date"
              {...form.register("date")}
            />
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-submit-pay-party">
            {mutation.isPending ? "Saving..." : "Pay Party"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: CashAccount[];
}) {
  const { toast } = useToast();
  const form = useForm<TransferForm>({
    resolver: zodResolver(transferSchema),
    defaultValues: { amount: "", fromAccountId: "", toAccountId: "", description: "", date: todayStr() },
  });

  const mutation = useMutation({
    mutationFn: async (data: TransferForm) => {
      const res = await apiRequest("POST", "/api/accounting/money-out/transfer", {
        amount: data.amount,
        fromAccountId: data.fromAccountId,
        toAccountId: data.toAccountId,
        note: data.description,
        date: data.date,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Transfer completed successfully" });
      invalidateAfterMutation();
      form.reset({ amount: "", fromAccountId: "", toAccountId: "", description: "", date: todayStr() });
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-transfer">
        <DialogHeader>
          <DialogTitle>Transfer Between Accounts</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
          className="space-y-4"
          data-testid="form-transfer"
        >
          <div className="space-y-2">
            <Label htmlFor="transfer-amount">Amount</Label>
            <Input
              id="transfer-amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              data-testid="input-transfer-amount"
              {...form.register("amount")}
            />
            {form.formState.errors.amount && (
              <p className="text-sm text-destructive">{form.formState.errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>From Account</Label>
            <Select
              value={form.watch("fromAccountId")}
              onValueChange={(v) => form.setValue("fromAccountId", v)}
            >
              <SelectTrigger data-testid="select-transfer-from">
                <SelectValue placeholder="Select source account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} ({formatPKR(a.balance)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.fromAccountId && (
              <p className="text-sm text-destructive">{form.formState.errors.fromAccountId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>To Account</Label>
            <Select
              value={form.watch("toAccountId")}
              onValueChange={(v) => form.setValue("toAccountId", v)}
            >
              <SelectTrigger data-testid="select-transfer-to">
                <SelectValue placeholder="Select destination account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} ({formatPKR(a.balance)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.toAccountId && (
              <p className="text-sm text-destructive">{form.formState.errors.toAccountId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="transfer-description">Description</Label>
            <Input
              id="transfer-description"
              placeholder="Description"
              data-testid="input-transfer-description"
              {...form.register("description")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="transfer-date">Date</Label>
            <Input
              id="transfer-date"
              type="date"
              data-testid="input-transfer-date"
              {...form.register("date")}
            />
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-submit-transfer">
            {mutation.isPending ? "Saving..." : "Transfer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function MoneyPage() {
  const [moneyInOpen, setMoneyInOpen] = useState(false);
  const [moneyOutIntentOpen, setMoneyOutIntentOpen] = useState(false);
  const [newExpenseOpen, setNewExpenseOpen] = useState(false);
  const [payPartyOpen, setPayPartyOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const { data: movements, isLoading: isMovementsLoading } = useQuery<CashMovement[]>({
    queryKey: ["/api/accounting/cash-movements"],
  });

  const { data: accounts = [] } = useQuery<CashAccount[]>({
    queryKey: ["/api/accounting/cash-accounts"],
  });

  const { data: partiesList = [] } = useQuery<Party[]>({
    queryKey: ["/api/accounting/parties"],
  });

  const { data: expenseTypesList = [] } = useQuery<ExpenseType[]>({
    queryKey: ["/api/accounting/expense-types"],
  });

  const handleIntentSelect = (intent: string) => {
    if (intent === "new-expense") setNewExpenseOpen(true);
    else if (intent === "pay-party") setPayPartyOpen(true);
    else if (intent === "transfer") setTransferOpen(true);
  };

  const movementsList = Array.isArray(movements) ? movements : [];

  return (
    <div className="space-y-6" data-testid="money-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          Money
        </h1>
        <p className="text-muted-foreground mt-1">Manage your cash flow</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <Button
          size="lg"
          className="bg-green-600 hover:bg-green-700 text-white gap-2"
          onClick={() => setMoneyInOpen(true)}
          data-testid="button-money-in"
        >
          <ArrowDownLeft className="w-5 h-5" />
          Money In
        </Button>
        <Button
          size="lg"
          className="bg-red-600 hover:bg-red-700 text-white gap-2"
          onClick={() => setMoneyOutIntentOpen(true)}
          data-testid="button-money-out"
        >
          <ArrowUpRight className="w-5 h-5" />
          Money Out
        </Button>
      </div>

      <Card data-testid="card-transaction-history">
        <CardContent className="p-0">
          {isMovementsLoading ? (
            <div className="p-6">
              <TableSkeleton />
            </div>
          ) : movementsList.length > 0 ? (
            <Table data-testid="table-transactions">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Account</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movementsList.map((m, index) => {
                  const amt = parseFloat(m.amount);
                  const isIn = m.type === "in";
                  return (
                    <TableRow key={m.id || index} data-testid={`row-transaction-${m.id || index}`}>
                      <TableCell data-testid={`cell-date-${m.id || index}`}>
                        {m.date ? format(new Date(m.date), "dd MMM yyyy") : "-"}
                      </TableCell>
                      <TableCell data-testid={`cell-type-${m.id || index}`}>
                        <Badge variant={isIn ? "default" : "destructive"}>
                          {isIn ? "In" : "Out"}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`cell-description-${m.id || index}`}>
                        {m.description || "-"}
                      </TableCell>
                      <TableCell data-testid={`cell-amount-${m.id || index}`}>
                        <span className={isIn ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                          {isIn ? "+" : "-"} {formatPKR(amt)}
                        </span>
                      </TableCell>
                      <TableCell data-testid={`cell-party-${m.id || index}`}>
                        {m.partyName || "-"}
                      </TableCell>
                      <TableCell data-testid={`cell-account-${m.id || index}`}>
                        {m.accountName || "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 text-center text-muted-foreground" data-testid="text-no-transactions">
              No transactions found
            </div>
          )}
        </CardContent>
      </Card>

      <MoneyInDialog
        open={moneyInOpen}
        onOpenChange={setMoneyInOpen}
        accounts={accounts}
        parties={partiesList}
      />

      <MoneyOutIntentDialog
        open={moneyOutIntentOpen}
        onOpenChange={setMoneyOutIntentOpen}
        onSelectIntent={handleIntentSelect}
      />

      <NewExpenseDialog
        open={newExpenseOpen}
        onOpenChange={setNewExpenseOpen}
        accounts={accounts}
        expenseTypes={expenseTypesList}
      />

      <PayPartyDialog
        open={payPartyOpen}
        onOpenChange={setPayPartyOpen}
        accounts={accounts}
        parties={partiesList}
      />

      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        accounts={accounts}
      />
    </div>
  );
}
