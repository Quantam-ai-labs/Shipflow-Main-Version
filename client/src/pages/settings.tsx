import { useState, useRef, useEffect } from "react";
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
  { id: "profile",       label: "Profile",        icon: Building2 },
  { id: "shopify",       label: "Shopify",        icon: Store },
  { id: "couriers",      label: "Couriers",       icon: Truck },
  { id: "whatsapp",      label: "WhatsApp",       icon: MessageCircle },
  { id: "notifications", label: "Notifications",  icon: Bell },
  { id: "mapping",       label: "Status Mapping", icon: ArrowLeftRight },
  { id: "marketing",     label: "Marketing",      icon: BarChart2 },
  { id: "team",          label: "Team",           icon: Users },
  { id: "accounting",    label: "Accounting",     icon: Cog },
];

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
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1" data-testid="settings-tab-nav">
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
                  "px-5 py-3 rounded-lg border text-xs font-medium transition-all whitespace-nowrap min-w-[90px]",
                  isActive
                    ? "border-primary bg-primary/10 text-primary shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-accent/50",
                ].join(" ")}
              >
                <Icon className="w-[18px] h-[18px]" />
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
          <div className="max-w-3xl">
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
