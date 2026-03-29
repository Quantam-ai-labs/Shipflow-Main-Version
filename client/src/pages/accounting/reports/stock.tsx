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
    <div className="space-y-5 p-6" data-testid="stock-report-skeleton">
      <Skeleton className="h-8 w-48" />
      <Card className="bg-[#0d1322] border-white/[0.08]">
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
        </CardContent>
      </Card>
      <Card className="bg-[#0d1322] border-white/[0.08]">
        <CardContent className="p-5 space-y-3">
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
    <div className="space-y-5 p-6" data-testid="accounting-stock-report">
      <div>
        <h1 className="text-2xl font-bold text-white/90 tracking-tight" data-testid="text-page-title">
          Stock Report
        </h1>
        <p className="text-white/40 text-sm mt-1">Current inventory status</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-[#0d1322] border-white/[0.08]">
          <CardContent className="p-5">
            <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Total Stock Value</p>
            <p className="text-2xl font-bold mt-1 text-blue-400" data-testid="text-total-stock-value">
              {formatPKR(totalValue)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[#0d1322] border-white/[0.08]">
          <CardContent className="p-5">
            <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Total Items</p>
            <p className="text-2xl font-bold mt-1 text-white/80" data-testid="text-total-items">
              {totalItems.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#0d1322] border-white/[0.08]" data-testid="card-stock-table">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-white/80">Products</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {products.length > 0 ? (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-white/[0.04] hover:bg-white/[0.04] border-b border-white/[0.06]">
                    <TableHead className="text-white/40 text-[11px] font-medium uppercase tracking-wider">Product</TableHead>
                    <TableHead className="text-white/40 text-[11px] font-medium uppercase tracking-wider">SKU</TableHead>
                    <TableHead className="text-right text-white/40 text-[11px] font-medium uppercase tracking-wider">Quantity</TableHead>
                    <TableHead className="text-right text-white/40 text-[11px] font-medium uppercase tracking-wider">Avg Cost</TableHead>
                    <TableHead className="text-right text-white/40 text-[11px] font-medium uppercase tracking-wider">Total Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => {
                    const avgCost = parseFloat(product.avgUnitCost);
                    const value = product.stockQty * avgCost;
                    return (
                      <TableRow key={product.id} className="hover:bg-blue-500/[0.06] border-b border-white/[0.04]" data-testid={`row-stock-${product.id}`}>
                        <TableCell className="font-medium text-white/80">{product.name}</TableCell>
                        <TableCell className="text-white/40">{product.sku || "-"}</TableCell>
                        <TableCell className="text-right text-white/70">{product.stockQty}</TableCell>
                        <TableCell className="text-right text-white/70">{formatPKR(avgCost)}</TableCell>
                        <TableCell className="text-right font-medium text-blue-400">{formatPKR(value)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-white/30 py-8 text-sm" data-testid="text-no-products">
              No products in inventory
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
