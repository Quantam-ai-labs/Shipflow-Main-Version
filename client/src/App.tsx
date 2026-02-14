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
import VoiceCallTest from "@/pages/voice-call-test";
import Team from "@/pages/team";
import Integrations from "@/pages/integrations";
import Settings from "@/pages/settings";
import Onboarding from "@/pages/onboarding";
import AdminPanel from "@/pages/admin";
import InviteAccept from "@/pages/invite-accept";
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
      <Route path="/voice-call-test" component={VoiceCallTest} />
      <Route path="/team" component={Team} />
      <Route path="/integrations" component={Integrations} />
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
