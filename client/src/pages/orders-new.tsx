import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Order } from "@shared/schema";
import { Link } from "wouter";
import { format } from "date-fns";

export default function OrdersNew() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const pageSize = 20;

  const { data, isLoading } = useQuery<{ orders: Order[]; total: number }>({
    queryKey: ["/api/orders", { workflowStatus: "NEW", search, page, pageSize }],
    queryFn: async () => {
      const params = new URLSearchParams({ workflowStatus: "NEW", page: String(page), pageSize: String(pageSize) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/orders?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (orderId: string) => {
      await apiRequest("POST", `/api/orders/${orderId}/confirm`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/counts"] });
      toast({ title: "Order confirmed", description: "Moved to Ready to Ship" });
    },
    onError: () => {
      toast({ title: "Failed to confirm order", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      await apiRequest("POST", `/api/orders/${orderId}/cancel`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/counts"] });
      setCancelDialogOpen(false);
      setCancelReason("");
      setCancelOrderId(null);
      toast({ title: "Order cancelled", description: "Moved to Cancelled" });
    },
    onError: () => {
      toast({ title: "Failed to cancel order", variant: "destructive" });
    },
  });

  const orders = data?.orders || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const openCancelDialog = (orderId: string) => {
    setCancelOrderId(orderId);
    setCancelReason("");
    setCancelDialogOpen(true);
  };

  return (
    <div className="space-y-4" data-testid="page-orders-new">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Inbox className="w-6 h-6" />
            New Orders
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} order{total !== 1 ? "s" : ""} waiting for action
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Card className="p-8 text-center">
          <Inbox className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground" data-testid="text-empty-state">No new orders to process</p>
        </Card>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-[1fr_1fr_1fr_0.7fr_0.5fr_auto] gap-3 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span>Order</span>
            <span>Customer</span>
            <span>Items</span>
            <span>City</span>
            <span>COD</span>
            <span>Actions</span>
          </div>
          {orders.map((order) => (
            <Card key={order.id} className="grid grid-cols-[1fr_1fr_1fr_0.7fr_0.5fr_auto] gap-3 items-center px-3 py-3" data-testid={`row-order-${order.id}`}>
              <div className="min-w-0">
                <Link href={`/orders/${order.id}`}>
                  <span className="font-medium text-sm hover:underline cursor-pointer" data-testid={`text-order-number-${order.id}`}>{order.orderNumber}</span>
                </Link>
                <p className="text-xs text-muted-foreground">
                  {order.orderDate ? format(new Date(order.orderDate), "dd MMM yyyy") : "—"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-sm truncate" data-testid={`text-customer-${order.id}`}>{order.customerName}</p>
                <p className="text-xs text-muted-foreground truncate">{order.customerPhone || "—"}</p>
              </div>
              <div className="min-w-0">
                <p className="text-sm truncate" title={order.itemSummary || undefined}>{order.itemSummary || "—"}</p>
                <p className="text-xs text-muted-foreground">Qty: {order.totalQuantity || 1}</p>
              </div>
              <div className="min-w-0">
                <p className="text-sm truncate">{order.city || "—"}</p>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium" data-testid={`text-amount-${order.id}`}>
                  {order.currency || "PKR"} {Number(order.totalAmount).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  onClick={() => confirmMutation.mutate(order.id)}
                  disabled={confirmMutation.isPending}
                  data-testid={`button-confirm-${order.id}`}
                >
                  {confirmMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span className="ml-1 hidden sm:inline">Confirm</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openCancelDialog(order.id)}
                  data-testid={`button-cancel-${order.id}`}
                >
                  <XCircle className="w-4 h-4" />
                  <span className="ml-1 hidden sm:inline">Cancel</span>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} orders)
          </p>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} data-testid="button-prev-page">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} data-testid="button-next-page">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Please provide a reason for cancellation:</p>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Enter cancel reason..."
              data-testid="input-cancel-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)} data-testid="button-cancel-dialog-close">
              Close
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelOrderId && cancelMutation.mutate({ orderId: cancelOrderId, reason: cancelReason })}
              disabled={!cancelReason.trim() || cancelMutation.isPending}
              data-testid="button-cancel-confirm"
            >
              {cancelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Cancel Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
