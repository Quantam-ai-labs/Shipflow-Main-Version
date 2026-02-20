import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, Pencil } from "lucide-react";

interface CashAccount {
  id: string;
  name: string;
  type: string;
  balance: string;
  bankName?: string;
  accountNumber?: string;
  isActive?: boolean;
}

function formatPKR(amount: number): string {
  if (isNaN(amount)) return "Rs. 0";
  return `Rs. ${amount.toLocaleString()}`;
}

function PageSkeleton() {
  return (
    <div className="space-y-6" data-testid="cash-accounts-skeleton">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardContent className="p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account?: CashAccount | null;
}) {
  const { toast } = useToast();
  const isEdit = !!account;
  const [name, setName] = useState(account?.name || "");
  const [type, setType] = useState(account?.type || "cash");
  const [openingBalance, setOpeningBalance] = useState("");

  const resetForm = () => {
    setName("");
    setType("cash");
    setOpeningBalance("");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/accounting/cash-accounts", {
        name,
        type,
        openingBalance: openingBalance || "0",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Account created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/cash-accounts"] });
      resetForm();
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/accounting/cash-accounts/${account!.id}`, {
        name,
        type,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Account updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/cash-accounts"] });
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (isEdit) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-cash-account">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Account" : "Add Account"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-cash-account">
          <div className="space-y-2">
            <Label htmlFor="account-name">Account Name</Label>
            <Input
              id="account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Cash"
              data-testid="input-account-name"
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger data-testid="select-account-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="mobile_wallet">Mobile Wallet</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="opening-balance">Opening Balance</Label>
              <Input
                id="opening-balance"
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0.00"
                data-testid="input-opening-balance"
              />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isPending} data-testid="button-submit-account">
            {isPending ? "Saving..." : isEdit ? "Update Account" : "Create Account"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AccountingCashAccounts() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<CashAccount | null>(null);

  const { data, isLoading } = useQuery<CashAccount[]>({
    queryKey: ["/api/accounting/cash-accounts"],
  });

  if (isLoading) return <PageSkeleton />;

  const accounts = data || [];

  const handleEdit = (account: CashAccount) => {
    setEditAccount(account);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditAccount(null);
    setDialogOpen(true);
  };

  const typeBadgeVariant = (type: string) => {
    switch (type) {
      case "bank": return "default" as const;
      case "mobile_wallet": return "secondary" as const;
      default: return "outline" as const;
    }
  };

  return (
    <div className="space-y-6" data-testid="accounting-cash-accounts">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Cash Accounts
          </h1>
          <p className="text-muted-foreground mt-2">Manage your cash, bank, and wallet accounts</p>
        </div>
        <Button onClick={handleAdd} data-testid="button-add-account">
          <Plus className="w-4 h-4 mr-2" /> Add Account
        </Button>
      </div>

      <Card data-testid="card-accounts-table">
        <CardHeader>
          <CardTitle className="text-lg">All Accounts ({accounts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length > 0 ? (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id} data-testid={`row-account-${account.id}`}>
                      <TableCell className="font-medium">{account.name}</TableCell>
                      <TableCell>
                        <Badge variant={typeBadgeVariant(account.type)} data-testid={`badge-type-${account.id}`}>
                          {account.type === "mobile_wallet" ? "Mobile Wallet" : account.type.charAt(0).toUpperCase() + account.type.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPKR(parseFloat(account.balance))}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleEdit(account)}
                          data-testid={`button-edit-${account.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8" data-testid="text-no-accounts">
              No cash accounts yet. Add one to get started.
            </p>
          )}
        </CardContent>
      </Card>

      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={editAccount}
      />
    </div>
  );
}
