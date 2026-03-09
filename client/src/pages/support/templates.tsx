import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Plus, ArrowRight, Clock, Zap, Eye } from "lucide-react";

interface WhatsAppTemplate {
  id: string;
  merchantId: string;
  workflowStatus: string;
  templateName: string;
  messageBody: string | null;
  isActive: boolean;
  delayMinutes: number;
}

const VARIABLE_CHIPS = [
  { key: "{{name}}", label: "{{name}}", description: "Customer name" },
  { key: "{{order_number}}", label: "{{order_number}}", description: "Order number (e.g., #1001)" },
  { key: "{{order_total}}", label: "{{order_total}}", description: "Order total with currency" },
  { key: "{{items}}", label: "{{items}}", description: "Product name - variant x qty || ..." },
  { key: "{{tracking_number}}", label: "{{tracking_number}}", description: "Courier tracking number" },
  { key: "{{courier_name}}", label: "{{courier_name}}", description: "Courier company name" },
  { key: "{{city}}", label: "{{city}}", description: "Customer city" },
  { key: "{{address}}", label: "{{address}}", description: "Shipping address" },
  { key: "{{new_status}}", label: "{{new_status}}", description: "New order status label" },
  { key: "{{shipping_amount}}", label: "{{shipping_amount}}", description: "Shipping charge" },
];

const VARIABLE_DESCRIPTIONS: Record<string, string> = {
  "{{name}}": "Customer name",
  "{{order_number}}": "Order number (e.g., #1001)",
  "{{order_total}}": "Order total with currency",
  "{{items}}": "Product name - variant x qty",
  "{{tracking_number}}": "Courier tracking number",
  "{{courier_name}}": "Courier company name",
  "{{city}}": "Customer city",
  "{{address}}": "Shipping address",
  "{{new_status}}": "New order status",
  "{{shipping_amount}}": "Shipping charge amount",
};

const SAMPLE_VARS: Record<string, string> = {
  "{{name}}": "Ahmed",
  "{{order_number}}": "1042",
  "{{order_total}}": "2,450",
  "{{items}}": "Heavy Duty Jump Starter - Black x1 || Phone Holder x2",
  "{{tracking_number}}": "LP123456789PK",
  "{{courier_name}}": "Leopards",
  "{{city}}": "Karachi",
  "{{address}}": "Block 5, Clifton",
  "{{new_status}}": "Shipped",
  "{{shipping_amount}}": "200",
};

const DEFAULT_BODIES: Record<string, string> = {
  NEW: `Hello {{name}},\n\nYour order #{{order_number}} has been received!\n\n{{items}}\n\nTotal: Rs. {{order_total}}\n\nPlease reply *Confirm* or *Cancel*.`,
  BOOKED: `Hello {{name}},\n\nYour order #{{order_number}} has been booked with {{courier_name}}.\n\n{{items}}\n\nTotal: Rs. {{order_total}}\nTracking: {{tracking_number}}\n\nThank you for shopping with us!`,
  FULFILLED: `Hello {{name}},\n\nYour order #{{order_number}} is on its way!\n\n{{items}}\n\nTracking: {{tracking_number}} ({{courier_name}})\n\nThank you for shopping with us!`,
  DELIVERED: `Hello {{name}},\n\nYour order #{{order_number}} has been delivered.\n\n{{items}}\n\nTotal: Rs. {{order_total}}\n\nThank you for shopping with us!`,
};

const PRESETS = [
  {
    id: "order_confirmation",
    name: "Order Confirmation",
    description: "Sent when a new order is placed",
    category: "UTILITY" as const,
    targetStatus: "NEW",
    chips: ["{{name}}", "{{order_number}}", "{{order_total}}", "{{items}}"],
    defaultBody: DEFAULT_BODIES.NEW,
  },
  {
    id: "shipping_update",
    name: "Shipping Update",
    description: "Sent when an order is booked/shipped",
    category: "UTILITY" as const,
    targetStatus: "BOOKED",
    chips: ["{{name}}", "{{order_number}}", "{{tracking_number}}"],
    defaultBody: DEFAULT_BODIES.BOOKED,
  },
  {
    id: "order_delivered",
    name: "Order Delivered",
    description: "Sent after order is delivered",
    category: "UTILITY" as const,
    targetStatus: "DELIVERED",
    chips: ["{{name}}", "{{order_number}}"],
    defaultBody: DEFAULT_BODIES.DELIVERED,
  },
  {
    id: "cod_confirm",
    name: "COD Confirm Request",
    description: "Ask customer to confirm COD order",
    category: "MARKETING" as const,
    targetStatus: "NEW",
    chips: ["{{name}}", "{{order_number}}", "{{items}}"],
    defaultBody: DEFAULT_BODIES.NEW,
  },
];

const WA_STATUSES = [
  { status: "NEW", label: "New Order", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  { status: "BOOKED", label: "Booked", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  { status: "FULFILLED", label: "Shipped", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  { status: "DELIVERED", label: "Delivered", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
];

const SYSTEM_TEMPLATE_NAMES: Record<string, string> = {
  NEW: "order_confirmation_2",
  BOOKED: "order_update",
};

function buildPreview(body: string): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => SAMPLE_VARS[`{{${key}}}`] ?? `{{${key}}}`);
}

function extractUsedVars(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches)];
}

function WhatsAppBubble({ text }: { text: string }) {
  const preview = buildPreview(text);
  return (
    <div className="bg-[#dcf8c6] dark:bg-[#025c4c] text-black dark:text-white rounded-2xl rounded-tr-sm px-3 py-2.5 text-sm max-w-full whitespace-pre-wrap break-words shadow-sm font-sans leading-relaxed">
      {preview}
    </div>
  );
}

function VarChip({ varKey }: { varKey: string }) {
  return (
    <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-200 dark:border-violet-800 font-mono">
      {varKey}
    </span>
  );
}

function TemplateEditor({
  presetName,
  targetStatus,
  initialBody,
  initialTemplateName,
  onSave,
  onCancel,
  isSaving,
}: {
  presetName?: string;
  targetStatus: string;
  initialBody: string;
  initialTemplateName: string;
  onSave: (templateName: string, messageBody: string, status: string) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [templateName, setTemplateName] = useState(initialTemplateName);
  const [category, setCategory] = useState("utility");
  const [messageBody, setMessageBody] = useState(initialBody);
  const [status, setStatus] = useState(targetStatus);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTemplateName(initialTemplateName);
    setMessageBody(initialBody);
    setStatus(targetStatus);
  }, [initialTemplateName, initialBody, targetStatus]);

  const insertChip = (key: string) => {
    const el = textareaRef.current;
    if (!el) { setMessageBody(p => p + key); return; }
    const s = el.selectionStart ?? messageBody.length;
    const e = el.selectionEnd ?? messageBody.length;
    const next = messageBody.slice(0, s) + key + messageBody.slice(e);
    setMessageBody(next);
    setTimeout(() => { el.focus(); el.setSelectionRange(s + key.length, s + key.length); }, 0);
  };

  const usedVars = extractUsedVars(messageBody);

  return (
    <div className="space-y-5">
      {presetName && (
        <div className="flex items-center gap-2 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg px-4 py-2.5">
          <FileText className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          <span className="text-sm text-violet-700 dark:text-violet-300">Using preset: <strong>{presetName}</strong></span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="tpl-name">Template Name</Label>
          <Input
            id="tpl-name"
            value={templateName}
            onChange={e => setTemplateName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="order_confirmation"
            data-testid="input-template-name"
          />
          <p className="text-xs text-muted-foreground">Lowercase, underscores only</p>
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger data-testid="select-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="utility">Utility</SelectItem>
              <SelectItem value="marketing">Marketing</SelectItem>
              <SelectItem value="authentication">Authentication</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status Trigger</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger data-testid="select-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WA_STATUSES.map(s => (
                <SelectItem key={s.status} value={s.status}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Message Body</Label>
          <span className="text-xs text-muted-foreground">{usedVars.length} variable{usedVars.length !== 1 ? "s" : ""} used</span>
        </div>

        <div className="flex flex-wrap gap-1.5 p-2.5 bg-muted/40 rounded-md border">
          {VARIABLE_CHIPS.map(chip => (
            <button
              key={chip.key}
              type="button"
              onClick={() => insertChip(chip.key)}
              className="text-xs px-2 py-0.5 rounded border border-violet-200 dark:border-violet-800 bg-white dark:bg-background hover:bg-violet-50 dark:hover:bg-violet-900/20 text-violet-700 dark:text-violet-300 font-mono transition-colors"
              title={chip.description}
              data-testid={`chip-${chip.key.replace(/[{}]/g, "")}`}
            >
              + {chip.label}
            </button>
          ))}
        </div>

        <Textarea
          ref={textareaRef}
          data-testid="textarea-message-body"
          value={messageBody}
          onChange={e => setMessageBody(e.target.value)}
          placeholder={DEFAULT_BODIES[status] ?? "Enter your message..."}
          rows={8}
          className="font-mono text-sm resize-y"
        />
      </div>

      {usedVars.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <Label className="text-sm">Variable Mapping</Label>
          </div>
          <div className="bg-muted/40 rounded-lg border divide-y">
            {usedVars.map((v, i) => (
              <div key={v} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="text-xs font-mono bg-white dark:bg-background border rounded px-1.5 py-0.5 text-muted-foreground w-10 text-center">{`{{${i + 1}}}`}</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                <VarChip varKey={v} />
                <span className="text-muted-foreground text-xs">{VARIABLE_DESCRIPTIONS[v] ?? ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Eye className="w-4 h-4 text-muted-foreground" />
          <Label className="text-sm">Live Preview</Label>
        </div>
        <div className="bg-[#efeae2] dark:bg-[#0d1b17] rounded-xl p-4">
          <div className="max-w-xs">
            <WhatsAppBubble text={messageBody || DEFAULT_BODIES[status] || ""} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t">
        <Button variant="outline" onClick={onCancel} data-testid="button-cancel-template">Cancel</Button>
        <Button
          onClick={() => onSave(templateName || "custom_message", messageBody.trim() || DEFAULT_BODIES[status] || "", status)}
          disabled={isSaving}
          data-testid="button-save-template"
        >
          {isSaving ? "Saving..." : "Save Template"}
        </Button>
      </div>
    </div>
  );
}

export default function SupportTemplatesPage() {
  const { toast } = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPreset, setEditorPreset] = useState<typeof PRESETS[0] | null>(null);
  const [editingStatus, setEditingStatus] = useState<string>("NEW");
  const [delayInputs, setDelayInputs] = useState<Record<string, string>>({});

  const { data: templates, isLoading } = useQuery<WhatsAppTemplate[]>({
    queryKey: ["/api/whatsapp-templates"],
  });

  const saveMutation = useMutation({
    mutationFn: async ({ status, templateName, messageBody, isActive, delayMinutes }: {
      status: string; templateName: string; messageBody?: string | null; isActive: boolean; delayMinutes?: number;
    }) => apiRequest("PUT", `/api/whatsapp-templates/${status}`, { templateName, messageBody, isActive, delayMinutes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-templates"] });
      setEditorOpen(false);
      toast({ title: "Template saved" });
    },
    onError: () => toast({ title: "Failed to save template", variant: "destructive" }),
  });

  const getTemplate = (status: string) => templates?.find(t => t.workflowStatus === status);

  const handlePresetClick = (preset: typeof PRESETS[0]) => {
    setEditorPreset(preset);
    setEditingStatus(preset.targetStatus);
    setEditorOpen(true);
  };

  const handleNewTemplate = () => {
    setEditorPreset(null);
    setEditingStatus("NEW");
    setEditorOpen(true);
  };

  const handleEditorSave = (templateName: string, messageBody: string, status: string) => {
    const t = getTemplate(status);
    saveMutation.mutate({
      status,
      templateName,
      messageBody,
      isActive: t?.isActive ?? true,
      delayMinutes: t?.delayMinutes ?? 0,
    });
  };

  const handleToggle = (status: string, isActive: boolean) => {
    const t = getTemplate(status);
    saveMutation.mutate({
      status,
      templateName: t?.templateName ?? (SYSTEM_TEMPLATE_NAMES[status] || "custom_message"),
      messageBody: t?.messageBody,
      isActive,
      delayMinutes: t?.delayMinutes ?? 0,
    });
  };

  const handleSaveDelay = (status: string) => {
    const t = getTemplate(status);
    const raw = delayInputs[status] ?? String(t?.delayMinutes ?? 0);
    const mins = Math.max(0, parseInt(raw) || 0);
    saveMutation.mutate({
      status,
      templateName: t?.templateName ?? (SYSTEM_TEMPLATE_NAMES[status] || "custom_message"),
      messageBody: t?.messageBody,
      isActive: t?.isActive ?? true,
      delayMinutes: mins,
    });
    toast({ title: "Delay saved" });
  };

  const getInitialEditorData = (status: string) => {
    const t = getTemplate(status);
    const systemName = SYSTEM_TEMPLATE_NAMES[status];
    return {
      templateName: t?.templateName ?? systemName ?? "custom_message",
      messageBody: t?.messageBody ?? DEFAULT_BODIES[status] ?? "",
    };
  };

  if (editorOpen) {
    const initial = getInitialEditorData(editingStatus);
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight">WhatsApp Message Templates</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Create WhatsApp templates with Shopify order data.</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <TemplateEditor
              presetName={editorPreset?.name}
              targetStatus={editingStatus}
              initialBody={editorPreset?.defaultBody ?? initial.messageBody}
              initialTemplateName={initial.templateName}
              onSave={handleEditorSave}
              onCancel={() => { setEditorOpen(false); setEditorPreset(null); }}
              isSaving={saveMutation.isPending}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">WhatsApp Message Templates</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Create WhatsApp templates with Shopify order data. Templates are sent automatically when orders change status.
          </p>
        </div>
        <Button onClick={handleNewTemplate} data-testid="button-new-template">
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Quick Start Presets</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PRESETS.map(preset => (
            <button
              key={preset.id}
              onClick={() => handlePresetClick(preset)}
              className="text-left p-4 rounded-xl border bg-card hover:bg-muted/40 transition-colors group"
              data-testid={`card-preset-${preset.id}`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="font-semibold text-sm">{preset.name}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                  preset.category === "UTILITY"
                    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800"
                    : "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800"
                }`}>{preset.category}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2.5">{preset.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {preset.chips.map(c => (
                  <span key={c} className="text-xs px-2 py-0.5 rounded-full font-mono bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                    {c}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Active Templates</h2>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {WA_STATUSES.map(({ status, label, color }) => {
              const tpl = getTemplate(status);
              const isActive = tpl?.isActive ?? false;
              const msgBody = tpl?.messageBody ?? DEFAULT_BODIES[status] ?? "";
              const tplName = tpl?.templateName ?? (SYSTEM_TEMPLATE_NAMES[status] || "custom_message");
              const isSystem = !!SYSTEM_TEMPLATE_NAMES[status] && tplName === SYSTEM_TEMPLATE_NAMES[status];

              return (
                <Card key={status} className={`transition-opacity ${!isActive ? "opacity-60" : ""}`} data-testid={`card-template-${status}`}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={`${color} text-xs`}>{label}</Badge>
                        {isSystem && <Badge variant="outline" className="text-xs font-mono">{tplName}</Badge>}
                        {!tpl && <Badge variant="secondary" className="text-xs">Default</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{isActive ? "On" : "Off"}</span>
                        <Switch
                          checked={isActive}
                          onCheckedChange={v => handleToggle(status, v)}
                          disabled={saveMutation.isPending}
                          data-testid={`switch-template-${status}`}
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    {isSystem ? (
                      <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs text-muted-foreground border">
                        Meta pre-approved: <span className="font-mono font-medium text-foreground">{tplName}</span>
                      </div>
                    ) : (
                      <div className="bg-[#dcf8c6] dark:bg-[#025c4c] rounded-lg px-3 py-2 text-xs whitespace-pre-wrap break-words max-h-20 overflow-hidden leading-relaxed">
                        {buildPreview(msgBody).slice(0, 150)}{msgBody.length > 150 ? "..." : ""}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => { setEditingStatus(status); setEditorPreset(null); setEditorOpen(true); }}
                      data-testid={`button-edit-template-${status}`}
                    >
                      Edit Template
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {templates?.length === 0 && !isLoading && (
          <p className="text-center text-sm text-muted-foreground py-6">
            No custom templates yet. Use a preset above or click "New Template" to create one.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Automation Rules</h2>
        </div>
        <p className="text-xs text-muted-foreground">Configure when messages are sent and how long after the status changes.</p>

        <div className="rounded-xl border overflow-hidden">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 mx-4 my-2 rounded" />)
          ) : (
            WA_STATUSES.map(({ status, label, color }, idx) => {
              const tpl = getTemplate(status);
              const isActive = tpl?.isActive ?? false;
              const delayVal = delayInputs[status] ?? String(tpl?.delayMinutes ?? 0);
              const savedDelay = tpl?.delayMinutes ?? 0;

              return (
                <div
                  key={status}
                  className={`flex items-center gap-3 px-4 py-3 ${idx < WA_STATUSES.length - 1 ? "border-b" : ""} ${!isActive ? "opacity-50" : ""}`}
                  data-testid={`row-automation-${status}`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Order</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    <Badge className={`${color} text-xs shrink-0`}>{label}</Badge>
                    <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium text-foreground whitespace-nowrap">Send WhatsApp</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      min="0"
                      max="1440"
                      value={delayVal}
                      onChange={e => setDelayInputs(prev => ({ ...prev, [status]: e.target.value }))}
                      onBlur={() => handleSaveDelay(status)}
                      onKeyDown={e => { if (e.key === "Enter") handleSaveDelay(status); }}
                      className="w-16 h-7 text-xs text-center"
                      disabled={!isActive}
                      data-testid={`input-delay-${status}`}
                    />
                    <span className="text-xs text-muted-foreground">min</span>
                    {savedDelay === 0 ? (
                      <Badge variant="secondary" className="text-xs">Immediately</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">After {savedDelay}m</Badge>
                    )}
                  </div>

                  <Switch
                    checked={isActive}
                    onCheckedChange={v => handleToggle(status, v)}
                    disabled={saveMutation.isPending}
                    data-testid={`switch-automation-${status}`}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
