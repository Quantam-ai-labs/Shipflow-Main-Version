import { useState, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DollarSign,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Download,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CloudDownload,
  ExternalLink,
  Receipt,
  Info,
  Wallet,
  TrendingDown,
  ArrowDownRight,
  Banknote,
  Truck,
  FileText,
  Hash,
  Package,
  Calendar,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CodReconciliation } from "@shared/schema";
import { formatPkDate, formatPkDateTime24 } from "@/lib/dateFormat";
import { useToast } from "@/hooks/use-toast";
import { useDateRange } from "@/contexts/date-range-context";
import { exportCsvWithDate } from "@/lib/exportCsv";
import { differenceInDays } from "date-fns";

type InnerTab = "reconciliation" | "receivable" | "settlements" | "payable";

const INNER_TABS: { id: InnerTab; label: string }[] = [
  { id: "reconciliation", label: "Reconciliation" },
  { id: "receivable",     label: "COD Receivable" },
  { id: "settlements",    label: "Settlements" },
  { id: "payable",        label: "Courier Payable" },
];

// ─── helpers ───────────────────────────────────────────────────────────────

function getStatusBadge(status: string) {
  const map: Record<string, { color: string; icon: React.ElementType }> = {
    pending:  { color: "bg-amber-500/10 text-amber-600 border-amber-500/20",  icon: Clock        },
    received: { color: "bg-green-500/10 text-green-600 border-green-500/20",  icon: CheckCircle2 },
    disputed: { color: "bg-red-500/10 text-red-600 border-red-500/20",        icon: AlertCircle  },
  };
  const cfg = map[status] || map.pending;
  return <Badge className={cfg.color}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

function getCourierPaymentBadge(val: string | null) {
  if (!val) return <span className="text-muted-foreground text-xs">--</span>;
  const l = val.toLowerCase();
  if (l === "settled" || l === "paid")
    return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">{val}</Badge>;
  if (l === "pending" || l === "unpaid")
    return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">{val}</Badge>;
  return <Badge variant="secondary">{val}</Badge>;
}

const fmtPKR = (v: string | number | null | undefined) => {
  if (!v || v === "0" || v === "0.00") return "--";
  return `Rs ${Number(v).toLocaleString()}`;
};

// ─── interfaces ────────────────────────────────────────────────────────────

interface CodReconciliationResponse {
  records: CodReconciliation[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    totalPending: string;
    totalReceived: string;
    totalDisputed: string;
    pendingCount: number;
    receivedCount: number;
  };
}

interface CodReceivableItem {
  id: string;
  orderNumber: string;
  customerName: string;
  courierName: string;
  courierTracking: string;
  codRemaining: string;
  totalAmount: string;
  deliveredAt: string;
}

interface CodReceivableTotals { courier: string; total: string; count: string; }

interface CodReceivableData { items: CodReceivableItem[]; totals: CodReceivableTotals[]; }

interface ChequeRecord {
  settlementKey: string;
  chequeRef: string | null;
  paymentStatus: string;
  paymentMethod: string;
  courierName: string | null;
  slipLink: string | null;
  shipmentCount: number;
  totalCod: string;
  totalDeductions: string;
  totalNet: string;
  settlementDate: string | null;
  earliestDate: string | null;
  latestDate: string | null;
}

interface ChequesResponse {
  cheques: ChequeRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    totalSettlements: number;
    totalCod: string;
    totalNet: string;
    totalDeductions: string;
    settledCount: number;
    pendingCount: number;
  };
}

interface CourierPayableItem {
  id: string;
  courierName: string;
  totalShipments: number;
  totalDue: string;
  shippingCharges: string;
  codAmount: string;
  status: string;
  lastSettlementDate: string | null;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Reconciliation section
// ═══════════════════════════════════════════════════════════════════════════

function ReconciliationSection() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { dateParams } = useDateRange();
  const [page, setPage] = useState(1);
  const pageSize = 100;
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [isReconcileDialogOpen, setIsReconcileDialogOpen] = useState(false);
  const [settlementRef, setSettlementRef] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [codSyncProgress, setCodSyncProgress] = useState<{ processed: number; total: number } | null>(null);

  const queryParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(search && { search }),
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(dateParams.dateFrom && { dateFrom: dateParams.dateFrom }),
    ...(dateParams.dateTo && { dateTo: dateParams.dateTo }),
  });
  const apiUrl = `/api/cod-reconciliation?${queryParams.toString()}`;

  const { data, isLoading } = useQuery<CodReconciliationResponse>({
    queryKey: [apiUrl],
    refetchInterval: 30000,
  });

  const records = data?.records ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);
  const summary = data?.summary;

  const pollCodProgress = async (cancelled: { current: boolean }) => {
    const maxWait = 120000;
    const pollInterval = 1500;
    const start = Date.now();
    while (Date.now() - start < maxWait && !cancelled.current) {
      await new Promise(r => setTimeout(r, pollInterval));
      if (cancelled.current) return null;
      try {
        const res = await fetch("/api/cod-reconciliation/sync-progress", { credentials: "include" });
        if (!res.ok) continue;
        const progress = await res.json();
        if (cancelled.current) return null;
        if (progress.processed !== undefined && progress.total !== undefined)
          setCodSyncProgress({ processed: progress.processed, total: progress.total });
        if (progress.status === "done") { setCodSyncProgress(null); return progress.result; }
        if (progress.status === "error") { setCodSyncProgress(null); throw new Error(progress.error || "COD sync failed"); }
      } catch (e: any) { if (e.message?.includes("COD sync failed")) throw e; }
    }
    setCodSyncProgress(null);
    throw new Error("Sync is taking longer than expected. It will continue in the background.");
  };

  const reconcileMutation = useMutation({
    mutationFn: async (d: { recordIds: string[]; settlementRef: string }) =>
      apiRequest("POST", "/api/cod-reconciliation/reconcile", d),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => (q.queryKey[0] as string)?.startsWith("/api/cod-reconciliation") });
      setSelectedRecords([]); setIsReconcileDialogOpen(false); setSettlementRef("");
      toast({ title: "Records reconciled", description: "Marked as received." });
    },
    onError: () => toast({ title: "Error", description: "Failed to reconcile.", variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/cod-reconciliation/generate", {}),
    onSuccess: async (response: any) => {
      const d = await response.json();
      queryClient.invalidateQueries({ predicate: q => (q.queryKey[0] as string)?.startsWith("/api/cod-reconciliation") });
      toast({ title: "Records generated", description: d.message });
    },
    onError: () => toast({ title: "Error", description: "Failed to generate records.", variant: "destructive" }),
  });

  const syncPaymentsMutation = useMutation({
    mutationFn: async () => {
      const cancelled = { current: false };
      const res = await apiRequest("POST", "/api/cod-reconciliation/sync-payments", {});
      const startResult = await res.json();
      setCodSyncProgress({ processed: 0, total: 0 });
      if (startResult.status === "already_running")
        toast({ title: "Sync already running", description: "Showing current progress..." });
      return pollCodProgress(cancelled);
    },
    onSuccess: (result: any) => {
      setCodSyncProgress(null);
      queryClient.invalidateQueries({ predicate: q => (q.queryKey[0] as string)?.startsWith("/api/cod-reconciliation") });
      queryClient.invalidateQueries({ predicate: q => (q.queryKey[0] as string)?.startsWith("/api/payment-ledger") });
      toast({ title: "Payment sync complete", description: result?.message || "Synced successfully." });
    },
    onError: (err: any) => {
      setCodSyncProgress(null);
      toast({ title: "Sync failed", description: err.message || "Could not sync.", variant: "destructive" });
    },
  });

  const pendingRecords = records.filter(r => r.status === "pending");
  const allPendingSelected = pendingRecords.length > 0 && pendingRecords.every(r => selectedRecords.includes(r.id));

  const handleSelectAll = (checked: boolean) =>
    setSelectedRecords(checked ? pendingRecords.map(r => r.id) : []);
  const handleSelectRecord = (id: string, checked: boolean) =>
    setSelectedRecords(checked ? [...selectedRecords, id] : selectedRecords.filter(i => i !== id));
  const handleReconcile = () => {
    if (selectedRecords.length === 0) return;
    reconcileMutation.mutate({ recordIds: selectedRecords, settlementRef });
  };

  const handleExport = () => {
    if (records.length === 0) {
      toast({ title: "No records", description: "Nothing to export.", variant: "destructive" });
      return;
    }
    const headers = [
      "Tracking #", "Courier", "COD Amount", "Service Fee", "Tax", "Reversal Fee", "Reversal Tax",
      "Courier Fee", "Net Amount", "Recon Status", "Courier Payment", "Payment Method", "Billing Method",
      "Invoice/Cheque #", "Settlement Date", "Message", "Slip", "Upfront", "Reserve", "Balance", "Last Synced",
    ];
    const rows = records.map(r => [
      r.trackingNumber || "",
      r.courierName || "",
      r.codAmount,
      (r as any).transactionFee || "",
      (r as any).transactionTax || "",
      (r as any).reversalFee || "",
      (r as any).reversalTax || "",
      r.courierFee || "",
      r.netAmount || "",
      r.status || "",
      r.courierPaymentStatus || "",
      (r as any).courierPaymentMethod || "",
      (r as any).courierBillingMethod || "",
      r.courierPaymentRef || "",
      r.courierSettlementDate ? formatPkDate(r.courierSettlementDate) : "",
      (r as any).courierMessage || "",
      r.courierSlipLink || "",
      r.upfrontPayment || "",
      r.reservePayment || "",
      r.balancePayment || "",
      (r as any).lastSyncedAt ? formatPkDateTime24((r as any).lastSyncedAt) : "",
    ]);
    exportCsvWithDate("cod-reconciliation", headers, rows);
    toast({ title: "Export complete", description: `Exported ${records.length} records.` });
  };

  return (
    <div className="space-y-6 p-6">
      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Track and reconcile Cash on Delivery payments from couriers.</p>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedRecords.length > 0 && (
            <Button onClick={() => setIsReconcileDialogOpen(true)} data-testid="button-reconcile-selected">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Reconcile ({selectedRecords.length})
            </Button>
          )}
          <div className="flex flex-col items-end gap-1">
            <Button
              variant="outline" size="sm"
              onClick={() => syncPaymentsMutation.mutate()}
              disabled={syncPaymentsMutation.isPending}
              data-testid="button-sync-payments"
            >
              <CloudDownload className={`w-4 h-4 mr-2 ${syncPaymentsMutation.isPending ? "animate-pulse" : ""}`} />
              {syncPaymentsMutation.isPending ? "Syncing..." : "Sync Payments"}
            </Button>
            {syncPaymentsMutation.isPending && codSyncProgress && (
              <div className="w-48 space-y-1">
                <Progress value={codSyncProgress.total > 0 ? (codSyncProgress.processed / codSyncProgress.total) * 100 : undefined} className="h-2" />
                <p className="text-xs text-muted-foreground text-right">
                  {codSyncProgress.total > 0 ? `${codSyncProgress.processed} of ${codSyncProgress.total}` : "Starting..."}
                </p>
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} data-testid="button-generate-cod">
            <RefreshCw className={`w-4 h-4 mr-2 ${generateMutation.isPending ? "animate-spin" : ""}`} />
            {generateMutation.isPending ? "Generating..." : "Sync COD Records"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-cod">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border-amber-500/20">
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Pending Collection</p>
                {isLoading ? <Skeleton className="h-8 w-28 mt-1" /> : (
                  <>
                    <p className="text-2xl font-bold" data-testid="text-pending-amount">PKR {summary?.totalPending ?? "0"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{summary?.pendingCount ?? 0} orders</p>
                  </>
                )}
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/20">
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Received</p>
                {isLoading ? <Skeleton className="h-8 w-28 mt-1" /> : (
                  <>
                    <p className="text-2xl font-bold" data-testid="text-received-amount">PKR {summary?.totalReceived ?? "0"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{summary?.receivedCount ?? 0} orders</p>
                  </>
                )}
              </div>
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/5 to-red-500/10 border-red-500/20">
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Disputed</p>
                {isLoading ? <Skeleton className="h-8 w-28 mt-1" /> : (
                  <p className="text-2xl font-bold" data-testid="text-disputed-amount">PKR {summary?.totalDisputed ?? "0"}</p>
                )}
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by tracking number, order, or courier..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-10"
                data-testid="input-search-cod"
              />
            </div>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]" data-testid="select-cod-status">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {[
                  { value: "all", label: "All Statuses" },
                  { value: "pending", label: "Pending" },
                  { value: "received", label: "Received" },
                  { value: "disputed", label: "Disputed" },
                ].map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            COD Records
            {data?.total !== undefined && <Badge variant="secondary" className="ml-2">{data.total} records</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1,2,3,4,5,6,7,8].map(i => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-4" /><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24 flex-1" /><Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : records.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox checked={allPendingSelected} onCheckedChange={handleSelectAll} disabled={pendingRecords.length === 0} data-testid="checkbox-select-all" />
                      </TableHead>
                      <TableHead>Tracking #</TableHead>
                      <TableHead>Courier</TableHead>
                      <TableHead className="text-right">COD Amount</TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          Service Fee
                          <Tooltip><TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                          <TooltipContent>Courier delivery/service charges per shipment</TooltipContent></Tooltip>
                        </div>
                      </TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          Reversal
                          <Tooltip><TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                          <TooltipContent>Charges for returned/reversed shipments</TooltipContent></Tooltip>
                        </div>
                      </TableHead>
                      <TableHead className="text-right font-semibold">Net Paid</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Courier Payment</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Billing</TableHead>
                      <TableHead>Invoice / Cheque #</TableHead>
                      <TableHead>Settlement Date</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Slip</TableHead>
                      <TableHead>Last Synced</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map(record => {
                      const isExpanded = expandedRow === record.id;
                      const r = record as any;
                      const hasFinancials = r.transactionFee || r.transactionTax || r.upfrontPayment || r.reservePayment || r.balancePayment;
                      const totalDeduction = Number(r.transactionFee || 0) + Number(r.transactionTax || 0) + Number(r.reversalFee || 0) + Number(r.reversalTax || 0);
                      const netPaid = Number(record.codAmount || 0) - totalDeduction;

                      return (
                        <Fragment key={record.id}>
                          <TableRow
                            data-testid={`cod-row-${record.id}`}
                            className={isExpanded ? "border-b-0" : ""}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedRecords.includes(record.id)}
                                onCheckedChange={checked => handleSelectRecord(record.id, !!checked)}
                                disabled={record.status !== "pending"}
                                data-testid={`checkbox-${record.id}`}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-sm">{record.trackingNumber || "-"}</TableCell>
                            <TableCell className="capitalize text-sm">{record.courierName}</TableCell>
                            <TableCell className="text-right font-medium">
                              Rs {Number(record.codAmount).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{fmtPKR(r.transactionFee)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{fmtPKR(r.transactionTax)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {Number(r.reversalFee || 0) + Number(r.reversalTax || 0) > 0
                                ? fmtPKR(String(Number(r.reversalFee || 0) + Number(r.reversalTax || 0)))
                                : "--"}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-emerald-400">
                              {r.hasSyncedData !== undefined
                                ? (r.hasSyncedData ? `Rs ${netPaid.toLocaleString()}` : <span className="text-muted-foreground font-normal">Pending sync</span>)
                                : (record.netAmount ? fmtPKR(record.netAmount) : "--")
                              }
                            </TableCell>
                            <TableCell>{getStatusBadge(record.status || "pending")}</TableCell>
                            <TableCell>{getCourierPaymentBadge(record.courierPaymentStatus)}</TableCell>
                            <TableCell className="text-sm">{r.courierPaymentMethod || <span className="text-muted-foreground">--</span>}</TableCell>
                            <TableCell className="text-sm">{r.courierBillingMethod || <span className="text-muted-foreground">--</span>}</TableCell>
                            <TableCell className="font-mono text-sm">
                              <div className="flex items-center gap-1">
                                <span>{record.courierPaymentRef || r.courierSettlementRef || "--"}</span>
                                {record.courierSlipLink && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <a href={record.courierSlipLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" data-testid={`link-slip-${record.id}`}>
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </TooltipTrigger>
                                    <TooltipContent>View payment slip</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {record.courierSettlementDate ? formatPkDate(record.courierSettlementDate) : "--"}
                            </TableCell>
                            <TableCell className="text-sm max-w-[160px] truncate" title={r.courierMessage || undefined}>
                              {r.courierMessage || <span className="text-muted-foreground">--</span>}
                            </TableCell>
                            <TableCell>
                              {record.courierSlipLink ? (
                                <Button size="icon" variant="ghost" onClick={() => window.open(record.courierSlipLink!, "_blank")} data-testid={`button-slip-${record.id}`}>
                                  <ExternalLink className="w-4 h-4" />
                                </Button>
                              ) : <span className="text-muted-foreground text-xs">--</span>}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                              {r.lastSyncedAt ? formatPkDateTime24(r.lastSyncedAt) : "-"}
                            </TableCell>
                            <TableCell>
                              {hasFinancials && (
                                <Button variant="ghost" size="icon" onClick={() => setExpandedRow(isExpanded ? null : record.id)} data-testid={`button-expand-${record.id}`}>
                                  <Receipt className="w-4 h-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                          {isExpanded && hasFinancials && (
                            <TableRow key={`${record.id}-details`} className="bg-muted/30">
                              <TableCell colSpan={18}>
                                <div className="py-2 px-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 text-sm">
                                  {[
                                    ["Txn Fee",       r.transactionFee],
                                    ["Txn Tax",       r.transactionTax],
                                    ["Reversal Fee",  r.reversalFee],
                                    ["Reversal Tax",  r.reversalTax],
                                    ["Upfront",       record.upfrontPayment],
                                    ["Reserve",       record.reservePayment],
                                    ["Balance",       record.balancePayment],
                                  ].map(([lbl, val]) => (
                                    <div key={lbl as string}>
                                      <span className="text-muted-foreground block text-xs">{lbl}</span>
                                      <span className="font-medium">{fmtPKR(val as string)}</span>
                                    </div>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data?.total ?? 0)} of {data?.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm">Page {page} of {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <DollarSign className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="font-medium mb-1">No COD records found</h3>
              <p className="text-sm text-muted-foreground">
                {search || statusFilter !== "all" ? "Try adjusting your filters" : "COD records will appear here when deliveries are completed"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reconcile dialog */}
      <Dialog open={isReconcileDialogOpen} onOpenChange={setIsReconcileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reconcile COD Payments</DialogTitle>
            <DialogDescription>Mark {selectedRecords.length} record(s) as received. Optionally add a settlement reference.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="settlementRef">Settlement Reference (Optional)</Label>
              <Input id="settlementRef" placeholder="e.g., Bank transfer ref or courier settlement ID" value={settlementRef} onChange={e => setSettlementRef(e.target.value)} data-testid="input-settlement-ref" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReconcileDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleReconcile} disabled={reconcileMutation.isPending} data-testid="button-confirm-reconcile">
              {reconcileMutation.isPending ? "Processing..." : "Confirm Reconciliation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COD Receivable section
// ═══════════════════════════════════════════════════════════════════════════

function ReceivableSection() {
  const { data, isLoading } = useQuery<CodReceivableData>({
    queryKey: ["/api/accounting/courier-finance/cod-receivable"],
  });

  const totalPending = data?.totals?.reduce((s, t) => s + parseFloat(t.total || "0"), 0) || 0;
  const totalCount = data?.totals?.reduce((s, t) => s + parseInt(t.count || "0"), 0) || 0;

  return (
    <div className="space-y-6 p-6">
      <p className="text-sm text-muted-foreground">Delivered orders pending COD collection from couriers.</p>

      {isLoading ? (
        <Skeleton className="h-28 w-full max-w-sm" />
      ) : (
        <Card className="max-w-sm" data-testid="card-total-pending">
          <CardContent className="p-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Total COD Pending</p>
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Banknote className="w-5 h-5 text-amber-500" />
                </div>
              </div>
              <p className="text-2xl font-bold" data-testid="text-total-pending-amount">Rs. {totalPending.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{totalCount} orders pending</p>
            </div>
          </CardContent>
        </Card>
      )}

      {data?.totals && data.totals.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {data.totals.map(t => (
            <Badge key={t.courier} variant="outline" data-testid={`badge-courier-${t.courier}`}>
              {t.courier}: Rs. {parseFloat(t.total).toLocaleString()} ({t.count})
            </Badge>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg">Pending COD Orders</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : data?.items && data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Courier</TableHead>
                    <TableHead>Tracking</TableHead>
                    <TableHead className="text-right">COD Amount</TableHead>
                    <TableHead>Delivery Date</TableHead>
                    <TableHead className="text-right">Days Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map(item => {
                    const daysPending = item.deliveredAt ? differenceInDays(new Date(), new Date(item.deliveredAt)) : 0;
                    return (
                      <TableRow key={item.id} data-testid={`row-order-${item.id}`}>
                        <TableCell className="font-medium">{String(item.orderNumber || "").replace(/^#/, "")}</TableCell>
                        <TableCell>{item.courierName}</TableCell>
                        <TableCell>{item.courierTracking || "-"}</TableCell>
                        <TableCell className="text-right font-medium">Rs. {parseFloat(item.codRemaining || "0").toLocaleString()}</TableCell>
                        <TableCell>{item.deliveredAt ? formatPkDate(item.deliveredAt) : "-"}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={daysPending > 7 ? "destructive" : daysPending > 3 ? "secondary" : "outline"}>{daysPending}d</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No pending COD receivables found</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Settlements section
// ═══════════════════════════════════════════════════════════════════════════

function SettlementsSection() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  if (statusFilter !== "all") qs.set("status", statusFilter);
  if (courierFilter !== "all") qs.set("courier", courierFilter);
  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));

  const { data, isLoading } = useQuery<ChequesResponse>({
    queryKey: [`/api/manage-cheques?${qs.toString()}`],
    refetchInterval: 30000,
  });

  const cheques = data?.cheques || [];
  const total = data?.total || 0;
  const summary = data?.summary;
  const totalPages = Math.ceil(total / pageSize);

  const fmtCurrency = (val: string | number) => {
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "Rs. 0";
    return `Rs. ${num.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const isSettled = (s: string) => { const l = s.toLowerCase(); return l === "paid" || l === "settled"; };

  const getDisplayRef = (c: ChequeRecord) => {
    if (c.chequeRef) return c.chequeRef;
    if (c.settlementDate) return `Settlement ${formatPkDate(c.settlementDate)}`;
    return c.settlementKey;
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Track courier payment settlements — cheques (Leopards) and digital transfers (PostEx).</p>
        <Button
          variant="outline"
          onClick={() => {
            if (cheques.length === 0) { toast({ title: "No data", description: "No settlements to export.", variant: "destructive" }); return; }
            const headers = ["Reference","Courier","Status","Method","Shipments","Total COD","Deductions","Settlement Amount","Settlement Date"];
            const rows = cheques.map(c => [
              getDisplayRef(c), c.courierName || "", c.paymentStatus,
              c.paymentMethod !== "N/A" ? c.paymentMethod : (c.courierName === "PostEx" ? "Digital" : ""),
              String(c.shipmentCount), c.totalCod, c.totalDeductions, c.totalNet, formatPkDate(c.settlementDate),
            ]);
            exportCsvWithDate("settlements", headers, rows);
            toast({ title: "Export complete", description: `Exported ${cheques.length} settlements.` });
          }}
          data-testid="button-export-cheques"
        >
          <Download className="w-4 h-4 mr-2" />Export CSV
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Settlements", value: summary.totalSettlements, icon: Hash, color: "" },
            { label: "Total COD", value: fmtCurrency(summary.totalCod), icon: Banknote, color: "" },
            { label: "Net Received", value: fmtCurrency(summary.totalNet), icon: ArrowDownRight, color: "text-emerald-400" },
            { label: "Settled", value: summary.settledCount, icon: CheckCircle2, color: "text-emerald-400" },
            { label: "Pending", value: summary.pendingCount, icon: Clock, color: "text-amber-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-lg">Settlement Records</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by ref or tracking..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" data-testid="input-search" />
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-32" data-testid="select-status-filter"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Paid">Paid / Settled</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              <Select value={courierFilter} onValueChange={v => { setCourierFilter(v); setPage(1); }}>
                <SelectTrigger className="w-40" data-testid="select-courier-filter"><SelectValue placeholder="Courier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Couriers</SelectItem>
                  <SelectItem value="Leopards">Leopards</SelectItem>
                  <SelectItem value="PostEx">PostEx</SelectItem>
                  <SelectItem value="TCS">TCS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : cheques.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-lg font-medium">No settlements found</p>
              <p className="text-sm">Settlement data will appear once courier payments are synced</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Courier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Shipments</TableHead>
                    <TableHead className="text-right">Total COD</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Settlement Amount</TableHead>
                    <TableHead>Settlement Date</TableHead>
                    <TableHead>Slip</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cheques.map(cheque => (
                    <TableRow key={cheque.settlementKey} data-testid={`row-settlement-${cheque.settlementKey}`}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-sm font-medium">{getDisplayRef(cheque)}</span>
                          {cheque.chequeRef && cheque.settlementDate && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="w-3 h-3" />{formatPkDate(cheque.settlementDate)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{cheque.courierName || "N/A"}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={isSettled(cheque.paymentStatus) ? "default" : "secondary"} className={isSettled(cheque.paymentStatus) ? "bg-green-600 text-white" : ""}>
                          {isSettled(cheque.paymentStatus) ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                          {cheque.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {cheque.paymentMethod !== "N/A" ? cheque.paymentMethod : (cheque.courierName === "PostEx" ? "Digital" : "-")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Package className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="font-medium">{cheque.shipmentCount}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmtCurrency(cheque.totalCod)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmtCurrency(cheque.totalDeductions)}</TableCell>
                      <TableCell className="text-right font-medium text-emerald-400">{fmtCurrency(cheque.totalNet)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatPkDate(cheque.settlementDate)}</TableCell>
                      <TableCell>
                        {cheque.slipLink ? (
                          <Button size="icon" variant="ghost" onClick={() => window.open(cheque.slipLink!, "_blank")} data-testid={`button-slip-${cheque.settlementKey}`}>
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        ) : <span className="text-xs text-muted-foreground">-</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page"><ChevronLeft className="w-4 h-4" /></Button>
                <span className="text-sm px-2">Page {page} of {totalPages}</span>
                <Button size="icon" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page"><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Courier Payable section
// ═══════════════════════════════════════════════════════════════════════════

function PayableSection() {
  const { data, isLoading } = useQuery<CourierPayableItem[]>({
    queryKey: ["/api/accounting/courier-finance/courier-payable"],
  });

  const items = Array.isArray(data) ? data : [];

  const courierSummary = items.reduce<Record<string, { totalDue: number; shipments: number; lastDate: string | null }>>((acc, item) => {
    const name = item.courierName || "Unknown";
    if (!acc[name]) acc[name] = { totalDue: 0, shipments: 0, lastDate: null };
    acc[name].totalDue += parseFloat(item.shippingCharges || item.totalDue || "0");
    acc[name].shipments += 1;
    const date = item.lastSettlementDate || item.createdAt;
    if (date && (!acc[name].lastDate || new Date(date) > new Date(acc[name].lastDate!))) acc[name].lastDate = date;
    return acc;
  }, {});

  const courierEntries = Object.entries(courierSummary);
  const grandTotal = courierEntries.reduce((s, [, v]) => s + v.totalDue, 0);

  return (
    <div className="space-y-6 p-6">
      <p className="text-sm text-muted-foreground">Amounts owed to couriers for shipping services.</p>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courierEntries.map(([courier, summary]) => (
            <Card key={courier} data-testid={`card-courier-${courier}`}>
              <CardContent className="p-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{courier}</p>
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Truck className="w-5 h-5 text-blue-500" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold">Rs. {summary.totalDue.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{summary.shipments} shipments</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {courierEntries.length === 0 && (
            <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">No payables found</p></CardContent></Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Courier Payable Details
            {grandTotal > 0 && <span className="text-sm font-normal text-muted-foreground ml-2">Total: Rs. {grandTotal.toLocaleString()}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : courierEntries.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Courier</TableHead>
                    <TableHead className="text-right">Total Shipments</TableHead>
                    <TableHead className="text-right">Total Due</TableHead>
                    <TableHead>Last Settlement Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courierEntries.map(([courier, summary]) => (
                    <TableRow key={courier} data-testid={`row-courier-${courier}`}>
                      <TableCell className="font-medium">{courier}</TableCell>
                      <TableCell className="text-right">{summary.shipments}</TableCell>
                      <TableCell className="text-right font-medium">Rs. {summary.totalDue.toLocaleString()}</TableCell>
                      <TableCell>{formatPkDate(summary.lastDate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No courier payables found</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main hub
// ═══════════════════════════════════════════════════════════════════════════

export default function CodReconciliationHub() {
  const [activeTab, setActiveTab] = useState<InnerTab>("reconciliation");

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="px-6 pt-6 pb-4 border-b">
        <h1 className="text-2xl font-bold" data-testid="text-cod-hub-title">COD Reconciliation</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage all courier COD payments, settlements, and outstanding balances.</p>

        {/* Inner tab switcher */}
        <div className="flex gap-1 mt-4 bg-muted/50 p-1 rounded-lg w-fit" data-testid="cod-inner-tabs">
          {INNER_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`cod-tab-${tab.id}`}
              className={[
                "px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section content */}
      {activeTab === "reconciliation" && <ReconciliationSection />}
      {activeTab === "receivable"     && <ReceivableSection />}
      {activeTab === "settlements"    && <SettlementsSection />}
      {activeTab === "payable"        && <PayableSection />}
    </div>
  );
}
