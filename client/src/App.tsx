import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Orders from "@/pages/orders";
import Pipeline from "@/pages/pipeline";
import OrderDetails from "@/pages/order-details";
import Shipments from "@/pages/shipments";
import Analytics from "@/pages/analytics";
import CodReconciliation from "@/pages/cod-reconciliation";
import Team from "@/pages/team";
import Integrations from "@/pages/integrations";
import Settings from "@/pages/settings";
import Onboarding from "@/pages/onboarding";
import NotFound from "@/pages/not-found";

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
      <Route path="/team" component={Team} />
      <Route path="/integrations" component={Integrations} />
      <Route path="/settings" component={Settings} />
      <Route path="/onboarding" component={Onboarding} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-4 p-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <AppRoutes />
          </main>
        </div>
      </div>
    </SidebarProvider>
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
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Landing />;
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
