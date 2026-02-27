import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain,
  Send,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Sparkles,
  Target,
  BarChart3,
  Truck,
  Lightbulb,
  Bot,
  User,
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
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

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  data?: any[];
  timestamp: Date;
}

const CATEGORY_CONFIG: Record<string, { icon: typeof Brain; color: string; label: string }> = {
  campaigns: { icon: Target, color: "text-blue-500", label: "Campaigns" },
  operations: { icon: Truck, color: "text-green-500", label: "Operations" },
  strategy: { icon: Lightbulb, color: "text-amber-500", label: "Strategy" },
};

const SUGGESTED_QUESTIONS = [
  "What's my return rate this week vs last week?",
  "Which campaigns are losing money?",
  "Top 5 cities by delivery success rate",
  "What's my average CPA across all campaigns?",
  "Show me daily order trends for the last 2 weeks",
  "Which products have the highest return rate?",
];

function TrendIcon({ trend }: { trend?: "up" | "down" | "stable" }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function InsightCardComponent({ insight }: { insight: InsightCard }) {
  const [expanded, setExpanded] = useState(false);
  const config = CATEGORY_CONFIG[insight.category] || CATEGORY_CONFIG.campaigns;
  const Icon = config.icon;

  return (
    <Card className="hover:shadow-md transition-shadow" data-testid={`insight-card-${insight.key}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className={`h-4 w-4 shrink-0 ${config.color}`} />
            <CardTitle className="text-sm font-semibold truncate">{insight.title}</CardTitle>
          </div>
          <Badge variant="secondary" className="text-[10px] shrink-0">{config.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className={`text-xs text-muted-foreground leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>
          {insight.summary}
        </p>
        {insight.summary.length > 150 && (
          <Button
            variant="link"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-xs p-0 h-auto"
            data-testid={`toggle-insight-${insight.key}`}
          >
            {expanded ? <><ChevronUp className="h-3 w-3 mr-1" /> Less</> : <><ChevronDown className="h-3 w-3 mr-1" /> More</>}
          </Button>
        )}
        {insight.metrics.length > 0 && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            {insight.metrics.map((m, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <TrendIcon trend={m.trend} />
                <span className="text-muted-foreground truncate">{m.label}:</span>
                <span className="font-medium">{m.value}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatAIMessage(content: string) {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("### ")) {
      return <h3 key={i} className="font-bold text-sm mt-3 mb-1">{line.replace("### ", "")}</h3>;
    }
    if (line.startsWith("## ")) {
      return <h2 key={i} className="font-bold text-base mt-3 mb-1">{line.replace("## ", "")}</h2>;
    }
    if (line.startsWith("- **") || line.startsWith("* **")) {
      const parts = line.replace(/^[-*]\s+/, "").split("**");
      return (
        <li key={i} className="ml-4 text-sm leading-relaxed">
          {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
        </li>
      );
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return <li key={i} className="ml-4 text-sm leading-relaxed">{line.replace(/^[-*]\s+/, "")}</li>;
    }
    if (line.match(/^\d+\.\s/)) {
      return <li key={i} className="ml-4 text-sm leading-relaxed list-decimal">{line.replace(/^\d+\.\s+/, "")}</li>;
    }
    if (line.trim() === "") return <br key={i} />;
    const boldFormatted = line.split("**").map((part, j) =>
      j % 2 === 1 ? <strong key={j}>{part}</strong> : part
    );
    return <p key={i} className="text-sm leading-relaxed">{boldFormatted}</p>;
  });
}

export default function AIInsights() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [showStrategy, setShowStrategy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const insightsQuery = useQuery<{ insights: InsightCard[] }>({
    queryKey: ["/api/marketing/ai/insights"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const strategyQuery = useQuery<{ strategy: string }>({
    queryKey: ["/api/marketing/ai/strategy"],
    enabled: showStrategy,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const chatMutation = useMutation({
    mutationFn: async (question: string) => {
      const res = await apiRequest("POST", "/api/marketing/ai/chat", { question });
      return res.json();
    },
    onSuccess: (data: { answer: string; data?: any[] }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.answer,
          data: data.data,
          timestamp: new Date(),
        },
      ]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Sorry, I encountered an error processing your question. Please try again.",
          timestamp: new Date(),
        },
      ]);
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMutation.isPending]);

  function handleSend() {
    const question = input.trim();
    if (!question || chatMutation.isPending) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: question, timestamp: new Date() },
    ]);
    setInput("");
    chatMutation.mutate(question);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSuggestedQuestion(q: string) {
    setInput(q);
    inputRef.current?.focus();
  }

  const insights = insightsQuery.data?.insights || [];

  return (
    <div className="space-y-6" data-testid="page-ai-insights">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-ai-intelligence">
            <Brain className="h-6 w-6 text-primary" />
            AI Marketing Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered insights and strategy recommendations based on your real data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowStrategy(!showStrategy)}
            data-testid="btn-toggle-strategy"
          >
            <Zap className="h-4 w-4 mr-1" />
            {showStrategy ? "Hide Strategy" : "Weekly Strategy"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => insightsQuery.refetch()}
            disabled={insightsQuery.isFetching}
            data-testid="btn-refresh-insights"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${insightsQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {showStrategy && (
        <Card className="border-primary/20 bg-primary/5" data-testid="card-strategy">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Weekly Strategy Brief
            </CardTitle>
          </CardHeader>
          <CardContent>
            {strategyQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/6" />
              </div>
            ) : strategyQuery.data ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {formatAIMessage(strategyQuery.data.strategy)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Click to load your weekly strategy.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Auto-Generated Insights
        </h2>
        {insightsQuery.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-3/4" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-4/6" />
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : insightsQuery.isError ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>Failed to load insights. Click Refresh to try again.</p>
            </CardContent>
          </Card>
        ) : insights.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>No insights available yet. Make sure you have synced your marketing data.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {insights.map((insight) => (
              <InsightCardComponent key={insight.key} insight={insight} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-500" />
          Ask AI About Your Data
        </h2>

        <Card data-testid="card-chat">
          <CardContent className="p-0">
            <div className="h-[400px] overflow-y-auto p-4 space-y-4" data-testid="chat-messages">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Ask me anything about your business</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      I can analyze your orders, campaigns, shipments, and more
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                    {SUGGESTED_QUESTIONS.map((q, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        size="sm"
                        onClick={() => handleSuggestedQuestion(q)}
                        className="text-xs rounded-full h-auto py-1.5 px-3"
                        data-testid={`suggested-question-${i}`}
                      >
                        {q}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  data-testid={`chat-message-${msg.role}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <p className="text-sm">{msg.content}</p>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        {formatAIMessage(msg.content)}
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-7 h-7 rounded-full bg-foreground/10 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}

              {chatMutation.isPending && (
                <div className="flex gap-3 justify-start" data-testid="chat-loading">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-muted rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing your data...
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            <div className="border-t p-3 flex gap-2" data-testid="chat-input-area">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your orders, campaigns, shipments..."
                className="min-h-[44px] max-h-[120px] resize-none"
                rows={1}
                disabled={chatMutation.isPending}
                data-testid="input-chat-question"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || chatMutation.isPending}
                size="icon"
                className="shrink-0"
                data-testid="btn-send-chat"
              >
                {chatMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
