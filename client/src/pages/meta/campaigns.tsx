import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Megaphone, RefreshCw, Loader2, ExternalLink, CheckSquare, Play, Pause, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  created_time: string;
  updated_time: string;
  start_time?: string;
  stop_time?: string;
}

export default function MetaCampaigns() {
  const { toast } = useToast();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [budgetDialog, setBudgetDialog] = useState(false);
  const [budgetAction, setBudgetAction] = useState<"increase" | "decrease" | "set">("increase");
  const [budgetValue, setBudgetValue] = useState("20");
  const [budgetType, setBudgetType] = useState<"daily" | "lifetime">("daily");

  const { data, isLoading, refetch, isFetching } = useQuery<{ campaigns: MetaCampaign[] }>({
    queryKey: ["/api/meta/campaigns"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ campaignId, status }: { campaignId: string; status: "ACTIVE" | "PAUSED" }) => {
      const res = await apiRequest("POST", `/api/meta/campaigns/${campaignId}/status`, { status });
      return res.json();
    },
    onSuccess: (_, { status }) => {
      toast({ title: `Campaign ${status === "ACTIVE" ? "Activated" : "Paused"}` });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/campaigns"] });
      setTogglingId(null);
    },
    onError: (error: any) => {
      toast({ title: "Status Update Failed", description: error.message, variant: "destructive" });
      setTogglingId(null);
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ campaignIds, status }: { campaignIds: string[]; status: "ACTIVE" | "PAUSED" }) => {
      const res = await apiRequest("POST", "/api/meta/campaigns/bulk-status", { campaignIds, status });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Bulk Update Complete", description: `${data.succeeded} succeeded, ${data.failed} failed` });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/campaigns"] });
      setSelectedIds(new Set());
    },
    onError: (error: any) => {
      toast({ title: "Bulk Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const bulkBudgetMutation = useMutation({
    mutationFn: async (params: { campaignIds: string[]; action: string; value: number; budgetType: string }) => {
      const res = await apiRequest("POST", "/api/meta/campaigns/bulk-budget", params);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Budget Updated", description: `${data.succeeded} succeeded, ${data.failed} failed` });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/campaigns"] });
      setSelectedIds(new Set());
      setBudgetDialog(false);
    },
    onError: (error: any) => {
      toast({ title: "Budget Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const campaigns = data?.campaigns || [];

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === campaigns.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(campaigns.map(c => c.id)));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" data-testid={`badge-status-${status}`}>Active</Badge>;
      case "PAUSED":
        return <Badge variant="secondary" data-testid={`badge-status-${status}`}>Paused</Badge>;
      case "ARCHIVED":
        return <Badge variant="outline" data-testid={`badge-status-${status}`}>Archived</Badge>;
      default:
        return <Badge variant="outline" data-testid={`badge-status-${status}`}>{status}</Badge>;
    }
  };

  const formatBudget = (amount?: string) => {
    if (!amount) return "—";
    const val = parseFloat(amount) / 100;
    return `PKR ${val.toLocaleString()}`;
  };

  const hasSelection = selectedIds.size > 0;

  return (
    <div className="space-y-6 max-w-5xl" data-testid="page-meta-campaigns">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Meta Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View and manage your Facebook ad campaigns. Select multiple for bulk actions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-campaigns"
        >
          {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Refresh
        </Button>
      </div>

      {hasSelection && (
        <Card className="border-primary/30 bg-primary/5" data-testid="panel-bulk-actions">
          <CardContent className="flex items-center gap-3 py-3 px-4 flex-wrap">
            <span className="text-sm font-medium" data-testid="text-selected-count">{selectedIds.size} selected</span>
            <div className="h-4 w-px bg-border" />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={bulkStatusMutation.isPending}
              onClick={() => bulkStatusMutation.mutate({ campaignIds: [...selectedIds], status: "ACTIVE" })}
              data-testid="button-bulk-activate"
            >
              <Play className="w-3 h-3 mr-1" />Activate All
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={bulkStatusMutation.isPending}
              onClick={() => bulkStatusMutation.mutate({ campaignIds: [...selectedIds], status: "PAUSED" })}
              data-testid="button-bulk-pause"
            >
              <Pause className="w-3 h-3 mr-1" />Pause All
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => { setBudgetAction("increase"); setBudgetDialog(true); }}
              data-testid="button-bulk-increase-budget"
            >
              <TrendingUp className="w-3 h-3 mr-1" />Increase Budget
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => { setBudgetAction("decrease"); setBudgetDialog(true); }}
              data-testid="button-bulk-decrease-budget"
            >
              <TrendingDown className="w-3 h-3 mr-1" />Decrease Budget
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => { setBudgetAction("set"); setBudgetDialog(true); }}
              data-testid="button-bulk-set-budget"
            >
              <DollarSign className="w-3 h-3 mr-1" />Set Budget
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs ml-auto"
              onClick={() => setSelectedIds(new Set())}
              data-testid="button-clear-selection"
            >
              Clear
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Megaphone className="w-10 h-10 text-muted-foreground mb-3" />
            <CardTitle className="text-base mb-1" data-testid="text-empty-state">No Campaigns Found</CardTitle>
            <CardDescription>
              Launch an ad from the Ad Launcher to create your first campaign, or ensure your Facebook account is connected.
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-2 pb-1">
            <Checkbox
              checked={selectedIds.size === campaigns.length && campaigns.length > 0}
              onCheckedChange={toggleAll}
              data-testid="checkbox-select-all"
            />
            <span className="text-xs text-muted-foreground">Select All</span>
          </div>
          {campaigns.map((campaign) => (
            <Card key={campaign.id} className={`transition-colors ${selectedIds.has(campaign.id) ? "border-primary/50 bg-primary/5" : "hover:bg-muted/30"}`} data-testid={`card-campaign-${campaign.id}`}>
              <CardContent className="flex items-center py-4 px-5 gap-4">
                <Checkbox
                  checked={selectedIds.has(campaign.id)}
                  onCheckedChange={() => toggleSelect(campaign.id)}
                  data-testid={`checkbox-campaign-${campaign.id}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate" data-testid={`text-campaign-name-${campaign.id}`}>{campaign.name}</p>
                    {getStatusBadge(campaign.status)}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span data-testid={`text-campaign-objective-${campaign.id}`}>{campaign.objective?.replace("OUTCOME_", "")}</span>
                    {campaign.daily_budget && <span>Daily: {formatBudget(campaign.daily_budget)}</span>}
                    {campaign.lifetime_budget && <span>Lifetime: {formatBudget(campaign.lifetime_budget)}</span>}
                    <span>{new Date(campaign.created_time).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {(campaign.status === "ACTIVE" || campaign.status === "PAUSED") && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{campaign.status === "ACTIVE" ? "Active" : "Paused"}</span>
                      <Switch
                        checked={campaign.status === "ACTIVE"}
                        disabled={togglingId === campaign.id || toggleMutation.isPending}
                        onCheckedChange={(checked) => {
                          setTogglingId(campaign.id);
                          toggleMutation.mutate({
                            campaignId: campaign.id,
                            status: checked ? "ACTIVE" : "PAUSED",
                          });
                        }}
                        data-testid={`switch-campaign-${campaign.id}`}
                      />
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => window.open(`https://www.facebook.com/adsmanager/manage/campaigns?act=${campaign.id}`, "_blank")}
                    data-testid={`button-open-campaign-${campaign.id}`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={budgetDialog} onOpenChange={setBudgetDialog}>
        <DialogContent data-testid="dialog-bulk-budget">
          <DialogHeader>
            <DialogTitle>
              {budgetAction === "increase" ? "Increase" : budgetAction === "decrease" ? "Decrease" : "Set"} Budget
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{budgetAction === "set" ? "New Budget (PKR)" : "Percentage (%)"}</Label>
              <Input
                type="number"
                value={budgetValue}
                onChange={(e) => setBudgetValue(e.target.value)}
                placeholder={budgetAction === "set" ? "500" : "20"}
                data-testid="input-budget-value"
              />
            </div>
            <div>
              <Label>Budget Type</Label>
              <Select value={budgetType} onValueChange={(v) => setBudgetType(v as "daily" | "lifetime")}>
                <SelectTrigger data-testid="select-budget-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily Budget</SelectItem>
                  <SelectItem value="lifetime">Lifetime Budget</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              This will {budgetAction === "set" ? "set" : budgetAction} the {budgetType} budget {budgetAction !== "set" ? `by ${budgetValue}%` : `to PKR ${budgetValue}`} for {selectedIds.size} campaign(s).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetDialog(false)} data-testid="button-cancel-budget">Cancel</Button>
            <Button
              onClick={() => {
                bulkBudgetMutation.mutate({
                  campaignIds: [...selectedIds],
                  action: budgetAction,
                  value: parseFloat(budgetValue) || 0,
                  budgetType,
                });
              }}
              disabled={bulkBudgetMutation.isPending}
              data-testid="button-apply-budget"
            >
              {bulkBudgetMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
