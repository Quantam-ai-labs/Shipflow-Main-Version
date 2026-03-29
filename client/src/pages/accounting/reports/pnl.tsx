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
    <div className={`flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0 ${bold ? "font-semibold text-base" : "text-sm"}`}>
      <span className={color || "text-white/60"}>{label}</span>
      <span className={color || "text-white/80"} data-testid={`text-pnl-${label.toLowerCase().replace(/\s+/g, "-")}`}>
        {formatPKR(amount)}
      </span>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-5 p-6" data-testid="pnl-skeleton">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="bg-[#0d1322] border-white/[0.08]">
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-full" />
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
    <div className="space-y-5 p-6" data-testid="accounting-pnl">
      <div>
        <h1 className="text-2xl font-bold text-white/90 tracking-tight" data-testid="text-page-title">
          Profit &amp; Loss
        </h1>
        <p className="text-white/40 text-sm mt-1">Income statement summary</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-[#0d1322] border-white/[0.08]" data-testid="card-revenue">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white/80">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <LineItem label="Total Sales" amount={revenue} color="text-emerald-400" />
          </CardContent>
        </Card>

        <Card className="bg-[#0d1322] border-white/[0.08]" data-testid="card-cogs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white/80">Cost of Goods Sold</CardTitle>
          </CardHeader>
          <CardContent>
            <LineItem label="COGS" amount={cogs} color="text-amber-400" />
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#0d1322] border-white/[0.08]" data-testid="card-gross-profit">
        <CardContent className="p-5">
          <LineItem label="Gross Profit" amount={grossProfit} bold color={grossProfit >= 0 ? "text-emerald-400" : "text-red-400"} />
        </CardContent>
      </Card>

      <Card className="bg-[#0d1322] border-white/[0.08]" data-testid="card-expenses">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-white/80">Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {expensesByCategory.length > 0 ? (
            <div className="space-y-0">
              {expensesByCategory.map((exp) => (
                <LineItem key={exp.category} label={exp.category || "Uncategorized"} amount={parseFloat(exp.total)} />
              ))}
              <Separator className="my-2 bg-white/[0.08]" />
              <LineItem label="Total Expenses" amount={totalExpenses} bold color="text-amber-400" />
            </div>
          ) : (
            <p className="text-sm text-white/30" data-testid="text-no-expenses">No expenses recorded</p>
          )}
        </CardContent>
      </Card>

      <Card className="bg-[#0d1322] border-white/[0.08]" data-testid="card-net-profit">
        <CardContent className="p-5">
          <LineItem label="Net Profit" amount={netProfit} bold color={netProfit >= 0 ? "text-emerald-400" : "text-red-400"} />
        </CardContent>
      </Card>
    </div>
  );
}
