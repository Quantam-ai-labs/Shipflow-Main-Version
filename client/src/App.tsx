import { useState, Component, ErrorInfo, ReactNode, Suspense, lazy } from "react";
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

function isChunkLoadError(error: Error): boolean {
  const msg = error?.message || "";
  const name = error?.name || "";
  return (
    name === "ChunkLoadError" ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Loading chunk") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Unable to preload CSS")
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; isChunkError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, isChunkError: isChunkLoadError(error) };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App crashed:", error, errorInfo);
    if (isChunkLoadError(error)) {
      // New deployment detected — silently reload to get fresh chunks
      window.location.reload();
    }
  }
  render() {
    if (this.state.hasError) {
      if (this.state.isChunkError) {
        return (
          <div className="flex items-center justify-center min-h-screen bg-background">
            <div className="text-center space-y-4 p-8">
              <RefreshCw className="w-12 h-12 text-primary mx-auto animate-spin" />
              <h2 className="text-xl font-semibold">Loading new version…</h2>
              <p className="text-muted-foreground">A new update is available. Refreshing automatically.</p>
            </div>
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center min-h-screen bg-background">
          <div className="text-center space-y-4 p-8">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Something went wrong</h2>
            <p className="text-muted-foreground">The page encountered an error. Please reload to continue.</p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Button onClick={() => window.location.reload()} data-testid="button-reload">
                <RefreshCw className="w-4 h-4 mr-2" />
                Reload Page
              </Button>
              <Button variant="outline" onClick={() => { window.location.href = "/dashboard"; }} data-testid="button-go-dashboard">
                Go to Dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function LocationBoundedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary key={location}>{children}</ErrorBoundary>;
}

function PageLoader() {
  return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  
import AuthPage from "@/pages/auth";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";
import PrivacyPolicy from "@/pages/legal/privacy-policy";
import TermsOfService from "@/pages/legal/terms-of-service";
import DataDeletion from "@/pages/legal/data-deletion";
import Onboarding from "@/pages/onboarding";
import AdminPanel from "@/pages/admin";
import AdminLoginPage from "@/pages/admin-login";
import MerchantSetup from "@/pages/merchant-setup";
import WarehousePage from "@/pages/warehouse";
import AgentChatPage from "@/pages/agent-chat";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const Pipeline = lazy(() => import("@/pages/pipeline"));
const OrderDetails = lazy(() => import("@/pages/order-details"));
const Shipments = lazy(() => import("@/pages/shipments"));
const Analytics = lazy(() => import("@/pages/analytics"));
const CodReconciliationHub = lazy(() => import("@/pages/cod-reconciliation-hub"));
const PaymentLedger = lazy(() => import("@/pages/payment-ledger"));
const ManageCheques = lazy(() => import("@/pages/manage-cheques"));
const Team = lazy(() => import("@/pages/team"));
const Settings = lazy(() => import("@/pages/settings"));
const InviteAccept = lazy(() => import("@/pages/invite-accept"));
const PrintLabels = lazy(() => import("@/pages/print-labels"));
const Products = lazy(() => import("@/pages/products"));
const ShopifyProducts = lazy(() => import("@/pages/shopify-products"));
const ShopifyProductDetail = lazy(() => import("@/pages/shopify-product-detail"));
const ProductAnalytics = lazy(() => import("@/pages/product-analytics"));
const ExpenseTracker = lazy(() => import("@/pages/expense-tracker"));
const CourierDues = lazy(() => import("@/pages/courier-dues"));
const FinancialDashboard = lazy(() => import("@/pages/financial-dashboard"));
const AccountingOverview = lazy(() => import("@/pages/accounting/overview"));
const AccountingParties = lazy(() => import("@/pages/accounting/parties"));
const AccountingProducts = lazy(() => import("@/pages/accounting/products"));
const AccountingStock = lazy(() => import("@/pages/accounting/stock"));
const AccountingSales = lazy(() => import("@/pages/accounting/sales"));
const SaleOrdersPage = lazy(() => import("@/pages/accounting/sale-orders"));
const AccountingExpenses = lazy(() => import("@/pages/accounting/expenses"));
const AccountingCodReceivable = lazy(() => import("@/pages/accounting/cod-receivable"));
const AccountingCourierPayable = lazy(() => import("@/pages/accounting/courier-payable"));
const AccountingPnl = lazy(() => import("@/pages/accounting/reports/pnl"));
const AccountingBalanceSheet = lazy(() => import("@/pages/accounting/reports/balance-sheet"));
const AccountingCashFlow = lazy(() => import("@/pages/accounting/reports/cash-flow"));
const AccountingStockReport = lazy(() => import("@/pages/accounting/reports/stock"));
const AccountingPartyBalances = lazy(() => import("@/pages/accounting/reports/party-balances"));
const AccountingLedger = lazy(() => import("@/pages/accounting/ledger"));
const AccountingTrialBalance = lazy(() => import("@/pages/accounting/trial-balance"));
const AccountingCashAccounts = lazy(() => import("@/pages/accounting/cash-accounts"));
const AccountingSettings = lazy(() => import("@/pages/accounting/settings"));
const AccountingTransactions = lazy(() => import("@/pages/accounting/transactions"));
const OpeningBalancesPage = lazy(() => import("@/pages/accounting/opening-balances"));
const MarketingDashboard = lazy(() => import("@/pages/marketing/dashboard"));
const AdsManager = lazy(() => import("@/pages/marketing/ads-manager"));
const AdsProfitability = lazy(() => import("@/pages/marketing/ads-profitability"));
const AdAttribution = lazy(() => import("@/pages/marketing/ad-attribution"));
const RevenueTruth = lazy(() => import("@/pages/marketing/revenue-truth"));
const ReportsHub = lazy(() => import("@/pages/reports"));
const AIAssistant = lazy(() => import("@/pages/ai-assistant"));
const SupportDashboardPage = lazy(() => import("@/pages/support/dashboard"));
const SupportTemplatesPage = lazy(() => import("@/pages/support/templates"));
const SupportChatPage = lazy(() => import("@/pages/support/chat"));
const SupportConnectionPage = lazy(() => import("@/pages/support/connection"));
const SupportRoboCallPage = lazy(() => import("@/pages/support/robocall"));
const SupportCallQueuePage = lazy(() => import("@/pages/support/call-queue"));
const SupportComplaintsPage = lazy(() => import("@/pages/support/complaints"));
const SalesLauncher = lazy(() => import("@/pages/meta/sales-launcher"));
const MetaMediaLibrary = lazy(() => import("@/pages/meta/media-library"));
const MetaBulkLaunch = lazy(() => import("@/pages/meta/bulk-launch"));
const MetaCampaigns = lazy(() => import("@/pages/meta/campaigns"));
const MetaAudiences = lazy(() => import("@/pages/meta/audiences"));
const MetaAutomationRules = lazy(() => import("@/pages/meta/automation-rules"));
const PricingPage = lazy(() => import("@/pages/pricing"));
const ContactPage = lazy(() => import("@/pages/contact"));
const LoadsheetPage = lazy(() => import("@/pages/loadsheet"));
const CostDashboard = lazy(() => import("@/pages/admin/cost-dashboard"));
function OnboardingBanner() {
  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between gap-2" data-testid="banner-onboarding">
      <div className="flex items-center gap-2 text-sm text-amber-400">
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
  "/support/complaints": "support-complaints",
  "/meta/launcher": "meta-sales-launcher",
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
    <Suspense fallback={<PageLoader />}>
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
      <Route path="/support/complaints">{() => <ProtectedRoute component={SupportComplaintsPage} path="/support/complaints" />}</Route>
      <Route path="/meta/launcher">{() => <ProtectedRoute component={SalesLauncher} path="/meta/launcher" />}</Route>
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
      <Route path="/admin/cost-dashboard" component={CostDashboard} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
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
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/invite/:token" component={InviteAccept} />
        </Switch>
      </Suspense>
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
  if (location === "/pricing") return <Suspense fallback={<PageLoader />}><PricingPage /></Suspense>;
  if (location === "/contact") return <Suspense fallback={<PageLoader />}><ContactPage /></Suspense>;

  if (!isAuthenticated) {
    if (location === "/" || location === "") return <Landing />;
    return <AuthPage />;
  }

  if (location === "/" || location === "" || location === "/api/login" || location === "/auth") {
    return <Redirect to="/dashboard" />;
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
    return <Suspense fallback={<PageLoader />}><PrintLabels /></Suspense>;
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
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="shipflow-theme-v2">
        <TooltipProvider>
          <DateRangeProvider>
            <LocationBoundedErrorBoundary>
              <MainApp />
              <Toaster />
            </LocationBoundedErrorBoundary>
          </DateRangeProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
