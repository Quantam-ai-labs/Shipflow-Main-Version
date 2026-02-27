import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

  const insightsQuery = useQuery<{ insights: InsightCard[] }>({
    queryKey: ["/api/ai/insights", section],
    queryFn: async () => {
      const res = await fetch(`/api/ai/insights/${section}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch insights");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
    enabled: !collapsed,
  });

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(storageKey, String(next)); } catch {}
  }

  const insights = insightsQuery.data?.insights || [];

  return (
    <div className={`${className}`} data-testid={`ai-banner-${section}`}>
      <div className="flex items-center justify-between mb-2">
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
        {!collapsed && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => insightsQuery.refetch()}
            disabled={insightsQuery.isFetching}
            className="h-7 px-2"
            data-testid={`btn-refresh-ai-banner-${section}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${insightsQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>

      {!collapsed && (
        <div className="overflow-x-auto pb-2">
          {insightsQuery.isLoading ? (
            <div className="flex gap-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="min-w-[280px] max-w-[340px] shrink-0">
                  <CardHeader className="pb-2 pt-3 px-4">
                    <Skeleton className="h-3.5 w-3/4" />
                  </CardHeader>
                  <CardContent className="px-4 pb-3 space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </CardContent>
                </Card>
              ))}
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
