import { useSearch, useLocation } from "wouter";
import {
  LayoutDashboard,
  TrendingUp,
  Waves,
  Package,
  PieChart,
  Users,
  Scale,
  DollarSign,
  BarChart2,
  BarChart3,
  BookOpen,
} from "lucide-react";
import AccountingOverview from "@/pages/accounting/overview";
import AccountingPnl from "@/pages/accounting/reports/pnl";
import AccountingCashFlow from "@/pages/accounting/reports/cash-flow";
import AccountingStockReport from "@/pages/accounting/reports/stock";
import AccountingBalanceSheet from "@/pages/accounting/reports/balance-sheet";
import AccountingPartyBalances from "@/pages/accounting/reports/party-balances";
import AccountingTrialBalance from "@/pages/accounting/trial-balance";
import CourierDuesPage from "@/pages/courier-dues";
import ProductAnalyticsPage from "@/pages/product-analytics";
import Analytics from "@/pages/analytics";
import AccountingLedger from "@/pages/accounting/ledger";

const REPORT_TABS = [
  { id: "overview",          label: "Overview",          icon: LayoutDashboard },
  { id: "pnl",               label: "Profit & Loss",     icon: TrendingUp },
  { id: "cash-flow",         label: "Cash Flow",         icon: Waves },
  { id: "stock",             label: "Stock Report",      icon: Package },
  { id: "balance",           label: "Balance Sheet",     icon: PieChart },
  { id: "party-balances",    label: "Party Balances",    icon: Users },
  { id: "trial-balance",     label: "Trial Balance",     icon: Scale },
  { id: "courier-dues",      label: "Courier Dues",      icon: DollarSign },
  { id: "product-analytics", label: "Product Analytics", icon: BarChart2 },
  { id: "analytics",         label: "Analytics",         icon: BarChart3 },
  { id: "ledger",            label: "Ledger",            icon: BookOpen },
] as const;

type ReportTabId = typeof REPORT_TABS[number]["id"];

export default function ReportsHub() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(search);
  const activeTab = (params.get("tab") || "overview") as ReportTabId;

  return (
    <div className="min-h-full" data-testid="page-reports">
      <div className="border-b px-4 md:px-6">
        <div className="flex gap-1 overflow-x-auto scrollbar-none py-1" data-testid="reports-tab-nav">
          {REPORT_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setLocation(`/reports?tab=${tab.id}`)}
                data-testid={`reports-tab-${tab.id}`}
                className={[
                  "flex-shrink-0 flex items-center gap-1.5",
                  "px-3 py-2 rounded-md cursor-pointer select-none",
                  "text-sm font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                ].join(" ")}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content — each component owns its own layout/padding */}
      <div data-testid="reports-tab-content">
        {activeTab === "overview"          && <AccountingOverview />}
        {activeTab === "pnl"               && <AccountingPnl />}
        {activeTab === "cash-flow"         && <AccountingCashFlow />}
        {activeTab === "stock"             && <AccountingStockReport />}
        {activeTab === "balance"           && <AccountingBalanceSheet />}
        {activeTab === "party-balances"    && <AccountingPartyBalances />}
        {activeTab === "trial-balance"     && <AccountingTrialBalance />}
        {activeTab === "courier-dues"      && <CourierDuesPage />}
        {activeTab === "product-analytics" && <ProductAnalyticsPage />}
        {activeTab === "analytics"          && <Analytics />}
        {activeTab === "ledger"              && <AccountingLedger />}
      </div>
    </div>
  );
}
