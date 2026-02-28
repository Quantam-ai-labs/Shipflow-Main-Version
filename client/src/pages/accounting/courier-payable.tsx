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
import { Truck } from "lucide-react";
import { formatPkDate } from "@/lib/dateFormat";

interface CourierPayableItem {
  id: string;
  courierName: string;
  totalShipments: number;
  totalDue: string;
  shippingCharges: string;
  codAmount: string;
  status: string;
  lastSettlementDate: string | null;
  createdAt: string;
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

export default function AccountingCourierPayable() {
  const { data, isLoading } = useQuery<CourierPayableItem[]>({
    queryKey: ["/api/accounting/courier-finance/courier-payable"],
  });

  const items = Array.isArray(data) ? data : [];

  const courierSummary = items.reduce<
    Record<string, { totalDue: number; shipments: number; lastDate: string | null }>
  >((acc, item) => {
    const name = item.courierName || "Unknown";
    if (!acc[name]) {
      acc[name] = { totalDue: 0, shipments: 0, lastDate: null };
    }
    acc[name].totalDue += parseFloat(item.shippingCharges || item.totalDue || "0");
    acc[name].shipments += 1;
    const date = item.lastSettlementDate || item.createdAt;
    if (date && (!acc[name].lastDate || new Date(date) > new Date(acc[name].lastDate!))) {
      acc[name].lastDate = date;
    }
    return acc;
  }, {});

  const courierEntries = Object.entries(courierSummary);
  const grandTotal = courierEntries.reduce((s, [, v]) => s + v.totalDue, 0);

  return (
    <div className="space-y-6" data-testid="courier-payable-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          Courier Payable
        </h1>
        <p className="text-muted-foreground mt-2">
          Amounts owed to couriers for shipping services
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="summary-cards">
          {courierEntries.map(([courier, summary]) => (
            <Card key={courier} data-testid={`card-courier-${courier}`}>
              <CardContent className="p-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{courier}</p>
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Truck className="w-5 h-5 text-blue-500" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" data-testid={`text-total-due-${courier}`}>
                    Rs. {summary.totalDue.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {summary.shipments} shipments
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
          {courierEntries.length === 0 && (
            <Card data-testid="card-no-payables">
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">No payables found</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card data-testid="card-courier-payable-table">
        <CardHeader>
          <CardTitle className="text-lg">
            Courier Payable Details
            {grandTotal > 0 && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                Total: Rs. {grandTotal.toLocaleString()}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton />
          ) : courierEntries.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Courier</TableHead>
                    <TableHead className="text-right">Total Shipments</TableHead>
                    <TableHead className="text-right">Total Due</TableHead>
                    <TableHead>Last Settlement Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courierEntries.map(([courier, summary]) => (
                    <TableRow key={courier} data-testid={`row-courier-${courier}`}>
                      <TableCell className="font-medium" data-testid={`text-courier-name-${courier}`}>
                        {courier}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-shipments-${courier}`}>
                        {summary.shipments}
                      </TableCell>
                      <TableCell className="text-right font-medium" data-testid={`text-due-${courier}`}>
                        Rs. {summary.totalDue.toLocaleString()}
                      </TableCell>
                      <TableCell data-testid={`text-last-settlement-${courier}`}>
                        {formatPkDate(summary.lastDate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground" data-testid="text-no-data">
              No courier payables found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
