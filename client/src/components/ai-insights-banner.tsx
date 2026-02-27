import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Brain,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertTriangle,
  AlertCircle,
  Info,
  TrendingUp,
  TrendingDown,
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
  severity?: "critical" | "warning" | "info";
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

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    borderColor: "border-l-red-500",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    iconColor: "text-red-500",
  },
  warning: {
    icon: AlertCircle,
    borderColor: "border-l-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-950/20",
    iconColor: "text-amber-500",
  },
  info: {
    icon: Info,
    borderColor: "border-l-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
    iconColor: "text-blue-500",
  },
};

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

function InsightAlertRow({ insight }: { insight: InsightCard }) {
  const severity = insight.severity || "info";
  const config = SEVERITY_CONFIG[severity];
  const Icon = config.icon;

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${config.borderColor} ${config.bgColor} transition-all`}
      data-testid={`banner-insight-${insight.key}`}
    >
      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${config.iconColor}`} />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-foreground">{insight.title}</span>
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{insight.summary}</p>
      </div>
      {insight.metrics.length > 0 && (
        <div className="flex items-center gap-3 shrink-0">
          {insight.metrics.slice(0, 2).map((m, i) => (
            <div key={i} className="flex items-center gap-1 text-[11px]">
              {m.trend === "up" && <TrendingUp className="h-3 w-3 text-green-500" />}
              {m.trend === "down" && <TrendingDown className="h-3 w-3 text-red-500" />}
              <span className="text-muted-foreground">{m.label}:</span>
              <span className="font-semibold">{m.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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

  const sortedInsights = [...insights].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return (order[a.severity || "info"] || 2) - (order[b.severity || "info"] || 2);
  });

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
        <div>
          {isFirstLoad ? (
            <div className="flex items-center gap-2 py-3 px-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating insights... This may take a moment on first load.
            </div>
          ) : insightsQuery.isError ? (
            <p className="text-xs text-muted-foreground py-2">
              Failed to load insights. Click refresh to try again.
            </p>
          ) : sortedInsights.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No insights available. Ensure you have data in this section.
            </p>
          ) : (
            <div className="space-y-2">
              {sortedInsights.map((insight) => (
                <InsightAlertRow key={insight.key} insight={insight} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
