import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  MessageCircle, Search, Send, Trash2, Lock, Phone,
  MoreVertical, Tag, UserPlus, Check, CheckCheck,
  Smile, Bold, Italic, Strikethrough, Code, Filter,
  X, ChevronDown, Image as ImageIcon, Mic, FileText,
  MapPin, Users, Reply,
} from "lucide-react";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { EmojiPicker } from "@/components/emoji-picker";

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

const SESSION_KEY = "support_chat_access";

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
  if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-white/60 inline-block ml-1" />;
  if (status === "sent") return <Check className="w-3.5 h-3.5 text-white/60 inline-block ml-1" />;
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
      parts.push(<code key={key++} className="block bg-black/10 dark:bg-white/10 rounded px-2 py-1 text-xs font-mono my-1 whitespace-pre-wrap">{m.slice(3, -3)}</code>);
    } else if (m.startsWith("`") && m.endsWith("`")) {
      parts.push(<code key={key++} className="bg-black/10 dark:bg-white/10 rounded px-1 py-0.5 text-xs font-mono">{m.slice(1, -1)}</code>);
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
    case "sticker": return <span className="mr-1">🎨</span>;
    case "audio": case "voice": return <Mic className="w-3 h-3 inline mr-1" />;
    case "video": return <span className="mr-1">🎬</span>;
    case "document": return <FileText className="w-3 h-3 inline mr-1" />;
    case "location": return <MapPin className="w-3 h-3 inline mr-1" />;
    case "contacts": return <Users className="w-3 h-3 inline mr-1" />;
    default: return null;
  }
}

function PinScreen({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return;
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`/api/support/chat-access?pin=${encodeURIComponent(pin)}`);
      const data = await resp.json() as { valid: boolean; error?: string };
      if (data.valid) {
        sessionStorage.setItem(SESSION_KEY, "true");
        onSuccess();
      } else {
        setError("Incorrect PIN. Please try again.");
        setPin("");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#111b21] p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-[#00a884] rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Support Chat</h1>
          <p className="text-[#8696a0] text-sm">Enter your PIN to access the chat inbox</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="password"
            placeholder="Enter PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            maxLength={8}
            autoFocus
            className="text-center text-xl tracking-widest h-12 bg-[#2a3942] border-0 text-white placeholder:text-[#8696a0]"
            data-testid="input-pin"
          />
          {error && <p className="text-red-400 text-sm text-center" data-testid="text-pin-error">{error}</p>}
          <Button type="submit" className="w-full bg-[#00a884] hover:bg-[#00c49a] text-white" disabled={loading || pin.length < 4} data-testid="button-submit-pin">
            {loading ? "Verifying..." : "Enter Chat"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function SupportChatPage() {
  const [hasAccess, setHasAccess] = useState(() => sessionStorage.getItem(SESSION_KEY) === "true");
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [messageText, setMessageText] = useState("");
  const [labelFilter, setLabelFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/support/conversations"],
    enabled: hasAccess,
    refetchInterval: 5000,
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/support/conversations", selectedConvId, "messages"],
    queryFn: async () => {
      if (!selectedConvId) return [];
      const resp = await fetch(`/api/support/conversations/${selectedConvId}/messages`, { credentials: "include" });
      return resp.json();
    },
    enabled: hasAccess && !!selectedConvId,
    refetchInterval: 3000,
  });

  const { data: teamData } = useQuery<{ members: TeamMember[]; total: number }>({
    queryKey: ["/api/team"],
    enabled: hasAccess,
  });
  const teamMembers = teamData?.members ?? [];

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(scrollToBottom, [selectedConvId, messages, scrollToBottom]);

  useEffect(() => {
    if (selectedConvId) {
      const conv = conversations.find(c => c.id === selectedConvId);
      if (conv && conv.unreadCount > 0) {
        apiRequest("PATCH", `/api/support/conversations/${selectedConvId}/read`, {}).catch(() => {});
        queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      }
    }
  }, [selectedConvId, conversations, queryClient]);

  const sendMutation = useMutation({
    mutationFn: async (text: string) =>
      apiRequest("POST", `/api/support/conversations/${selectedConvId}/messages`, { text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations", selectedConvId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      setMessageText("");
      inputRef.current?.focus();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/support/conversations/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      if (selectedConvId === id) setSelectedConvId(null);
    },
  });

  const labelMutation = useMutation({
    mutationFn: async ({ convId, label }: { convId: string; label: string | null }) =>
      apiRequest("PATCH", `/api/support/conversations/${convId}/label`, { label }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] }),
  });

  const assignMutation = useMutation({
    mutationFn: async ({ convId, userId, userName }: { convId: string; userId: string | null; userName: string | null }) =>
      apiRequest("PATCH", `/api/support/conversations/${convId}/assign`, { userId, userName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] }),
  });

  const reactMutation = useMutation({
    mutationFn: async ({ convId, emoji, waMessageId }: { convId: string; emoji: string; waMessageId: string }) =>
      apiRequest("POST", `/api/support/conversations/${convId}/react`, { emoji, waMessageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations", selectedConvId, "messages"] });
    },
  });

  if (!hasAccess) {
    return <PinScreen onSuccess={() => setHasAccess(true)} />;
  }

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

  const selectedConv = conversations.find(c => c.id === selectedConvId);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!messageText.trim() || !selectedConvId) return;
    sendMutation.mutate(messageText.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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

  const reactions = messages.filter(m => m.messageType === "reaction");
  const getReactionsForMessage = (waMessageId: string | null) => {
    if (!waMessageId) return [];
    return reactions.filter(r => r.referenceMessageId === waMessageId);
  };

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

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

  return (
    <div className="flex h-screen overflow-hidden bg-[#111b21]">
      {/* Left sidebar */}
      <div className="w-[380px] border-r border-[#222d35] flex flex-col shrink-0 bg-[#111b21]">
        {/* Sidebar header */}
        <div className="h-14 bg-[#202c33] flex items-center px-4 gap-3">
          <div className="w-9 h-9 bg-[#00a884] rounded-full flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <h2 className="font-semibold text-[#e9edef] text-sm flex-1">Chats</h2>
          {totalUnread > 0 && (
            <Badge className="bg-[#00a884] text-white text-xs px-2 py-0.5 rounded-full" data-testid="badge-total-unread">
              {totalUnread}
            </Badge>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "p-1.5 rounded-full transition-colors",
              showFilters ? "bg-[#00a884]/20 text-[#00a884]" : "text-[#aebac1] hover:text-[#e9edef]"
            )}
            data-testid="button-toggle-filters"
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 bg-[#111b21]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8696a0]" />
            <input
              placeholder="Search by name, phone, or order..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2 rounded-lg bg-[#202c33] text-[#e9edef] text-sm placeholder:text-[#8696a0] border-0 outline-none focus:ring-1 focus:ring-[#00a884]/50"
              data-testid="input-search-conversations"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8696a0] hover:text-[#e9edef]">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Label filter pills */}
        {showFilters && (
          <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none">
            {LABEL_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setLabelFilter(f.value)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                  labelFilter === f.value
                    ? "bg-[#00a884] text-white"
                    : "bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942] hover:text-[#e9edef]"
                )}
                data-testid={`filter-${f.value}`}
              >
                {f.value !== "all" && f.value !== "unread" && (
                  <span className={cn("inline-block w-2 h-2 rounded-full mr-1.5", (f as any).color)} />
                )}
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Conversation list */}
        <ScrollArea className="flex-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-[#8696a0] text-sm">
              <MessageCircle className="w-12 h-12 mx-auto opacity-20 mb-3" />
              {search ? "No conversations match your search" : "No conversations yet"}
            </div>
          ) : (
            filtered.map((conv) => {
              const labelInfo = getLabelInfo(conv.label);
              const isSelected = selectedConvId === conv.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className={cn(
                    "w-full px-3 py-3 text-left transition-colors flex items-center gap-3",
                    isSelected ? "bg-[#2a3942]" : "hover:bg-[#202c33]"
                  )}
                  data-testid={`button-conversation-${conv.id}`}
                >
                  <div className="relative shrink-0">
                    <div className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg",
                      labelInfo ? labelInfo.color : "bg-[#00a884]"
                    )}>
                      {(conv.contactName ?? conv.contactPhone).charAt(0).toUpperCase()}
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[#00a884] rounded-full text-white text-[10px] flex items-center justify-center font-bold">
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("text-sm truncate", conv.unreadCount > 0 ? "font-bold text-[#e9edef]" : "text-[#e9edef]")} data-testid={`text-contact-${conv.id}`}>
                        {conv.contactName || `+${conv.contactPhone}`}
                      </span>
                      <span className={cn("text-xs whitespace-nowrap", conv.unreadCount > 0 ? "text-[#00a884] font-medium" : "text-[#8696a0]")}>
                        {formatChatTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {conv.orderNumber && (
                        <span className="text-[10px] text-[#8696a0] bg-[#202c33] px-1.5 py-0.5 rounded font-mono">
                          #{conv.orderNumber}
                        </span>
                      )}
                      {labelInfo && (
                        <span className={cn("text-[10px] text-white px-1.5 py-0.5 rounded", labelInfo.color)}>
                          {labelInfo.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className={cn("text-xs truncate flex-1", conv.unreadCount > 0 ? "text-[#d1d7db]" : "text-[#8696a0]")}>
                        {conv.lastMessage || "No messages"}
                      </p>
                      {conv.assignedToName && (
                        <span className="text-[10px] text-[#8696a0] ml-2 flex items-center gap-0.5 shrink-0">
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
        </ScrollArea>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center bg-[#222e35]">
            <div className="text-center space-y-3">
              <div className="w-24 h-24 bg-[#2a3942] rounded-full flex items-center justify-center mx-auto">
                <MessageCircle className="w-12 h-12 text-[#8696a0]" />
              </div>
              <h3 className="text-xl font-light text-[#e9edef]">WhatsApp Support</h3>
              <p className="text-sm text-[#8696a0] max-w-sm">Select a conversation from the sidebar to start chatting with your customers</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="h-14 bg-[#202c33] flex items-center px-4 gap-3 border-b border-[#222d35]">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold shrink-0",
                getLabelInfo(selectedConv.label)?.color || "bg-[#00a884]"
              )}>
                {(selectedConv.contactName ?? selectedConv.contactPhone).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-[#e9edef]" data-testid="text-selected-contact">
                  {selectedConv.contactName || `+${selectedConv.contactPhone}`}
                </p>
                <div className="flex items-center gap-2 text-xs text-[#8696a0]">
                  <Phone className="w-3 h-3" />
                  <span>+{selectedConv.contactPhone}</span>
                  {selectedConv.orderNumber && (
                    <>
                      <span>•</span>
                      <span className="font-mono">#{selectedConv.orderNumber}</span>
                    </>
                  )}
                  {selectedConv.assignedToName && (
                    <>
                      <span>•</span>
                      <UserPlus className="w-3 h-3" />
                      <span>{selectedConv.assignedToName}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-full text-[#aebac1] hover:text-[#e9edef] hover:bg-[#2a3942] transition-colors" data-testid="button-chat-menu">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-[#233138] border-[#3b4a54] text-[#e9edef]">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="focus:bg-[#2a3942]">
                      <Tag className="w-4 h-4 mr-2" />
                      Label
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="bg-[#233138] border-[#3b4a54] text-[#e9edef]">
                      {LABELS.map(l => (
                        <DropdownMenuItem
                          key={l.value}
                          onClick={() => labelMutation.mutate({ convId: selectedConv.id, label: l.value })}
                          className="focus:bg-[#2a3942]"
                          data-testid={`label-${l.value}`}
                        >
                          <span className={cn("w-3 h-3 rounded-full mr-2", l.color)} />
                          {l.label}
                          {selectedConv.label === l.value && <Check className="w-4 h-4 ml-auto" />}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator className="bg-[#3b4a54]" />
                      <DropdownMenuItem
                        onClick={() => labelMutation.mutate({ convId: selectedConv.id, label: null })}
                        className="focus:bg-[#2a3942] text-[#8696a0]"
                        data-testid="label-clear"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Clear label
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="focus:bg-[#2a3942]">
                      <UserPlus className="w-4 h-4 mr-2" />
                      Assign to
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="bg-[#233138] border-[#3b4a54] text-[#e9edef]">
                      {teamMembers.map(tm => (
                        <DropdownMenuItem
                          key={tm.userId}
                          onClick={() => assignMutation.mutate({
                            convId: selectedConv.id,
                            userId: tm.userId,
                            userName: `${tm.user.firstName} ${tm.user.lastName}`.trim()
                          })}
                          className="focus:bg-[#2a3942]"
                          data-testid={`assign-${tm.userId}`}
                        >
                          <div className="w-6 h-6 rounded-full bg-[#00a884] flex items-center justify-center text-white text-xs font-bold mr-2">
                            {tm.user.firstName.charAt(0)}
                          </div>
                          {tm.user.firstName} {tm.user.lastName}
                          {selectedConv.assignedToUserId === tm.userId && <Check className="w-4 h-4 ml-auto" />}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator className="bg-[#3b4a54]" />
                      <DropdownMenuItem
                        onClick={() => assignMutation.mutate({ convId: selectedConv.id, userId: null, userName: null })}
                        className="focus:bg-[#2a3942] text-[#8696a0]"
                        data-testid="assign-clear"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Unassign
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSeparator className="bg-[#3b4a54]" />
                  <DropdownMenuItem
                    onClick={() => deleteMutation.mutate(selectedConv.id)}
                    className="text-red-400 focus:bg-[#2a3942] focus:text-red-400"
                    data-testid="button-delete-conversation"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete conversation
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Messages area with WhatsApp wallpaper */}
            <ScrollArea className="flex-1" style={{
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23182229' fill-opacity='0.6'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
              backgroundColor: "#0b141a",
            }}>
              <div className="px-[8%] py-4 space-y-1">
                {messages.filter(m => m.messageType !== "reaction").length === 0 ? (
                  <div className="text-center py-8">
                    <span className="bg-[#182229] text-[#8696a0] text-xs px-4 py-2 rounded-lg inline-block">
                      No messages yet — start the conversation
                    </span>
                  </div>
                ) : (
                  messagesByDate.map(group => (
                    <div key={group.date}>
                      <div className="flex justify-center my-3">
                        <span className="bg-[#182229] text-[#8696a0] text-[11px] px-3 py-1 rounded-md shadow-sm">
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
                            className={cn("flex mb-1 group", isOutbound ? "justify-end" : "justify-start")}
                            data-testid={`message-${msg.id}`}
                          >
                            <div className="relative max-w-[65%]">
                              <div className={cn(
                                "relative px-3 py-1.5 rounded-lg text-sm shadow-sm",
                                isOutbound
                                  ? "bg-[#005c4b] text-[#e9edef] rounded-tr-none"
                                  : "bg-[#202c33] text-[#e9edef] rounded-tl-none"
                              )}>
                                {isButtonReply && (
                                  <div className={cn(
                                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium mb-1",
                                    isOutbound ? "bg-[#00a884]/20 text-[#00a884]" : "bg-[#00a884]/20 text-[#00a884]"
                                  )}>
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
                                  <span className="text-[10px] text-[#ffffff99]">
                                    {format(new Date(msg.createdAt), "HH:mm")}
                                  </span>
                                  {isOutbound && <StatusTicks status={msg.status} />}
                                </div>
                              </div>

                              {/* Reactions on message */}
                              {msgReactions.length > 0 && (
                                <div className={cn("flex gap-0.5 mt-[-8px]", isOutbound ? "justify-end pr-2" : "pl-2")}>
                                  {msgReactions.map(r => (
                                    <span key={r.id} className="bg-[#182229] border border-[#3b4a54] rounded-full px-1.5 py-0.5 text-sm shadow-sm">
                                      {r.reactionEmoji}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Hover action: react with emoji */}
                              {!isOutbound && msg.waMessageId && (
                                <div className="absolute top-1 right-[-32px] opacity-0 group-hover:opacity-100 transition-opacity">
                                  <EmojiPicker
                                    onSelect={(emoji) => reactMutation.mutate({ convId: selectedConv.id, emoji, waMessageId: msg.waMessageId! })}
                                    trigger={
                                      <button className="p-1 rounded-full bg-[#202c33] hover:bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef] shadow-md transition-colors" data-testid={`react-${msg.id}`}>
                                        <Smile className="w-4 h-4" />
                                      </button>
                                    }
                                    side="right"
                                  />
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
            </ScrollArea>

            {/* Input area */}
            <div className="bg-[#202c33] px-4 py-2 border-t border-[#222d35]">
              {/* Formatting toolbar */}
              <div className="flex items-center gap-1 mb-1.5">
                <button onClick={() => insertFormatting("*", "*")} className="p-1.5 rounded text-[#8696a0] hover:text-[#e9edef] hover:bg-[#2a3942] transition-colors" title="Bold" data-testid="button-format-bold">
                  <Bold className="w-4 h-4" />
                </button>
                <button onClick={() => insertFormatting("_", "_")} className="p-1.5 rounded text-[#8696a0] hover:text-[#e9edef] hover:bg-[#2a3942] transition-colors" title="Italic" data-testid="button-format-italic">
                  <Italic className="w-4 h-4" />
                </button>
                <button onClick={() => insertFormatting("~", "~")} className="p-1.5 rounded text-[#8696a0] hover:text-[#e9edef] hover:bg-[#2a3942] transition-colors" title="Strikethrough" data-testid="button-format-strike">
                  <Strikethrough className="w-4 h-4" />
                </button>
                <button onClick={() => insertFormatting("```", "```")} className="p-1.5 rounded text-[#8696a0] hover:text-[#e9edef] hover:bg-[#2a3942] transition-colors" title="Code" data-testid="button-format-code">
                  <Code className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-end gap-2">
                <EmojiPicker
                  onSelect={(emoji) => {
                    setMessageText(prev => prev + emoji);
                    inputRef.current?.focus();
                  }}
                  trigger={
                    <button className="p-2 rounded-full text-[#8696a0] hover:text-[#e9edef] hover:bg-[#2a3942] transition-colors shrink-0 mb-0.5" data-testid="button-emoji-picker">
                      <Smile className="w-6 h-6" />
                    </button>
                  }
                  side="top"
                  align="start"
                />
                <textarea
                  ref={inputRef}
                  placeholder="Type a message"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  className="flex-1 resize-none bg-[#2a3942] text-[#e9edef] rounded-lg px-3 py-2.5 text-sm placeholder:text-[#8696a0] border-0 outline-none focus:ring-1 focus:ring-[#00a884]/30 max-h-[120px] min-h-[40px]"
                  style={{ height: "auto", overflow: messageText.split("\n").length > 3 ? "auto" : "hidden" }}
                  data-testid="input-message"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!messageText.trim() || sendMutation.isPending}
                  className={cn(
                    "p-2.5 rounded-full transition-colors shrink-0 mb-0.5",
                    messageText.trim()
                      ? "bg-[#00a884] text-white hover:bg-[#00c49a]"
                      : "text-[#8696a0] cursor-not-allowed"
                  )}
                  data-testid="button-send-message"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
