import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Package,
  Search,
  Filter,
  MoreVertical,
  Eye,
  Truck,
  MessageSquare,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Phone,
  MapPin,
  Tag,
  AlertCircle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Order } from "@shared/schema";
import { Link } from "wouter";
import { format } from "date-fns";

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "unfulfilled", label: "Unfulfilled" },
  { value: "booked", label: "Booked" },
  { value: "dispatched", label: "Dispatched" },
  { value: "arrived", label: "Arrived at Destination" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "failed", label: "Delivery Failed" },
  { value: "reattempt", label: "Reattempt" },
  { value: "returned", label: "Returned" },
];

const monthOptions = [
  { value: "all", label: "All Months" },
  { value: "current", label: "Current Month" },
  { value: "last", label: "Last Month" },
  { value: "2months", label: "Last 2 Months" },
  { value: "3months", label: "Last 3 Months" },
];

const courierOptions = [
  { value: "all", label: "All Couriers" },
  { value: "leopards", label: "Leopards" },
  { value: "postex", label: "PostEx" },
  { value: "tcs", label: "TCS" },
];

function getShipmentStatusBadge(status: string | null, hasCourierTracking: boolean) {
  const statusConfig: Record<string, { bg: string; label: string }> = {
    unfulfilled: { bg: "bg-slate-500/10 text-slate-600 border-slate-500/20", label: "Unfulfilled" },
    pending: { bg: "bg-gray-500/10 text-gray-600 border-gray-500/20", label: "Pending" },
    booked: { bg: "bg-blue-500/10 text-blue-600 border-blue-500/20", label: "Booked" },
    dispatched: { bg: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20", label: "Dispatched" },
    arrived: { bg: "bg-purple-500/10 text-purple-600 border-purple-500/20", label: "Arrived" },
    out_for_delivery: { bg: "bg-amber-500/10 text-amber-600 border-amber-500/20", label: "Out for Delivery" },
    delivered: { bg: "bg-green-500/10 text-green-600 border-green-500/20", label: "Delivered" },
    failed: { bg: "bg-red-500/10 text-red-600 border-red-500/20", label: "Failed" },
    reattempt: { bg: "bg-orange-500/10 text-orange-600 border-orange-500/20", label: "Reattempt" },
    returned: { bg: "bg-red-500/10 text-red-600 border-red-500/20", label: "Returned" },
  };

  // If no courier tracking, show "Unfulfilled" regardless of shipmentStatus
  if (!hasCourierTracking) {
    return <Badge className={statusConfig.unfulfilled.bg}>{statusConfig.unfulfilled.label}</Badge>;
  }

  // For tracked orders, show actual status or "Pending" if status unknown
  const config = statusConfig[status || "pending"] || statusConfig.pending;
  return <Badge className={config.bg}>{config.label}</Badge>;
}

function getPaymentBadge(method: string | null) {
  if (method === "cod") {
    return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">COD</Badge>;
  }
  return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Prepaid</Badge>;
}

interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
}

export default function Orders() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [remarkDialogOpen, setRemarkDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [remarkValue, setRemarkValue] = useState("");
  const isDemoData = false;

  const { data, isLoading } = useQuery<OrdersResponse>({
    queryKey: ["/api/orders", { search, status: statusFilter, courier: courierFilter, month: monthFilter, page, pageSize }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (courierFilter && courierFilter !== "all") params.set("courier", courierFilter);
      if (monthFilter && monthFilter !== "all") params.set("month", monthFilter);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/orders?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const syncOrdersMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/integrations/shopify/sync");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Sync Complete",
        description: `Synced ${data.synced} new orders (${data.total} total from Shopify).`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateRemarkMutation = useMutation({
    mutationFn: async ({ orderId, value }: { orderId: string; value: string }) => {
      const response = await apiRequest("PATCH", `/api/orders/${orderId}/remark`, { value });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Remark Updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setRemarkDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const orders = data?.orders || [];
  const totalPages = Math.ceil((data?.total || 0) / pageSize);
  
  // Check if customer data is missing (shows warning banner)
  const missingCustomerData = orders.length > 0 && orders.filter(o => o.customerName === "Unknown").length > orders.length * 0.5;

  // Group orders by month
  const ordersByMonth = orders.reduce((acc, order) => {
    const date = order.orderDate ? new Date(order.orderDate) : new Date();
    const monthKey = format(date, "MMMM yyyy");
    if (!acc[monthKey]) {
      acc[monthKey] = [];
    }
    acc[monthKey].push(order);
    return acc;
  }, {} as Record<string, Order[]>);

  const handleExport = () => {
    const getExportStatus = (order: Order) => {
      // Match UI logic: unfulfilled if no courier tracking, otherwise actual status
      if (!order.courierTracking) return "Unfulfilled";
      return order.shipmentStatus || "Pending";
    };
    const csv = orders.map((o) => 
      `${o.orderNumber},${o.customerName},${o.customerPhone || ""},${o.city || ""},${o.shippingAddress || ""},${o.totalQuantity || 1},${o.totalAmount},${(o.tags || []).join(";")},${getExportStatus(o)},${o.remark || ""}`
    ).join("\n");
    const header = "Order ID,Customer Name,Phone,City,Address,Qty,Amount,Tags,Status,Remark\n";
    const blob = new Blob([header + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    toast({ title: "Export Complete", description: `Exported ${orders.length} orders to CSV.` });
  };

  const openRemarkDialog = (order: Order) => {
    setSelectedOrder(order);
    setRemarkValue(order.remark || "");
    setRemarkDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Warning Banner for Missing Customer Data */}
      {missingCustomerData && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Customer data is missing from your orders
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Your Shopify access token may not have the required permissions to access customer information (names, addresses, phones). 
                To fix this, create a new Custom App in Shopify Admin with the <strong>read_customers</strong> scope enabled, 
                then reconnect your store in{" "}
                <Link href="/integrations" className="underline font-medium">Integrations</Link>.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-muted-foreground">Complete order management with customer data and tracking.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isDemoData && (
             <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
               Demo Data Active
             </Badge>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => syncOrdersMutation.mutate()}
            disabled={syncOrdersMutation.isPending}
            data-testid="button-sync-orders"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncOrdersMutation.isPending ? "animate-spin" : ""}`} />
            {syncOrdersMutation.isPending ? "Syncing..." : "Sync All Orders"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-orders">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by order number, customer name, phone, or city..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search-orders"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-month-filter">
                  <Calendar className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
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
                <SelectTrigger className="w-[160px]" data-testid="select-courier-filter">
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

      {/* Orders Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Package className="w-5 h-5" />
            Orders List
            {data?.total !== undefined && (
              <Badge variant="secondary" className="ml-2">
                {data.total.toLocaleString()} orders
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-32 flex-1" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : orders.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[80px] font-semibold">Status</TableHead>
                      <TableHead className="w-[100px] font-semibold">Order ID</TableHead>
                      <TableHead className="w-[100px] font-semibold">City</TableHead>
                      <TableHead className="font-semibold">Customer Name</TableHead>
                      <TableHead className="font-semibold">Phone</TableHead>
                      <TableHead className="font-semibold">Address</TableHead>
                      <TableHead className="w-[60px] text-center font-semibold">Qty</TableHead>
                      <TableHead className="w-[100px] text-right font-semibold">Amount</TableHead>
                      <TableHead className="font-semibold">Tags</TableHead>
                      <TableHead className="w-[200px] font-semibold">Remark</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(ordersByMonth).map(([month, monthOrders]) => (
                      <>
                        <TableRow key={`month-${month}`} className="bg-muted/30">
                          <TableCell colSpan={11} className="py-2">
                            <span className="font-semibold text-sm flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              {month} ({monthOrders.length} orders)
                            </span>
                          </TableCell>
                        </TableRow>
                        {monthOrders.map((order) => (
                          <TableRow key={order.id} className="hover-elevate" data-testid={`table-row-order-${order.id}`}>
                            <TableCell>
                              {getShipmentStatusBadge(order.shipmentStatus, !!order.courierTracking)}
                            </TableCell>
                            <TableCell className="font-medium">
                              <Link href={`/orders/${order.id}`} className="hover:text-primary hover:underline">
                                {order.orderNumber}
                              </Link>
                            </TableCell>
                            <TableCell className="text-sm">
                              {order.city || <span className="text-muted-foreground">-</span>}
                            </TableCell>
                            <TableCell>
                              <span className="font-medium text-sm">{order.customerName}</span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {order.customerPhone || <span className="text-muted-foreground">-</span>}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={order.shippingAddress || ""}>
                              {order.shippingAddress || "-"}
                            </TableCell>
                            <TableCell className="text-center font-medium">
                              {order.totalQuantity || 1}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              PKR {Number(order.totalAmount).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1 max-w-[150px]">
                                {(order.tags || []).slice(0, 3).map((tag, i) => (
                                  <Badge key={i} variant="outline" className="text-xs px-1 py-0">
                                    {tag}
                                  </Badge>
                                ))}
                                {(order.tags || []).length > 3 && (
                                  <Badge variant="outline" className="text-xs px-1 py-0">
                                    +{(order.tags || []).length - 3}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <button 
                                onClick={() => openRemarkDialog(order)}
                                className="text-xs text-left hover:bg-muted p-1 rounded cursor-pointer w-full min-h-[24px] truncate"
                                title={order.remark || "Add remark"}
                                data-testid={`button-remark-${order.id}`}
                              >
                                {order.remark || <span className="text-muted-foreground italic">Add...</span>}
                              </button>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" data-testid={`button-order-menu-${order.id}`}>
                                    <MoreVertical className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem asChild>
                                    <Link href={`/orders/${order.id}`} className="cursor-pointer">
                                      <Eye className="w-4 h-4 mr-2" />
                                      View Details
                                    </Link>
                                  </DropdownMenuItem>
                                  {order.courierTracking && (
                                    <DropdownMenuItem>
                                      <Truck className="w-4 h-4 mr-2" />
                                      Track: {order.courierName || "Courier"}
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data?.total ?? 0)} of {data?.total?.toLocaleString()} orders
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
                      Prev
                    </Button>
                    <span className="text-sm text-muted-foreground px-2">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= totalPages}
                      data-testid="button-next-page"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <Package className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
              <h3 className="text-lg font-medium mb-1">No orders found</h3>
              <p className="text-muted-foreground mb-4">
                {search || statusFilter !== "all" 
                  ? "Try adjusting your filters" 
                  : "Connect your Shopify store and sync orders to get started"}
              </p>
              <Button onClick={() => syncOrdersMutation.mutate()} disabled={syncOrdersMutation.isPending}>
                <RefreshCw className={`w-4 h-4 mr-2 ${syncOrdersMutation.isPending ? "animate-spin" : ""}`} />
                Sync Orders from Shopify
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remark Dialog */}
      <Dialog open={remarkDialogOpen} onOpenChange={setRemarkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Remark - {selectedOrder?.orderNumber}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={remarkValue}
            onChange={(e) => setRemarkValue(e.target.value)}
            placeholder="Enter your remark..."
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemarkDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => selectedOrder && updateRemarkMutation.mutate({ 
                orderId: selectedOrder.id, 
                value: remarkValue 
              })}
              disabled={updateRemarkMutation.isPending}
              data-testid="button-save-remark"
            >
              {updateRemarkMutation.isPending ? "Saving..." : "Save Remark"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
