import { useState } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { useDateRange } from "@/contexts/date-range-context";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  LayoutDashboard,
  Package,
  Inbox,
  Pause,
  Clock,
  Truck,
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
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  UserCircle,
  PieChart,
  BookOpen,
  Landmark,
  Scale,
  Calculator,
  Cog,
  ToggleLeft,
  ToggleRight,
  SlidersHorizontal,
  Megaphone,
  Activity,
  LayoutList,
  Brain,
  Home,
  MessageCircle,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface NavItem {
  id: string;
  title: string;
  url: string;
  icon: LucideIcon;
  key?: string;
}

interface NavGroup {
  id: string;
  title: string;
  icon: LucideIcon;
  items: NavItem[];
}

const orderItems: NavItem[] = [
  { id: "orders-all", title: "All Orders", url: "/orders/all", icon: LayoutList, key: "ALL" },
  { id: "orders-new", title: "New Orders", url: "/orders/new", icon: Inbox, key: "NEW" },
  { id: "orders-pending", title: "Confirmation Pending", url: "/orders/pending", icon: Clock, key: "PENDING" },
  { id: "orders-hold", title: "Hold", url: "/orders/hold", icon: Pause, key: "HOLD" },
  { id: "orders-ready", title: "Ready to Ship", url: "/orders/ready", icon: Truck, key: "READY_TO_SHIP" },
  { id: "orders-booked", title: "Booked", url: "/orders/booked", icon: BookmarkCheck, key: "BOOKED" },
  { id: "orders-fulfilled", title: "Shipped", url: "/orders/fulfilled", icon: Send, key: "FULFILLED" },
  { id: "orders-delivered", title: "Delivered", url: "/orders/delivered", icon: PackageCheck, key: "DELIVERED" },
  { id: "orders-return", title: "Returns", url: "/orders/return", icon: RotateCcw, key: "RETURN" },
  { id: "orders-cancelled", title: "Cancelled", url: "/orders/cancelled", icon: XCircle, key: "CANCELLED" },
];

const allNavGroups: NavGroup[] = [
  {
    id: "products",
    title: "Products",
    icon: ShoppingBag,
    items: [
      { id: "products", title: "Products", url: "/accounting/products", icon: ShoppingBag },
      { id: "stock-ledger", title: "Stock", url: "/stock-ledger", icon: BookOpen },
      { id: "add-stock", title: "Add Stock", url: "/accounting/stock-receipts", icon: ArrowDownLeft },
      { id: "shopify-products", title: "Shopify Sync", url: "/shopify-products", icon: Store },
    ],
  },
  {
    id: "money",
    title: "Money",
    icon: Wallet,
    items: [
      { id: "money", title: "Transactions", url: "/accounting/transactions", icon: Receipt },
      { id: "expense-history", title: "Expenses", url: "/accounting/expenses", icon: Calculator },
      { id: "needs-payment", title: "Needs Payment", url: "/accounting/expenses-unpaid", icon: Clock },
      { id: "customers", title: "Parties", url: "/accounting/parties", icon: UserCircle },
      { id: "sale-invoices", title: "Sales", url: "/accounting/sales", icon: Receipt },
      { id: "sale-orders", title: "Sale Orders", url: "/accounting/sale-orders", icon: BookOpen },
      { id: "payment-ledger", title: "Payment Ledger", url: "/payment-ledger", icon: Receipt },
      { id: "settlements", title: "Settlements", url: "/accounting/settlements", icon: Scale },
      { id: "cash-accounts", title: "Cash Accounts", url: "/accounting/cash-accounts", icon: Landmark },
      { id: "opening-balances", title: "Opening Balances", url: "/accounting/opening-balances", icon: Calculator },
    ],
  },
  {
    id: "growth",
    title: "Growth",
    icon: TrendingUp,
    items: [
      { id: "ads-dashboard", title: "Dashboard", url: "/marketing", icon: BarChart3 },
      { id: "ads-manager", title: "Campaigns", url: "/marketing/ads-manager", icon: Megaphone },
      { id: "live-campaigns", title: "Live Campaigns", url: "/marketing/live", icon: Activity },
      { id: "ads-profitability", title: "Profitability", url: "/marketing/profitability", icon: TrendingUp },
      { id: "whatsapp-hub", title: "WhatsApp", url: "/whatsapp", icon: MessageCircle },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    icon: BarChart3,
    items: [
      { id: "reports-hub", title: "Reports", url: "/reports", icon: BarChart3 },
    ],
  },
];

const settingsItems: NavItem[] = [
  { id: "settings-shopify", title: "Integrations", url: "/settings?tab=shopify", icon: Store },
  { id: "settings-couriers", title: "Couriers", url: "/settings?tab=couriers", icon: Truck },
  { id: "settings-status-mapping", title: "Status Mapping", url: "/settings?tab=mapping", icon: ArrowLeftRight },
  { id: "team", title: "Users & Roles", url: "/settings?tab=team", icon: Users },
  { id: "settings", title: "Notifications", url: "/settings?tab=notifications", icon: Settings },
  { id: "preferences", title: "Preferences", url: "/accounting/settings", icon: Cog },
];

const allPageIds = [
  ...orderItems.map(i => i.id),
  ...allNavGroups.flatMap(g => g.items.map(i => i.id)),
  ...settingsItems.map(i => i.id),
];

const defaultPinnedPages = [
  "orders-all", "orders-new", "orders-pending", "orders-ready", "orders-booked", "orders-fulfilled",
  "products", "add-stock", "shopify-products",
  "money", "customers", "sale-invoices", "cod-reconciliation", "payment-ledger",
  "ads-dashboard", "ads-profitability",
  "overview", "profit-loss", "shipments",
  "settings-shopify", "settings-couriers", "settings-status-mapping", "team", "settings", "preferences",
];

export function AppSidebar() {
  const [location] = useLocation();
  const searchString = useSearch();
  const { user, logout, isLoggingOut } = useAuth();
  const queryClient = useQueryClient();
  const [showPagePicker, setShowPagePicker] = useState(false);

  const getUserInitials = () => {
    const name = user?.sessionDisplayName;
    if (name) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      return name[0].toUpperCase();
    }
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  const getUserDisplayName = () => {
    if (user?.sessionDisplayName) return user.sessionDisplayName;
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

  const sidebarMode = user?.sidebarMode || "advanced";
  const pinnedPages: string[] = user?.sidebarPinnedPages?.length ? user.sidebarPinnedPages : defaultPinnedPages;
  const allowedPages: string[] | null = user?.allowedPages || null;
  const hasPageRestrictions = allowedPages !== null && allowedPages.length > 0;
  const canAccessSettings = user?.isMerchantOwner || user?.teamRole === "manager" || user?.teamRole === "admin";

  const updatePrefsMutation = useMutation({
    mutationFn: async (data: { sidebarMode?: string; sidebarPinnedPages?: string[] }) => {
      const res = await apiRequest("PATCH", "/api/sidebar-preferences", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const toggleMode = () => {
    const newMode = sidebarMode === "simple" ? "advanced" : "simple";
    updatePrefsMutation.mutate({ sidebarMode: newMode });
  };

  const isOrdersRouteActive = location.startsWith("/orders");
  const isSimple = sidebarMode === "simple";

  const applyPageRestrictions = (groups: NavGroup[]) => {
    if (!hasPageRestrictions) return groups;
    return groups
      .map(g => ({
        ...g,
        items: g.items.filter(i => allowedPages!.includes(i.id)),
      }))
      .filter(g => g.items.length > 0);
  };

  const filteredGroups = applyPageRestrictions(
    isSimple
      ? allNavGroups
          .map(g => ({
            ...g,
            items: g.items.filter(i => pinnedPages.includes(i.id)),
          }))
          .filter(g => g.items.length > 0)
      : allNavGroups
  );

  const filteredSettings = (() => {
    if (!canAccessSettings) return [];
    let items = isSimple
      ? settingsItems.filter(i => pinnedPages.includes(i.id))
      : settingsItems;
    if (hasPageRestrictions) {
      items = items.filter(i => allowedPages!.includes(i.id));
    }
    return items;
  })();

  const filteredOrderItems = hasPageRestrictions
    ? orderItems.filter(i => allowedPages!.includes(i.id))
    : isSimple
    ? orderItems.filter(i => pinnedPages.includes(i.id))
    : orderItems;

  const totalOrderCount = counts
    ? Object.values(counts).reduce((sum, c) => sum + (c || 0), 0)
    : 0;

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/dashboard">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="w-8 h-8 rounded-md bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-md">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span
              className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400 bg-clip-text text-transparent"
              style={{ fontFamily: "'Inter', sans-serif", letterSpacing: "-0.02em" }}
            >
              1SOL.AI
            </span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {/* Magic AI — standalone, above Home */}
        <SidebarGroup className="pb-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/ai"}
                  className={[
                    "relative overflow-hidden font-semibold",
                    location === "/ai"
                      ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500"
                      : "hover:bg-violet-500/10 text-violet-400 hover:text-violet-300",
                  ].join(" ")}
                >
                  <Link href="/ai" data-testid="nav-magic-ai">
                    <Sparkles className="w-4 h-4" />
                    <span>Magic AI</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/dashboard"}>
                  <Link href="/dashboard" data-testid="nav-dashboard">
                    <Home className="w-4 h-4" />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {filteredOrderItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible defaultOpen={isOrdersRouteActive} asChild className="group/orders-collapsible">
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
                        <ChevronRight className="w-4 h-4 ml-1 transition-transform duration-200 group-data-[state=open]/orders-collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {filteredOrderItems.map((item) => {
                          const count = item.key && item.key !== "ALL" ? (counts?.[item.key] || 0) : 0;
                          return (
                            <SidebarMenuSubItem key={item.key}>
                              <SidebarMenuSubButton asChild isActive={location === item.url}>
                                <Link href={item.url} data-testid={`nav-pipeline-${item.key!.toLowerCase()}`}>
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
        )}

        {filteredGroups.map((group) => {
          const isGroupActive = group.items.some(i => location === i.url || location.startsWith(i.url + "/"));
          return (
            <SidebarGroup key={group.id}>
              <SidebarGroupContent>
                <SidebarMenu>
                  <Collapsible defaultOpen={isGroupActive} asChild className="group/nav-group">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton data-testid={`nav-${group.id}-toggle`} tooltip={group.title}>
                          <group.icon className="w-4 h-4" />
                          <span className="flex-1">{group.title}</span>
                          <ChevronRight className="w-4 h-4 ml-auto transition-transform duration-200 group-data-[state=open]/nav-group:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {group.items.map((item) => (
                            <SidebarMenuSubItem key={item.id}>
                              <SidebarMenuSubButton asChild isActive={location === item.url || location.startsWith(item.url + "/")}>
                                <Link href={item.url} data-testid={`nav-${item.id}`}>
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
          );
        })}

        {canAccessSettings && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.startsWith("/settings")} data-testid="nav-settings-toggle">
                    <Link href="/settings">
                      <Settings className="w-4 h-4" />
                      <span className="flex-1">Settings</span>
                      {(unmappedCount?.count ?? 0) > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 min-w-[18px] justify-center" data-testid="badge-unmapped-statuses">
                          {unmappedCount!.count}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {user?.role === "SUPER_ADMIN" && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/admin"}>
                    <Link href="/admin" data-testid="nav-admin">
                      <Shield className="w-4 h-4" />
                      <span>Control Room</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start gap-2 h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={toggleMode}
            data-testid="button-toggle-sidebar-mode"
          >
            {isSimple ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
            {isSimple ? "Simple" : "Advanced"}
          </Button>
          {isSimple && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPagePicker(true)}
              data-testid="button-customize-sidebar"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </Button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-sidebar-accent transition-colors" data-testid="nav-user-menu">
              <Avatar className="h-8 w-8">
                <AvatarImage src={undefined} />
                <AvatarFallback className="text-xs">{getUserInitials()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium truncate">{getUserDisplayName()}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer" data-testid="nav-user-settings">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => logout()}
              disabled={isLoggingOut}
              className="text-destructive focus:text-destructive"
              data-testid="nav-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {isLoggingOut ? "Signing out..." : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>

      <Dialog open={showPagePicker} onOpenChange={setShowPagePicker}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customize Sidebar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Choose which pages appear in Simple mode.</p>
            {allNavGroups.map(group => (
              <div key={group.id}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{group.title}</p>
                <div className="space-y-1.5">
                  {group.items.map(item => (
                    <label key={item.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                      <Checkbox
                        checked={pinnedPages.includes(item.id)}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...pinnedPages, item.id]
                            : pinnedPages.filter(p => p !== item.id);
                          updatePrefsMutation.mutate({ sidebarPinnedPages: next });
                        }}
                      />
                      <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm">{item.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Settings</p>
              <div className="space-y-1.5">
                {settingsItems.map(item => (
                  <label key={item.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                    <Checkbox
                      checked={pinnedPages.includes(item.id)}
                      onCheckedChange={(checked) => {
                        const next = checked
                          ? [...pinnedPages, item.id]
                          : pinnedPages.filter(p => p !== item.id);
                        updatePrefsMutation.mutate({ sidebarPinnedPages: next });
                      }}
                    />
                    <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm">{item.title}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowPagePicker(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
