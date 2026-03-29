import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

interface PnlData {
  revenue: number;
  cogs: number;
  grossProfit: number;
  expensesByCategory: { category: string; total: string }[];
  totalExpenses: number;
  netProfit: number;
}

function formatPKR(amount: number): string {
  if (isNaN(amount)) return "Rs. 0";
  return `Rs. ${amount.toLocaleString()}`;
}

function LineItem({ label, amount, bold, color }: { label: string; amount: number; bold?: boolean; color?: string }) {
  return (
    <div className={`flex items-center justify-between py-2 ${bold ? "font-semibold text-base" : "text-sm"}`}>
      <span className={color || ""}>{label}</span>
      <span className={color || ""} data-testid={`text-pnl-${label.toLowerCase().replace(/\s+/g, "-")}`}>
        {formatPKR(amount)}
      </span>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6" data-testid="pnl-skeleton">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function AccountingPnl() {
  const { data, isLoading } = useQuery<PnlData>({
    queryKey: ["/api/accounting/reports/pnl"],
  });

  if (isLoading) return <PageSkeleton />;

  const revenue = data?.revenue || 0;
  const cogs = data?.cogs || 0;
  const grossProfit = data?.grossProfit || 0;
  const totalExpenses = data?.totalExpenses || 0;
  const netProfit = data?.netProfit || 0;
  const expensesByCategory = data?.expensesByCategory || [];

  return (
    <div className="space-y-6" data-testid="accounting-pnl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          Profit &amp; Loss
        </h1>
        <p className="text-muted-foreground mt-2">Income statement summary</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card data-testid="card-revenue">
          <CardHeader>
            <CardTitle className="text-lg">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <LineItem label="Total Sales" amount={revenue} />
          </CardContent>
        </Card>

        <Card data-testid="card-cogs">
          <CardHeader>
            <CardTitle className="text-lg">Cost of Goods Sold</CardTitle>
          </CardHeader>
          <CardContent>
            <LineItem label="COGS" amount={cogs} />
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-gross-profit">
        <CardContent className="p-6">
          <LineItem label="Gross Profit" amount={grossProfit} bold color={grossProfit >= 0 ? "text-emerald-400" : "text-red-400"} />
        </CardContent>
      </Card>

      <Card data-testid="card-expenses">
        <CardHeader>
          <CardTitle className="text-lg">Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {expensesByCategory.length > 0 ? (
            <div className="space-y-1">
              {expensesByCategory.map((exp) => (
                <LineItem key={exp.category} label={exp.category || "Uncategorized"} amount={parseFloat(exp.total)} />
              ))}
              <Separator className="my-2" />
              <LineItem label="Total Expenses" amount={totalExpenses} bold />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-no-expenses">No expenses recorded</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-net-profit">
        <CardContent className="p-6">
          <LineItem label="Net Profit" amount={netProfit} bold color={netProfit >= 0 ? "text-emerald-400" : "text-red-400"} />
        </CardContent>
      </Card>
    </div>
  );
}
