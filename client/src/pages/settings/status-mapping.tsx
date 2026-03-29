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
  Plus,
  RotateCcw,
  Download,
  Upload,
  Wand2,
  MapPin,
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


const WORKFLOW_STAGE_COLORS: Record<string, string> = {
  BOOKED: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  FULFILLED: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  DELIVERED: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  RETURN: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  CANCELLED: "bg-red-500/10 text-red-400 border border-red-500/20",
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
  workflowStage: string | null;
  isCustom: boolean;
  systemWorkflowStage: string | null;
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
    leopards: false,
    postex: false,
  });
  const [drafts, setDrafts] = useState<Record<string, { workflowStage: string }>>({});
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
        normalizedStatus: draft.workflowStage,
        workflowStage: draft.workflowStage,
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await refetch();
      toast({ title: "Mapping saved", description: `"${row.rawStatus}" → ${WORKFLOW_STAGE_LABELS[draft.workflowStage] || draft.workflowStage}` });
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
      (WORKFLOW_STAGE_LABELS[r.workflowStage || r.systemWorkflowStage || ""] || "")
        .toLowerCase()
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

  const getEffectiveStage = (row: RawCourierStatus) => {
    const key = rowKey(row.courierName, row.rawStatus);
    if (drafts[key]?.workflowStage) return drafts[key].workflowStage;
    if (row.isCustom && row.workflowStage) return row.workflowStage;
    return row.systemWorkflowStage || "FULFILLED";
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
              All known courier statuses mapped to workflow stages. Statuses with active orders show full opacity; unused statuses appear muted. Override any row to change how it's categorized.
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
                  <div className="hidden lg:grid grid-cols-[2fr_3rem_1.6fr_auto] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/30">
                    <span>Courier Status</span>
                    <span className="text-center">Orders</span>
                    <span>Workflow Stage</span>
                    <span className="w-20" />
                  </div>
                  <div className="divide-y max-h-[600px] overflow-y-auto">
                    {rows.map((row) => {
                      const key = rowKey(row.courierName, row.rawStatus);
                      const effectiveStage = getEffectiveStage(row);
                      const dirty = isDirty(row);
                      const saving = savingRows.has(key);

                      const isSeededOnly = row.orderCount === 0;

                      return (
                        <div
                          key={key}
                          className={`grid grid-cols-1 lg:grid-cols-[2fr_3rem_1.6fr_auto] gap-2 px-3 py-2 items-center text-sm ${dirty ? "bg-amber-500/[0.06]" : ""} ${isSeededOnly && !dirty ? "opacity-50" : ""}`}
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
                              <Badge variant="outline" className="text-[10px] shrink-0 border-amber-400 text-amber-400">
                                Unsaved
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center justify-start lg:justify-center gap-1 text-xs text-muted-foreground">
                            <span className="font-medium tabular-nums">{row.orderCount}</span>
                          </div>

                          <div>
                            <Select
                              value={effectiveStage}
                              onValueChange={(value) => {
                                setDrafts((prev) => ({
                                  ...prev,
                                  [key]: {
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
  const [showAddMappingDialog, setShowAddMappingDialog] = useState(false);
  const [addMappingForm, setAddMappingForm] = useState({
    courierName: "leopards" as string,
    courierStatus: "",
    workflowStage: "BOOKED" as string,
  });

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

  const bulkAutoMapMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/courier-status-mappings/bulk-auto-map");
      return res.json();
    },
    onSuccess: (data: { mapped: number; skipped: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/courier-status-mappings/raw-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/unmapped-courier-statuses?resolved=false"] });
      queryClient.invalidateQueries({ queryKey: ["/api/unmapped-courier-statuses/count"] });
      toast({
        title: "Auto-mapped",
        description: `${data.mapped} status(es) mapped using system defaults.${data.skipped > 0 ? ` ${data.skipped} could not be matched.` : ""}`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to auto-map statuses.", variant: "destructive" });
    },
  });

  const addMappingMutation = useMutation({
    mutationFn: async (body: object) => {
      const res = await apiRequest("POST", "/api/courier-status-mappings", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courier-status-mappings/raw-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/unmapped-courier-statuses?resolved=false"] });
      queryClient.invalidateQueries({ queryKey: ["/api/unmapped-courier-statuses/count"] });
      setShowAddMappingDialog(false);
      setAddMappingForm({ courierName: "leopards", courierStatus: "", workflowStage: "BOOKED" });
      toast({ title: "Mapping added", description: "Custom status mapping has been created." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add mapping.", variant: "destructive" });
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

      <Dialog open={showAddMappingDialog} onOpenChange={setShowAddMappingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Status Mapping</DialogTitle>
            <DialogDescription>
              Manually add a mapping for a courier status string. This creates a custom override that takes priority over system defaults.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Courier</Label>
              <Select
                value={addMappingForm.courierName}
                onValueChange={(v) => setAddMappingForm((f) => ({ ...f, courierName: v }))}
              >
                <SelectTrigger data-testid="select-add-mapping-courier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leopards">Leopards Courier</SelectItem>
                  <SelectItem value="postex">PostEx</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Courier Status</Label>
              <Input
                placeholder="e.g. Shipment Delivered"
                value={addMappingForm.courierStatus}
                onChange={(e) => setAddMappingForm((f) => ({ ...f, courierStatus: e.target.value }))}
                data-testid="input-add-mapping-status"
              />
              <p className="text-xs text-muted-foreground">The exact status string as it appears from the courier.</p>
            </div>
            <div className="space-y-2">
              <Label>Workflow Stage</Label>
              <Select
                value={addMappingForm.workflowStage}
                onValueChange={(v) => setAddMappingForm((f) => ({ ...f, workflowStage: v }))}
              >
                <SelectTrigger data-testid="select-add-mapping-stage">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMappingDialog(false)} data-testid="button-cancel-add-mapping">Cancel</Button>
            <Button
              onClick={() => addMappingMutation.mutate({
                courierName: addMappingForm.courierName,
                courierStatus: addMappingForm.courierStatus.toLowerCase().trim(),
                normalizedStatus: addMappingForm.workflowStage,
                workflowStage: addMappingForm.workflowStage,
              })}
              disabled={!addMappingForm.courierStatus.trim() || addMappingMutation.isPending}
              data-testid="button-confirm-add-mapping"
            >
              {addMappingMutation.isPending ? "Adding..." : "Add Mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RawStatusMappingSection />

      {unmappedStatuses && unmappedStatuses.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Unmapped Courier Statuses
                  <Badge variant="destructive" className="text-xs" data-testid="badge-unmapped-count">
                    {unmappedStatuses.length}
                  </Badge>
                </CardTitle>
                <CardDescription className="mt-1">
                  These statuses were seen during tracking sync but weren't matched by any rule.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkAutoMapMutation.mutate()}
                  disabled={bulkAutoMapMutation.isPending}
                  data-testid="button-map-all-unmapped"
                >
                  {bulkAutoMapMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1.5" />}
                  Map All
                </Button>
              </div>
            </div>
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
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const courierNorm = status.courierName?.toLowerCase().includes("postex") ? "postex" : "leopards";
                        setAddMappingForm({
                          courierName: courierNorm,
                          courierStatus: status.rawStatus,
                          workflowStage: "BOOKED",
                        });
                        fetch(`/api/courier-status-mappings/seed-lookup?status=${encodeURIComponent(status.rawStatus)}`, { credentials: "include" })
                          .then(r => r.json())
                          .then(data => {
                            if (data.stage) {
                              setAddMappingForm(f => ({ ...f, workflowStage: data.stage }));
                            }
                          })
                          .catch(() => {});
                        setShowAddMappingDialog(true);
                      }}
                      data-testid={`button-map-unmapped-${status.id}`}
                    >
                      <MapPin className="w-3.5 h-3.5 mr-1" />
                      Map
                    </Button>
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
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
