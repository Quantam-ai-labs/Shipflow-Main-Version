import { useState, useMemo, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
  Clock,
  Activity,
  Zap,
} from "lucide-react";
import type { CampaignJourneyEvent } from "@shared/schema";
import { formatPkDate } from "@/lib/dateFormat";

const MIN_SPEND_FOR_EVIDENCE_PKR = 2000;
const MIN_DELIVERED_FOR_EVIDENCE = 10;

type Signal = "Scale" | "Watch" | "Risk";
type JourneyFilter = "All" | "Needs Review" | "Evaluation Pending" | "Scale Candidates" | "Risk Only";

interface CampaignMetrics {
  campaignId: string;
  campaignName: string;
  spend_total: number;
  net_profit_total: number;
  cpa: number;
  margin_percent: number;
  delivered_count: number;
  orders_count: number;
}

interface CampaignJourneyProps {
  campaignMetrics: CampaignMetrics[];
}

function isEvidenceReady(m: CampaignMetrics): boolean {
  if (m.delivered_count >= MIN_DELIVERED_FOR_EVIDENCE) return true;
  if (m.spend_total >= MIN_SPEND_FOR_EVIDENCE_PKR) return true;
  return false;
}

function computeLeverageIndex(spendDelta: number, profitDelta: number) {
  const li = profitDelta / Math.max(spendDelta, 1);
  if (profitDelta > 0 && li >= 1.0) return "strong";
  if (profitDelta > 0 && li > 0) return "neutral";
  if (profitDelta < 0) return "negative";
  return "weak";
}

function computeTrend(snapshotBefore: any, snapshotAfter: any): "Improving" | "Flat" | "Worsening" {
  if (!snapshotBefore || !snapshotAfter) return "Flat";
  const profitDelta = (snapshotAfter.net_profit_total || 0) - (snapshotBefore.net_profit_total || 0);
  if (profitDelta > 0) {
    const cpaDelta = (snapshotAfter.cpa || 0) - (snapshotBefore.cpa || 0);
    if (cpaDelta <= 0) return "Improving";
    return "Improving";
  }
  if (profitDelta < 0) return "Worsening";
  return "Flat";
}

function getInsightAndNextMove(events: CampaignJourneyEvent[], metrics: CampaignMetrics | undefined): { insight: string; nextMove: string } {
  if (!events.length || !metrics) {
    return {
      insight: "New campaign\u2014gathering evidence.",
      nextMove: "Wait until evidence threshold, then review.",
    };
  }

  const latestEvaluated = events.find(e => e.snapshotAfter !== null);
  const latestPending = events.find(e => e.snapshotAfter === null);

  if (!latestEvaluated && latestPending) {
    return {
      insight: "Collecting data\u2014evaluation pending.",
      nextMove: "Hold changes until window completes.",
    };
  }

  if (latestEvaluated) {
    const before = latestEvaluated.snapshotBefore as any;
    const after = latestEvaluated.snapshotAfter as any;
    if (before && after) {
      const spendDelta = (after.spend_total || 0) - (before.spend_total || 0);
      const profitDelta = (after.net_profit_total || 0) - (before.net_profit_total || 0);
      const leverage = computeLeverageIndex(spendDelta, profitDelta);

      switch (leverage) {
        case "strong":
          return {
            insight: "Positive leverage\u2014profit rose faster than spend.",
            nextMove: "Scale +10\u201320% and keep variables stable for next window.",
          };
        case "neutral":
          return {
            insight: "Profit improved but scaling efficiency is moderate.",
            nextMove: "Hold budget; refine creative/offer before scaling again.",
          };
        case "weak":
          return {
            insight: "Spend increased without meaningful profit lift.",
            nextMove: "Stop scaling; fix bottleneck then retest.",
          };
        case "negative":
          return {
            insight: "Change reacted negatively\u2014loss increased after modification.",
            nextMove: "Reduce -30% or revert; test one focused change next.",
          };
      }
    }
  }

  return {
    insight: "New campaign\u2014gathering evidence.",
    nextMove: "Wait until evidence threshold, then review.",
  };
}

function getStage(events: CampaignJourneyEvent[], metrics: CampaignMetrics | undefined): string {
  if (!metrics || !isEvidenceReady(metrics)) return "Exploration";
  if (!events.length) return "Exploration";

  const latestEvaluated = events.find(e => e.snapshotAfter !== null);
  if (!latestEvaluated) return "Validation";

  const before = latestEvaluated.snapshotBefore as any;
  const after = latestEvaluated.snapshotAfter as any;
  if (before && after) {
    const spendDelta = (after.spend_total || 0) - (before.spend_total || 0);
    const profitDelta = (after.net_profit_total || 0) - (before.net_profit_total || 0);
    const leverage = computeLeverageIndex(spendDelta, profitDelta);
    if (leverage === "strong" || leverage === "neutral") return "Scaling";
    if (leverage === "negative") return "Decline";
  }

  return "Validation";
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function formatDelta(val: number): string {
  const prefix = val >= 0 ? "+" : "";
  return prefix + formatCurrency(val);
}

const CHANGE_TYPES = [
  "Budget change",
  "Creative change",
  "Offer change",
  "Targeting change",
  "Landing/checkout change",
  "Pause / Resume",
];

const EXPECTED_OUTCOMES = [
  "Lower CPA",
  "Higher volume",
  "Higher margin",
  "Reduce returns",
  "Fix funnel drop (ATC\u2192Purchase)",
  "Test viability (new)",
];

const MICRO_TAGS: Record<string, string[]> = {
  "Creative change": ["Hook", "Thumbnail", "Angle", "CTA", "Format", "Length"],
  "Offer change": ["Price", "Bundle", "Shipping message", "Guarantee", "Trust"],
};

export default function CampaignJourney({ campaignMetrics }: CampaignJourneyProps) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<JourneyFilter>("All");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showAddAction, setShowAddAction] = useState(false);
  const [showMoreMetrics, setShowMoreMetrics] = useState<Record<string, boolean>>({});
  const toggleMoreMetrics = (eventId: string) => setShowMoreMetrics(prev => ({ ...prev, [eventId]: !prev[eventId] }));

  const [actionCampaign, setActionCampaign] = useState("");
  const [actionChangeType, setActionChangeType] = useState("");
  const [actionOutcome, setActionOutcome] = useState("");
  const [actionWindow, setActionWindow] = useState("48");
  const [actionNotes, setActionNotes] = useState("");
  const [actionMicroTag, setActionMicroTag] = useState("");

  const { data: eventsData, isLoading } = useQuery<{ events: CampaignJourneyEvent[] }>({
    queryKey: ["/api/marketing/journey/events"],
  });

  const allEvents = eventsData?.events ?? [];

  const createEventMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/marketing/journey/events", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/journey/events"] });
      toast({ title: "Action saved", description: "Journey event recorded." });
      setShowAddAction(false);
      resetActionForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const evaluateMutation = useMutation({
    mutationFn: async () => {
      const currentMetrics: Record<string, any> = {};
      campaignMetrics.forEach(m => {
        currentMetrics[m.campaignId] = {
          spend_total: m.spend_total,
          net_profit_total: m.net_profit_total,
          cpa: m.cpa,
          margin_percent: m.margin_percent,
          delivered_count: m.delivered_count,
          orders_count: m.orders_count,
          timestamp: new Date().toISOString(),
        };
      });
      const res = await apiRequest("POST", "/api/marketing/journey/evaluate", { currentMetrics });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/journey/events"] });
      toast({ title: "Evaluations refreshed", description: `${data.evaluated} events evaluated.` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function resetActionForm() {
    setActionCampaign("");
    setActionChangeType("");
    setActionOutcome("");
    setActionWindow("48");
    setActionNotes("");
    setActionMicroTag("");
  }

  function handleAddAction() {
    const metrics = campaignMetrics.find(m => m.campaignId === actionCampaign);
    const snapshotBefore = metrics ? {
      spend_total: metrics.spend_total,
      net_profit_total: metrics.net_profit_total,
      cpa: metrics.cpa,
      margin_percent: metrics.margin_percent,
      delivered_count: metrics.delivered_count,
      orders_count: metrics.orders_count,
      timestamp: new Date().toISOString(),
    } : null;

    createEventMutation.mutate({
      campaignKey: actionCampaign,
      actionType: actionChangeType,
      expectedOutcome: actionOutcome,
      evaluationWindowHours: parseInt(actionWindow),
      notes: actionNotes || null,
      microTag: actionMicroTag || null,
      snapshotBefore,
    });
  }

  const eventsByCampaign = useMemo(() => {
    const map = new Map<string, CampaignJourneyEvent[]>();
    for (const evt of allEvents) {
      const key = evt.campaignKey;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(evt);
    }
    return map;
  }, [allEvents]);

  const campaignKeys = useMemo(() => {
    const keys = new Set<string>();
    campaignMetrics.forEach(m => keys.add(m.campaignId));
    allEvents.forEach(e => keys.add(e.campaignKey));
    return Array.from(keys);
  }, [campaignMetrics, allEvents]);

  const journeyRows = useMemo(() => {
    return campaignKeys.map(key => {
      const metrics = campaignMetrics.find(m => m.campaignId === key);
      const events = eventsByCampaign.get(key) || [];
      const signalEvent = events.find(e => e.actionType === "Signal Decision");
      const currentSignal = signalEvent?.selectedSignal as Signal | undefined;
      const stage = getStage(events, metrics);
      const lastAction = events.length > 0 ? events[0] : null;
      const { insight, nextMove } = getInsightAndNextMove(events, metrics);

      let spendDelta = 0;
      let profitDelta = 0;
      let trend: "Improving" | "Flat" | "Worsening" = "Flat";

      const latestEvaluated = events.find(e => e.snapshotAfter !== null);
      if (latestEvaluated) {
        const before = latestEvaluated.snapshotBefore as any;
        const after = latestEvaluated.snapshotAfter as any;
        if (before && after) {
          spendDelta = (after.spend_total || 0) - (before.spend_total || 0);
          profitDelta = (after.net_profit_total || 0) - (before.net_profit_total || 0);
          trend = computeTrend(before, after);
        }
      }

      return {
        key,
        name: metrics?.campaignName || key,
        currentSignal,
        stage,
        lastAction: lastAction?.actionType || "None",
        spendDelta,
        profitDelta,
        trend,
        insight,
        nextMove,
        events,
        metrics,
        hasEvaluationPending: events.some(e => e.snapshotAfter === null),
      };
    });
  }, [campaignKeys, campaignMetrics, eventsByCampaign]);

  const filteredRows = useMemo(() => {
    return journeyRows.filter(row => {
      if (filter === "All") return true;
      if (filter === "Needs Review") {
        return row.events.some(e => e.snapshotAfter !== null) && row.stage !== "Exploration";
      }
      if (filter === "Evaluation Pending") return row.hasEvaluationPending;
      if (filter === "Scale Candidates") return row.currentSignal === "Scale" || row.stage === "Scaling";
      if (filter === "Risk Only") return row.currentSignal === "Risk" || row.stage === "Decline";
      return true;
    });
  }, [journeyRows, filter]);

  const microTagOptions = MICRO_TAGS[actionChangeType] || [];

  const stageBadgeColor: Record<string, string> = {
    "Exploration": "bg-blue-500/10 text-blue-600 border-blue-500/20",
    "Validation": "bg-amber-500/10 text-amber-600 border-amber-500/20",
    "Scaling": "bg-green-500/10 text-green-600 border-green-500/20",
    "Decline": "bg-red-500/10 text-red-600 border-red-500/20",
  };

  const signalBadgeColor: Record<string, string> = {
    "Scale": "bg-green-500/10 text-green-600 border-green-500/20",
    "Watch": "bg-amber-500/10 text-amber-600 border-amber-500/20",
    "Risk": "bg-red-500/10 text-red-600 border-red-500/20",
  };

  return (
    <Card data-testid="card-campaign-journey">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2" data-testid="text-journey-title">
              <Activity className="w-5 h-5" />
              Campaign Journey
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Track actions, measure results, and get next-move insights.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { resetActionForm(); setShowAddAction(true); }}
              data-testid="button-add-action"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Action
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => evaluateMutation.mutate()}
              disabled={evaluateMutation.isPending}
              data-testid="button-refresh-evaluations"
            >
              {evaluateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Refresh Evaluations
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" data-testid="journey-filter-chips">
          {(["All", "Needs Review", "Evaluation Pending", "Scale Candidates", "Risk Only"] as JourneyFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
              }`}
              data-testid={`button-filter-${f.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {f}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading journey data...</div>
        ) : filteredRows.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No journey data yet. Use the signal buttons above or add an action to get started.</p>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" data-testid="table-journey">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left text-xs font-semibold px-3 py-2 border-b border-border"></th>
                    <th className="text-left text-xs font-semibold px-3 py-2 border-b border-border">Campaign</th>
                    <th className="text-center text-xs font-semibold px-3 py-2 border-b border-border">Signal</th>
                    <th className="text-center text-xs font-semibold px-3 py-2 border-b border-border">Stage</th>
                    <th className="text-left text-xs font-semibold px-3 py-2 border-b border-border">Last Action</th>
                    <th className="text-right text-xs font-semibold px-3 py-2 border-b border-border">Spend &Delta;</th>
                    <th className="text-right text-xs font-semibold px-3 py-2 border-b border-border">Net Profit &Delta;</th>
                    <th className="text-center text-xs font-semibold px-3 py-2 border-b border-border">Trend</th>
                    <th className="text-left text-xs font-semibold px-3 py-2 border-b border-border">Insight</th>
                    <th className="text-left text-xs font-semibold px-3 py-2 border-b border-border">Next Move</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(row => (
                    <Fragment key={row.key}>
                      <tr
                        className="hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => setExpandedRow(expandedRow === row.key ? null : row.key)}
                        data-testid={`row-journey-${row.key}`}
                      >
                        <td className="px-3 py-2 border-b border-border">
                          {expandedRow === row.key ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </td>
                        <td className="px-3 py-2 border-b border-border text-xs font-medium max-w-[180px] truncate" data-testid={`text-journey-campaign-${row.key}`}>
                          {row.name}
                        </td>
                        <td className="px-3 py-2 border-b border-border text-center">
                          {row.currentSignal ? (
                            <Badge className={`text-[10px] ${signalBadgeColor[row.currentSignal]}`} data-testid={`badge-signal-${row.key}`}>
                              {row.currentSignal}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">{"\u2014"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 border-b border-border text-center">
                          <Badge className={`text-[10px] ${stageBadgeColor[row.stage] || ""}`} data-testid={`badge-stage-${row.key}`}>
                            {row.stage}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 border-b border-border text-xs text-muted-foreground" data-testid={`text-last-action-${row.key}`}>
                          {row.lastAction}
                        </td>
                        <td className="px-3 py-2 border-b border-border text-xs text-right tabular-nums" data-testid={`text-spend-delta-${row.key}`}>
                          {row.spendDelta !== 0 ? formatDelta(row.spendDelta) : "\u2014"}
                        </td>
                        <td className="px-3 py-2 border-b border-border text-xs text-right tabular-nums" data-testid={`text-profit-delta-${row.key}`}>
                          {row.profitDelta !== 0 ? (
                            <span className={row.profitDelta >= 0 ? "text-green-600" : "text-red-600"}>
                              {formatDelta(row.profitDelta)}
                            </span>
                          ) : "\u2014"}
                        </td>
                        <td className="px-3 py-2 border-b border-border text-center">
                          {row.trend === "Improving" && <TrendingUp className="w-4 h-4 text-green-500 mx-auto" />}
                          {row.trend === "Worsening" && <TrendingDown className="w-4 h-4 text-red-500 mx-auto" />}
                          {row.trend === "Flat" && <Minus className="w-4 h-4 text-muted-foreground mx-auto" />}
                        </td>
                        <td className="px-3 py-2 border-b border-border text-xs text-muted-foreground max-w-[200px] truncate" data-testid={`text-insight-${row.key}`}>
                          {row.insight}
                        </td>
                        <td className="px-3 py-2 border-b border-border text-xs text-muted-foreground max-w-[200px] truncate" data-testid={`text-next-move-${row.key}`}>
                          {row.nextMove}
                        </td>
                      </tr>
                      {expandedRow === row.key && (
                        <tr key={`${row.key}-detail`}>
                          <td colSpan={10} className="bg-muted/20 px-4 py-3 border-b border-border">
                            <EventTimeline
                              events={row.events}
                              showMoreMetrics={showMoreMetrics}
                              onToggleMore={toggleMoreMetrics}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={showAddAction} onOpenChange={setShowAddAction}>
        <DialogContent className="max-w-lg" data-testid="dialog-add-action">
          <DialogHeader>
            <DialogTitle>Add Action</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Campaign *</Label>
              <Select value={actionCampaign} onValueChange={setActionCampaign}>
                <SelectTrigger data-testid="select-action-campaign">
                  <SelectValue placeholder="Select campaign..." />
                </SelectTrigger>
                <SelectContent>
                  {campaignMetrics.map(m => (
                    <SelectItem key={m.campaignId} value={m.campaignId}>
                      {m.campaignName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Change Type *</Label>
              <Select value={actionChangeType} onValueChange={(v) => { setActionChangeType(v); setActionMicroTag(""); }}>
                <SelectTrigger data-testid="select-action-change-type">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {CHANGE_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Expected Outcome *</Label>
              <Select value={actionOutcome} onValueChange={setActionOutcome}>
                <SelectTrigger data-testid="select-action-outcome">
                  <SelectValue placeholder="Select outcome..." />
                </SelectTrigger>
                <SelectContent>
                  {EXPECTED_OUTCOMES.map(o => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Evaluation Window *</Label>
              <Select value={actionWindow} onValueChange={setActionWindow}>
                <SelectTrigger data-testid="select-action-window">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="48">48 hours (default)</SelectItem>
                  <SelectItem value="72">72 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {microTagOptions.length > 0 && (
              <div className="space-y-1.5">
                <Label>Micro-Tag (optional)</Label>
                <Select value={actionMicroTag} onValueChange={setActionMicroTag}>
                  <SelectTrigger data-testid="select-action-micro-tag">
                    <SelectValue placeholder="Select tag..." />
                  </SelectTrigger>
                  <SelectContent>
                    {microTagOptions.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notes (optional, max 120 chars)</Label>
              <Input
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value.slice(0, 120))}
                placeholder="Brief note..."
                maxLength={120}
                data-testid="input-action-notes"
              />
              <p className="text-[10px] text-muted-foreground text-right">{actionNotes.length}/120</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddAction(false)} data-testid="button-cancel-action">
              Cancel
            </Button>
            <Button
              onClick={handleAddAction}
              disabled={!actionCampaign || !actionChangeType || !actionOutcome || createEventMutation.isPending}
              data-testid="button-confirm-action"
            >
              {createEventMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Save Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function EventTimeline({ events, showMoreMetrics, onToggleMore }: { events: CampaignJourneyEvent[]; showMoreMetrics: Record<string, boolean>; onToggleMore: (eventId: string) => void }) {
  if (events.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No events recorded yet.</p>;
  }

  return (
    <div className="space-y-3" data-testid="event-timeline">
      {events.map(evt => {
        const before = evt.snapshotBefore as any;
        const after = evt.snapshotAfter as any;
        const isEvaluated = after !== null;
        const spendDelta = isEvaluated && before ? (after.spend_total || 0) - (before.spend_total || 0) : null;
        const profitDelta = isEvaluated && before ? (after.net_profit_total || 0) - (before.net_profit_total || 0) : null;

        return (
          <div key={evt.id} className="border border-border rounded-md p-3 bg-background" data-testid={`event-${evt.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {evt.actionType === "Signal Decision" ? (
                  <Zap className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                ) : (
                  <Activity className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                )}
                <span className="text-xs font-medium">{evt.actionType}</span>
                {evt.selectedSignal && (
                  <Badge className={`text-[9px] ${
                    evt.selectedSignal === "Scale" ? "bg-green-500/10 text-green-600 border-green-500/20" :
                    evt.selectedSignal === "Risk" ? "bg-red-500/10 text-red-600 border-red-500/20" :
                    "bg-amber-500/10 text-amber-600 border-amber-500/20"
                  }`}>
                    {evt.selectedSignal}
                  </Badge>
                )}
                {evt.microTag && (
                  <Badge variant="outline" className="text-[9px]">{evt.microTag}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                {evt.createdAt ? formatPkDate(evt.createdAt) : ""}
                <span className="text-muted-foreground/60">|</span>
                <span>{evt.evaluationWindowHours}h window</span>
                {isEvaluated ? (
                  <Badge className="text-[9px] bg-green-500/10 text-green-600 border-green-500/20">Evaluated</Badge>
                ) : (
                  <Badge className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/20">Pending</Badge>
                )}
              </div>
            </div>

            {evt.notes && (
              <p className="text-[11px] text-muted-foreground mt-1.5 ml-5">{evt.notes}</p>
            )}

            {isEvaluated && (
              <div className="mt-2 ml-5 flex items-center gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Spend &Delta;: </span>
                  <span className="tabular-nums font-medium">{spendDelta !== null ? formatDelta(spendDelta) : "\u2014"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Net Profit &Delta;: </span>
                  <span className={`tabular-nums font-medium ${(profitDelta || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {profitDelta !== null ? formatDelta(profitDelta) : "\u2014"}
                  </span>
                </div>
              </div>
            )}

            {isEvaluated && (
              <div className="mt-1.5 ml-5">
                <button
                  onClick={() => onToggleMore(evt.id)}
                  className="text-[10px] text-primary hover:underline"
                  data-testid={`button-more-metrics-${evt.id}`}
                >
                  {showMoreMetrics[evt.id] ? "Hide metrics" : "More metrics"}
                </button>
                {showMoreMetrics[evt.id] && before && after && (
                  <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div>
                      <span className="text-muted-foreground">CPA: </span>
                      <span>{formatCurrency(before.cpa || 0)} &rarr; {formatCurrency(after.cpa || 0)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Margin: </span>
                      <span>{(before.margin_percent || 0).toFixed(1)}% &rarr; {(after.margin_percent || 0).toFixed(1)}%</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Delivered: </span>
                      <span>{before.delivered_count || 0} &rarr; {after.delivered_count || 0}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Orders: </span>
                      <span>{before.orders_count || 0} &rarr; {after.orders_count || 0}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { isEvidenceReady };
export type { CampaignMetrics, Signal };
