import { useState } from "react";
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
  ToggleLeft,
  ToggleRight,
  SlidersHorizontal,
  Megaphone,
  Activity,
  LayoutList,
  Brain,
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

const pipelineItems: NavItem[] = [
  { id: "orders-new", title: "New Orders", url: "/orders/new", icon: Inbox, key: "NEW" },
  { id: "orders-pending", title: "Confirmation Pending", url: "/orders/pending", icon: Clock, key: "PENDING" },
  { id: "orders-hold", title: "Hold", url: "/orders/hold", icon: Pause, key: "HOLD" },
  { id: "orders-ready", title: "Ready to Ship", url: "/orders/ready", icon: Truck, key: "READY_TO_SHIP" },
  { id: "orders-booked", title: "Booked", url: "/orders/booked", icon: BookmarkCheck, key: "BOOKED" },
  { id: "orders-fulfilled", title: "Fulfilled", url: "/orders/fulfilled", icon: Send, key: "FULFILLED" },
  { id: "orders-delivered", title: "Delivered", url: "/orders/delivered", icon: PackageCheck, key: "DELIVERED" },
  { id: "orders-return", title: "Return", url: "/orders/return", icon: RotateCcw, key: "RETURN" },
  { id: "orders-cancelled", title: "Cancelled", url: "/orders/cancelled", icon: XCircle, key: "CANCELLED" },
];

const allNavGroups: NavGroup[] = [
  {
    id: "sales",
    title: "Sales",
    icon: ShoppingCart,
    items: [
      { id: "sale-invoices", title: "Sale Invoices", url: "/accounting/sales", icon: Receipt },
      { id: "sale-orders", title: "Sale Orders", url: "/accounting/sale-orders", icon: BookOpen },
      { id: "shipments", title: "Shipments", url: "/shipments", icon: Truck },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    icon: ShoppingBag,
    items: [
      { id: "products", title: "Products", url: "/accounting/products", icon: ShoppingBag },
      { id: "shopify-products", title: "Shopify Products", url: "/shopify-products", icon: Store },
      { id: "add-stock", title: "Add Stock", url: "/accounting/stock-receipts", icon: ArrowDownLeft },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    icon: Wallet,
    items: [
      { id: "money", title: "Money In/Out", url: "/accounting/transactions", icon: ArrowLeftRight },
      { id: "cod-reconciliation", title: "COD Reconciliation", url: "/cod-reconciliation", icon: DollarSign },
      { id: "payment-ledger", title: "Payment Ledger", url: "/payment-ledger", icon: Receipt },
      { id: "manage-cheques", title: "Manage Cheques", url: "/manage-cheques", icon: FileCheck },
      { id: "customers", title: "Parties", url: "/accounting/parties", icon: UserCircle },
      { id: "expense-history", title: "Expense History", url: "/accounting/expenses", icon: Receipt },
      { id: "needs-payment", title: "Needs Payment", url: "/accounting/expenses-unpaid", icon: Clock },
      { id: "cod-receivable", title: "COD Receivable", url: "/accounting/cod-receivable", icon: ArrowDownLeft },
      { id: "courier-payable", title: "Courier Payable", url: "/accounting/courier-payable", icon: ArrowUpRight },
      { id: "settlements", title: "Settlements", url: "/accounting/settlements", icon: Scale },
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    icon: BarChart3,
    items: [
      { id: "overview", title: "Overview", url: "/accounting", icon: Wallet },
      { id: "profit-loss", title: "Profit & Loss", url: "/accounting/reports/pnl", icon: TrendingUp },
      { id: "balance-snapshot", title: "Balance Snapshot", url: "/accounting/reports/balance-sheet", icon: PieChart },
      { id: "cash-flow", title: "Cash Flow", url: "/accounting/reports/cash-flow", icon: BarChart3 },
      { id: "stock-report", title: "Stock Report", url: "/accounting/reports/stock", icon: Package },
      { id: "party-balances", title: "Party Balances", url: "/accounting/reports/party-balances", icon: Users },
      { id: "product-analytics", title: "Product Analytics", url: "/product-analytics", icon: TrendingUp },
      { id: "analytics-dashboard", title: "Analytics", url: "/analytics", icon: BarChart3 },
    ],
  },
  {
    id: "ai-assistant",
    title: "AI Assistant",
    icon: Brain,
    items: [
      { id: "ai-hub", title: "AI Hub", url: "/ai", icon: Brain },
    ],
  },
  {
    id: "marketing",
    title: "Marketing",
    icon: Megaphone,
    items: [
      { id: "ads-dashboard", title: "Ads Dashboard", url: "/marketing", icon: BarChart3 },
      { id: "ads-manager", title: "Ads Manager", url: "/marketing/ads-manager", icon: LayoutList },
      { id: "ads-profitability", title: "Ads Profitability", url: "/marketing/profitability", icon: Calculator },
      { id: "ai-intelligence", title: "AI Intelligence", url: "/marketing/intelligence", icon: Brain },
      { id: "live-campaigns", title: "Live Campaigns", url: "/marketing/live", icon: Activity },
    ],
  },
  {
    id: "accounting-advanced",
    title: "Accounting",
    icon: Calculator,
    items: [
      { id: "ledger", title: "Ledger", url: "/accounting/ledger", icon: BookOpen },
      { id: "trial-balance", title: "Trial Balance", url: "/accounting/trial-balance", icon: Scale },
      { id: "cash-accounts", title: "Cash Accounts", url: "/accounting/cash-accounts", icon: Landmark },
      { id: "opening-balances", title: "Opening Balances", url: "/accounting/opening-balances", icon: Calculator },
    ],
  },
];

const settingsItems: NavItem[] = [
  { id: "team", title: "Team", url: "/team", icon: Users },
  { id: "settings", title: "General", url: "/settings", icon: Settings },
  { id: "settings-shopify", title: "Shopify", url: "/settings/shopify", icon: Store },
  { id: "settings-couriers", title: "Couriers", url: "/settings/couriers", icon: Truck },
  { id: "settings-status-mapping", title: "Status Mapping", url: "/settings/status-mapping", icon: ArrowLeftRight },
  { id: "settings-marketing", title: "Marketing", url: "/settings/marketing", icon: Megaphone },
  { id: "preferences", title: "Preferences", url: "/accounting/settings", icon: Cog },
];

const allPageIds = [
  ...allNavGroups.flatMap(g => g.items.map(i => i.id)),
  ...settingsItems.map(i => i.id),
];

const defaultPinnedPages = [
  "sale-invoices", "shipments",
  "products", "add-stock",
  "money", "cod-reconciliation", "customers",
  "overview", "profit-loss",
  "team", "settings", "settings-shopify", "settings-couriers",
];

export function AppSidebar() {
  const [location] = useLocation();
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

  const totalOrderCount = counts
    ? Object.values(counts).reduce((sum, c) => sum + (c || 0), 0)
    : 0;

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

  const filteredPipelineItems = hasPageRestrictions
    ? pipelineItems.filter(i => allowedPages!.includes(i.id))
    : pipelineItems;

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/dashboard">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Package className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">1SOL.AI</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/dashboard"}>
                  <Link href="/dashboard" data-testid="nav-dashboard">
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {filteredPipelineItems.length > 0 && (<SidebarGroup>
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
                      {filteredPipelineItems.map((item) => {
                        const count = counts?.[item.key!] || 0;
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
                  <Collapsible defaultOpen={isGroupActive} asChild className={`group/${group.id}-collapsible`}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton data-testid={`nav-${group.id}-toggle`} tooltip={group.title}>
                          <group.icon className="w-4 h-4" />
                          <span className="flex-1">{group.title}</span>
                          <ChevronRight className="w-4 h-4 ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {group.items.map((item) => (
                            <SidebarMenuSubItem key={item.id}>
                              <SidebarMenuSubButton asChild isActive={location === item.url}>
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

        {filteredSettings.length > 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible defaultOpen={location.startsWith("/settings") || location === "/team" || location === "/accounting/settings"} asChild className="group/settings-collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton data-testid="nav-settings-toggle" tooltip="Settings">
                        <Settings className="w-4 h-4" />
                        <span className="flex-1">Settings</span>
                        {(unmappedCount?.count ?? 0) > 0 && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 min-w-[18px] justify-center" data-testid="badge-unmapped-statuses">
                            {unmappedCount!.count}
                          </Badge>
                        )}
                        <ChevronRight className="w-4 h-4 ml-auto transition-transform duration-200 group-data-[state=open]/settings-collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {filteredSettings.map((item) => (
                          <SidebarMenuSubItem key={item.id}>
                            <SidebarMenuSubButton asChild isActive={location === item.url}>
                              <Link href={item.url} data-testid={`nav-${item.id}`}>
                                <item.icon className="w-3.5 h-3.5" />
                                <span className="flex-1">{item.title}</span>
                                {item.id === "settings-status-mapping" && (unmappedCount?.count ?? 0) > 0 && (
                                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 min-w-[18px] justify-center">
                                    {unmappedCount!.count}
                                  </Badge>
                                )}
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
        )}

        {user?.role === "SUPER_ADMIN" && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
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
              className="text-destructive focus:text-destructive cursor-pointer"
              data-testid="nav-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {isLoggingOut ? "Signing out..." : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>

      <PagePickerDialog
        open={showPagePicker}
        onClose={() => setShowPagePicker(false)}
        pinnedPages={pinnedPages}
        onSave={(pages) => {
          updatePrefsMutation.mutate({ sidebarPinnedPages: pages });
          setShowPagePicker(false);
        }}
      />
    </Sidebar>
  );
}

function PagePickerDialog({
  open,
  onClose,
  pinnedPages,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  pinnedPages: string[];
  onSave: (pages: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(pinnedPages));

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    onSave(Array.from(selected));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" data-testid="dialog-page-picker">
        <DialogHeader>
          <DialogTitle>Customize Sidebar</DialogTitle>
          <p className="text-sm text-muted-foreground">Choose which pages to show in Simple mode</p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {allNavGroups.map((group) => (
            <div key={group.id}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{group.title}</p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                    data-testid={`picker-${item.id}`}
                  >
                    <Checkbox
                      checked={selected.has(item.id)}
                      onCheckedChange={() => toggle(item.id)}
                    />
                    <item.icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{item.title}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Settings</p>
            <div className="space-y-1">
              {settingsItems.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                  data-testid={`picker-${item.id}`}
                >
                  <Checkbox
                    checked={selected.has(item.id)}
                    onCheckedChange={() => toggle(item.id)}
                  />
                  <item.icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{item.title}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-picker-cancel">Cancel</Button>
          <Button onClick={handleSave} data-testid="button-picker-save">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
