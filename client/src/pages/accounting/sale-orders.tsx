import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Eye } from "lucide-react";

interface SaleOrder {
  id: string;
  customerId: string | null;
  customerName: string | null;
  status: string;
  total: string;
  paidNow: string;
  remaining: string;
  paymentMode: string;
  referenceId: string | null;
  date: string;
  itemCount: number;
  itemsSummary: string;
}

interface Party {
  id: string;
  name: string;
  type: string;
}

function formatPKR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs. 0";
  return `Rs. ${num.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function statusBadge(status: string) {
  switch (status) {
    case "DRAFT":
      return <Badge variant="outline" className="text-yellow-600 border-yellow-600">Draft</Badge>;
    case "COMPLETED":
      return <Badge variant="outline" className="text-green-600 border-green-600">Completed</Badge>;
    case "REVERSED":
      return <Badge variant="outline" className="text-red-600 border-red-600">Reversed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function SaleOrdersPage() {
  const [, navigate] = useLocation();
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [filterCustomer, setFilterCustomer] = useState("__all__");

  const queryParams = new URLSearchParams();
  if (filterStatus !== "__all__") queryParams.set("status", filterStatus);
  if (filterCustomer !== "__all__") queryParams.set("customerId", filterCustomer);
  const qs = queryParams.toString();
  const queryUrl = `/api/accounting/sales${qs ? `?${qs}` : ""}`;

  const { data: salesList = [], isLoading } = useQuery<SaleOrder[]>({
    queryKey: [queryUrl],
  });

  const { data: customers = [] } = useQuery<Party[]>({
    queryKey: ["/api/accounting/parties?type=customer"],
  });

  function handleViewSale(saleId: string) {
    navigate(`/accounting/sales?edit=${saleId}`);
  }

  return (
    <div className="space-y-6" data-testid="sale-orders-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Sale Orders</h1>
        <p className="text-muted-foreground mt-1">View and manage all sale records</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Status</label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]" data-testid="filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="REVERSED">Reversed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Customer</label>
          <Select value={filterCustomer} onValueChange={setFilterCustomer}>
            <SelectTrigger className="w-[200px]" data-testid="filter-customer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Customers</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : salesList.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground" data-testid="text-no-orders">
              No sale orders found.
            </div>
          ) : (
            <Table data-testid="table-sale-orders">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesList.map((sale) => (
                  <TableRow key={sale.id} data-testid={`row-order-${sale.id}`}>
                    <TableCell data-testid={`text-order-date-${sale.id}`}>
                      {sale.date ? format(new Date(sale.date), "dd MMM yyyy") : "-"}
                    </TableCell>
                    <TableCell data-testid={`text-order-customer-${sale.id}`}>
                      {sale.customerName || "Walk-in"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm" data-testid={`text-order-items-${sale.id}`}>
                      {sale.itemCount > 0 ? `${sale.itemCount} item${sale.itemCount > 1 ? "s" : ""}` : "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium" data-testid={`text-order-total-${sale.id}`}>
                      {formatPKR(sale.total)}
                    </TableCell>
                    <TableCell className="text-right text-green-600" data-testid={`text-order-paid-${sale.id}`}>
                      {formatPKR(sale.paidNow)}
                    </TableCell>
                    <TableCell className="text-right" data-testid={`text-order-remaining-${sale.id}`}>
                      <span className={parseFloat(sale.remaining) > 0 ? "text-orange-600" : ""}>
                        {formatPKR(sale.remaining)}
                      </span>
                    </TableCell>
                    <TableCell data-testid={`text-order-status-${sale.id}`}>
                      {statusBadge(sale.status)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => handleViewSale(sale.id)}
                        data-testid={`button-view-${sale.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
