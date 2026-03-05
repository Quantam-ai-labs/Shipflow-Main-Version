import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  MessageCircle,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Phone,
  RefreshCw,
  Info,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface WhatsAppTemplate {
  id: string;
  merchantId: string;
  workflowStatus: string;
  templateName: string;
  messageBody: string | null;
  isActive: boolean;
}

interface WhatsAppLog {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  newValue: string;
  metadata: {
    success: boolean;
    toStatus: string;
    phone: string | null;
    templateName: string;
    messageId?: string;
    messageText?: string;
    error?: string;
  } | null;
  createdAt: string;
}

const VARIABLE_CHIPS = [
  { key: "{customer_name}", label: "Customer Name" },
  { key: "{order_number}", label: "Order No." },
  { key: "{item_name}", label: "Item Name" },
  { key: "{new_status}", label: "New Status" },
  { key: "{old_status}", label: "Old Status" },
  { key: "{city}", label: "City" },
  { key: "{address}", label: "Address" },
  { key: "{total_amount}", label: "Amount" },
  { key: "{courier_name}", label: "Courier" },
  { key: "{tracking_number}", label: "Tracking No." },
];

const DEFAULT_MESSAGE_BODIES: Record<string, string> = {
  NEW: `Hello {customer_name},\n\nYour order of {item_name} is pending for Confirmation.\nPlease Reply with Confirm or Cancel.`,
  BOOKED: `Hello {customer_name},\n\nYour order #{order_number} of {item_name} is "booked".\n\nThank you for shopping with lalaimports. We appreciate your trust!`,
  FULFILLED: `Hello {customer_name},\n\nYour order #{order_number} of {item_name} is "shipped".\n\nThank you for shopping with lalaimports. We appreciate your trust!`,
  DELIVERED: `Hello {customer_name},\n\nYour order #{order_number} of {item_name} is "delivered".\n\nThank you for shopping with lalaimports. We appreciate your trust!`,
};

const DEFAULT_MESSAGE_BODY = DEFAULT_MESSAGE_BODIES.DELIVERED;

const WA_STATUSES = [
  { status: "NEW", label: "New Order", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  { status: "BOOKED", label: "Booked", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  { status: "FULFILLED", label: "Shipped", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  { status: "DELIVERED", label: "Delivered", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
];

const PREVIEW_VALUES: Record<string, string> = {
  customer_name: "Ali",
  order_number: "132",
  item_name: "MacBook Pro 2019",
  new_status: "Booked",
  old_status: "New Order",
  city: "Lahore",
  address: "House 12, Block B, DHA",
  total_amount: "Rs 2,500",
  courier_name: "Leopards",
  tracking_number: "LP123456",
};

function previewMessage(body: string, statusLabel?: string): string {
  return body.replace(/\{(\w+)\}/g, (_, key) => {
    if (key === "new_status" && statusLabel) return statusLabel;
    return PREVIEW_VALUES[key] ?? `{${key}}`;
  });
}

function WaTicks() {
  return (
    <svg width="14" height="10" viewBox="0 0 16 11" fill="none" className="flex-shrink-0">
      <path d="M1 5.5L4.5 9L10.5 1" stroke="#53BDEB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 9L12 1" stroke="#53BDEB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function WhatsAppBubble({ message, status }: { message: string; status?: string }) {
  const timeStr = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  const isNew = status === "NEW";

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

        {isNew ? (
          <div className="flex justify-end">
            <div className="w-[93%] shadow-md rounded-tl-xl rounded-tr-sm rounded-bl-xl overflow-hidden">
              <div className="relative bg-[#005C4B] px-3 py-2.5">
                <div className="absolute top-0 -right-1.5 w-0 h-0 border-t-[8px] border-t-[#005C4B] border-r-[8px] border-r-transparent" />
                <p className="text-white text-[12px] font-bold mb-1.5">Confirmation Required</p>
                <p className="text-white text-[11.5px] whitespace-pre-wrap leading-relaxed break-words">{message}</p>
                <div className="flex items-center justify-end gap-1 mt-1.5">
                  <span className="text-[#8696A0] text-[9px]">{timeStr}</span>
                  <WaTicks />
                </div>
              </div>
              <div className="border-t border-[#1A3830]">
                <div className="flex items-center justify-center gap-1.5 py-2 bg-[#005C4B] border-b border-[#1A3830]">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#53BDEB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span className="text-[#53BDEB] text-[12px] font-medium">Confirm</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 py-2 bg-[#005C4B]">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#53BDEB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  <span className="text-[#53BDEB] text-[12px] font-medium">Cancel</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <div className="relative bg-[#005C4B] rounded-tl-xl rounded-tr-sm rounded-bl-xl rounded-br-xl px-3 py-2 max-w-[92%] shadow-md">
              <div className="absolute top-0 -right-1.5 w-0 h-0 border-t-[8px] border-t-[#005C4B] border-r-[8px] border-r-transparent" />
              <p className="text-white text-[11.5px] whitespace-pre-wrap leading-relaxed break-words">{message}</p>
              <div className="flex items-center justify-end gap-1 mt-1">
                <span className="text-[#8696A0] text-[9px]">{timeStr}</span>
                <WaTicks />
              </div>
            </div>
          </div>
        )}
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

interface EditDialogProps {
  open: boolean;
  onClose: () => void;
  statusInfo: { status: string; label: string } | null;
  initial: { templateName: string; messageBody: string };
  onSave: (templateName: string, messageBody: string) => void;
  isSaving: boolean;
}

function EditTemplateDialog({ open, onClose, statusInfo, initial, onSave, isSaving }: EditDialogProps) {
  const [templateName, setTemplateName] = useState(initial.templateName);
  const [messageBody, setMessageBody] = useState(initial.messageBody);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertChip = (key: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setMessageBody(prev => prev + key);
      return;
    }
    const start = textarea.selectionStart ?? messageBody.length;
    const end = textarea.selectionEnd ?? messageBody.length;
    const newBody = messageBody.slice(0, start) + key + messageBody.slice(end);
    setMessageBody(newBody);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + key.length, start + key.length);
    }, 0);
  };

  const fallback = DEFAULT_MESSAGE_BODIES[statusInfo?.status ?? ""] ?? DEFAULT_MESSAGE_BODY;
  const previewBody = messageBody.trim() || fallback;

  const handleSave = () => {
    onSave(templateName.trim(), messageBody.trim() || fallback);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {statusInfo ? `Edit WhatsApp Template — ${statusInfo.label}` : "Edit WhatsApp Template"}
          </DialogTitle>
          <DialogDescription>
            Configure the message sent when an order moves to this status. Variables are replaced with real order data when sent.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-5 py-2">
          <div className="flex-1 min-w-0 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Template Name</label>
              <Input
                data-testid="dialog-input-template-name"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="e.g. status_notify"
              />
              <p className="text-xs text-muted-foreground">
                Must match an approved template in your WhatsApp Business account.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Message Body</label>
              <div className="flex flex-wrap gap-1.5 p-2 bg-muted/50 rounded-md border">
                <span className="text-xs text-muted-foreground self-center mr-1">Insert:</span>
                {VARIABLE_CHIPS.map(chip => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => insertChip(chip.key)}
                    className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border border-green-200 dark:border-green-800 hover:bg-green-200 dark:hover:bg-green-900 transition-colors font-mono"
                    data-testid={`chip-${chip.key.replace(/[{}]/g, "")}`}
                  >
                    + {chip.label}
                  </button>
                ))}
              </div>
              <Textarea
                ref={textareaRef}
                data-testid="dialog-textarea-message-body"
                value={messageBody}
                onChange={e => setMessageBody(e.target.value)}
                placeholder={fallback}
                rows={6}
                className="font-mono text-sm resize-y"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use the default template shown in the preview.
              </p>
            </div>
          </div>

          <div className="w-52 flex-shrink-0 flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Live preview</p>
            <WhatsAppBubble message={previewMessage(previewBody, statusInfo?.label)} status={statusInfo?.status} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="dialog-button-cancel">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !templateName.trim()}
            data-testid="dialog-button-save"
          >
            {isSaving ? "Saving..." : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatesTab() {
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery<WhatsAppTemplate[]>({
    queryKey: ["/api/whatsapp-templates"],
  });

  const saveMutation = useMutation({
    mutationFn: async ({ status, templateName, messageBody, isActive }: {
      status: string; templateName: string; messageBody?: string | null; isActive: boolean;
    }) => apiRequest("PUT", `/api/whatsapp-templates/${status}`, { templateName, messageBody, isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-templates"] });
      setEditOpen(false);
      toast({ title: "Template saved" });
    },
    onError: () => toast({ title: "Failed to save template", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (status: string) =>
      apiRequest("DELETE", `/api/whatsapp-templates/${status}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-templates"] });
      setDeleteStatus(null);
      toast({ title: "Reset to default" });
    },
    onError: () => toast({ title: "Failed to reset template", variant: "destructive" }),
  });

  const getTemplate = (status: string) =>
    templates?.find(t => t.workflowStatus === status);

  const getEditInitial = (status: string) => {
    const t = getTemplate(status);
    return {
      templateName: t?.templateName ?? "status_notify",
      messageBody: t?.messageBody ?? DEFAULT_MESSAGE_BODIES[status] ?? "",
    };
  };

  const handleToggle = (status: string, isActive: boolean) => {
    const t = getTemplate(status);
    saveMutation.mutate({
      status,
      templateName: t?.templateName ?? "status_notify",
      messageBody: t?.messageBody ?? null,
      isActive,
    });
  };

  const handleSave = (templateName: string, messageBody: string) => {
    if (!editingStatus) return;
    const t = getTemplate(editingStatus);
    saveMutation.mutate({
      status: editingStatus,
      templateName,
      messageBody,
      isActive: t?.isActive ?? true,
    });
  };

  const editingStatusInfo = WA_STATUSES.find(s => s.status === editingStatus) ?? null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-500" />
            WhatsApp Notification Templates
          </CardTitle>
          <CardDescription>
            Configure which WhatsApp Business template is sent when an order reaches each status.
            Use variable chips in the message body to insert dynamic order fields.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 flex gap-2">
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Only <strong>New Order</strong>, <strong>Booked</strong>, <strong>Shipped</strong>, and <strong>Delivered</strong> statuses
              trigger WhatsApp notifications. Template names must match approved templates in your Meta Business account.
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="divide-y rounded-md border">
              {WA_STATUSES.map(({ status, label, color }) => {
                const t = getTemplate(status);
                const isActive = t?.isActive ?? true;
                const templateName = t?.templateName ?? "status_notify";
                const messageBody = t?.messageBody;
                return (
                  <div
                    key={status}
                    className="flex items-center gap-3 px-4 py-3"
                    data-testid={`whatsapp-template-row-${status.toLowerCase()}`}
                  >
                    <Badge className={`${color} border-0 text-xs shrink-0`}>{label}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{templateName}</p>
                      {messageBody ? (
                        <p className="text-xs text-muted-foreground truncate">{messageBody}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Default message</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={isActive}
                        onCheckedChange={v => handleToggle(status, v)}
                        data-testid={`toggle-whatsapp-${status.toLowerCase()}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => { setEditingStatus(status); setEditOpen(true); }}
                        data-testid={`button-edit-whatsapp-${status.toLowerCase()}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={!t}
                        onClick={() => setDeleteStatus(status)}
                        data-testid={`button-delete-whatsapp-${status.toLowerCase()}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <EditTemplateDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        statusInfo={editingStatusInfo}
        initial={getEditInitial(editingStatus ?? "")}
        onSave={handleSave}
        isSaving={saveMutation.isPending}
      />

      <AlertDialog open={!!deleteStatus} onOpenChange={v => { if (!v) setDeleteStatus(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the custom configuration for{" "}
              <strong>{WA_STATUSES.find(s => s.status === deleteStatus)?.label}</strong> and
              revert to the default "status_notify" template with the default message body.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteStatus && deleteMutation.mutate(deleteStatus)}
              data-testid="button-confirm-delete-template"
            >
              Reset to Default
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function HistoryTab() {
  const { data: logs, isLoading, refetch, isFetching } = useQuery<WhatsAppLog[]>({
    queryKey: ["/api/whatsapp-logs"],
  });

  const STATUS_LABELS: Record<string, string> = {
    NEW: "New Order",
    BOOKED: "Booked",
    FULFILLED: "Shipped",
    DELIVERED: "Delivered",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-muted-foreground" />
            Notification History
          </CardTitle>
          <CardDescription>
            Recent WhatsApp messages sent for order status updates (last 50).
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-logs"
        >
          <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : !logs || logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No WhatsApp notifications sent yet.</p>
            <p className="text-xs mt-1">Notifications are sent when orders reach New, Booked, Shipped, or Delivered status.</p>
          </div>
        ) : (
          <div className="divide-y">
            {logs.map(log => {
              const success = log.newValue === "sent";
              const meta = log.metadata;
              return (
                <div key={log.id} className="py-3 flex gap-3 items-start" data-testid={`log-entry-${log.id}`}>
                  <div className={`mt-0.5 rounded-full p-1.5 shrink-0 ${success ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                    {success
                      ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                      : <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">#{log.orderNumber}</span>
                      <span className="text-muted-foreground text-sm">{log.customerName}</span>
                      {meta?.toStatus && (
                        <Badge variant="outline" className="text-xs">
                          → {STATUS_LABELS[meta.toStatus] ?? meta.toStatus}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-xs ${success ? "border-green-300 text-green-700 dark:text-green-400" : "border-red-300 text-red-700 dark:text-red-400"}`}
                      >
                        {success ? "Sent" : "Failed"}
                      </Badge>
                    </div>
                    {meta && (
                      <div className="mt-1 space-y-0.5">
                        {meta.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="w-3 h-3" />
                            <span>{meta.phone}</span>
                          </div>
                        )}
                        {meta.templateName && (
                          <p className="text-xs text-muted-foreground">
                            Template: <span className="font-mono">{meta.templateName}</span>
                          </p>
                        )}
                        {meta.messageText && (
                          <p className="text-xs text-muted-foreground line-clamp-2 italic">
                            "{meta.messageText}"
                          </p>
                        )}
                        {!success && meta.error && (
                          <p className="text-xs text-red-600 dark:text-red-400">
                            Error: {meta.error}
                          </p>
                        )}
                        {success && meta.messageId && (
                          <p className="text-xs text-muted-foreground font-mono">
                            ID: {meta.messageId}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0 text-right">
                    <p title={log.createdAt ? format(new Date(log.createdAt), "PPpp") : ""}>
                      {log.createdAt
                        ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })
                        : "—"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function WhatsAppPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-green-500" />
          WhatsApp Notifications
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage WhatsApp message templates and view notification history.
        </p>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates" data-testid="tab-templates">Templates</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">Notification History</TabsTrigger>
        </TabsList>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
