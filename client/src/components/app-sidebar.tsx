import { useLocation, Link } from "wouter";
import { useDateRange } from "@/contexts/date-range-context";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@radix-ui/react-collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Package,
  Inbox,
  Clock,
  Pause,
  Truck,
  CheckCircle,
  XCircle,
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  Settings,
  Store,
  LogOut,
  ChevronUp,
  ChevronRight,
  Shield,
  BookmarkCheck,
  Send,
  PackageCheck,
  RotateCcw,
  Receipt,
  FileCheck,
  ShoppingBag,
  Calculator,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  UserCircle,
  ShoppingCart,
  PieChart,
  BookOpen,
  Landmark,
  Scale,
  Cog,
  ArrowLeftRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";

const topNavItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
];

const pipelineItems = [
  { title: "New Orders", url: "/orders/new", icon: Inbox, key: "NEW" },
  { title: "Confirmation Pending", url: "/orders/pending", icon: Clock, key: "PENDING" },
  { title: "Hold", url: "/orders/hold", icon: Pause, key: "HOLD" },
  { title: "Ready to Ship", url: "/orders/ready", icon: Truck, key: "READY_TO_SHIP" },
  { title: "Booked", url: "/orders/booked", icon: BookmarkCheck, key: "BOOKED" },
  { title: "Fulfilled", url: "/orders/fulfilled", icon: Send, key: "FULFILLED" },
  { title: "Delivered", url: "/orders/delivered", icon: PackageCheck, key: "DELIVERED" },
  { title: "Return", url: "/orders/return", icon: RotateCcw, key: "RETURN" },
  { title: "Cancelled", url: "/orders/cancelled", icon: XCircle, key: "CANCELLED" },
];

const bottomNavItems = [
  {
    title: "Shipments",
    url: "/shipments",
    icon: Truck,
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: BarChart3,
  },
];

const inventorySubItems = [
  {
    title: "Products",
    url: "/products",
    icon: ShoppingBag,
  },
  {
    title: "Product Analytics",
    url: "/product-analytics",
    icon: TrendingUp,
  },
];

const codSubItems = [
  {
    title: "COD Reconciliation",
    url: "/cod-reconciliation",
    icon: DollarSign,
  },
  {
    title: "Payment Ledger",
    url: "/payment-ledger",
    icon: Receipt,
  },
  {
    title: "Manage Cheques",
    url: "/manage-cheques",
    icon: FileCheck,
  },
];

const accountingOverviewItems = [
  { title: "Overview", url: "/accounting", icon: Wallet },
  { title: "Money", url: "/accounting/transactions", icon: ArrowLeftRight },
  { title: "Parties", url: "/accounting/parties", icon: UserCircle },
];

const accountingStockItems = [
  { title: "Products", url: "/accounting/products", icon: ShoppingBag },
  { title: "Add Stock", url: "/accounting/stock-receipts", icon: ArrowDownLeft },
  { title: "Sell", url: "/accounting/sales", icon: ShoppingCart },
  { title: "Sale Orders", url: "/accounting/sale-orders", icon: BookOpen },
];

const accountingExpenseItems = [
  { title: "Expense History", url: "/accounting/expenses", icon: Receipt },
  { title: "Needs Payment", url: "/accounting/expenses-unpaid", icon: Clock },
];

const accountingCourierItems = [
  { title: "COD Receivable", url: "/accounting/cod-receivable", icon: ArrowDownLeft },
  { title: "Courier Payable", url: "/accounting/courier-payable", icon: ArrowUpRight },
  { title: "Settlements", url: "/accounting/settlements", icon: Scale },
];

const accountingReportItems = [
  { title: "Profit & Loss", url: "/accounting/reports/pnl", icon: TrendingUp },
  { title: "Balance Snapshot", url: "/accounting/reports/balance-sheet", icon: PieChart },
  { title: "Cash Flow", url: "/accounting/reports/cash-flow", icon: BarChart3 },
  { title: "Stock Report", url: "/accounting/reports/stock", icon: Package },
  { title: "Party Balances", url: "/accounting/reports/party-balances", icon: Users },
];

const accountingAdvancedItems = [
  { title: "Ledger", url: "/accounting/ledger", icon: BookOpen },
  { title: "Trial Balance", url: "/accounting/trial-balance", icon: Scale },
  { title: "Cash Accounts", url: "/accounting/cash-accounts", icon: Landmark },
];

const accountingSetupItems = [
  { title: "Opening Balances", url: "/accounting/opening-balances", icon: Calculator },
];

const accountingSettingsItems = [
  { title: "Preferences", url: "/accounting/settings", icon: Cog },
];

const settingsNavItems = [
  {
    title: "Team",
    url: "/team",
    icon: Users,
  },
  {
    title: "Integrations",
    url: "/integrations",
    icon: Store,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout, isLoggingOut } = useAuth();

  const getUserInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  const getUserDisplayName = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user?.email || "User";
  };

  const { dateParams } = useDateRange();
  const countsUrl = `/api/orders/workflow-counts${dateParams.dateFrom || dateParams.dateTo ? `?${new URLSearchParams(Object.entries(dateParams).filter(([_, v]) => v)).toString()}` : ''}`;
  const { data: counts } = useQuery<Record<string, number>>({
    queryKey: ["/api/orders/workflow-counts", dateParams],
    queryFn: async () => {
      const res = await fetch(countsUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch counts");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: unmappedCount } = useQuery<{ count: number }>({
    queryKey: ["/api/unmapped-courier-statuses/count"],
    refetchInterval: 60000,
  });

  const isOrdersRouteActive = location.startsWith("/orders");
  const isInventoryRouteActive = location === "/products" || location === "/product-analytics";
  const isAccountingRouteActive = location.startsWith("/accounting") || location === "/financial-dashboard" || location === "/expense-tracker" || location === "/stock-ledger" || location === "/courier-dues";
  const isCodRouteActive = location === "/cod-reconciliation" || location === "/payment-ledger" || location === "/manage-cheques";

  const { data: acctSettings } = useQuery<{ advancedMode: boolean }>({
    queryKey: ["/api/accounting/settings"],
    enabled: !!user,
  });
  const advancedMode = acctSettings?.advancedMode ?? false;
  const totalOrderCount = counts
    ? Object.values(counts).reduce((sum, c) => sum + (c || 0), 0)
    : 0;

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/dashboard">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Package className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">ShipFlow</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {topNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                  >
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <Collapsible defaultOpen={isOrdersRouteActive} asChild className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton data-testid="nav-orders-toggle" tooltip="Orders">
                      <Package className="w-4 h-4" />
                      <span className="flex-1">Orders</span>
                      {totalOrderCount > 0 && (
                        <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 text-xs">
                          {totalOrderCount}
                        </Badge>
                      )}
                      <ChevronRight className="w-4 h-4 ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {pipelineItems.map((item) => {
                        const count = counts?.[item.key] || 0;
                        return (
                          <SidebarMenuSubItem key={item.key}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={location === item.url}
                            >
                              <Link href={item.url} data-testid={`nav-pipeline-${item.key.toLowerCase()}`}>
                                <item.icon className="w-3.5 h-3.5" />
                                <span className="flex-1">{item.title}</span>
                                {count > 0 && (
                                  <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 text-xs ml-auto">
                                    {count}
                                  </Badge>
                                )}
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>More</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {bottomNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                  >
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <Collapsible defaultOpen={isInventoryRouteActive} asChild className="group/inventory-collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton data-testid="nav-inventory-toggle" tooltip="Inventory">
                      <ShoppingBag className="w-4 h-4" />
                      <span className="flex-1">Inventory</span>
                      <ChevronRight className="w-4 h-4 ml-auto transition-transform duration-200 group-data-[state=open]/inventory-collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {inventorySubItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={location === item.url}
                          >
                            <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                              <item.icon className="w-3.5 h-3.5" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
              <Collapsible defaultOpen={isCodRouteActive} asChild className="group/cod-collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton data-testid="nav-cod-toggle" tooltip="COD & Payments">
                      <DollarSign className="w-4 h-4" />
                      <span className="flex-1">COD & Payments</span>
                      <ChevronRight className="w-4 h-4 ml-auto transition-transform duration-200 group-data-[state=open]/cod-collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {codSubItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={location === item.url}
                          >
                            <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                              <item.icon className="w-3.5 h-3.5" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
              <Collapsible defaultOpen={isAccountingRouteActive} asChild className="group/accounting-collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton data-testid="nav-accounting-toggle" tooltip="Accounting">
                      <Calculator className="w-4 h-4" />
                      <span className="flex-1">Accounting</span>
                      <ChevronRight className="w-4 h-4 ml-auto transition-transform duration-200 group-data-[state=open]/accounting-collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {accountingOverviewItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton asChild isActive={location === item.url}>
                            <Link href={item.url} data-testid={`nav-acct-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                              <item.icon className="w-3.5 h-3.5" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                      <SidebarMenuSubItem>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-2 pb-0.5 block">Stock & Sales</span>
                      </SidebarMenuSubItem>
                      {accountingStockItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton asChild isActive={location === item.url}>
                            <Link href={item.url} data-testid={`nav-acct-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                              <item.icon className="w-3.5 h-3.5" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                      <SidebarMenuSubItem>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-2 pb-0.5 block">Expenses</span>
                      </SidebarMenuSubItem>
                      {accountingExpenseItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton asChild isActive={location === item.url}>
                            <Link href={item.url} data-testid={`nav-acct-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                              <item.icon className="w-3.5 h-3.5" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                      <SidebarMenuSubItem>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-2 pb-0.5 block">Courier Money</span>
                      </SidebarMenuSubItem>
                      {accountingCourierItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton asChild isActive={location === item.url}>
                            <Link href={item.url} data-testid={`nav-acct-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                              <item.icon className="w-3.5 h-3.5" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                      <SidebarMenuSubItem>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-2 pb-0.5 block">Reports</span>
                      </SidebarMenuSubItem>
                      {accountingReportItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton asChild isActive={location === item.url}>
                            <Link href={item.url} data-testid={`nav-acct-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                              <item.icon className="w-3.5 h-3.5" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                      {advancedMode && (
                        <>
                          <SidebarMenuSubItem>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-2 pb-0.5 block">Advanced</span>
                          </SidebarMenuSubItem>
                          {accountingAdvancedItems.map((item) => (
                            <SidebarMenuSubItem key={item.title}>
                              <SidebarMenuSubButton asChild isActive={location === item.url}>
                                <Link href={item.url} data-testid={`nav-acct-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                                  <item.icon className="w-3.5 h-3.5" />
                                  <span>{item.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </>
                      )}
                      {accountingSetupItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton asChild isActive={location === item.url}>
                            <Link href={item.url} data-testid={`nav-acct-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                              <item.icon className="w-3.5 h-3.5" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                      {accountingSettingsItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton asChild isActive={location === item.url}>
                            <Link href={item.url} data-testid={`nav-acct-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                              <item.icon className="w-3.5 h-3.5" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                  >
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-4 h-4" />
                      <span className="flex-1">{item.title}</span>
                      {item.title === "Settings" && (unmappedCount?.count ?? 0) > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 min-w-[18px] justify-center" data-testid="badge-unmapped-statuses">
                          {unmappedCount!.count}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {user?.role === "SUPER_ADMIN" && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/admin"}>
                    <Link href="/admin" data-testid="nav-admin">
                      <Shield className="w-4 h-4" />
                      <span>Admin Panel</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-2 px-2" data-testid="button-user-menu">
              <Avatar className="h-8 w-8">
                <AvatarImage src={undefined} alt={getUserDisplayName()} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {getUserInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium truncate">{getUserDisplayName()}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer" data-testid="menu-settings">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => logout()}
              disabled={isLoggingOut}
              className="text-destructive focus:text-destructive cursor-pointer"
              data-testid="menu-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {isLoggingOut ? "Logging out..." : "Log out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
