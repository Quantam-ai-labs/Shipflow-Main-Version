import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { differenceInDays } from "date-fns";
import { formatPkDate } from "@/lib/dateFormat";
import { Banknote } from "lucide-react";

interface CodReceivableItem {
  id: string;
  orderNumber: string;
  customerName: string;
  courierName: string;
  courierTracking: string;
  codRemaining: string;
  totalAmount: string;
  deliveredAt: string;
}

interface CodReceivableTotals {
  courier: string;
  total: string;
  count: string;
}

interface CodReceivableData {
  items: CodReceivableItem[];
  totals: CodReceivableTotals[];
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export default function AccountingCodReceivable() {
  const { data, isLoading } = useQuery<CodReceivableData>({
    queryKey: ["/api/accounting/courier-finance/cod-receivable"],
  });

  const totalPending = data?.totals?.reduce(
    (sum, t) => sum + parseFloat(t.total || "0"),
    0
  ) || 0;

  const totalCount = data?.totals?.reduce(
    (sum, t) => sum + parseInt(t.count || "0"),
    0
  ) || 0;

  return (
    <div className="space-y-6" data-testid="cod-receivable-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          COD Receivable
        </h1>
        <p className="text-muted-foreground mt-2">
          Delivered orders pending COD collection from couriers
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-28 w-full max-w-sm" />
      ) : (
        <Card className="max-w-sm" data-testid="card-total-pending">
          <CardContent className="p-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Total COD Pending</p>
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Banknote className="w-5 h-5 text-amber-500" />
                </div>
              </div>
              <p className="text-2xl font-bold" data-testid="text-total-pending-amount">
                Rs. {totalPending.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {totalCount} orders pending
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {data?.totals && data.totals.length > 1 && (
        <div className="flex flex-wrap gap-2" data-testid="courier-totals">
          {data.totals.map((t) => (
            <Badge key={t.courier} variant="outline" data-testid={`badge-courier-${t.courier}`}>
              {t.courier}: Rs. {parseFloat(t.total).toLocaleString()} ({t.count})
            </Badge>
          ))}
        </div>
      )}

      <Card data-testid="card-cod-receivable-table">
        <CardHeader>
          <CardTitle className="text-lg">Pending COD Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton />
          ) : data?.items && data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Courier</TableHead>
                    <TableHead>Tracking</TableHead>
                    <TableHead className="text-right">COD Amount</TableHead>
                    <TableHead>Delivery Date</TableHead>
                    <TableHead className="text-right">Days Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => {
                    const daysPending = item.deliveredAt
                      ? differenceInDays(new Date(), new Date(item.deliveredAt))
                      : 0;
                    return (
                      <TableRow key={item.id} data-testid={`row-order-${item.id}`}>
                        <TableCell className="font-medium" data-testid={`text-order-number-${item.id}`}>
                          {String(item.orderNumber || '').replace(/^#/, '')}
                        </TableCell>
                        <TableCell data-testid={`text-courier-${item.id}`}>
                          {item.courierName}
                        </TableCell>
                        <TableCell data-testid={`text-tracking-${item.id}`}>
                          {item.courierTracking || "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium" data-testid={`text-cod-amount-${item.id}`}>
                          Rs. {parseFloat(item.codRemaining || "0").toLocaleString()}
                        </TableCell>
                        <TableCell data-testid={`text-delivery-date-${item.id}`}>
                          {item.deliveredAt
                            ? formatPkDate(item.deliveredAt)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-days-pending-${item.id}`}>
                          <Badge
                            variant={daysPending > 7 ? "destructive" : daysPending > 3 ? "secondary" : "outline"}
                          >
                            {daysPending}d
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground" data-testid="text-no-data">
              No pending COD receivables found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
