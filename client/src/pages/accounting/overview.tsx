import { useQuery } from "@tanstack/react-query";
import { AIInsightsBanner } from "@/components/ai-insights-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  Wallet,
  TrendingDown,
  TrendingUp,
  Package,
  Zap,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";

interface OverviewData {
  cashNow: number;
  moneyComing: number;
  moneyOwed: number;
  workingCapital: number;
  revenue: number;
  cogs: number;
  totalExpenses: number;
  netProfit: number;
  stockValue: number;
  stockItems: number;
  codPending: number;
  codPendingCount: number;
}

interface CashMovement {
  id: string;
  type: "in" | "out";
  amount: string;
  description: string;
  date: string;
  accountName?: string;
  partyName?: string;
}

function formatPKR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs. 0";
  return `Rs. ${num.toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function SummaryCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="w-10 h-10 rounded-lg" />
          </div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  title,
  amount,
  subtitle,
  icon: Icon,
  iconBgColor,
  iconColor,
  isLoading,
  testId,
}: {
  title: string;
  amount: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBgColor: string;
  iconColor: string;
  isLoading?: boolean;
  testId: string;
}) {
  if (isLoading) return <SummaryCardSkeleton />;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{title}</p>
            <div className={`w-10 h-10 rounded-lg ${iconBgColor} flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${iconColor}`} />
            </div>
          </div>
          <p className="text-2xl font-bold" data-testid={`text-${testId}`}>
            {amount}
          </p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AccountingOverview() {
  const { data: overviewData, isLoading: isOverviewLoading } = useQuery<OverviewData>({
    queryKey: ["/api/accounting/reports/overview"],
  });

  const { data: movementsData, isLoading: isMovementsLoading } = useQuery<CashMovement[]>({
    queryKey: ["/api/accounting/cash-movements?limit=10"],
  });

  const movements = Array.isArray(movementsData) ? movementsData.slice(0, 10) : [];

  return (
    <div className="space-y-6" data-testid="accounting-overview">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          Accounting Overview
        </h1>
        <p className="text-muted-foreground mt-2">
          Track your business finances at a glance
        </p>
      </div>

      <AIInsightsBanner section="finance" />

      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        data-testid="summary-cards"
      >
        <SummaryCard
          title="Cash in Hand"
          amount={
            isOverviewLoading
              ? "Loading..."
              : formatPKR(overviewData?.cashNow || 0)
          }
          subtitle="Total cash across accounts"
          icon={Wallet}
          iconBgColor="bg-blue-500/10"
          iconColor="text-blue-500"
          isLoading={isOverviewLoading}
          testId="cash-in-hand"
        />

        <SummaryCard
          title="Money Coming"
          amount={
            isOverviewLoading
              ? "Loading..."
              : formatPKR(overviewData?.moneyComing || 0)
          }
          subtitle="Receivables from parties"
          icon={ArrowDownLeft}
          iconBgColor="bg-green-500/10"
          iconColor="text-green-500"
          isLoading={isOverviewLoading}
          testId="money-coming"
        />

        <SummaryCard
          title="Money Owed"
          amount={
            isOverviewLoading
              ? "Loading..."
              : formatPKR(overviewData?.moneyOwed || 0)
          }
          subtitle="Payables to parties"
          icon={ArrowUpRight}
          iconBgColor="bg-red-500/10"
          iconColor="text-red-500"
          isLoading={isOverviewLoading}
          testId="money-owed"
        />

        <SummaryCard
          title="Profit This Month"
          amount={
            isOverviewLoading
              ? "Loading..."
              : formatPKR(overviewData?.netProfit || 0)
          }
          subtitle="Revenue minus expenses"
          icon={TrendingUp}
          iconBgColor="bg-emerald-500/10"
          iconColor="text-emerald-500"
          isLoading={isOverviewLoading}
          testId="profit-this-month"
        />

        <SummaryCard
          title="Stock Value"
          amount={
            isOverviewLoading
              ? "Loading..."
              : formatPKR(overviewData?.stockValue || 0)
          }
          subtitle={`${overviewData?.stockItems || 0} items in inventory`}
          icon={Package}
          iconBgColor="bg-amber-500/10"
          iconColor="text-amber-500"
          isLoading={isOverviewLoading}
          testId="stock-value"
        />

        <SummaryCard
          title="Working Capital"
          amount={
            isOverviewLoading
              ? "Loading..."
              : formatPKR(overviewData?.workingCapital || 0)
          }
          subtitle="Cash + Receivables - Payables"
          icon={Zap}
          iconBgColor="bg-purple-500/10"
          iconColor="text-purple-500"
          isLoading={isOverviewLoading}
          testId="working-capital"
        />
      </div>

      <Card data-testid="recent-activity-card">
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isMovementsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : movements.length > 0 ? (
            <div className="space-y-3" data-testid="activity-list">
              {movements.map((movement) => {
                const amount = parseFloat(movement.amount);
                const isInflow = movement.type === "in";

                return (
                  <div
                    key={movement.id}
                    className="flex items-center justify-between gap-4 p-3 rounded-md border"
                    data-testid={`activity-item-${movement.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                          isInflow
                            ? "bg-green-500/10"
                            : "bg-red-500/10"
                        }`}
                      >
                        {isInflow ? (
                          <ArrowDownLeft className="w-5 h-5 text-green-500" />
                        ) : (
                          <ArrowUpRight className="w-5 h-5 text-red-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate" data-testid={`activity-description-${movement.id}`}>
                          {movement.description}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          {movement.accountName && (
                            <Badge variant="outline" className="text-xs">
                              {movement.accountName}
                            </Badge>
                          )}
                          {movement.date && (
                            <span>{format(new Date(movement.date), "dd MMM yyyy")}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <p
                        className={`font-semibold text-sm ${
                          isInflow
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                        data-testid={`activity-amount-${movement.id}`}
                      >
                        {isInflow ? "+" : "-"} {formatPKR(amount)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground" data-testid="text-no-activities">
              No recent activities found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
