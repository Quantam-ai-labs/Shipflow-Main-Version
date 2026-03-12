import { useState, Component, ErrorInfo, ReactNode } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useMutation, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DateRangeProvider, useDateRange } from "@/contexts/date-range-context";
import { DateRangePicker } from "@/components/date-range-picker";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, RefreshCw, ShieldAlert, Shield } from "lucide-react";
import { refreshAllData, syncAndRefreshAllData, apiRequest } from "./lib/queryClient";
import { Link } from "wouter";
import { NotificationBell } from "@/components/notification-bell";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App crashed:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-background">
          <div className="text-center space-y-4 p-8">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Something went wrong</h2>
            <p className="text-muted-foreground">The page encountered an error. Please reload to continue.</p>
            <Button onClick={() => window.location.reload()} data-testid="button-reload">
              <RefreshCw className="w-4 h-4 mr-2" />
              Reload Page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import Pipeline from "@/pages/pipeline";
import OrderDetails from "@/pages/order-details";
import Shipments from "@/pages/shipments";
import Analytics from "@/pages/analytics";
import CodReconciliationHub from "@/pages/cod-reconciliation-hub";
import PaymentLedger from "@/pages/payment-ledger";
import ManageCheques from "@/pages/manage-cheques";
import Team from "@/pages/team";
import Settings from "@/pages/settings";
import Onboarding from "@/pages/onboarding";
import AdminPanel from "@/pages/admin";
import AdminLoginPage from "@/pages/admin-login";
import MerchantSetup from "@/pages/merchant-setup";
import InviteAccept from "@/pages/invite-accept";

import PrintLabels from "@/pages/print-labels";
import Products from "@/pages/products";
import ShopifyProducts from "@/pages/shopify-products";
import ShopifyProductDetail from "@/pages/shopify-product-detail";
import ProductAnalytics from "@/pages/product-analytics";
import ExpenseTracker from "@/pages/expense-tracker";
import CourierDues from "@/pages/courier-dues";
import FinancialDashboard from "@/pages/financial-dashboard";
import AccountingOverview from "@/pages/accounting/overview";
import AccountingParties from "@/pages/accounting/parties";
import AccountingProducts from "@/pages/accounting/products";
import AccountingStock from "@/pages/accounting/stock";
import AccountingSales from "@/pages/accounting/sales";
import SaleOrdersPage from "@/pages/accounting/sale-orders";
import AccountingExpenses from "@/pages/accounting/expenses";
import AccountingCodReceivable from "@/pages/accounting/cod-receivable";
import AccountingCourierPayable from "@/pages/accounting/courier-payable";
import AccountingPnl from "@/pages/accounting/reports/pnl";
import AccountingBalanceSheet from "@/pages/accounting/reports/balance-sheet";
import AccountingCashFlow from "@/pages/accounting/reports/cash-flow";
import AccountingStockReport from "@/pages/accounting/reports/stock";
import AccountingPartyBalances from "@/pages/accounting/reports/party-balances";
import AccountingLedger from "@/pages/accounting/ledger";
import AccountingTrialBalance from "@/pages/accounting/trial-balance";
import AccountingCashAccounts from "@/pages/accounting/cash-accounts";
import AccountingSettings from "@/pages/accounting/settings";
import AccountingTransactions from "@/pages/accounting/transactions";
import OpeningBalancesPage from "@/pages/accounting/opening-balances";
import MarketingDashboard from "@/pages/marketing/dashboard";
import AdsManager from "@/pages/marketing/ads-manager";
import AdsProfitability from "@/pages/marketing/ads-profitability";
import AdAttribution from "@/pages/marketing/ad-attribution";
import RevenueTruth from "@/pages/marketing/revenue-truth";
import ReportsHub from "@/pages/reports";
import AIAssistant from "@/pages/ai-assistant";
import SupportDashboardPage from "@/pages/support/dashboard";
import SupportTemplatesPage from "@/pages/support/templates";
import SupportChatPage from "@/pages/support/chat";
import SupportConnectionPage from "@/pages/support/connection";
import SupportRoboCallPage from "@/pages/support/robocall";
import SupportCallQueuePage from "@/pages/support/call-queue";
import MetaAdLauncher from "@/pages/meta/launcher";
import MetaMediaLibrary from "@/pages/meta/media-library";
import MetaBulkLaunch from "@/pages/meta/bulk-launch";
import MetaCampaigns from "@/pages/meta/campaigns";
import MetaAudiences from "@/pages/meta/audiences";
import MetaAutomationRules from "@/pages/meta/automation-rules";
import PrivacyPolicy from "@/pages/legal/privacy-policy";
import TermsOfService from "@/pages/legal/terms-of-service";
import DataDeletion from "@/pages/legal/data-deletion";
import NotFound from "@/pages/not-found";
import LoadsheetPage from "@/pages/loadsheet";
import WarehousePage from "@/pages/warehouse";
import AgentChatPage from "@/pages/agent-chat";

function OnboardingBanner() {
  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center justify-between gap-2" data-testid="banner-onboarding">
      <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>Setup incomplete</span>
      </div>
      <Link href="/onboarding">
        <Button variant="outline" size="sm" data-testid="button-continue-setup">
          Continue Setup <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </Link>
    </div>
  );
}

const routeToPageId: Record<string, string> = {
  "/shipments": "shipments",
  "/analytics": "analytics-dashboard",
  "/cod-reconciliation": "cod-reconciliation",
  "/payment-ledger": "payment-ledger",
  "/manage-cheques": "manage-cheques",
  "/team": "team",
  "/shopify-products": "shopify-products",
  "/product-analytics": "product-analytics",
  "/accounting": "overview",
  "/accounting/transactions": "money",
  "/accounting/parties": "customers",
  "/accounting/products": "products",
  "/accounting/stock": "stock",
  "/accounting/sales": "sale-orders",
  "/accounting/sale-orders": "sale-orders",
  "/accounting/expenses": "expense-history",
  "/accounting/cod-receivable": "cod-receivable",
  "/accounting/courier-payable": "courier-payable",
  "/accounting/reports/pnl": "profit-loss",
  "/accounting/reports/balance-sheet": "balance-snapshot",
  "/accounting/reports/cash-flow": "cash-flow",
  "/accounting/reports/stock": "stock-report",
  "/accounting/reports/party-balances": "party-balances",
  "/accounting/ledger": "ledger",
  "/accounting/trial-balance": "trial-balance",
  "/accounting/cash-accounts": "cash-accounts",
  "/accounting/opening-balances": "opening-balances",
  "/reports": "reports-hub",
  "/ai": "ai-hub",
  "/marketing": "ads-dashboard",
  "/marketing/ads-manager": "ads-manager",
  "/marketing/profitability": "ads-profitability",
  "/marketing/attribution": "ads-attribution",
  "/marketing/revenue-truth": "revenue-truth",
  "/accounting/settings": "preferences",
  "/settings/shopify": "settings-shopify",
  "/settings/couriers": "settings-couriers",
  "/settings/status-mapping": "settings-status-mapping",
  "/settings/marketing": "settings-marketing",
  "/settings": "settings",
  "/loadsheet": "loadsheet",
  "/support/dashboard": "support-dashboard",
  "/support/templates": "support-templates",
  "/support/chat": "support-chat",
  "/support/connection": "support-connection",
  "/support/robocall": "support-robocall",
  "/support/call-queue": "support-call-queue",
  "/meta/launcher": "meta-launcher",
  "/meta/bulk-launch": "meta-bulk-launch",
  "/meta/media-library": "meta-media-library",
  "/meta/campaigns": "meta-campaigns",
};

function getPageIdForRoute(path: string): string | null {
  if (routeToPageId[path]) return routeToPageId[path];
  if (path.startsWith("/orders/")) return path.startsWith("/orders/detail/") ? null : `orders-${path.split("/orders/")[1]}`;
  if (path.startsWith("/shopify-products/")) return "shopify-products";
  return null;
}

function usePageAccess() {
  const { user } = useAuth();
  const allowedPages = user?.allowedPages;
  const hasRestrictions = allowedPages !== null && allowedPages !== undefined && allowedPages.length > 0;

  return {
    canAccess: (pageId: string | null) => {
      if (!hasRestrictions || !pageId) return true;
      return allowedPages!.includes(pageId);
    },
    hasRestrictions,
  };
}

function ProtectedRoute({ component: Component, path }: { component: React.ComponentType<any>; path: string }) {
  const { canAccess } = usePageAccess();
  const { user } = useAuth();
  const pageId = getPageIdForRoute(path);

  if (path.startsWith("/settings")) {
    const canAccessSettings = user?.isMerchantOwner || user?.teamRole === "manager" || user?.teamRole === "admin";
    if (!canAccessSettings) {
      return <Redirect to="/dashboard" />;
    }
  }

  if (!canAccess(pageId)) {
    return <Redirect to="/dashboard" />;
  }
  return <Component />;
}

function AppRoutes() {
  const { canAccess } = usePageAccess();
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/orders/detail/:id" component={OrderDetails} />
      <Route path="/orders/:stage">{(params: { stage: string }) => {
        const pageId = `orders-${params.stage}`;
        if (!canAccess(pageId)) return <Redirect to="/dashboard" />;
        return <Pipeline />;
      }}</Route>
      <Route path="/orders">
        <Redirect to="/orders/new" />
      </Route>
      <Route path="/shipments">{() => <ProtectedRoute component={Shipments} path="/shipments" />}</Route>
      <Route path="/analytics">{() => <ProtectedRoute component={Analytics} path="/analytics" />}</Route>
      <Route path="/cod-reconciliation">{() => <ProtectedRoute component={CodReconciliationHub} path="/cod-reconciliation" />}</Route>
      <Route path="/payment-ledger">{() => <ProtectedRoute component={PaymentLedger} path="/payment-ledger" />}</Route>
      <Route path="/manage-cheques">{() => <ProtectedRoute component={ManageCheques} path="/manage-cheques" />}</Route>
      <Route path="/team">{() => <ProtectedRoute component={Team} path="/team" />}</Route>
      <Route path="/integrations">
        <Redirect to="/settings?tab=shopify" />
      </Route>
      <Route path="/products" component={Products} />
      <Route path="/shopify-products/:id">{() => <ProtectedRoute component={ShopifyProductDetail} path="/shopify-products" />}</Route>
      <Route path="/shopify-products">{() => <ProtectedRoute component={ShopifyProducts} path="/shopify-products" />}</Route>
      <Route path="/product-analytics">{() => <ProtectedRoute component={ProductAnalytics} path="/product-analytics" />}</Route>
      <Route path="/expense-tracker" component={ExpenseTracker} />
      <Route path="/courier-dues" component={CourierDues} />
      <Route path="/financial-dashboard" component={FinancialDashboard} />
      <Route path="/accounting">{() => <ProtectedRoute component={AccountingOverview} path="/accounting" />}</Route>
      <Route path="/accounting/transactions">{() => <ProtectedRoute component={AccountingTransactions} path="/accounting/transactions" />}</Route>
      <Route path="/accounting/parties">{() => <ProtectedRoute component={AccountingParties} path="/accounting/parties" />}</Route>
      <Route path="/accounting/products">{() => <ProtectedRoute component={AccountingProducts} path="/accounting/products" />}</Route>
      <Route path="/accounting/stock">{() => <ProtectedRoute component={AccountingStock} path="/accounting/stock" />}</Route>
      <Route path="/accounting/sales">{() => <ProtectedRoute component={AccountingSales} path="/accounting/sales" />}</Route>
      <Route path="/accounting/sale-orders">{() => <ProtectedRoute component={SaleOrdersPage} path="/accounting/sale-orders" />}</Route>
      <Route path="/accounting/expenses">{() => <ProtectedRoute component={AccountingExpenses} path="/accounting/expenses" />}</Route>
      <Route path="/accounting/cod-receivable">{() => <ProtectedRoute component={AccountingCodReceivable} path="/accounting/cod-receivable" />}</Route>
      <Route path="/accounting/courier-payable">{() => <ProtectedRoute component={AccountingCourierPayable} path="/accounting/courier-payable" />}</Route>
      <Route path="/accounting/reports/pnl">{() => <ProtectedRoute component={AccountingPnl} path="/accounting/reports/pnl" />}</Route>
      <Route path="/accounting/reports/balance-sheet">{() => <ProtectedRoute component={AccountingBalanceSheet} path="/accounting/reports/balance-sheet" />}</Route>
      <Route path="/accounting/reports/cash-flow">{() => <ProtectedRoute component={AccountingCashFlow} path="/accounting/reports/cash-flow" />}</Route>
      <Route path="/accounting/reports/stock">{() => <ProtectedRoute component={AccountingStockReport} path="/accounting/reports/stock" />}</Route>
      <Route path="/accounting/reports/party-balances">{() => <ProtectedRoute component={AccountingPartyBalances} path="/accounting/reports/party-balances" />}</Route>
      <Route path="/accounting/ledger">{() => <ProtectedRoute component={AccountingLedger} path="/accounting/ledger" />}</Route>
      <Route path="/accounting/trial-balance">{() => <ProtectedRoute component={AccountingTrialBalance} path="/accounting/trial-balance" />}</Route>
      <Route path="/accounting/cash-accounts">{() => <ProtectedRoute component={AccountingCashAccounts} path="/accounting/cash-accounts" />}</Route>
      <Route path="/accounting/opening-balances">{() => <ProtectedRoute component={OpeningBalancesPage} path="/accounting/opening-balances" />}</Route>
      <Route path="/reports">{() => <ProtectedRoute component={ReportsHub} path="/reports" />}</Route>
      <Route path="/ai">{() => <ProtectedRoute component={AIAssistant} path="/ai" />}</Route>
      <Route path="/marketing">{() => <ProtectedRoute component={MarketingDashboard} path="/marketing" />}</Route>
      <Route path="/marketing/ads-manager">{() => <ProtectedRoute component={AdsManager} path="/marketing/ads-manager" />}</Route>
      <Route path="/marketing/profitability">{() => <ProtectedRoute component={AdsProfitability} path="/marketing/profitability" />}</Route>
      <Route path="/marketing/attribution">{() => <ProtectedRoute component={AdAttribution} path="/marketing/attribution" />}</Route>
      <Route path="/marketing/revenue-truth">{() => <ProtectedRoute component={RevenueTruth} path="/marketing/revenue-truth" />}</Route>
      <Route path="/support/dashboard">{() => <ProtectedRoute component={SupportDashboardPage} path="/support/dashboard" />}</Route>
      <Route path="/support/templates">{() => <ProtectedRoute component={SupportTemplatesPage} path="/support/templates" />}</Route>
      <Route path="/support/chat" component={SupportChatPage} />
      <Route path="/support/connection">{() => <ProtectedRoute component={SupportConnectionPage} path="/support/connection" />}</Route>
      <Route path="/support/robocall">{() => <ProtectedRoute component={SupportRoboCallPage} path="/support/robocall" />}</Route>
      <Route path="/support/call-queue">{() => <ProtectedRoute component={SupportCallQueuePage} path="/support/call-queue" />}</Route>
      <Route path="/meta/launcher">{() => <ProtectedRoute component={MetaAdLauncher} path="/meta/launcher" />}</Route>
      <Route path="/meta/bulk-launch">{() => <ProtectedRoute component={MetaBulkLaunch} path="/meta/bulk-launch" />}</Route>
      <Route path="/meta/media-library">{() => <ProtectedRoute component={MetaMediaLibrary} path="/meta/media-library" />}</Route>
      <Route path="/meta/campaigns">{() => <ProtectedRoute component={MetaCampaigns} path="/meta/campaigns" />}</Route>
      <Route path="/meta/audiences">{() => <ProtectedRoute component={MetaAudiences} path="/meta/audiences" />}</Route>
      <Route path="/meta/automation-rules">{() => <ProtectedRoute component={MetaAutomationRules} path="/meta/automation-rules" />}</Route>
      <Route path="/accounting/settings">{() => <ProtectedRoute component={AccountingSettings} path="/accounting/settings" />}</Route>
      <Route path="/loadsheet">{() => <ProtectedRoute component={LoadsheetPage} path="/loadsheet" />}</Route>
      <Route path="/warehouse/:slug" component={WarehousePage} />
      <Route path="/settings/shopify"><Redirect to="/settings?tab=shopify" /></Route>
      <Route path="/settings/couriers"><Redirect to="/settings?tab=couriers" /></Route>
      <Route path="/settings/status-mapping"><Redirect to="/settings?tab=mapping" /></Route>
      <Route path="/settings/marketing"><Redirect to="/settings?tab=marketing" /></Route>
      <Route path="/settings">{() => <ProtectedRoute component={Settings} path="/settings" />}</Route>
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-service" component={TermsOfService} />
      <Route path="/data-deletion" component={DataDeletion} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/admin" component={AdminPanel} />
      <Route component={NotFound} />
    </Switch>
  );
}

function HeaderDateRangePicker() {
  const { dateRange, setDateRange } = useDateRange();
  return (
    <DateRangePicker
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      data-testid="button-global-date-range"
    />
  );
}

function GlobalRefreshButton() {
  const [syncing, setSyncing] = useState(false);

  const handleRefresh = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await syncAndRefreshAllData();
      if (result.errors.length > 0) {
        console.warn("[Refresh] Partial sync errors:", result.errors);
      }
    } catch (err) {
      console.error("[Refresh] Sync failed:", err);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleRefresh}
      disabled={syncing}
      title={syncing ? "Syncing with Shopify..." : "Refresh all data"}
      data-testid="button-global-refresh"
      className="h-8 w-8"
    >
      <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
    </Button>
  );
}

function ImpersonationBanner() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const stopMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/stop-impersonation");
      return res.json();
    },
    onSuccess: () => {
      qc.clear();
      qc.invalidateQueries();
      setLocation("/admin");
    },
  });

  if (!user?.isImpersonating) return null;

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between text-sm font-medium" data-testid="impersonation-banner">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4" />
        <span>Viewing as <strong>{user.email}</strong> (impersonation mode)</span>
      </div>
      <Button size="sm" variant="secondary" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending} data-testid="button-stop-impersonation">
        {stopMutation.isPending ? "Returning..." : "Return to Admin"}
      </Button>
    </div>
  );
}

function AuthenticatedLayout() {
  const { user } = useAuth();
  const onboardingIncomplete = user?.merchant?.onboardingStep !== "COMPLETED";

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <DateRangeProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 overflow-hidden">
            <ImpersonationBanner />
            <header className="flex items-center justify-between gap-4 px-4 py-2.5 border-b bg-background">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-2">
                <GlobalRefreshButton />
                <NotificationBell />
                <HeaderDateRangePicker />
                <ThemeToggle />
              </div>
            </header>
            {onboardingIncomplete && <OnboardingBanner />}
            <main className="flex-1 overflow-auto p-4 md:p-6">
              <AppRoutes />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </DateRangeProvider>
  );
}

function SuspendedScreen() {
  const { logout } = useAuth();
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center space-y-4 max-w-md px-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold" data-testid="text-suspended-title">Account Suspended</h1>
        <p className="text-muted-foreground">Your merchant account has been suspended. Please contact support for assistance.</p>
        <Button variant="outline" onClick={() => logout()} data-testid="button-suspended-logout">Sign Out</Button>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-md bg-primary flex items-center justify-center mx-auto animate-pulse">
          <svg className="w-7 h-7 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-32 mx-auto" />
          <Skeleton className="h-3 w-24 mx-auto" />
        </div>
      </div>
    </div>
  );
}

function MainApp() {
  const { isLoading, isAuthenticated, isSuspended, user } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isSuspended) {
    return <SuspendedScreen />;
  }

  // Admin login page is always accessible
  if (location === "/admin-login") {
    if (isAuthenticated && user?.role === "SUPER_ADMIN") {
      return <Redirect to="/admin" />;
    }
    return <AdminLoginPage />;
  }

  // Invite acceptance page is accessible to both authenticated and unauthenticated users
  if (location.startsWith("/invite/")) {
    return (
      <Switch>
        <Route path="/invite/:token" component={InviteAccept} />
      </Switch>
    );
  }

  // Merchant setup page is accessible without authentication
  if (location.startsWith("/merchant-setup/")) {
    return (
      <Switch>
        <Route path="/merchant-setup/:token" component={MerchantSetup} />
      </Switch>
    );
  }

  // Warehouse PWA is publicly accessible (PIN-gated on the page itself)
  if (location.startsWith("/warehouse/")) {
    return (
      <Switch>
        <Route path="/warehouse/:slug" component={WarehousePage} />
      </Switch>
    );
  }

  if (location.startsWith("/agent-chat")) {
    return <AgentChatPage />;
  }

  if (location.startsWith("/privacy-policy")) return <PrivacyPolicy />;
  if (location.startsWith("/terms-of-service")) return <TermsOfService />;
  if (location.startsWith("/data-deletion")) return <DataDeletion />;

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  // Super Admin users go straight to admin panel (no merchant needed)
  if (user?.role === "SUPER_ADMIN" && !user?.merchantId) {
    return (
      <Switch>
        <Route path="/admin" component={AdminPanel} />
        <Route>
          <Redirect to="/admin" />
        </Route>
      </Switch>
    );
  }

  if (location.startsWith("/print-labels")) {
    return <PrintLabels />;
  }

  if (user?.merchant?.onboardingStep !== "COMPLETED" && location !== "/onboarding" && location !== "/admin") {
    return (
      <Switch>
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/admin" component={AdminPanel} />
        <Route>
          <Redirect to="/onboarding" />
        </Route>
      </Switch>
    );
  }

  return <AuthenticatedLayout />;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="light" storageKey="shipflow-theme">
          <TooltipProvider>
            <MainApp />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
