import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CodReconciliation } from "@shared/schema";
import { formatPkDate, formatPkDateTime24 } from "@/lib/dateFormat";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { useDateRange } from "@/contexts/date-range-context";

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "received", label: "Received" },
  { value: "disputed", label: "Disputed" },
];

function getStatusBadge(status: string) {
  const statusConfig: Record<string, { color: string; icon: React.ElementType }> = {
    pending: { color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
    received: { color: "bg-green-500/10 text-green-600 border-green-500/20", icon: CheckCircle2 },
    disputed: { color: "bg-red-500/10 text-red-600 border-red-500/20", icon: AlertCircle },
  };

  const config = statusConfig[status] || statusConfig.pending;
  const displayStatus = status.charAt(0).toUpperCase() + status.slice(1);

  return <Badge className={config.color}>{displayStatus}</Badge>;
}

function getCourierPaymentBadge(courierPaymentStatus: string | null) {
  if (!courierPaymentStatus) return <span className="text-muted-foreground text-xs">--</span>;

  const lower = courierPaymentStatus.toLowerCase();
  if (lower === "settled" || lower === "paid") {
    return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">{courierPaymentStatus}</Badge>;
  }
  if (lower === "pending" || lower === "unpaid") {
    return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">{courierPaymentStatus}</Badge>;
  }
  return <Badge variant="secondary">{courierPaymentStatus}</Badge>;
}

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

export default function CodReconciliationPage() {
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

  const queryParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(search && { search }),
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(dateParams.dateFrom && { dateFrom: dateParams.dateFrom }),
    ...(dateParams.dateTo && { dateTo: dateParams.dateTo }),
  });

  const queryString = queryParams.toString();
  const apiUrl = `/api/cod-reconciliation?${queryString}`;

  const { data, isLoading } = useQuery<CodReconciliationResponse>({
    queryKey: [apiUrl],
    refetchInterval: 30000,
  });

  const records = data?.records ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);
  const summary = data?.summary;

  const reconcileMutation = useMutation({
    mutationFn: async (data: { recordIds: string[]; settlementRef: string }) => {
      return apiRequest("POST", "/api/cod-reconciliation/reconcile", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => (query.queryKey[0] as string)?.startsWith("/api/cod-reconciliation") });
      setSelectedRecords([]);
      setIsReconcileDialogOpen(false);
      setSettlementRef("");
      toast({
        title: "Records reconciled",
        description: "The selected records have been marked as received.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reconcile records. Please try again.",
        variant: "destructive",
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/cod-reconciliation/generate", {});
    },
    onSuccess: async (response: any) => {
      const data = await response.json();
      queryClient.invalidateQueries({ predicate: (query) => (query.queryKey[0] as string)?.startsWith("/api/cod-reconciliation") });
      toast({
        title: "Records generated",
        description: data.message,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate records. Please try again.",
        variant: "destructive",
      });
    },
  });

  const [codSyncProgress, setCodSyncProgress] = useState<{ processed: number; total: number } | null>(null);

  const pollCodProgress = async (cancelled: { current: boolean }) => {
    const maxWait = 120000;
    const pollInterval = 1500;
    const start = Date.now();
    while (Date.now() - start < maxWait && !cancelled.current) {
      await new Promise(r => setTimeout(r, pollInterval));
      if (cancelled.current) return null;
      try {
        const progressRes = await fetch("/api/cod-reconciliation/sync-progress", { credentials: "include" });
        if (!progressRes.ok) continue;
        const progress = await progressRes.json();
        if (cancelled.current) return null;
        if (progress.processed !== undefined && progress.total !== undefined) {
          setCodSyncProgress({ processed: progress.processed, total: progress.total });
        }
        if (progress.status === "done") {
          setCodSyncProgress(null);
          return progress.result;
        }
        if (progress.status === "error") {
          setCodSyncProgress(null);
          throw new Error(progress.error || "COD sync failed");
        }
      } catch (e: any) {
        if (e.message?.includes("COD sync failed")) throw e;
      }
    }
    setCodSyncProgress(null);
    throw new Error("Sync is taking longer than expected. It will continue in the background.");
  };

  const syncPaymentsMutation = useMutation({
    mutationFn: async () => {
      const cancelled = { current: false };
      const res = await apiRequest("POST", "/api/cod-reconciliation/sync-payments", {});
      const startResult = await res.json();

      setCodSyncProgress({ processed: 0, total: 0 });

      if (startResult.status === 'already_running') {
        toast({ title: "Sync already running", description: "Showing current progress..." });
      }

      return pollCodProgress(cancelled);
    },
    onSuccess: (result: any) => {
      setCodSyncProgress(null);
      queryClient.invalidateQueries({ predicate: (query) => (query.queryKey[0] as string)?.startsWith("/api/cod-reconciliation") });
      toast({
        title: "Payment sync complete",
        description: result?.message || "COD payment data synced successfully.",
      });
    },
    onError: (err: any) => {
      setCodSyncProgress(null);
      toast({
        title: "Error",
        description: err.message || "Failed to sync payment data from couriers.",
        variant: "destructive",
      });
    },
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRecords(records.filter((r) => r.status === "pending").map((r) => r.id));
    } else {
      setSelectedRecords([]);
    }
  };

  const handleSelectRecord = (recordId: string, checked: boolean) => {
    if (checked) {
      setSelectedRecords([...selectedRecords, recordId]);
    } else {
      setSelectedRecords(selectedRecords.filter((id) => id !== recordId));
    }
  };

  const handleReconcile = () => {
    if (selectedRecords.length === 0) return;
    reconcileMutation.mutate({ recordIds: selectedRecords, settlementRef });
  };

  const pendingRecords = records.filter((r) => r.status === "pending");
  const allPendingSelected = pendingRecords.length > 0 && pendingRecords.every((r) => selectedRecords.includes(r.id));

  const handleExport = () => {
    if (records.length === 0) {
      toast({
        title: "No records to export",
        description: "There are no COD records matching your current filters.",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      "Tracking #", "Courier", "COD Amount", "Courier Fee", "Net Amount",
      "Status", "Courier Payment", "Payment Ref", "Settlement Date",
      "Txn Fee", "Txn Tax", "Upfront", "Reserve", "Balance",
    ];
    const csvContent = [
      headers.join(","),
      ...records.map((record) =>
        [
          record.trackingNumber || "",
          record.courierName || "",
          record.codAmount,
          record.courierFee || "",
          record.netAmount || "",
          record.status || "",
          record.courierPaymentStatus || "",
          record.courierPaymentRef || "",
          record.courierSettlementDate ? formatPkDate(record.courierSettlementDate) : "",
          record.transactionFee || "",
          record.transactionTax || "",
          record.upfrontPayment || "",
          record.reservePayment || "",
          record.balancePayment || "",
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cod-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export complete",
      description: `Exported ${records.length} COD records to CSV.`,
    });
  };

  const formatPKR = (value: string | number | null | undefined) => {
    if (!value || value === "0") return "--";
    return `PKR ${Number(value).toLocaleString()}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold" data-testid="text-cod-title">COD Reconciliation</h1>
          <p className="text-xs text-muted-foreground">Track and reconcile Cash on Delivery payments from couriers.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedRecords.length > 0 && (
            <Button size="sm" onClick={() => setIsReconcileDialogOpen(true)} data-testid="button-reconcile-selected">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              Reconcile ({selectedRecords.length})
            </Button>
          )}
          <div className="flex flex-col items-end gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncPaymentsMutation.mutate()}
              disabled={syncPaymentsMutation.isPending}
              data-testid="button-sync-payments"
            >
              <CloudDownload className={`w-3.5 h-3.5 mr-1.5 ${syncPaymentsMutation.isPending ? 'animate-pulse' : ''}`} />
              {syncPaymentsMutation.isPending ? 'Syncing...' : 'Sync Payments'}
            </Button>
            {syncPaymentsMutation.isPending && codSyncProgress && (
              <div className="w-40 space-y-0.5" data-testid="cod-sync-progress">
                <Progress value={codSyncProgress.total > 0 ? (codSyncProgress.processed / codSyncProgress.total) * 100 : undefined} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground text-right">
                  {codSyncProgress.total > 0
                    ? `${codSyncProgress.processed}/${codSyncProgress.total}`
                    : "Starting..."}
                </p>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid="button-generate-cod"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
            {generateMutation.isPending ? 'Generating...' : 'Sync COD'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-cod">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-6 py-2 border-b" data-testid="metrics-strip">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pending</p>
          {isLoading ? (
            <Skeleton className="h-5 w-20 mt-0.5" />
          ) : (
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold" data-testid="text-pending-amount">PKR {summary?.totalPending ?? "0"}</span>
              <span className="text-[10px] text-muted-foreground">{summary?.pendingCount ?? 0}</span>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Received</p>
          {isLoading ? (
            <Skeleton className="h-5 w-20 mt-0.5" />
          ) : (
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold" data-testid="text-received-amount">PKR {summary?.totalReceived ?? "0"}</span>
              <span className="text-[10px] text-muted-foreground">{summary?.receivedCount ?? 0}</span>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Disputed</p>
          {isLoading ? (
            <Skeleton className="h-5 w-20 mt-0.5" />
          ) : (
            <span className="text-sm font-semibold" data-testid="text-disputed-amount">PKR {summary?.totalDisputed ?? "0"}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tracking, order, courier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
            data-testid="input-search-cod"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-cod-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">COD Records</span>
            {data?.total !== undefined && (
              <span className="text-[10px] text-muted-foreground">{data.total} records</span>
            )}
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-2 py-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : records.length > 0 ? (
          <>
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[36px] py-1.5">
                      <Checkbox
                        checked={allPendingSelected}
                        onCheckedChange={handleSelectAll}
                        disabled={pendingRecords.length === 0}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5">Tracking #</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5">Courier</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5 text-right">COD</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5 text-right">Fee</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5 text-right">Net</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5">Status</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5">Payment</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5">Ref</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5">Synced</TableHead>
                    <TableHead className="w-[36px] py-1.5"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => {
                    const isExpanded = expandedRow === record.id;
                    const hasFinancials = record.transactionFee || record.transactionTax ||
                      record.upfrontPayment || record.reservePayment || record.balancePayment;

                    return (
                      <>
                        <TableRow
                          key={record.id}
                          data-testid={`cod-row-${record.id}`}
                          className={isExpanded ? "border-b-0" : ""}
                        >
                          <TableCell className="py-1">
                            <Checkbox
                              checked={selectedRecords.includes(record.id)}
                              onCheckedChange={(checked) => handleSelectRecord(record.id, !!checked)}
                              disabled={record.status !== "pending"}
                              data-testid={`checkbox-${record.id}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs py-1">
                            {record.trackingNumber || "-"}
                          </TableCell>
                          <TableCell className="capitalize text-xs py-1">{record.courierName}</TableCell>
                          <TableCell className="text-right text-xs font-medium py-1">
                            {Number(record.codAmount).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground py-1">
                            {formatPKR(record.courierFee)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium py-1">
                            {formatPKR(record.netAmount)}
                          </TableCell>
                          <TableCell className="py-1">{getStatusBadge(record.status || "pending")}</TableCell>
                          <TableCell className="py-1">
                            {getCourierPaymentBadge(record.courierPaymentStatus)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs py-1">
                            <div className="flex items-center gap-1">
                              <span className="truncate max-w-[100px]">{record.courierPaymentRef || record.courierSettlementRef || "-"}</span>
                              {record.courierSlipLink && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <a
                                      href={record.courierSlipLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-muted-foreground hover-elevate"
                                      data-testid={`link-slip-${record.id}`}
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </TooltipTrigger>
                                  <TooltipContent>View payment slip</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-[10px] py-1 whitespace-nowrap">
                            {record.lastSyncedAt
                              ? formatPkDateTime24(record.lastSyncedAt)
                              : "-"}
                          </TableCell>
                          <TableCell className="py-1">
                            {hasFinancials && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setExpandedRow(isExpanded ? null : record.id)}
                                data-testid={`button-expand-${record.id}`}
                              >
                                <Receipt className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                        {isExpanded && hasFinancials && (
                          <TableRow key={`${record.id}-details`} className="bg-muted/30">
                            <TableCell colSpan={11} className="py-1.5">
                              <div className="px-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
                                <div>
                                  <span className="text-muted-foreground block text-[10px]">Txn Fee</span>
                                  <span className="font-medium">{formatPKR(record.transactionFee)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[10px]">Txn Tax</span>
                                  <span className="font-medium">{formatPKR(record.transactionTax)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[10px]">Reversal Fee</span>
                                  <span className="font-medium">{formatPKR(record.reversalFee)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[10px]">Reversal Tax</span>
                                  <span className="font-medium">{formatPKR(record.reversalTax)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[10px]">Upfront</span>
                                  <span className="font-medium">{formatPKR(record.upfrontPayment)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[10px]">Reserve</span>
                                  <span className="font-medium">{formatPKR(record.reservePayment)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[10px]">Balance</span>
                                  <span className="font-medium">{formatPKR(record.balancePayment)}</span>
                                </div>
                                {record.courierSettlementDate && (
                                  <div>
                                    <span className="text-muted-foreground block text-[10px]">Settlement</span>
                                    <span className="font-medium">
                                      {formatPkDate(record.courierSettlementDate)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between py-2">
                <p className="text-xs text-muted-foreground">
                  {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data?.total ?? 0)} of {data?.total}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {page}/{totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-10">
            <DollarSign className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
            <h3 className="text-sm font-medium mb-0.5">No COD records found</h3>
            <p className="text-xs text-muted-foreground">
              {search || statusFilter !== "all"
                ? "Try adjusting your filters"
                : "COD records will appear here when deliveries are completed"}
            </p>
          </div>
        )}
      </div>

      <Dialog open={isReconcileDialogOpen} onOpenChange={setIsReconcileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reconcile COD Payments</DialogTitle>
            <DialogDescription>
              Mark {selectedRecords.length} record(s) as received. Optionally add a settlement reference.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="settlementRef" className="text-xs">Settlement Reference (Optional)</Label>
              <Input
                id="settlementRef"
                placeholder="e.g., Bank transfer ref or courier settlement ID"
                value={settlementRef}
                onChange={(e) => setSettlementRef(e.target.value)}
                className="h-8 text-xs"
                data-testid="input-settlement-ref"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsReconcileDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleReconcile} disabled={reconcileMutation.isPending} data-testid="button-confirm-reconcile">
              {reconcileMutation.isPending ? "Processing..." : "Confirm Reconciliation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
