import { useSearch, useLocation } from "wouter";
import {
  LayoutDashboard,
  TrendingUp,
  Waves,
  Package,
  PieChart,
  Users,
  Scale,
  Truck,
  DollarSign,
  BarChart2,
  BarChart3,
} from "lucide-react";
import AccountingOverview from "@/pages/accounting/overview";
import AccountingPnl from "@/pages/accounting/reports/pnl";
import AccountingCashFlow from "@/pages/accounting/reports/cash-flow";
import AccountingStockReport from "@/pages/accounting/reports/stock";
import AccountingBalanceSheet from "@/pages/accounting/reports/balance-sheet";
import AccountingPartyBalances from "@/pages/accounting/reports/party-balances";
import AccountingTrialBalance from "@/pages/accounting/trial-balance";
import Shipments from "@/pages/shipments";
import CourierDuesPage from "@/pages/courier-dues";
import ProductAnalyticsPage from "@/pages/product-analytics";
import Analytics from "@/pages/analytics";

const REPORT_TABS = [
  { id: "overview",          label: "Overview",          icon: LayoutDashboard, gradient: "from-slate-600 to-slate-700"      },
  { id: "pnl",               label: "Profit & Loss",     icon: TrendingUp,       gradient: "from-emerald-600 to-green-700"    },
  { id: "cash-flow",         label: "Cash Flow",         icon: Waves,            gradient: "from-blue-600 to-cyan-700"        },
  { id: "stock",             label: "Stock Report",      icon: Package,          gradient: "from-amber-500 to-orange-600"     },
  { id: "balance",           label: "Balance Sheet",     icon: PieChart,         gradient: "from-violet-600 to-purple-700"    },
  { id: "party-balances",    label: "Party Balances",    icon: Users,            gradient: "from-pink-600 to-rose-700"        },
  { id: "trial-balance",     label: "Trial Balance",     icon: Scale,            gradient: "from-indigo-600 to-indigo-700"    },
  { id: "shipments",         label: "Shipments",         icon: Truck,            gradient: "from-sky-600 to-blue-700"         },
  { id: "courier-dues",      label: "Courier Dues",      icon: DollarSign,       gradient: "from-orange-500 to-red-600"       },
  { id: "product-analytics", label: "Product Analytics", icon: BarChart2,        gradient: "from-teal-600 to-cyan-700"        },
  { id: "analytics",         label: "Analytics",         icon: BarChart3,        gradient: "from-fuchsia-600 to-violet-700"   },
] as const;

type ReportTabId = typeof REPORT_TABS[number]["id"];

export default function ReportsHub() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(search);
  const activeTab = (params.get("tab") || "overview") as ReportTabId;

  return (
    <div className="min-h-full" data-testid="page-reports">
      {/* Tab card nav strip */}
      <div className="border-b bg-muted/20 px-6 py-4">
        <div className="flex gap-3 overflow-x-auto scrollbar-none" data-testid="reports-tab-nav">
          {REPORT_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setLocation(`/reports?tab=${tab.id}`)}
                data-testid={`reports-tab-${tab.id}`}
                className={[
                  "relative flex-shrink-0 flex flex-col items-center justify-center gap-2.5",
                  "px-4 py-5 rounded-2xl cursor-pointer select-none",
                  "min-w-[110px] transition-all duration-200 ease-out overflow-hidden",
                  `bg-gradient-to-br ${tab.gradient}`,
                  isActive
                    ? "ring-inset ring-[3px] ring-white/80 shadow-2xl brightness-110"
                    : "opacity-75 hover:opacity-95 shadow-md",
                ].join(" ")}
              >
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ backgroundImage: "repeating-linear-gradient(45deg,rgba(255,255,255,0.07) 0px,rgba(255,255,255,0.07) 1px,transparent 1px,transparent 9px)" }}
                />
                <Icon className="relative w-6 h-6 text-white drop-shadow-sm" />
                <span className="relative text-[11px] font-bold text-white/95 text-center leading-tight whitespace-nowrap tracking-wide drop-shadow-sm">
                  {tab.label}
                </span>
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
        {activeTab === "shipments"         && <Shipments />}
        {activeTab === "courier-dues"      && <CourierDuesPage />}
        {activeTab === "product-analytics" && <ProductAnalyticsPage />}
        {activeTab === "analytics"         && <Analytics />}
      </div>
    </div>
  );
}
