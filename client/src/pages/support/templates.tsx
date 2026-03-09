import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  FileText, Plus, Zap, Trash2, ChevronDown, ChevronUp, ShoppingCart, Clock, Edit2, RefreshCw, Loader2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface WaMetaTemplate {
  id: string;
  merchantId: string;
  name: string;
  language: string;
  category: string;
  headerType: string;
  headerText: string | null;
  body: string | null;
  footer: string | null;
  buttons: { type: string; text: string; url?: string }[];
  status: string;
  createdAt: string;
}

interface WaAutomation {
  id: string;
  merchantId: string;
  title: string;
  description: string | null;
  triggerStatus: string;
  delayMinutes: number;
  messageText: string | null;
  templateName: string | null;
  isActive: boolean;
  createdAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SAMPLE_VARS: Record<string, string> = {
  "{{name}}": "Ahmed",
  "{{order_number}}": "1042",
  "{{order_total}}": "2,450",
  "{{items}}": "Heavy Duty Jump Starter x1 || Phone Holder x2",
  "{{tracking_number}}": "LP123456789PK",
  "{{courier_name}}": "Leopards",
  "{{city}}": "Karachi",
  "{{address}}": "Block 5, Clifton",
  "{{new_status}}": "Shipped",
  "{{shipping_amount}}": "200",
};

const VARIABLE_CHIPS = [
  "{{name}}", "{{order_number}}", "{{order_total}}", "{{items}}",
  "{{tracking_number}}", "{{courier_name}}", "{{city}}", "{{address}}",
  "{{new_status}}", "{{shipping_amount}}",
];

const WORKFLOW_TRIGGERS = [
  { value: "NEW", label: "New Order" },
  { value: "PENDING", label: "Pending Confirmation" },
  { value: "HOLD", label: "On Hold" },
  { value: "READY_TO_SHIP", label: "Ready to Ship" },
  { value: "BOOKED", label: "Booked" },
  { value: "FULFILLED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "RETURN", label: "Return" },
  { value: "CANCELLED", label: "Cancelled" },
];

const PRESETS = [
  {
    id: "order_confirmation",
    name: "Order Confirmation",
    description: "Sent when a new order is placed",
    category: "UTILITY" as const,
    chips: ["{{name}}", "{{order_number}}", "{{order_total}}", "{{items}}"],
    buttonCount: 2,
    defaultHeader: "Order Confirmed!",
    defaultBody: "Hi {{name}}! Your order #{{order_number}} has been confirmed. Total: Rs. {{order_total}}.\n\nItems: {{items}}\n\nThank you for shopping with us!",
    defaultFooter: "Reply to confirm or cancel your order",
    defaultButtons: [{ type: "quick_reply", text: "Confirm" }, { type: "quick_reply", text: "Cancel" }],
  },
  {
    id: "shipping_update",
    name: "Shipping Update",
    description: "Sent when an order is fulfilled/shipped",
    category: "UTILITY" as const,
    chips: ["{{name}}", "{{order_number}}", "{{tracking_number}}"],
    buttonCount: 1,
    defaultHeader: "Your Order is on its Way!",
    defaultBody: "Hi {{name}}! Your order #{{order_number}} has been shipped.\n\nTracking: {{tracking_number}} ({{courier_name}})\n\nThank you for shopping with us!",
    defaultFooter: "",
    defaultButtons: [{ type: "quick_reply", text: "Track Order" }],
  },
  {
    id: "abandoned_cart",
    name: "Abandoned Cart Recovery",
    description: "Sent when a checkout is abandoned",
    category: "MARKETING" as const,
    chips: ["{{name}}", "{{items}}", "{{cart_url}}"],
    buttonCount: 1,
    defaultHeader: "You left something behind!",
    defaultBody: "Hi {{name}}! You left some items in your cart:\n\n{{items}}\n\nComplete your order now!",
    defaultFooter: "",
    defaultButtons: [{ type: "url", text: "Complete Order" }],
  },
  {
    id: "order_delivered",
    name: "Order Delivered / Feedback",
    description: "Sent after delivery for feedback",
    category: "UTILITY" as const,
    chips: ["{{name}}", "{{order_number}}"],
    buttonCount: 2,
    defaultHeader: "Order Delivered!",
    defaultBody: "Hi {{name}}! Your order #{{order_number}} has been delivered.\n\nWe hope you love your purchase! Please share your experience.",
    defaultFooter: "Thank you for your business!",
    defaultButtons: [{ type: "quick_reply", text: "Love it!" }, { type: "quick_reply", text: "Had issues" }],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPreview(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => SAMPLE_VARS[`{{${key}}}`] ?? `[${key}]`);
}

function getTriggerLabel(status: string): string {
  return WORKFLOW_TRIGGERS.find(t => t.value === status)?.label ?? status;
}

function getVariableNames(text: string | null): string[] {
  if (!text) return [];
  const VAR_NAMES: Record<string, string> = {
    "{{name}}": "Customer Name",
    "{{order_number}}": "Order Number",
    "{{order_total}}": "Order Total",
    "{{items}}": "Line Items",
    "{{tracking_number}}": "Tracking #",
    "{{courier_name}}": "Courier",
    "{{city}}": "City",
    "{{address}}": "Address",
    "{{new_status}}": "Status",
    "{{shipping_amount}}": "Shipping",
  };
  const found = [...new Set(text.match(/\{\{(\w+)\}\}/g) ?? [])];
  return found.map(v => VAR_NAMES[v] ?? v);
}

// ─── Collapsible Section ──────────────────────────────────────────────────────

function Section({
  label, labelColor, title, description, children, defaultOpen = false,
}: {
  label: string; labelColor: string; title: string; description: string;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
        data-testid={`section-toggle-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${labelColor}`}>
          {label}
        </span>
        <div className="flex-1">
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 pt-3 space-y-3 border-t bg-card">{children}</div>}
    </div>
  );
}

// ─── WhatsApp Preview ─────────────────────────────────────────────────────────

function WaPreview({
  headerText, body, footer, buttons,
}: {
  headerText: string; body: string; footer: string;
  buttons: { type: string; text: string }[];
}) {
  return (
    <div className="bg-[#efeae2] dark:bg-[#0d1b17] rounded-xl p-4 min-h-48">
      <div className="max-w-xs bg-white dark:bg-[#1f2c34] rounded-xl overflow-hidden shadow-sm">
        {headerText && (
          <div className="px-3 pt-3 pb-1">
            <p className="font-bold text-sm text-foreground">{buildPreview(headerText)}</p>
          </div>
        )}
        {body && (
          <div className="px-3 py-2">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{buildPreview(body)}</p>
          </div>
        )}
        {footer && (
          <div className="px-3 pb-2">
            <p className="text-xs text-muted-foreground">{footer}</p>
          </div>
        )}
        {buttons.length > 0 && (
          <div className="border-t divide-y">
            {buttons.map((btn, i) => (
              <div key={i} className="px-3 py-2 text-center">
                <span className="text-sm text-blue-500 font-medium">↩ {btn.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Template Editor (full-page) ──────────────────────────────────────────────

function TemplateEditor({
  preset,
  onSave,
  onCancel,
  isSaving,
}: {
  preset: typeof PRESETS[0] | null;
  onSave: (data: {
    name: string; language: string; category: string;
    headerType: string; headerText: string; body: string; footer: string;
    buttons: { type: string; text: string; url?: string }[];
  }) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState(preset?.id ?? "");
  const [language, setLanguage] = useState("en");
  const [category, setCategory] = useState(preset?.category?.toLowerCase() ?? "utility");
  const [headerType, setHeaderType] = useState("text");
  const [headerText, setHeaderText] = useState(preset?.defaultHeader ?? "");
  const [body, setBody] = useState(preset?.defaultBody ?? "");
  const [footer, setFooter] = useState(preset?.defaultFooter ?? "");
  const [buttons, setButtons] = useState<{ type: string; text: string; url?: string }[]>(
    preset?.defaultButtons ?? []
  );

  const insertVar = (v: string) => {
    const el = bodyRef.current;
    if (!el) { setBody(p => p + v); return; }
    const s = el.selectionStart ?? body.length;
    const e = el.selectionEnd ?? body.length;
    const next = body.slice(0, s) + v + body.slice(e);
    setBody(next);
    setTimeout(() => { el.focus(); el.setSelectionRange(s + v.length, s + v.length); }, 0);
  };

  const addButton = () => setButtons(b => [...b, { type: "quick_reply", text: "" }]);
  const removeButton = (i: number) => setButtons(b => b.filter((_, idx) => idx !== i));
  const updateButton = (i: number, field: string, val: string) =>
    setButtons(b => b.map((btn, idx) => idx === i ? { ...btn, [field]: val } : btn));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {preset && (
        <div className="flex items-center gap-2 mb-5 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg px-4 py-2.5">
          <FileText className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          <span className="text-sm text-violet-700 dark:text-violet-300">Using preset: <strong>{preset.name}</strong></span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Form */}
        <div className="lg:col-span-2 space-y-4">
          {/* Name / Category / Language row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Template Name</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
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
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger data-testid="select-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="en_US">English (US)</SelectItem>
                  <SelectItem value="ur">Urdu</SelectItem>
                  <SelectItem value="ar">Arabic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Header Section */}
          <Section label="H" labelColor="bg-orange-500" title="Header" description="Add a title or media you want to choose for the header." defaultOpen>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Header Type</Label>
                <Select value={headerType} onValueChange={setHeaderType}>
                  <SelectTrigger data-testid="select-header-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">T Text</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {headerType === "text" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Header Text</Label>
                    <span className="text-xs text-muted-foreground">{headerText.length}/60 characters. Supports one variable ({"{{1}}"})</span>
                  </div>
                  <Input
                    value={headerText}
                    onChange={e => setHeaderText(e.target.value.slice(0, 60))}
                    placeholder="Order Confirmed!"
                    data-testid="input-header-text"
                  />
                </div>
              )}
            </div>
          </Section>

          {/* Body Section */}
          <Section label="B" labelColor="bg-blue-500" title="Body" description="Write a compelling body of text in the selected language." defaultOpen>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Message Body</Label>
                <span className="text-xs text-muted-foreground">{getVariableNames(body).length} variables used</span>
              </div>

              {/* Variable chips */}
              <div className="flex flex-wrap gap-1.5 p-2.5 bg-muted/40 rounded-md border">
                {VARIABLE_CHIPS.map(chip => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => insertVar(chip)}
                    className="text-xs px-2 py-0.5 rounded border border-violet-200 dark:border-violet-800 bg-white dark:bg-background hover:bg-violet-50 dark:hover:bg-violet-900/20 text-violet-700 dark:text-violet-300 font-mono transition-colors"
                    data-testid={`chip-var-${chip.replace(/[{}]/g, "")}`}
                  >
                    + {chip}
                  </button>
                ))}
              </div>

              <Textarea
                ref={bodyRef}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Hi {{name}}, your order #{{order_number}} has been confirmed!"
                rows={6}
                className="font-mono text-sm resize-y"
                data-testid="textarea-body"
              />

              {/* Variable Mapping */}
              {getVariableNames(body).length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Variable Mapping</Label>
                  <div className="bg-muted/40 rounded-lg border divide-y text-xs">
                    {[...new Set(body.match(/\{\{(\w+)\}\}/g) ?? [])].map((v, i) => (
                      <div key={v} className="flex items-center gap-2 px-3 py-1.5">
                        <span className="font-mono bg-white dark:bg-background border rounded px-1.5 py-0.5 text-muted-foreground w-8 text-center">{`{{${i + 1}}}`}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-mono text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800 rounded-full px-2 py-0.5">{v}</span>
                        <span className="text-muted-foreground">{getVariableNames(v)[0] ?? ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* Footer Section */}
          <Section label="F" labelColor="bg-green-500" title="Footer" description="Write down your footer here.">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Footer Text</Label>
                <span className="text-xs text-muted-foreground">{footer.length}/60 characters. Footer does not support variables.</span>
              </div>
              <Input
                value={footer}
                onChange={e => setFooter(e.target.value.slice(0, 60))}
                placeholder="Thank you for your business!"
                data-testid="input-footer"
              />
            </div>
          </Section>

          {/* Buttons Section */}
          <Section label="B" labelColor="bg-purple-500" title="Button" description="Make your template content actionable with suitable options.">
            <div className="space-y-2">
              {buttons.map((btn, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={btn.type} onValueChange={v => updateButton(i, "type", v)}>
                    <SelectTrigger className="w-36" data-testid={`select-btn-type-${i}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quick_reply">↩ Quick Reply</SelectItem>
                      <SelectItem value="url">🔗 URL</SelectItem>
                      <SelectItem value="phone">📞 Phone</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={btn.text}
                    onChange={e => updateButton(i, "text", e.target.value)}
                    placeholder="Button text"
                    className="flex-1"
                    data-testid={`input-btn-text-${i}`}
                  />
                  <button type="button" onClick={() => removeButton(i)} className="text-muted-foreground hover:text-destructive transition-colors p-1" data-testid={`button-remove-btn-${i}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addButton} data-testid="button-add-button">
                <Plus className="w-4 h-4 mr-1.5" /> Add Button
              </Button>
              <p className="text-xs text-muted-foreground">Quick Reply buttons allow customers to respond with a tap. URL buttons open a link. Phone buttons initiate a call.</p>
            </div>
          </Section>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button variant="outline" onClick={onCancel} data-testid="button-cancel">Cancel</Button>
            <Button
              onClick={() => onSave({ name, language, category, headerType, headerText, body, footer, buttons })}
              disabled={isSaving || !name.trim()}
              data-testid="button-submit-approval"
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isSaving ? "Saving..." : "Submit for Approval"}
            </Button>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 space-y-3">
            <p className="text-sm font-semibold text-muted-foreground">Template Preview</p>
            <WaPreview
              headerText={headerType === "text" ? headerText : ""}
              body={body}
              footer={footer}
              buttons={buttons}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Automation Dialog ────────────────────────────────────────────────────────

function AutomationDialog({
  open,
  onClose,
  onSave,
  isSaving,
  templates,
  editData,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string; description: string; triggerStatus: string;
    delayMinutes: number; messageText: string; templateName: string;
  }) => void;
  isSaving: boolean;
  templates: WaMetaTemplate[];
  editData?: WaAutomation | null;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [triggerStatus, setTriggerStatus] = useState("NEW");
  const [delayMinutes, setDelayMinutes] = useState(0);
  const [messageText, setMessageText] = useState("");
  const [templateName, setTemplateName] = useState("none");

  useEffect(() => {
    if (editData) {
      setTitle(editData.title);
      setDescription(editData.description ?? "");
      setTriggerStatus(editData.triggerStatus);
      setDelayMinutes(editData.delayMinutes);
      setMessageText(editData.messageText ?? "");
      setTemplateName(editData.templateName ?? "none");
    } else {
      setTitle(""); setDescription(""); setTriggerStatus("NEW");
      setDelayMinutes(0); setMessageText(""); setTemplateName("none");
    }
  }, [editData, open]);

  const handleSave = () => {
    if (!title.trim() || !triggerStatus) return;
    onSave({ title: title.trim(), description: description.trim(), triggerStatus, delayMinutes, messageText: messageText.trim(), templateName });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-create-automation">
        <DialogHeader>
          <DialogTitle>
            {editData ? "Edit Automation" : "Create Automation"}
          </DialogTitle>
          <DialogDescription>Configure when and what message to send automatically.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="auto-title">Title <span className="text-destructive">*</span></Label>
            <Input
              id="auto-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Order Confirmation"
              data-testid="input-automation-title"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auto-desc">Description</Label>
            <Input
              id="auto-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What this automation does"
              data-testid="input-automation-description"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Trigger <span className="text-destructive">*</span></Label>
            <Select value={triggerStatus} onValueChange={setTriggerStatus}>
              <SelectTrigger data-testid="select-automation-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKFLOW_TRIGGERS.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auto-delay">Delay (minutes, 0 = instant)</Label>
            <Input
              id="auto-delay"
              type="number"
              min={0}
              value={delayMinutes}
              onChange={e => setDelayMinutes(Math.max(0, parseInt(e.target.value) || 0))}
              data-testid="input-automation-delay"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auto-message">Message Text</Label>
            <Textarea
              id="auto-message"
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              placeholder="Hi {{name}}, your order {{order_number}} has been confirmed!"
              rows={4}
              className="font-mono text-sm resize-y"
              data-testid="textarea-automation-message"
            />
            <p className="text-xs text-muted-foreground">
              Variables: {"{{name}}"}, {"{{order_number}}"}, {"{{order_total}}"}, {"{{items}}"}, {"{{tracking_number}}"}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Or use Template (overrides text)</Label>
            <Select value={templateName} onValueChange={setTemplateName}>
              <SelectTrigger data-testid="select-automation-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (use text above)</SelectItem>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.name}>{t.name} ({t.language})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={isSaving || !title.trim()}
              data-testid="button-create-automation"
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isSaving ? "Saving..." : editData ? "Save Changes" : "Create Automation"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Automation Card ──────────────────────────────────────────────────────────

function AutomationCard({
  automation,
  onToggle,
  onEdit,
  onDelete,
  isUpdating,
}: {
  automation: WaAutomation;
  onToggle: (id: string, isActive: boolean) => void;
  onEdit: (a: WaAutomation) => void;
  onDelete: (id: string) => void;
  isUpdating: boolean;
}) {
  const vars = getVariableNames(automation.messageText);

  return (
    <div className="border rounded-xl p-5 bg-card space-y-3" data-testid={`card-automation-${automation.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
            <ShoppingCart className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <p className="font-bold text-sm">{automation.title}</p>
            {automation.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{automation.description}</p>
            )}
          </div>
        </div>
        <Switch
          checked={automation.isActive}
          onCheckedChange={v => onToggle(automation.id, v)}
          disabled={isUpdating}
          data-testid={`switch-automation-${automation.id}`}
        />
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p><span className="text-foreground">Trigger:</span> {getTriggerLabel(automation.triggerStatus)}</p>
        {automation.delayMinutes > 0 && (
          <p><span className="text-foreground">Delay:</span> {automation.delayMinutes} minutes</p>
        )}
        {automation.templateName && (
          <p><span className="text-foreground">Template:</span> {automation.templateName}</p>
        )}
        {vars.length > 0 && (
          <p><span className="text-foreground">Variables:</span> {vars.join(", ")}</p>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1 border-t">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-8 text-xs"
          onClick={() => onEdit(automation)}
          data-testid={`button-edit-automation-${automation.id}`}
        >
          <Edit2 className="w-3 h-3 mr-1.5" />
          Edit
        </Button>
        <button
          type="button"
          onClick={() => onDelete(automation.id)}
          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
          data-testid={`button-delete-automation-${automation.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SupportTemplatesPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"templates" | "automations">("templates");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPreset, setEditorPreset] = useState<typeof PRESETS[0] | null>(null);
  const [autoDialogOpen, setAutoDialogOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<WaAutomation | null>(null);

  // WA Meta Templates
  const { data: metaTemplates = [], isLoading: tplLoading } = useQuery<WaMetaTemplate[]>({
    queryKey: ["/api/wa-meta-templates"],
  });

  const createTplMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/wa-meta-templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wa-meta-templates"] });
      setEditorOpen(false);
      toast({ title: "Template saved" });
    },
    onError: () => toast({ title: "Failed to save template", variant: "destructive" }),
  });

  const deleteTplMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/wa-meta-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wa-meta-templates"] });
      toast({ title: "Template deleted" });
    },
    onError: () => toast({ title: "Failed to delete template", variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/wa-meta-templates/sync");
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/wa-meta-templates"] });
      toast({ title: `${data?.synced ?? 0} templates synced from Meta` });
    },
    onError: (err: any) => {
      toast({ title: err?.message || "Failed to sync templates from Meta", variant: "destructive" });
    },
  });

  const [hasSynced, setHasSynced] = useState(false);
  useEffect(() => {
    if (activeTab === "templates" && !hasSynced && !syncMutation.isPending) {
      setHasSynced(true);
      syncMutation.mutate();
    }
  }, [activeTab, hasSynced]);

  // WA Automations
  const { data: automations = [], isLoading: autoLoading } = useQuery<WaAutomation[]>({
    queryKey: ["/api/wa-automations"],
  });

  const createAutoMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/wa-automations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wa-automations"] });
      setAutoDialogOpen(false);
      setEditingAutomation(null);
      toast({ title: "Automation created" });
    },
    onError: () => toast({ title: "Failed to create automation", variant: "destructive" }),
  });

  const updateAutoMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/wa-automations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wa-automations"] });
      setAutoDialogOpen(false);
      setEditingAutomation(null);
      toast({ title: "Automation updated" });
    },
    onError: () => toast({ title: "Failed to update automation", variant: "destructive" }),
  });

  const deleteAutoMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/wa-automations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wa-automations"] });
      toast({ title: "Automation deleted" });
    },
    onError: () => toast({ title: "Failed to delete automation", variant: "destructive" }),
  });

  const handleToggleAuto = (id: string, isActive: boolean) => {
    updateAutoMutation.mutate({ id, data: { isActive } });
  };

  const handleEditAuto = (a: WaAutomation) => {
    setEditingAutomation(a);
    setAutoDialogOpen(true);
  };

  const handleSaveAuto = (data: any) => {
    if (editingAutomation) {
      updateAutoMutation.mutate({ id: editingAutomation.id, data });
    } else {
      createAutoMutation.mutate(data);
    }
  };

  // ── Template Editor full-page mode ──
  if (editorOpen) {
    return (
      <TemplateEditor
        preset={editorPreset}
        onSave={(data) => createTplMutation.mutate(data)}
        onCancel={() => { setEditorOpen(false); setEditorPreset(null); }}
        isSaving={createTplMutation.isPending}
      />
    );
  }

  // ── Tab Bar ──
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-1 bg-muted/40 rounded-lg p-1 w-fit border">
        <button
          type="button"
          onClick={() => setActiveTab("templates")}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "templates"
              ? "bg-background text-foreground shadow-sm border"
              : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-templates"
        >
          Templates
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("automations")}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "automations"
              ? "bg-background text-foreground shadow-sm border"
              : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-automations"
        >
          Automations
        </button>
      </div>

      {/* ── TEMPLATES TAB ── */}
      {activeTab === "templates" && (
        <div className="border rounded-xl bg-card overflow-hidden">
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b">
            <div>
              <h1 className="text-lg font-bold tracking-tight" data-testid="text-page-title">Shopify Message Templates</h1>
              <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
                Create WhatsApp templates with Header, Body, Footer and Buttons. Templates are submitted to Meta for approval.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                data-testid="button-sync-meta"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {syncMutation.isPending ? "Syncing..." : "Sync from Meta"}
              </Button>
              <Button
                onClick={() => { setEditorPreset(null); setEditorOpen(true); }}
                data-testid="button-new-template"
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Template
              </Button>
            </div>
          </div>

          {/* Quick Start Presets */}
          <div className="p-6 border-b space-y-3">
            <h2 className="text-sm font-semibold">Quick Start Presets</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => { setEditorPreset(preset); setEditorOpen(true); }}
                  className="text-left p-4 rounded-xl border bg-background hover:bg-muted/30 transition-colors"
                  data-testid={`card-preset-${preset.id}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="font-semibold text-sm">{preset.name}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border shrink-0 ${
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
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border flex items-center gap-1">
                      ↩ {preset.buttonCount} button{preset.buttonCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Your Templates */}
          <div className="p-6 space-y-3">
            <h2 className="text-sm font-semibold">Your Templates</h2>
            {tplLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
              </div>
            ) : metaTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No templates yet. Use a preset above or click "New Template" to create one.
              </p>
            ) : (
              <div className="divide-y border rounded-lg overflow-hidden">
                {metaTemplates.map(tpl => (
                  <div key={tpl.id} className="flex items-center gap-3 px-4 py-3 bg-background hover:bg-muted/20 transition-colors" data-testid={`row-template-${tpl.id}`}>
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{tpl.name}</p>
                      <p className="text-xs text-muted-foreground">{tpl.language} | {tpl.category.toUpperCase()}</p>
                    </div>
                    <Badge className={`text-xs shrink-0 ${
                      tpl.status === "approved"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800"
                        : tpl.status === "rejected"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800"
                        : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800"
                    }`}>
                      {tpl.status.toUpperCase()}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => deleteTplMutation.mutate(tpl.id)}
                      disabled={deleteTplMutation.isPending}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1 shrink-0"
                      data-testid={`button-delete-template-${tpl.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── AUTOMATIONS TAB ── */}
      {activeTab === "automations" && (
        <div>
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold tracking-tight" data-testid="text-automations-title">Automations</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Set up workflows to engage customers automatically.</p>
            </div>
            <Button
              onClick={() => { setEditingAutomation(null); setAutoDialogOpen(true); }}
              data-testid="button-create-automation"
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Automation
            </Button>
          </div>

          {/* Automation list */}
          {autoLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
            </div>
          ) : automations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                <Zap className="w-7 h-7 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-base" data-testid="text-no-automations">No automations configured</p>
                <p className="text-sm text-muted-foreground mt-1">Create your first automation to send messages automatically when events occur.</p>
              </div>
              <Button
                onClick={() => { setEditingAutomation(null); setAutoDialogOpen(true); }}
                data-testid="button-create-automation-empty"
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Automation
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {automations.map(a => (
                <AutomationCard
                  key={a.id}
                  automation={a}
                  onToggle={handleToggleAuto}
                  onEdit={handleEditAuto}
                  onDelete={id => deleteAutoMutation.mutate(id)}
                  isUpdating={updateAutoMutation.isPending}
                />
              ))}
            </div>
          )}

          {/* Create / Edit Dialog */}
          <AutomationDialog
            open={autoDialogOpen}
            onClose={() => { setAutoDialogOpen(false); setEditingAutomation(null); }}
            onSave={handleSaveAuto}
            isSaving={createAutoMutation.isPending || updateAutoMutation.isPending}
            templates={metaTemplates}
            editData={editingAutomation}
          />
        </div>
      )}
    </div>
  );
}
