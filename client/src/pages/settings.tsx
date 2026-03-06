import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  MessageCircle,
  Pencil,
  Trash2,
  Plus,
  Store,
  Truck,
  ArrowLeftRight,
  Users,
  BarChart2,
  Cog,
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
  messageBody: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const WA_STATUSES = [
  { status: "NEW",       label: "New Order",  color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  { status: "BOOKED",    label: "Booked",      color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
  { status: "FULFILLED", label: "Shipped",     color: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  { status: "DELIVERED", label: "Delivered",   color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" },
];

const VARIABLE_CHIPS = [
  { key: "customer_name",   label: "Customer Name" },
  { key: "order_number",    label: "Order No." },
  { key: "item_name",       label: "Item Name" },
  { key: "new_status",      label: "New Status" },
  { key: "old_status",      label: "Old Status" },
  { key: "city",            label: "City" },
  { key: "address",         label: "Address" },
  { key: "total_amount",    label: "Amount" },
  { key: "courier_name",    label: "Courier" },
  { key: "tracking_number", label: "Tracking No." },
];

const DEFAULT_MESSAGE_BODIES: Record<string, string> = {
  NEW: `Hello {customer_name},\n\nYour order #{order_number} of {item_name} is pending for Confirmation.\nPlease Reply with Confirm or Cancel.`,
  BOOKED: `Hello {customer_name},\n\nYour order #{order_number} of {item_name} is "booked".\n\nThank you for shopping with lalaimports. We appreciate your trust!`,
  FULFILLED: `Hello {customer_name},\n\nYour order #{order_number} of {item_name} is "shipped".\n\nThank you for shopping with lalaimports. We appreciate your trust!`,
  DELIVERED: `Hello {customer_name},\n\nYour order #{order_number} of {item_name} is "delivered".\n\nThank you for shopping with lalaimports. We appreciate your trust!`,
};

const DEFAULT_MESSAGE_BODY = DEFAULT_MESSAGE_BODIES.DELIVERED;

const defaultTemplateName = (status: string) =>
  status === "NEW" ? "order_confirmation" : "order_updates";

const WA_PREVIEW_VALUES: Record<string, string> = {
  customer_name: "Ali",
  order_number: "132",
  item_name: "MacBook Pro 2019",
  new_status: "Delivered",
  old_status: "Shipped",
  city: "Lahore",
  address: "House 12, Block B, DHA",
  total_amount: "Rs 2,500",
  courier_name: "Leopards",
  tracking_number: "LP123456",
};

function buildPreview(body: string, statusLabel?: string): string {
  return body.replace(/\{(\w+)\}/g, (_, key) => {
    if (key === "new_status" && statusLabel) return statusLabel;
    return WA_PREVIEW_VALUES[key] ?? `{${key}}`;
  });
}

function WaTicks() {
  return (
    <span className="inline-flex gap-[1px] ml-1">
      <span className="text-[10px] text-blue-400 leading-none">✓</span>
      <span className="text-[10px] text-blue-400 leading-none">✓</span>
    </span>
  );
}

function WhatsAppBubble({ message, status }: { message: string; status?: string }) {
  return (
    <div className="flex justify-end">
      <div className="relative max-w-[280px] bg-[#dcf8c6] dark:bg-[#1d6a39] rounded-[18px] rounded-tr-[4px] px-3.5 py-2 shadow-sm">
        <p className="text-[13px] text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">{message}</p>
        <div className="flex items-center justify-end gap-1 mt-1">
          <span className="text-[10px] text-gray-500 dark:text-gray-400">9:41 AM</span>
          <WaTicks />
        </div>
      </div>
    </div>
  );
}

interface EditDialogProps {
  open: boolean;
  statusInfo: typeof WA_STATUSES[0] | null;
  initial: { templateName: string; messageBody: string; isActive: boolean } | null;
  onSave: (data: { templateName: string; messageBody: string; isActive: boolean }) => void;
  onClose: () => void;
  isSaving: boolean;
}

function VariableChip({ label, varKey, onClick }: { label: string; varKey: string; onClick: (key: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(varKey)}
      className="inline-flex items-center px-2 py-0.5 text-xs font-mono rounded border border-dashed border-primary/50 bg-primary/5 hover:bg-primary/15 transition-colors text-primary"
    >
      {`{${varKey}}`}
    </button>
  );
}

function EditDialog({ open, statusInfo, initial, onSave, onClose, isSaving }: EditDialogProps) {
  const [templateName, setTemplateName] = useState(initial?.templateName ?? "");
  const [messageBody, setMessageBody] = useState(initial?.messageBody ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useState(() => {
    if (open && initial) {
      setTemplateName(initial.templateName);
      setMessageBody(initial.messageBody);
      setIsActive(initial.isActive);
    }
  });

  const insertVariable = (key: string) => {
    const el = textareaRef.current;
    if (!el) { setMessageBody(b => b + `{${key}}`); return; }
    const start = el.selectionStart ?? messageBody.length;
    const end = el.selectionEnd ?? messageBody.length;
    const newVal = messageBody.slice(0, start) + `{${key}}` + messageBody.slice(end);
    setMessageBody(newVal);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + key.length + 2, start + key.length + 2); }, 0);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {statusInfo ? `Edit WhatsApp Template — ${statusInfo.label}` : "Edit WhatsApp Template"}
          </DialogTitle>
          <DialogDescription>
            Customize the message sent to customers. Use variable chips to insert dynamic values.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Template Name</Label>
              <Input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="e.g. order_updates" />
              <p className="text-xs text-muted-foreground">Must match an approved Meta template name.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Message Body</Label>
              <Textarea
                ref={textareaRef}
                value={messageBody}
                onChange={e => setMessageBody(e.target.value)}
                rows={7}
                placeholder="Write your message..."
                className="font-mono text-sm resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Insert Variables</Label>
              <div className="flex flex-wrap gap-1.5">
                {VARIABLE_CHIPS.map(v => (
                  <VariableChip key={v.key} label={v.label} varKey={v.key} onClick={insertVariable} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="wa-active" />
              <Label htmlFor="wa-active">Enable for this status</Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Live Preview</Label>
            <div className="rounded-xl bg-[#e5ddd5] dark:bg-[#0d1117] p-4 min-h-[200px]">
              <WhatsAppBubble message={buildPreview(messageBody || DEFAULT_MESSAGE_BODY, statusInfo?.label)} status={statusInfo?.status} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ templateName, messageBody, isActive })} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WhatsAppTemplatesCard() {
  const { toast } = useToast();
  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [deletingStatus, setDeletingStatus] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery<WhatsAppTemplate[]>({
    queryKey: ["/api/whatsapp/templates"],
  });

  const saveMutation = useMutation({
    mutationFn: async (data: { workflowStatus: string; templateName: string; messageBody: string; isActive: boolean }) => {
      return apiRequest("POST", "/api/whatsapp/templates", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/templates"] });
      toast({ title: "Template saved", description: "WhatsApp template updated." });
      setEditingStatus(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to save template.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (workflowStatus: string) => {
      return apiRequest("DELETE", `/api/whatsapp/templates/${workflowStatus}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/templates"] });
      toast({ title: "Template reset", description: "Template reset to system default." });
      setDeletingStatus(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to reset template.", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ workflowStatus, isActive }: { workflowStatus: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/whatsapp/templates/${workflowStatus}/toggle`, { isActive });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/templates"] }),
    onError: () => toast({ title: "Error", description: "Failed to toggle notification.", variant: "destructive" }),
  });

  const getTemplate = (status: string): WhatsAppTemplate | undefined =>
    templates?.find(t => t.workflowStatus === status);

  const editingStatusInfo = WA_STATUSES.find(s => s.status === editingStatus) ?? null;
  const editingTemplate = editingStatus ? getTemplate(editingStatus) : null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-500" />
            WhatsApp Notifications
          </CardTitle>
          <CardDescription>
            Configure WhatsApp message templates for each order status. Templates must be pre-approved in your Meta Business Manager account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {WA_STATUSES.map(s => {
                const tpl = getTemplate(s.status);
                const isActive = tpl?.isActive ?? true;
                return (
                  <div key={s.status} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-3 min-w-0">
                      <Switch
                        checked={isActive}
                        onCheckedChange={v => toggleMutation.mutate({ workflowStatus: s.status, isActive: v })}
                        disabled={toggleMutation.isPending}
                        data-testid={`switch-wa-${s.status.toLowerCase()}`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                          <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {tpl?.templateName ?? defaultTemplateName(s.status)}
                          </code>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[300px]">
                          {tpl?.messageBody
                            ? tpl.messageBody.split("\n")[0].slice(0, 60) + (tpl.messageBody.length > 60 ? "…" : "")
                            : "Using system default message"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingStatus(s.status)} data-testid={`button-edit-wa-${s.status.toLowerCase()}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      {tpl && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingStatus(s.status)} data-testid={`button-delete-wa-${s.status.toLowerCase()}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground pt-1">
                Toggle the switch to enable/disable notifications per status.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <EditDialog
        open={!!editingStatus}
        statusInfo={editingStatusInfo}
        initial={editingStatus ? {
          templateName: editingTemplate?.templateName ?? defaultTemplateName(editingStatus),
          messageBody: editingTemplate?.messageBody ?? DEFAULT_MESSAGE_BODIES[editingStatus] ?? DEFAULT_MESSAGE_BODY,
          isActive: editingTemplate?.isActive ?? true,
        } : null}
        onSave={(data) => saveMutation.mutate({ workflowStatus: editingStatus!, ...data })}
        onClose={() => setEditingStatus(null)}
        isSaving={saveMutation.isPending}
      />

      <AlertDialog open={!!deletingStatus} onOpenChange={o => { if (!o) setDeletingStatus(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Default?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the custom template for "{WA_STATUSES.find(s => s.status === deletingStatus)?.label}" and reset it to the system default. WhatsApp notifications for this status will still be sent using the default template name and message.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingStatus && deleteMutation.mutate(deletingStatus)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Resetting…" : "Reset to Default"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const SETTINGS_TABS = [
  { id: "profile",       label: "Profile",        icon: Building2,      gradient: "from-violet-500 to-purple-700",  href: null,                   description: "Business & security" },
  { id: "shopify",       label: "Shopify",        icon: Store,          gradient: "from-orange-400 to-amber-600",   href: null,                   description: "Store integration" },
  { id: "couriers",      label: "Couriers",       icon: Truck,          gradient: "from-teal-400 to-cyan-600",      href: null,                   description: "Delivery partners" },
  { id: "whatsapp",      label: "WhatsApp",       icon: MessageCircle,  gradient: "from-green-400 to-emerald-600",  href: null,                   description: "Message templates" },
  { id: "notifications", label: "Notifications",  icon: Bell,           gradient: "from-blue-400 to-indigo-600",    href: null,                   description: "Email alerts" },
  { id: "mapping",       label: "Status Mapping", icon: ArrowLeftRight, gradient: "from-rose-400 to-red-600",       href: null,                   description: "Courier statuses" },
  { id: "marketing",     label: "Marketing",      icon: BarChart2,      gradient: "from-fuchsia-400 to-pink-600",   href: null,                   description: "Ad integrations" },
  { id: "team",          label: "Team",           icon: Users,          gradient: "from-slate-400 to-gray-600",     href: null,                   description: "Users & roles" },
  { id: "preferences",   label: "Preferences",    icon: Cog,            gradient: "from-amber-500 to-orange-700",   href: "/accounting/settings", description: "Accounting settings" },
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
      {/* Tab card nav strip — no heading, just the cards */}
      <div className="border-b bg-muted/20 px-6 py-4">
        {/* overflow-visible so the scale on the active card isn't clipped */}
        <div className="flex gap-3 overflow-x-auto py-2 scrollbar-none" style={{ overflowY: "visible" }} data-testid="settings-tab-nav">
          {SETTINGS_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = tab.href
              ? location === tab.href
              : tab.id === activeTab;

            const handleClick = () => {
              if (tab.href) {
                navigate(tab.href);
              } else {
                setActiveTab(tab.id);
              }
            };

            return (
              <button
                key={tab.id}
                onClick={handleClick}
                data-testid={`settings-tab-${tab.id}`}
                className={[
                  "relative flex-shrink-0 flex flex-col items-center justify-center gap-2.5",
                  "px-4 py-5 rounded-2xl cursor-pointer select-none",
                  "min-w-[100px] transition-all duration-200 ease-out overflow-hidden",
                  `bg-gradient-to-br ${tab.gradient}`,
                  isActive
                    ? "ring-[2.5px] ring-white/70 shadow-2xl scale-[1.05] brightness-110"
                    : "opacity-72 hover:opacity-95 hover:scale-[1.03] shadow-md",
                ].join(" ")}
              >
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ backgroundImage: "repeating-linear-gradient(45deg,rgba(255,255,255,0.07) 0px,rgba(255,255,255,0.07) 1px,transparent 1px,transparent 9px)" }}
                />
                <Icon className="relative w-6 h-6 text-white drop-shadow-sm" />
                <span className="relative text-[11.5px] font-bold text-white/95 text-center leading-tight whitespace-nowrap tracking-wide drop-shadow-sm">
                  {tab.label}
                </span>
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

        {activeTab === "whatsapp" && (
          <div className="max-w-3xl">
            <WhatsAppTemplatesCard />
          </div>
        )}

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

        {activeTab === "mapping" && <SettingsStatusMapping />}

        {activeTab === "marketing" && <SettingsMarketing />}

        {activeTab === "team" && <Team />}
      </div>
    </div>
  );
}
