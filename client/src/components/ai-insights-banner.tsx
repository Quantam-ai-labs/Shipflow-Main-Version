import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Target,
  Truck,
  Lightbulb,
  DollarSign,
  BarChart3,
  AlertTriangle,
  ShoppingBag,
  Clock,
  Loader2,
} from "lucide-react";

interface InsightMetric {
  label: string;
  value: string;
  trend?: "up" | "down" | "stable";
}

interface InsightCard {
  key: string;
  title: string;
  category: string;
  summary: string;
  metrics: InsightMetric[];
}

interface InsightsResponse {
  insights: InsightCard[];
  generatedAt?: string;
}

interface AIInsightsBannerProps {
  section: string;
  className?: string;
}

const CATEGORY_ICONS: Record<string, typeof Brain> = {
  campaigns: Target,
  operations: Truck,
  strategy: Lightbulb,
  finance: DollarSign,
  overview: BarChart3,
  risk: AlertTriangle,
  products: ShoppingBag,
};

function TrendIcon({ trend }: { trend?: "up" | "down" | "stable" }) {
  if (trend === "up") return <TrendingUp className="h-3 w-3 text-green-500" />;
  if (trend === "down") return <TrendingDown className="h-3 w-3 text-red-500" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function InsightCardItem({ insight }: { insight: InsightCard }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = CATEGORY_ICONS[insight.category] || Brain;

  return (
    <Card className="min-w-[280px] max-w-[340px] shrink-0" data-testid={`banner-insight-${insight.key}`}>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
          <CardTitle className="text-xs font-semibold truncate">{insight.title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        <p className={`text-[11px] text-muted-foreground leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
          {insight.summary}
        </p>
        {insight.summary.length > 100 && (
          <Button
            variant="link"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] p-0 h-auto"
            data-testid={`toggle-banner-insight-${insight.key}`}
          >
            {expanded ? "Less" : "More"}
          </Button>
        )}
        {insight.metrics.length > 0 && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {insight.metrics.slice(0, 4).map((m, i) => (
              <div key={i} className="flex items-center gap-1 text-[11px]">
                <TrendIcon trend={m.trend} />
                <span className="text-muted-foreground truncate">{m.label}:</span>
                <span className="font-medium truncate">{m.value}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AIInsightsBanner({ section, className = "" }: AIInsightsBannerProps) {
  const storageKey = `ai-insights-collapsed-${section}`;
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(storageKey) === "true"; } catch { return false; }
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const insightsQuery = useQuery<InsightsResponse>({
    queryKey: ["/api/ai/insights", section],
    queryFn: async () => {
      const res = await fetch(`/api/ai/insights/${section}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch insights");
      return res.json();
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    enabled: !collapsed,
  });

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/ai/insights/${section}?force=true`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to refresh insights");
      const data = await res.json();
      queryClient.setQueryData(["/api/ai/insights", section], data);
    } catch {
    } finally {
      setIsRefreshing(false);
    }
  }

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(storageKey, String(next)); } catch {}
  }

  const insights = insightsQuery.data?.insights || [];
  const generatedAt = insightsQuery.data?.generatedAt;
  const isFirstLoad = insightsQuery.isLoading && !insightsQuery.data;

  return (
    <div className={`${className}`} data-testid={`ai-banner-${section}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapse}
            className="gap-2 text-sm font-medium px-2"
            data-testid={`btn-toggle-ai-banner-${section}`}
          >
            <Sparkles className="h-4 w-4 text-amber-500" />
            AI Insights
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </Button>
          {!collapsed && generatedAt && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid={`text-ai-banner-time-${section}`}>
              <Clock className="h-3 w-3" />
              {formatTimeAgo(generatedAt)}
            </span>
          )}
        </div>
        {!collapsed && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-7 px-2"
            data-testid={`btn-refresh-ai-banner-${section}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>

      {!collapsed && (
        <div className="overflow-x-auto pb-2">
          {isFirstLoad ? (
            <div className="flex items-center gap-2 py-3 px-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating insights... This may take a moment on first load.
            </div>
          ) : insightsQuery.isError ? (
            <p className="text-xs text-muted-foreground py-2">
              Failed to load insights. Click refresh to try again.
            </p>
          ) : insights.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No insights available. Ensure you have data in this section.
            </p>
          ) : (
            <div className="flex gap-3">
              {insights.map((insight) => (
                <InsightCardItem key={insight.key} insight={insight} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
