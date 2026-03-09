import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Receipt,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  ExternalLink,
  Info,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatPkDate, formatPkDateTime24 } from "@/lib/dateFormat";
import { useToast } from "@/hooks/use-toast";
import { useDateRange } from "@/contexts/date-range-context";
import { exportCsvWithDate } from "@/lib/exportCsv";

interface LedgerRecord {
  id: string;
  trackingNumber: string | null;
  courierName: string | null;
  codAmount: string;
  courierFee: string | null;
  netAmount: string | null;
  status: string | null;
  courierPaymentStatus: string | null;
  courierPaymentRef: string | null;
  courierPaymentMethod: string | null;
  courierSettlementDate: string | null;
  courierSlipLink: string | null;
  courierBillingMethod: string | null;
  courierMessage: string | null;
  transactionFee: string | null;
  transactionTax: string | null;
  reversalFee: string | null;
  reversalTax: string | null;
  upfrontPayment: string | null;
  reservePayment: string | null;
  balancePayment: string | null;
  lastSyncedAt: string | null;
  createdAt: string | null;
  totalDeduction: string;
  calculatedNetPaid: string;
  hasSyncedData: boolean;
}

interface LedgerResponse {
  records: LedgerRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    totalCod: string;
    totalDeductions: string;
    totalNetPaid: string;
    totalTxnFee: string;
    totalTxnTax: string;
    totalReversalFee: string;
    recordCount: number;
    syncedCount: number;
    unsyncedCount: number;
  };
}

export default function PaymentLedgerPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [courierFilter, setCourierFilter] = useState("all");
  const { dateParams } = useDateRange();
  const [page, setPage] = useState(1);
  const pageSize = 100;

  const queryParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(search && { search }),
    ...(courierFilter !== "all" && { courier: courierFilter }),
    ...(dateParams.dateFrom && { dateFrom: dateParams.dateFrom }),
    ...(dateParams.dateTo && { dateTo: dateParams.dateTo }),
  });
  const apiUrl = `/api/payment-ledger?${queryParams.toString()}`;

  const { data, isLoading } = useQuery<LedgerResponse>({
    queryKey: [apiUrl],
    refetchInterval: 30000,
  });

  const records = data?.records ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);
  const summary = data?.summary;

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
      queryClient.invalidateQueries({ predicate: (query) => (query.queryKey[0] as string)?.startsWith("/api/payment-ledger") });
      queryClient.invalidateQueries({ predicate: (query) => (query.queryKey[0] as string)?.startsWith("/api/cod-reconciliation") });
      toast({
        title: "Payment ledger synced",
        description: result?.message || "COD payment data synced successfully.",
      });
    },
    onError: (err: any) => {
      setCodSyncProgress(null);
      toast({
        title: "Sync failed",
        description: err.message || "Could not fetch payment data from couriers. Please try again.",
        variant: "destructive",
      });
    },
  });

  const formatPKR = (value: string | number | null | undefined) => {
    if (!value || value === "0" || value === "0.00") return "--";
    return `Rs ${Number(value).toLocaleString()}`;
  };

  const handleExport = () => {
    if (records.length === 0) {
      toast({ title: "No records", description: "Nothing to export.", variant: "destructive" });
      return;
    }

    const headers = [
      "Tracking #", "Courier", "COD Amount", "Service Fee", "Service Tax",
      "Reversal Fee", "Reversal Tax", "Total Deductions", "Net Paid",
      "Payment Status", "Payment Method", "Billing Method",
      "Invoice/Cheque #", "Settlement Date", "Message", "Slip Link",
      "Upfront Payment", "Reserve Payment", "Balance Payment", "Last Synced",
    ];
    const rows = records.map(r => [
      r.trackingNumber || "",
      r.courierName || "",
      r.codAmount,
      r.transactionFee || "",
      r.transactionTax || "",
      r.reversalFee || "",
      r.reversalTax || "",
      r.totalDeduction,
      r.calculatedNetPaid,
      r.courierPaymentStatus || "",
      r.courierPaymentMethod || "",
      r.courierBillingMethod || "",
      r.courierPaymentRef || "",
      r.courierSettlementDate ? formatPkDate(r.courierSettlementDate) : "",
      r.courierMessage || "",
      r.courierSlipLink || "",
      r.upfrontPayment || "",
      r.reservePayment || "",
      r.balancePayment || "",
      r.lastSyncedAt ? formatPkDateTime24(r.lastSyncedAt) : "",
    ]);
    exportCsvWithDate("payment-ledger", headers, rows);
    toast({ title: "Export complete", description: `Exported ${records.length} records.` });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold" data-testid="text-ledger-title">Payment Ledger</h1>
          <p className="text-xs text-muted-foreground">Per-shipment financial breakdown: COD collected vs courier charges vs amount paid.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncPaymentsMutation.mutate()}
              disabled={syncPaymentsMutation.isPending}
              data-testid="button-import-ledger"
            >
              <CloudDownload className={`w-3.5 h-3.5 mr-1.5 ${syncPaymentsMutation.isPending ? 'animate-pulse' : ''}`} />
              {syncPaymentsMutation.isPending ? 'Importing...' : 'Import Ledger'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-payment-ledger">
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>
          {syncPaymentsMutation.isPending && codSyncProgress && (
            <div className="w-40 space-y-0.5" data-testid="cod-sync-progress-ledger">
              <Progress value={codSyncProgress.total > 0 ? (codSyncProgress.processed / codSyncProgress.total) * 100 : undefined} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground text-right">
                {codSyncProgress.total > 0
                  ? `${codSyncProgress.processed}/${codSyncProgress.total}`
                  : "Starting..."}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6 py-2 border-b" data-testid="metrics-strip">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total COD</p>
          {isLoading ? (
            <Skeleton className="h-5 w-20 mt-0.5" />
          ) : (
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold" data-testid="text-total-cod">Rs {summary?.totalCod ?? "0"}</span>
              <span className="text-[10px] text-muted-foreground">{summary?.recordCount ?? 0} shipments</span>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Deductions</p>
          {isLoading ? (
            <Skeleton className="h-5 w-20 mt-0.5" />
          ) : (
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold" data-testid="text-total-deductions">Rs {summary?.totalDeductions ?? "0"}</span>
              <span className="text-[10px] text-muted-foreground">Fee: {summary?.totalTxnFee ?? "0"} | Tax: {summary?.totalTxnTax ?? "0"}</span>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Net Paid</p>
          {isLoading ? (
            <Skeleton className="h-5 w-20 mt-0.5" />
          ) : (
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold" data-testid="text-total-net">Rs {summary?.totalNetPaid ?? "0"}</span>
              <span className="text-[10px] text-muted-foreground">
                {summary?.syncedCount ?? 0} synced
                {(summary?.unsyncedCount ?? 0) > 0 && ` · ${summary?.unsyncedCount} pending`}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tracking or courier..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 h-8 text-xs"
            data-testid="input-search-ledger"
          />
        </div>
        <Select value={courierFilter} onValueChange={(v) => { setCourierFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="select-courier-filter">
            <SelectValue placeholder="Courier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Couriers</SelectItem>
            <SelectItem value="Leopards Courier">Leopards</SelectItem>
            <SelectItem value="PostEx">PostEx</SelectItem>
            <SelectItem value="TCS">TCS</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-muted-foreground">Shipment Financial Breakdown</span>
          {data?.total !== undefined && (
            <span className="text-[10px] text-muted-foreground">{data.total} records</span>
          )}
        </div>
        {isLoading ? (
          <div className="space-y-2 py-2">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : records.length > 0 ? (
          <>
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5">Tracking #</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5">Courier</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5 text-right">COD</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        Fee
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="w-2.5 h-2.5 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>Courier delivery/service charges</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5 text-right">Tax</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        Rev.
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="w-2.5 h-2.5 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>Charges for returned/reversed shipments</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5 text-right font-semibold">Deducted</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5 text-right font-semibold">Net Paid</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5">Status</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5">Method</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5">Billing</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5">Inv/Chq #</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5">Settled</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5">Msg</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5">Slip</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        Up
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="w-2.5 h-2.5 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>PostEx upfront payment</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        Res
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="w-2.5 h-2.5 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>PostEx reserve payment</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider py-1.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        Bal
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="w-2.5 h-2.5 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>PostEx final balance payment</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map(record => {
                    const hasFees = Number(record.totalDeduction) > 0;
                    const isSettled = record.courierPaymentStatus?.toLowerCase() === 'settled' ||
                      record.courierPaymentStatus?.toLowerCase() === 'paid';

                    return (
                      <TableRow key={record.id} data-testid={`ledger-row-${record.id}`}>
                        <TableCell className="font-mono text-xs py-1">{record.trackingNumber || "-"}</TableCell>
                        <TableCell className="capitalize text-xs py-1">{record.courierName || "-"}</TableCell>
                        <TableCell className="text-right text-xs font-medium py-1">
                          {Number(record.codAmount).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground py-1">
                          {formatPKR(record.transactionFee)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground py-1">
                          {formatPKR(record.transactionTax)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground py-1">
                          {Number(record.reversalFee || 0) + Number(record.reversalTax || 0) > 0
                            ? formatPKR(String(Number(record.reversalFee || 0) + Number(record.reversalTax || 0)))
                            : "--"
                          }
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium text-red-500 py-1">
                          {hasFees ? `-${Number(record.totalDeduction).toLocaleString()}` : "--"}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold text-green-600 dark:text-green-400 py-1">
                          {record.hasSyncedData
                            ? Number(record.calculatedNetPaid).toLocaleString()
                            : <span className="text-muted-foreground font-normal text-[10px]">Pending</span>
                          }
                        </TableCell>
                        <TableCell className="py-1">
                          {record.courierPaymentStatus ? (
                            <Badge className={
                              isSettled
                                ? "bg-green-500/10 text-green-600 border-green-500/20"
                                : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                            }>
                              {record.courierPaymentStatus}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs py-1" data-testid={`text-payment-method-${record.id}`}>
                          {record.courierPaymentMethod || <span className="text-muted-foreground">--</span>}
                        </TableCell>
                        <TableCell className="text-xs py-1" data-testid={`text-billing-method-${record.id}`}>
                          {record.courierBillingMethod || <span className="text-muted-foreground">--</span>}
                        </TableCell>
                        <TableCell className="text-xs font-mono py-1" data-testid={`text-invoice-cheque-${record.id}`}>
                          {record.courierPaymentRef || <span className="text-muted-foreground">--</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-1" data-testid={`text-settlement-date-${record.id}`}>
                          {record.courierSettlementDate
                            ? formatPkDate(record.courierSettlementDate)
                            : "--"
                          }
                        </TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate py-1" title={record.courierMessage || undefined} data-testid={`text-message-${record.id}`}>
                          {record.courierMessage || <span className="text-muted-foreground">--</span>}
                        </TableCell>
                        <TableCell className="py-1">
                          {record.courierSlipLink ? (
                            <a
                              href={record.courierSlipLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              data-testid={`link-slip-${record.id}`}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground py-1">
                          {formatPKR(record.upfrontPayment)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground py-1">
                          {formatPKR(record.reservePayment)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground py-1">
                          {formatPKR(record.balancePayment)}
                        </TableCell>
                      </TableRow>
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
                  <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page === 1} data-testid="button-prev-page">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground" data-testid="text-page-info">{page}/{totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages} data-testid="button-next-page">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-10">
            <Receipt className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
            <h3 className="text-sm font-medium mb-0.5">No payment ledger records found</h3>
            <p className="text-xs text-muted-foreground mb-3">
              {search || courierFilter !== "all"
                ? "Try adjusting your filters"
                : "Click \"Import Ledger\" to fetch payment data from your couriers"
              }
            </p>
            {!search && courierFilter === "all" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncPaymentsMutation.mutate()}
                disabled={syncPaymentsMutation.isPending}
                data-testid="button-import-ledger-empty"
              >
                <CloudDownload className="w-3.5 h-3.5 mr-1.5" />
                Import Ledger
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
