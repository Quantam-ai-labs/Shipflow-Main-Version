import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { MessageCircle, Pencil, CheckCircle2, XCircle, Store } from "lucide-react";

interface WhatsAppTemplate {
  id: string;
  merchantId: string;
  workflowStatus: string;
  templateName: string;
  messageBody: string | null;
  isActive: boolean;
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
  { key: "{shipping_amount}", label: "Shipping" },
  { key: "{courier_name}", label: "Courier" },
  { key: "{tracking_number}", label: "Tracking No." },
];

const DEFAULT_BODIES: Record<string, string> = {
  NEW: `Hello {customer_name},\n\nYour order #{order_number} of {item_name} is pending for Confirmation.\n\nTotal: Rs. {total_amount}\n\nPlease Reply with *Confirm* or *Cancel*.`,
  BOOKED: `Hello {customer_name},\n\nYour order #{order_number} has been booked with {courier_name}.\n\n{item_name}\n\nTracking: {tracking_number}\nTotal: Rs. {total_amount}\n\nThank you for shopping with us!`,
  FULFILLED: `Hello {customer_name},\n\nYour order #{order_number} is on its way!\n\n{item_name}\n\nTracking: {tracking_number} via {courier_name}.\n\nThank you for shopping with us!`,
  DELIVERED: `Hello {customer_name},\n\nYour order #{order_number} has been delivered.\n\n{item_name}\n\nTotal: Rs. {total_amount}\n\nThank you for shopping with us!`,
};

const SYSTEM_TEMPLATE_NAMES: Record<string, string> = {
  NEW: "order_confirmation_2",
  BOOKED: "order_update",
};

const WA_STATUSES = [
  { status: "NEW", label: "New Order", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  { status: "BOOKED", label: "Booked", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  { status: "FULFILLED", label: "Shipped", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  { status: "DELIVERED", label: "Delivered", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
];

function WhatsAppBubble({ text }: { text: string }) {
  const preview = text.slice(0, 200);
  return (
    <div className="bg-[#dcf8c6] dark:bg-[#025c4c] text-black dark:text-white rounded-2xl rounded-tr-sm px-3 py-2 text-xs max-w-full whitespace-pre-wrap break-words shadow-sm font-sans leading-relaxed">
      {preview}{text.length > 200 ? "..." : ""}
    </div>
  );
}

function EditDialog({
  open, onClose, statusInfo, initial, onSave, isSaving,
}: {
  open: boolean;
  onClose: () => void;
  statusInfo: { status: string; label: string } | null;
  initial: { templateName: string; messageBody: string };
  onSave: (templateName: string, messageBody: string | null) => void;
  isSaving: boolean;
}) {
  const status = statusInfo?.status ?? "";
  const hasSystem = status === "NEW" || status === "BOOKED";
  const systemTplName = SYSTEM_TEMPLATE_NAMES[status] ?? "";

  const [useSystem, setUseSystem] = useState(() => hasSystem && initial.templateName === systemTplName);
  const [messageBody, setMessageBody] = useState(initial.messageBody);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setUseSystem(hasSystem && initial.templateName === systemTplName);
      setMessageBody(initial.messageBody);
    }
  }, [open, status, initial.templateName, initial.messageBody, hasSystem, systemTplName]);

  const insertChip = (key: string) => {
    const el = textareaRef.current;
    if (!el) { setMessageBody(p => p + key); return; }
    const s = el.selectionStart ?? messageBody.length;
    const e = el.selectionEnd ?? messageBody.length;
    const next = messageBody.slice(0, s) + key + messageBody.slice(e);
    setMessageBody(next);
    setTimeout(() => { el.focus(); el.setSelectionRange(s + key.length, s + key.length); }, 0);
  };

  const handleSave = () => {
    if (useSystem) {
      onSave(systemTplName, null);
    } else {
      onSave("custom_message", messageBody.trim() || DEFAULT_BODIES[status] || "");
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{statusInfo?.label} — Message Template</DialogTitle>
          <DialogDescription>
            Configure the WhatsApp message sent when an order reaches this status.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {hasSystem && (
            <div className="space-y-1.5">
              <Label>Template Type</Label>
              <Select value={useSystem ? "system" : "custom"} onValueChange={v => setUseSystem(v === "system")}>
                <SelectTrigger data-testid="select-template-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">{systemTplName} (Meta approved)</SelectItem>
                  <SelectItem value="custom">Custom Message</SelectItem>
                </SelectContent>
              </Select>
              {useSystem && (
                <p className="text-xs text-muted-foreground">
                  Uses the pre-approved <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{systemTplName}</span> template from your Meta Business account.
                </p>
              )}
            </div>
          )}

          {(!hasSystem || !useSystem) && (
            <div className="space-y-2">
              <Label>Message Body</Label>
              <div className="flex flex-wrap gap-1.5 p-2 bg-muted/50 rounded-md border">
                <span className="text-xs text-muted-foreground self-center mr-1 shrink-0">Variables:</span>
                {VARIABLE_CHIPS.map(chip => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => insertChip(chip.key)}
                    className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border border-green-200 dark:border-green-800 hover:bg-green-200 dark:hover:bg-green-900 transition-colors font-mono"
                    data-testid={`chip-${chip.key.replace(/[{}]/g, "")}`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <Textarea
                ref={textareaRef}
                data-testid="textarea-message-body"
                value={messageBody}
                onChange={e => setMessageBody(e.target.value)}
                placeholder={DEFAULT_BODIES[status] ?? "Enter your message..."}
                rows={7}
                className="font-mono text-sm resize-y"
              />
              <p className="text-xs text-muted-foreground">
                Click variable chips to insert them at the cursor position.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-template">Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-template">
            {isSaving ? "Saving..." : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SupportTemplatesPage() {
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery<WhatsAppTemplate[]>({
    queryKey: ["/api/whatsapp-templates"],
  });

  const { data: storeData } = useQuery<{ allowedDomains: string[]; connectedStore: string | null }>({
    queryKey: ["/api/whatsapp-allowed-stores"],
  });

  const [storeInput, setStoreInput] = useState("");
  useEffect(() => {
    if (Array.isArray(storeData?.allowedDomains)) setStoreInput(storeData.allowedDomains.join(", "));
  }, [storeData]);

  const saveStoreMutation = useMutation({
    mutationFn: async (allowedDomains: string[]) =>
      apiRequest("PUT", "/api/whatsapp-allowed-stores", { allowedDomains }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-allowed-stores"] });
      toast({ title: "Store filter saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
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

  const getTemplate = (status: string) => templates?.find(t => t.workflowStatus === status);

  const getInitial = (status: string) => {
    const t = getTemplate(status);
    return {
      templateName: t?.templateName ?? (SYSTEM_TEMPLATE_NAMES[status] || "custom_message"),
      messageBody: t?.messageBody ?? DEFAULT_BODIES[status] ?? "",
    };
  };

  const handleToggle = (status: string, isActive: boolean) => {
    const t = getTemplate(status);
    saveMutation.mutate({
      status,
      templateName: t?.templateName ?? (SYSTEM_TEMPLATE_NAMES[status] || "custom_message"),
      messageBody: t?.messageBody,
      isActive,
    });
  };

  const editingStatusInfo = WA_STATUSES.find(s => s.status === editingStatus) ?? null;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">WhatsApp Templates</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure automated messages sent when orders change status</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))
        ) : (
          WA_STATUSES.map(({ status, label, color }) => {
            const tpl = getTemplate(status);
            const isActive = tpl?.isActive ?? false;
            const msgBody = tpl?.messageBody ?? DEFAULT_BODIES[status] ?? "";
            const tplName = tpl?.templateName ?? (SYSTEM_TEMPLATE_NAMES[status] || "custom_message");
            const isSystem = !!SYSTEM_TEMPLATE_NAMES[status] && tplName === SYSTEM_TEMPLATE_NAMES[status];

            return (
              <Card key={status} className={!isActive ? "opacity-60" : ""} data-testid={`card-template-${status}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={color}>{label}</Badge>
                      {isSystem && (
                        <Badge variant="outline" className="text-xs font-mono">{tplName}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{isActive ? "Active" : "Off"}</span>
                      <Switch
                        checked={isActive}
                        onCheckedChange={v => handleToggle(status, v)}
                        disabled={saveMutation.isPending}
                        data-testid={`switch-template-${status}`}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isSystem ? (
                    <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs text-muted-foreground border">
                      Uses Meta pre-approved template: <span className="font-mono font-medium text-foreground">{tplName}</span>
                    </div>
                  ) : (
                    <WhatsAppBubble text={msgBody} />
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => { setEditingStatus(status); setEditOpen(true); }}
                    data-testid={`button-edit-template-${status}`}
                  >
                    <Pencil className="w-3 h-3 mr-2" />
                    Edit Template
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Store className="w-4 h-4 text-muted-foreground" />
            Store Filter
          </CardTitle>
          <CardDescription>
            Restrict WhatsApp notifications to specific Shopify store domains. Leave empty to allow all stores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="store-filter">Allowed Domains</Label>
            <Input
              id="store-filter"
              value={storeInput}
              onChange={e => setStoreInput(e.target.value)}
              placeholder="e.g. mystore.myshopify.com, store2.myshopify.com"
              data-testid="input-store-filter"
            />
            <p className="text-xs text-muted-foreground">Comma-separated list of Shopify store domains</p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              const domains = storeInput.split(",").map(s => s.trim()).filter(Boolean);
              saveStoreMutation.mutate(domains);
            }}
            disabled={saveStoreMutation.isPending}
            data-testid="button-save-store-filter"
          >
            {saveStoreMutation.isPending ? "Saving..." : "Save Store Filter"}
          </Button>
        </CardContent>
      </Card>

      {editingStatus && (
        <EditDialog
          open={editOpen}
          onClose={() => { setEditOpen(false); setEditingStatus(null); }}
          statusInfo={editingStatusInfo}
          initial={getInitial(editingStatus)}
          onSave={(templateName, messageBody) => {
            const t = getTemplate(editingStatus);
            saveMutation.mutate({
              status: editingStatus,
              templateName,
              messageBody,
              isActive: t?.isActive ?? false,
            });
          }}
          isSaving={saveMutation.isPending}
        />
      )}
    </div>
  );
}
