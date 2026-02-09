import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Order } from "@shared/schema";
import { Link } from "wouter";
import { format } from "date-fns";

export default function OrdersCancelled() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useQuery<{ orders: Order[]; total: number }>({
    queryKey: ["/api/orders", { workflowStatus: "CANCELLED", search, page, pageSize }],
    queryFn: async () => {
      const params = new URLSearchParams({ workflowStatus: "CANCELLED", page: String(page), pageSize: String(pageSize) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/orders?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
  });

  const orders = data?.orders || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4" data-testid="page-orders-cancelled">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <XCircle className="w-6 h-6" />
            Cancelled
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} cancelled order{total !== 1 ? "s" : ""}
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
          <XCircle className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground" data-testid="text-empty-state">No cancelled orders</p>
        </Card>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-[1fr_1fr_0.7fr_0.5fr_1.5fr] gap-3 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span>Order</span>
            <span>Customer</span>
            <span>City</span>
            <span>COD</span>
            <span>Cancel Reason</span>
          </div>
          {orders.map((order) => (
            <Card key={order.id} className="grid grid-cols-[1fr_1fr_0.7fr_0.5fr_1.5fr] gap-3 items-center px-3 py-3" data-testid={`row-order-${order.id}`}>
              <div className="min-w-0">
                <Link href={`/orders/${order.id}`}>
                  <span className="font-medium text-sm hover:underline cursor-pointer" data-testid={`text-order-number-${order.id}`}>{order.orderNumber}</span>
                </Link>
                <p className="text-xs text-muted-foreground">
                  {order.orderDate ? format(new Date(order.orderDate), "dd MMM yyyy") : "—"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-sm truncate">{order.customerName}</p>
                <p className="text-xs text-muted-foreground truncate">{order.customerPhone || "—"}</p>
              </div>
              <div className="min-w-0">
                <p className="text-sm truncate">{order.city || "—"}</p>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {order.currency || "PKR"} {Number(order.totalAmount).toLocaleString()}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground truncate" title={order.cancelReason || undefined}>
                  {order.cancelReason || "—"}
                </p>
                {order.cancelledAt && (
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(order.cancelledAt), "dd MMM yyyy")}
                  </p>
                )}
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
    </div>
  );
}
