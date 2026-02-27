import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain,
  Send,
  Mic,
  MicOff,
  RefreshCw,
  Sparkles,
  Loader2,
  AlertTriangle,
  AlertCircle,
  Info,
  Clock,
  Globe,
} from "lucide-react";
import { AIChatMessage, TypingIndicator } from "@/components/ai-chat-message";
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

interface InsightCard {
  key: string;
  title: string;
  category: string;
  summary: string;
  severity?: "critical" | "warning" | "info";
  metrics: InsightMetric[];
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  "How many orders are stuck in pending for more than 3 days?",
  "What's my return rate this week vs last week?",
  "Which courier has the best delivery success rate?",
  "Show me my top 5 cities by revenue",
  "How much COD is pending collection?",
  "What's my average order processing time?",
  "Which products have the highest return rate?",
  "Daily order trends for the last 2 weeks",
];

const SUGGESTED_QUESTIONS_UR = [
  "کتنے آرڈرز 3 دن سے زیادہ سے پینڈنگ ہیں؟",
  "اس ہفتے کی واپسی کی شرح پچھلے ہفتے سے کیا ہے؟",
  "کون سی کورئیر سروس سب سے بہترین ہے؟",
  "ریونیو کے لحاظ سے ٹاپ 5 شہر دکھائیں",
  "کتنا COD ابھی تک وصول نہیں ہوا؟",
];

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    borderColor: "border-l-red-500",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    iconColor: "text-red-500",
    badgeColor: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  },
  warning: {
    icon: AlertCircle,
    borderColor: "border-l-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-950/20",
    iconColor: "text-amber-500",
    badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  },
  info: {
    icon: Info,
    borderColor: "border-l-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
    iconColor: "text-blue-500",
    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  },
};

function CriticalAlertCard({ insight }: { insight: InsightCard }) {
  const severity = insight.severity || "info";
  const config = SEVERITY_CONFIG[severity];
  const Icon = config.icon;

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${config.borderColor} ${config.bgColor} transition-all hover:shadow-sm`}
      data-testid={`alert-card-${insight.key}`}
    >
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${config.iconColor}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-foreground">{insight.title}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${config.badgeColor}`}>
            {severity}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{insight.summary}</p>
      </div>
      {insight.metrics.length > 0 && (
        <div className="flex flex-col gap-1 shrink-0 text-right">
          {insight.metrics.slice(0, 2).map((m, i) => (
            <div key={i} className="text-xs">
              <span className="text-muted-foreground">{m.label}: </span>
              <span className="font-semibold text-foreground">{m.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<"en" | "ur">("en");
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const alertsQuery = useQuery<{ insights: InsightCard[]; generatedAt?: string }>({
    queryKey: ["/api/ai/insights", "dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/ai/insights/dashboard", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: Infinity,
    retry: 1,
  });

  const chatMutation = useMutation({
    mutationFn: async (question: string) => {
      const res = await apiRequest("POST", "/api/ai/chat", { question, language });
      return res.json();
    },
    onSuccess: (data: { answer: string }) => {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, msg]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: language === "ur"
            ? "معذرت، آپ کے سوال پر عمل کرنے میں خرابی ہوئی۔ دوبارہ کوشش کریں۔"
            : "Sorry, I encountered an error processing your question. Please try again.",
          timestamp: new Date(),
        },
      ]);
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMutation.isPending]);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = language === "ur" ? "ur-PK" : "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join("");
      setInput(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [language]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const speakMessage = useCallback((text: string, messageId?: string) => {
    window.speechSynthesis.cancel();
    const plainText = text.replace(/[#*_~`\-|>]/g, "").replace(/\n+/g, ". ");
    const utterance = new SpeechSynthesisUtterance(plainText);
    utterance.lang = language === "ur" ? "ur-PK" : "en-US";
    utterance.rate = 0.9;
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    if (messageId) setSpeakingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
  }, [language]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeakingMessageId(null);
  }, []);

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

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSuggestedQuestion(q: string) {
    setInput(q);
    inputRef.current?.focus();
  }

  const alerts = alertsQuery.data?.insights || [];
  const sortedAlerts = [...alerts].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return (order[a.severity || "info"] || 2) - (order[b.severity || "info"] || 2);
  });
  const suggestedQs = language === "ur" ? SUGGESTED_QUESTIONS_UR : SUGGESTED_QUESTIONS;
  const hasSpeechRecognition = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]" data-testid="page-ai-assistant">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-ai-assistant">
            <Brain className="h-6 w-6 text-primary" />
            AI Assistant
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {language === "ur" ? "اپنے کاروبار کے بارے میں کچھ بھی پوچھیں" : "Ask anything about your business — orders, shipments, revenue, and more"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={language} onValueChange={(v) => setLanguage(v as "en" | "ur")} data-testid="select-language">
            <SelectTrigger className="w-[140px] h-8" data-testid="trigger-language">
              <Globe className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en" data-testid="option-english">English</SelectItem>
              <SelectItem value="ur" data-testid="option-urdu">اردو (Urdu)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {sortedAlerts.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold flex items-center gap-2" data-testid="heading-critical-alerts">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Critical Alerts
            </h2>
            {alertsQuery.data?.generatedAt && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTimeAgo(alertsQuery.data.generatedAt)}
              </span>
            )}
          </div>
          <div className="space-y-2" data-testid="alerts-container">
            {sortedAlerts.map((alert) => (
              <CriticalAlertCard key={alert.key} insight={alert} />
            ))}
          </div>
        </div>
      )}

      {alertsQuery.isLoading && (
        <div className="mb-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      <Card className="flex-1 flex flex-col overflow-hidden" data-testid="card-chat">
        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="chat-messages">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Brain className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">
                    {language === "ur" ? "اپنے کاروبار کے بارے میں مجھ سے کچھ بھی پوچھیں" : "Ask me anything about your business"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {language === "ur" ? "آرڈرز، شپمنٹس، ریونیو اور مزید" : "Orders, shipments, revenue, campaigns, and more"}
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                  {suggestedQs.map((q, i) => (
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
              <AIChatMessage
                key={msg.id}
                role={msg.role}
                content={msg.content}
                onSpeak={msg.role === "assistant" ? (text) => speakMessage(text, msg.id) : undefined}
                isSpeaking={speakingMessageId === msg.id}
                onStopSpeaking={stopSpeaking}
              />
            ))}

            {chatMutation.isPending && <TypingIndicator />}

            <div ref={chatEndRef} />
          </div>

          <div className="border-t p-3 flex gap-2" data-testid="chat-input-area">
            {hasSpeechRecognition && (
              <Button
                variant={isListening ? "destructive" : "outline"}
                size="icon"
                className="shrink-0"
                onClick={isListening ? stopListening : startListening}
                data-testid="btn-voice-input"
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={language === "ur" ? "اپنا سوال یہاں لکھیں..." : "Ask a question about your orders, shipments, revenue..."}
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
  );
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
