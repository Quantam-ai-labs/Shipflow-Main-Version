import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  CheckCircle2,
  Clock,
  Banknote,
  Hash,
  Package,
  Calendar,
  ArrowDownRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

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

export default function ManageCheques() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    if (courierFilter && courierFilter !== "all") params.set("courier", courierFilter);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return params.toString();
  };

  const { data, isLoading } = useQuery<ChequesResponse>({
    queryKey: [`/api/manage-cheques?${buildQueryString()}`],
    refetchInterval: 30000,
  });

  const cheques = data?.cheques || [];
  const total = data?.total || 0;
  const summary = data?.summary;
  const totalPages = Math.ceil(total / pageSize);

  const formatCurrency = (val: string | number) => {
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "Rs. 0";
    return `Rs. ${num.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "dd MMM yyyy");
    } catch {
      return "-";
    }
  };

  const isSettled = (status: string) => {
    const s = status.toLowerCase();
    return s === "paid" || s === "settled";
  };

  const getDisplayRef = (cheque: ChequeRecord) => {
    if (cheque.chequeRef) return cheque.chequeRef;
    if (cheque.settlementDate) return `Settlement ${formatDate(cheque.settlementDate)}`;
    return cheque.settlementKey;
  };

  return (
    <div className="flex flex-col h-full overflow-auto" data-testid="manage-cheques-page">
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Manage Settlements</h1>
          <p className="text-sm text-muted-foreground">
            Track courier payment settlements - cheques (Leopards) and digital transfers (PostEx)
          </p>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Settlements</CardTitle>
                <Hash className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-settlements">{summary.totalSettlements}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total COD</CardTitle>
                <Banknote className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-cod">{formatCurrency(summary.totalCod)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Net Received</CardTitle>
                <ArrowDownRight className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-total-net">{formatCurrency(summary.totalNet)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Settled</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-settled-count">{summary.settledCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
                <Clock className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-pending-count">{summary.pendingCount}</div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <CardTitle className="text-lg">Settlement Records</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by ref or tracking..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="pl-9"
                    data-testid="input-search"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-32" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Paid">Paid / Settled</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={courierFilter} onValueChange={(v) => { setCourierFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-40" data-testid="select-courier-filter">
                    <SelectValue placeholder="Courier" />
                  </SelectTrigger>
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
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
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
                    {cheques.map((cheque) => (
                      <TableRow key={cheque.settlementKey} data-testid={`row-settlement-${cheque.settlementKey}`}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-sm font-medium" data-testid={`text-ref-${cheque.settlementKey}`}>
                              {getDisplayRef(cheque)}
                            </span>
                            {cheque.chequeRef && cheque.settlementDate && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDate(cheque.settlementDate)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {cheque.courierName || "N/A"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isSettled(cheque.paymentStatus) ? "default" : "secondary"}
                            className={isSettled(cheque.paymentStatus) ? "bg-green-600 text-white" : ""}
                            data-testid={`badge-status-${cheque.settlementKey}`}
                          >
                            {isSettled(cheque.paymentStatus) ? (
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                            ) : (
                              <Clock className="w-3 h-3 mr-1" />
                            )}
                            {cheque.paymentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {cheque.paymentMethod !== "N/A" ? cheque.paymentMethod : (cheque.courierName === "PostEx" ? "Digital" : "-")}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Package className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="font-medium" data-testid={`text-shipments-${cheque.settlementKey}`}>
                              {cheque.shipmentCount}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground" data-testid={`text-cod-${cheque.settlementKey}`}>
                          {formatCurrency(cheque.totalCod)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground" data-testid={`text-deductions-${cheque.settlementKey}`}>
                          {formatCurrency(cheque.totalDeductions)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600 dark:text-green-400" data-testid={`text-net-${cheque.settlementKey}`}>
                          {formatCurrency(cheque.totalNet)}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {formatDate(cheque.settlementDate)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {cheque.slipLink ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => window.open(cheque.slipLink!, "_blank")}
                              data-testid={`button-slip-${cheque.settlementKey}`}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
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
                  Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, total)} of {total} settlements
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm px-2">Page {page} of {totalPages}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
