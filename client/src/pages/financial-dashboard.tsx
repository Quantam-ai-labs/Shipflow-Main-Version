import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useDateRange } from "@/contexts/date-range-context";
import { Link } from "wouter";
import { formatPkMonthYear, formatPkShortDate } from "@/lib/dateFormat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-3" data-testid="financial-dashboard">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold" data-testid="text-financial-title">Financial Overview</h1>
          <p className="text-xs text-muted-foreground">
            Track revenue, expenses, stock, and courier dues
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/expense-tracker">
            <Button variant="outline" size="sm" data-testid="link-expenses">
              <Receipt className="w-3.5 h-3.5 mr-1.5" />
              Expenses
            </Button>
          </Link>
          <Link href="/stock-ledger">
            <Button variant="outline" size="sm" data-testid="link-stock-ledger">
              <Package className="w-3.5 h-3.5 mr-1.5" />
              Stock
            </Button>
          </Link>
          <Link href="/courier-dues">
            <Button variant="outline" size="sm" data-testid="link-courier-dues">
              <Truck className="w-3.5 h-3.5 mr-1.5" />
              Courier Dues
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-8 py-2 border-b" data-testid="summary-cards">
        {isLoading ? (
          <>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="min-w-0">
                <Skeleton className="h-3 w-16 mb-1" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Revenue</p>
              <p className="text-sm font-semibold" data-testid="text-revenue">{formatPKR(revenue)}</p>
              <p className="text-[10px] text-muted-foreground">{data?.revenue?.deliveredOrders || 0} delivered</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Expenses</p>
              <p className="text-sm font-semibold" data-testid="text-expenses">{formatPKR(expenses)}</p>
              <p className="text-[10px] text-muted-foreground">{data?.expenses?.count || 0} entries</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Net {isProfit ? "Profit" : "Loss"}</p>
              <p className={`text-sm font-semibold ${isProfit ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-net-profit">
                {formatPKR(Math.abs(netProfit))}
              </p>
              <p className="text-[10px] text-muted-foreground">{isProfit ? "Positive" : "Negative"} margin</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Outstanding</p>
              <p className="text-sm font-semibold" data-testid="text-outstanding-dues">{formatPKR(pendingDues)}</p>
              <p className="text-[10px] text-muted-foreground">Pending payables</p>
            </div>
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Monthly Expenses
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatPKR(value), "Expenses"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="total" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground" data-testid="text-no-monthly-data">
                No monthly expense data
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Expense Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
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
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground" data-testid="text-no-category-data">
                No category data
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Stock Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="space-y-1.5" data-testid="stock-overview">
                <div className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-md border">
                  <div className="flex items-center gap-2">
                    <ArrowDownLeft className="w-3.5 h-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-medium">Incoming</p>
                      <p className="text-[10px] text-muted-foreground">{stockIncoming?.totalQty || 0} units</p>
                    </div>
                  </div>
                  <p className="text-xs font-semibold" data-testid="text-stock-incoming-value">{formatPKR(stockIncoming?.totalValue || "0")}</p>
                </div>

                <div className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-md border">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-medium">Outgoing</p>
                      <p className="text-[10px] text-muted-foreground">{stockOutgoing?.totalQty || 0} units</p>
                    </div>
                  </div>
                  <p className="text-xs font-semibold" data-testid="text-stock-outgoing-value">{formatPKR(stockOutgoing?.totalValue || "0")}</p>
                </div>

                <div className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-md border">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-medium">Returns</p>
                      <p className="text-[10px] text-muted-foreground">{stockReturn?.totalQty || 0} units</p>
                    </div>
                  </div>
                  <p className="text-xs font-semibold" data-testid="text-stock-return-value">{formatPKR(stockReturn?.totalValue || "0")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Courier Dues
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : Object.keys(courierGroups).length > 0 ? (
              <div className="space-y-1.5" data-testid="courier-dues-summary">
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
                    <div key={courier} className="py-1.5 px-2 rounded-md border" data-testid={`courier-due-${courier}`}>
                      <div className="flex items-center justify-between gap-3 mb-0.5">
                        <p className="text-xs font-medium">{courier}</p>
                        <div className="flex items-center gap-1">
                          {pendingCount > 0 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {pendingCount} pending
                            </Badge>
                          )}
                          {settledCount > 0 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {settledCount} settled
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        {totalPayable > 0 && <span>Payable: {formatPKR(totalPayable)}</span>}
                        {totalReceivable > 0 && <span>Receivable: {formatPKR(totalReceivable)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-[120px] flex items-center justify-center text-xs text-muted-foreground" data-testid="text-no-courier-dues">
                No courier dues data
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Recent Expenses
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {isLoading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (data?.expenses?.recent || []).length > 0 ? (
            <div className="space-y-1" data-testid="recent-expenses">
              {(data?.expenses?.recent || []).slice(0, 5).map((expense, i) => (
                <div key={expense.id || i} className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-md border" data-testid={`recent-expense-${expense.id || i}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Receipt className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{expense.description || "Expense"}</p>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{expense.category}</Badge>
                        {expense.date && <span>{formatPkShortDate(expense.date)}</span>}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs font-semibold shrink-0">{formatPKR(expense.amount)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-muted-foreground" data-testid="text-no-recent-expenses">
              No recent expenses found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
