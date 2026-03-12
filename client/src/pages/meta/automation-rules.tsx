import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Zap, Plus, Trash2, Loader2, Play, Pause, TrendingUp, TrendingDown, Bell, Settings2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  entityType: string;
  conditionMetric: string;
  conditionOperator: string;
  conditionValue: string;
  conditionWindow: string;
  actionType: string;
  actionValue: string | null;
  notifyOnTrigger: boolean;
  lastTriggeredAt: string | null;
  triggerCount: number;
  createdAt: string;
}

const METRICS: Record<string, string> = {
  cpa: "Cost per Purchase (CPA)",
  roas: "Return on Ad Spend (ROAS)",
  spend: "Total Spend",
  cpc: "Cost per Click (CPC)",
  cpm: "Cost per 1000 Impressions (CPM)",
  ctr: "Click-Through Rate (CTR %)",
  purchases: "Total Purchases",
};

const OPERATORS: Record<string, string> = { ">": "Greater than", "<": "Less than", ">=": "≥", "<=": "≤", "=": "Equals" };
const WINDOWS: Record<string, string> = { last_3d: "Last 3 days", last_7d: "Last 7 days", last_14d: "Last 14 days", last_30d: "Last 30 days" };
const ACTIONS: Record<string, string> = { pause: "Pause Campaign", increase_budget: "Increase Budget %", decrease_budget: "Decrease Budget %", notify: "Notify Only" };

export default function MetaAutomationRules() {
  const { toast } = useToast();
  const [createDialog, setCreateDialog] = useState(false);
  const [formName, setFormName] = useState("");
  const [formMetric, setFormMetric] = useState("cpa");
  const [formOperator, setFormOperator] = useState(">");
  const [formValue, setFormValue] = useState("");
  const [formWindow, setFormWindow] = useState("last_7d");
  const [formAction, setFormAction] = useState("pause");
  const [formActionValue, setFormActionValue] = useState("20");

  const { data, isLoading } = useQuery<{ rules: AutomationRule[] }>({
    queryKey: ["/api/meta/automation-rules"],
  });

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/meta/automation-rules", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rule Created" });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/automation-rules"] });
      setCreateDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: any) => {
      const res = await apiRequest("PUT", `/api/meta/automation-rules/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meta/automation-rules"] });
    },
    onError: (error: any) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/meta/automation-rules/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rule Deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/automation-rules"] });
    },
    onError: (error: any) => {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    },
  });

  const evaluateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/meta/automation-rules/evaluate", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.triggered > 0) {
        toast({ title: `${data.triggered} Rule(s) Triggered`, description: data.actions.slice(0, 2).join("; ") });
      } else {
        toast({ title: "No Rules Triggered", description: "All campaigns are within your defined thresholds." });
      }
    },
    onError: (error: any) => {
      toast({ title: "Evaluation Failed", description: error.message, variant: "destructive" });
    },
  });

  const rules = data?.rules || [];

  const resetForm = () => {
    setFormName("");
    setFormMetric("cpa");
    setFormOperator(">");
    setFormValue("");
    setFormWindow("last_7d");
    setFormAction("pause");
    setFormActionValue("20");
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case "pause": return <Pause className="w-3.5 h-3.5" />;
      case "increase_budget": return <TrendingUp className="w-3.5 h-3.5" />;
      case "decrease_budget": return <TrendingDown className="w-3.5 h-3.5" />;
      case "notify": return <Bell className="w-3.5 h-3.5" />;
      default: return <Settings2 className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl" data-testid="page-meta-automation-rules">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Automation Rules</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Set up automatic actions based on campaign performance metrics.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => evaluateMutation.mutate()} disabled={evaluateMutation.isPending || rules.length === 0} data-testid="button-evaluate-rules">
            {evaluateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
            Run Now
          </Button>
          <Button size="sm" onClick={() => setCreateDialog(true)} data-testid="button-create-rule">
            <Plus className="w-3.5 h-3.5 mr-1.5" />New Rule
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Zap className="w-10 h-10 text-muted-foreground mb-3" />
            <CardTitle className="text-base mb-1" data-testid="text-empty-state">No Automation Rules</CardTitle>
            <CardDescription>
              Create rules to automatically pause underperforming ads, scale winning campaigns, or get notified when metrics hit thresholds.
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card key={rule.id} className={`transition-colors ${rule.enabled ? "hover:bg-muted/30" : "opacity-60"}`} data-testid={`card-rule-${rule.id}`}>
              <CardContent className="flex items-center justify-between py-4 px-5 gap-4">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(checked) => updateMutation.mutate({ id: rule.id, enabled: checked })}
                    data-testid={`switch-rule-${rule.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm" data-testid={`text-rule-name-${rule.id}`}>{rule.name}</p>
                      <Badge variant="outline" className="text-xs gap-1">
                        {getActionIcon(rule.actionType)}
                        {ACTIONS[rule.actionType] || rule.actionType}
                        {rule.actionValue && ["increase_budget", "decrease_budget"].includes(rule.actionType) && ` ${rule.actionValue}%`}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      When <strong>{METRICS[rule.conditionMetric] || rule.conditionMetric}</strong> {rule.conditionOperator} <strong>{rule.conditionValue}</strong> over {WINDOWS[rule.conditionWindow] || rule.conditionWindow}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {rule.triggerCount > 0 && <span>Triggered {rule.triggerCount}x</span>}
                      {rule.lastTriggeredAt && <span>Last: {new Date(rule.lastTriggeredAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteMutation.mutate(rule.id)}
                  data-testid={`button-delete-rule-${rule.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-lg" data-testid="dialog-create-rule">
          <DialogHeader>
            <DialogTitle>Create Automation Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Rule Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Stop Loss - CPA > 500" data-testid="input-rule-name" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Metric</Label>
                <Select value={formMetric} onValueChange={setFormMetric}>
                  <SelectTrigger data-testid="select-rule-metric"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(METRICS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Operator</Label>
                <Select value={formOperator} onValueChange={setFormOperator}>
                  <SelectTrigger data-testid="select-rule-operator"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(OPERATORS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Threshold</Label>
                <Input type="number" value={formValue} onChange={(e) => setFormValue(e.target.value)} placeholder="500" data-testid="input-rule-threshold" />
              </div>
            </div>

            <div>
              <Label>Time Window</Label>
              <Select value={formWindow} onValueChange={setFormWindow}>
                <SelectTrigger data-testid="select-rule-window"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(WINDOWS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Action</Label>
                <Select value={formAction} onValueChange={setFormAction}>
                  <SelectTrigger data-testid="select-rule-action"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACTIONS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(formAction === "increase_budget" || formAction === "decrease_budget") && (
                <div>
                  <Label>% Change</Label>
                  <Input type="number" value={formActionValue} onChange={(e) => setFormActionValue(e.target.value)} placeholder="20" data-testid="input-rule-action-value" />
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground border-t pt-3">
              Rules are evaluated during data sync. When the condition is met for any active campaign, the specified action will be taken automatically.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)} data-testid="button-cancel-rule">Cancel</Button>
            <Button
              onClick={() => {
                createMutation.mutate({
                  name: formName,
                  conditionMetric: formMetric,
                  conditionOperator: formOperator,
                  conditionValue: formValue,
                  conditionWindow: formWindow,
                  actionType: formAction,
                  actionValue: ["increase_budget", "decrease_budget"].includes(formAction) ? formActionValue : undefined,
                });
              }}
              disabled={!formName || !formValue || createMutation.isPending}
              data-testid="button-save-rule"
            >
              {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Create Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
