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
  ChevronLeft,
  ChevronRight,
  FileText,
  Printer,
  Eye,
  Download,
  MessageSquare,
  RotateCcw,
  ClipboardList,
  BookOpen,
  FileSpreadsheet,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Clock,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const workflowStatusOptions = [
  { value: "all", label: "All Stages" },
  { value: "BOOKED", label: "Booked" },
  { value: "FULFILLED", label: "Fulfilled" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "RETURN", label: "Return" },
];

const shipmentStatusOptions = [
  { value: "all", label: "All Shipment Statuses" },
  { value: "BOOKED", label: "Booked" },
  { value: "PICKED_UP", label: "Picked Up" },
  { value: "ARRIVED_AT_ORIGIN", label: "At Origin" },
  { value: "IN_TRANSIT", label: "In Transit" },
  { value: "ARRIVED_AT_DESTINATION", label: "At Destination" },
  { value: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
  { value: "DELIVERY_ATTEMPTED", label: "Delivery Attempted" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "DELIVERY_FAILED", label: "Delivery Failed" },
  { value: "READY_FOR_RETURN", label: "Ready for Return" },
  { value: "RETURN_IN_TRANSIT", label: "Return in Transit" },
  { value: "RETURNED_TO_SHIPPER", label: "Returned" },
  { value: "CANCELLED", label: "Cancelled" },
];

const courierOptions = [
  { value: "all", label: "All Couriers" },
  { value: "leopards", label: "Leopards" },
  { value: "postex", label: "PostEx" },
  { value: "tcs", label: "TCS" },
];

const bookingStatusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "processing", label: "Processing" },
  { value: "queued", label: "Queued" },
];

const WORKFLOW_STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  'BOOKED': { color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: Package, label: "Booked" },
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

interface BookingLog {
  id: string;
  orderId: string;
  courierName: string;
  status: string;
  trackingNumber: string | null;
  slipUrl: string | null;
  errorMessage: string | null;
  createdAt: string | null;
  orderNumber: string | null;
  customerName: string | null;
  city: string | null;
  totalAmount: string | null;
}

interface BookingLogsResponse {
  logs: BookingLog[];
  total: number;
  page: number;
  pageSize: number;
}

interface ShipperAdviceRow {
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
  paymentMethod: string | null;
  prepaidAmount: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  orderDate: string | null;
}

interface ShipperAdviceResponse {
  rows: ShipperAdviceRow[];
  totalsByCourier: Record<string, { count: number; totalAmount: number; codCollected: number; codPending: number }>;
  total: number;
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

function getBookingStatusBadge(status: string) {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    success: { color: "bg-green-500/10 text-green-600 border-green-500/20", icon: CheckCircle },
    failed: { color: "bg-red-500/10 text-red-600 border-red-500/20", icon: XCircle },
    processing: { color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Clock },
    queued: { color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
  };
  const c = config[status] || { color: "bg-muted text-muted-foreground", icon: Package };
  return <Badge className={c.color}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
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

function Pagination({ page, totalPages, total, pageSize, onPrev, onNext, prevTestId, nextTestId }: {
  page: number; totalPages: number; total: number; pageSize: number;
  onPrev: () => void; onNext: () => void; prevTestId: string; nextTestId: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-4 p-4 border-t">
      <p className="text-sm text-muted-foreground">
        Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={page === 1} data-testid={prevTestId}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm">Page {page} of {totalPages}</span>
        <Button variant="outline" size="sm" onClick={onNext} disabled={page >= totalPages} data-testid={nextTestId}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function Shipments() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("shipments");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(1);
  const pageSize = 100;

  const [bkCourierFilter, setBkCourierFilter] = useState("all");
  const [bkStatusFilter, setBkStatusFilter] = useState("all");
  const [bkDateRange, setBkDateRange] = useState<DateRange | undefined>(undefined);
  const [bkPage, setBkPage] = useState(1);

  const [saCourierFilter, setSaCourierFilter] = useState("all");
  const [saDateRange, setSaDateRange] = useState<DateRange | undefined>(undefined);

  const [batchCourierFilter, setBatchCourierFilter] = useState("all");
  const [batchPage, setBatchPage] = useState(1);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const dateParams = dateRangeToParams(dateRange);
  const queryParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(search && { search }),
    ...(statusFilter !== "all" && { workflowStatus: statusFilter }),
    ...(shipmentStatusFilter !== "all" && { shipmentStatus: shipmentStatusFilter }),
    ...(courierFilter !== "all" && { courier: courierFilter }),
    ...(dateParams.dateFrom && { dateFrom: dateParams.dateFrom }),
    ...(dateParams.dateTo && { dateTo: dateParams.dateTo }),
  });

  const { data, isLoading, refetch } = useQuery<ShipmentsResponse>({
    queryKey: ["/api/shipments", queryParams.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/shipments?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const shipmentOrders = data?.orders ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);
  const counts = data?.counts ?? {};
  const bookedCount = counts["BOOKED"] ?? 0;
  const fulfilledCount = counts["FULFILLED"] ?? 0;
  const deliveredCount = counts["DELIVERED"] ?? 0;
  const returnCount = counts["RETURN"] ?? 0;
  const totalCount = bookedCount + fulfilledCount + deliveredCount + returnCount;
  const pendingCount = bookedCount + fulfilledCount;

  const bkDateParams = dateRangeToParams(bkDateRange);
  const bkQueryParams = new URLSearchParams({
    page: bkPage.toString(),
    pageSize: "100",
    ...(bkCourierFilter !== "all" && { courier: bkCourierFilter }),
    ...(bkStatusFilter !== "all" && { status: bkStatusFilter }),
    ...(bkDateParams.dateFrom && { dateFrom: bkDateParams.dateFrom }),
    ...(bkDateParams.dateTo && { dateTo: bkDateParams.dateTo }),
  });

  const { data: bkData, isLoading: bkLoading } = useQuery<BookingLogsResponse>({
    queryKey: ["/api/booking-logs", bkQueryParams.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/booking-logs?${bkQueryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: activeTab === "booking-logs",
  });

  const bookingLogs = bkData?.logs ?? [];
  const bkTotalPages = Math.ceil((bkData?.total ?? 0) / 100);

  const saDateParams = dateRangeToParams(saDateRange);
  const saQueryParams = new URLSearchParams({
    ...(saCourierFilter !== "all" && { courier: saCourierFilter }),
    ...(saDateParams.dateFrom && { dateFrom: saDateParams.dateFrom }),
    ...(saDateParams.dateTo && { dateTo: saDateParams.dateTo }),
  });

  const { data: saData, isLoading: saLoading } = useQuery<ShipperAdviceResponse>({
    queryKey: ["/api/shipper-advice", saQueryParams.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/shipper-advice?${saQueryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: activeTab === "shipper-advice",
  });

  const saRows = saData?.rows ?? [];
  const saTotals = saData?.totalsByCourier ?? {};

  const batchQueryParams = new URLSearchParams({
    page: batchPage.toString(),
    pageSize: "100",
    ...(batchCourierFilter !== "all" && { courier: batchCourierFilter }),
  });

  const { data: batchesData, isLoading: batchesLoading } = useQuery<BatchesResponse>({
    queryKey: ["/api/shipment-batches", batchQueryParams.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/shipment-batches?${batchQueryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: activeTab === "loadsheets",
  });

  const batches = batchesData?.batches ?? [];
  const batchTotalPages = Math.ceil((batchesData?.total ?? 0) / 20);

  const { data: batchDetailData, isLoading: batchDetailLoading } = useQuery<BatchDetailResponse>({
    queryKey: ["/api/shipment-batches", "detail", selectedBatchId],
    queryFn: async () => {
      const res = await fetch(`/api/shipment-batches/${selectedBatchId}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: !!selectedBatchId,
  });

  const courierGroupedRows = saRows.reduce<Record<string, ShipperAdviceRow[]>>((acc, row) => {
    const cn = row.courierName || "Unknown";
    if (!acc[cn]) acc[cn] = [];
    acc[cn].push(row);
    return acc;
  }, {});

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
        <TabsList data-testid="tabs-shipments" className="flex flex-wrap gap-1">
          <TabsTrigger value="shipments" data-testid="tab-shipments">
            <Truck className="w-4 h-4 mr-2" />
            Shipments
          </TabsTrigger>
          <TabsTrigger value="shipper-advice" data-testid="tab-shipper-advice">
            <ClipboardList className="w-4 h-4 mr-2" />
            Shipper Advice
          </TabsTrigger>
          <TabsTrigger value="booking-logs" data-testid="tab-booking-logs">
            <BookOpen className="w-4 h-4 mr-2" />
            Booking Logs
          </TabsTrigger>
          <TabsTrigger value="loadsheets" data-testid="tab-loadsheets">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Loadsheets
          </TabsTrigger>
        </TabsList>

        {/* ====== SHIPMENTS TAB ====== */}
        <TabsContent value="shipments" className="space-y-6 mt-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Package className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-total">{totalCount}</p>
                  <p className="text-xs text-muted-foreground">Total Dispatched</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-pending">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
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
                  <p className="text-xs text-muted-foreground">Returned</p>
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
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={shipmentStatusFilter} onValueChange={(v) => { setShipmentStatusFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[200px]" data-testid="select-shipment-status-filter">
                      <Package className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Shipment Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {shipmentStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
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
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
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
                  <Badge variant="secondary" className="ml-2">{data.total} orders</Badge>
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
                            <TableCell className="text-muted-foreground">{order.city || "-"}</TableCell>
                            <TableCell className="capitalize">{order.courierName || "-"}</TableCell>
                            <TableCell className="font-mono text-sm">{order.courierTracking || "-"}</TableCell>
                            <TableCell className="text-right font-medium">
                              {order.totalAmount ? `PKR ${Number(order.totalAmount).toLocaleString()}` : "-"}
                            </TableCell>
                            <TableCell data-testid={`badge-status-${order.id}`}>
                              {getWorkflowBadge(order.workflowStatus)}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {order.courierRawStatus || order.shipmentStatus || "-"}
                            </TableCell>
                            <TableCell data-testid={`text-remark-${order.id}`}>
                              {order.remark ? (
                                <div className="max-w-[200px]">
                                  <p className="text-sm text-muted-foreground truncate" title={order.remark}>{order.remark}</p>
                                </div>
                              ) : (
                                <span className="text-muted-foreground/50">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
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
                  <Pagination page={page} totalPages={totalPages} total={data?.total ?? 0} pageSize={pageSize}
                    onPrev={() => setPage(page - 1)} onNext={() => setPage(page + 1)}
                    prevTestId="button-prev-page" nextTestId="button-next-page" />
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

        {/* ====== SHIPPER ADVICE TAB ====== */}
        <TabsContent value="shipper-advice" className="space-y-6 mt-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <Select value={saCourierFilter} onValueChange={setSaCourierFilter}>
                  <SelectTrigger className="w-[160px]" data-testid="select-sa-courier">
                    <Truck className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Courier" />
                  </SelectTrigger>
                  <SelectContent>
                    {courierOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DateRangePicker
                  dateRange={saDateRange}
                  onDateRangeChange={setSaDateRange}
                />
              </div>
            </CardContent>
          </Card>

          {Object.keys(saTotals).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(saTotals).map(([courier, totals]) => (
                <Card key={courier}>
                  <CardContent className="p-4">
                    <h3 className="font-semibold capitalize mb-3" data-testid={`sa-courier-title-${courier}`}>{courier}</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Shipments</p>
                        <p className="font-bold text-lg" data-testid={`sa-count-${courier}`}>{totals.count}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Amount</p>
                        <p className="font-bold text-lg" data-testid={`sa-amount-${courier}`}>PKR {totals.totalAmount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">COD Collected</p>
                        <p className="font-bold text-green-600" data-testid={`sa-collected-${courier}`}>PKR {totals.codCollected.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">COD Pending</p>
                        <p className="font-bold text-amber-600" data-testid={`sa-pending-${courier}`}>PKR {totals.codPending.toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {saLoading ? (
            <Card>
              <CardContent className="p-4 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-32 flex-1" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : Object.keys(courierGroupedRows).length > 0 ? (
            Object.entries(courierGroupedRows).map(([courier, rows]) => (
              <Card key={courier}>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold flex items-center gap-2 capitalize">
                    <Truck className="w-5 h-5" />
                    {courier}
                    <Badge variant="secondary" className="ml-2">{rows.length} shipments</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>City</TableHead>
                          <TableHead>Tracking #</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>COD Status</TableHead>
                          <TableHead>Stage</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((row) => (
                          <TableRow key={row.id} data-testid={`sa-row-${row.id}`}>
                            <TableCell>
                              <Link href={`/orders/detail/${row.id}`} className="text-primary hover:underline font-medium" data-testid={`sa-link-${row.id}`}>
                                {row.orderNumber}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{row.customerName}</p>
                                <p className="text-xs text-muted-foreground">{row.customerPhone || "-"}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{row.city || "-"}</TableCell>
                            <TableCell className="font-mono text-sm">{row.courierTracking || "-"}</TableCell>
                            <TableCell className="text-right font-medium">
                              {row.totalAmount ? `PKR ${Number(row.totalAmount).toLocaleString()}` : "-"}
                            </TableCell>
                            <TableCell>
                              <Badge className={
                                row.codPaymentStatus === "PAID"
                                  ? "bg-green-500/10 text-green-600 border-green-500/20"
                                  : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                              }>
                                {row.codPaymentStatus || "Pending"}
                              </Badge>
                            </TableCell>
                            <TableCell>{getWorkflowBadge(row.workflowStatus)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                              {row.orderDate ? format(new Date(row.orderDate), "MMM dd, yyyy") : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="text-center py-16">
                <ClipboardList className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="font-medium mb-1">No shipper advice data</h3>
                <p className="text-sm text-muted-foreground">
                  Select a date range to view shipment advice grouped by courier
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ====== BOOKING LOGS TAB ====== */}
        <TabsContent value="booking-logs" className="space-y-6 mt-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
                <Select value={bkCourierFilter} onValueChange={(v) => { setBkCourierFilter(v); setBkPage(1); }}>
                  <SelectTrigger className="w-[160px]" data-testid="select-bk-courier">
                    <Truck className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Courier" />
                  </SelectTrigger>
                  <SelectContent>
                    {courierOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={bkStatusFilter} onValueChange={(v) => { setBkStatusFilter(v); setBkPage(1); }}>
                  <SelectTrigger className="w-[160px]" data-testid="select-bk-status">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {bookingStatusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DateRangePicker
                  dateRange={bkDateRange}
                  onDateRangeChange={(range) => { setBkDateRange(range); setBkPage(1); }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Booking Logs
                {bkData?.total !== undefined && (
                  <Badge variant="secondary" className="ml-2">{bkData.total} entries</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {bkLoading ? (
                <div className="p-4 space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-32 flex-1" />
                      <Skeleton className="h-6 w-24" />
                    </div>
                  ))}
                </div>
              ) : bookingLogs.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>City</TableHead>
                          <TableHead>Courier</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Tracking #</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Error</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bookingLogs.map((log) => (
                          <TableRow key={log.id} data-testid={`bk-row-${log.id}`}>
                            <TableCell>
                              <Link href={`/orders/detail/${log.orderId}`} className="text-primary hover:underline font-medium" data-testid={`bk-link-${log.id}`}>
                                {log.orderNumber || "-"}
                              </Link>
                            </TableCell>
                            <TableCell className="text-sm">{log.customerName || "-"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{log.city || "-"}</TableCell>
                            <TableCell className="capitalize text-sm">{log.courierName}</TableCell>
                            <TableCell data-testid={`bk-status-${log.id}`}>
                              {getBookingStatusBadge(log.status)}
                            </TableCell>
                            <TableCell className="font-mono text-sm" data-testid={`bk-tracking-${log.id}`}>
                              {log.trackingNumber || "-"}
                            </TableCell>
                            <TableCell className="text-right font-medium text-sm">
                              {log.totalAmount ? `PKR ${Number(log.totalAmount).toLocaleString()}` : "-"}
                            </TableCell>
                            <TableCell data-testid={`bk-error-${log.id}`}>
                              {log.errorMessage ? (
                                <div className="max-w-[250px] flex items-start gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                                  <p className="text-sm text-red-600 truncate" title={log.errorMessage}>{log.errorMessage}</p>
                                </div>
                              ) : (
                                <span className="text-muted-foreground/50">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                              {log.createdAt ? format(new Date(log.createdAt), "MMM dd, h:mm a") : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Pagination page={bkPage} totalPages={bkTotalPages} total={bkData?.total ?? 0} pageSize={100}
                    onPrev={() => setBkPage(bkPage - 1)} onNext={() => setBkPage(bkPage + 1)}
                    prevTestId="button-bk-prev" nextTestId="button-bk-next" />
                </>
              ) : (
                <div className="text-center py-16">
                  <BookOpen className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="font-medium mb-1">No booking logs found</h3>
                  <p className="text-sm text-muted-foreground">
                    Booking attempts will appear here when orders are booked with couriers
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== LOADSHEETS TAB ====== */}
        <TabsContent value="loadsheets" className="space-y-6 mt-6">
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
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                Loadsheet Generation & Logs
                {batchesData?.total !== undefined && (
                  <Badge variant="secondary" className="ml-2">{batchesData.total} batches</Badge>
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
                            <TableCell className="font-mono text-sm">{batch.id.substring(0, 8)}</TableCell>
                            <TableCell className="capitalize">{batch.courierName}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">{batch.batchType}</Badge>
                            </TableCell>
                            <TableCell className="text-center">{batch.totalSelectedCount ?? "-"}</TableCell>
                            <TableCell className="text-center text-green-600">{batch.successCount ?? "-"}</TableCell>
                            <TableCell className="text-center text-red-600">{batch.failedCount ?? "-"}</TableCell>
                            <TableCell>{getBatchStatusBadge(batch.status)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {batch.createdAt ? format(new Date(batch.createdAt), "MMM dd, h:mm a") : "-"}
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
                  <Pagination page={batchPage} totalPages={batchTotalPages} total={batchesData?.total ?? 0} pageSize={100}
                    onPrev={() => setBatchPage(batchPage - 1)} onNext={() => setBatchPage(batchPage + 1)}
                    prevTestId="button-batch-prev" nextTestId="button-batch-next" />
                </>
              ) : (
                <div className="text-center py-16">
                  <FileSpreadsheet className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="font-medium mb-1">No loadsheets found</h3>
                  <p className="text-sm text-muted-foreground">
                    Loadsheets are generated when orders are booked with couriers in bulk
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedBatchId} onOpenChange={(open) => { if (!open) setSelectedBatchId(null); }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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
            <div className="space-y-4 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24 flex-1" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : batchDetailData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Courier</p>
                  <p className="font-medium capitalize">{batchDetailData.batch.courierName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  {getBatchStatusBadge(batchDetailData.batch.status)}
                </div>
                <div>
                  <p className="text-muted-foreground">Success / Failed</p>
                  <p className="font-medium">
                    <span className="text-green-600">{batchDetailData.batch.successCount ?? 0}</span>
                    {" / "}
                    <span className="text-red-600">{batchDetailData.batch.failedCount ?? 0}</span>
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {batchDetailData.batch.createdAt
                      ? format(new Date(batchDetailData.batch.createdAt), "MMM dd, h:mm a")
                      : "-"}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tracking #</TableHead>
                      <TableHead className="text-right">COD</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchDetailData.items.map((item) => (
                      <TableRow key={item.id} data-testid={`batch-item-${item.id}`}>
                        <TableCell>
                          <Link href={`/orders/detail/${item.orderId}`} className="text-primary hover:underline font-medium">
                            {item.orderNumber || "-"}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">{item.consigneeName || "-"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{item.consigneeCity || "-"}</TableCell>
                        <TableCell>
                          <Badge className={
                            item.bookingStatus === "BOOKED"
                              ? "bg-green-500/10 text-green-600 border-green-500/20"
                              : item.bookingStatus === "FAILED"
                              ? "bg-red-500/10 text-red-600 border-red-500/20"
                              : "bg-muted text-muted-foreground"
                          }>
                            {item.bookingStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{item.trackingNumber || "-"}</TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          {item.codAmount ? `PKR ${Number(item.codAmount).toLocaleString()}` : "-"}
                        </TableCell>
                        <TableCell>
                          {item.bookingError ? (
                            <div className="max-w-[200px]">
                              <p className="text-sm text-red-600 truncate" title={item.bookingError}>{item.bookingError}</p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.slipUrl && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.open(item.slipUrl!, "_blank")}
                              title="View Airway Bill"
                            >
                              <Printer className="w-4 h-4" />
                            </Button>
                          )}
                          {item.printRecordId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.open(`/api/print/shipment/${item.printRecordId}.pdf`, "_blank")}
                              title="Download Print Record"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
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
