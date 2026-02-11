import { useState, useMemo } from "react";
import { useResizableColumns, type ColumnDef } from "@/hooks/use-resizable-columns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CodReconciliation } from "@shared/schema";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { DateRange } from "react-day-picker";
import { DateRangePicker, dateRangeToParams } from "@/components/date-range-picker";

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
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [isReconcileDialogOpen, setIsReconcileDialogOpen] = useState(false);
  const [settlementRef, setSettlementRef] = useState("");

  const codColumns: ColumnDef[] = useMemo(() => [
    { key: "order", defaultWidth: 100, minWidth: 60, maxWidth: 200 },
    { key: "tracking", defaultWidth: 140, minWidth: 80, maxWidth: 300 },
    { key: "courier", defaultWidth: 100, minWidth: 60, maxWidth: 200 },
    { key: "cod", defaultWidth: 100, minWidth: 60, maxWidth: 200 },
    { key: "fee", defaultWidth: 90, minWidth: 50, maxWidth: 180 },
    { key: "net", defaultWidth: 100, minWidth: 60, maxWidth: 200 },
    { key: "status", defaultWidth: 110, minWidth: 60, maxWidth: 220 },
    { key: "ref", defaultWidth: 130, minWidth: 60, maxWidth: 300 },
    { key: "date", defaultWidth: 120, minWidth: 80, maxWidth: 250 },
  ], []);

  const { getHeaderProps: getCodHeaderProps, getResizeHandleProps: getCodResizeProps } = useResizableColumns(codColumns, "cod-reconciliation");

  const dateParams = dateRangeToParams(dateRange);
  const queryParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(search && { search }),
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(dateParams.dateFrom && { dateFrom: dateParams.dateFrom }),
    ...(dateParams.dateTo && { dateTo: dateParams.dateTo }),
  });

  const { data, isLoading } = useQuery<CodReconciliationResponse>({
    queryKey: ["/api/cod-reconciliation", queryParams.toString()],
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  const records = data?.records ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);
  const summary = data?.summary;

  const reconcileMutation = useMutation({
    mutationFn: async (data: { recordIds: string[]; settlementRef: string }) => {
      return apiRequest("POST", "/api/cod-reconciliation/reconcile", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cod-reconciliation"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/cod-reconciliation"] });
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

    const headers = ["Tracking #", "Courier", "COD Amount", "Courier Fee", "Net Amount", "Status", "Settlement Ref", "Date"];
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
          record.courierSettlementRef || "",
          record.createdAt ? format(new Date(record.createdAt), "yyyy-MM-dd") : "",
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">COD Reconciliation</h1>
          <p className="text-muted-foreground">Track and reconcile Cash on Delivery payments.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedRecords.length > 0 && (
            <Button onClick={() => setIsReconcileDialogOpen(true)} data-testid="button-reconcile-selected">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Reconcile ({selectedRecords.length})
            </Button>
          )}
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border-amber-500/20">
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Pending Collection</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-28 mt-1" />
                ) : (
                  <>
                    <p className="text-2xl font-bold">{summary?.totalPending ?? "0"}</p>
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
                {isLoading ? (
                  <Skeleton className="h-8 w-28 mt-1" />
                ) : (
                  <>
                    <p className="text-2xl font-bold">{summary?.totalReceived ?? "0"}</p>
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
                {isLoading ? (
                  <Skeleton className="h-8 w-28 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">{summary?.totalDisputed ?? "0"}</p>
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
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search-cod"
              />
            </div>
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={(range) => { setDateRange(range); setPage(1); }}
            />
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

      {/* Records Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
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
                <Table style={{ tableLayout: "fixed" }}>
                  <TableHeader>
                    <TableRow>
                      <TableHead style={{ width: 50 }}>
                        <Checkbox
                          checked={allPendingSelected}
                          onCheckedChange={handleSelectAll}
                          disabled={pendingRecords.length === 0}
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead {...getCodHeaderProps("tracking")}>Tracking #<div {...getCodResizeProps("tracking")} /></TableHead>
                      <TableHead {...getCodHeaderProps("courier")}>Courier<div {...getCodResizeProps("courier")} /></TableHead>
                      <TableHead className="text-right" {...getCodHeaderProps("cod")}>COD Amount<div {...getCodResizeProps("cod")} /></TableHead>
                      <TableHead className="text-right" {...getCodHeaderProps("fee")}>Courier Fee<div {...getCodResizeProps("fee")} /></TableHead>
                      <TableHead className="text-right" {...getCodHeaderProps("net")}>Net Amount<div {...getCodResizeProps("net")} /></TableHead>
                      <TableHead {...getCodHeaderProps("status")}>Status<div {...getCodResizeProps("status")} /></TableHead>
                      <TableHead {...getCodHeaderProps("ref")}>Settlement Ref<div {...getCodResizeProps("ref")} /></TableHead>
                      <TableHead {...getCodHeaderProps("date")}>Date<div {...getCodResizeProps("date")} /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => (
                      <TableRow key={record.id} data-testid={`cod-row-${record.id}`}>
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
                          {Number(record.codAmount).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {Number(record.courierFee || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {Number(record.netAmount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell>{getStatusBadge(record.status || "pending")}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {record.courierSettlementRef || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {record.createdAt
                            ? format(new Date(record.createdAt), "MMM dd, yyyy")
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
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

      {/* Reconcile Dialog */}
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
