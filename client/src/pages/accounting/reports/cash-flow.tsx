import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

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

const darkTooltipStyle = {
  backgroundColor: "#0d1322",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  color: "rgba(255,255,255,0.9)",
};

function SummaryCard({ title, amount, valueColor, testId }: { title: string; amount: number; valueColor: string; testId: string }) {
  return (
    <Card className="bg-[#0d1322] border-white/[0.08]">
      <CardContent className="p-5">
        <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider">{title}</p>
        <p className={`text-2xl font-bold mt-1 ${valueColor}`} data-testid={testId}>
          {formatPKR(amount)}
        </p>
      </CardContent>
    </Card>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-5 p-6" data-testid="cash-flow-skeleton">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="bg-[#0d1322] border-white/[0.08]">
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="bg-[#0d1322] border-white/[0.08]">
        <CardContent className="p-5">
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
    <div className="space-y-5 p-6" data-testid="accounting-cash-flow">
      <div>
        <h1 className="text-2xl font-bold text-white/90 tracking-tight" data-testid="text-page-title">
          Cash Flow
        </h1>
        <p className="text-white/40 text-sm mt-1">Track money in and out</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard title="Total Inflows" amount={totalInflow} valueColor="text-emerald-400" testId="text-total-inflow" />
        <SummaryCard title="Total Outflows" amount={totalOutflow} valueColor="text-red-400" testId="text-total-outflow" />
        <SummaryCard
          title="Net Cash Flow"
          amount={netFlow}
          valueColor={netFlow >= 0 ? "text-emerald-400" : "text-red-400"}
          testId="text-net-cash-flow"
        />
      </div>

      {monthlyFlow.length > 0 && (
        <Card className="bg-[#0d1322] border-white/[0.08]" data-testid="card-monthly-chart">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white/80">Monthly Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyFlow}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => formatPKR(value)}
                    contentStyle={darkTooltipStyle}
                  />
                  <Legend wrapperStyle={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }} />
                  <Bar dataKey="Inflow" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Outflow" fill="rgba(239,68,68,0.7)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {monthlyFlow.length === 0 && (
        <Card className="bg-[#0d1322] border-white/[0.08]">
          <CardContent className="py-8 text-center text-white/30 text-sm" data-testid="text-no-data">
            No cash flow data available
          </CardContent>
        </Card>
      )}
    </div>
  );
}
