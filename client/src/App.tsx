import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
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
import { AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";
import { Link } from "wouter";

import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import Pipeline from "@/pages/pipeline";
import OrderDetails from "@/pages/order-details";
import Shipments from "@/pages/shipments";
import Analytics from "@/pages/analytics";
import CodReconciliation from "@/pages/cod-reconciliation";
import PaymentLedger from "@/pages/payment-ledger";
import ManageCheques from "@/pages/manage-cheques";
import Team from "@/pages/team";
import Integrations from "@/pages/integrations";
import Settings from "@/pages/settings";
import Onboarding from "@/pages/onboarding";
import AdminPanel from "@/pages/admin";
import InviteAccept from "@/pages/invite-accept";
import PrintLabels from "@/pages/print-labels";
import Products from "@/pages/products";
import ProductAnalytics from "@/pages/product-analytics";
import ExpenseTracker from "@/pages/expense-tracker";
import StockLedger from "@/pages/stock-ledger";
import CourierDues from "@/pages/courier-dues";
import FinancialDashboard from "@/pages/financial-dashboard";
import AccountingOverview from "@/pages/accounting/overview";
import MoneyPage from "@/pages/accounting/money";
import AccountingParties from "@/pages/accounting/parties";
import AccountingProducts from "@/pages/accounting/products";
import AccountingStockReceipts from "@/pages/accounting/stock-receipts";
import AccountingSales from "@/pages/accounting/sales";
import AccountingExpenses from "@/pages/accounting/expenses";
import AccountingExpensesUnpaid from "@/pages/accounting/expenses-unpaid";
import AccountingCodReceivable from "@/pages/accounting/cod-receivable";
import AccountingCourierPayable from "@/pages/accounting/courier-payable";
import AccountingSettlements from "@/pages/accounting/settlements";
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
import NotFound from "@/pages/not-found";

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

function AppRoutes() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/orders/detail/:id" component={OrderDetails} />
      <Route path="/orders/:stage" component={Pipeline} />
      <Route path="/orders">
        <Redirect to="/orders/new" />
      </Route>
      <Route path="/shipments" component={Shipments} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/cod-reconciliation" component={CodReconciliation} />
      <Route path="/payment-ledger" component={PaymentLedger} />
      <Route path="/manage-cheques" component={ManageCheques} />
      <Route path="/team" component={Team} />
      <Route path="/integrations" component={Integrations} />
      <Route path="/products" component={Products} />
      <Route path="/product-analytics" component={ProductAnalytics} />
      <Route path="/expense-tracker" component={ExpenseTracker} />
      <Route path="/courier-dues" component={CourierDues} />
      <Route path="/financial-dashboard" component={FinancialDashboard} />
      <Route path="/stock-ledger" component={StockLedger} />
      <Route path="/accounting" component={AccountingOverview} />
      <Route path="/accounting/transactions" component={AccountingTransactions} />
      <Route path="/accounting/money" component={MoneyPage} />
      <Route path="/accounting/parties" component={AccountingParties} />
      <Route path="/accounting/products" component={AccountingProducts} />
      <Route path="/accounting/stock-receipts" component={AccountingStockReceipts} />
      <Route path="/accounting/sales" component={AccountingSales} />
      <Route path="/accounting/expenses" component={AccountingExpenses} />
      <Route path="/accounting/expenses-unpaid" component={AccountingExpensesUnpaid} />
      <Route path="/accounting/cod-receivable" component={AccountingCodReceivable} />
      <Route path="/accounting/courier-payable" component={AccountingCourierPayable} />
      <Route path="/accounting/settlements" component={AccountingSettlements} />
      <Route path="/accounting/reports/pnl" component={AccountingPnl} />
      <Route path="/accounting/reports/balance-sheet" component={AccountingBalanceSheet} />
      <Route path="/accounting/reports/cash-flow" component={AccountingCashFlow} />
      <Route path="/accounting/reports/stock" component={AccountingStockReport} />
      <Route path="/accounting/reports/party-balances" component={AccountingPartyBalances} />
      <Route path="/accounting/ledger" component={AccountingLedger} />
      <Route path="/accounting/trial-balance" component={AccountingTrialBalance} />
      <Route path="/accounting/cash-accounts" component={AccountingCashAccounts} />
      <Route path="/accounting/settings" component={AccountingSettings} />
      <Route path="/settings" component={Settings} />
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
            <header className="flex items-center justify-between gap-4 p-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-2">
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

  // Invite acceptance page is accessible to both authenticated and unauthenticated users
  if (location.startsWith("/invite/")) {
    return (
      <Switch>
        <Route path="/invite/:token" component={InviteAccept} />
      </Switch>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
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
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="shipflow-theme">
        <TooltipProvider>
          <MainApp />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
