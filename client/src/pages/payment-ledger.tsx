import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  ExternalLink,
  ArrowDownRight,
  Wallet,
  TrendingDown,
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-ledger-title">Payment Ledger</h1>
          <p className="text-muted-foreground">Per-shipment financial breakdown: COD collected vs courier charges vs amount paid.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncPaymentsMutation.mutate()}
              disabled={syncPaymentsMutation.isPending}
              data-testid="button-import-ledger"
            >
              <CloudDownload className={`w-4 h-4 mr-2 ${syncPaymentsMutation.isPending ? 'animate-pulse' : ''}`} />
              {syncPaymentsMutation.isPending ? 'Importing...' : 'Import Ledger'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-payment-ledger">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
          {syncPaymentsMutation.isPending && codSyncProgress && (
            <div className="w-48 space-y-1" data-testid="cod-sync-progress-ledger">
              <Progress value={codSyncProgress.total > 0 ? (codSyncProgress.processed / codSyncProgress.total) * 100 : undefined} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">
                {codSyncProgress.total > 0
                  ? `Syncing ${codSyncProgress.processed} of ${codSyncProgress.total} records...`
                  : "Starting sync..."}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total COD Collected</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-28 mt-1" />
                ) : (
                  <>
                    <p className="text-2xl font-bold" data-testid="text-total-cod">Rs {summary?.totalCod ?? "0"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{summary?.recordCount ?? 0} shipments</p>
                  </>
                )}
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Courier Deductions</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-28 mt-1" />
                ) : (
                  <>
                    <p className="text-2xl font-bold text-red-500" data-testid="text-total-deductions">Rs {summary?.totalDeductions ?? "0"}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span>Fee: Rs {summary?.totalTxnFee ?? "0"}</span>
                      <span>Tax: Rs {summary?.totalTxnTax ?? "0"}</span>
                    </div>
                  </>
                )}
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Net Amount Paid to You</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-28 mt-1" />
                ) : (
                  <>
                    <p className="text-2xl font-bold text-green-500" data-testid="text-total-net">Rs {summary?.totalNetPaid ?? "0"}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span>{summary?.syncedCount ?? 0} synced</span>
                      {(summary?.unsyncedCount ?? 0) > 0 && (
                        <Badge variant="secondary" className="text-xs">{summary?.unsyncedCount} pending sync</Badge>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <ArrowDownRight className="w-5 h-5 text-green-500" />
              </div>
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
                placeholder="Search by tracking number or courier..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-10"
                data-testid="input-search-ledger"
              />
            </div>
            <Select value={courierFilter} onValueChange={(v) => { setCourierFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]" data-testid="select-courier-filter">
                <Filter className="w-4 h-4 mr-2" />
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Shipment Financial Breakdown
            {data?.total !== undefined && (
              <Badge variant="secondary" className="ml-2">{data.total} records</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24 flex-1" />
                </div>
              ))}
            </div>
          ) : records.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tracking #</TableHead>
                      <TableHead>Courier</TableHead>
                      <TableHead className="text-right">COD Amount</TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          Service Fee
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="w-3 h-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>Courier delivery/service charges per shipment</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          Reversal
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="w-3 h-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>Charges for returned/reversed shipments</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableHead>
                      <TableHead className="text-right font-semibold">Total Deducted</TableHead>
                      <TableHead className="text-right font-semibold">Net Paid</TableHead>
                      <TableHead>Payment Status</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Billing Method</TableHead>
                      <TableHead>Invoice/Cheque #</TableHead>
                      <TableHead>Settlement Date</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Slip</TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          Upfront
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="w-3 h-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>PostEx upfront payment amount</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          Reserve
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="w-3 h-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>PostEx reserve payment amount</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          Balance
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="w-3 h-3 text-muted-foreground" />
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
                          <TableCell className="font-mono text-sm">{record.trackingNumber || "-"}</TableCell>
                          <TableCell className="capitalize text-sm">{record.courierName || "-"}</TableCell>
                          <TableCell className="text-right font-medium">
                            Rs {Number(record.codAmount).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatPKR(record.transactionFee)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatPKR(record.transactionTax)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {Number(record.reversalFee || 0) + Number(record.reversalTax || 0) > 0
                              ? formatPKR(String(Number(record.reversalFee || 0) + Number(record.reversalTax || 0)))
                              : "--"
                            }
                          </TableCell>
                          <TableCell className="text-right font-medium text-red-500">
                            {hasFees ? `-Rs ${Number(record.totalDeduction).toLocaleString()}` : "--"}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600 dark:text-green-400">
                            {record.hasSyncedData
                              ? `Rs ${Number(record.calculatedNetPaid).toLocaleString()}`
                              : <span className="text-muted-foreground font-normal">Pending sync</span>
                            }
                          </TableCell>
                          <TableCell>
                            {record.courierPaymentStatus ? (
                              <Badge className={
                                isSettled
                                  ? "bg-green-500/10 text-green-600 border-green-500/20"
                                  : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                              }>
                                {record.courierPaymentStatus}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">--</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm" data-testid={`text-payment-method-${record.id}`}>
                            {record.courierPaymentMethod || <span className="text-muted-foreground">--</span>}
                          </TableCell>
                          <TableCell className="text-sm" data-testid={`text-billing-method-${record.id}`}>
                            {record.courierBillingMethod || <span className="text-muted-foreground">--</span>}
                          </TableCell>
                          <TableCell className="text-sm font-mono" data-testid={`text-invoice-cheque-${record.id}`}>
                            {record.courierPaymentRef || <span className="text-muted-foreground">--</span>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap" data-testid={`text-settlement-date-${record.id}`}>
                            {record.courierSettlementDate
                              ? formatPkDate(record.courierSettlementDate)
                              : "--"
                            }
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate" title={record.courierMessage || undefined} data-testid={`text-message-${record.id}`}>
                            {record.courierMessage || <span className="text-muted-foreground">--</span>}
                          </TableCell>
                          <TableCell>
                            {record.courierSlipLink ? (
                              <a
                                href={record.courierSlipLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                data-testid={`link-slip-${record.id}`}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                View
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-xs">--</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatPKR(record.upfrontPayment)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatPKR(record.reservePayment)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatPKR(record.balancePayment)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data?.total ?? 0)} of {data?.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page === 1} data-testid="button-prev-page">
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm" data-testid="text-page-info">Page {page} of {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages} data-testid="button-next-page">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <Receipt className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="font-medium mb-1">No payment ledger records found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search || courierFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Click \"Import Ledger\" to fetch payment data from your couriers"
                }
              </p>
              {!search && courierFilter === "all" && (
                <Button
                  variant="outline"
                  onClick={() => syncPaymentsMutation.mutate()}
                  disabled={syncPaymentsMutation.isPending}
                  data-testid="button-import-ledger-empty"
                >
                  <CloudDownload className="w-4 h-4 mr-2" />
                  Import Ledger
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
