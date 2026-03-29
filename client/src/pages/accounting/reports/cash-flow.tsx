import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface CashFlowData {
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  monthlyFlow: { month: string; inflow: string; outflow: string }[];
}

function formatPKR(amount: number): string {
  if (isNaN(amount)) return "Rs. 0";
  return `Rs. ${amount.toLocaleString()}`;
}

function SummaryCard({ title, amount, color, testId }: { title: string; amount: number; color: string; testId: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className={`text-2xl font-bold mt-2 ${color}`} data-testid={testId}>
          {formatPKR(amount)}
        </p>
      </CardContent>
    </Card>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6" data-testid="cash-flow-skeleton">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function AccountingCashFlow() {
  const { data, isLoading } = useQuery<CashFlowData>({
    queryKey: ["/api/accounting/reports/cash-flow"],
  });

  if (isLoading) return <PageSkeleton />;

  const totalInflow = data?.totalInflow || 0;
  const totalOutflow = data?.totalOutflow || 0;
  const netFlow = data?.netFlow || 0;
  const monthlyFlow = (data?.monthlyFlow || []).map((m) => ({
    month: m.month,
    Inflow: parseFloat(m.inflow),
    Outflow: parseFloat(m.outflow),
  }));

  return (
    <div className="space-y-6" data-testid="accounting-cash-flow">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          Cash Flow
        </h1>
        <p className="text-muted-foreground mt-2">Track money in and out</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard title="Total Inflows" amount={totalInflow} color="text-emerald-400" testId="text-total-inflow" />
        <SummaryCard title="Total Outflows" amount={totalOutflow} color="text-red-400" testId="text-total-outflow" />
        <SummaryCard
          title="Net Cash Flow"
          amount={netFlow}
          color={netFlow >= 0 ? "text-emerald-400" : "text-red-400"}
          testId="text-net-cash-flow"
        />
      </div>

      {monthlyFlow.length > 0 && (
        <Card data-testid="card-monthly-chart">
          <CardHeader>
            <CardTitle className="text-lg">Monthly Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyFlow}>
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatPKR(value)} />
                  <Legend />
                  <Bar dataKey="Inflow" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Outflow" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {monthlyFlow.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-data">
            No cash flow data available
          </CardContent>
        </Card>
      )}
    </div>
  );
}
