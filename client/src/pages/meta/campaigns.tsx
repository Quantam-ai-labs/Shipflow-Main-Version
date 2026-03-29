import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Megaphone, RefreshCw, Loader2, ExternalLink, Play, Pause, DollarSign, TrendingUp, TrendingDown, Target, Layers } from "lucide-react";
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

interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  campaign_id: string;
  optimization_goal?: string;
  bid_strategy?: string;
  targeting?: Record<string, any>;
}

export default function MetaCampaigns() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("campaigns");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedAdSetIds, setSelectedAdSetIds] = useState<Set<string>>(new Set());
  const [budgetDialog, setBudgetDialog] = useState<"campaign" | "adset" | null>(null);
  const [budgetAction, setBudgetAction] = useState<"increase" | "decrease" | "set">("increase");
  const [budgetValue, setBudgetValue] = useState("20");
  const [budgetType, setBudgetType] = useState<"daily" | "lifetime">("daily");
  const [targetingDialog, setTargetingDialog] = useState(false);
  const [targetingAgeMin, setTargetingAgeMin] = useState("18");
  const [targetingAgeMax, setTargetingAgeMax] = useState("65");
  const [targetingGender, setTargetingGender] = useState("all");

  const { data, isLoading, refetch, isFetching } = useQuery<{ campaigns: MetaCampaign[] }>({
    queryKey: ["/api/meta/campaigns"],
  });

  const { data: adSetsData, isLoading: adSetsLoading, refetch: refetchAdSets, isFetching: adSetsFetching } = useQuery<{ adSets: MetaAdSet[] }>({
    queryKey: ["/api/meta/adsets"],
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
      setBudgetDialog(null);
    },
    onError: (error: any) => {
      toast({ title: "Budget Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const adSetBulkStatusMutation = useMutation({
    mutationFn: async ({ adSetIds, status }: { adSetIds: string[]; status: "ACTIVE" | "PAUSED" }) => {
      const res = await apiRequest("POST", "/api/meta/adsets/bulk-status", { adSetIds, status });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Ad Set Status Updated", description: `${data.succeeded} succeeded, ${data.failed} failed` });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/adsets"] });
      setSelectedAdSetIds(new Set());
    },
    onError: (error: any) => {
      toast({ title: "Ad Set Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const adSetBulkBudgetMutation = useMutation({
    mutationFn: async (params: { adSetIds: string[]; action: string; value: number; budgetType: string }) => {
      const res = await apiRequest("POST", "/api/meta/adsets/bulk-budget", params);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Ad Set Budget Updated", description: `${data.succeeded} succeeded, ${data.failed} failed` });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/adsets"] });
      setSelectedAdSetIds(new Set());
      setBudgetDialog(null);
    },
    onError: (error: any) => {
      toast({ title: "Ad Set Budget Failed", description: error.message, variant: "destructive" });
    },
  });

  const bulkTargetingMutation = useMutation({
    mutationFn: async (params: { adSetIds: string[]; targeting: Record<string, any> }) => {
      const res = await apiRequest("POST", "/api/meta/adsets/bulk-targeting", params);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Targeting Updated", description: `${data.succeeded} succeeded, ${data.failed} failed` });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/adsets"] });
      setSelectedAdSetIds(new Set());
      setTargetingDialog(false);
    },
    onError: (error: any) => {
      toast({ title: "Targeting Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const campaigns = data?.campaigns || [];
  const adSets = adSetsData?.adSets || [];

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

  const toggleAdSetSelect = (id: string) => {
    const next = new Set(selectedAdSetIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedAdSetIds(next);
  };

  const toggleAllAdSets = () => {
    if (selectedAdSetIds.size === adSets.length) setSelectedAdSetIds(new Set());
    else setSelectedAdSetIds(new Set(adSets.map(a => a.id)));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" data-testid={`badge-status-${status}`}>Active</Badge>;
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
  const hasAdSetSelection = selectedAdSetIds.size > 0;

  const handleApplyTargeting = () => {
    const targeting: Record<string, any> = {};
    const ageMin = parseInt(targetingAgeMin);
    const ageMax = parseInt(targetingAgeMax);
    if (ageMin >= 13 && ageMin <= 65) targeting.age_min = ageMin;
    if (ageMax >= 13 && ageMax <= 65) targeting.age_max = ageMax;
    if (targetingGender !== "all") targeting.genders = targetingGender === "male" ? [1] : [2];

    bulkTargetingMutation.mutate({
      adSetIds: [...selectedAdSetIds],
      targeting,
    });
  };

  return (
    <div className="space-y-6 max-w-5xl" data-testid="page-meta-campaigns">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Meta Campaigns & Ad Sets</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View and manage your Facebook ad campaigns and ad sets. Select multiple for bulk actions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { refetch(); refetchAdSets(); }}
          disabled={isFetching || adSetsFetching}
          data-testid="button-refresh-campaigns"
        >
          {(isFetching || adSetsFetching) ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedIds(new Set()); setSelectedAdSetIds(new Set()); }}>
        <TabsList className="bg-white/[0.04] border border-white/[0.08]">
          <TabsTrigger value="campaigns" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400 data-[state=active]:border-b-2 data-[state=active]:border-b-blue-500" data-testid="tab-campaigns">
            <Megaphone className="w-3.5 h-3.5 mr-1.5" />Campaigns ({campaigns.length})
          </TabsTrigger>
          <TabsTrigger value="adsets" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400 data-[state=active]:border-b-2 data-[state=active]:border-b-blue-500" data-testid="tab-adsets">
            <Layers className="w-3.5 h-3.5 mr-1.5" />Ad Sets ({adSets.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4 mt-4">
          {hasSelection && (
            <Card className="border-blue-500/30 bg-blue-500/[0.08]" data-testid="panel-bulk-actions">
              <CardContent className="flex items-center gap-3 py-3 px-4 flex-wrap">
                <span className="text-sm font-medium" data-testid="text-selected-count">{selectedIds.size} selected</span>
                <div className="h-4 w-px bg-border" />
                <Button size="sm" variant="outline" className="h-7 text-xs bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20" disabled={bulkStatusMutation.isPending}
                  onClick={() => bulkStatusMutation.mutate({ campaignIds: [...selectedIds], status: "ACTIVE" })} data-testid="button-bulk-activate">
                  <Play className="w-3 h-3 mr-1" />Activate All
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20" disabled={bulkStatusMutation.isPending}
                  onClick={() => bulkStatusMutation.mutate({ campaignIds: [...selectedIds], status: "PAUSED" })} data-testid="button-bulk-pause">
                  <Pause className="w-3 h-3 mr-1" />Pause All
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20"
                  onClick={() => { setBudgetAction("increase"); setBudgetDialog("campaign"); }} data-testid="button-bulk-increase-budget">
                  <TrendingUp className="w-3 h-3 mr-1" />Increase Budget
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                  onClick={() => { setBudgetAction("decrease"); setBudgetDialog("campaign"); }} data-testid="button-bulk-decrease-budget">
                  <TrendingDown className="w-3 h-3 mr-1" />Decrease Budget
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs bg-white/[0.04] border-white/[0.08] text-white/70 hover:bg-white/[0.08]"
                  onClick={() => { setBudgetAction("set"); setBudgetDialog("campaign"); }} data-testid="button-bulk-set-budget">
                  <DollarSign className="w-3 h-3 mr-1" />Set Budget
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={() => setSelectedIds(new Set())} data-testid="button-clear-selection">
                  Clear
                </Button>
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
            </div>
          ) : campaigns.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Megaphone className="w-10 h-10 text-muted-foreground mb-3" />
                <CardTitle className="text-base mb-1" data-testid="text-empty-state">No Campaigns Found</CardTitle>
                <CardDescription>Launch an ad from the Ad Launcher to create your first campaign, or ensure your Facebook account is connected.</CardDescription>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-2 pb-1">
                <Checkbox checked={selectedIds.size === campaigns.length && campaigns.length > 0} onCheckedChange={toggleAll} data-testid="checkbox-select-all" />
                <span className="text-xs text-muted-foreground">Select All</span>
              </div>
              {campaigns.map((campaign) => (
                <Card key={campaign.id} className={`transition-colors ${selectedIds.has(campaign.id) ? "border-blue-500/40 bg-blue-500/10" : "border-white/[0.06] hover:bg-white/[0.04]"}`} data-testid={`card-campaign-${campaign.id}`}>
                  <CardContent className="flex items-center py-4 px-5 gap-4">
                    <Checkbox checked={selectedIds.has(campaign.id)} onCheckedChange={() => toggleSelect(campaign.id)} data-testid={`checkbox-campaign-${campaign.id}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm truncate" data-testid={`text-campaign-name-${campaign.id}`}>{campaign.name}</p>
                        {getStatusBadge(campaign.status)}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-white/40">
                        <span data-testid={`text-campaign-objective-${campaign.id}`}>{campaign.objective?.replace("OUTCOME_", "")}</span>
                        {campaign.daily_budget && <span>Daily: <span className="text-emerald-400 font-medium">{formatBudget(campaign.daily_budget)}</span></span>}
                        {campaign.lifetime_budget && <span>Lifetime: <span className="text-emerald-400 font-medium">{formatBudget(campaign.lifetime_budget)}</span></span>}
                        <span>{new Date(campaign.created_time).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {(campaign.status === "ACTIVE" || campaign.status === "PAUSED") && (
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${campaign.status === "ACTIVE" ? "text-emerald-400" : "text-white/30"}`}>{campaign.status === "ACTIVE" ? "Active" : "Paused"}</span>
                          <Switch checked={campaign.status === "ACTIVE"} disabled={togglingId === campaign.id || toggleMutation.isPending}
                            onCheckedChange={(checked) => { setTogglingId(campaign.id); toggleMutation.mutate({ campaignId: campaign.id, status: checked ? "ACTIVE" : "PAUSED" }); }}
                            data-testid={`switch-campaign-${campaign.id}`} />
                        </div>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-400 hover:text-blue-300"
                        onClick={() => window.open(`https://www.facebook.com/adsmanager/manage/campaigns?act=${campaign.id}`, "_blank")}
                        data-testid={`button-open-campaign-${campaign.id}`}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="adsets" className="space-y-4 mt-4">
          {hasAdSetSelection && (
            <Card className="border-blue-500/30 bg-blue-500/[0.08]" data-testid="panel-adset-bulk-actions">
              <CardContent className="flex items-center gap-3 py-3 px-4 flex-wrap">
                <span className="text-sm font-medium" data-testid="text-adset-selected-count">{selectedAdSetIds.size} selected</span>
                <div className="h-4 w-px bg-border" />
                <Button size="sm" variant="outline" className="h-7 text-xs bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20" disabled={adSetBulkStatusMutation.isPending}
                  onClick={() => adSetBulkStatusMutation.mutate({ adSetIds: [...selectedAdSetIds], status: "ACTIVE" })} data-testid="button-adset-bulk-activate">
                  <Play className="w-3 h-3 mr-1" />Activate All
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20" disabled={adSetBulkStatusMutation.isPending}
                  onClick={() => adSetBulkStatusMutation.mutate({ adSetIds: [...selectedAdSetIds], status: "PAUSED" })} data-testid="button-adset-bulk-pause">
                  <Pause className="w-3 h-3 mr-1" />Pause All
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20"
                  onClick={() => { setBudgetAction("increase"); setBudgetDialog("adset"); }} data-testid="button-adset-bulk-increase-budget">
                  <TrendingUp className="w-3 h-3 mr-1" />Increase Budget
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                  onClick={() => { setBudgetAction("decrease"); setBudgetDialog("adset"); }} data-testid="button-adset-bulk-decrease-budget">
                  <TrendingDown className="w-3 h-3 mr-1" />Decrease Budget
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs bg-white/[0.04] border-white/[0.08] text-white/70 hover:bg-white/[0.08]"
                  onClick={() => { setBudgetAction("set"); setBudgetDialog("adset"); }} data-testid="button-adset-bulk-set-budget">
                  <DollarSign className="w-3 h-3 mr-1" />Set Budget
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs bg-violet-500/10 border-violet-500/30 text-violet-400 hover:bg-violet-500/20"
                  onClick={() => setTargetingDialog(true)} data-testid="button-adset-bulk-targeting">
                  <Target className="w-3 h-3 mr-1" />Update Targeting
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={() => setSelectedAdSetIds(new Set())} data-testid="button-adset-clear-selection">
                  Clear
                </Button>
              </CardContent>
            </Card>
          )}

          {adSetsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
            </div>
          ) : adSets.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Layers className="w-10 h-10 text-muted-foreground mb-3" />
                <CardTitle className="text-base mb-1" data-testid="text-adsets-empty-state">No Ad Sets Found</CardTitle>
                <CardDescription>Launch an ad from the Ad Launcher to create ad sets, or ensure your Facebook account is connected.</CardDescription>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-2 pb-1">
                <Checkbox checked={selectedAdSetIds.size === adSets.length && adSets.length > 0} onCheckedChange={toggleAllAdSets} data-testid="checkbox-adset-select-all" />
                <span className="text-xs text-muted-foreground">Select All</span>
              </div>
              {adSets.map((adSet) => {
                const targeting = adSet.targeting || {};
                const ageRange = targeting.age_min && targeting.age_max ? `${targeting.age_min}-${targeting.age_max}` : "";
                const genders = targeting.genders?.includes(1) && targeting.genders?.includes(2) ? "All" : targeting.genders?.includes(1) ? "Male" : targeting.genders?.includes(2) ? "Female" : "All";
                return (
                  <Card key={adSet.id} className={`transition-colors ${selectedAdSetIds.has(adSet.id) ? "border-blue-500/40 bg-blue-500/10" : "border-white/[0.06] hover:bg-white/[0.04]"}`} data-testid={`card-adset-${adSet.id}`}>
                    <CardContent className="flex items-center py-4 px-5 gap-4">
                      <Checkbox checked={selectedAdSetIds.has(adSet.id)} onCheckedChange={() => toggleAdSetSelect(adSet.id)} data-testid={`checkbox-adset-${adSet.id}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm truncate" data-testid={`text-adset-name-${adSet.id}`}>{adSet.name}</p>
                          {getStatusBadge(adSet.effective_status || adSet.status)}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {adSet.optimization_goal && <span>{adSet.optimization_goal.replace("OUTCOME_", "")}</span>}
                          {adSet.daily_budget && <span>Daily: {formatBudget(adSet.daily_budget)}</span>}
                          {adSet.lifetime_budget && <span>Lifetime: {formatBudget(adSet.lifetime_budget)}</span>}
                          {ageRange && <Badge variant="outline" className="text-[9px] px-1 py-0">Age: {ageRange}</Badge>}
                          <Badge variant="outline" className="text-[9px] px-1 py-0">Gender: {genders}</Badge>
                          {targeting.custom_audiences?.length > 0 && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0">{targeting.custom_audiences.length} audience(s)</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                          onClick={() => window.open(`https://www.facebook.com/adsmanager/manage/adsets?act=${adSet.id}`, "_blank")}
                          data-testid={`button-open-adset-${adSet.id}`}>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={budgetDialog !== null} onOpenChange={(open) => { if (!open) setBudgetDialog(null); }}>
        <DialogContent data-testid="dialog-bulk-budget">
          <DialogHeader>
            <DialogTitle>
              {budgetAction === "increase" ? "Increase" : budgetAction === "decrease" ? "Decrease" : "Set"} Budget ({budgetDialog === "adset" ? "Ad Sets" : "Campaigns"})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{budgetAction === "set" ? "New Budget (PKR)" : "Percentage (%)"}</Label>
              <Input type="number" value={budgetValue} onChange={(e) => setBudgetValue(e.target.value)}
                placeholder={budgetAction === "set" ? "500" : "20"} data-testid="input-budget-value" />
            </div>
            <div>
              <Label>Budget Type</Label>
              <Select value={budgetType} onValueChange={(v) => setBudgetType(v as "daily" | "lifetime")}>
                <SelectTrigger data-testid="select-budget-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily Budget</SelectItem>
                  <SelectItem value="lifetime">Lifetime Budget</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              This will {budgetAction === "set" ? "set" : budgetAction} the {budgetType} budget {budgetAction !== "set" ? `by ${budgetValue}%` : `to PKR ${budgetValue}`} for {budgetDialog === "adset" ? selectedAdSetIds.size : selectedIds.size} {budgetDialog === "adset" ? "ad set(s)" : "campaign(s)"}.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetDialog(null)} data-testid="button-cancel-budget">Cancel</Button>
            <Button
              onClick={() => {
                if (budgetDialog === "adset") {
                  adSetBulkBudgetMutation.mutate({ adSetIds: [...selectedAdSetIds], action: budgetAction, value: parseFloat(budgetValue) || 0, budgetType });
                } else {
                  bulkBudgetMutation.mutate({ campaignIds: [...selectedIds], action: budgetAction, value: parseFloat(budgetValue) || 0, budgetType });
                }
              }}
              disabled={bulkBudgetMutation.isPending || adSetBulkBudgetMutation.isPending}
              data-testid="button-apply-budget"
            >
              {(bulkBudgetMutation.isPending || adSetBulkBudgetMutation.isPending) && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={targetingDialog} onOpenChange={setTargetingDialog}>
        <DialogContent data-testid="dialog-bulk-targeting">
          <DialogHeader>
            <DialogTitle>Update Targeting ({selectedAdSetIds.size} ad sets)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Min Age</Label>
                <Input type="number" value={targetingAgeMin} onChange={(e) => setTargetingAgeMin(e.target.value)}
                  min="13" max="65" data-testid="input-targeting-age-min" />
              </div>
              <div>
                <Label>Max Age</Label>
                <Input type="number" value={targetingAgeMax} onChange={(e) => setTargetingAgeMax(e.target.value)}
                  min="13" max="65" data-testid="input-targeting-age-max" />
              </div>
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={targetingGender} onValueChange={setTargetingGender}>
                <SelectTrigger data-testid="select-targeting-gender"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Genders</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              These targeting changes will be merged with existing targeting for each ad set. Fields not changed here will remain as-is.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTargetingDialog(false)} data-testid="button-cancel-targeting">Cancel</Button>
            <Button onClick={handleApplyTargeting} disabled={bulkTargetingMutation.isPending} data-testid="button-apply-targeting">
              {bulkTargetingMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Apply Targeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
