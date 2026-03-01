import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Save,
  Search,
  RefreshCw,
  AlertTriangle,
  X,
  Truck,
  ChevronDown,
  ChevronRight,
  Tag,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Download,
  Upload,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { formatPkDate } from "@/lib/dateFormat";

// ============================================================
// Constants
// ============================================================

const WORKFLOW_STAGES = ["BOOKED", "FULFILLED", "DELIVERED", "RETURN", "CANCELLED"] as const;

const WORKFLOW_STAGE_LABELS: Record<string, string> = {
  BOOKED: "Booked",
  FULFILLED: "Fulfilled",
  DELIVERED: "Delivered",
  RETURN: "Return",
  CANCELLED: "Cancelled",
};

const NORMALIZED_STATUSES = [
  "BOOKED",
  "PICKED_UP",
  "ARRIVED_AT_ORIGIN",
  "IN_TRANSIT",
  "ARRIVED_AT_DESTINATION",
  "OUT_FOR_DELIVERY",
  "DELIVERY_ATTEMPTED",
  "DELIVERED",
  "DELIVERY_FAILED",
  "READY_FOR_RETURN",
  "RETURN_IN_TRANSIT",
  "RETURNED_TO_ORIGIN",
  "RETURNED_TO_SHIPPER",
  "CANCELLED",
] as const;

const STATUS_LABELS: Record<string, string> = {
  BOOKED: "Booked",
  PICKED_UP: "Picked Up",
  ARRIVED_AT_ORIGIN: "At Origin",
  IN_TRANSIT: "In Transit",
  ARRIVED_AT_DESTINATION: "At Destination",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERY_ATTEMPTED: "Delivery Attempted",
  DELIVERED: "Delivered",
  DELIVERY_FAILED: "Delivery Failed",
  READY_FOR_RETURN: "Ready for Return",
  RETURN_IN_TRANSIT: "Return in Transit",
  RETURNED_TO_ORIGIN: "Returned to Origin",
  RETURNED_TO_SHIPPER: "Returned to Shipper",
  CANCELLED: "Cancelled",
};

const WORKFLOW_STAGE_MAP: Record<string, string> = {
  BOOKED: "BOOKED",
  PICKED_UP: "FULFILLED",
  ARRIVED_AT_ORIGIN: "FULFILLED",
  IN_TRANSIT: "FULFILLED",
  ARRIVED_AT_DESTINATION: "FULFILLED",
  OUT_FOR_DELIVERY: "FULFILLED",
  DELIVERY_ATTEMPTED: "FULFILLED",
  DELIVERED: "DELIVERED",
  DELIVERY_FAILED: "FULFILLED",
  READY_FOR_RETURN: "RETURN",
  RETURN_IN_TRANSIT: "RETURN",
  RETURNED_TO_ORIGIN: "RETURN",
  RETURNED_TO_SHIPPER: "RETURN",
  CANCELLED: "CANCELLED",
};

const WORKFLOW_STAGE_COLORS: Record<string, string> = {
  BOOKED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  FULFILLED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  DELIVERED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  RETURN: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const STATUS_CATEGORY_COLORS: Record<string, string> = {
  BOOKED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  PICKED_UP: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  ARRIVED_AT_ORIGIN: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  IN_TRANSIT: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  ARRIVED_AT_DESTINATION: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  OUT_FOR_DELIVERY: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  DELIVERY_ATTEMPTED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  DELIVERED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  DELIVERY_FAILED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  READY_FOR_RETURN: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  RETURN_IN_TRANSIT: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  RETURNED_TO_ORIGIN: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  RETURNED_TO_SHIPPER: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const COURIER_LABELS: Record<string, string> = {
  leopards: "Leopards Courier",
  "leopards courier": "Leopards Courier",
  postex: "PostEx",
};

function courierLabel(name: string) {
  return COURIER_LABELS[name?.toLowerCase()] || name;
}

// ============================================================
// Types
// ============================================================

interface RawCourierStatus {
  courierName: string;
  rawStatus: string;
  orderCount: number;
  customMappingId: string | null;
  normalizedStatus: string | null;
  workflowStage: string | null;
  isCustom: boolean;
  systemNormalizedStatus: string | null;
}

interface KeywordMapping {
  id: string;
  merchantId: string;
  courierName: string | null;
  keyword: string;
  normalizedStatus: string;
  workflowStage: string | null;
  priority: number | null;
  createdAt: string;
}

interface UnmappedStatus {
  id: string;
  courierName: string;
  rawStatus: string;
  sampleTrackingNumber: string | null;
  occurrenceCount: number;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Row draft state key
// ============================================================

function rowKey(courierName: string, rawStatus: string) {
  return `${courierName}::${rawStatus}`;
}

// ============================================================
// Section 1: Raw Status Mapping
// ============================================================

function RawStatusMappingSection() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [courierFilter, setCourierFilter] = useState("all");
  const [expandedCouriers, setExpandedCouriers] = useState<Record<string, boolean>>({
    leopards: true,
    postex: true,
  });
  const [drafts, setDrafts] = useState<Record<string, { normalizedStatus: string; workflowStage: string }>>({});
  const [savingRows, setSavingRows] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useQuery<{ rawStatuses: RawCourierStatus[] }>({
    queryKey: ["/api/courier-status-mappings/raw-statuses"],
  });

  const resyncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/courier-status-mappings/resync");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/courier-status-mappings/raw-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "ReSync complete", description: `Updated ${data.updated || 0} orders.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to resync statuses.", variant: "destructive" });
    },
  });

  const saveMapping = async (row: RawCourierStatus) => {
    const key = rowKey(row.courierName, row.rawStatus);
    const draft = drafts[key];
    if (!draft) return;

    setSavingRows((prev) => new Set(prev).add(key));
    try {
      await apiRequest("POST", "/api/courier-status-mappings", {
        courierName: normalizeCourierName(row.courierName),
        courierStatus: row.rawStatus.toLowerCase().trim(),
        normalizedStatus: draft.normalizedStatus,
        workflowStage: draft.workflowStage,
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await refetch();
      toast({ title: "Mapping saved", description: `"${row.rawStatus}" → ${STATUS_LABELS[draft.normalizedStatus] || draft.normalizedStatus}` });
    } catch {
      toast({ title: "Error", description: "Failed to save mapping.", variant: "destructive" });
    } finally {
      setSavingRows((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const resetMapping = async (row: RawCourierStatus) => {
    if (!row.customMappingId) return;
    const key = rowKey(row.courierName, row.rawStatus);
    setSavingRows((prev) => new Set(prev).add(key));
    try {
      await apiRequest("DELETE", `/api/courier-status-mappings/${row.customMappingId}`);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await refetch();
      toast({ title: "Mapping reset", description: "Reverted to system default." });
    } catch {
      toast({ title: "Error", description: "Failed to reset mapping.", variant: "destructive" });
    } finally {
      setSavingRows((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const rawStatuses = data?.rawStatuses || [];

  const filtered = rawStatuses.filter((r) => {
    const matchesCourier =
      courierFilter === "all" ||
      normalizeCourierName(r.courierName) === courierFilter;
    const matchesSearch =
      !search ||
      r.rawStatus.toLowerCase().includes(search.toLowerCase()) ||
      (r.normalizedStatus || r.systemNormalizedStatus || "")
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      STATUS_LABELS[r.normalizedStatus || r.systemNormalizedStatus || ""]
        ?.toLowerCase()
        .includes(search.toLowerCase());
    return matchesCourier && matchesSearch;
  });

  const grouped = filtered.reduce<Record<string, RawCourierStatus[]>>((acc, r) => {
    const key = r.courierName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const toggleCourier = (name: string) => {
    setExpandedCouriers((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const getEffectiveNormalized = (row: RawCourierStatus) => {
    const key = rowKey(row.courierName, row.rawStatus);
    return drafts[key]?.normalizedStatus ?? (row.isCustom ? row.normalizedStatus : null) ?? row.systemNormalizedStatus ?? "BOOKED";
  };

  const getEffectiveStage = (row: RawCourierStatus) => {
    const key = rowKey(row.courierName, row.rawStatus);
    if (drafts[key]?.workflowStage) return drafts[key].workflowStage;
    if (row.isCustom && row.workflowStage) return row.workflowStage;
    const norm = getEffectiveNormalized(row);
    return WORKFLOW_STAGE_MAP[norm] || "FULFILLED";
  };

  const isDirty = (row: RawCourierStatus) => {
    const key = rowKey(row.courierName, row.rawStatus);
    return !!drafts[key];
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Raw Status Mappings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const customCount = rawStatuses.filter((r) => r.isCustom).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Raw Status Mappings
            </CardTitle>
            <CardDescription className="mt-1">
              Every courier status seen in your orders — with its current normalization. Override any row to change how it's categorized. System defaults are shown in muted text; custom overrides are marked.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => resyncMutation.mutate()}
              disabled={resyncMutation.isPending}
              data-testid="button-resync-statuses"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${resyncMutation.isPending ? "animate-spin" : ""}`} />
              {resyncMutation.isPending ? "Syncing..." : "ReSync"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search statuses..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-raw-statuses"
              />
            </div>
            <Select value={courierFilter} onValueChange={setCourierFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-courier-filter">
                <SelectValue placeholder="All Couriers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Couriers</SelectItem>
                <SelectItem value="leopards">Leopards Courier</SelectItem>
                <SelectItem value="postex">PostEx</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-muted-foreground">
            {filtered.length} status{filtered.length !== 1 ? "es" : ""} found
            {customCount > 0 && (
              <span className="ml-2">· {customCount} custom override{customCount !== 1 ? "s" : ""}</span>
            )}
          </div>

          {Object.entries(grouped).map(([courier, rows]) => (
            <div key={courier} className="border rounded-md overflow-hidden">
              <button
                className="w-full flex items-center justify-between gap-2 p-3 hover-elevate text-left"
                onClick={() => toggleCourier(courier)}
                data-testid={`button-toggle-courier-${courier}`}
              >
                <div className="flex items-center gap-2">
                  {expandedCouriers[courier] ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <Truck className="w-4 h-4" />
                  <span className="font-medium">{courierLabel(courier)}</span>
                  <Badge variant="secondary" className="text-xs">{rows.length}</Badge>
                  {rows.filter((r) => r.isCustom).length > 0 && (
                    <Badge variant="outline" className="text-xs text-primary border-primary/40">
                      {rows.filter((r) => r.isCustom).length} custom
                    </Badge>
                  )}
                </div>
              </button>

              {expandedCouriers[courier] && (
                <div className="border-t">
                  <div className="hidden lg:grid grid-cols-[2fr_3rem_2fr_1.6fr_auto] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/30">
                    <span>Courier Status</span>
                    <span className="text-center">Orders</span>
                    <span>Normalized Status</span>
                    <span>Workflow Stage</span>
                    <span className="w-20" />
                  </div>
                  <div className="divide-y max-h-[600px] overflow-y-auto">
                    {rows.map((row) => {
                      const key = rowKey(row.courierName, row.rawStatus);
                      const effectiveNorm = getEffectiveNormalized(row);
                      const effectiveStage = getEffectiveStage(row);
                      const dirty = isDirty(row);
                      const saving = savingRows.has(key);

                      return (
                        <div
                          key={key}
                          className={`grid grid-cols-1 lg:grid-cols-[2fr_3rem_2fr_1.6fr_auto] gap-2 px-3 py-2 items-center text-sm ${dirty ? "bg-amber-50/50 dark:bg-amber-900/10" : ""}`}
                          data-testid={`raw-status-row-${key}`}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-xs bg-muted px-2 py-1 rounded font-mono break-all leading-relaxed">
                              {row.rawStatus}
                            </code>
                            {row.isCustom && !dirty && (
                              <Badge variant="outline" className="text-[10px] shrink-0 border-primary/40 text-primary">
                                Custom
                              </Badge>
                            )}
                            {!row.isCustom && !dirty && (
                              <span className="text-[10px] text-muted-foreground shrink-0">System</span>
                            )}
                            {dirty && (
                              <Badge variant="outline" className="text-[10px] shrink-0 border-amber-400 text-amber-700 dark:text-amber-400">
                                Unsaved
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center justify-start lg:justify-center gap-1 text-xs text-muted-foreground">
                            <span className="font-medium tabular-nums">{row.orderCount}</span>
                          </div>

                          <div>
                            <Select
                              value={effectiveNorm}
                              onValueChange={(value) => {
                                setDrafts((prev) => ({
                                  ...prev,
                                  [key]: {
                                    normalizedStatus: value,
                                    workflowStage: prev[key]?.workflowStage || WORKFLOW_STAGE_MAP[value] || "FULFILLED",
                                  },
                                }));
                              }}
                            >
                              <SelectTrigger
                                className="h-8 text-xs"
                                data-testid={`select-norm-${key}`}
                              >
                                <SelectValue>
                                  <span className="flex items-center gap-1.5">
                                    <span className={`inline-block w-2 h-2 rounded-full ${STATUS_CATEGORY_COLORS[effectiveNorm]?.split(" ")[0] || "bg-gray-200"}`} />
                                    {STATUS_LABELS[effectiveNorm] || effectiveNorm}
                                  </span>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {NORMALIZED_STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    <span className="flex items-center gap-2">
                                      <span className={`inline-block w-2 h-2 rounded-full ${STATUS_CATEGORY_COLORS[s]?.split(" ")[0] || "bg-gray-200"}`} />
                                      {STATUS_LABELS[s]}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Select
                              value={effectiveStage}
                              onValueChange={(value) => {
                                setDrafts((prev) => ({
                                  ...prev,
                                  [key]: {
                                    normalizedStatus: prev[key]?.normalizedStatus || effectiveNorm,
                                    workflowStage: value,
                                  },
                                }));
                              }}
                            >
                              <SelectTrigger
                                className={`h-8 text-[11px] ${WORKFLOW_STAGE_COLORS[effectiveStage] || ""}`}
                                data-testid={`select-stage-${key}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {WORKFLOW_STAGES.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    <span className="flex items-center gap-2">
                                      <span className={`inline-block w-2 h-2 rounded-full ${WORKFLOW_STAGE_COLORS[s]?.split(" ")[0] || "bg-gray-200"}`} />
                                      {WORKFLOW_STAGE_LABELS[s]}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex items-center gap-1">
                            {dirty && (
                              <Button
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => saveMapping(row)}
                                disabled={saving}
                                data-testid={`button-save-row-${key}`}
                              >
                                {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                                {saving ? "" : "Save"}
                              </Button>
                            )}
                            {dirty && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => {
                                  setDrafts((prev) => {
                                    const next = { ...prev };
                                    delete next[key];
                                    return next;
                                  });
                                }}
                                data-testid={`button-discard-${key}`}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            )}
                            {!dirty && row.isCustom && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => resetMapping(row)}
                                disabled={saving}
                                title="Reset to system default"
                                data-testid={`button-reset-row-${key}`}
                              >
                                <RotateCcw className="w-3 h-3" />
                              </Button>
                            )}
                            {!dirty && !row.isCustom && <div className="w-7" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}

          {filtered.length === 0 && !isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <Truck className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No statuses found.</p>
              {search && <p className="text-sm">Try a different search term.</p>}
              {!search && rawStatuses.length === 0 && (
                <p className="text-sm mt-1">No orders with courier tracking data yet.</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Section 2: Keyword Rules
// ============================================================

const BLANK_KEYWORD_FORM = {
  keyword: "",
  courierName: "all" as "all" | "leopards" | "postex",
  normalizedStatus: "DELIVERY_FAILED" as string,
  workflowStage: "FULFILLED" as string,
  priority: 0,
};

function KeywordRulesSection() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK_KEYWORD_FORM });

  const { data, isLoading } = useQuery<{ mappings: KeywordMapping[] }>({
    queryKey: ["/api/courier-keyword-mappings"],
  });

  const createMutation = useMutation({
    mutationFn: async (body: object) => {
      const res = await apiRequest("POST", "/api/courier-keyword-mappings", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courier-keyword-mappings"] });
      setDialogOpen(false);
      setForm({ ...BLANK_KEYWORD_FORM });
      toast({ title: "Keyword rule created" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create keyword rule.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: object }) => {
      const res = await apiRequest("PUT", `/api/courier-keyword-mappings/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courier-keyword-mappings"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...BLANK_KEYWORD_FORM });
      toast({ title: "Keyword rule updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update keyword rule.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/courier-keyword-mappings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courier-keyword-mappings"] });
      toast({ title: "Keyword rule deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete keyword rule.", variant: "destructive" });
    },
  });

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...BLANK_KEYWORD_FORM });
    setDialogOpen(true);
  };

  const openEdit = (rule: KeywordMapping) => {
    setEditingId(rule.id);
    setForm({
      keyword: rule.keyword,
      courierName: (rule.courierName as "leopards" | "postex") || "all",
      normalizedStatus: rule.normalizedStatus,
      workflowStage: rule.workflowStage || WORKFLOW_STAGE_MAP[rule.normalizedStatus] || "FULFILLED",
      priority: rule.priority ?? 0,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.keyword.trim()) return;
    const body = {
      keyword: form.keyword.trim(),
      courierName: form.courierName === "all" ? null : form.courierName,
      normalizedStatus: form.normalizedStatus,
      workflowStage: form.workflowStage || null,
      priority: form.priority,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, body });
    } else {
      createMutation.mutate(body);
    }
  };

  const mappings = data?.mappings || [];
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Tag className="w-5 h-5" />
                Keyword Rules
              </CardTitle>
              <CardDescription className="mt-1">
                If a raw status <strong>contains</strong> a keyword, it maps to the selected normalization — unless an exact custom match exists above. Rules are applied in priority order (highest first).
              </CardDescription>
            </div>
            <Button size="sm" onClick={openAdd} data-testid="button-add-keyword-rule">
              <Plus className="w-4 h-4 mr-1" />
              Add Rule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : mappings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Tag className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No keyword rules yet.</p>
              <p className="text-sm mt-1">Add a rule to automatically map statuses containing a keyword.</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <div className="hidden md:grid grid-cols-[1.5fr_1fr_1.5fr_1fr_4rem_auto] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/30">
                <span>Keyword</span>
                <span>Applies To</span>
                <span>Maps To</span>
                <span>Stage</span>
                <span className="text-center">Priority</span>
                <span className="w-16" />
              </div>
              <div className="divide-y">
                {mappings.map((rule) => (
                  <div
                    key={rule.id}
                    className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1.5fr_1fr_4rem_auto] gap-2 px-3 py-2 items-center text-sm"
                    data-testid={`keyword-rule-row-${rule.id}`}
                  >
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono break-all">
                      {rule.keyword}
                    </code>
                    <span className="text-xs text-muted-foreground">
                      {rule.courierName ? courierLabel(rule.courierName) : "All Couriers"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${STATUS_CATEGORY_COLORS[rule.normalizedStatus]?.split(" ")[0] || "bg-gray-200"}`} />
                      <span className="text-xs">{STATUS_LABELS[rule.normalizedStatus] || rule.normalizedStatus}</span>
                    </div>
                    <div>
                      {rule.workflowStage && (
                        <Badge className={`text-[10px] ${WORKFLOW_STAGE_COLORS[rule.workflowStage] || ""}`} variant="secondary">
                          {WORKFLOW_STAGE_LABELS[rule.workflowStage] || rule.workflowStage}
                        </Badge>
                      )}
                    </div>
                    <div className="text-center text-xs text-muted-foreground tabular-nums">
                      {rule.priority ?? 0}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEdit(rule)}
                        data-testid={`button-edit-keyword-${rule.id}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate(rule.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-keyword-${rule.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Keyword Rule" : "Add Keyword Rule"}</DialogTitle>
            <DialogDescription>
              If a raw courier status <strong>contains</strong> this keyword (case-insensitive), it will be mapped to the selected normalization — unless an exact custom rule overrides it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Keyword</Label>
              <Input
                placeholder="e.g. refused, returned, cancelled"
                value={form.keyword}
                onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))}
                data-testid="input-keyword"
              />
              <p className="text-xs text-muted-foreground">
                Case-insensitive. Matches if the raw status contains this substring.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Applies To Courier</Label>
              <Select
                value={form.courierName}
                onValueChange={(v) => setForm((f) => ({ ...f, courierName: v as "all" | "leopards" | "postex" }))}
              >
                <SelectTrigger data-testid="select-keyword-courier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Couriers</SelectItem>
                  <SelectItem value="leopards">Leopards Courier</SelectItem>
                  <SelectItem value="postex">PostEx</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Maps To (Normalized Status)</Label>
              <Select
                value={form.normalizedStatus}
                onValueChange={(v) => {
                  setForm((f) => ({
                    ...f,
                    normalizedStatus: v,
                    workflowStage: WORKFLOW_STAGE_MAP[v] || f.workflowStage,
                  }));
                }}
              >
                <SelectTrigger data-testid="select-keyword-normalized">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NORMALIZED_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${STATUS_CATEGORY_COLORS[s]?.split(" ")[0] || "bg-gray-200"}`} />
                        {STATUS_LABELS[s]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Workflow Stage</Label>
              <Select
                value={form.workflowStage}
                onValueChange={(v) => setForm((f) => ({ ...f, workflowStage: v }))}
              >
                <SelectTrigger data-testid="select-keyword-stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKFLOW_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {WORKFLOW_STAGE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
                data-testid="input-keyword-priority"
              />
              <p className="text-xs text-muted-foreground">
                Higher priority rules are checked first. Default is 0.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.keyword.trim() || isPending}
              data-testid="button-confirm-keyword-rule"
            >
              {isPending ? "Saving..." : editingId ? "Update Rule" : "Add Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// Helper — normalize courier name for API submission
// ============================================================

function normalizeCourierName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("leopard")) return "leopards";
  if (n.includes("postex")) return "postex";
  return n;
}

// ============================================================
// Main page
// ============================================================

export default function StatusMappingPage() {
  const { toast } = useToast();
  const [exportCourier, setExportCourier] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<any>(null);
  const [importCourierFilter, setImportCourierFilter] = useState("all");

  const { data: unmappedStatuses } = useQuery<UnmappedStatus[]>({
    queryKey: ["/api/unmapped-courier-statuses?resolved=false"],
  });

  const dismissUnmappedMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/unmapped-courier-statuses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/unmapped-courier-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/unmapped-courier-statuses/count"] });
      toast({ title: "Dismissed", description: "Unmapped status has been dismissed." });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async (courier: string) => {
      const url = courier === "all"
        ? "/api/courier-status-mappings/export"
        : `/api/courier-status-mappings/export?courier=${courier}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
    onSuccess: (data, courier) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `shipflow-mappings-${courier}-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportDialog(false);
      toast({
        title: "Exported",
        description: `${data.statusMappings.length} status mappings and ${data.keywordMappings.length} keyword rules exported.`,
      });
    },
    onError: () => {
      toast({ title: "Export failed", description: "Could not export mappings.", variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async ({ fileData, courierFilter }: { fileData: any; courierFilter: string }) => {
      const body = { ...fileData, courierFilter: courierFilter === "all" ? null : courierFilter };
      const res = await apiRequest("POST", "/api/courier-status-mappings/import", body);
      return res.json();
    },
    onSuccess: (data) => {
      setShowImportDialog(false);
      setImportFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/courier-status-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courier-keyword-mappings"] });
      toast({
        title: "Import complete",
        description: `${data.importedStatusMappings} status mappings, ${data.importedKeywordMappings} keyword rules imported. ${data.skippedDuplicates} duplicates skipped.`,
      });
    },
    onError: () => {
      toast({ title: "Import failed", description: "Invalid file or server error.", variant: "destructive" });
    },
  });

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!parsed.version || (!parsed.statusMappings && !parsed.keywordMappings)) {
          toast({ title: "Invalid file", description: "This doesn't look like a 1SOL.AI mappings file.", variant: "destructive" });
          return;
        }
        setImportFile(parsed);
        setImportCourierFilter("all");
        setShowImportDialog(true);
      } catch {
        toast({ title: "Invalid file", description: "Could not parse JSON file.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const importCouriers = importFile
    ? [...new Set([
        ...(importFile.statusMappings || []).map((m: any) => m.courierName?.toLowerCase()),
        ...(importFile.keywordMappings || []).filter((m: any) => m.courierName).map((m: any) => m.courierName.toLowerCase()),
      ])].filter(Boolean) as string[]
    : [];

  const filteredImportStatusCount = importFile
    ? (importCourierFilter === "all"
        ? importFile.statusMappings?.length || 0
        : (importFile.statusMappings || []).filter((m: any) => m.courierName?.toLowerCase() === importCourierFilter).length)
    : 0;

  const filteredImportKeywordCount = importFile
    ? (importCourierFilter === "all"
        ? importFile.keywordMappings?.length || 0
        : (importFile.keywordMappings || []).filter((m: any) => !m.courierName || m.courierName.toLowerCase() === importCourierFilter).length)
    : 0;

  return (
    <div className="space-y-6" data-testid="status-mapping-page">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Status Mapping</h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            Map courier status codes to 1SOL.AI workflow stages.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExportDialog(true)}
            data-testid="button-export-mappings"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById("mapping-file-input")?.click()}
            data-testid="button-import-mappings"
          >
            <Upload className="w-4 h-4 mr-1.5" />
            Import
          </Button>
          <input
            id="mapping-file-input"
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      </div>

      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Mappings</DialogTitle>
            <DialogDescription>
              Choose which courier mappings to export. This includes custom status overrides and keyword rules.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Courier</Label>
            <Select value={exportCourier || "all"} onValueChange={setExportCourier}>
              <SelectTrigger data-testid="select-export-courier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Couriers</SelectItem>
                <SelectItem value="leopards">Leopards Only</SelectItem>
                <SelectItem value="postex">PostEx Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>Cancel</Button>
            <Button
              onClick={() => exportMutation.mutate(exportCourier || "all")}
              disabled={exportMutation.isPending}
              data-testid="button-confirm-export"
            >
              {exportMutation.isPending ? "Exporting..." : "Download File"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportDialog} onOpenChange={(open) => { setShowImportDialog(open); if (!open) setImportFile(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Mappings</DialogTitle>
            <DialogDescription>
              Review the file contents before importing. Existing mappings with the same courier status will be updated.
            </DialogDescription>
          </DialogHeader>
          {importFile && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border p-3 space-y-1 text-sm">
                <p><span className="font-medium">File source:</span> {importFile.courier === "all" ? "All Couriers" : courierLabel(importFile.courier)}</p>
                <p><span className="font-medium">Exported:</span> {importFile.exportedAt ? formatPkDate(importFile.exportedAt) : "Unknown"}</p>
                <p><span className="font-medium">Status mappings:</span> {importFile.statusMappings?.length || 0}</p>
                <p><span className="font-medium">Keyword rules:</span> {importFile.keywordMappings?.length || 0}</p>
              </div>
              {importCouriers.length > 1 && (
                <div className="space-y-2">
                  <Label>Import for courier</Label>
                  <Select value={importCourierFilter} onValueChange={setImportCourierFilter}>
                    <SelectTrigger data-testid="select-import-courier">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Couriers ({importFile.statusMappings?.length || 0} mappings, {importFile.keywordMappings?.length || 0} rules)</SelectItem>
                      {importCouriers.map((c: string) => (
                        <SelectItem key={c} value={c}>{courierLabel(c)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="font-medium">Will import:</p>
                <p>{filteredImportStatusCount} status mapping{filteredImportStatusCount !== 1 ? "s" : ""}, {filteredImportKeywordCount} keyword rule{filteredImportKeywordCount !== 1 ? "s" : ""}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImportDialog(false); setImportFile(null); }}>Cancel</Button>
            <Button
              onClick={() => importFile && importMutation.mutate({ fileData: importFile, courierFilter: importCourierFilter })}
              disabled={importMutation.isPending || !importFile || (filteredImportStatusCount === 0 && filteredImportKeywordCount === 0)}
              data-testid="button-confirm-import"
            >
              {importMutation.isPending ? "Importing..." : "Import Mappings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RawStatusMappingSection />

      <KeywordRulesSection />

      {unmappedStatuses && unmappedStatuses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Unmapped Courier Statuses
              <Badge variant="destructive" className="text-xs" data-testid="badge-unmapped-count">
                {unmappedStatuses.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              These statuses were seen during tracking sync but weren't matched by any rule. Map them above or dismiss them here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {unmappedStatuses.map((status) => (
                <div
                  key={status.id}
                  className="flex items-center justify-between p-3 border rounded-md gap-3"
                  data-testid={`unmapped-status-${status.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="no-default-active-elevate">
                        {courierLabel(status.courierName)}
                      </Badge>
                      <span className="font-mono text-sm font-medium truncate">{status.rawStatus}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>Seen {status.occurrenceCount}×</span>
                      {status.sampleTrackingNumber && (
                        <span>Sample: {status.sampleTrackingNumber}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => dismissUnmappedMutation.mutate(status.id)}
                    disabled={dismissUnmappedMutation.isPending}
                    data-testid={`button-dismiss-unmapped-${status.id}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
