import { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle, Search, Send, Lock, Phone,
  MoreVertical, Tag, UserPlus, Check, CheckCheck,
  Smile, Bold, Italic, Strikethrough, Code, Filter,
  X, ArrowLeft, Image as ImageIcon, Mic, FileText,
  MapPin, Users, Reply, Trash2, RefreshCw, AlertTriangle,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";

function getSlugFromPath(): string {
  const match = window.location.pathname.match(/^\/agent-chat\/([^/]+)/);
  return match?.[1] || "";
}

function getTokenKey(slug: string) {
  return `agent_chat_token_${slug}`;
}

function getStoredToken(slug: string): string | null {
  return localStorage.getItem(getTokenKey(slug));
}

function storeToken(slug: string, token: string) {
  localStorage.setItem(getTokenKey(slug), token);
}

function clearToken(slug: string) {
  localStorage.removeItem(getTokenKey(slug));
}

async function agentFetch(url: string, slug: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken(slug);
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  return fetch(url, { ...options, headers });
}

async function agentApiRequest(method: string, url: string, slug: string, body?: any): Promise<Response> {
  const resp = await agentFetch(url, slug, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ message: "Request failed" }));
    throw new Error(data.message || data.error || "Request failed");
  }
  return resp;
}

const SlugContext = createContext<string>("");

interface Conversation {
  id: string;
  contactPhone: string;
  contactName: string | null;
  orderNumber: string | null;
  orderId: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
  label: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
}

interface Message {
  id: string;
  conversationId: string;
  direction: string;
  senderName: string | null;
  text: string | null;
  status: string | null;
  messageType: string | null;
  mediaUrl: string | null;
  reactionEmoji: string | null;
  referenceMessageId: string | null;
  waMessageId: string | null;
  createdAt: string;
}

interface TeamMember {
  id: string;
  userId: string;
  user: { firstName: string; lastName: string; email: string };
  role: string;
}


const LABELS = [
  { value: "new", label: "New", color: "bg-blue-500" },
  { value: "open", label: "Open", color: "bg-green-500" },
  { value: "pending", label: "Pending", color: "bg-yellow-500" },
  { value: "resolved", label: "Resolved", color: "bg-gray-400" },
  { value: "spam", label: "Spam", color: "bg-red-500" },
  { value: "sales", label: "Sales", color: "bg-purple-500" },
  { value: "urgent", label: "Urgent", color: "bg-orange-500" },
];

const LABEL_FILTERS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  ...LABELS,
];

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "✅"];

function getLabelInfo(label: string | null) {
  return LABELS.find(l => l.value === label) || null;
}

function formatChatTime(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "dd/MM/yy");
}

function StatusTicks({ status }: { status: string | null }) {
  if (status === "read") return <CheckCheck className="w-3.5 h-3.5 text-blue-400 inline-block ml-1" />;
  if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-slate-400 inline-block ml-1" />;
  if (status === "sent") return <Check className="w-3.5 h-3.5 text-slate-400 inline-block ml-1" />;
  return null;
}

function renderFormattedText(text: string) {
  const parts: (string | JSX.Element)[] = [];
  const regex = /(\*[^*]+\*)|(_[^_]+_)|(~[^~]+~)|(```[^`]+```)|(`[^`]+`)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const m = match[0];
    if (m.startsWith("```") && m.endsWith("```")) {
      parts.push(<code key={key++} className="block bg-black/10 rounded px-2 py-1 text-xs font-mono my-1 whitespace-pre-wrap">{m.slice(3, -3)}</code>);
    } else if (m.startsWith("`") && m.endsWith("`")) {
      parts.push(<code key={key++} className="bg-black/10 rounded px-1 py-0.5 text-xs font-mono">{m.slice(1, -1)}</code>);
    } else if (m.startsWith("*") && m.endsWith("*")) {
      parts.push(<strong key={key++}>{m.slice(1, -1)}</strong>);
    } else if (m.startsWith("_") && m.endsWith("_")) {
      parts.push(<em key={key++}>{m.slice(1, -1)}</em>);
    } else if (m.startsWith("~") && m.endsWith("~")) {
      parts.push(<s key={key++}>{m.slice(1, -1)}</s>);
    }
    lastIndex = match.index + m.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function MessageTypeIcon({ type }: { type: string | null }) {
  switch (type) {
    case "image": return <ImageIcon className="w-3 h-3 inline mr-1" />;
    case "sticker": return <ImageIcon className="w-3 h-3 inline mr-1" />;
    case "audio": case "voice": return <Mic className="w-3 h-3 inline mr-1" />;
    case "video": return <FileText className="w-3 h-3 inline mr-1" />;
    case "document": return <FileText className="w-3 h-3 inline mr-1" />;
    case "location": return <MapPin className="w-3 h-3 inline mr-1" />;
    case "contacts": return <Users className="w-3 h-3 inline mr-1" />;
    default: return null;
  }
}

function PinScreen({ slug, merchantName, onSuccess }: { slug: string; merchantName: string; onSuccess: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return;
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/agent-chat/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, pin }),
      });
      const data = await resp.json() as { success?: boolean; token?: string; message?: string };
      if (resp.ok && data.success && data.token) {
        storeToken(slug, data.token);
        onSuccess();
      } else {
        setError(data.message || "Incorrect PIN. Please try again.");
        setPin("");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-950 p-6 select-none">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">{merchantName || "Agent Chat"}</h1>
          <p className="text-slate-400 text-sm">Enter your PIN to access the chat inbox</p>
        </div>

        <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
          <div className="flex justify-center gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border-2 transition-colors ${
                  i < pin.length ? "bg-blue-400 border-blue-400" : "border-slate-600"
                }`}
                data-testid={`agent-pin-dot-${i}`}
              />
            ))}
          </div>

          {error && <p className="text-red-400 text-sm text-center" data-testid="text-agent-pin-error">{error}</p>}

          <div className="grid grid-cols-3 gap-3">
            {[1,2,3,4,5,6,7,8,9].map((n) => (
              <button
                key={n}
                onClick={() => { if (pin.length < 6) setPin((p) => p + n); }}
                className="h-14 rounded-xl bg-slate-800 text-white text-xl font-semibold active:bg-slate-700 transition-colors"
                data-testid={`agent-pin-btn-${n}`}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setPin((p) => p.slice(0, -1))}
              className="h-14 rounded-xl bg-slate-800 text-sm text-slate-400 active:bg-slate-700 transition-colors"
              data-testid="agent-pin-btn-back"
            >
              &#9003;
            </button>
            <button
              onClick={() => { if (pin.length < 6) setPin((p) => p + "0"); }}
              className="h-14 rounded-xl bg-slate-800 text-white text-xl font-semibold active:bg-slate-700 transition-colors"
              data-testid="agent-pin-btn-0"
            >
              0
            </button>
            <button
              onClick={(e) => handleSubmit(e as any)}
              disabled={pin.length < 4 || loading}
              className="h-14 rounded-xl bg-blue-600 text-white text-sm font-semibold active:bg-blue-700 disabled:opacity-40 transition-colors flex items-center justify-center"
              data-testid="agent-pin-btn-enter"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin text-white" /> : "Enter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileEmojiBar({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <div className="flex gap-1 px-1">
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="w-9 h-9 flex items-center justify-center text-lg active:bg-slate-700 rounded-lg transition-colors"
          data-testid={`quick-emoji-${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

function ConversationList({
  conversations,
  onSelect,
  totalUnread,
}: {
  conversations: Conversation[];
  onSelect: (id: string) => void;
  totalUnread: number;
}) {
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const filtered = conversations.filter(c => {
    if (labelFilter === "unread" && c.unreadCount === 0) return false;
    if (labelFilter !== "all" && labelFilter !== "unread" && c.label !== labelFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.contactPhone.includes(q) ||
      (c.contactName ?? "").toLowerCase().includes(q) ||
      (c.orderNumber ?? "").toLowerCase().includes(q) ||
      (c.orderId ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white">
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <h1 className="font-bold text-lg flex-1" data-testid="text-agent-chat-title">Chats</h1>
        {totalUnread > 0 && (
          <span className="bg-blue-600 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center" data-testid="badge-agent-total-unread">
            {totalUnread}
          </span>
        )}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "p-2 rounded-lg active:bg-slate-800 transition-colors",
            showFilters && "text-blue-400"
          )}
          data-testid="button-agent-toggle-filters"
        >
          <Filter className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            placeholder="Search by name, phone, or order..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 text-white placeholder:text-slate-500 rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="input-agent-search-conversations"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 active:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="px-4 pb-2 flex gap-1.5 flex-wrap">
          {LABEL_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setLabelFilter(f.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                labelFilter === f.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-900 text-slate-400 active:bg-slate-800"
              )}
              data-testid={`agent-filter-${f.value}`}
            >
              {f.value !== "all" && f.value !== "unread" && "color" in f && (
                <span className={cn("inline-block w-2 h-2 rounded-full mr-1.5", (f as any).color)} />
              )}
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            <MessageCircle className="w-12 h-12 mx-auto opacity-20 mb-3" />
            {search ? "No conversations match your search" : "No conversations yet"}
          </div>
        ) : (
          filtered.map((conv) => {
            const labelInfo = getLabelInfo(conv.label);
            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className="w-full px-4 py-3 text-left flex items-center gap-3 border-b border-slate-800/50 active:bg-slate-900 transition-colors"
                data-testid={`button-agent-conversation-${conv.id}`}
              >
                <div className="relative shrink-0">
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg",
                    labelInfo ? labelInfo.color : "bg-blue-600"
                  )}>
                    {(conv.contactName ?? conv.contactPhone).charAt(0).toUpperCase()}
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-blue-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold">
                      {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-sm truncate", conv.unreadCount > 0 ? "font-bold text-white" : "text-slate-200")} data-testid={`text-agent-contact-${conv.id}`}>
                      {conv.contactName || `+${conv.contactPhone}`}
                    </span>
                    <span className={cn("text-xs whitespace-nowrap", conv.unreadCount > 0 ? "text-blue-400 font-medium" : "text-slate-500")}>
                      {formatChatTime(conv.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    {conv.orderNumber && (
                      <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                        #{conv.orderNumber}
                      </span>
                    )}
                    {labelInfo && (
                      <span className={cn("text-[10px] text-white px-1.5 py-0.5 rounded", labelInfo.color)}>
                        {labelInfo.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className={cn("text-xs truncate flex-1", conv.unreadCount > 0 ? "text-slate-200" : "text-slate-500")}>
                      {conv.lastMessage || "No messages"}
                    </p>
                    {conv.assignedToName && (
                      <span className="text-[10px] text-slate-500 ml-2 flex items-center gap-0.5 shrink-0">
                        <UserPlus className="w-2.5 h-2.5" />
                        {conv.assignedToName.split(" ")[0]}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function ChatView({
  conversation,
  onBack,
}: {
  conversation: Conversation;
  onBack: () => void;
}) {
  const slug = useContext(SlugContext);
  const [messageText, setMessageText] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const [showFormatBar, setShowFormatBar] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/agent-chat/conversations", slug, conversation.id, "messages"],
    queryFn: async () => {
      const resp = await agentFetch(`/api/agent-chat/conversations/${conversation.id}/messages`, slug);
      if (!resp.ok) throw new Error("Failed to fetch messages");
      return resp.json();
    },
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const { data: teamData } = useQuery<{ members: TeamMember[]; total: number }>({
    queryKey: ["/api/agent-chat/team", slug],
    queryFn: async () => {
      const resp = await agentFetch("/api/agent-chat/team", slug);
      if (!resp.ok) throw new Error("Failed to fetch team");
      return resp.json();
    },
  });
  const teamMembers = teamData?.members ?? [];

  const prevMsgCountRef = useRef(0);
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    const count = messages.length;
    if (count !== prevMsgCountRef.current) {
      prevMsgCountRef.current = count;
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    prevMsgCountRef.current = 0;
    scrollToBottom();
  }, [conversation.id, scrollToBottom]);

  const markingReadRef = useRef(false);
  useEffect(() => {
    if (conversation.unreadCount > 0 && !markingReadRef.current) {
      markingReadRef.current = true;
      agentApiRequest("PATCH", `/api/agent-chat/conversations/${conversation.id}/read`, slug, {}).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/agent-chat/conversations", slug] });
      }).catch(() => {}).finally(() => {
        markingReadRef.current = false;
      });
    }
  }, [conversation.id, conversation.unreadCount, queryClient, slug]);

  const lastSentTextRef = useRef("");
  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      lastSentTextRef.current = text;
      return agentApiRequest("POST", `/api/agent-chat/conversations/${conversation.id}/messages`, slug, { text });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-chat/conversations", slug, conversation.id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-chat/conversations", slug] });
      inputRef.current?.focus();
    },
    onError: () => {
      setMessageText(lastSentTextRef.current);
    },
  });

  const labelMutation = useMutation({
    mutationFn: async ({ label }: { label: string | null }) =>
      agentApiRequest("PATCH", `/api/agent-chat/conversations/${conversation.id}/label`, slug, { label }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/agent-chat/conversations", slug] }),
  });

  const assignMutation = useMutation({
    mutationFn: async ({ userId, userName }: { userId: string | null; userName: string | null }) =>
      agentApiRequest("PATCH", `/api/agent-chat/conversations/${conversation.id}/assign`, slug, { userId, userName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/agent-chat/conversations", slug] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => agentApiRequest("DELETE", `/api/agent-chat/conversations/${conversation.id}`, slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-chat/conversations", slug] });
      onBack();
    },
  });

  const reactMutation = useMutation({
    mutationFn: async ({ emoji, waMessageId }: { emoji: string; waMessageId: string }) =>
      agentApiRequest("POST", `/api/agent-chat/conversations/${conversation.id}/react`, slug, { emoji, waMessageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-chat/conversations", slug, conversation.id, "messages"] });
    },
  });

  const reactions = messages.filter(m => m.messageType === "reaction");
  const getReactionsForMessage = (waMessageId: string | null) => {
    if (!waMessageId) return [];
    return reactions.filter(r => r.referenceMessageId === waMessageId);
  };

  const messagesByDate = useMemo(() => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = "";
    for (const msg of messages.filter(m => m.messageType !== "reaction")) {
      const d = format(new Date(msg.createdAt), "yyyy-MM-dd");
      if (d !== currentDate) {
        currentDate = d;
        groups.push({ date: d, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    }
    return groups;
  }, [messages]);

  function formatDateHeader(dateStr: string) {
    const d = new Date(dateStr);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "MMMM d, yyyy");
  }

  const handleSend = () => {
    if (!messageText.trim() || sendMutation.isPending) return;
    const text = messageText.trim();
    setMessageText("");
    setShowEmojis(false);
    setShowFormatBar(false);
    sendMutation.mutate(text);
  };

  const insertFormatting = (prefix: string, suffix: string) => {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = messageText.slice(start, end);
    const newText = messageText.slice(0, start) + prefix + selected + suffix + messageText.slice(end);
    setMessageText(newText);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  const [reactingMsgId, setReactingMsgId] = useState<string | null>(null);

  const labelInfo = getLabelInfo(conversation.label);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-900 border-b border-slate-800 shrink-0">
        <button
          onClick={onBack}
          className="p-2 rounded-lg active:bg-slate-800 transition-colors shrink-0"
          data-testid="button-agent-chat-back"
        >
          <ArrowLeft className="w-5 h-5 text-slate-300" />
        </button>
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold shrink-0",
          labelInfo?.color || "bg-blue-600"
        )}>
          {(conversation.contactName ?? conversation.contactPhone).charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-white truncate" data-testid="text-agent-selected-contact">
            {conversation.contactName || `+${conversation.contactPhone}`}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 flex-wrap">
            <Phone className="w-3 h-3" />
            <span>+{conversation.contactPhone}</span>
            {conversation.orderNumber && (
              <>
                <span className="text-slate-600">|</span>
                <span className="font-mono">#{conversation.orderNumber}</span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowActions(!showActions)}
          className="p-2 rounded-lg active:bg-slate-800 transition-colors shrink-0"
          data-testid="button-agent-chat-menu"
        >
          <MoreVertical className="w-5 h-5 text-slate-300" />
        </button>
      </div>

      {showActions && (
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 space-y-3 shrink-0">
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1.5">Label</p>
            <div className="flex gap-1.5 flex-wrap">
              {LABELS.map(l => (
                <button
                  key={l.value}
                  onClick={() => { labelMutation.mutate({ label: l.value }); setShowActions(false); }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium active:opacity-80 transition-colors",
                    conversation.label === l.value ? "ring-2 ring-white/30" : "",
                    l.color, "text-white"
                  )}
                  data-testid={`agent-label-${l.value}`}
                >
                  {l.label}
                </button>
              ))}
              {conversation.label && (
                <button
                  onClick={() => { labelMutation.mutate({ label: null }); setShowActions(false); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-400 active:bg-slate-700"
                  data-testid="agent-label-clear"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {teamMembers.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1.5">Assign to</p>
              <div className="flex gap-1.5 flex-wrap">
                {teamMembers.map(tm => (
                  <button
                    key={tm.userId}
                    onClick={() => {
                      assignMutation.mutate({ userId: tm.userId, userName: `${tm.user.firstName} ${tm.user.lastName}`.trim() });
                      setShowActions(false);
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium active:bg-slate-700 transition-colors",
                      conversation.assignedToUserId === tm.userId ? "bg-blue-600/30 text-blue-300" : "bg-slate-800 text-slate-300"
                    )}
                    data-testid={`agent-assign-${tm.userId}`}
                  >
                    {tm.user.firstName}
                  </button>
                ))}
                {conversation.assignedToUserId && (
                  <button
                    onClick={() => { assignMutation.mutate({ userId: null, userName: null }); setShowActions(false); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-400 active:bg-slate-700"
                    data-testid="agent-assign-clear"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          <button
            onClick={() => { if (confirm("Delete this conversation?")) deleteMutation.mutate(); }}
            className="flex items-center gap-2 text-red-400 text-xs font-medium active:text-red-300 py-1"
            data-testid="button-agent-delete-conversation"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete conversation
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-slate-950/50">
        <div className="px-3 py-4 space-y-1">
          {messages.filter(m => m.messageType !== "reaction").length === 0 ? (
            <div className="text-center py-8">
              <span className="bg-slate-900 text-slate-500 text-xs px-4 py-2 rounded-lg inline-block">
                No messages yet
              </span>
            </div>
          ) : (
            messagesByDate.map(group => (
              <div key={group.date}>
                <div className="flex justify-center my-3">
                  <span className="bg-slate-900 text-slate-500 text-[11px] px-3 py-1 rounded-lg">
                    {formatDateHeader(group.date)}
                  </span>
                </div>
                {group.messages.map(msg => {
                  const isOutbound = msg.direction === "outbound";
                  const msgReactions = getReactionsForMessage(msg.waMessageId);
                  const isButtonReply = msg.messageType === "button_reply";
                  const isNonText = msg.messageType && !["text", "button_reply"].includes(msg.messageType);

                  return (
                    <div
                      key={msg.id}
                      className={cn("flex mb-1", isOutbound ? "justify-end" : "justify-start")}
                      data-testid={`agent-message-${msg.id}`}
                    >
                      <div className="relative max-w-[80%]">
                        <div
                          className={cn(
                            "relative px-3 py-1.5 rounded-xl text-sm",
                            isOutbound
                              ? "bg-blue-600 text-white rounded-tr-sm"
                              : "bg-slate-800 text-slate-100 rounded-tl-sm"
                          )}
                          onClick={() => {
                            if (!isOutbound && msg.waMessageId) {
                              setReactingMsgId(reactingMsgId === msg.id ? null : msg.id);
                            }
                          }}
                        >
                          {isButtonReply && (
                            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium mb-1 bg-white/10">
                              <Reply className="w-3 h-3" />
                              {msg.text}
                            </div>
                          )}
                          {!isButtonReply && (
                            <div className="whitespace-pre-wrap break-words leading-relaxed">
                              {isNonText && <MessageTypeIcon type={msg.messageType} />}
                              {renderFormattedText(msg.text || "")}
                            </div>
                          )}
                          <div className={cn(
                            "flex items-center gap-1 mt-0.5",
                            isOutbound ? "justify-end" : ""
                          )}>
                            <span className={cn("text-[10px]", isOutbound ? "text-blue-200" : "text-slate-500")}>
                              {format(new Date(msg.createdAt), "HH:mm")}
                            </span>
                            {isOutbound && <StatusTicks status={msg.status} />}
                          </div>
                        </div>

                        {msgReactions.length > 0 && (
                          <div className={cn("flex gap-0.5 mt-[-8px]", isOutbound ? "justify-end pr-2" : "pl-2")}>
                            {msgReactions.map(r => (
                              <span key={r.id} className="bg-slate-800 border border-slate-700 rounded-full px-1.5 py-0.5 text-sm">
                                {r.reactionEmoji}
                              </span>
                            ))}
                          </div>
                        )}

                        {reactingMsgId === msg.id && !isOutbound && msg.waMessageId && (
                          <div className="flex gap-1 mt-1 bg-slate-800 rounded-xl p-1.5">
                            {QUICK_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => {
                                  reactMutation.mutate({ emoji, waMessageId: msg.waMessageId! });
                                  setReactingMsgId(null);
                                }}
                                className="w-8 h-8 flex items-center justify-center text-base active:bg-slate-700 rounded-lg"
                                data-testid={`agent-react-${msg.id}-${emoji}`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="bg-slate-900 border-t border-slate-800 shrink-0">
        {showFormatBar && (
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-800">
            <button onClick={() => insertFormatting("*", "*")} className="p-2 rounded-lg active:bg-slate-800 text-slate-400" data-testid="button-agent-format-bold">
              <Bold className="w-4 h-4" />
            </button>
            <button onClick={() => insertFormatting("_", "_")} className="p-2 rounded-lg active:bg-slate-800 text-slate-400" data-testid="button-agent-format-italic">
              <Italic className="w-4 h-4" />
            </button>
            <button onClick={() => insertFormatting("~", "~")} className="p-2 rounded-lg active:bg-slate-800 text-slate-400" data-testid="button-agent-format-strike">
              <Strikethrough className="w-4 h-4" />
            </button>
            <button onClick={() => insertFormatting("```", "```")} className="p-2 rounded-lg active:bg-slate-800 text-slate-400" data-testid="button-agent-format-code">
              <Code className="w-4 h-4" />
            </button>
          </div>
        )}

        {showEmojis && (
          <div className="border-b border-slate-800 py-2">
            <MobileEmojiBar onSelect={(emoji) => {
              setMessageText(prev => prev + emoji);
              inputRef.current?.focus();
            }} />
          </div>
        )}

        <div className="flex items-end gap-2 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => { setShowEmojis(!showEmojis); setShowFormatBar(false); }}
            className={cn("p-2 rounded-lg active:bg-slate-800 transition-colors shrink-0 mb-0.5", showEmojis ? "text-blue-400" : "text-slate-400")}
            data-testid="button-agent-emoji-toggle"
          >
            <Smile className="w-5 h-5" />
          </button>
          <button
            onClick={() => { setShowFormatBar(!showFormatBar); setShowEmojis(false); }}
            className={cn("p-2 rounded-lg active:bg-slate-800 transition-colors shrink-0 mb-0.5", showFormatBar ? "text-blue-400" : "text-slate-400")}
            data-testid="button-agent-format-toggle"
          >
            <Bold className="w-5 h-5" />
          </button>
          <textarea
            ref={inputRef}
            placeholder="Type a message"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            className="flex-1 resize-none bg-slate-800 text-white rounded-xl px-4 py-2.5 text-sm placeholder:text-slate-500 border-0 outline-none focus:ring-2 focus:ring-blue-500 max-h-[120px] min-h-[40px]"
            style={{ height: "auto", overflow: messageText.split("\n").length > 3 ? "auto" : "hidden" }}
            data-testid="input-agent-message"
          />
          <button
            onClick={handleSend}
            disabled={!messageText.trim() || sendMutation.isPending}
            className="p-2.5 rounded-xl bg-blue-600 text-white active:bg-blue-700 disabled:opacity-40 transition-colors shrink-0 mb-0.5"
            data-testid="button-agent-send-message"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function InstallBanner() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || (navigator as any).standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  useEffect(() => {
    if (isStandalone) return;
    const dismissed = localStorage.getItem("agent_chat_install_dismissed");
    if (dismissed) return;
    setShow(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [isStandalone]);

  if (!show || isStandalone) return null;

  const dismiss = () => {
    setShow(false);
    localStorage.setItem("agent_chat_install_dismissed", "1");
  };

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      dismiss();
    }
  };

  return (
    <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center justify-between gap-3 text-sm" data-testid="banner-install-pwa">
      <div className="flex-1 min-w-0">
        {deferredPrompt ? (
          <span>Install this app for quick access</span>
        ) : isIOS ? (
          <span>Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> for quick access</span>
        ) : (
          <span>Add to Home Screen from your browser menu for quick access</span>
        )}
      </div>
      {deferredPrompt && (
        <button
          onClick={handleInstall}
          className="px-3 py-1 bg-white text-blue-600 rounded-lg text-xs font-semibold whitespace-nowrap active:bg-blue-50"
          data-testid="button-install-pwa"
        >
          Install
        </button>
      )}
      <button onClick={dismiss} className="p-1 shrink-0" data-testid="button-dismiss-install">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function NotFoundScreen() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-950 p-6">
      <div className="text-center space-y-3">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
        <h1 className="text-xl font-bold text-white">Store Not Found</h1>
        <p className="text-slate-400 text-sm">The link you followed is invalid or this store no longer exists.</p>
      </div>
    </div>
  );
}

export default function AgentChatPage() {
  const slug = getSlugFromPath();
  const [hasAccess, setHasAccess] = useState(() => !!getStoredToken(slug));
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [merchantNotFound, setMerchantNotFound] = useState(false);
  const queryClient = useQueryClient();

  const { data: merchantInfo } = useQuery<{ name: string; logoUrl: string | null; slug: string }>({
    queryKey: ["/api/agent-chat/merchant-info", slug],
    queryFn: async () => {
      const resp = await fetch(`/api/agent-chat/merchant-info/${slug}`);
      if (resp.status === 404) {
        setMerchantNotFound(true);
        throw new Error("Not found");
      }
      if (!resp.ok) throw new Error("Failed to fetch merchant info");
      return resp.json();
    },
    enabled: !!slug,
    retry: false,
  });

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/agent-chat/conversations", slug],
    queryFn: async () => {
      const resp = await agentFetch("/api/agent-chat/conversations", slug);
      if (resp.status === 401) {
        clearToken(slug);
        setHasAccess(false);
        throw new Error("Token expired");
      }
      if (!resp.ok) throw new Error("Failed to fetch conversations");
      return resp.json();
    },
    enabled: hasAccess && !!slug,
    refetchInterval: 8000,
    staleTime: 4000,
  });

  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      meta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
    }
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const manifestData = {
      name: "1SOL Agent Chat",
      short_name: "Agent Chat",
      description: "WhatsApp agent inbox for 1SOL.AI support",
      start_url: `/agent-chat/${slug}`,
      display: "standalone",
      orientation: "portrait",
      background_color: "#111b21",
      theme_color: "#111b21",
      icons: [
        { src: "/favicon.png", sizes: "192x192", type: "image/png" },
        { src: "/favicon.png", sizes: "512x512", type: "image/png" },
      ],
      categories: ["business", "productivity"],
      lang: "en",
    };
    const blob = new Blob([JSON.stringify(manifestData)], { type: "application/json" });
    const manifestUrl = URL.createObjectURL(blob);
    const existingManifest = document.querySelector('link[rel="manifest"]');
    if (existingManifest) {
      existingManifest.setAttribute("href", manifestUrl);
    }
    const titleTag = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (titleTag) {
      titleTag.setAttribute("content", "Agent Chat");
    }
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute("content", "#111b21");
    }

    return () => {
      URL.revokeObjectURL(manifestUrl);
      if (meta) {
        meta.setAttribute("content", "width=device-width, initial-scale=1");
      }
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      if (existingManifest) {
        existingManifest.setAttribute("href", "/manifest.json");
      }
      if (titleTag) {
        titleTag.setAttribute("content", "1SOL Warehouse");
      }
      if (themeColor) {
        themeColor.setAttribute("content", "#0f172a");
      }
    };
  }, []);

  if (!slug || merchantNotFound) {
    return <NotFoundScreen />;
  }

  if (!hasAccess) {
    return <PinScreen slug={slug} merchantName={merchantInfo?.name || ""} onSuccess={() => setHasAccess(true)} />;
  }

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const selectedConv = conversations.find(c => c.id === selectedConvId);

  if (selectedConv) {
    return (
      <SlugContext.Provider value={slug}>
        <div className="h-[100dvh] flex flex-col">
          <ChatView
            conversation={selectedConv}
            onBack={() => setSelectedConvId(null)}
          />
        </div>
      </SlugContext.Provider>
    );
  }

  return (
    <SlugContext.Provider value={slug}>
      <div className="h-[100dvh] flex flex-col">
        <InstallBanner />
        <ConversationList
          conversations={conversations}
          onSelect={(id) => setSelectedConvId(id)}
          totalUnread={totalUnread}
        />
      </div>
    </SlugContext.Provider>
  );
}
