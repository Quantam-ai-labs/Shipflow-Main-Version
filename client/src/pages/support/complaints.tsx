import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  ClipboardList,
  Plus,
  Search,
  Loader2,
  X,
  ChevronRight,
  Clock,
  MessageSquare,
  ArrowRight,
  Send,
  CheckCircle2,
  AlertCircle,
  Eye,
  Settings2,
  Info,
} from "lucide-react";
import { format } from "date-fns";

interface Complaint {
  id: string;
  merchantId: string;
  ticketNumber: string;
  conversationId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  productDetails: string | null;
  deliveryDetails: string | null;
  trackingNumber: string | null;
  source: string;
  reason: string | null;
  status: string;
  statusHistory: Array<{ status: string; changedAt: string; changedBy: string }>;
  createdAt: string;
  updatedAt: string;
}

interface ComplaintTemplate {
  id: string;
  merchantId: string;
  status: string;
  messageTemplate: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; badgeVariant: string }> = {
  logged: { label: "Logged", color: "bg-yellow-500", badgeVariant: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" },
  in_progress: { label: "In Progress", color: "bg-blue-500", badgeVariant: "bg-blue-500/10 text-blue-400 border border-blue-500/20" },
  under_investigation: { label: "Under Investigation", color: "bg-purple-500", badgeVariant: "bg-violet-500/10 text-violet-400 border border-violet-500/20" },
  resolving: { label: "Resolving", color: "bg-orange-500", badgeVariant: "bg-orange-500/10 text-orange-400 border border-orange-500/20" },
  resolved: { label: "Resolved", color: "bg-green-500", badgeVariant: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
};

const STATUS_ORDER = ["logged", "in_progress", "under_investigation", "resolving", "resolved"];

const SOURCE_LABELS: Record<string, string> = {
  whatsapp_chat: "WhatsApp",
  call: "Phone Call",
  social_media: "Social Media",
  other: "Other",
};

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "logged", label: "Logged" },
  { key: "in_progress", label: "In Progress" },
  { key: "under_investigation", label: "Investigating" },
  { key: "resolving", label: "Resolving" },
  { key: "resolved", label: "Resolved" },
];

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, badgeVariant: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.badgeVariant}`} data-testid={`badge-status-${status}`}>
      {config.label}
    </span>
  );
}

function replaceTemplatePlaceholders(template: string, complaint: Complaint): string {
  return template
    .replace(/\{\{ticketNumber\}\}/g, complaint.ticketNumber)
    .replace(/\{\{orderNumber\}\}/g, complaint.orderNumber || "N/A")
    .replace(/\{\{status\}\}/g, STATUS_CONFIG[complaint.status]?.label || complaint.status)
    .replace(/\{\{reason\}\}/g, complaint.reason || "N/A");
}

export default function SupportComplaintsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showTemplatesDialog, setShowTemplatesDialog] = useState(false);
  const [statusChangeTarget, setStatusChangeTarget] = useState<string | null>(null);
  const [notifyMessage, setNotifyMessage] = useState("");

  const { data: complaintsData, isLoading } = useQuery<{ complaints: Complaint[]; total: number }>({
    queryKey: ["/api/support/complaints", activeTab, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeTab !== "all") params.set("status", activeTab);
      if (search) params.set("search", search);
      return fetch(`/api/support/complaints?${params}`).then(r => r.json());
    },
  });

  const { data: templates } = useQuery<ComplaintTemplate[]>({
    queryKey: ["/api/support/complaint-templates"],
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/support/complaints/${id}/status`, { status }),
    onSuccess: async (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/complaints"] });
      if (selectedComplaint) {
        const updated = await fetch(`/api/support/complaints/${vars.id}`).then(r => r.json());
        setSelectedComplaint(updated);
      }
      toast({ title: "Status updated" });
    },
  });

  const notifyMutation = useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) => {
      const res = await apiRequest("POST", `/api/support/complaints/${id}/notify`, { message });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.chatSaveWarning) {
        toast({ title: "WhatsApp notification sent", description: "Note: " + data.chatSaveWarning, variant: "destructive" });
      } else {
        toast({ title: "WhatsApp notification sent" });
      }
      setStatusChangeTarget(null);
      setNotifyMessage("");
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to send notification";
      toast({ title: "Failed to send notification", description: message, variant: "destructive" });
    },
  });

  const handleStatusChange = (complaint: Complaint, newStatus: string) => {
    const template = templates?.find(t => t.status === newStatus);
    if (complaint.customerPhone) {
      setStatusChangeTarget(newStatus);
      setNotifyMessage(template ? replaceTemplatePlaceholders(template.messageTemplate, { ...complaint, status: newStatus }) : "");
    } else {
      statusMutation.mutate({ id: complaint.id, status: newStatus });
    }
  };

  const handleUpdateOnly = async () => {
    if (!selectedComplaint || !statusChangeTarget) return;
    await statusMutation.mutateAsync({ id: selectedComplaint.id, status: statusChangeTarget });
    setStatusChangeTarget(null);
    setNotifyMessage("");
  };

  const handleUpdateAndSend = async () => {
    if (!selectedComplaint || !statusChangeTarget) return;
    await statusMutation.mutateAsync({ id: selectedComplaint.id, status: statusChangeTarget });
    if (notifyMessage) {
      notifyMutation.mutate({ id: selectedComplaint.id, message: notifyMessage });
    } else {
      setStatusChangeTarget(null);
    }
  };

  const getNextStatuses = (current: string): string[] => {
    const idx = STATUS_ORDER.indexOf(current);
    if (idx === -1 || idx >= STATUS_ORDER.length - 1) return [];
    return STATUS_ORDER.slice(idx + 1);
  };

  const complaintsList = complaintsData?.complaints || [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold" data-testid="text-page-title">Complaints</h1>
          <Badge variant="secondary" data-testid="badge-total-count">{complaintsData?.total || 0}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTemplatesDialog(true)}
            data-testid="button-manage-templates"
          >
            <Settings2 className="w-4 h-4 mr-1" />
            Templates
          </Button>
          <Button size="sm" onClick={() => setShowNewDialog(true)} data-testid="button-new-complaint">
            <Plus className="w-4 h-4 mr-1" />
            New Complaint
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-6 py-3 border-b overflow-x-auto">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            data-testid={`tab-filter-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tickets, customers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 w-64 h-8"
            data-testid="input-search"
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : complaintsList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <ClipboardList className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">No complaints found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.04] text-left">
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Ticket #</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Customer</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Order</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Source</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Created</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {complaintsList.map(c => (
                  <tr
                    key={c.id}
                    data-testid={`row-complaint-${c.id}`}
                    className={`border-b border-white/[0.05] hover:bg-blue-500/[0.06] cursor-pointer transition-colors ${
                      selectedComplaint?.id === c.id ? "bg-blue-500/10" : ""
                    }`}
                    onClick={() => setSelectedComplaint(c)}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-medium" data-testid={`text-ticket-${c.id}`}>{c.ticketNumber}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium" data-testid={`text-customer-${c.id}`}>{c.customerName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{c.customerPhone || ""}</div>
                    </td>
                    <td className="px-4 py-3 text-xs" data-testid={`text-order-${c.id}`}>{c.orderNumber || "—"}</td>
                    <td className="px-4 py-3 text-xs">{SOURCE_LABELS[c.source] || c.source}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.createdAt ? format(new Date(c.createdAt), "MMM d, yyyy") : "—"}</td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" data-testid={`button-view-${c.id}`}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selectedComplaint && (
          <ComplaintDetailPanel
            complaint={selectedComplaint}
            onClose={() => setSelectedComplaint(null)}
            onStatusChange={handleStatusChange}
            nextStatuses={getNextStatuses(selectedComplaint.status)}
            statusChangePending={statusMutation.isPending}
            templates={templates || []}
          />
        )}
      </div>

      {statusChangeTarget && selectedComplaint && (
        <Dialog open onOpenChange={() => { setStatusChangeTarget(null); setNotifyMessage(""); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Status & Notify Customer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <StatusBadge status={selectedComplaint.status} />
                <ArrowRight className="w-4 h-4" />
                <StatusBadge status={statusChangeTarget} />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp Message</Label>
                <Textarea
                  value={notifyMessage}
                  onChange={e => setNotifyMessage(e.target.value)}
                  rows={4}
                  placeholder="Enter your WhatsApp message..."
                  data-testid="textarea-notify-message"
                />
                <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                  <Info className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>Sends as plain text — only delivered if the customer messaged in the last 24 hours</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setStatusChangeTarget(null); setNotifyMessage(""); }}>Cancel</Button>
              <Button
                variant="outline"
                onClick={handleUpdateOnly}
                disabled={statusMutation.isPending || notifyMutation.isPending}
                data-testid="button-update-only"
              >
                {statusMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Update Only
              </Button>
              <Button
                onClick={handleUpdateAndSend}
                disabled={statusMutation.isPending || notifyMutation.isPending || !notifyMessage.trim()}
                data-testid="button-confirm-status-notify"
              >
                {(statusMutation.isPending || notifyMutation.isPending) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                <Send className="w-4 h-4 mr-1" />
                Update & Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showNewDialog && (
        <NewComplaintDialog
          open={showNewDialog}
          onOpenChange={setShowNewDialog}
        />
      )}

      {showTemplatesDialog && (
        <TemplatesDialog
          open={showTemplatesDialog}
          onOpenChange={setShowTemplatesDialog}
        />
      )}
    </div>
  );
}

function ComplaintDetailPanel({
  complaint,
  onClose,
  onStatusChange,
  nextStatuses,
  statusChangePending,
  templates,
}: {
  complaint: Complaint;
  onClose: () => void;
  onStatusChange: (complaint: Complaint, newStatus: string) => void;
  nextStatuses: string[];
  statusChangePending: boolean;
  templates: ComplaintTemplate[];
}) {
  const { toast } = useToast();
  const history = Array.isArray(complaint.statusHistory) ? complaint.statusHistory : [];
  const [showFiledNotify, setShowFiledNotify] = useState(false);
  const [filedMessage, setFiledMessage] = useState("");

  const sendFiledNotifyMutation = useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) => {
      const res = await apiRequest("POST", `/api/support/complaints/${id}/notify`, { message });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "WhatsApp notification sent" });
      setShowFiledNotify(false);
      setFiledMessage("");
    },
    onError: () => {
      toast({ title: "Failed to send notification", variant: "destructive" });
    },
  });

  const openFiledNotify = () => {
    const loggedTemplate = templates.find(t => t.status === "logged");
    const prefilled = loggedTemplate
      ? replaceTemplatePlaceholders(loggedTemplate.messageTemplate, complaint)
      : `Hi! Your complaint has been logged. Ticket: ${complaint.ticketNumber}.${complaint.reason ? ` Reason: ${complaint.reason}.` : ""} Our team will review it shortly.`;
    setFiledMessage(prefilled);
    setShowFiledNotify(true);
  };

  return (
    <>
    <div className="w-[380px] border-l bg-background flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <div className="font-mono text-sm font-semibold" data-testid="text-detail-ticket">{complaint.ticketNumber}</div>
          <StatusBadge status={complaint.status} />
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-detail">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <Section title="Customer">
            <InfoRow label="Name" value={complaint.customerName} />
            <InfoRow label="Phone" value={complaint.customerPhone} />
          </Section>

          <Section title="Order">
            <InfoRow label="Order #" value={complaint.orderNumber} />
            <InfoRow label="Tracking" value={complaint.trackingNumber} />
          </Section>

          {complaint.productDetails && (
            <Section title="Products">
              <p className="text-xs text-muted-foreground whitespace-pre-line">{complaint.productDetails}</p>
            </Section>
          )}

          {complaint.deliveryDetails && (
            <Section title="Delivery">
              <p className="text-xs text-muted-foreground">{complaint.deliveryDetails}</p>
            </Section>
          )}

          <Section title="Details">
            <InfoRow label="Source" value={SOURCE_LABELS[complaint.source] || complaint.source} />
            {complaint.reason && (
              <div className="mt-1">
                <span className="text-xs text-muted-foreground">Reason:</span>
                <p className="text-xs mt-0.5">{complaint.reason}</p>
              </div>
            )}
            <InfoRow label="Created" value={complaint.createdAt ? format(new Date(complaint.createdAt), "MMM d, yyyy h:mm a") : null} />
          </Section>

          {complaint.conversationId && (
            <Section title="Chat">
              <a
                href={`/support/chat?conv=${complaint.conversationId}`}
                className="text-xs text-primary hover:underline flex items-center gap-1"
                data-testid="link-conversation"
              >
                <MessageSquare className="w-3 h-3" /> View Conversation
              </a>
            </Section>
          )}

          {complaint.customerPhone && (
            <Section title="Notify Customer">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 text-xs"
                onClick={openFiledNotify}
                data-testid="button-send-filed-notification"
              >
                <Send className="w-3 h-3" />
                Send Complaint Filed Notification
              </Button>
            </Section>
          )}

          {history.length > 0 && (
            <Section title="Status Timeline">
              <div className="space-y-2">
                {history.map((h, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${STATUS_CONFIG[h.status]?.color || "bg-gray-400"}`} />
                    <div>
                      <div className="text-xs font-medium">{STATUS_CONFIG[h.status]?.label || h.status}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {h.changedAt ? format(new Date(h.changedAt), "MMM d, h:mm a") : ""} · {h.changedBy}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {nextStatuses.length > 0 && (
            <Section title="Update Status">
              <div className="space-y-1.5">
                {nextStatuses.map(s => (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    className="w-full justify-between"
                    disabled={statusChangePending}
                    onClick={() => onStatusChange(complaint, s)}
                    data-testid={`button-status-${s}`}
                  >
                    <span className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${STATUS_CONFIG[s]?.color}`} />
                      {STATUS_CONFIG[s]?.label}
                    </span>
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                ))}
              </div>
            </Section>
          )}

          {complaint.status === "resolved" && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs">
              <CheckCircle2 className="w-4 h-4" />
              Complaint resolved
            </div>
          )}
        </div>
      </ScrollArea>
    </div>

    {showFiledNotify && (
      <Dialog open onOpenChange={(open) => { if (!open) { setShowFiledNotify(false); setFiledMessage(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Complaint Filed Notification</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Sending to:</span>
              <span className="font-mono font-medium text-foreground">{complaint.customerPhone}</span>
            </div>
            <div className="space-y-2">
              <Label>WhatsApp Message</Label>
              <Textarea
                value={filedMessage}
                onChange={e => setFiledMessage(e.target.value)}
                rows={4}
                data-testid="textarea-filed-notify-message"
              />
              <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                <span>Sends as plain text — only delivered if the customer messaged in the last 24 hours</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowFiledNotify(false); setFiledMessage(""); }}>Cancel</Button>
            <Button
              onClick={() => sendFiledNotifyMutation.mutate({ id: complaint.id, message: filedMessage })}
              disabled={sendFiledNotifyMutation.isPending || !filedMessage.trim()}
              data-testid="button-send-filed-notify-confirm"
            >
              {sendFiledNotifyMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              <Send className="w-4 h-4 mr-1" />
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}

function NewComplaintDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [orderNumber, setOrderNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [source, setSource] = useState("other");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderLookupDone, setOrderLookupDone] = useState(false);
  const [complaintCategory, setComplaintCategory] = useState("");
  const [logisticsNote, setLogisticsNote] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [lookedUpLineItems, setLookedUpLineItems] = useState<Array<{ title?: string; name?: string }>>([]);

  const orderLookup = useMutation({
    mutationFn: async (num: string) => {
      const res = await fetch(`/api/orders?searchOrderNumber=${encodeURIComponent(num)}&pageSize=1`);
      return res.json();
    },
    onSuccess: (data) => {
      setOrderLookupDone(true);
      if (data.orders?.length > 0) {
        const o = data.orders[0];
        setOrderId(o.id);
        if (o.customerName && !customerName) setCustomerName(o.customerName);
        if (o.customerPhone && !customerPhone) setCustomerPhone(o.customerPhone);
        setLookedUpLineItems(Array.isArray(o.lineItems) ? o.lineItems : []);
        toast({ title: "Order found", description: `${o.orderNumber} — ${o.customerName || ""}` });
      } else {
        setLookedUpLineItems([]);
        toast({ title: "No order found", variant: "destructive" });
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/support/complaints", {
        orderId,
        orderNumber: orderNumber || undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        source,
        complaintCategory: complaintCategory || undefined,
        logisticsNote: complaintCategory === "logistics" ? logisticsNote || undefined : undefined,
        selectedProduct: complaintCategory === "product" ? selectedProduct || undefined : undefined,
      }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/support/complaints"] });
      const waMsg = data.waSent ? " WhatsApp notification sent to customer." : "";
      toast({ title: "Complaint created", description: `Ticket: ${data.ticketNumber}.${waMsg}` });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to create complaint", variant: "destructive" });
    },
  });

  const canSubmit = (!customerName && !customerPhone) === false &&
    !!complaintCategory &&
    (complaintCategory !== "product" || !!selectedProduct);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Complaint</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Order Number</Label>
              <Input
                value={orderNumber}
                onChange={e => { setOrderNumber(e.target.value); setOrderLookupDone(false); setOrderId(null); setLookedUpLineItems([]); }}
                placeholder="#1001"
                data-testid="input-order-number"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                disabled={!orderNumber || orderLookup.isPending}
                onClick={() => orderLookup.mutate(orderNumber)}
                data-testid="button-lookup-order"
              >
                {orderLookup.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          {orderLookupDone && !orderId && (
            <p className="text-xs text-amber-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Order not found. You can still file without an order.</p>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Customer Name</Label>
            <Input value={customerName} onChange={e => setCustomerName(e.target.value)} data-testid="input-customer-name" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Customer Phone</Label>
            <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} data-testid="input-customer-phone" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger data-testid="select-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp_chat">WhatsApp</SelectItem>
                <SelectItem value="call">Phone Call</SelectItem>
                <SelectItem value="social_media">Social Media</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Complaint Category</Label>
            <Select value={complaintCategory} onValueChange={v => { setComplaintCategory(v); setSelectedProduct(""); setLogisticsNote(""); }} data-testid="select-complaint-category">
              <SelectTrigger data-testid="trigger-complaint-category">
                <SelectValue placeholder="Select category..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="order">Issue with my order</SelectItem>
                <SelectItem value="logistics">Logistics / delivery issue</SelectItem>
                <SelectItem value="product">Issue with a product</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {complaintCategory === "order" && orderNumber && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Complaint will be logged for order <span className="font-mono font-medium text-foreground">#{orderNumber}</span>.
            </div>
          )}

          {complaintCategory === "logistics" && (
            <div className="space-y-1">
              <Label className="text-xs">Describe the issue</Label>
              <Textarea
                value={logisticsNote}
                onChange={e => setLogisticsNote(e.target.value)}
                placeholder="e.g. Package delayed, wrong address, missing item..."
                rows={2}
                data-testid="textarea-logistics-note"
              />
            </div>
          )}

          {complaintCategory === "product" && (
            <div className="space-y-1">
              <Label className="text-xs">Select product</Label>
              {!orderId ? (
                <p className="text-xs text-amber-500">Look up an order first to select a product.</p>
              ) : lookedUpLineItems.length > 0 ? (
                <Select value={selectedProduct} onValueChange={setSelectedProduct} data-testid="select-product">
                  <SelectTrigger data-testid="trigger-product">
                    <SelectValue placeholder="Choose a product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {lookedUpLineItems.map((li, i) => {
                      const title = li.title || li.name || `Product ${i + 1}`;
                      return <SelectItem key={i} value={title}>{title}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">No products found for this order.</p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !canSubmit}
            data-testid="button-create-complaint"
          >
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Create Ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: templates, isLoading } = useQuery<ComplaintTemplate[]>({
    queryKey: ["/api/support/complaint-templates"],
  });

  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const saveMutation = useMutation({
    mutationFn: async ({ status, messageTemplate }: { status: string; messageTemplate: string }) =>
      apiRequest("PUT", `/api/support/complaint-templates/${status}`, { messageTemplate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/complaint-templates"] });
      setEditingStatus(null);
      toast({ title: "Template saved" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Complaint Notification Templates</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-auto">
            {STATUS_ORDER.map(status => {
              const template = templates?.find(t => t.status === status);
              const isEditing = editingStatus === status;
              return (
                <div key={status} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={status} />
                      {status === "logged" && (
                        <span className="text-[10px] text-muted-foreground">— Filing notification</span>
                      )}
                    </div>
                    {!isEditing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setEditingStatus(status); setEditValue(template?.messageTemplate || ""); }}
                        data-testid={`button-edit-template-${status}`}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        rows={3}
                        data-testid={`textarea-template-${status}`}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Placeholders: {"{{customerName}}"}, {"{{ticketNumber}}"}, {"{{orderNumber}}"}, {"{{status}}"}, {"{{reason}}"}
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveMutation.mutate({ status, messageTemplate: editValue })} disabled={saveMutation.isPending} data-testid={`button-save-template-${status}`}>
                          {saveMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingStatus(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{template?.messageTemplate || "No template set"}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
