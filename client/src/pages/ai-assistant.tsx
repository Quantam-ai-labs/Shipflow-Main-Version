import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  critical: { icon: AlertTriangle, bar: "bg-red-500", badge: "bg-red-500/20 text-red-400 border-red-500/30", dot: "bg-red-500" },
  warning:  { icon: AlertCircle,   bar: "bg-amber-500", badge: "bg-amber-500/20 text-amber-400 border-amber-500/30", dot: "bg-amber-500" },
  info:     { icon: Info,          bar: "bg-blue-500",  badge: "bg-blue-500/20 text-blue-400 border-blue-500/30",  dot: "bg-blue-500" },
};

const CATEGORY_CONFIG: Record<string, { icon: typeof Bot; color: string }> = {
  campaigns:  { icon: Target,   color: "text-blue-400" },
  operations: { icon: Truck,    color: "text-green-400" },
  strategy:   { icon: Lightbulb, color: "text-amber-400" },
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
    if (line.startsWith("### ")) return <h3 key={i} className="font-bold text-sm mt-3 mb-1 text-violet-300">{line.slice(4)}</h3>;
    if (line.startsWith("## "))  return <h2 key={i} className="font-bold text-base mt-3 mb-1 text-violet-200">{line.slice(3)}</h2>;
    if (line.startsWith("- **") || line.startsWith("* **")) {
      const parts = line.replace(/^[-*]\s+/, "").split("**");
      return <li key={i} className="ml-4 text-sm leading-relaxed list-disc">{parts.map((p, j) => j % 2 === 1 ? <strong key={j} className="text-violet-200">{p}</strong> : p)}</li>;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="ml-4 text-sm leading-relaxed list-disc">{line.slice(2)}</li>;
    if (line.match(/^\d+\.\s/)) return <li key={i} className="ml-4 text-sm leading-relaxed list-decimal">{line.replace(/^\d+\.\s+/, "")}</li>;
    if (line.trim() === "") return <br key={i} />;
    const bold = line.split("**").map((p, j) => j % 2 === 1 ? <strong key={j} className="text-violet-200">{p}</strong> : p);
    return <p key={i} className="text-sm leading-relaxed">{bold}</p>;
  });
}

function TrendIcon({ trend }: { trend?: string }) {
  if (trend === "up")   return <TrendingUp className="h-3 w-3 text-green-400 shrink-0" />;
  if (trend === "down") return <TrendingDown className="h-3 w-3 text-red-400 shrink-0" />;
  return <Minus className="h-3 w-3 text-violet-400 shrink-0" />;
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
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-xl border border-violet-900/40 bg-[#07050f]" data-testid="page-magic-ai">

      {/* ── LEFT: Chat History Panel ── */}
      <div className="w-60 flex-shrink-0 flex flex-col bg-[#0f0a1e] border-r border-violet-900/40">
        {/* Header */}
        <div className="p-3 border-b border-violet-900/40">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-extrabold text-sm bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400 bg-clip-text text-transparent tracking-tight">
              Magic AI
            </span>
          </div>
          <Button
            onClick={handleNewChat}
            size="sm"
            className="w-full bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg gap-1.5"
            data-testid="btn-new-chat"
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </Button>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto py-2 scrollbar-none">
          {sessionGroups.length === 0 ? (
            <p className="text-[11px] text-violet-500 text-center mt-6 px-3">No conversations yet</p>
          ) : (
            sessionGroups.map(group => (
              <div key={group.label}>
                <p className="text-[10px] font-semibold text-violet-500/70 uppercase tracking-widest px-3 pt-3 pb-1">{group.label}</p>
                {group.sessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setActiveId(s.id)}
                    className={[
                      "w-full text-left px-3 py-2 group flex items-start gap-2 transition-colors rounded-none",
                      s.id === activeId
                        ? "bg-violet-600/20 border-l-2 border-violet-500"
                        : "hover:bg-violet-900/20 border-l-2 border-transparent",
                    ].join(" ")}
                    data-testid={`session-${s.id}`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11.5px] text-violet-100 truncate leading-tight">{s.title}</p>
                      <p className="text-[10px] text-violet-500 mt-0.5">{timeAgo(s.updatedAt)}</p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-violet-500 hover:text-red-400 transition-opacity shrink-0"
                      data-testid={`delete-session-${s.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── CENTER: Chat Area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-violet-900/30 bg-[#0b0818]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold text-violet-100">
              {activeSession?.title ?? "New conversation"}
            </span>
            {messages.length > 0 && (
              <Badge className="text-[9px] bg-violet-600/30 text-violet-300 border-violet-600/40 px-1.5 py-0">
                {messages.length} msgs
              </Badge>
            )}
          </div>
          <Select value={language} onValueChange={(v) => setLanguage(v as "en" | "ur")}>
            <SelectTrigger className="h-7 w-[110px] bg-violet-900/30 border-violet-700/40 text-violet-200 text-xs" data-testid="trigger-language">
              <Globe className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ur">اردو</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" data-testid="chat-messages">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/30 to-indigo-600/30 border border-violet-500/30 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-violet-400" />
              </div>
              <div>
                <p className="font-semibold text-violet-100">
                  {language === "ur" ? "کچھ بھی پوچھیں" : "Ask me anything"}
                </p>
                <p className="text-xs text-violet-400 mt-1">
                  {language === "ur" ? "آرڈرز، شپمنٹس، ریونیو اور مزید" : "Orders, shipments, revenue, campaigns — all your business data"}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-md">
                {suggested.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggested(q)}
                    className="text-xs px-3 py-1.5 rounded-full border border-violet-700/50 bg-violet-900/20 text-violet-300 hover:bg-violet-700/30 hover:text-violet-100 transition-colors"
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
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <div className={[
                "max-w-[78%] rounded-2xl px-4 py-3 text-sm",
                msg.role === "user"
                  ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-tr-sm"
                  : "bg-[#1a1030] border border-violet-900/40 text-violet-100 rounded-tl-sm",
              ].join(" ")}>
                {msg.role === "user"
                  ? <p>{msg.content}</p>
                  : <div className="space-y-0.5">{formatMsg(msg.content)}</div>
                }
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-lg bg-violet-800/40 border border-violet-700/30 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-violet-300" />
                </div>
              )}
            </div>
          ))}

          {chatMutation.isPending && (
            <div className="flex gap-3 justify-start" data-testid="typing-indicator">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-[#1a1030] border border-violet-900/40 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
                <span className="text-xs text-violet-400">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="border-t border-violet-900/30 p-3 bg-[#0b0818]" data-testid="chat-input-area">
          <div className="flex gap-2 items-end">
            {hasSpeech && (
              <Button
                variant="ghost"
                size="icon"
                className={`h-9 w-9 shrink-0 rounded-lg ${isListening ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "text-violet-400 hover:bg-violet-800/40"}`}
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
              className="flex-1 min-h-[40px] max-h-[120px] resize-none bg-[#1a1030] border-violet-800/40 text-violet-100 placeholder:text-violet-500 text-sm rounded-xl focus-visible:ring-violet-500/50"
              rows={1}
              disabled={chatMutation.isPending}
              data-testid="input-chat"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || chatMutation.isPending}
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40"
              data-testid="btn-send"
            >
              {chatMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-violet-600 mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>

      {/* ── RIGHT: Insights Panel ── */}
      <div className="w-72 flex-shrink-0 flex flex-col bg-[#0d0a1a] border-l border-violet-900/40">
        {/* Panel tabs */}
        <div className="flex border-b border-violet-900/40">
          <button
            onClick={() => setRightTab("alerts")}
            className={[
              "flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors",
              rightTab === "alerts" ? "text-violet-300 border-b-2 border-violet-500 bg-violet-900/20" : "text-violet-500 hover:text-violet-300",
            ].join(" ")}
            data-testid="tab-alerts"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Alerts
            {alerts.length > 0 && (
              <span className="bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">{alerts.length}</span>
            )}
          </button>
          <button
            onClick={() => setRightTab("insights")}
            className={[
              "flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors",
              rightTab === "insights" ? "text-violet-300 border-b-2 border-violet-500 bg-violet-900/20" : "text-violet-500 hover:text-violet-300",
            ].join(" ")}
            data-testid="tab-insights"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Insights
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-none">

          {/* ── ALERTS TAB ── */}
          {rightTab === "alerts" && (
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-violet-500 uppercase tracking-widest font-semibold">Critical Alerts</span>
                <button
                  onClick={() => alertsQuery.refetch()}
                  disabled={alertsQuery.isFetching}
                  className="text-violet-500 hover:text-violet-300 transition-colors"
                  data-testid="btn-refresh-alerts"
                >
                  <RefreshCw className={`w-3 h-3 ${alertsQuery.isFetching ? "animate-spin" : ""}`} />
                </button>
              </div>
              {alertsQuery.data?.generatedAt && (
                <p className="text-[10px] text-violet-600 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {timeAgo(alertsQuery.data.generatedAt)}
                </p>
              )}
              {alertsQuery.isLoading && [1,2,3].map(i => (
                <div key={i} className="h-14 rounded-lg bg-violet-900/20 animate-pulse" />
              ))}
              {!alertsQuery.isLoading && alerts.length === 0 && (
                <div className="text-center py-8">
                  <Sparkles className="w-6 h-6 text-violet-600 mx-auto mb-2" />
                  <p className="text-xs text-violet-500">No active alerts</p>
                </div>
              )}
              {alerts.map(alert => {
                const sev = alert.severity || "info";
                const cfg = SEVERITY_CONFIG[sev];
                const Icon = cfg.icon;
                return (
                  <div key={alert.key} className="rounded-lg bg-[#1a1030] border border-violet-900/30 overflow-hidden" data-testid={`alert-${alert.key}`}>
                    <div className={`h-0.5 ${cfg.bar}`} />
                    <div className="p-2.5">
                      <div className="flex items-start gap-2">
                        <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${sev === "critical" ? "text-red-400" : sev === "warning" ? "text-amber-400" : "text-blue-400"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-violet-100 leading-tight">{alert.title}</p>
                          <p className="text-[10px] text-violet-400 mt-0.5 leading-relaxed">{alert.summary}</p>
                          {alert.metrics.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {alert.metrics.slice(0, 2).map((m, i) => (
                                <div key={i} className="flex items-center gap-1 text-[10px]">
                                  <span className="text-violet-500">{m.label}:</span>
                                  <span className="text-violet-200 font-medium">{m.value}</span>
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

          {/* ── INSIGHTS TAB ── */}
          {rightTab === "insights" && (
            <div className="p-3 space-y-2">
              {/* Weekly Strategy */}
              <button
                onClick={() => setShowStrategy(s => !s)}
                className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-gradient-to-r from-violet-900/40 to-indigo-900/40 border border-violet-700/30 hover:border-violet-600/50 transition-all text-left"
                data-testid="btn-weekly-strategy"
              >
                <Zap className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="text-xs text-violet-200 font-medium">Weekly Strategy</span>
                {showStrategy ? <ChevronUp className="w-3 h-3 text-violet-500 ml-auto" /> : <ChevronDown className="w-3 h-3 text-violet-500 ml-auto" />}
              </button>

              {showStrategy && (
                <div className="rounded-lg bg-[#1a1030] border border-violet-900/30 p-3">
                  {strategyQuery.isLoading ? (
                    <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-2.5 rounded bg-violet-900/40 animate-pulse" />)}</div>
                  ) : strategyQuery.data ? (
                    <div className="text-[11px] text-violet-300 leading-relaxed space-y-1">{formatMsg(strategyQuery.data.strategy)}</div>
                  ) : (
                    <p className="text-[11px] text-violet-500">Loading strategy...</p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-violet-500 uppercase tracking-widest font-semibold">Marketing Insights</span>
                <button
                  onClick={() => insightsQuery.refetch()}
                  disabled={insightsQuery.isFetching}
                  className="text-violet-500 hover:text-violet-300 transition-colors"
                  data-testid="btn-refresh-insights"
                >
                  <RefreshCw className={`w-3 h-3 ${insightsQuery.isFetching ? "animate-spin" : ""}`} />
                </button>
              </div>

              {insightsQuery.isLoading && [1,2,3].map(i => (
                <div key={i} className="h-16 rounded-lg bg-violet-900/20 animate-pulse" />
              ))}
              {!insightsQuery.isLoading && marketingInsights.length === 0 && (
                <div className="text-center py-8">
                  <BarChart3 className="w-6 h-6 text-violet-600 mx-auto mb-2" />
                  <p className="text-xs text-violet-500">Sync marketing data to see insights</p>
                </div>
              )}
              {marketingInsights.map(insight => {
                const cfg = CATEGORY_CONFIG[insight.category] || CATEGORY_CONFIG.campaigns;
                const Icon = cfg.icon;
                const expanded = expandedInsights.has(insight.key);
                return (
                  <div key={insight.key} className="rounded-lg bg-[#1a1030] border border-violet-900/30 p-2.5" data-testid={`insight-${insight.key}`}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Icon className={`w-3 h-3 shrink-0 ${cfg.color}`} />
                      <p className="text-[11px] font-semibold text-violet-100 flex-1 min-w-0 leading-tight">{insight.title}</p>
                    </div>
                    <p className={`text-[10.5px] text-violet-400 leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>{insight.summary}</p>
                    {insight.summary.length > 100 && (
                      <button
                        onClick={() => setExpandedInsights(prev => { const s = new Set(prev); expanded ? s.delete(insight.key) : s.add(insight.key); return s; })}
                        className="text-[10px] text-violet-500 hover:text-violet-300 mt-0.5 flex items-center gap-0.5"
                      >
                        {expanded ? <><ChevronUp className="w-2.5 h-2.5" />Less</> : <><ChevronDown className="w-2.5 h-2.5" />More</>}
                      </button>
                    )}
                    {insight.metrics.length > 0 && (
                      <div className="mt-1.5 grid grid-cols-2 gap-1">
                        {insight.metrics.slice(0, 4).map((m, i) => (
                          <div key={i} className="flex items-center gap-1 text-[10px]">
                            <TrendIcon trend={m.trend} />
                            <span className="text-violet-400 truncate">{m.label}:</span>
                            <span className="text-violet-200 font-medium shrink-0">{m.value}</span>
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
