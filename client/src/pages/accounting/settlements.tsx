import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { formatPkDate } from "@/lib/dateFormat";
import { Plus } from "lucide-react";

interface Settlement {
  id: string;
  courierPartyId: string;
  courierName: string;
  type: string;
  amount: string;
  cashAccountId: string;
  statementRef: string | null;
  date: string;
  notes: string | null;
  createdAt: string;
}

interface Party {
  id: string;
  name: string;
  type: string;
}

interface CashAccount {
  id: string;
  name: string;
  type: string;
  balance: string;
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function getStatusVariant(type: string): "default" | "secondary" | "destructive" | "outline" {
  switch (type) {
    case "cod_received":
      return "default";
    case "charges_paid":
      return "destructive";
    default:
      return "secondary";
  }
}

function formatType(type: string): string {
  switch (type) {
    case "cod_received":
      return "COD Received";
    case "charges_paid":
      return "Charges Paid";
    case "net_settlement":
      return "Net Settlement";
    default:
      return type;
  }
}

export default function AccountingSettlements() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [courierPartyId, setCourierPartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: settlements, isLoading } = useQuery<Settlement[]>({
    queryKey: ["/api/accounting/courier-settlements"],
  });

  const { data: courierParties } = useQuery<Party[]>({
    queryKey: ["/api/accounting/parties?type=courier"],
  });

  const { data: cashAccounts } = useQuery<CashAccount[]>({
    queryKey: ["/api/accounting/cash-accounts"],
  });

  const mutation = useMutation({
    mutationFn: async (payload: {
      amount: number;
      cashAccountId: string;
      courierPartyId: string;
      referenceNumber: string;
      description: string;
      date: string;
    }) => {
      const res = await apiRequest("POST", "/api/accounting/money-out/courier-settlement", {
        ...payload,
        type: "cod_received",
        statementRef: payload.referenceNumber,
        notes: payload.description,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Settlement recorded successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/courier-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/cash-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/reports/overview"] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to record settlement", description: error.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setCourierPartyId("");
    setAmount("");
    setCashAccountId("");
    setReferenceNumber("");
    setDescription("");
    setDate(format(new Date(), "yyyy-MM-dd"));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!courierPartyId || !amount || !cashAccountId) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }
    mutation.mutate({
      amount: parseFloat(amount),
      cashAccountId,
      courierPartyId,
      referenceNumber,
      description,
      date,
    });
  }

  const items = Array.isArray(settlements) ? settlements : [];

  return (
    <div className="space-y-6" data-testid="settlements-page">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Courier Settlements
          </h1>
          <p className="text-muted-foreground mt-2">
            Reconcile COD and shipping charges with couriers
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-record-settlement">
              <Plus className="w-4 h-4 mr-2" />
              Record Settlement
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-record-settlement">
            <DialogHeader>
              <DialogTitle>Record Settlement</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="courierParty">Courier Party</Label>
                <Select value={courierPartyId} onValueChange={setCourierPartyId}>
                  <SelectTrigger data-testid="select-courier-party">
                    <SelectValue placeholder="Select courier party" />
                  </SelectTrigger>
                  <SelectContent>
                    {(courierParties || []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-amount"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cashAccount">Cash Account</Label>
                <Select value={cashAccountId} onValueChange={setCashAccountId}>
                  <SelectTrigger data-testid="select-cash-account">
                    <SelectValue placeholder="Select cash account" />
                  </SelectTrigger>
                  <SelectContent>
                    {(cashAccounts || []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} (Rs. {parseFloat(a.balance).toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="referenceNumber">Reference Number</Label>
                <Input
                  id="referenceNumber"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Statement/reference number"
                  data-testid="input-reference"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Settlement description"
                  data-testid="input-description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  data-testid="input-date"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={mutation.isPending}
                data-testid="button-submit-settlement"
              >
                {mutation.isPending ? "Recording..." : "Record Settlement"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card data-testid="card-settlements-table">
        <CardHeader>
          <CardTitle className="text-lg">Settlement History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton />
          ) : items.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Courier</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((s) => (
                    <TableRow key={s.id} data-testid={`row-settlement-${s.id}`}>
                      <TableCell data-testid={`text-date-${s.id}`}>
                        {formatPkDate(s.date)}
                      </TableCell>
                      <TableCell className="font-medium" data-testid={`text-courier-${s.id}`}>
                        {s.courierName || "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium" data-testid={`text-amount-${s.id}`}>
                        Rs. {parseFloat(s.amount || "0").toLocaleString()}
                      </TableCell>
                      <TableCell data-testid={`text-reference-${s.id}`}>
                        {s.statementRef || "-"}
                      </TableCell>
                      <TableCell data-testid={`badge-status-${s.id}`}>
                        <Badge variant={getStatusVariant(s.type)}>
                          {formatType(s.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" data-testid={`text-notes-${s.id}`}>
                        {s.notes || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground" data-testid="text-no-data">
              No settlements recorded yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
