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
  Truck,
  Search,
  Filter,
  RefreshCw,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Printer,
  Eye,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Shipment, Order } from "@shared/schema";
import { Link } from "wouter";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "BOOKED", label: "Booked" },
  { value: "PICKED_UP", label: "Picked Up" },
  { value: "ARRIVED_AT_ORIGIN", label: "At Origin" },
  { value: "IN_TRANSIT", label: "In Transit" },
  { value: "ARRIVED_AT_DESTINATION", label: "At Destination" },
  { value: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
  { value: "DELIVERY_ATTEMPTED", label: "Attempted" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "DELIVERY_FAILED", label: "Failed" },
  { value: "RETURNED_TO_SHIPPER", label: "Returned" },
  { value: "RETURN_IN_TRANSIT", label: "Return in Transit" },
  { value: "CANCELLED", label: "Cancelled" },
];

const courierOptions = [
  { value: "all", label: "All Couriers" },
  { value: "leopards", label: "Leopards" },
  { value: "postex", label: "PostEx" },
  { value: "tcs", label: "TCS" },
];

const SHIPMENT_STATUS_COLORS: Record<string, { color: string; icon: React.ElementType }> = {
  'BOOKED': { color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Package },
  'PICKED_UP': { color: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20", icon: Package },
  'ARRIVED_AT_ORIGIN': { color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: Package },
  'IN_TRANSIT': { color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Truck },
  'ARRIVED_AT_DESTINATION': { color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: Truck },
  'OUT_FOR_DELIVERY': { color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Truck },
  'DELIVERY_ATTEMPTED': { color: "bg-orange-500/10 text-orange-600 border-orange-500/20", icon: AlertCircle },
  'DELIVERED': { color: "bg-green-500/10 text-green-600 border-green-500/20", icon: CheckCircle2 },
  'DELIVERY_FAILED': { color: "bg-red-500/10 text-red-600 border-red-500/20", icon: AlertCircle },
  'RETURNED_TO_SHIPPER': { color: "bg-red-500/10 text-red-600 border-red-500/20", icon: AlertCircle },
  'RETURN_IN_TRANSIT': { color: "bg-red-500/10 text-red-600 border-red-500/20", icon: AlertCircle },
  'CANCELLED': { color: "bg-red-500/10 text-red-600 border-red-500/20", icon: AlertCircle },
};

const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  'BOOKED': 'Booked', 'PICKED_UP': 'Picked Up', 'ARRIVED_AT_ORIGIN': 'At Origin',
  'IN_TRANSIT': 'In Transit', 'ARRIVED_AT_DESTINATION': 'At Destination',
  'OUT_FOR_DELIVERY': 'Out for Delivery', 'DELIVERY_ATTEMPTED': 'Attempted',
  'DELIVERED': 'Delivered', 'DELIVERY_FAILED': 'Failed',
  'RETURNED_TO_SHIPPER': 'Returned', 'RETURN_IN_TRANSIT': 'Return in Transit',
  'CANCELLED': 'Cancelled',
};

const BATCH_STATUS_COLORS: Record<string, string> = {
  'SUCCESS': "bg-green-500/10 text-green-600 border-green-500/20",
  'PARTIAL_SUCCESS': "bg-amber-500/10 text-amber-600 border-amber-500/20",
  'FAILED': "bg-red-500/10 text-red-600 border-red-500/20",
  'CREATED': "bg-blue-500/10 text-blue-600 border-blue-500/20",
};

function getStatusBadge(status: string) {
  const config = SHIPMENT_STATUS_COLORS[status] || { color: "bg-gray-500/10 text-gray-600", icon: Clock };
  const label = SHIPMENT_STATUS_LABELS[status] || status;

  return <Badge className={config.color}>{label}</Badge>;
}

function getBatchStatusBadge(status: string) {
  const color = BATCH_STATUS_COLORS[status] || "bg-gray-500/10 text-gray-600 border-gray-500/20";
  const label = status.replace(/_/g, " ");
  return <Badge className={color}>{label}</Badge>;
}

interface ShipmentWithOrder extends Shipment {
  order: Order;
}

interface ShipmentsResponse {
  shipments: ShipmentWithOrder[];
  total: number;
  page: number;
  pageSize: number;
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
  const [activeTab, setActiveTab] = useState<string>("shipments");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [batchCourierFilter, setBatchCourierFilter] = useState("all");
  const [batchPage, setBatchPage] = useState(1);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const queryParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(search && { search }),
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(courierFilter !== "all" && { courier: courierFilter }),
  });

  const { data, isLoading, refetch } = useQuery<ShipmentsResponse>({
    queryKey: ["/api/shipments", queryParams.toString()],
    refetchInterval: 30000,
  });

  const shipments = data?.shipments ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);

  const bookedCount = shipments.filter(s => s.status === "BOOKED").length;
  const inTransitCount = shipments.filter(s => ["IN_TRANSIT", "PICKED_UP", "ARRIVED_AT_ORIGIN", "ARRIVED_AT_DESTINATION"].includes(s.status || "")).length;
  const outForDeliveryCount = shipments.filter(s => s.status === "OUT_FOR_DELIVERY").length;
  const deliveredCount = shipments.filter(s => s.status === "DELIVERED").length;
  const issuesCount = shipments.filter(s => ["DELIVERY_FAILED", "DELIVERY_ATTEMPTED", "RETURNED_TO_SHIPPER", "RETURN_IN_TRANSIT", "CANCELLED"].includes(s.status || "")).length;

  const batchQueryParams = new URLSearchParams({
    page: batchPage.toString(),
    pageSize: "20",
    ...(batchCourierFilter !== "all" && { courier: batchCourierFilter }),
  });

  const { data: batchesData, isLoading: batchesLoading } = useQuery<BatchesResponse>({
    queryKey: ["/api/shipment-batches", batchQueryParams.toString()],
    enabled: activeTab === "batches",
  });

  const batches = batchesData?.batches ?? [];
  const batchTotalPages = Math.ceil((batchesData?.total ?? 0) / 20);

  const { data: batchDetailData, isLoading: batchDetailLoading } = useQuery<BatchDetailResponse>({
    queryKey: ["/api/shipment-batches", selectedBatchId],
    enabled: !!selectedBatchId,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Shipments</h1>
          <p className="text-muted-foreground">Track and manage all shipments across couriers.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-sync-shipments">
          <RefreshCw className="w-4 h-4 mr-2" />
          Sync Tracking
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Package className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-booked">{bookedCount}</p>
                  <p className="text-xs text-muted-foreground">Booked</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-in-transit">{inTransitCount}</p>
                  <p className="text-xs text-muted-foreground">In Transit</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-out-for-delivery">{outForDeliveryCount}</p>
                  <p className="text-xs text-muted-foreground">Out for Delivery</p>
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
            <Card className="col-span-2 lg:col-span-1">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-issues">{issuesCount}</p>
                  <p className="text-xs text-muted-foreground">Issues</p>
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
                    placeholder="Search by tracking number, order, or customer..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-shipments"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]" data-testid="select-shipment-status">
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
                  <Select value={courierFilter} onValueChange={setCourierFilter}>
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
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Truck className="w-5 h-5" />
                Shipments List
                {data?.total !== undefined && (
                  <Badge variant="secondary" className="ml-2">
                    {data.total} shipments
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
              ) : shipments.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tracking #</TableHead>
                          <TableHead>Order</TableHead>
                          <TableHead>Courier</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead className="text-right">COD</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Last Update</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shipments.map((shipment) => (
                          <TableRow key={shipment.id} className="hover-elevate cursor-pointer" data-testid={`shipment-row-${shipment.id}`}>
                            <TableCell className="font-mono text-sm">
                              {shipment.trackingNumber || "-"}
                            </TableCell>
                            <TableCell>
                              <Link href={`/orders/detail/${shipment.orderId}`} className="text-primary hover:underline">
                                #{shipment.order?.orderNumber}
                              </Link>
                            </TableCell>
                            <TableCell className="capitalize">{shipment.courierName}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{shipment.order?.customerName}</p>
                                <p className="text-xs text-muted-foreground">{shipment.order?.customerPhone}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{shipment.order?.city}</TableCell>
                            <TableCell className="text-right font-medium">
                              {shipment.codAmount ? `PKR ${Number(shipment.codAmount).toLocaleString()}` : "-"}
                            </TableCell>
                            <TableCell>{getStatusBadge(shipment.status || "booked")}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {shipment.lastStatusUpdate
                                ? format(new Date(shipment.lastStatusUpdate), "MMM dd, h:mm a")
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
                        Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data?.total ?? 0)} of {data?.total} shipments
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
                  <Truck className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="font-medium mb-1">No shipments found</h3>
                  <p className="text-sm text-muted-foreground">
                    {search || statusFilter !== "all" || courierFilter !== "all"
                      ? "Try adjusting your filters"
                      : "Shipments will appear here once orders are assigned to couriers"}
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
                                {batch.pdfBatchPath && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => window.open(`/api/print/batch/${batch.id}.pdf`, "_blank")}
                                    data-testid={`button-view-pdf-${batch.id}`}
                                  >
                                    <FileText className="w-4 h-4" />
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
                    {batchCourierFilter !== "all"
                      ? "Try adjusting your filter"
                      : "Batch logs will appear here after booking shipments"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedBatchId} onOpenChange={(open) => { if (!open) setSelectedBatchId(null); }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" data-testid="dialog-batch-details">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-4 flex-wrap">
              <span className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Batch Details
              </span>
              {batchDetailData?.batch?.pdfBatchPath && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/api/print/batch/${selectedBatchId}.pdf`, "_blank")}
                  data-testid="button-download-batch-pdf"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Download PDF
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          {batchDetailLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : batchDetailData ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Batch ID</p>
                  <p className="font-mono text-sm" data-testid="text-batch-id">{batchDetailData.batch.id.substring(0, 8)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Courier</p>
                  <p className="capitalize text-sm" data-testid="text-batch-courier">{batchDetailData.batch.courierName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div data-testid="text-batch-status">{getBatchStatusBadge(batchDetailData.batch.status)}</div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Counts</p>
                  <p className="text-sm" data-testid="text-batch-counts">
                    <span className="text-muted-foreground">{batchDetailData.batch.totalSelectedCount ?? 0} total</span>
                    {" / "}
                    <span className="text-green-600">{batchDetailData.batch.successCount ?? 0} ok</span>
                    {" / "}
                    <span className="text-red-600">{batchDetailData.batch.failedCount ?? 0} fail</span>
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Tracking #</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead className="text-right">COD</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchDetailData.items.map((item) => (
                      <TableRow key={item.id} data-testid={`batch-item-row-${item.id}`}>
                        <TableCell className="font-mono text-sm">
                          {item.orderNumber || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {item.trackingNumber || "-"}
                        </TableCell>
                        <TableCell>{item.consigneeName || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{item.consigneeCity || "-"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {item.codAmount ? `PKR ${Number(item.codAmount).toLocaleString()}` : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            item.bookingStatus === "SUCCESS"
                              ? "bg-green-500/10 text-green-600 border-green-500/20"
                              : item.bookingStatus === "FAILED"
                                ? "bg-red-500/10 text-red-600 border-red-500/20"
                                : "bg-gray-500/10 text-gray-600 border-gray-500/20"
                          }>
                            {item.bookingStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.bookingError ? (
                            <span className="text-xs text-red-600 max-w-[200px] truncate block" title={item.bookingError}>
                              {item.bookingError}
                            </span>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          {item.bookingStatus === "SUCCESS" && item.trackingNumber && item.slipUrl && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.open(item.slipUrl!, "_blank")}
                              data-testid={`button-print-slip-${item.id}`}
                            >
                              <Printer className="w-4 h-4" />
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
