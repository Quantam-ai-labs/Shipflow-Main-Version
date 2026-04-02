import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DollarSign,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Bot,
  MessageCircle,
  PhoneCall,
  Server,
  Database,
  Cpu,
  TrendingUp,
  BarChart3,
  Package,
  Settings,
  Filter,
  Calendar,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const MERCHANT_CATEGORIES = [
  { value: "ai_tokens", label: "AI Tokens", icon: Bot },
  { value: "whatsapp_api", label: "WhatsApp API", icon: MessageCircle },
  { value: "robocall", label: "RoboCall", icon: PhoneCall },
  { value: "other", label: "Other", icon: Package },
];

const APP_CATEGORIES = [
  { value: "ai_tokens", label: "AI Tokens (OpenAI)", icon: Bot },
  { value: "computing", label: "Computing", icon: Cpu },
  { value: "server", label: "Server", icon: Server },
  { value: "db", label: "Database", icon: Database },
  { value: "agent", label: "Agent Charges", icon: Settings },
  { value: "meta_api", label: "Meta API", icon: TrendingUp },
  { value: "replit", label: "Replit", icon: BarChart3 },
  { value: "other", label: "Other", icon: Package },
];

const ALL_CATEGORIES = [
  ...MERCHANT_CATEGORIES,
  { value: "computing", label: "Computing", icon: Cpu },
  { value: "server", label: "Server", icon: Server },
  { value: "db", label: "Database", icon: Database },
  { value: "agent", label: "Agent Charges", icon: Settings },
  { value: "meta_api", label: "Meta API", icon: TrendingUp },
  { value: "replit", label: "Replit", icon: BarChart3 },
];

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"];

function formatUSD(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getCategoryLabel(cat: string): string {
  const all = [...MERCHANT_CATEGORIES, ...APP_CATEGORIES];
  return all.find(c => c.value === cat)?.label || cat;
}

interface CostEntry {
  id: string;
  merchantId: string | null;
  category: string;
  amount: string;
  currency: string;
  description: string | null;
  date: string;
  entryType: string;
}

interface RoboCostDetail {
  pkr: number;
  answeredShort: number;
  answeredLong: number;
  answeredTotal: number;
}

interface CostSummary {
  merchantCosts: Record<string, { category: string; total: number }[]>;
  appCosts: Record<string, number>;
  grandTotal: number;
  metaAdSpend: number;
  waCounts: Record<string, number>;
  roboCounts: Record<string, number>;
  roboCosts: Record<string, RoboCostDetail>;
  roboTotalPkr: number;
  merchantNames: Record<string, string>;
}

interface CostFormState {
  merchantId: string;
  category: string;
  amount: string;
  currency: string;
  description: string;
  date: string;
  entryType: string;
}

const defaultForm: CostFormState = {
  merchantId: "",
  category: "",
  amount: "",
  currency: "USD",
  description: "",
  date: format(new Date(), "yyyy-MM-dd"),
  entryType: "manual",
};

function SectionHeader({ title, total, open, onToggle }: { title: string; total: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      className="flex items-center justify-between w-full p-4 text-left hover:bg-muted/30 transition-colors"
      onClick={onToggle}
      data-testid={`toggle-section-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-center gap-3">
        <span className="font-semibold text-base">{title}</span>
        <Badge variant="secondary" className="text-xs">{formatUSD(total)}</Badge>
      </div>
      {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
    </button>
  );
}

export default function CostDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<CostEntry | null>(null);
  const [deleteCost, setDeleteCost] = useState<CostEntry | null>(null);
  const [form, setForm] = useState<CostFormState>(defaultForm);
  const [section1Open, setSection1Open] = useState(true);
  const [section2Open, setSection2Open] = useState(true);
  const [section3Open, setSection3Open] = useState(true);
  const [ratesDialogOpen, setRatesDialogOpen] = useState(false);
  const [rateForm, setRateForm] = useState({ category: "", ratePerUnit: "", unit: "", description: "" });

  if (user?.role !== "SUPER_ADMIN") {
    return <Redirect to="/dashboard" />;
  }

  const summaryUrl = `/api/admin/costs/summary${dateFrom || dateTo ? `?${new URLSearchParams(Object.entries({ dateFrom, dateTo }).filter(([, v]) => v))}` : ""}`;

  const { data: summary, isLoading: summaryLoading } = useQuery<CostSummary>({
    queryKey: [summaryUrl],
  });

  const { data: costs, isLoading: costsLoading } = useQuery<CostEntry[]>({
    queryKey: ["/api/admin/costs"],
  });

  const { data: rates, isLoading: ratesLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/cost-rates"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/costs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).includes("/api/admin/costs") });
      toast({ title: "Cost entry added" });
      setDialogOpen(false);
      setForm(defaultForm);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/admin/costs/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).includes("/api/admin/costs") });
      toast({ title: "Cost entry updated" });
      setDialogOpen(false);
      setEditingCost(null);
      setForm(defaultForm);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/costs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).includes("/api/admin/costs") });
      toast({ title: "Cost entry deleted" });
      setDeleteCost(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const upsertRateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/admin/cost-rates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cost-rates"] });
      toast({ title: "Rate updated" });
      setRateForm({ category: "", ratePerUnit: "", unit: "", description: "" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const openAdd = () => {
    setEditingCost(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (cost: CostEntry) => {
    setEditingCost(cost);
    setForm({
      merchantId: cost.merchantId || "",
      category: cost.category,
      amount: cost.amount,
      currency: cost.currency,
      description: cost.description || "",
      date: cost.date ? format(new Date(cost.date), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
      entryType: cost.entryType,
    });
    setDialogOpen(true);
  };

  const submitForm = () => {
    const payload = {
      ...form,
      merchantId: form.merchantId || null,
      amount: form.amount,
    };
    if (editingCost) {
      updateMutation.mutate({ id: editingCost.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  const merchantCosts = summary?.merchantCosts || {};
  const appCosts = summary?.appCosts || {};
  const grandTotal = (summary?.grandTotal || 0) + (summary?.metaAdSpend || 0);
  const merchantNames = summary?.merchantNames || {};

  const merchantTotalSum = Object.values(merchantCosts).reduce(
    (sum, cats) => sum + cats.reduce((s, c) => s + c.total, 0), 0
  );
  const appTotalSum = Object.values(appCosts).reduce((s, v) => s + v, 0) + (summary?.metaAdSpend || 0);

  const appCostChartData = ALL_CATEGORIES
    .filter(c => appCosts[c.value] || (c.value === "meta_api" && (summary?.metaAdSpend || 0) > 0))
    .map(c => ({
      name: c.label,
      value: c.value === "meta_api"
        ? (appCosts[c.value] || 0) + (summary?.metaAdSpend || 0)
        : (appCosts[c.value] || 0),
    }))
    .filter(d => d.value > 0);

  const grandTotalChartData = [
    { name: "Merchant Costs", value: merchantTotalSum },
    { name: "App Costs", value: appTotalSum - (summary?.metaAdSpend || 0) },
    { name: "Meta Ad Spend", value: summary?.metaAdSpend || 0 },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto" data-testid="cost-dashboard">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-cost-dashboard-title">Cost Dashboard</h1>
          <p className="text-sm text-muted-foreground">Track all platform operational costs</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setRatesDialogOpen(true)} data-testid="button-manage-rates">
            <Settings className="w-4 h-4 mr-2" />
            Cost Rates
          </Button>
          <Button onClick={openAdd} data-testid="button-add-cost">
            <Plus className="w-4 h-4 mr-2" />
            Add Entry
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="w-[160px]"
            data-testid="input-date-from"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="w-[160px]"
            data-testid="input-date-to"
          />
        </div>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>
            Clear
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Merchant Costs</p>
            <p className="text-2xl font-bold text-blue-500 mt-1" data-testid="text-merchant-total">
              {summaryLoading ? <Skeleton className="h-8 w-28" /> : formatUSD(merchantTotalSum)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{Object.keys(merchantCosts).length} merchants</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">App Costs</p>
            <p className="text-2xl font-bold text-amber-500 mt-1" data-testid="text-app-total">
              {summaryLoading ? <Skeleton className="h-8 w-28" /> : formatUSD(appTotalSum)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">incl. Meta ad spend</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Grand Total</p>
            <p className="text-2xl font-bold text-emerald-500 mt-1" data-testid="text-grand-total">
              {summaryLoading ? <Skeleton className="h-8 w-28" /> : formatUSD(grandTotal)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">all costs combined</p>
            {!summaryLoading && (summary?.roboTotalPkr || 0) > 0 && (
              <p className="text-xs text-orange-500 mt-1 font-medium" data-testid="text-robo-total-pkr">
                + Rs {(summary?.roboTotalPkr || 0).toLocaleString()} RoboCall
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <SectionHeader
          title="Section 1 — Merchant Expenses"
          total={merchantTotalSum}
          open={section1Open}
          onToggle={() => setSection1Open(v => !v)}
        />
        {section1Open && (
          <CardContent className="pt-0">
            {summaryLoading ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : (() => {
              const allMerchantIds = Array.from(new Set([
                ...Object.keys(merchantCosts),
                ...Object.keys(summary?.roboCosts || {}),
                ...Object.keys(summary?.waCounts || {}),
                ...Object.keys(summary?.roboCounts || {}),
              ])).filter(id => !!merchantNames[id] || !!merchantCosts[id]);
              if (allMerchantIds.length === 0) {
                return <p className="text-sm text-muted-foreground text-center py-8" data-testid="empty-merchant-costs">No merchant cost entries yet</p>;
              }
              return (
                <div className="space-y-3">
                  {allMerchantIds.map((merchantId) => {
                    const cats = merchantCosts[merchantId] || [];
                    const total = cats.reduce((s, c) => s + c.total, 0);
                    const waCount = summary?.waCounts[merchantId] || 0;
                    const roboCount = summary?.roboCounts[merchantId] || 0;
                    const roboCostDetail = summary?.roboCosts?.[merchantId];
                    return (
                      <div key={merchantId} className="border rounded-lg p-4" data-testid={`merchant-cost-row-${merchantId}`}>
                        <div className="flex items-center justify-between gap-4 mb-3">
                          <div>
                            <p className="font-medium">{merchantNames[merchantId] || merchantId}</p>
                            <p className="text-xs text-muted-foreground">{merchantId}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg">{formatUSD(total)}</p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{waCount} WA msgs</span>
                              <span>{roboCount} calls</span>
                            </div>
                          </div>
                        </div>
                        {roboCostDetail && roboCostDetail.answeredTotal > 0 && (
                          <div className="mt-2 flex items-center gap-2 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded px-3 py-1.5">
                            <PhoneCall className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                            <span className="text-xs text-orange-700 dark:text-orange-400 font-medium">
                              {(() => {
                                const { pkr, answeredTotal, answeredShort, answeredLong } = roboCostDetail;
                                const parts: string[] = [];
                                if (answeredShort > 0) parts.push(`${answeredShort}×Rs2`);
                                if (answeredLong > 0) parts.push(`${answeredLong}×Rs4`);
                                return `Rs ${pkr.toLocaleString()} — ${answeredTotal} answered${parts.length > 0 ? ` (${parts.join(" + ")})` : ""}`;
                              })()}
                            </span>
                          </div>
                        )}
                        {cats.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {cats.map(c => (
                              <div key={c.category} className="flex items-center gap-1.5 bg-muted/50 rounded px-2 py-1">
                                <Badge variant="outline" className="text-xs">{getCategoryLabel(c.category)}</Badge>
                                <span className="text-xs font-medium">{formatUSD(c.total)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        )}
      </Card>

      <Card>
        <SectionHeader
          title="Section 2 — App Costs"
          total={appTotalSum}
          open={section2Open}
          onToggle={() => setSection2Open(v => !v)}
        />
        {section2Open && (
          <CardContent className="pt-0">
            {summaryLoading ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="grid lg:grid-cols-2 gap-5">
                <div className="space-y-2">
                  {APP_CATEGORIES.map(cat => {
                    const amount = cat.value === "meta_api"
                      ? (appCosts[cat.value] || 0) + (summary?.metaAdSpend || 0)
                      : (appCosts[cat.value] || 0);
                    return (
                      <div key={cat.value} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`app-cost-row-${cat.value}`}>
                        <div className="flex items-center gap-2">
                          <cat.icon className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{cat.label}</span>
                          {cat.value === "meta_api" && (summary?.metaAdSpend || 0) > 0 && (
                            <Badge variant="secondary" className="text-xs">incl. ad spend</Badge>
                          )}
                        </div>
                        <span className="font-semibold text-sm">{formatUSD(amount)}</span>
                      </div>
                    );
                  })}
                </div>
                {appCostChartData.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-3 text-muted-foreground">Breakdown</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={appCostChartData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                          {appCostChartData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatUSD(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <SectionHeader
          title="Section 3 — Grand Total"
          total={grandTotal}
          open={section3Open}
          onToggle={() => setSection3Open(v => !v)}
        />
        {section3Open && (
          <CardContent className="pt-0">
            {summaryLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : (
              <div className="grid lg:grid-cols-2 gap-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-blue-500/5">
                    <span className="font-medium">Merchant Costs</span>
                    <span className="font-bold text-blue-500">{formatUSD(merchantTotalSum)}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-amber-500/5">
                    <span className="font-medium">App Costs</span>
                    <span className="font-bold text-amber-500">{formatUSD(appTotalSum - (summary?.metaAdSpend || 0))}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-purple-500/5">
                    <span className="font-medium">Meta Ad Spend</span>
                    <span className="font-bold text-purple-500">{formatUSD(summary?.metaAdSpend || 0)}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between p-3 rounded-lg border-2 border-emerald-500/30 bg-emerald-500/5">
                    <span className="font-bold text-lg">Grand Total</span>
                    <span className="font-bold text-lg text-emerald-500" data-testid="text-grand-total-detail">{formatUSD(grandTotal)}</span>
                  </div>
                </div>
                {grandTotalChartData.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-3 text-muted-foreground">Distribution</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={grandTotalChartData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                          {grandTotalChartData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatUSD(v)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All Cost Entries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {costsLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !costs || costs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="empty-costs">
              <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No cost entries yet. Click "Add Entry" to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs.map(cost => (
                  <TableRow key={cost.id} data-testid={`row-cost-${cost.id}`}>
                    <TableCell className="text-sm text-muted-foreground">
                      {cost.date ? format(new Date(cost.date), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {cost.merchantId ? (merchantNames[cost.merchantId] || cost.merchantId.slice(0, 8) + "...") : <span className="text-muted-foreground italic">Platform</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{getCategoryLabel(cost.category)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {cost.description || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatUSD(parseFloat(cost.amount))} {cost.currency !== "USD" && <span className="text-xs text-muted-foreground">{cost.currency}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={cost.entryType === "computed" ? "outline" : "default"} className="text-xs">
                        {cost.entryType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(cost)} data-testid={`button-edit-cost-${cost.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteCost(cost)} data-testid={`button-delete-cost-${cost.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) { setDialogOpen(false); setEditingCost(null); setForm(defaultForm); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="text-cost-dialog-title">{editingCost ? "Edit Cost Entry" : "Add Cost Entry"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger data-testid="select-cost-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ai_tokens">AI Tokens</SelectItem>
                    <SelectItem value="whatsapp_api">WhatsApp API</SelectItem>
                    <SelectItem value="robocall">RoboCall</SelectItem>
                    <SelectItem value="computing">Computing</SelectItem>
                    <SelectItem value="server">Server</SelectItem>
                    <SelectItem value="db">Database</SelectItem>
                    <SelectItem value="agent">Agent Charges</SelectItem>
                    <SelectItem value="meta_api">Meta API</SelectItem>
                    <SelectItem value="replit">Replit</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Amount *</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  data-testid="input-cost-amount"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Merchant (leave blank for platform)</Label>
                <Input
                  value={form.merchantId}
                  onChange={e => setForm(f => ({ ...f, merchantId: e.target.value }))}
                  placeholder="Merchant ID (optional)"
                  data-testid="input-cost-merchant-id"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger data-testid="select-cost-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="PKR">PKR</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  data-testid="input-cost-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Entry Type</Label>
                <Select value={form.entryType} onValueChange={v => setForm(f => ({ ...f, entryType: v }))}>
                  <SelectTrigger data-testid="select-cost-entry-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="computed">Computed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description or notes"
                rows={2}
                data-testid="textarea-cost-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditingCost(null); setForm(defaultForm); }}>Cancel</Button>
            <Button onClick={submitForm} disabled={isMutating || !form.category || !form.amount} data-testid="button-submit-cost">
              {isMutating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingCost ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCost} onOpenChange={open => { if (!open) setDeleteCost(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cost Entry</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the cost entry. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCost && deleteMutation.mutate(deleteCost.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-cost"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={ratesDialogOpen} onOpenChange={setRatesDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure Cost Rates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Set per-unit rates to automatically estimate costs from usage logs.</p>
            {ratesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div>
                {rates && rates.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Current Rates</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead>Rate</TableHead>
                          <TableHead>Unit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rates.map(rate => (
                          <TableRow key={rate.id} data-testid={`rate-row-${rate.category}`}>
                            <TableCell className="text-sm">{getCategoryLabel(rate.category)}</TableCell>
                            <TableCell className="text-sm font-medium">${parseFloat(rate.ratePerUnit).toFixed(6)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">per {rate.unit}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <div className="border rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium">Add / Update Rate</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Category</Label>
                      <Select value={rateForm.category} onValueChange={v => setRateForm(f => ({ ...f, category: v }))}>
                        <SelectTrigger data-testid="select-rate-category">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ai_tokens">AI Tokens</SelectItem>
                          <SelectItem value="whatsapp_api">WhatsApp API</SelectItem>
                          <SelectItem value="robocall">RoboCall</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Rate per unit ($)</Label>
                      <Input
                        type="number"
                        step="0.000001"
                        value={rateForm.ratePerUnit}
                        onChange={e => setRateForm(f => ({ ...f, ratePerUnit: e.target.value }))}
                        placeholder="0.000001"
                        data-testid="input-rate-per-unit"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Unit label</Label>
                      <Input
                        value={rateForm.unit}
                        onChange={e => setRateForm(f => ({ ...f, unit: e.target.value }))}
                        placeholder="message / token / call"
                        data-testid="input-rate-unit"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Description (optional)</Label>
                      <Input
                        value={rateForm.description}
                        onChange={e => setRateForm(f => ({ ...f, description: e.target.value }))}
                        data-testid="input-rate-description"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={() => upsertRateMutation.mutate(rateForm)}
                    disabled={upsertRateMutation.isPending || !rateForm.category || !rateForm.ratePerUnit}
                    data-testid="button-save-rate"
                    className="w-full"
                  >
                    {upsertRateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Rate
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRatesDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
