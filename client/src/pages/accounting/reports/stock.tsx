import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface StockProduct {
  id: string;
  name: string;
  sku: string;
  stockQty: number;
  avgUnitCost: string;
}

interface StockData {
  products: StockProduct[];
  totalValue: number;
  totalItems: number;
}

function formatPKR(amount: number): string {
  if (isNaN(amount)) return "Rs. 0";
  return `Rs. ${amount.toLocaleString()}`;
}

function PageSkeleton() {
  return (
    <div className="space-y-6" data-testid="stock-report-skeleton">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AccountingStockReport() {
  const { data, isLoading } = useQuery<StockData>({
    queryKey: ["/api/accounting/reports/stock"],
  });

  if (isLoading) return <PageSkeleton />;

  const products = data?.products || [];
  const totalValue = data?.totalValue || 0;
  const totalItems = data?.totalItems || 0;

  return (
    <div className="space-y-6" data-testid="accounting-stock-report">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          Stock Report
        </h1>
        <p className="text-muted-foreground mt-2">Current inventory status</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Total Stock Value</p>
            <p className="text-2xl font-bold mt-2" data-testid="text-total-stock-value">
              {formatPKR(totalValue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Total Items</p>
            <p className="text-2xl font-bold mt-2" data-testid="text-total-items">
              {totalItems.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-stock-table">
        <CardHeader>
          <CardTitle className="text-lg">Products</CardTitle>
        </CardHeader>
        <CardContent>
          {products.length > 0 ? (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Avg Cost</TableHead>
                    <TableHead className="text-right">Total Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => {
                    const avgCost = parseFloat(product.avgUnitCost);
                    const value = product.stockQty * avgCost;
                    return (
                      <TableRow key={product.id} data-testid={`row-stock-${product.id}`}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="text-muted-foreground">{product.sku || "-"}</TableCell>
                        <TableCell className="text-right">{product.stockQty}</TableCell>
                        <TableCell className="text-right">{formatPKR(avgCost)}</TableCell>
                        <TableCell className="text-right font-medium">{formatPKR(value)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8" data-testid="text-no-products">
              No products in inventory
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
