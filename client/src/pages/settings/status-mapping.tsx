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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Save,
  ArrowRight,
  Search,
  Plus,
  RotateCcw,
  Trash2,
  Truck,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  X,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";

interface StatusMapping {
  id: string;
  merchantId: string;
  courierName: string;
  courierStatus: string;
  normalizedStatus: string;
  workflowStage: string | null;
  isCustom: boolean | null;
  createdAt: string;
  updatedAt: string;
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

const WORKFLOW_STAGES = ['BOOKED', 'FULFILLED', 'DELIVERED', 'RETURN', 'CANCELLED'] as const;
const WORKFLOW_STAGE_LABELS: Record<string, string> = {
  'BOOKED': 'Booked',
  'FULFILLED': 'Fulfilled',
  'DELIVERED': 'Delivered',
  'RETURN': 'Return',
  'CANCELLED': 'Cancelled',
};

const NORMALIZED_STATUSES = [
  'BOOKED',
  'PICKED_UP',
  'ARRIVED_AT_ORIGIN',
  'IN_TRANSIT',
  'ARRIVED_AT_DESTINATION',
  'OUT_FOR_DELIVERY',
  'DELIVERY_ATTEMPTED',
  'DELIVERED',
  'DELIVERY_FAILED',
  'READY_FOR_RETURN',
  'RETURN_IN_TRANSIT',
  'RETURNED_TO_ORIGIN',
  'RETURNED_TO_SHIPPER',
  'CANCELLED',
] as const;

const STATUS_LABELS: Record<string, string> = {
  'BOOKED': 'Booked',
  'PICKED_UP': 'Picked Up',
  'ARRIVED_AT_ORIGIN': 'At Origin',
  'IN_TRANSIT': 'In Transit',
  'ARRIVED_AT_DESTINATION': 'At Destination',
  'OUT_FOR_DELIVERY': 'Out for Delivery',
  'DELIVERY_ATTEMPTED': 'Delivery Attempted',
  'DELIVERED': 'Delivered',
  'DELIVERY_FAILED': 'Delivery Failed',
  'READY_FOR_RETURN': 'Ready for Return',
  'RETURN_IN_TRANSIT': 'Return in Transit',
  'RETURNED_TO_ORIGIN': 'Returned to Origin',
  'RETURNED_TO_SHIPPER': 'Returned to Shipper',
  'CANCELLED': 'Cancelled',
};

const WORKFLOW_STAGE_MAP: Record<string, string> = {
  'BOOKED': 'BOOKED',
  'PICKED_UP': 'FULFILLED',
  'ARRIVED_AT_ORIGIN': 'FULFILLED',
  'IN_TRANSIT': 'FULFILLED',
  'ARRIVED_AT_DESTINATION': 'FULFILLED',
  'OUT_FOR_DELIVERY': 'FULFILLED',
  'DELIVERY_ATTEMPTED': 'FULFILLED',
  'DELIVERED': 'DELIVERED',
  'DELIVERY_FAILED': 'FULFILLED',
  'READY_FOR_RETURN': 'RETURN',
  'RETURN_IN_TRANSIT': 'RETURN',
  'RETURNED_TO_ORIGIN': 'RETURN',
  'RETURNED_TO_SHIPPER': 'RETURN',
  'CANCELLED': 'CANCELLED',
};

const WORKFLOW_STAGE_COLORS: Record<string, string> = {
  'BOOKED': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'FULFILLED': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  'DELIVERED': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'RETURN': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'CANCELLED': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const STATUS_CATEGORY_COLORS: Record<string, string> = {
  'BOOKED': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'PICKED_UP': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'ARRIVED_AT_ORIGIN': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  'IN_TRANSIT': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'ARRIVED_AT_DESTINATION': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'OUT_FOR_DELIVERY': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'DELIVERY_ATTEMPTED': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  'DELIVERED': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'DELIVERY_FAILED': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'READY_FOR_RETURN': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'RETURN_IN_TRANSIT': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'RETURNED_TO_ORIGIN': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'RETURNED_TO_SHIPPER': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'CANCELLED': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const COURIER_LABELS: Record<string, string> = {
  'leopards': 'Leopards Courier',
  'postex': 'PostEx',
};

function CourierStatusMappingSection() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [courierFilter, setCourierFilter] = useState<string>("all");
  const [expandedCouriers, setExpandedCouriers] = useState<Record<string, boolean>>({ leopards: true, postex: true });
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newCourierName, setNewCourierName] = useState("leopards");
  const [newCourierStatus, setNewCourierStatus] = useState("");
  const [newNormalizedStatus, setNewNormalizedStatus] = useState("BOOKED");
  const [newWorkflowStage, setNewWorkflowStage] = useState("BOOKED");

  const { data, isLoading } = useQuery<{ mappings: StatusMapping[] }>({
    queryKey: ["/api/courier-status-mappings"],
  });

  const updateMappingMutation = useMutation({
    mutationFn: async ({ id, normalizedStatus, workflowStage }: { id: string; normalizedStatus?: string; workflowStage?: string }) => {
      return apiRequest("PUT", `/api/courier-status-mappings/${id}`, { normalizedStatus, workflowStage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courier-status-mappings"] });
      toast({ title: "Mapping updated", description: "The status mapping has been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update mapping.", variant: "destructive" });
    },
  });

  const addMappingMutation = useMutation({
    mutationFn: async (data: { courierName: string; courierStatus: string; normalizedStatus: string; workflowStage?: string }) => {
      return apiRequest("POST", "/api/courier-status-mappings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courier-status-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/unmapped-courier-statuses?resolved=false"] });
      queryClient.invalidateQueries({ queryKey: ["/api/unmapped-courier-statuses/count"] });
      setAddDialogOpen(false);
      setNewCourierStatus("");
      toast({ title: "Mapping added", description: "New status mapping has been created." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add mapping.", variant: "destructive" });
    },
  });

  const deleteMappingMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/courier-status-mappings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courier-status-mappings"] });
      toast({ title: "Mapping deleted", description: "The status mapping has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete mapping.", variant: "destructive" });
    },
  });

  const resetMappingsMutation = useMutation({
    mutationFn: async (courierName?: string) => {
      return apiRequest("POST", "/api/courier-status-mappings/reset", { courierName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courier-status-mappings"] });
      toast({ title: "Mappings reset", description: "All mappings have been restored to defaults." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset mappings.", variant: "destructive" });
    },
  });

  const saveAllMappingsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/courier-status-mappings/save-all");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/courier-status-mappings"] });
      toast({ title: "Mappings saved", description: `All ${data.count || 0} mappings have been saved.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save mappings.", variant: "destructive" });
    },
  });

  const resyncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/courier-status-mappings/resync");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/courier-status-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline"] });
      toast({ title: "ReSync complete", description: `Updated ${data.updated || 0} orders, skipped ${data.skipped || 0}, failed ${data.failed || 0}.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to resync courier statuses.", variant: "destructive" });
    },
  });

  const mappings = data?.mappings || [];

  const filteredMappings = mappings.filter((m) => {
    const matchesCourier = courierFilter === "all" || m.courierName === courierFilter;
    const matchesSearch = !searchQuery || 
      m.courierStatus.toLowerCase().includes(searchQuery.toLowerCase()) ||
      STATUS_LABELS[m.normalizedStatus]?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCourier && matchesSearch;
  });

  const groupedByCourier = filteredMappings.reduce<Record<string, StatusMapping[]>>((acc, m) => {
    if (!acc[m.courierName]) acc[m.courierName] = [];
    acc[m.courierName].push(m);
    return acc;
  }, {});

  const toggleCourier = (name: string) => {
    setExpandedCouriers(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleAddMapping = () => {
    if (!newCourierStatus.trim()) return;
    addMappingMutation.mutate({
      courierName: newCourierName,
      courierStatus: newCourierStatus.trim(),
      normalizedStatus: newNormalizedStatus,
      workflowStage: newWorkflowStage,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Courier Status Mappings
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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Courier Status Mappings
            </CardTitle>
            <CardDescription>
              Map courier raw statuses to normalized stages. Changes affect how shipment statuses are categorized in your workflow.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="default"
              size="sm"
              onClick={() => saveAllMappingsMutation.mutate()}
              disabled={saveAllMappingsMutation.isPending}
              data-testid="button-save-mappings"
            >
              <Save className="w-4 h-4 mr-1" />
              {saveAllMappingsMutation.isPending ? "Saving..." : "Save All"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resyncMutation.mutate()}
              disabled={resyncMutation.isPending}
              data-testid="button-resync-stages"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${resyncMutation.isPending ? "animate-spin" : ""}`} />
              {resyncMutation.isPending ? "Syncing..." : "ReSync"}
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-add-mapping">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Mapping
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Custom Status Mapping</DialogTitle>
                  <DialogDescription>
                    Add a new courier status and map it to a normalized stage.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Courier</Label>
                    <Select value={newCourierName} onValueChange={setNewCourierName}>
                      <SelectTrigger data-testid="select-new-courier">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="leopards">Leopards Courier</SelectItem>
                        <SelectItem value="postex">PostEx</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Courier Status Text</Label>
                    <Input
                      placeholder="e.g. shipment arrived at hub"
                      value={newCourierStatus}
                      onChange={(e) => setNewCourierStatus(e.target.value)}
                      data-testid="input-new-courier-status"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter the exact status text as returned by the courier API (case-insensitive).
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Normalized Status</Label>
                    <Select value={newNormalizedStatus} onValueChange={(v) => {
                      setNewNormalizedStatus(v);
                      setNewWorkflowStage(WORKFLOW_STAGE_MAP[v] || 'FULFILLED');
                    }}>
                      <SelectTrigger data-testid="select-new-normalized-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NORMALIZED_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Workflow Stage</Label>
                    <Select value={newWorkflowStage} onValueChange={setNewWorkflowStage}>
                      <SelectTrigger data-testid="select-new-workflow-stage">
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
                    <p className="text-xs text-muted-foreground">
                      Choose which pipeline stage this status should map to.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                  <Button
                    onClick={handleAddMapping}
                    disabled={!newCourierStatus.trim() || addMappingMutation.isPending}
                    data-testid="button-confirm-add-mapping"
                  >
                    {addMappingMutation.isPending ? "Adding..." : "Add Mapping"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetMappingsMutation.mutate(undefined)}
              disabled={resetMappingsMutation.isPending}
              data-testid="button-reset-all-mappings"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              {resetMappingsMutation.isPending ? "Resetting..." : "Reset All"}
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-mappings"
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

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="font-medium">Flow:</span>
            <span>Courier Raw Status</span>
            <ArrowRight className="w-3 h-3" />
            <span>Normalized Status</span>
            <ArrowRight className="w-3 h-3" />
            <span>Workflow Stage</span>
          </div>

          <div className="text-sm text-muted-foreground">
            {filteredMappings.length} mapping{filteredMappings.length !== 1 ? 's' : ''} found
            {mappings.filter(m => m.isCustom).length > 0 && (
              <span className="ml-2">({mappings.filter(m => m.isCustom).length} custom)</span>
            )}
          </div>

          {Object.entries(groupedByCourier).map(([courierName, courierMappings]) => (
            <div key={courierName} className="border rounded-md overflow-hidden">
              <button
                className="w-full flex items-center justify-between gap-2 p-3 hover-elevate text-left"
                onClick={() => toggleCourier(courierName)}
                data-testid={`button-toggle-${courierName}`}
              >
                <div className="flex items-center gap-2">
                  {expandedCouriers[courierName] ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <Truck className="w-4 h-4" />
                  <span className="font-medium">{COURIER_LABELS[courierName] || courierName}</span>
                  <Badge variant="secondary" className="text-xs">
                    {courierMappings.length}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetMappingsMutation.mutate(courierName);
                  }}
                  data-testid={`button-reset-${courierName}`}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Reset
                </Button>
              </button>
              {expandedCouriers[courierName] && (
                <div className="border-t">
                  <div className="hidden md:grid grid-cols-[1fr_1fr_auto_auto] gap-2 p-3 text-xs font-medium text-muted-foreground border-b bg-muted/30">
                    <span>Courier Status</span>
                    <span>Normalized Status</span>
                    <span>Workflow Stage</span>
                    <span className="w-8"></span>
                  </div>
                  <div className="divide-y max-h-[500px] overflow-y-auto">
                    {courierMappings.map((mapping) => {
                      const workflowStage = mapping.workflowStage || WORKFLOW_STAGE_MAP[mapping.normalizedStatus] || 'FULFILLED';
                      return (
                        <div
                          key={mapping.id}
                          className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2 p-3 items-center text-sm"
                          data-testid={`mapping-row-${mapping.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded font-mono break-all">
                              {mapping.courierStatus}
                            </code>
                            {mapping.isCustom && (
                              <Badge variant="outline" className="text-[10px] shrink-0">Custom</Badge>
                            )}
                          </div>
                          <div>
                            <Select
                              value={mapping.normalizedStatus}
                              onValueChange={(value) => updateMappingMutation.mutate({ id: mapping.id, normalizedStatus: value })}
                            >
                              <SelectTrigger
                                className="h-8 text-xs"
                                data-testid={`select-mapping-${mapping.id}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {NORMALIZED_STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    <span className="flex items-center gap-2">
                                      <span className={`inline-block w-2 h-2 rounded-full ${STATUS_CATEGORY_COLORS[s]?.split(' ')[0] || 'bg-gray-200'}`} />
                                      {STATUS_LABELS[s]}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Select
                            value={workflowStage}
                            onValueChange={(value) => updateMappingMutation.mutate({ id: mapping.id, workflowStage: value })}
                          >
                            <SelectTrigger
                              className={`h-8 text-[11px] min-w-[110px] ${WORKFLOW_STAGE_COLORS[workflowStage] || ''}`}
                              data-testid={`select-workflow-${mapping.id}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {WORKFLOW_STAGES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  <span className="flex items-center gap-2">
                                    <span className={`inline-block w-2 h-2 rounded-full ${WORKFLOW_STAGE_COLORS[s]?.split(' ')[0] || 'bg-gray-200'}`} />
                                    {WORKFLOW_STAGE_LABELS[s]}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {mapping.isCustom && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => deleteMappingMutation.mutate(mapping.id)}
                              data-testid={`button-delete-${mapping.id}`}
                            >
                              <Trash2 className="w-3 h-3 text-muted-foreground" />
                            </Button>
                          )}
                          {!mapping.isCustom && <div className="w-7" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}

          {filteredMappings.length === 0 && !isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <Truck className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No status mappings found.</p>
              {searchQuery && <p className="text-sm">Try a different search term.</p>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function StatusMappingPage() {
  const { toast } = useToast();

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

  return (
    <div className="space-y-6" data-testid="status-mapping-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Status Mapping</h1>
        <p className="text-muted-foreground" data-testid="text-page-description">Map courier status codes to ShipFlow workflow stages.</p>
      </div>

      <CourierStatusMappingSection />

      {unmappedStatuses && unmappedStatuses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Unmapped Courier Statuses
              <Badge variant="destructive" className="text-xs" data-testid="badge-unmapped-count">{unmappedStatuses.length}</Badge>
            </CardTitle>
            <CardDescription>
              These courier statuses were encountered during tracking sync but don't have a mapping. Add a mapping in the Courier Status Mappings section above, then dismiss them here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {unmappedStatuses.map((status) => (
                <div key={status.id} className="flex items-center justify-between p-3 border rounded-md gap-3" data-testid={`unmapped-status-${status.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="no-default-active-elevate">{status.courierName}</Badge>
                      <span className="font-mono text-sm font-medium truncate">{status.rawStatus}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>Seen {status.occurrenceCount}x</span>
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
