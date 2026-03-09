import { useState, useRef, useEffect } from "react";
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
  Save,
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
  { id: "profile",       label: "Profile" },
  { id: "shopify",       label: "Shopify" },
  { id: "couriers",      label: "Couriers" },
  { id: "whatsapp",      label: "WhatsApp" },
  { id: "notifications", label: "Notifications" },
  { id: "mapping",       label: "Status Mapping" },
  { id: "marketing",     label: "Marketing" },
  { id: "team",          label: "Team" },
  { id: "accounting",    label: "Accounting" },
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
      <div className="border-b px-4">
        <div className="flex gap-0 overflow-x-auto scrollbar-none" data-testid="settings-tab-nav">
          {SETTINGS_TABS.map(tab => {
            const isActive = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                data-testid={`settings-tab-${tab.id}`}
                className={[
                  "flex-shrink-0 px-3 py-2 text-xs font-medium",
                  "border-b-2 transition-colors whitespace-nowrap",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4">
        {activeTab === "profile" && (
          <div className="max-w-2xl space-y-6">
            <div>
              <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-3" data-testid="text-section-profile">Business Profile</h3>
              <p className="text-xs text-muted-foreground mb-3">Update your business information that appears on invoices and communications.</p>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-9 w-full" />)}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="businessName" className="text-xs">Business Name</Label>
                      <Input id="businessName" value={name} onChange={e => setName(e.target.value)} placeholder="Your business name" data-testid="input-business-name" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="businessEmail" className="text-xs">Email</Label>
                      <Input id="businessEmail" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="business@example.com" data-testid="input-business-email" />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="phone" className="text-xs">Phone Number</Label>
                      <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+92 300 1234567" data-testid="input-phone" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="city" className="text-xs">City</Label>
                      <Input id="city" value={city} onChange={e => setCity(e.target.value)} placeholder="Karachi" data-testid="input-city" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="address" className="text-xs">Address</Label>
                    <Input id="address" value={address} onChange={e => setAddress(e.target.value)} placeholder="Your business address" data-testid="input-address" />
                  </div>
                  <Button size="sm" onClick={handleSaveProfile} disabled={saveSettingsMutation.isPending} data-testid="button-save-profile">
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    {saveSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-3" data-testid="text-section-security">Security</h3>
              <p className="text-xs text-muted-foreground mb-3">Manage your account security and authentication.</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p className="text-sm font-medium">Authentication</p>
                    <p className="text-xs text-muted-foreground">You're signed in via Replit Auth with secure OAuth 2.0.</p>
                  </div>
                  <SettingsIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Your account is protected with industry-standard security. All data is encrypted in transit and at rest.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "shopify" && <SettingsShopify />}

        {activeTab === "couriers" && <SettingsCouriers />}


        {activeTab === "notifications" && (
          <div className="max-w-2xl">
            <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-3" data-testid="text-section-notifications">Notifications</h3>
            <p className="text-xs text-muted-foreground mb-4">Configure how you want to be notified about your logistics operations.</p>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div className="space-y-0">
                <div className="flex items-center justify-between gap-2 py-3 border-b">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium">Order Updates</Label>
                    <p className="text-xs text-muted-foreground">Receive email notifications when orders are synced or updated.</p>
                  </div>
                  <Switch checked={emailOrderUpdates} onCheckedChange={setEmailOrderUpdates} data-testid="switch-order-updates" />
                </div>
                <div className="flex items-center justify-between gap-2 py-3 border-b">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium">Delivery Alerts</Label>
                    <p className="text-xs text-muted-foreground">Get notified when shipments are delivered or have issues.</p>
                  </div>
                  <Switch checked={emailDeliveryAlerts} onCheckedChange={setEmailDeliveryAlerts} data-testid="switch-delivery-alerts" />
                </div>
                <div className="flex items-center justify-between gap-2 py-3 border-b">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium">COD Reminders</Label>
                    <p className="text-xs text-muted-foreground">Weekly reminders about pending COD reconciliation.</p>
                  </div>
                  <Switch checked={emailCodReminders} onCheckedChange={setEmailCodReminders} data-testid="switch-cod-reminders" />
                </div>
                <div className="flex items-center justify-between gap-2 py-3 border-b">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium">WhatsApp Order Notifications</Label>
                    <p className="text-xs text-muted-foreground">Automatically send WhatsApp messages to customers when order status changes.</p>
                  </div>
                  <Switch
                    checked={waEnabledData?.enabled ?? true}
                    onCheckedChange={(checked) => waEnabledMutation.mutate(checked)}
                    disabled={waEnabledMutation.isPending}
                    data-testid="switch-wa-notifications"
                  />
                </div>
                <div className="pt-3">
                  <Button size="sm" onClick={handleSaveNotifications} disabled={saveSettingsMutation.isPending} data-testid="button-save-notifications">
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    {saveSettingsMutation.isPending ? "Saving..." : "Save Preferences"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "whatsapp" && <SettingsWhatsApp />}

        {activeTab === "mapping" && <SettingsStatusMapping />}

        {activeTab === "marketing" && <SettingsMarketing />}

        {activeTab === "team" && <Team />}
        {activeTab === "accounting" && (
          <div className="space-y-6">
            <AccountingSettings />
            <OpeningBalancesPage />
          </div>
        )}
      </div>
    </div>
  );
}
