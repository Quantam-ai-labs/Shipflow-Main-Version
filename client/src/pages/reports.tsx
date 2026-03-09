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
  { id: "overview",          label: "Overview",          icon: LayoutDashboard, active: "from-blue-500 to-blue-600",       inactive: "from-blue-500/10 to-blue-500/5 border-blue-500/20 text-blue-400 hover:from-blue-500/20" },
  { id: "pnl",               label: "Profit & Loss",     icon: TrendingUp,      active: "from-green-500 to-green-600",     inactive: "from-green-500/10 to-green-500/5 border-green-500/20 text-green-400 hover:from-green-500/20" },
  { id: "cash-flow",         label: "Cash Flow",         icon: Waves,           active: "from-cyan-500 to-cyan-600",       inactive: "from-cyan-500/10 to-cyan-500/5 border-cyan-500/20 text-cyan-400 hover:from-cyan-500/20" },
  { id: "stock",             label: "Stock Report",      icon: Package,         active: "from-amber-500 to-amber-600",     inactive: "from-amber-500/10 to-amber-500/5 border-amber-500/20 text-amber-400 hover:from-amber-500/20" },
  { id: "balance",           label: "Balance Sheet",     icon: PieChart,        active: "from-purple-500 to-purple-600",   inactive: "from-purple-500/10 to-purple-500/5 border-purple-500/20 text-purple-400 hover:from-purple-500/20" },
  { id: "party-balances",    label: "Party Balances",    icon: Users,           active: "from-pink-500 to-pink-600",       inactive: "from-pink-500/10 to-pink-500/5 border-pink-500/20 text-pink-400 hover:from-pink-500/20" },
  { id: "trial-balance",     label: "Trial Balance",     icon: Scale,           active: "from-indigo-500 to-indigo-600",   inactive: "from-indigo-500/10 to-indigo-500/5 border-indigo-500/20 text-indigo-400 hover:from-indigo-500/20" },
  { id: "courier-dues",      label: "Courier Dues",      icon: DollarSign,      active: "from-orange-500 to-orange-600",   inactive: "from-orange-500/10 to-orange-500/5 border-orange-500/20 text-orange-400 hover:from-orange-500/20" },
  { id: "product-analytics", label: "Product Analytics", icon: BarChart2,       active: "from-emerald-500 to-emerald-600", inactive: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 text-emerald-400 hover:from-emerald-500/20" },
  { id: "analytics",         label: "Analytics",         icon: BarChart3,       active: "from-violet-500 to-violet-600",   inactive: "from-violet-500/10 to-violet-500/5 border-violet-500/20 text-violet-400 hover:from-violet-500/20" },
  { id: "ledger",            label: "Ledger",            icon: BookOpen,        active: "from-slate-500 to-slate-600",     inactive: "from-slate-500/10 to-slate-500/5 border-slate-500/20 text-slate-400 hover:from-slate-500/20" },
] as const;

type ReportTabId = typeof REPORT_TABS[number]["id"];

export default function ReportsHub() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(search);
  const activeTab = (params.get("tab") || "overview") as ReportTabId;

  return (
    <div className="min-h-full" data-testid="page-reports">
      <div className="px-6 pt-4 pb-2">
        <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1" data-testid="reports-tab-nav">
          {REPORT_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setLocation(`/reports?tab=${tab.id}`)}
                data-testid={`reports-tab-${tab.id}`}
                className={[
                  "flex-shrink-0 flex flex-col items-center justify-center gap-1.5",
                  "px-5 py-3 rounded-xl border text-xs font-semibold transition-all whitespace-nowrap min-w-[90px]",
                  "bg-gradient-to-br cursor-pointer select-none",
                  isActive
                    ? `${tab.active} text-white shadow-lg shadow-black/20 border-transparent`
                    : `${tab.inactive}`,
                ].join(" ")}
              >
                <Icon className="w-5 h-5" />
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
