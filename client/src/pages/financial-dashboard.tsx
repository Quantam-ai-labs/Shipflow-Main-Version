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

function SummaryCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="w-10 h-10 rounded-lg" />
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
          <h1 className="text-2xl font-bold" data-testid="text-financial-title">Financial Overview</h1>
          <p className="text-sm text-muted-foreground">
            Track revenue, expenses, stock, and courier dues
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/expense-tracker">
            <Button variant="outline" data-testid="link-expenses">
              <Receipt className="w-4 h-4 mr-2" />
              Expenses
            </Button>
          </Link>
          <Link href="/stock-ledger">
            <Button variant="outline" data-testid="link-stock-ledger">
              <Package className="w-4 h-4 mr-2" />
              Stock Ledger
            </Button>
          </Link>
          <Link href="/courier-dues">
            <Button variant="outline" data-testid="link-courier-dues">
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
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Revenue</p>
                    <p className="text-2xl font-bold" data-testid="text-revenue">{formatPKR(revenue)}</p>
                    <p className="text-xs text-muted-foreground">{data?.revenue?.deliveredOrders || 0} delivered orders</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Expenses</p>
                    <p className="text-2xl font-bold" data-testid="text-expenses">{formatPKR(expenses)}</p>
                    <p className="text-xs text-muted-foreground">{data?.expenses?.count || 0} expense entries</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 text-red-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Net {isProfit ? "Profit" : "Loss"}</p>
                    <p className={`text-2xl font-bold ${isProfit ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-net-profit">
                      {formatPKR(Math.abs(netProfit))}
                    </p>
                    <p className="text-xs text-muted-foreground">{isProfit ? "Positive" : "Negative"} margin</p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isProfit ? "bg-green-500/10" : "bg-red-500/10"}`}>
                    <DollarSign className={`w-5 h-5 ${isProfit ? "text-green-500" : "text-red-500"}`} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Outstanding Dues</p>
                    <p className="text-2xl font-bold" data-testid="text-outstanding-dues">{formatPKR(pendingDues)}</p>
                    <p className="text-xs text-muted-foreground">Pending courier payables</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-amber-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Monthly Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatPKR(value), "Expenses"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="total" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground" data-testid="text-no-monthly-data">
                No monthly expense data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Expense Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
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
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground" data-testid="text-no-category-data">
                No category data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="w-5 h-5" />
              Stock Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <div className="space-y-4" data-testid="stock-overview">
                <div className="flex items-center justify-between gap-4 p-3 rounded-md bg-green-500/5 border border-green-500/10">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <ArrowDownLeft className="w-4 h-4 text-green-500" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Incoming Stock</p>
                      <p className="text-xs text-muted-foreground">{stockIncoming?.totalQty || 0} units</p>
                    </div>
                  </div>
                  <p className="font-semibold text-sm" data-testid="text-stock-incoming-value">{formatPKR(stockIncoming?.totalValue || "0")}</p>
                </div>

                <div className="flex items-center justify-between gap-4 p-3 rounded-md bg-blue-500/5 border border-blue-500/10">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <ArrowUpRight className="w-4 h-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Outgoing Stock</p>
                      <p className="text-xs text-muted-foreground">{stockOutgoing?.totalQty || 0} units</p>
                    </div>
                  </div>
                  <p className="font-semibold text-sm" data-testid="text-stock-outgoing-value">{formatPKR(stockOutgoing?.totalValue || "0")}</p>
                </div>

                <div className="flex items-center justify-between gap-4 p-3 rounded-md bg-amber-500/5 border border-amber-500/10">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <RotateCcw className="w-4 h-4 text-amber-500" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Returns</p>
                      <p className="text-xs text-muted-foreground">{stockReturn?.totalQty || 0} units</p>
                    </div>
                  </div>
                  <p className="font-semibold text-sm" data-testid="text-stock-return-value">{formatPKR(stockReturn?.totalValue || "0")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Courier Dues Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : Object.keys(courierGroups).length > 0 ? (
              <div className="space-y-4" data-testid="courier-dues-summary">
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
                    <div key={courier} className="p-3 rounded-md border" data-testid={`courier-due-${courier}`}>
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <p className="font-medium text-sm">{courier}</p>
                        <div className="flex items-center gap-1.5">
                          {pendingCount > 0 && (
                            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">
                              {pendingCount} pending
                            </Badge>
                          )}
                          {settledCount > 0 && (
                            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
                              {settledCount} settled
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {totalPayable > 0 && <span>Payable: {formatPKR(totalPayable)}</span>}
                        {totalReceivable > 0 && <span>Receivable: {formatPKR(totalReceivable)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground" data-testid="text-no-courier-dues">
                No courier dues data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Recent Expenses
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (data?.expenses?.recent || []).length > 0 ? (
            <div className="space-y-3" data-testid="recent-expenses">
              {(data?.expenses?.recent || []).slice(0, 5).map((expense, i) => (
                <div key={expense.id || i} className="flex items-center justify-between gap-4 p-3 rounded-md border" data-testid={`recent-expense-${expense.id || i}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                      <Receipt className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{expense.description || "Expense"}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">{expense.category}</Badge>
                        {expense.date && <span>{formatPkShortDate(expense.date)}</span>}
                      </div>
                    </div>
                  </div>
                  <p className="font-semibold text-sm shrink-0">{formatPKR(expense.amount)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground" data-testid="text-no-recent-expenses">
              No recent expenses found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
