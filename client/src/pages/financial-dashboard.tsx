import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useDateRange } from "@/contexts/date-range-context";
import { Link } from "wouter";
import { formatPkMonthYear, formatPkShortDate } from "@/lib/dateFormat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Package,
  Truck,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  Receipt,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface ExpenseCategory {
  category: string;
  total: string;
}

interface MonthlyExpense {
  month: string;
  total: string;
}

interface RecentExpense {
  id: string;
  description: string;
  amount: string;
  category: string;
  date: string;
}

interface StockSummary {
  type: string;
  totalQty: number;
  totalValue: string;
}

interface CourierDue {
  courierName: string;
  type: string;
  status: string;
  total: string;
}

interface FinancialData {
  expenses: {
    total: string;
    count: number;
    byCategory: ExpenseCategory[];
    monthly: MonthlyExpense[];
    recent: RecentExpense[];
  };
  stock: StockSummary[];
  courierDues: CourierDue[];
  revenue: {
    total: string;
    deliveredOrders: number;
  };
}

function formatPKR(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "PKR 0";
  return `PKR ${num.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatMonth(month: string): string {
  try {
    const [year, m] = month.split("-");
    const date = new Date(parseInt(year), parseInt(m) - 1);
    return formatPkMonthYear(date);
  } catch {
    return month;
  }
}

const darkTooltipStyle = {
  backgroundColor: "#0d1322",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  color: "rgba(255,255,255,0.9)",
};

function SummaryCardSkeleton() {
  return (
    <Card className="bg-[#0d1322] border-white/[0.08]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="w-9 h-9 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function FinancialDashboard() {
  const { dateParams } = useDateRange();

  const queryUrl = (() => {
    const params = new URLSearchParams();
    if (dateParams.dateFrom) params.set("startDate", dateParams.dateFrom);
    if (dateParams.dateTo) params.set("endDate", dateParams.dateTo);
    const qs = params.toString();
    return qs ? `/api/financial-overview?${qs}` : "/api/financial-overview";
  })();

  const { data, isLoading } = useQuery<FinancialData>({
    queryKey: [queryUrl],
  });

  const revenue = parseFloat(data?.revenue?.total || "0");
  const expenses = parseFloat(data?.expenses?.total || "0");
  const netProfit = revenue - expenses;
  const isProfit = netProfit >= 0;

  const pendingDues = (data?.courierDues || [])
    .filter((d) => d.status === "pending" && d.type === "payable")
    .reduce((sum, d) => sum + parseFloat(d.total || "0"), 0);

  const monthlyData = (data?.expenses?.monthly || []).map((m) => ({
    month: formatMonth(m.month),
    total: parseFloat(m.total),
  }));

  const categoryData = (data?.expenses?.byCategory || []).map((c) => ({
    category: c.category,
    total: parseFloat(c.total),
  }));

  const stockIncoming = data?.stock?.find((s) => s.type === "incoming");
  const stockOutgoing = data?.stock?.find((s) => s.type === "outgoing");
  const stockReturn = data?.stock?.find((s) => s.type === "return");

  const courierGroups: Record<string, CourierDue[]> = {};
  (data?.courierDues || []).forEach((d) => {
    if (!courierGroups[d.courierName]) courierGroups[d.courierName] = [];
    courierGroups[d.courierName].push(d);
  });

  return (
    <div className="space-y-6" data-testid="financial-dashboard">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white/90" data-testid="text-financial-title">Financial Overview</h1>
          <p className="text-sm text-white/40">
            Track revenue, expenses, stock, and courier dues
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/expense-tracker">
            <Button variant="outline" className="bg-white/[0.04] border-white/[0.08] text-white/70 hover:bg-white/[0.08]" data-testid="link-expenses">
              <Receipt className="w-4 h-4 mr-2" />
              Expenses
            </Button>
          </Link>
          <Link href="/stock-ledger">
            <Button variant="outline" className="bg-white/[0.04] border-white/[0.08] text-white/70 hover:bg-white/[0.08]" data-testid="link-stock-ledger">
              <Package className="w-4 h-4 mr-2" />
              Stock Ledger
            </Button>
          </Link>
          <Link href="/courier-dues">
            <Button variant="outline" className="bg-white/[0.04] border-white/[0.08] text-white/70 hover:bg-white/[0.08]" data-testid="link-courier-dues">
              <Truck className="w-4 h-4 mr-2" />
              Courier Dues
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="summary-cards">
        {isLoading ? (
          <>
            <SummaryCardSkeleton />
            <SummaryCardSkeleton />
            <SummaryCardSkeleton />
            <SummaryCardSkeleton />
          </>
        ) : (
          <>
            <Card className="bg-[#0d1322] border-white/[0.08]">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Revenue</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-1" data-testid="text-revenue">{formatPKR(revenue)}</p>
                    <p className="text-xs text-white/30 mt-1">{data?.revenue?.deliveredOrders || 0} delivered orders</p>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#0d1322] border-white/[0.08]">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Total Expenses</p>
                    <p className="text-2xl font-bold text-amber-400 mt-1" data-testid="text-expenses">{formatPKR(expenses)}</p>
                    <p className="text-xs text-white/30 mt-1">{data?.expenses?.count || 0} expense entries</p>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <TrendingDown className="w-4 h-4 text-amber-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#0d1322] border-white/[0.08]">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Net {isProfit ? "Profit" : "Loss"}</p>
                    <p className={`text-2xl font-bold mt-1 ${isProfit ? "text-emerald-400" : "text-red-400"}`} data-testid="text-net-profit">
                      {formatPKR(Math.abs(netProfit))}
                    </p>
                    <p className="text-xs text-white/30 mt-1">{isProfit ? "Positive" : "Negative"} margin</p>
                  </div>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isProfit ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                    <DollarSign className={`w-4 h-4 ${isProfit ? "text-emerald-400" : "text-red-400"}`} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#0d1322] border-white/[0.08]">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Outstanding Dues</p>
                    <p className="text-2xl font-bold text-amber-400 mt-1" data-testid="text-outstanding-dues">{formatPKR(pendingDues)}</p>
                    <p className="text-xs text-white/30 mt-1">Pending courier payables</p>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Truck className="w-4 h-4 text-amber-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="bg-[#0d1322] border-white/[0.08]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white/80">Monthly Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyData}>
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
                    formatter={(value: number) => [formatPKR(value), "Expenses"]}
                    contentStyle={darkTooltipStyle}
                  />
                  <Bar dataKey="total" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-white/30 text-sm" data-testid="text-no-monthly-data">
                No monthly expense data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#0d1322] border-white/[0.08]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white/80">Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    dataKey="total"
                    label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}
                  >
                    {categoryData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [formatPKR(value), "Amount"]}
                    contentStyle={darkTooltipStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-white/30 text-sm" data-testid="text-no-category-data">
                No category data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="bg-[#0d1322] border-white/[0.08]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white/80">Stock Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (
              <div className="space-y-2" data-testid="stock-overview">
                <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-white/[0.06] hover:bg-blue-500/[0.06] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-white/80">Incoming Stock</p>
                      <p className="text-xs text-white/40">{stockIncoming?.totalQty || 0} units</p>
                    </div>
                  </div>
                  <p className="font-semibold text-sm text-emerald-400" data-testid="text-stock-incoming-value">{formatPKR(stockIncoming?.totalValue || "0")}</p>
                </div>

                <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-white/[0.06] hover:bg-blue-500/[0.06] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <ArrowUpRight className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-white/80">Outgoing Stock</p>
                      <p className="text-xs text-white/40">{stockOutgoing?.totalQty || 0} units</p>
                    </div>
                  </div>
                  <p className="font-semibold text-sm text-blue-400" data-testid="text-stock-outgoing-value">{formatPKR(stockOutgoing?.totalValue || "0")}</p>
                </div>

                <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-white/[0.06] hover:bg-blue-500/[0.06] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-white/80">Returns</p>
                      <p className="text-xs text-white/40">{stockReturn?.totalQty || 0} units</p>
                    </div>
                  </div>
                  <p className="font-semibold text-sm text-amber-400" data-testid="text-stock-return-value">{formatPKR(stockReturn?.totalValue || "0")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#0d1322] border-white/[0.08]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white/80">Courier Dues Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : Object.keys(courierGroups).length > 0 ? (
              <div className="space-y-3" data-testid="courier-dues-summary">
                {Object.entries(courierGroups).map(([courier, dues]) => {
                  const totalPayable = dues
                    .filter((d) => d.type === "payable")
                    .reduce((s, d) => s + parseFloat(d.total || "0"), 0);
                  const totalReceivable = dues
                    .filter((d) => d.type === "receivable")
                    .reduce((s, d) => s + parseFloat(d.total || "0"), 0);
                  const pendingCount = dues.filter((d) => d.status === "pending").length;
                  const settledCount = dues.filter((d) => d.status === "settled").length;

                  return (
                    <div key={courier} className="p-3 rounded-lg border border-white/[0.06]" data-testid={`courier-due-${courier}`}>
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <p className="font-medium text-sm text-white/80">{courier}</p>
                        <div className="flex items-center gap-1.5">
                          {pendingCount > 0 && (
                            <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs">
                              {pendingCount} pending
                            </Badge>
                          )}
                          {settledCount > 0 && (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">
                              {settledCount} settled
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-white/40">
                        {totalPayable > 0 && <span>Payable: <span className="text-amber-400">{formatPKR(totalPayable)}</span></span>}
                        {totalReceivable > 0 && <span>Receivable: <span className="text-emerald-400">{formatPKR(totalReceivable)}</span></span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-white/30 text-sm" data-testid="text-no-courier-dues">
                No courier dues data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#0d1322] border-white/[0.08]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-white/80">Recent Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (data?.expenses?.recent || []).length > 0 ? (
            <div className="space-y-2" data-testid="recent-expenses">
              {(data?.expenses?.recent || []).slice(0, 5).map((expense, i) => (
                <div key={expense.id || i} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-white/[0.06] hover:bg-blue-500/[0.06] transition-colors" data-testid={`recent-expense-${expense.id || i}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <Receipt className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-white/80 truncate">{expense.description || "Expense"}</p>
                      <div className="flex items-center gap-2 text-xs text-white/40">
                        <Badge className="bg-white/[0.04] text-white/40 border border-white/[0.08] text-xs px-1.5 py-0">{expense.category}</Badge>
                        {expense.date && <span>{formatPkShortDate(expense.date)}</span>}
                      </div>
                    </div>
                  </div>
                  <p className="font-semibold text-sm text-amber-400 shrink-0">{formatPKR(expense.amount)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-white/30 text-sm" data-testid="text-no-recent-expenses">
              No recent expenses found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
