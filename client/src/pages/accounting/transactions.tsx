import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight, RotateCcw,
  Plus, Eye, Clock, Lock, Search, Filter, ChevronDown, Download,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { exportCsvWithDate } from "@/lib/exportCsv";

interface TransactionRow {
  id: string;
  txnType: string;
  transferMode: string | null;
  category: string | null;
  description: string | null;
  referenceId: string | null;
  amount: string;
  date: string;
  fromPartyId: string | null;
  toPartyId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  fromPartyName: string | null;
  toPartyName: string | null;
  fromAccountName: string | null;
  toAccountName: string | null;
  createdAt: string;
  reversalOf: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  isLocked: boolean;
}

interface Party { id: string; name: string; type: string; }
interface Account { id: string; name: string; type: string; balance: string; }

function formatPKR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs. 0";
  return "Rs. " + num.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const TXN_TYPE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  MONEY_IN: { label: "Money In", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: ArrowDownLeft },
  MONEY_OUT: { label: "Money Out", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: ArrowUpRight },
  TRANSFER: { label: "Transfer", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: ArrowLeftRight },
  REVERSAL: { label: "Reversal", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", icon: RotateCcw },
};

export default function TransactionsPage() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createType, setCreateType] = useState<"MONEY_IN" | "MONEY_OUT" | "TRANSFER" | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null);
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false);
  const [reverseTxnId, setReverseTxnId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [showReversals, setShowReversals] = useState(false);

  const [formData, setFormData] = useState({
    amount: "",
    description: "",
    category: "",
    referenceId: "",
    date: format(new Date(), "yyyy-MM-dd"),
    fromPartyId: "",
    toPartyId: "",
    fromAccountId: "",
    toAccountId: "",
    transferMode: "ACCOUNT_TO_ACCOUNT",
  });

  const queryParams = new URLSearchParams();
  if (filterType !== "all") queryParams.set("type", filterType);
  if (showReversals) queryParams.set("includeReversals", "true");

  const { data: txnData, isLoading } = useQuery<{ transactions: TransactionRow[]; total: number }>({
    queryKey: ["/api/transactions", filterType, showReversals],
    queryFn: () => fetch(`/api/transactions?${queryParams.toString()}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: partiesData } = useQuery<Party[]>({
    queryKey: ["/api/accounting/parties"],
  });

  const { data: accountsData } = useQuery<Account[]>({
    queryKey: ["/api/accounting/cash-accounts"],
  });

  const parties = partiesData || [];
  const accounts = accountsData || [];

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/transactions", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting"] });
      toast({ title: "Transaction created successfully" });
      closeCreateDialog();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const reverseMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/transactions/${id}/reverse`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting"] });
      toast({ title: "Transaction reversed successfully" });
      setReverseDialogOpen(false);
      setReverseTxnId(null);
      setReverseReason("");
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  function openCreateDialog(type: "MONEY_IN" | "MONEY_OUT" | "TRANSFER") {
    setCreateType(type);
    setFormData({
      amount: "",
      description: "",
      category: "",
      referenceId: "",
      date: format(new Date(), "yyyy-MM-dd"),
      fromPartyId: "",
      toPartyId: "",
      fromAccountId: "",
      toAccountId: "",
      transferMode: "ACCOUNT_TO_ACCOUNT",
    });
    setCreateDialogOpen(true);
  }

  function closeCreateDialog() {
    setCreateDialogOpen(false);
    setCreateType(null);
  }

  function handleCreate() {
    if (!createType) return;
    const body: any = {
      txnType: createType,
      amount: formData.amount,
      description: formData.description || undefined,
      category: formData.category || undefined,
      referenceId: formData.referenceId || undefined,
      date: new Date(formData.date).toISOString(),
    };

    if (createType === "MONEY_IN") {
      body.fromPartyId = formData.fromPartyId || undefined;
      body.toAccountId = formData.toAccountId || undefined;
    } else if (createType === "MONEY_OUT") {
      body.fromAccountId = formData.fromAccountId || undefined;
      body.toPartyId = formData.toPartyId || undefined;
    } else if (createType === "TRANSFER") {
      body.transferMode = formData.transferMode;
      if (formData.transferMode === "ACCOUNT_TO_ACCOUNT") {
        body.fromAccountId = formData.fromAccountId || undefined;
        body.toAccountId = formData.toAccountId || undefined;
      } else {
        body.fromPartyId = formData.fromPartyId || undefined;
        body.toPartyId = formData.toPartyId || undefined;
      }
    }

    createMutation.mutate(body);
  }

  function getFlowLabel(txn: TransactionRow): string {
    if (txn.txnType === "MONEY_IN") {
      return `${txn.fromPartyName || "Party"} → ${txn.toAccountName || "Account"}`;
    }
    if (txn.txnType === "MONEY_OUT") {
      return `${txn.fromAccountName || "Account"} → ${txn.toPartyName || "Party"}`;
    }
    if (txn.txnType === "TRANSFER") {
      if (txn.transferMode === "ACCOUNT_TO_ACCOUNT") {
        return `${txn.fromAccountName || "Account"} → ${txn.toAccountName || "Account"}`;
      }
      return `${txn.fromPartyName || "Party"} → ${txn.toPartyName || "Party"}`;
    }
    if (txn.txnType === "REVERSAL") {
      return "Reversal";
    }
    return "";
  }

  const txns = txnData?.transactions || [];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Money</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all financial transactions with double-entry ledger</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Button
          data-testid="button-money-in"
          variant="outline"
          className="h-20 flex flex-col gap-1 border-green-200 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-950"
          onClick={() => openCreateDialog("MONEY_IN")}
        >
          <ArrowDownLeft className="h-6 w-6 text-green-600" />
          <span className="font-semibold text-green-700 dark:text-green-300">Money In</span>
          <span className="text-xs text-muted-foreground">Party pays you</span>
        </Button>
        <Button
          data-testid="button-money-out"
          variant="outline"
          className="h-20 flex flex-col gap-1 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
          onClick={() => openCreateDialog("MONEY_OUT")}
        >
          <ArrowUpRight className="h-6 w-6 text-red-600" />
          <span className="font-semibold text-red-700 dark:text-red-300">Money Out</span>
          <span className="text-xs text-muted-foreground">You pay a party</span>
        </Button>
        <Button
          data-testid="button-transfer"
          variant="outline"
          className="h-20 flex flex-col gap-1 border-blue-200 hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-950"
          onClick={() => openCreateDialog("TRANSFER")}
        >
          <ArrowLeftRight className="h-6 w-6 text-blue-600" />
          <span className="font-semibold text-blue-700 dark:text-blue-300">Transfer</span>
          <span className="text-xs text-muted-foreground">Between accounts or parties</span>
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-type">
            <Filter className="h-4 w-4 mr-1" />
            <SelectValue placeholder="Filter type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="MONEY_IN">Money In</SelectItem>
            <SelectItem value="MONEY_OUT">Money Out</SelectItem>
            <SelectItem value="TRANSFER">Transfer</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={showReversals ? "secondary" : "outline"}
          size="sm"
          data-testid="button-toggle-reversals"
          onClick={() => setShowReversals(!showReversals)}
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          {showReversals ? "Hide Reversed" : "Show Reversed"}
        </Button>
        <Button
          variant="outline"
          data-testid="button-export-transactions"
          disabled={txns.length === 0}
          onClick={() => {
            exportCsvWithDate(
              "transactions",
              ["Date", "Type", "Flow", "Description", "Amount", "Status"],
              txns.map((txn) => [
                format(new Date(txn.date), "dd MMM yyyy"),
                TXN_TYPE_CONFIG[txn.txnType]?.label || txn.txnType,
                getFlowLabel(txn),
                txn.description || txn.category || "",
                String(txn.amount),
                txn.reversedAt ? "Reversed" : txn.isLocked ? "Locked" : "Active",
              ]),
            );
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
        <span className="text-sm text-muted-foreground ml-auto">
          {txnData?.total || 0} transactions
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : txns.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <ArrowLeftRight className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No transactions yet</p>
              <p className="text-sm mt-1">Use the buttons above to create your first transaction</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Flow</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txns.map((txn) => {
                  const config = TXN_TYPE_CONFIG[txn.txnType] || TXN_TYPE_CONFIG.MONEY_IN;
                  const Icon = config.icon;
                  return (
                    <TableRow
                      key={txn.id}
                      data-testid={`row-txn-${txn.id}`}
                      className={txn.reversedAt ? "opacity-50" : ""}
                    >
                      <TableCell className="text-xs">
                        {format(new Date(txn.date), "dd MMM yy")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-xs ${config.color}`}>
                          <Icon className="h-3 w-3 mr-1" />
                          {config.label}
                        </Badge>
                        {txn.transferMode === "PARTY_TO_PARTY" && (
                          <span className="text-xs text-muted-foreground ml-1">P2P</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{getFlowLabel(txn)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {txn.description || txn.category || "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPKR(txn.amount)}
                      </TableCell>
                      <TableCell>
                        {txn.reversedAt ? (
                          <Badge variant="outline" className="text-xs text-yellow-600">Reversed</Badge>
                        ) : txn.isLocked ? (
                          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-green-500" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            data-testid={`button-view-${txn.id}`}
                            onClick={() => { setSelectedTxnId(txn.id); setDetailDialogOpen(true); }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {!txn.reversedAt && txn.txnType !== "REVERSAL" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-yellow-600 hover:text-yellow-700"
                              data-testid={`button-reverse-${txn.id}`}
                              onClick={() => { setReverseTxnId(txn.id); setReverseDialogOpen(true); }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
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

      {/* Create Transaction Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(o) => !o && closeCreateDialog()}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle data-testid="text-create-dialog-title">
              {createType && TXN_TYPE_CONFIG[createType] ? (
                <span className="flex items-center gap-2">
                  {(() => { const C = TXN_TYPE_CONFIG[createType].icon; return <C className="h-5 w-5" />; })()}
                  {TXN_TYPE_CONFIG[createType].label}
                </span>
              ) : "New Transaction"}
            </DialogTitle>
            <DialogDescription>
              {createType === "MONEY_IN" && "Record money received from a party into your account."}
              {createType === "MONEY_OUT" && "Record money paid from your account to a party."}
              {createType === "TRANSFER" && "Transfer between your accounts or settle between parties."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount *</Label>
                <Input
                  data-testid="input-amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                />
              </div>
              <div>
                <Label>Date</Label>
                <Input
                  data-testid="input-date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
            </div>

            {createType === "TRANSFER" && (
              <div>
                <Label>Transfer Mode</Label>
                <Select value={formData.transferMode} onValueChange={(v) => setFormData({ ...formData, transferMode: v, fromPartyId: "", toPartyId: "", fromAccountId: "", toAccountId: "" })}>
                  <SelectTrigger data-testid="select-transfer-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACCOUNT_TO_ACCOUNT">Account to Account</SelectItem>
                    <SelectItem value="PARTY_TO_PARTY">Party to Party</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* MONEY_IN: From Party, To Account */}
            {createType === "MONEY_IN" && (
              <>
                <div>
                  <Label>From Party *</Label>
                  <Select value={formData.fromPartyId} onValueChange={(v) => setFormData({ ...formData, fromPartyId: v })}>
                    <SelectTrigger data-testid="select-from-party">
                      <SelectValue placeholder="Select party" />
                    </SelectTrigger>
                    <SelectContent>
                      {parties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.type})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>To Account *</Label>
                  <Select value={formData.toAccountId} onValueChange={(v) => setFormData({ ...formData, toAccountId: v })}>
                    <SelectTrigger data-testid="select-to-account">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name} ({formatPKR(a.balance)})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* MONEY_OUT: From Account, To Party */}
            {createType === "MONEY_OUT" && (
              <>
                <div>
                  <Label>From Account *</Label>
                  <Select value={formData.fromAccountId} onValueChange={(v) => setFormData({ ...formData, fromAccountId: v })}>
                    <SelectTrigger data-testid="select-from-account">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name} ({formatPKR(a.balance)})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>To Party *</Label>
                  <Select value={formData.toPartyId} onValueChange={(v) => setFormData({ ...formData, toPartyId: v })}>
                    <SelectTrigger data-testid="select-to-party">
                      <SelectValue placeholder="Select party" />
                    </SelectTrigger>
                    <SelectContent>
                      {parties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.type})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* TRANSFER: Account-to-Account */}
            {createType === "TRANSFER" && formData.transferMode === "ACCOUNT_TO_ACCOUNT" && (
              <>
                <div>
                  <Label>From Account *</Label>
                  <Select value={formData.fromAccountId} onValueChange={(v) => setFormData({ ...formData, fromAccountId: v })}>
                    <SelectTrigger data-testid="select-from-account">
                      <SelectValue placeholder="Select source account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name} ({formatPKR(a.balance)})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>To Account *</Label>
                  <Select value={formData.toAccountId} onValueChange={(v) => setFormData({ ...formData, toAccountId: v })}>
                    <SelectTrigger data-testid="select-to-account">
                      <SelectValue placeholder="Select destination account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.filter(a => a.id !== formData.fromAccountId).map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name} ({formatPKR(a.balance)})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* TRANSFER: Party-to-Party */}
            {createType === "TRANSFER" && formData.transferMode === "PARTY_TO_PARTY" && (
              <>
                <div>
                  <Label>From Party *</Label>
                  <Select value={formData.fromPartyId} onValueChange={(v) => setFormData({ ...formData, fromPartyId: v })}>
                    <SelectTrigger data-testid="select-from-party">
                      <SelectValue placeholder="Select source party" />
                    </SelectTrigger>
                    <SelectContent>
                      {parties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.type})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>To Party *</Label>
                  <Select value={formData.toPartyId} onValueChange={(v) => setFormData({ ...formData, toPartyId: v })}>
                    <SelectTrigger data-testid="select-to-party">
                      <SelectValue placeholder="Select destination party" />
                    </SelectTrigger>
                    <SelectContent>
                      {parties.filter(p => p.id !== formData.fromPartyId).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.type})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div>
              <Label>Category</Label>
              <Input
                data-testid="input-category"
                placeholder="e.g. Shipping, Salary, Supplies..."
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
            </div>

            <div>
              <Label>Description {createType === "TRANSFER" && formData.transferMode === "PARTY_TO_PARTY" ? "*" : ""}</Label>
              <Textarea
                data-testid="input-description"
                placeholder="Transaction details..."
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div>
              <Label>Reference ID</Label>
              <Input
                data-testid="input-reference"
                placeholder="Invoice #, Receipt #, etc."
                value={formData.referenceId}
                onChange={(e) => setFormData({ ...formData, referenceId: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreateDialog} data-testid="button-cancel-create">Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !formData.amount}
              data-testid="button-submit-create"
            >
              {createMutation.isPending ? "Creating..." : "Create Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction Detail Dialog */}
      <TransactionDetailDialog
        txnId={selectedTxnId}
        open={detailDialogOpen}
        onClose={() => { setDetailDialogOpen(false); setSelectedTxnId(null); }}
      />

      {/* Reverse Transaction Dialog */}
      <Dialog open={reverseDialogOpen} onOpenChange={(o) => { if (!o) { setReverseDialogOpen(false); setReverseTxnId(null); setReverseReason(""); } }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Reverse Transaction</DialogTitle>
            <DialogDescription>
              This will create a reversal entry that cancels out the original transaction. The original will remain in the ledger for audit purposes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Reason for Reversal *</Label>
              <Textarea
                data-testid="input-reversal-reason"
                placeholder="Why is this transaction being reversed?"
                rows={3}
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReverseDialogOpen(false); setReverseReason(""); }} data-testid="button-cancel-reverse">Cancel</Button>
            <Button
              variant="destructive"
              disabled={reverseMutation.isPending || !reverseReason.trim()}
              data-testid="button-confirm-reverse"
              onClick={() => reverseTxnId && reverseMutation.mutate({ id: reverseTxnId, reason: reverseReason })}
            >
              {reverseMutation.isPending ? "Reversing..." : "Reverse Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TransactionDetailDialog({ txnId, open, onClose }: { txnId: string | null; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/transactions", txnId],
    queryFn: () => txnId ? fetch(`/api/transactions/${txnId}`, { credentials: "include" }).then(r => r.json()) : null,
    enabled: !!txnId && open,
  });

  if (!open) return null;

  const config = data ? (TXN_TYPE_CONFIG[data.txnType] || TXN_TYPE_CONFIG.MONEY_IN) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-detail-title">Transaction Detail</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge className={config?.color}>{config?.label}</Badge>
              <span className="text-2xl font-bold">{formatPKR(data.amount)}</span>
            </div>

            {data.reversedAt && (
              <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">This transaction has been reversed</p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Reason: {data.reversalReason}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Date:</span>
                <span className="ml-2">{format(new Date(data.date), "dd MMM yyyy")}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <span className="ml-2">{data.isLocked ? "Locked" : "Editable"}</span>
              </div>
              {data.category && (
                <div>
                  <span className="text-muted-foreground">Category:</span>
                  <span className="ml-2">{data.category}</span>
                </div>
              )}
              {data.referenceId && (
                <div>
                  <span className="text-muted-foreground">Reference:</span>
                  <span className="ml-2">{data.referenceId}</span>
                </div>
              )}
              {data.description && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Description:</span>
                  <span className="ml-2">{data.description}</span>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <span className="text-sm font-medium">Flow</span>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                {data.fromPartyName && (
                  <div><span className="text-muted-foreground">From Party:</span> <span className="ml-1">{data.fromPartyName}</span></div>
                )}
                {data.toPartyName && (
                  <div><span className="text-muted-foreground">To Party:</span> <span className="ml-1">{data.toPartyName}</span></div>
                )}
                {data.fromAccountName && (
                  <div><span className="text-muted-foreground">From Account:</span> <span className="ml-1">{data.fromAccountName}</span></div>
                )}
                {data.toAccountName && (
                  <div><span className="text-muted-foreground">To Account:</span> <span className="ml-1">{data.toAccountName}</span></div>
                )}
              </div>
            </div>

            <Separator />

            <div>
              <span className="text-sm font-medium">Ledger Lines</span>
              <Table className="mt-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.ledgerLines || []).map((line: any) => (
                    <TableRow key={line.id}>
                      <TableCell className="text-sm">{line.entityType}: {line.entityId.substring(0, 8)}...</TableCell>
                      <TableCell>
                        <Badge variant={line.direction === "DEBIT" ? "default" : "secondary"} className="text-xs">
                          {line.direction}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatPKR(line.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data.reversal && (
              <>
                <Separator />
                <div>
                  <span className="text-sm font-medium text-yellow-600">Reversal Entry</span>
                  <div className="mt-2 text-sm space-y-1">
                    <p>Reversed at: {format(new Date(data.reversal.createdAt), "dd MMM yyyy HH:mm")}</p>
                    <p>Reversal amount: {formatPKR(data.reversal.amount)}</p>
                  </div>
                </div>
              </>
            )}

            {data.auditHistory && data.auditHistory.length > 0 && (
              <>
                <Separator />
                <div>
                  <span className="text-sm font-medium">Audit History</span>
                  <div className="mt-2 space-y-2">
                    {data.auditHistory.map((entry: any) => (
                      <div key={entry.id} className="text-xs border rounded p-2 bg-muted/50">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">{entry.eventType}</Badge>
                          <span className="text-muted-foreground">{format(new Date(entry.createdAt), "dd MMM yy HH:mm")}</span>
                        </div>
                        {entry.description && <p className="mt-1 text-muted-foreground">{entry.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">Transaction not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
