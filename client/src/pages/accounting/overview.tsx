import { useQuery } from "@tanstack/react-query";
import { AIInsightsBanner } from "@/components/ai-insights-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatPkDate } from "@/lib/dateFormat";
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
    <Card className="bg-[#0d1322] border-white/[0.08]">
      <CardContent className="p-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="w-9 h-9 rounded-lg" />
          </div>
          <Skeleton className="h-7 w-40" />
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
  iconBg,
  iconColor,
  valueColor,
  isLoading,
  testId,
}: {
  title: string;
  amount: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  valueColor: string;
  isLoading?: boolean;
  testId: string;
}) {
  if (isLoading) return <SummaryCardSkeleton />;

  return (
    <Card className="bg-[#0d1322] border-white/[0.08]">
      <CardContent className="p-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider">{title}</p>
            <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center`}>
              <Icon className={`w-4 h-4 ${iconColor}`} />
            </div>
          </div>
          <p className={`text-2xl font-bold ${valueColor}`} data-testid={`text-${testId}`}>
            {amount}
          </p>
          <p className="text-xs text-white/30">{subtitle}</p>
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
    <div className="space-y-6 p-6" data-testid="accounting-overview">
      <div>
        <h1 className="text-2xl font-semibold text-white/90" data-testid="text-page-title">
          Accounting Overview
        </h1>
        <p className="text-sm text-white/40 mt-1">
          Track your business finances at a glance
        </p>
      </div>

      <AIInsightsBanner section="finance" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="summary-cards">
        <SummaryCard
          title="Cash in Hand"
          amount={isOverviewLoading ? "—" : formatPKR(overviewData?.cashNow || 0)}
          subtitle="Total cash across accounts"
          icon={Wallet}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-400"
          valueColor="text-blue-400"
          isLoading={isOverviewLoading}
          testId="cash-in-hand"
        />
        <SummaryCard
          title="Money Coming"
          amount={isOverviewLoading ? "—" : formatPKR(overviewData?.moneyComing || 0)}
          subtitle="Receivables from parties"
          icon={ArrowDownLeft}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-400"
          valueColor="text-emerald-400"
          isLoading={isOverviewLoading}
          testId="money-coming"
        />
        <SummaryCard
          title="Money Owed"
          amount={isOverviewLoading ? "—" : formatPKR(overviewData?.moneyOwed || 0)}
          subtitle="Payables to parties"
          icon={ArrowUpRight}
          iconBg="bg-red-500/10"
          iconColor="text-red-400"
          valueColor="text-red-400"
          isLoading={isOverviewLoading}
          testId="money-owed"
        />
        <SummaryCard
          title="Profit This Month"
          amount={isOverviewLoading ? "—" : formatPKR(overviewData?.netProfit || 0)}
          subtitle="Revenue minus expenses"
          icon={TrendingUp}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-400"
          valueColor="text-emerald-400"
          isLoading={isOverviewLoading}
          testId="profit-this-month"
        />
        <SummaryCard
          title="Stock Value"
          amount={isOverviewLoading ? "—" : formatPKR(overviewData?.stockValue || 0)}
          subtitle={`${overviewData?.stockItems || 0} items in inventory`}
          icon={Package}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-400"
          valueColor="text-amber-400"
          isLoading={isOverviewLoading}
          testId="stock-value"
        />
        <SummaryCard
          title="Working Capital"
          amount={isOverviewLoading ? "—" : formatPKR(overviewData?.workingCapital || 0)}
          subtitle="Cash + Receivables − Payables"
          icon={Zap}
          iconBg="bg-violet-500/10"
          iconColor="text-violet-400"
          valueColor="text-violet-400"
          isLoading={isOverviewLoading}
          testId="working-capital"
        />
      </div>

      <Card className="bg-[#0d1322] border-white/[0.08]" data-testid="recent-activity-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-white/80">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isMovementsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : movements.length > 0 ? (
            <div className="space-y-2" data-testid="activity-list">
              {movements.map((movement) => {
                const amount = parseFloat(movement.amount);
                const isInflow = movement.type === "in";

                return (
                  <div
                    key={movement.id}
                    className="flex items-center justify-between gap-4 p-3 rounded-lg border border-white/[0.06] hover:bg-blue-500/[0.06] transition-colors"
                    data-testid={`activity-item-${movement.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isInflow ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                        {isInflow ? (
                          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5 text-red-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-white/80 truncate" data-testid={`activity-description-${movement.id}`}>
                          {movement.description}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5">
                          {movement.accountName && (
                            <Badge className="bg-white/[0.04] text-white/40 border border-white/[0.08] text-xs px-1.5 py-0">
                              {movement.accountName}
                            </Badge>
                          )}
                          {movement.date && <span>{formatPkDate(movement.date)}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <p
                        className={`font-semibold text-sm ${isInflow ? "text-emerald-400" : "text-red-400"}`}
                        data-testid={`activity-amount-${movement.id}`}
                      >
                        {isInflow ? "+" : "−"} {formatPKR(amount)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-white/30 text-sm" data-testid="text-no-activities">
              No recent activities found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
