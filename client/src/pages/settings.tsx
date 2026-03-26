import { useState, useRef, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Settings as SettingsIcon,
  Building2,
  Bell,
  Shield,
  Save,
  Pencil,
  Trash2,
  Plus,
  Store,
  Truck,
  ArrowLeftRight,
  Users,
  BarChart2,
  Cog,
  MessageCircle,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { useLocation, useSearch } from "wouter";
import SettingsShopify from "./settings/shopify";
import SettingsCouriers from "./settings/couriers";
import SettingsStatusMapping from "./settings/status-mapping";
import SettingsMarketing from "./settings/marketing";
import Team from "./team";
import AccountingSettings from "./accounting/settings";
import OpeningBalancesPage from "./accounting/opening-balances";
import SettingsWhatsApp from "./settings/whatsapp";

interface MerchantSettings {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  notifications: {
    emailOrderUpdates: boolean;
    emailDeliveryAlerts: boolean;
    emailCodReminders: boolean;
  };
}


const SETTINGS_TABS = [
  { id: "profile",       label: "Profile",        icon: Building2,       active: "from-blue-500 to-blue-600",       inactive: "from-blue-500/10 to-blue-500/5 border-blue-500/20 text-blue-400 hover:from-blue-500/20" },
  { id: "shopify",       label: "Shopify",        icon: Store,           active: "from-green-500 to-green-600",     inactive: "from-green-500/10 to-green-500/5 border-green-500/20 text-green-400 hover:from-green-500/20" },
  { id: "couriers",      label: "Couriers",       icon: Truck,           active: "from-orange-500 to-orange-600",   inactive: "from-orange-500/10 to-orange-500/5 border-orange-500/20 text-orange-400 hover:from-orange-500/20" },
  { id: "whatsapp",      label: "WhatsApp",       icon: MessageCircle,   active: "from-emerald-500 to-emerald-600", inactive: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 text-emerald-400 hover:from-emerald-500/20" },
  { id: "notifications", label: "Notifications",  icon: Bell,            active: "from-purple-500 to-purple-600",   inactive: "from-purple-500/10 to-purple-500/5 border-purple-500/20 text-purple-400 hover:from-purple-500/20" },
  { id: "mapping",       label: "Status Mapping", icon: ArrowLeftRight,  active: "from-cyan-500 to-cyan-600",       inactive: "from-cyan-500/10 to-cyan-500/5 border-cyan-500/20 text-cyan-400 hover:from-cyan-500/20" },
  { id: "marketing",     label: "Marketing",      icon: BarChart2,       active: "from-pink-500 to-pink-600",       inactive: "from-pink-500/10 to-pink-500/5 border-pink-500/20 text-pink-400 hover:from-pink-500/20" },
  { id: "team",          label: "Team",           icon: Users,           active: "from-indigo-500 to-indigo-600",   inactive: "from-indigo-500/10 to-indigo-500/5 border-indigo-500/20 text-indigo-400 hover:from-indigo-500/20" },
  { id: "accounting",    label: "Accounting",     icon: Cog,             active: "from-amber-500 to-amber-600",     inactive: "from-amber-500/10 to-amber-500/5 border-amber-500/20 text-amber-400 hover:from-amber-500/20" },
];

interface HistoryNotification {
  id: string;
  type: string;
  category: string;
  title: string;
  message: string;
  orderNumber: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

const CATEGORY_BADGE: Record<string, { label: string; className: string }> = {
  confirmation: { label: "Confirmation", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  chat:         { label: "Chat",         className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  other:        { label: "Other",        className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

function NotificationHistoryCard() {
  const [showAll, setShowAll] = useState(false);
  const { data, isLoading } = useQuery<{ notifications: HistoryNotification[]; hasMore: boolean }>({
    queryKey: ["/api/notifications/history"],
  });

  const notifications = data?.notifications ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Notification History
          {notifications.length > 0 && (
            <Badge variant="secondary" className="ml-1">{notifications.length}{data?.hasMore ? "+" : ""} resolved</Badge>
          )}
        </CardTitle>
        <CardDescription>
          All resolved notifications, ordered by resolution time.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No resolved notifications yet.
          </div>
        ) : (
          <>
            <div data-testid="settings-notification-history-list" className="divide-y">
              {(showAll ? notifications : notifications.slice(0, 10)).map(n => {
                const badge = CATEGORY_BADGE[n.category] ?? CATEGORY_BADGE.other;
                return (
                  <div
                    key={n.id}
                    data-testid={`settings-notification-history-item-${n.id}`}
                    className="flex items-start gap-3 px-6 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.className}`}>
                          {badge.label}
                        </span>
                        {n.orderNumber && (
                          <span className="text-xs font-mono text-muted-foreground">#{n.orderNumber}</span>
                        )}
                      </div>
                      <p className="text-sm font-medium mt-1 leading-snug">{n.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{n.message}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-foreground">{n.resolvedByName || "Agent"}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {n.resolvedAt ? formatDistanceToNow(new Date(n.resolvedAt), { addSuffix: true }) : "—"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            {notifications.length > 10 && (
              <div className="px-6 py-3 border-t">
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowAll(s => !s)}>
                  {showAll ? "Show less" : `Show all ${notifications.length}${data?.hasMore ? "+" : ""}`}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const searchString = useSearch();
  const [location, navigate] = useLocation();

  const searchParams = new URLSearchParams(searchString);
  const activeTab = searchParams.get("tab") || "profile";

  const setActiveTab = (tab: string) => {
    navigate(`/settings?tab=${tab}`);
  };

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [emailOrderUpdates, setEmailOrderUpdates] = useState(true);
  const [emailDeliveryAlerts, setEmailDeliveryAlerts] = useState(true);
  const [emailCodReminders, setEmailCodReminders] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const { data, isLoading } = useQuery<MerchantSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: waEnabledData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/support/wa-enabled"],
  });

  const waEnabledMutation = useMutation({
    mutationFn: async (enabled: boolean) =>
      apiRequest("PUT", "/api/support/wa-enabled", { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/wa-enabled"] });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  if (data && !initialized) {
    setName(data.name || "");
    setEmail(data.email || "");
    setPhone(data.phone || "");
    setAddress(data.address || "");
    setCity(data.city || "");
    setEmailOrderUpdates(data.notifications?.emailOrderUpdates ?? true);
    setEmailDeliveryAlerts(data.notifications?.emailDeliveryAlerts ?? true);
    setEmailCodReminders(data.notifications?.emailCodReminders ?? true);
    setInitialized(true);
  }

  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: Partial<MerchantSettings>) => {
      return apiRequest("PATCH", "/api/settings", settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved", description: "Your settings have been updated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings. Please try again.", variant: "destructive" });
    },
  });

  const handleSaveProfile = () => {
    saveSettingsMutation.mutate({ name, email, phone, address, city });
  };

  const handleSaveNotifications = () => {
    saveSettingsMutation.mutate({
      notifications: { emailOrderUpdates, emailDeliveryAlerts, emailCodReminders },
    });
  };

  return (
    <div className="min-h-full">
      <div className="px-6 pt-4 pb-2">
        <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1" data-testid="settings-tab-nav">
          {SETTINGS_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                data-testid={`settings-tab-${tab.id}`}
                className={[
                  "flex-shrink-0 flex flex-col items-center justify-center gap-1.5",
                  "px-5 py-3 rounded-xl border text-xs font-semibold transition-all whitespace-nowrap min-w-[90px]",
                  "bg-gradient-to-br",
                  isActive
                    ? `${tab.active} text-white shadow-lg shadow-black/20 border-transparent`
                    : `${tab.inactive}`,
                ].join(" ")}
              >
                <Icon className="w-5 h-5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {activeTab === "profile" && (
          <div className="space-y-6 max-w-3xl">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Business Profile
                </CardTitle>
                <CardDescription>
                  Update your business information that appears on invoices and communications.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="businessName">Business Name</Label>
                        <Input id="businessName" value={name} onChange={e => setName(e.target.value)} placeholder="Your business name" data-testid="input-business-name" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="businessEmail">Email</Label>
                        <Input id="businessEmail" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="business@example.com" data-testid="input-business-email" />
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number</Label>
                        <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+92 300 1234567" data-testid="input-phone" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="city">City</Label>
                        <Input id="city" value={city} onChange={e => setCity(e.target.value)} placeholder="Karachi" data-testid="input-city" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">Address</Label>
                      <Input id="address" value={address} onChange={e => setAddress(e.target.value)} placeholder="Your business address" data-testid="input-address" />
                    </div>
                    <Button onClick={handleSaveProfile} disabled={saveSettingsMutation.isPending} data-testid="button-save-profile">
                      <Save className="w-4 h-4 mr-2" />
                      {saveSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Security
                </CardTitle>
                <CardDescription>
                  Manage your account security and authentication.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-md">
                    <div>
                      <p className="font-medium">Authentication</p>
                      <p className="text-sm text-muted-foreground">You're signed in via Replit Auth with secure OAuth 2.0.</p>
                    </div>
                    <SettingsIcon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Your account is protected with industry-standard security. All data is encrypted in transit and at rest.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "shopify" && <SettingsShopify />}

        {activeTab === "couriers" && <SettingsCouriers />}


        {activeTab === "notifications" && (
          <div className="max-w-3xl space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Notifications
                </CardTitle>
                <CardDescription>
                  Configure how you want to be notified about your logistics operations.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Order Updates</Label>
                        <p className="text-sm text-muted-foreground">Receive email notifications when orders are synced or updated.</p>
                      </div>
                      <Switch checked={emailOrderUpdates} onCheckedChange={setEmailOrderUpdates} data-testid="switch-order-updates" />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Delivery Alerts</Label>
                        <p className="text-sm text-muted-foreground">Get notified when shipments are delivered or have issues.</p>
                      </div>
                      <Switch checked={emailDeliveryAlerts} onCheckedChange={setEmailDeliveryAlerts} data-testid="switch-delivery-alerts" />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>COD Reminders</Label>
                        <p className="text-sm text-muted-foreground">Weekly reminders about pending COD reconciliation.</p>
                      </div>
                      <Switch checked={emailCodReminders} onCheckedChange={setEmailCodReminders} data-testid="switch-cod-reminders" />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>WhatsApp Order Notifications</Label>
                        <p className="text-sm text-muted-foreground">Automatically send WhatsApp messages to customers when order status changes.</p>
                      </div>
                      <Switch
                        checked={waEnabledData?.enabled ?? true}
                        onCheckedChange={(checked) => waEnabledMutation.mutate(checked)}
                        disabled={waEnabledMutation.isPending}
                        data-testid="switch-wa-notifications"
                      />
                    </div>
                    <Button onClick={handleSaveNotifications} disabled={saveSettingsMutation.isPending} data-testid="button-save-notifications">
                      <Save className="w-4 h-4 mr-2" />
                      {saveSettingsMutation.isPending ? "Saving..." : "Save Preferences"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <NotificationHistoryCard />
          </div>
        )}

        {activeTab === "whatsapp" && <SettingsWhatsApp />}

        {activeTab === "mapping" && <SettingsStatusMapping />}

        {activeTab === "marketing" && <SettingsMarketing />}

        {activeTab === "team" && <Team />}
        {activeTab === "accounting" && (
          <div className="space-y-8">
            <AccountingSettings />
            <OpeningBalancesPage />
          </div>
        )}
      </div>
    </div>
  );
}
