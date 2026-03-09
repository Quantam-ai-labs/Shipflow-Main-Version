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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-cod-title">COD Reconciliation</h1>
          <p className="text-sm text-muted-foreground">Track and reconcile Cash on Delivery payments from couriers.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedRecords.length > 0 && (
            <Button onClick={() => setIsReconcileDialogOpen(true)} data-testid="button-reconcile-selected">
              <CheckCircle2 className="w-4 h-4 mr-2" />
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
              <CloudDownload className={`w-4 h-4 mr-2 ${syncPaymentsMutation.isPending ? 'animate-pulse' : ''}`} />
              {syncPaymentsMutation.isPending ? 'Syncing...' : 'Sync Payments'}
            </Button>
            {syncPaymentsMutation.isPending && codSyncProgress && (
              <div className="w-48 space-y-1" data-testid="cod-sync-progress">
                <Progress value={codSyncProgress.total > 0 ? (codSyncProgress.processed / codSyncProgress.total) * 100 : undefined} className="h-2" />
                <p className="text-xs text-muted-foreground text-right">
                  {codSyncProgress.total > 0
                    ? `Syncing ${codSyncProgress.processed} of ${codSyncProgress.total} records...`
                    : "Starting sync..."}
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
            <RefreshCw className={`w-4 h-4 mr-2 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
            {generateMutation.isPending ? 'Generating...' : 'Sync COD Records'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-cod">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Pending Collection</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-28 mt-1" />
                ) : (
                  <>
                    <p className="text-2xl font-bold" data-testid="text-pending-amount">PKR {summary?.totalPending ?? "0"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{summary?.pendingCount ?? 0} orders</p>
                  </>
                )}
              </div>
              <Clock className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Received</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-28 mt-1" />
                ) : (
                  <>
                    <p className="text-2xl font-bold" data-testid="text-received-amount">PKR {summary?.totalReceived ?? "0"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{summary?.receivedCount ?? 0} orders</p>
                  </>
                )}
              </div>
              <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Disputed</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-28 mt-1" />
                ) : (
                  <p className="text-2xl font-bold" data-testid="text-disputed-amount">PKR {summary?.totalDisputed ?? "0"}</p>
                )}
              </div>
              <AlertCircle className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by tracking number, order, or courier..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search-cod"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-cod-status">
                <Filter className="w-4 h-4 mr-2" />
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            COD Records
            {data?.total !== undefined && (
              <Badge variant="secondary" className="ml-2">
                {data.total} records
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24 flex-1" />
                  <Skeleton className="h-6 w-20" />
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
                        <Checkbox
                          checked={allPendingSelected}
                          onCheckedChange={handleSelectAll}
                          disabled={pendingRecords.length === 0}
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead>Tracking #</TableHead>
                      <TableHead>Courier</TableHead>
                      <TableHead className="text-right">COD Amount</TableHead>
                      <TableHead className="text-right">Courier Fee</TableHead>
                      <TableHead className="text-right">Net Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Courier Payment</TableHead>
                      <TableHead>Payment Ref</TableHead>
                      <TableHead>Last Synced</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
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
                            <TableCell>
                              <Checkbox
                                checked={selectedRecords.includes(record.id)}
                                onCheckedChange={(checked) => handleSelectRecord(record.id, !!checked)}
                                disabled={record.status !== "pending"}
                                data-testid={`checkbox-${record.id}`}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {record.trackingNumber || "-"}
                            </TableCell>
                            <TableCell className="capitalize">{record.courierName}</TableCell>
                            <TableCell className="text-right font-medium">
                              PKR {Number(record.codAmount).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatPKR(record.courierFee)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatPKR(record.netAmount)}
                            </TableCell>
                            <TableCell>{getStatusBadge(record.status || "pending")}</TableCell>
                            <TableCell>
                              {getCourierPaymentBadge(record.courierPaymentStatus)}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              <div className="flex items-center gap-1">
                                <span>{record.courierPaymentRef || record.courierSettlementRef || "-"}</span>
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
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </a>
                                    </TooltipTrigger>
                                    <TooltipContent>View payment slip</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {record.lastSyncedAt
                                ? formatPkDateTime24(record.lastSyncedAt)
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {hasFinancials && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setExpandedRow(isExpanded ? null : record.id)}
                                  data-testid={`button-expand-${record.id}`}
                                >
                                  <Receipt className="w-4 h-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                          {isExpanded && hasFinancials && (
                            <TableRow key={`${record.id}-details`} className="bg-muted/30">
                              <TableCell colSpan={11}>
                                <div className="py-2 px-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 text-sm">
                                  <div>
                                    <span className="text-muted-foreground block text-xs">Txn Fee</span>
                                    <span className="font-medium">{formatPKR(record.transactionFee)}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block text-xs">Txn Tax</span>
                                    <span className="font-medium">{formatPKR(record.transactionTax)}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block text-xs">Reversal Fee</span>
                                    <span className="font-medium">{formatPKR(record.reversalFee)}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block text-xs">Reversal Tax</span>
                                    <span className="font-medium">{formatPKR(record.reversalTax)}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block text-xs">Upfront Payment</span>
                                    <span className="font-medium">{formatPKR(record.upfrontPayment)}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block text-xs">Reserve Payment</span>
                                    <span className="font-medium">{formatPKR(record.reservePayment)}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block text-xs">Balance Payment</span>
                                    <span className="font-medium">{formatPKR(record.balancePayment)}</span>
                                  </div>
                                  {record.courierSettlementDate && (
                                    <div>
                                      <span className="text-muted-foreground block text-xs">Settlement Date</span>
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
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data?.total ?? 0)} of {data?.total} records
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= totalPages}
                    >
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
                {search || statusFilter !== "all"
                  ? "Try adjusting your filters"
                  : "COD records will appear here when deliveries are completed"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isReconcileDialogOpen} onOpenChange={setIsReconcileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reconcile COD Payments</DialogTitle>
            <DialogDescription>
              Mark {selectedRecords.length} record(s) as received. Optionally add a settlement reference.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="settlementRef">Settlement Reference (Optional)</Label>
              <Input
                id="settlementRef"
                placeholder="e.g., Bank transfer ref or courier settlement ID"
                value={settlementRef}
                onChange={(e) => setSettlementRef(e.target.value)}
                data-testid="input-settlement-ref"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReconcileDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReconcile} disabled={reconcileMutation.isPending} data-testid="button-confirm-reconcile">
              {reconcileMutation.isPending ? "Processing..." : "Confirm Reconciliation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
