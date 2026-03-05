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
  NEW: `Hello {customer_name},\n\nYour order #{order_number} of {item_name} has been received.\n\nThank you for shopping with lalaimports. We appreciate your trust!`,
  BOOKED: `Hello {customer_name},\n\nYour order #{order_number} of {item_name} is "booked".\n\nThank you for shopping with lalaimports. We appreciate your trust!`,
  FULFILLED: `Hello {customer_name},\n\nYour order #{order_number} of {item_name} is "shipped".\n\nThank you for shopping with lalaimports. We appreciate your trust!`,
  DELIVERED: `Hello {customer_name},\n\nYour order #{order_number} of {item_name} is "delivered".\n\nThank you for shopping with lalaimports. We appreciate your trust!`,
};

const DEFAULT_MESSAGE_BODY = DEFAULT_MESSAGE_BODIES.DELIVERED;

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

function WhatsAppBubble({ message }: { message: string }) {
  const timeStr = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return (
    <div className="flex flex-col rounded-xl overflow-hidden border border-[#222d35] shadow-lg h-full min-h-[300px]">
      <div className="bg-[#1F2C34] flex items-center gap-2.5 px-3 py-2.5 flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-xs select-none">L</div>
        <div>
          <p className="text-white text-xs font-semibold leading-tight">Lalaimports</p>
          <p className="text-[#8696A0] text-[10px]">online</p>
        </div>
      </div>
      <div className="flex-1 bg-[#0B141A] px-3 py-3 flex flex-col justify-end gap-2 overflow-auto">
        <div className="flex justify-center mb-1">
          <span className="bg-[#1F2C34] text-[#8696A0] text-[9px] px-2 py-0.5 rounded-full">Today</span>
        </div>
        <div className="flex justify-end">
          <div className="relative bg-[#005C4B] rounded-tl-xl rounded-tr-sm rounded-bl-xl rounded-br-xl px-3 py-2 max-w-[92%] shadow-md">
            <div className="absolute top-0 -right-1.5 w-0 h-0 border-t-[8px] border-t-[#005C4B] border-r-[8px] border-r-transparent" />
            <p className="text-white text-[11.5px] whitespace-pre-wrap leading-relaxed break-words">{message}</p>
            <div className="flex items-center justify-end gap-1 mt-1">
              <span className="text-[#8696A0] text-[9px]">{timeStr}</span>
              <svg width="14" height="10" viewBox="0 0 16 11" fill="none" className="flex-shrink-0">
                <path d="M1 5.5L4.5 9L10.5 1" stroke="#53BDEB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6 9L12 1" stroke="#53BDEB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-[#1F2C34] flex items-center gap-2 px-3 py-2 flex-shrink-0">
        <div className="flex-1 bg-[#2A3942] rounded-full px-3 py-1.5">
          <span className="text-[#8696A0] text-[10px]">Type a message</span>
        </div>
        <div className="w-7 h-7 rounded-full bg-[#00A884] flex items-center justify-center flex-shrink-0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

function VariableChip({ label, varKey, onClick }: { label: string; varKey: string; onClick: (key: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(varKey)}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border border-green-200 dark:border-green-800 hover:bg-green-200 dark:hover:bg-green-900 transition-colors cursor-pointer"
      title={`Insert {${varKey}}`}
    >
      <Plus className="w-2.5 h-2.5" />
      {label}
    </button>
  );
}

interface EditDialogProps {
  open: boolean;
  statusInfo: { status: string; label: string; color: string } | null;
  initial: { templateName: string; messageBody: string };
  onSave: (templateName: string, messageBody: string) => void;
  onClose: () => void;
  isSaving: boolean;
}

function EditDialog({ open, statusInfo, initial, onSave, onClose, isSaving }: EditDialogProps) {
  const [templateName, setTemplateName] = useState(initial.templateName);
  const [messageBody, setMessageBody] = useState(initial.messageBody);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (varKey: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setMessageBody(prev => prev + `{${varKey}}`);
      return;
    }
    const start = textarea.selectionStart ?? messageBody.length;
    const end = textarea.selectionEnd ?? messageBody.length;
    const insertion = `{${varKey}}`;
    const newBody = messageBody.slice(0, start) + insertion + messageBody.slice(end);
    setMessageBody(newBody);
    setTimeout(() => {
      textarea.focus();
      const newPos = start + insertion.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const fallback = DEFAULT_MESSAGE_BODIES[statusInfo?.status ?? ""] ?? DEFAULT_MESSAGE_BODY;

  const handleSave = () => {
    onSave(templateName.trim(), messageBody.trim() || fallback);
  };

  const previewBody = messageBody.trim() || fallback;

  return (
    <Dialog open={open} onOpenChange={open ? undefined : onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-600" />
            {statusInfo ? `Edit WhatsApp Template — ${statusInfo.label}` : "Edit WhatsApp Template"}
          </DialogTitle>
          <DialogDescription>
            Configure the message sent when an order moves to this status. Variables are replaced with real order data when sent.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-5 py-2">
          <div className="flex-1 min-w-0 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dialog-template-name" className="text-sm font-medium">
                Template Name
                <span className="ml-1 text-xs text-muted-foreground font-normal">(must match your Meta template)</span>
              </Label>
              <Input
                id="dialog-template-name"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="status_notify"
                className="font-mono text-sm"
                data-testid="dialog-input-template-name"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Message Body</Label>
              <div className="flex flex-wrap gap-1.5 p-2 bg-muted/50 rounded-md border">
                <span className="text-xs text-muted-foreground self-center mr-1">Insert:</span>
                {VARIABLE_CHIPS.map(chip => (
                  <VariableChip
                    key={chip.key}
                    label={chip.label}
                    varKey={chip.key}
                    onClick={insertVariable}
                  />
                ))}
              </div>
              <Textarea
                ref={textareaRef}
                value={messageBody}
                onChange={e => setMessageBody(e.target.value)}
                placeholder={fallback}
                className="font-mono text-sm min-h-[140px] resize-y"
                data-testid="dialog-textarea-message-body"
              />
              <p className="text-xs text-muted-foreground">
                Click a variable to insert it at your cursor. Leave blank to use the default template.
              </p>
            </div>
          </div>

          <div className="w-52 flex-shrink-0 flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Live preview</p>
            <WhatsAppBubble message={buildPreview(previewBody, statusInfo?.label)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving} data-testid="dialog-button-cancel">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !templateName.trim()} data-testid="dialog-button-save">
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
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery<WhatsAppTemplate[]>({
    queryKey: ["/api/whatsapp-templates"],
  });

  const upsertMutation = useMutation({
    mutationFn: async ({ status, templateName, messageBody, isActive }: { status: string; templateName: string; messageBody?: string | null; isActive: boolean }) => {
      return apiRequest("PUT", `/api/whatsapp-templates/${status}`, { templateName, messageBody, isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-templates"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest("DELETE", `/api/whatsapp-templates/${status}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-templates"] });
    },
  });

  const getTemplate = (status: string): WhatsAppTemplate | undefined =>
    templates?.find(t => t.workflowStatus === status);

  const getEditInitial = (status: string) => {
    const t = getTemplate(status);
    return {
      templateName: t?.templateName ?? "status_notify",
      messageBody: t?.messageBody ?? DEFAULT_MESSAGE_BODIES[status] ?? "",
    };
  };

  const handleSave = async (templateName: string, messageBody: string) => {
    if (!editingStatus) return;
    setIsSaving(true);
    try {
      const existing = getTemplate(editingStatus);
      await upsertMutation.mutateAsync({
        status: editingStatus,
        templateName,
        messageBody,
        isActive: existing?.isActive ?? true,
      });
      toast({ title: "Template saved", description: `${WA_STATUSES.find(s => s.status === editingStatus)?.label} template updated.` });
      setEditingStatus(null);
    } catch {
      toast({ title: "Error", description: "Failed to save template.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingStatus) return;
    setIsDeleting(true);
    try {
      await deleteMutation.mutateAsync(deletingStatus);
      toast({ title: "Template deleted", description: `${WA_STATUSES.find(s => s.status === deletingStatus)?.label} template has been reset to default.` });
      setDeletingStatus(null);
    } catch {
      toast({ title: "Error", description: "Failed to delete template.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggle = async (status: string, isActive: boolean) => {
    setToggling(status);
    try {
      const existing = getTemplate(status);
      await upsertMutation.mutateAsync({
        status,
        templateName: existing?.templateName ?? "status_notify",
        messageBody: existing?.messageBody ?? null,
        isActive,
      });
    } catch {
      toast({ title: "Error", description: "Failed to update template.", variant: "destructive" });
    } finally {
      setToggling(null);
    }
  };

  const editingStatusInfo = WA_STATUSES.find(s => s.status === editingStatus) ?? null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-600" />
            WhatsApp Notifications
          </CardTitle>
          <CardDescription>
            Configure WhatsApp message templates for each order status. Templates must be pre-approved in your Meta Business Manager account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {WA_STATUSES.map(({ status, label, color }) => {
                const template = getTemplate(status);
                const isActive = template?.isActive ?? true;
                const isTogglingThis = toggling === status;
                const hasTemplate = !!template;

                return (
                  <div
                    key={status}
                    className="flex items-center gap-3 p-3 border rounded-lg"
                    data-testid={`whatsapp-template-row-${status.toLowerCase()}`}
                  >
                    <Badge className={`shrink-0 text-xs font-medium border-0 ${color} min-w-[80px] justify-center`}>
                      {label}
                    </Badge>

                    <div className="flex-1 min-w-0">
                      {hasTemplate ? (
                        <div className="space-y-0.5">
                          <p className="text-xs font-mono text-foreground truncate">{template.templateName}</p>
                          {template.messageBody ? (
                            <p className="text-xs text-muted-foreground truncate">{template.messageBody}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">Default message body</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No template configured — using defaults</p>
                      )}
                    </div>

                    <Switch
                      checked={isActive}
                      onCheckedChange={val => handleToggle(status, val)}
                      disabled={isTogglingThis}
                      data-testid={`switch-whatsapp-active-${status.toLowerCase()}`}
                    />

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0 shrink-0"
                      onClick={() => setEditingStatus(status)}
                      data-testid={`button-edit-whatsapp-${status.toLowerCase()}`}
                      title="Edit template"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeletingStatus(status)}
                      disabled={!hasTemplate}
                      data-testid={`button-delete-whatsapp-${status.toLowerCase()}`}
                      title="Reset to default"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}

              <div className="pt-1 border-t">
                <p className="text-xs text-muted-foreground">
                  Use the pencil icon to configure a template. Click variable chips inside the editor to insert dynamic order fields.
                  Toggle the switch to enable/disable notifications per status.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {editingStatus && (
        <EditDialog
          open={!!editingStatus}
          statusInfo={editingStatusInfo}
          initial={getEditInitial(editingStatus)}
          onSave={handleSave}
          onClose={() => setEditingStatus(null)}
          isSaving={isSaving}
        />
      )}

      <AlertDialog open={!!deletingStatus} onOpenChange={open => { if (!open) setDeletingStatus(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the custom template for "{WA_STATUSES.find(s => s.status === deletingStatus)?.label}" and reset it to the system default. WhatsApp notifications for this status will still be sent using the default template name and message.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              data-testid="button-confirm-delete-template"
            >
              {isDeleting ? "Deleting..." : "Reset to Default"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
  );
}
