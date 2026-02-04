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
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Order } from "@shared/schema";
import { Link } from "wouter";
import { format } from "date-fns";

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "returned", label: "Returned" },
];

const courierOptions = [
  { value: "all", label: "All Couriers" },
  { value: "leopards", label: "Leopards" },
  { value: "postex", label: "PostEx" },
  { value: "tcs", label: "TCS" },
];

function getStatusBadge(status: string) {
  const statusConfig: Record<string, string> = {
    pending: "bg-gray-500/10 text-gray-600 border-gray-500/20",
    processing: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    shipped: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    in_transit: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    out_for_delivery: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    delivered: "bg-green-500/10 text-green-600 border-green-500/20",
    cancelled: "bg-red-500/10 text-red-600 border-red-500/20",
    returned: "bg-red-500/10 text-red-600 border-red-500/20",
  };

  const color = statusConfig[status] || statusConfig.pending;
  const displayStatus = status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  return <Badge className={color}>{displayStatus}</Badge>;
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
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const queryParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(search && { search }),
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(courierFilter !== "all" && { courier: courierFilter }),
  });

  const { data, isLoading, refetch } = useQuery<OrdersResponse>({
    queryKey: ["/api/orders", search, statusFilter, courierFilter, page],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/orders?${queryParams.toString()}`);
      return res.json();
    },
    refetchInterval: 5000, // Faster refresh for sync feedback
  });

  const queryClient = useQueryClient();

  // Sync orders from Shopify
  const syncOrdersMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/shopify/sync", {});
      return res.json() as Promise<{ synced: number; message: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({
        title: "Orders synced",
        description: data.message || `Successfully synced ${data.synced} orders`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync failed",
        description: error?.message || "Could not sync orders. Please connect Shopify first.",
        variant: "destructive",
      });
    },
  });

  const orders = data?.orders ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);

  const handleExport = () => {
    if (orders.length === 0) {
      toast({
        title: "No orders to export",
        description: "There are no orders matching your current filters.",
        variant: "destructive",
      });
      return;
    }

    const headers = ["Order #", "Customer", "City", "Total", "Status", "Courier", "Created"];
    const csvContent = [
      headers.join(","),
      ...orders.map((order) =>
        [
          order.orderNumber,
          `"${order.customerName}"`,
          `"${order.city}"`,
          order.totalAmount,
          order.orderStatus,
          "",
          new Date(order.createdAt!).toLocaleDateString(),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export complete",
      description: `Exported ${orders.length} orders to CSV.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-muted-foreground">Manage and track all your orders in one place.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => syncOrdersMutation.mutate()}
            disabled={syncOrdersMutation.isPending}
            data-testid="button-sync-orders"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncOrdersMutation.isPending ? "animate-spin" : ""}`} />
            {syncOrdersMutation.isPending ? "Syncing..." : "Sync Orders"}
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
                placeholder="Search by order number, customer, or city..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search-orders"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
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
                    <TableRow>
                      <TableHead className="w-[120px]">Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id} className="hover-elevate cursor-pointer" data-testid={`table-row-order-${order.id}`}>
                        <TableCell className="font-medium">
                          <Link href={`/orders/${order.id}`} className="hover:text-primary">
                            #{order.orderNumber}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{order.customerName}</p>
                            <p className="text-xs text-muted-foreground">{order.customerPhone}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{order.city}</TableCell>
                        <TableCell className="text-right font-medium">
                          PKR {Number(order.totalAmount).toLocaleString()}
                        </TableCell>
                        <TableCell>{getPaymentBadge(order.paymentMethod)}</TableCell>
                        <TableCell>{getStatusBadge(order.orderStatus || "pending")}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {order.orderDate ? format(new Date(order.orderDate), "MMM dd, yyyy") : "-"}
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
                              <DropdownMenuItem>
                                <Truck className="w-4 h-4 mr-2" />
                                Assign Courier
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <MessageSquare className="w-4 h-4 mr-2" />
                                Add Remark
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
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
              <Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="font-medium mb-1">No orders found</h3>
              <p className="text-sm text-muted-foreground">
                {search || statusFilter !== "all" || courierFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Orders from your Shopify store will appear here"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
