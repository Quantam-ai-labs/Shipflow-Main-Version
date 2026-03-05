import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Settings as SettingsIcon,
  Building2,
  Bell,
  Shield,
  Save,
  MessageCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";

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

interface WhatsAppTemplate {
  id: string;
  merchantId: string;
  workflowStatus: string;
  templateName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const WA_STATUSES = [
  { status: "NEW", label: "New Order", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  { status: "BOOKED", label: "Booked", color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
  { status: "FULFILLED", label: "Shipped", color: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  { status: "DELIVERED", label: "Delivered", color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" },
];

function WhatsAppTemplatesCard() {
  const { toast } = useToast();
  const [localTemplates, setLocalTemplates] = useState<Record<string, { templateName: string; isActive: boolean }>>({});
  const [initialized, setInitialized] = useState(false);
  const [savingStatus, setSavingStatus] = useState<Record<string, boolean>>({});

  const { data: templates, isLoading } = useQuery<WhatsAppTemplate[]>({
    queryKey: ["/api/whatsapp-templates"],
  });

  if (templates && !initialized) {
    const map: Record<string, { templateName: string; isActive: boolean }> = {};
    WA_STATUSES.forEach(({ status }) => {
      const found = templates.find(t => t.workflowStatus === status);
      map[status] = { templateName: found?.templateName ?? "status_notify", isActive: found?.isActive ?? true };
    });
    setLocalTemplates(map);
    setInitialized(true);
  }

  const upsertMutation = useMutation({
    mutationFn: async ({ status, templateName, isActive }: { status: string; templateName: string; isActive: boolean }) => {
      return apiRequest("PUT", `/api/whatsapp-templates/${status}`, { templateName, isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-templates"] });
    },
  });

  const handleSave = async (status: string) => {
    const entry = localTemplates[status];
    if (!entry) return;
    setSavingStatus(s => ({ ...s, [status]: true }));
    try {
      await upsertMutation.mutateAsync({ status, templateName: entry.templateName, isActive: entry.isActive });
      toast({ title: "Template saved", description: `${WA_STATUSES.find(s => s.status === status)?.label} template updated.` });
    } catch {
      toast({ title: "Error", description: "Failed to save template.", variant: "destructive" });
    } finally {
      setSavingStatus(s => ({ ...s, [status]: false }));
    }
  };

  const handleToggle = async (status: string, isActive: boolean) => {
    setLocalTemplates(prev => ({ ...prev, [status]: { ...prev[status], isActive } }));
    const entry = localTemplates[status];
    if (!entry) return;
    try {
      await upsertMutation.mutateAsync({ status, templateName: entry.templateName, isActive });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-templates"] });
    } catch {
      setLocalTemplates(prev => ({ ...prev, [status]: { ...prev[status], isActive: !isActive } }));
      toast({ title: "Error", description: "Failed to update template.", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-green-600" />
          WhatsApp Notifications
        </CardTitle>
        <CardDescription>
          Configure the WhatsApp Business API template name used when notifying customers at each order status.
          Templates must be pre-approved in your Meta Business account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {WA_STATUSES.map(({ status, label, color }) => {
              const entry = localTemplates[status] ?? { templateName: "status_notify", isActive: true };
              const isSaving = savingStatus[status] ?? false;
              return (
                <div key={status} className="flex items-center gap-3 p-3 border rounded-lg" data-testid={`whatsapp-template-row-${status.toLowerCase()}`}>
                  <Badge className={`shrink-0 text-xs font-medium border-0 ${color}`}>{label}</Badge>
                  <Input
                    className="flex-1 h-8 text-sm font-mono"
                    value={entry.templateName}
                    onChange={e => setLocalTemplates(prev => ({ ...prev, [status]: { ...prev[status], templateName: e.target.value } }))}
                    placeholder="status_notify"
                    data-testid={`input-whatsapp-template-${status.toLowerCase()}`}
                  />
                  <Switch
                    checked={entry.isActive}
                    onCheckedChange={val => handleToggle(status, val)}
                    data-testid={`switch-whatsapp-active-${status.toLowerCase()}`}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSave(status)}
                    disabled={isSaving}
                    className="h-8 px-3 shrink-0"
                    data-testid={`button-save-whatsapp-${status.toLowerCase()}`}
                  >
                    {isSaving ? (
                      <span className="text-xs">Saving...</span>
                    ) : (
                      <><Save className="w-3 h-3 mr-1" /><span className="text-xs">Save</span></>
                    )}
                  </Button>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground pt-1">
              Toggle the switch to enable/disable notifications for each status. The template name must exactly match the approved template in Meta Business Manager.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { toast } = useToast();
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
      toast({
        title: "Settings saved",
        description: "Your settings have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSaveProfile = () => {
    saveSettingsMutation.mutate({
      name,
      email,
      phone,
      address,
      city,
    });
  };

  const handleSaveNotifications = () => {
    saveSettingsMutation.mutate({
      notifications: {
        emailOrderUpdates,
        emailDeliveryAlerts,
        emailCodReminders,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences.</p>
      </div>

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
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input
                    id="businessName"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your business name"
                    data-testid="input-business-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessEmail">Email</Label>
                  <Input
                    id="businessEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="business@example.com"
                    data-testid="input-business-email"
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+92 300 1234567"
                    data-testid="input-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Karachi"
                    data-testid="input-city"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Your business address"
                  data-testid="input-address"
                />
              </div>
              <Button
                onClick={handleSaveProfile}
                disabled={saveSettingsMutation.isPending}
                data-testid="button-save-profile"
              >
                <Save className="w-4 h-4 mr-2" />
                {saveSettingsMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <WhatsAppTemplatesCard />

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
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Order Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive email notifications when orders are synced or updated.
                  </p>
                </div>
                <Switch
                  checked={emailOrderUpdates}
                  onCheckedChange={setEmailOrderUpdates}
                  data-testid="switch-order-updates"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Delivery Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when shipments are delivered or have issues.
                  </p>
                </div>
                <Switch
                  checked={emailDeliveryAlerts}
                  onCheckedChange={setEmailDeliveryAlerts}
                  data-testid="switch-delivery-alerts"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>COD Reminders</Label>
                  <p className="text-sm text-muted-foreground">
                    Weekly reminders about pending COD reconciliation.
                  </p>
                </div>
                <Switch
                  checked={emailCodReminders}
                  onCheckedChange={setEmailCodReminders}
                  data-testid="switch-cod-reminders"
                />
              </div>
              <Button
                onClick={handleSaveNotifications}
                disabled={saveSettingsMutation.isPending}
                data-testid="button-save-notifications"
              >
                <Save className="w-4 h-4 mr-2" />
                {saveSettingsMutation.isPending ? "Saving..." : "Save Preferences"}
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
                <p className="text-sm text-muted-foreground">
                  You're signed in via Replit Auth with secure OAuth 2.0.
                </p>
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
  );
}
