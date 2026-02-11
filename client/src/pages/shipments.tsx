import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRange } from "react-day-picker";
import { DateRangePicker, dateRangeToParams } from "@/components/date-range-picker";
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
  Truck,
  Search,
  Filter,
  RefreshCw,
  Package,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Printer,
  Eye,
  Download,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const workflowStatusOptions = [
  { value: "all", label: "All Stages" },
  { value: "FULFILLED", label: "Fulfilled" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "RETURN", label: "Return" },
];

const courierOptions = [
  { value: "all", label: "All Couriers" },
  { value: "leopards", label: "Leopards" },
  { value: "postex", label: "PostEx" },
  { value: "tcs", label: "TCS" },
];

const WORKFLOW_STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  'FULFILLED': { color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Truck, label: "Fulfilled" },
  'DELIVERED': { color: "bg-green-500/10 text-green-600 border-green-500/20", icon: CheckCircle2, label: "Delivered" },
  'RETURN': { color: "bg-red-500/10 text-red-600 border-red-500/20", icon: RotateCcw, label: "Return" },
};

function getWorkflowBadge(status: string) {
  const config = WORKFLOW_STATUS_CONFIG[status] || { color: "bg-muted text-muted-foreground", icon: Package, label: status };
  return <Badge className={config.color}>{config.label}</Badge>;
}

interface ShipmentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  city: string | null;
  courierName: string | null;
  courierTracking: string | null;
  totalAmount: string | null;
  codRemaining: string | null;
  codPaymentStatus: string | null;
  workflowStatus: string;
  remark: string | null;
  orderDate: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  returnedAt: string | null;
  shipmentStatus: string | null;
  courierRawStatus: string | null;
  lastTrackingUpdate: string | null;
  prepaidAmount: string | null;
  paymentMethod: string | null;
}

interface ShipmentsResponse {
  orders: ShipmentOrder[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
}

const BATCH_STATUS_COLORS: Record<string, string> = {
  'SUCCESS': "bg-green-500/10 text-green-600 border-green-500/20",
  'PARTIAL_SUCCESS': "bg-amber-500/10 text-amber-600 border-amber-500/20",
  'FAILED': "bg-red-500/10 text-red-600 border-red-500/20",
  'CREATED': "bg-blue-500/10 text-blue-600 border-blue-500/20",
};

function getBatchStatusBadge(status: string) {
  const color = BATCH_STATUS_COLORS[status] || "bg-muted text-muted-foreground";
  const label = status.replace(/_/g, " ");
  return <Badge className={color}>{label}</Badge>;
}

interface BatchType {
  id: string;
  merchantId: string;
  createdByUserId: string | null;
  courierName: string;
  batchType: string;
  status: string;
  totalSelectedCount: number | null;
  successCount: number | null;
  failedCount: number | null;
  notes: string | null;
  pdfBatchPath: string | null;
  pdfBatchMeta: any;
  createdAt: string | null;
}

interface BatchesResponse {
  batches: BatchType[];
  total: number;
}

interface BatchItemType {
  id: string;
  batchId: string;
  orderId: string;
  orderNumber: string | null;
  bookingStatus: string;
  bookingError: string | null;
  trackingNumber: string | null;
  slipUrl: string | null;
  printRecordId: string | null;
  consigneeName: string | null;
  consigneePhone: string | null;
  consigneeCity: string | null;
  codAmount: string | null;
  createdAt: string | null;
}

interface BatchDetailResponse {
  batch: BatchType;
  items: BatchItemType[];
}

export default function Shipments() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("shipments");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [batchCourierFilter, setBatchCourierFilter] = useState("all");
  const [batchPage, setBatchPage] = useState(1);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const dateParams = dateRangeToParams(dateRange);
  const queryParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(search && { search }),
    ...(statusFilter !== "all" && { workflowStatus: statusFilter }),
    ...(courierFilter !== "all" && { courier: courierFilter }),
    ...(dateParams.dateFrom && { dateFrom: dateParams.dateFrom }),
    ...(dateParams.dateTo && { dateTo: dateParams.dateTo }),
  });

  const { data, isLoading, refetch } = useQuery<ShipmentsResponse>({
    queryKey: ["/api/shipments", queryParams.toString()],
    refetchInterval: 30000,
  });

  const shipmentOrders = data?.orders ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);
  const counts = data?.counts ?? {};

  const fulfilledCount = counts["FULFILLED"] ?? 0;
  const deliveredCount = counts["DELIVERED"] ?? 0;
  const returnCount = counts["RETURN"] ?? 0;
  const totalCount = fulfilledCount + deliveredCount + returnCount;

  const batchQueryParams = new URLSearchParams({
    page: batchPage.toString(),
    pageSize: "20",
    ...(batchCourierFilter !== "all" && { courier: batchCourierFilter }),
  });

  const { data: batchesData, isLoading: batchesLoading } = useQuery<BatchesResponse>({
    queryKey: ["/api/shipment-batches", { page: batchPage, courier: batchCourierFilter }],
    queryFn: async () => {
      const res = await fetch(`/api/shipment-batches?${batchQueryParams.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: activeTab === "batches",
  });

  const batches = batchesData?.batches ?? [];
  const batchTotalPages = Math.ceil((batchesData?.total ?? 0) / 20);

  const { data: batchDetailData, isLoading: batchDetailLoading } = useQuery<BatchDetailResponse>({
    queryKey: ["/api/shipment-batches", "detail", selectedBatchId],
    queryFn: async () => {
      const res = await fetch(`/api/shipment-batches/${selectedBatchId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: !!selectedBatchId,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-shipments-title">Shipments</h1>
          <p className="text-muted-foreground">All dispatched orders handed over to couriers.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-sync-shipments">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-shipments">
          <TabsTrigger value="shipments" data-testid="tab-shipments">
            <Truck className="w-4 h-4 mr-2" />
            Shipments
          </TabsTrigger>
          <TabsTrigger value="batches" data-testid="tab-batch-logs">
            <FileText className="w-4 h-4 mr-2" />
            Batch Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="shipments" className="space-y-6 mt-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Package className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-total">{totalCount}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-fulfilled">{fulfilledCount}</p>
                  <p className="text-xs text-muted-foreground">Fulfilled</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-delivered">{deliveredCount}</p>
                  <p className="text-xs text-muted-foreground">Delivered</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-return">{returnCount}</p>
                  <p className="text-xs text-muted-foreground">Returns</p>
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
                    placeholder="Search by tracking number, order, customer, or city..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="pl-10"
                    data-testid="input-search-shipments"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[160px]" data-testid="select-shipment-status">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {workflowStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={courierFilter} onValueChange={(v) => { setCourierFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[160px]" data-testid="select-shipment-courier">
                      <Truck className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Courier" />
                    </SelectTrigger>
                    <SelectContent>
                      {courierOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <DateRangePicker
                    dateRange={dateRange}
                    onDateRangeChange={(range) => { setDateRange(range); setPage(1); }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Truck className="w-5 h-5" />
                Shipments
                {data?.total !== undefined && (
                  <Badge variant="secondary" className="ml-2">
                    {data.total} orders
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-32 flex-1" />
                      <Skeleton className="h-6 w-24" />
                    </div>
                  ))}
                </div>
              ) : shipmentOrders.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>City</TableHead>
                          <TableHead>Courier</TableHead>
                          <TableHead>Tracking #</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Stage</TableHead>
                          <TableHead>Courier Status</TableHead>
                          <TableHead>Remarks</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shipmentOrders.map((order) => (
                          <TableRow key={order.id} data-testid={`shipment-row-${order.id}`}>
                            <TableCell>
                              <Link href={`/orders/detail/${order.id}`} className="text-primary hover:underline font-medium" data-testid={`link-order-${order.id}`}>
                                {order.orderNumber}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm" data-testid={`text-customer-${order.id}`}>{order.customerName}</p>
                                <p className="text-xs text-muted-foreground">{order.customerPhone || "-"}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground" data-testid={`text-city-${order.id}`}>{order.city || "-"}</TableCell>
                            <TableCell className="capitalize" data-testid={`text-courier-${order.id}`}>{order.courierName || "-"}</TableCell>
                            <TableCell className="font-mono text-sm" data-testid={`text-tracking-${order.id}`}>
                              {order.courierTracking || "-"}
                            </TableCell>
                            <TableCell className="text-right font-medium" data-testid={`text-amount-${order.id}`}>
                              {order.totalAmount ? `PKR ${Number(order.totalAmount).toLocaleString()}` : "-"}
                            </TableCell>
                            <TableCell data-testid={`badge-status-${order.id}`}>
                              {getWorkflowBadge(order.workflowStatus)}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm" data-testid={`text-courier-status-${order.id}`}>
                              {order.courierRawStatus || order.shipmentStatus || "-"}
                            </TableCell>
                            <TableCell data-testid={`text-remark-${order.id}`}>
                              {order.remark ? (
                                <div className="max-w-[200px]">
                                  <p className="text-sm text-muted-foreground truncate" title={order.remark}>
                                    {order.remark}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-muted-foreground/50">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap" data-testid={`text-date-${order.id}`}>
                              {order.dispatchedAt
                                ? format(new Date(order.dispatchedAt), "MMM dd, h:mm a")
                                : order.orderDate
                                ? format(new Date(order.orderDate), "MMM dd, yyyy")
                                : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between gap-4 p-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data?.total ?? 0)} of {data?.total} orders
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(page - 1)}
                          disabled={page === 1}
                          data-testid="button-prev-page"
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
                          data-testid="button-next-page"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-16">
                  <Truck className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="font-medium mb-1">No shipments found</h3>
                  <p className="text-sm text-muted-foreground">
                    {search || statusFilter !== "all" || courierFilter !== "all"
                      ? "Try adjusting your filters"
                      : "Dispatched orders will appear here once they are fulfilled"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="batches" className="space-y-6 mt-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-2 flex-wrap">
                <Select value={batchCourierFilter} onValueChange={(v) => { setBatchCourierFilter(v); setBatchPage(1); }}>
                  <SelectTrigger className="w-[160px]" data-testid="select-batch-courier">
                    <Truck className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Courier" />
                  </SelectTrigger>
                  <SelectContent>
                    {courierOptions.map((option) => (
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
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Batch Logs
                {batchesData?.total !== undefined && (
                  <Badge variant="secondary" className="ml-2">
                    {batchesData.total} batches
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {batchesLoading ? (
                <div className="p-4 space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-32 flex-1" />
                      <Skeleton className="h-6 w-24" />
                    </div>
                  ))}
                </div>
              ) : batches.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Batch ID</TableHead>
                          <TableHead>Courier</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-center">Total</TableHead>
                          <TableHead className="text-center">Success</TableHead>
                          <TableHead className="text-center">Failed</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created At</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batches.map((batch) => (
                          <TableRow key={batch.id} data-testid={`batch-row-${batch.id}`}>
                            <TableCell className="font-mono text-sm">
                              {batch.id.substring(0, 8)}
                            </TableCell>
                            <TableCell className="capitalize">{batch.courierName}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {batch.batchType}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">{batch.totalSelectedCount ?? "-"}</TableCell>
                            <TableCell className="text-center text-green-600">{batch.successCount ?? "-"}</TableCell>
                            <TableCell className="text-center text-red-600">{batch.failedCount ?? "-"}</TableCell>
                            <TableCell>{getBatchStatusBadge(batch.status)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {batch.createdAt
                                ? format(new Date(batch.createdAt), "MMM dd, h:mm a")
                                : "-"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {(batch.successCount ?? 0) > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={async () => {
                                      try {
                                        const resp = await fetch(`/api/print/batch-awb/${batch.id}.pdf`);
                                        if (!resp.ok) {
                                          const err = await resp.json().catch(() => ({ message: "Failed to fetch airway bills" }));
                                          toast({ title: "Invoice Error", description: err.message, variant: "destructive" });
                                          return;
                                        }
                                        const blob = await resp.blob();
                                        if (blob.size === 0 || blob.type.includes("json")) {
                                          toast({ title: "Invoice Error", description: "Invoices not available for this batch", variant: "destructive" });
                                          return;
                                        }
                                        const url = URL.createObjectURL(blob);
                                        window.open(url, "_blank");
                                        setTimeout(() => URL.revokeObjectURL(url), 60000);
                                      } catch {
                                        toast({ title: "Error", description: "Could not fetch airway bills", variant: "destructive" });
                                      }
                                    }}
                                    title="Download Courier Airway Bills"
                                    data-testid={`button-download-batch-awb-${batch.id}`}
                                  >
                                    <Printer className="w-4 h-4" />
                                  </Button>
                                )}
                                {batch.pdfBatchPath && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => window.open(`/api/print/batch/${batch.id}.pdf`, "_blank")}
                                    title="Download Batch Loadsheet"
                                    data-testid={`button-download-batch-pdf-${batch.id}`}
                                  >
                                    <Download className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSelectedBatchId(batch.id)}
                                  data-testid={`button-batch-details-${batch.id}`}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {batchTotalPages > 1 && (
                    <div className="flex items-center justify-between gap-4 p-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        Showing {(batchPage - 1) * 20 + 1} to {Math.min(batchPage * 20, batchesData?.total ?? 0)} of {batchesData?.total} batches
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setBatchPage(batchPage - 1)}
                          disabled={batchPage === 1}
                          data-testid="button-batch-prev"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-sm">
                          Page {batchPage} of {batchTotalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setBatchPage(batchPage + 1)}
                          disabled={batchPage >= batchTotalPages}
                          data-testid="button-batch-next"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-16">
                  <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="font-medium mb-1">No batch logs found</h3>
                  <p className="text-sm text-muted-foreground">
                    Batch booking logs will appear here after courier bookings
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedBatchId} onOpenChange={(open) => !open && setSelectedBatchId(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Batch Details
              {batchDetailData?.batch && (
                <Badge variant="secondary" className="ml-2">
                  {batchDetailData.batch.id.substring(0, 8)}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {batchDetailLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : batchDetailData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Courier</p>
                  <p className="capitalize font-medium">{batchDetailData.batch.courierName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  {getBatchStatusBadge(batchDetailData.batch.status)}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Success</p>
                  <p className="font-medium text-green-600">{batchDetailData.batch.successCount ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Failed</p>
                  <p className="font-medium text-red-600">{batchDetailData.batch.failedCount ?? 0}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Tracking #</TableHead>
                      <TableHead className="text-right">COD</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchDetailData.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Link href={`/orders/detail/${item.orderId}`} className="text-primary hover:underline">
                            {item.orderNumber || item.orderId.substring(0, 8)}
                          </Link>
                        </TableCell>
                        <TableCell>{item.consigneeName || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{item.consigneeCity || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">{item.trackingNumber || "-"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {item.codAmount ? `PKR ${Number(item.codAmount).toLocaleString()}` : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            item.bookingStatus === "SUCCESS"
                              ? "bg-green-500/10 text-green-600 border-green-500/20"
                              : "bg-red-500/10 text-red-600 border-red-500/20"
                          }>
                            {item.bookingStatus}
                          </Badge>
                          {item.bookingError && (
                            <p className="text-xs text-red-500 mt-1">{item.bookingError}</p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
