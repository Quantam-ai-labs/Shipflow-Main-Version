import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Send,
  Mic,
  MicOff,
  Sparkles,
  Loader2,
  AlertTriangle,
  AlertCircle,
  Info,
  Clock,
  Globe,
  Plus,
  MessageSquare,
  BarChart3,
  RefreshCw,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Truck,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  User,
  Bot,
  Trash2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface InsightMetric {
  label: string;
  value: string;
  trend?: "up" | "down" | "stable";
}

interface AlertCard {
  key: string;
  title: string;
  category: string;
  summary: string;
  severity?: "critical" | "warning" | "info";
  metrics: InsightMetric[];
}

interface MarketingInsight {
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
  timestamp: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "magic-ai-sessions";
const MAX_SESSIONS = 50;

function loadSessions(): ChatSession[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveSessions(sessions: ChatSession[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
}

function newSession(): ChatSession {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), title: "New conversation", messages: [], createdAt: now, updatedAt: now };
}

function groupSessionsByDate(sessions: ChatSession[]) {
  const now = new Date();
  const todayStr = now.toDateString();
  const yestDate = new Date(now); yestDate.setDate(yestDate.getDate() - 1);
  const yestStr = yestDate.toDateString();
  const groups: { label: string; sessions: ChatSession[] }[] = [];
  const today: ChatSession[] = [], yesterday: ChatSession[] = [], older: ChatSession[] = [];
  for (const s of sessions) {
    const d = new Date(s.updatedAt).toDateString();
    if (d === todayStr) today.push(s);
    else if (d === yestStr) yesterday.push(s);
    else older.push(s);
  }
  if (today.length) groups.push({ label: "Today", sessions: today });
  if (yesterday.length) groups.push({ label: "Yesterday", sessions: yesterday });
  if (older.length) groups.push({ label: "Older", sessions: older });
  return groups;
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertTriangle, bar: "bg-destructive", dot: "bg-destructive" },
  warning:  { icon: AlertCircle,   bar: "bg-muted-foreground", dot: "bg-muted-foreground" },
  info:     { icon: Info,          bar: "bg-primary", dot: "bg-primary" },
};

const CATEGORY_CONFIG: Record<string, { icon: typeof Bot; color: string }> = {
  campaigns:  { icon: Target,   color: "text-muted-foreground" },
  operations: { icon: Truck,    color: "text-muted-foreground" },
  strategy:   { icon: Lightbulb, color: "text-muted-foreground" },
};

const SUGGESTED_EN = [
  "How many orders stuck in pending >3 days?",
  "Return rate this week vs last week?",
  "Best performing courier by delivery rate",
  "Top 5 cities by revenue",
  "COD pending collection amount",
];

const SUGGESTED_UR = [
  "کتنے آرڈرز 3 دن سے پینڈنگ ہیں؟",
  "اس ہفتے کی واپسی کی شرح کیا ہے؟",
  "بہترین کورئیر سروس کون سی ہے؟",
  "ریونیو کے لحاظ سے ٹاپ 5 شہر",
  "ابھی تک وصول نہیں ہوا COD",
];

function formatMsg(content: string) {
  return content.split("\n").map((line, i) => {
    if (line.startsWith("### ")) return <h3 key={i} className="font-bold text-sm mt-3 mb-1 text-foreground">{line.slice(4)}</h3>;
    if (line.startsWith("## "))  return <h2 key={i} className="font-bold text-base mt-3 mb-1 text-foreground">{line.slice(3)}</h2>;
    if (line.startsWith("- **") || line.startsWith("* **")) {
      const parts = line.replace(/^[-*]\s+/, "").split("**");
      return <li key={i} className="ml-4 text-sm leading-relaxed list-disc">{parts.map((p, j) => j % 2 === 1 ? <strong key={j} className="text-foreground font-semibold">{p}</strong> : p)}</li>;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="ml-4 text-sm leading-relaxed list-disc">{line.slice(2)}</li>;
    if (line.match(/^\d+\.\s/)) return <li key={i} className="ml-4 text-sm leading-relaxed list-decimal">{line.replace(/^\d+\.\s+/, "")}</li>;
    if (line.trim() === "") return <br key={i} />;
    const bold = line.split("**").map((p, j) => j % 2 === 1 ? <strong key={j} className="text-foreground font-semibold">{p}</strong> : p);
    return <p key={i} className="text-sm leading-relaxed">{bold}</p>;
  });
}

function TrendIcon({ trend }: { trend?: string }) {
  if (trend === "up")   return <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />;
  if (trend === "down") return <TrendingDown className="h-3 w-3 text-red-400 shrink-0" />;
  return <Minus className="h-3 w-3 text-muted-foreground shrink-0" />;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function MagicAI() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions());
  const [activeId, setActiveId] = useState<string>(() => {
    const saved = loadSessions();
    return saved.length > 0 ? saved[0].id : newSession().id;
  });
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<"en" | "ur">("en");
  const [isListening, setIsListening] = useState(false);
  const [rightTab, setRightTab] = useState<"alerts" | "insights">("alerts");
  const [showStrategy, setShowStrategy] = useState(false);
  const [expandedInsights, setExpandedInsights] = useState<Set<string>>(new Set());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const saved = loadSessions();
    if (saved.length === 0) {
      const s = newSession();
      setSessions([s]);
      setActiveId(s.id);
      saveSessions([s]);
    } else {
      setSessions(saved);
      setActiveId(saved[0].id);
    }
  }, []);

  const activeSession = sessions.find(s => s.id === activeId) ?? sessions[0];
  const messages = activeSession?.messages ?? [];

  function updateSession(id: string, messages: ChatMessage[]) {
    setSessions(prev => {
      const updated = prev.map(s => s.id === id
        ? { ...s, messages, updatedAt: new Date().toISOString(), title: messages.find(m => m.role === "user")?.content.slice(0, 38) || s.title }
        : s
      ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      saveSessions(updated);
      return updated;
    });
  }

  function handleNewChat() {
    const s = newSession();
    setSessions(prev => {
      const updated = [s, ...prev];
      saveSessions(updated);
      return updated;
    });
    setActiveId(s.id);
    setInput("");
  }

  function handleDeleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id);
      saveSessions(updated);
      if (activeId === id) {
        if (updated.length > 0) setActiveId(updated[0].id);
        else { const s = newSession(); saveSessions([s]); setSessions([s]); setActiveId(s.id); }
      }
      return updated;
    });
  }

  const alertsQuery = useQuery<{ insights: AlertCard[]; generatedAt?: string }>({
    queryKey: ["/api/ai/insights", "dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/ai/insights/dashboard", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: Infinity,
    retry: 1,
  });

  const insightsQuery = useQuery<{ insights: MarketingInsight[] }>({
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
      const res = await apiRequest("POST", "/api/ai/chat", { question, language });
      return res.json();
    },
    onSuccess: (data: { answer: string }) => {
      const msg: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: data.answer, timestamp: new Date().toISOString() };
      const updated = [...messages, msg];
      updateSession(activeId, updated);
    },
    onError: () => {
      const msg: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: language === "ur" ? "معذرت، خرابی ہوئی۔ دوبارہ کوشش کریں۔" : "Sorry, I encountered an error. Please try again.", timestamp: new Date().toISOString() };
      updateSession(activeId, [...messages, msg]);
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMutation.isPending]);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = language === "ur" ? "ur-PK" : "en-US";
    r.interimResults = true;
    r.onresult = (e: any) => setInput(Array.from(e.results).map((x: any) => x[0].transcript).join(""));
    r.onend = () => setIsListening(false);
    r.onerror = () => setIsListening(false);
    recognitionRef.current = r;
    r.start();
    setIsListening(true);
  }, [language]);

  const stopListening = useCallback(() => { recognitionRef.current?.stop(); setIsListening(false); }, []);

  function handleSend() {
    const q = input.trim();
    if (!q || chatMutation.isPending) return;
    const msg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: q, timestamp: new Date().toISOString() };
    updateSession(activeId, [...messages, msg]);
    setInput("");
    chatMutation.mutate(q);
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleSuggested(q: string) { setInput(q); inputRef.current?.focus(); }

  const hasSpeech = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const alerts = [...(alertsQuery.data?.insights || [])].sort((a, b) => ({ critical: 0, warning: 1, info: 2 }[a.severity || "info"] ?? 2) - ({ critical: 0, warning: 1, info: 2 }[b.severity || "info"] ?? 2));
  const marketingInsights = insightsQuery.data?.insights || [];
  const suggested = language === "ur" ? SUGGESTED_UR : SUGGESTED_EN;
  const sessionGroups = groupSessionsByDate(sessions);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden border border-border bg-background" data-testid="page-magic-ai">

      {/* ── LEFT: Chat History Panel ── */}
      <div className="w-60 flex-shrink-0 flex flex-col bg-[#0d1322] border-r border-white/[0.08]">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm text-foreground">
              Magic AI
            </span>
          </div>
          <Button
            onClick={handleNewChat}
            size="sm"
            className="w-full gap-1.5"
            data-testid="btn-new-chat"
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {sessionGroups.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center mt-6 px-3">No conversations yet</p>
          ) : (
            sessionGroups.map(group => (
              <div key={group.label}>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest px-3 pt-3 pb-1">{group.label}</p>
                {group.sessions.map(s => (
                  <div
                    key={s.id}
                    className={[
                      "w-full group flex items-start gap-2 transition-colors",
                      s.id === activeId
                        ? "bg-accent border-l-2 border-primary"
                        : "hover-elevate border-l-2 border-transparent",
                    ].join(" ")}
                    data-testid={`session-${s.id}`}
                  >
                    <button
                      onClick={() => setActiveId(s.id)}
                      className="flex-1 text-left px-3 py-2 flex items-start gap-2 min-w-0"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] text-foreground truncate leading-tight">{s.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(s.updatedAt)}</p>
                      </div>
                    </button>
                    <button
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      className="invisible group-hover:visible text-muted-foreground hover:text-destructive transition-colors shrink-0 pr-2 pt-2"
                      data-testid={`delete-session-${s.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── CENTER: Chat Area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-white/[0.08] bg-[#0d1322]">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              {activeSession?.title ?? "New conversation"}
            </span>
            {messages.length > 0 && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                {messages.length} msgs
              </Badge>
            )}
          </div>
          <Select value={language} onValueChange={(v) => setLanguage(v as "en" | "ur")}>
            <SelectTrigger className="w-[110px] text-xs" data-testid="trigger-language">
              <Globe className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ur">اردو</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" data-testid="chat-messages">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-border flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  {language === "ur" ? "کچھ بھی پوچھیں" : "Ask me anything"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {language === "ur" ? "آرڈرز، شپمنٹس، ریونیو اور مزید" : "Orders, shipments, revenue, campaigns — all your business data"}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-md">
                {suggested.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggested(q)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted/50 text-muted-foreground hover-elevate transition-colors"
                    data-testid={`suggested-${i}`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              data-testid={`msg-${msg.role}`}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
              )}
              <div className={[
                "max-w-[78%] rounded-2xl px-4 py-3 text-sm",
                msg.role === "user"
                  ? "bg-blue-500/15 border border-blue-500/30 text-white/90 rounded-tr-sm"
                  : "bg-[#0d1322] border border-white/[0.08] text-white/80 rounded-tl-sm",
              ].join(" ")}>
                {msg.role === "user"
                  ? <p>{msg.content}</p>
                  : <div className="space-y-0.5 text-secondary-foreground">{formatMsg(msg.content)}</div>
                }
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-md bg-muted border border-border flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}

          {chatMutation.isPending && (
            <div className="flex gap-3 justify-start" data-testid="typing-indicator">
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <div className="bg-[#0d1322] border border-white/[0.08] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="border-t border-white/[0.08] p-3 bg-[#0d1322]" data-testid="chat-input-area">
          <div className="flex gap-2 items-end">
            {hasSpeech && (
              <Button
                variant="ghost"
                size="icon"
                className={isListening ? "shrink-0 text-destructive" : "shrink-0 text-muted-foreground"}
                onClick={isListening ? stopListening : startListening}
                data-testid="btn-voice"
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}
            <Textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={language === "ur" ? "اپنا سوال یہاں لکھیں..." : "Ask about your orders, revenue, campaigns..."}
              className="flex-1 min-h-[40px] max-h-[120px] resize-none text-sm rounded-xl"
              rows={1}
              disabled={chatMutation.isPending}
              data-testid="input-chat"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || chatMutation.isPending}
              size="icon"
              className="shrink-0"
              data-testid="btn-send"
            >
              {chatMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>

      {/* ── RIGHT: Insights Panel ── */}
      <div className="w-72 flex-shrink-0 flex flex-col bg-[#0d1322] border-l border-white/[0.08]">
        <div className="flex border-b border-white/[0.08]">
          <button
            onClick={() => setRightTab("alerts")}
            className={[
              "flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors",
              rightTab === "alerts" ? "text-white/90 border-b-2 border-blue-500 bg-white/[0.04]" : "text-white/40 hover:text-white/60",
            ].join(" ")}
            data-testid="tab-alerts"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Alerts
            {alerts.length > 0 && (
              <span className="bg-red-500/20 text-red-400 text-[9px] rounded-full w-4 h-4 flex items-center justify-center border border-red-500/30">{alerts.length}</span>
            )}
          </button>
          <button
            onClick={() => setRightTab("insights")}
            className={[
              "flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors",
              rightTab === "insights" ? "text-white/90 border-b-2 border-blue-500 bg-white/[0.04]" : "text-white/40 hover:text-white/60",
            ].join(" ")}
            data-testid="tab-insights"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Insights
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {rightTab === "alerts" && (
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Critical Alerts</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => alertsQuery.refetch()}
                  disabled={alertsQuery.isFetching}
                  data-testid="btn-refresh-alerts"
                >
                  <RefreshCw className={`w-3 h-3 ${alertsQuery.isFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>
              {alertsQuery.data?.generatedAt && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {timeAgo(alertsQuery.data.generatedAt)}
                </p>
              )}
              {alertsQuery.isLoading && [1,2,3].map(i => (
                <div key={i} className="h-14 rounded-md bg-muted animate-pulse" />
              ))}
              {!alertsQuery.isLoading && alerts.length === 0 && (
                <div className="text-center py-8">
                  <Sparkles className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No active alerts</p>
                </div>
              )}
              {alerts.map(alert => {
                const sev = alert.severity || "info";
                const cfg = SEVERITY_CONFIG[sev];
                const Icon = cfg.icon;
                return (
                  <div key={alert.key} className="rounded-md bg-white/[0.03] border border-white/[0.08] overflow-visible" data-testid={`alert-${alert.key}`}>
                    <div className={`h-0.5 ${cfg.bar} rounded-t-md`} />
                    <div className="p-2.5">
                      <div className="flex items-start gap-2">
                        <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${sev === "critical" ? "text-destructive" : "text-muted-foreground"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-foreground leading-tight">{alert.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{alert.summary}</p>
                          {alert.metrics.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {alert.metrics.slice(0, 2).map((m, i) => (
                                <div key={i} className="flex items-center gap-1 text-[10px]">
                                  <span className="text-muted-foreground">{m.label}:</span>
                                  <span className="text-foreground font-medium">{m.value}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {rightTab === "insights" && (
            <div className="p-3 space-y-2">
              <button
                onClick={() => setShowStrategy(s => !s)}
                className="w-full flex items-center gap-2 p-2.5 rounded-md bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-all text-left"
                data-testid="btn-weekly-strategy"
              >
                <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-xs text-foreground font-medium">Weekly Strategy</span>
                {showStrategy ? <ChevronUp className="w-3 h-3 text-muted-foreground ml-auto" /> : <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto" />}
              </button>

              {showStrategy && (
                <div className="rounded-md bg-white/[0.03] border border-white/[0.08] p-3">
                  {strategyQuery.isLoading ? (
                    <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-2.5 rounded bg-muted animate-pulse" />)}</div>
                  ) : strategyQuery.data ? (
                    <div className="text-[11px] text-secondary-foreground leading-relaxed space-y-1">{formatMsg(strategyQuery.data.strategy)}</div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Loading strategy...</p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between gap-1 pt-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Marketing Insights</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => insightsQuery.refetch()}
                  disabled={insightsQuery.isFetching}
                  data-testid="btn-refresh-insights"
                >
                  <RefreshCw className={`w-3 h-3 ${insightsQuery.isFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>

              {insightsQuery.isLoading && [1,2,3].map(i => (
                <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
              ))}
              {!insightsQuery.isLoading && marketingInsights.length === 0 && (
                <div className="text-center py-8">
                  <BarChart3 className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Sync marketing data to see insights</p>
                </div>
              )}
              {marketingInsights.map(insight => {
                const cfg = CATEGORY_CONFIG[insight.category] || CATEGORY_CONFIG.campaigns;
                const Icon = cfg.icon;
                const expanded = expandedInsights.has(insight.key);
                return (
                  <div key={insight.key} className="rounded-md bg-white/[0.03] border border-white/[0.08] p-2.5" data-testid={`insight-${insight.key}`}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Icon className={`w-3 h-3 shrink-0 ${cfg.color}`} />
                      <p className="text-[11px] font-semibold text-foreground flex-1 min-w-0 leading-tight">{insight.title}</p>
                    </div>
                    <p className={`text-[10.5px] text-muted-foreground leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>{insight.summary}</p>
                    {insight.summary.length > 100 && (
                      <button
                        onClick={() => setExpandedInsights(prev => { const s = new Set(prev); expanded ? s.delete(insight.key) : s.add(insight.key); return s; })}
                        className="text-[10px] text-muted-foreground hover:text-foreground mt-0.5 flex items-center gap-0.5"
                      >
                        {expanded ? <><ChevronUp className="w-2.5 h-2.5" />Less</> : <><ChevronDown className="w-2.5 h-2.5" />More</>}
                      </button>
                    )}
                    {insight.metrics.length > 0 && (
                      <div className="mt-1.5 grid grid-cols-2 gap-1">
                        {insight.metrics.slice(0, 4).map((m, i) => (
                          <div key={i} className="flex items-center gap-1 text-[10px]">
                            <TrendIcon trend={m.trend} />
                            <span className="text-muted-foreground truncate">{m.label}:</span>
                            <span className="text-foreground font-medium shrink-0">{m.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
