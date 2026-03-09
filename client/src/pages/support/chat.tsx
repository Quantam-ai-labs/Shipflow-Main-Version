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
  if (status === "read") return <CheckCheck className="w-3 h-3 text-blue-400 inline-block ml-0.5" />;
  if (status === "delivered") return <CheckCheck className="w-3 h-3 text-muted-foreground inline-block ml-0.5" />;
  if (status === "sent") return <Check className="w-3 h-3 text-muted-foreground inline-block ml-0.5" />;
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
    case "sticker": return <ImageIcon className="w-3 h-3 inline mr-1" />;
    case "audio": case "voice": return <Mic className="w-3 h-3 inline mr-1" />;
    case "video": return <FileText className="w-3 h-3 inline mr-1" />;
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-xs space-y-5">
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Support Chat</h1>
          <p className="text-muted-foreground text-xs">Enter your PIN to access the chat inbox</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="password"
            placeholder="Enter PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            maxLength={8}
            autoFocus
            className="text-center text-lg tracking-widest"
            data-testid="input-pin"
          />
          {error && <p className="text-destructive text-xs text-center" data-testid="text-pin-error">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || pin.length < 4} data-testid="button-submit-pin">
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
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/support/conversations", selectedConvId, "messages"],
    queryFn: async () => {
      if (!selectedConvId) return [];
      const resp = await fetch(`/api/support/conversations/${selectedConvId}/messages`, { credentials: "include" });
      return resp.json();
    },
    enabled: hasAccess && !!selectedConvId,
    refetchInterval: 8000,
    staleTime: 4000,
  });

  const { data: teamData } = useQuery<{ members: TeamMember[]; total: number }>({
    queryKey: ["/api/team"],
    enabled: hasAccess,
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
  }, [selectedConvId, scrollToBottom]);

  const markingReadRef = useRef(false);
  const selectedUnread = conversations.find(c => c.id === selectedConvId)?.unreadCount ?? 0;
  useEffect(() => {
    if (selectedConvId && selectedUnread > 0 && !markingReadRef.current) {
      markingReadRef.current = true;
      apiRequest("PATCH", `/api/support/conversations/${selectedConvId}/read`, {}).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      }).catch(() => {}).finally(() => {
        markingReadRef.current = false;
      });
    }
  }, [selectedConvId, selectedUnread, queryClient]);

  const lastSentTextRef = useRef("");
  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      lastSentTextRef.current = text;
      return apiRequest("POST", `/api/support/conversations/${selectedConvId}/messages`, { text });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations", selectedConvId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      inputRef.current?.focus();
    },
    onError: () => {
      setMessageText(lastSentTextRef.current);
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
    if (!messageText.trim() || !selectedConvId || sendMutation.isPending) return;
    const text = messageText.trim();
    setMessageText("");
    sendMutation.mutate(text);
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
    <div className="flex h-full overflow-hidden bg-background">
      <div className="w-[340px] border-r border-border flex flex-col shrink-0 bg-background">
        <div className="h-10 border-b border-border flex items-center px-3 gap-2">
          <h2 className="font-medium text-foreground text-xs uppercase tracking-wider flex-1">Chats</h2>
          {totalUnread > 0 && (
            <span className="text-[10px] font-medium text-primary" data-testid="badge-total-unread">
              {totalUnread}
            </span>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(showFilters && "text-primary")}
            data-testid="button-toggle-filters"
          >
            <Filter className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="px-2 py-1.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, order..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-7 text-xs"
              data-testid="input-search-conversations"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="px-2 pb-1.5 flex gap-1 flex-wrap">
            {LABEL_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setLabelFilter(f.value)}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap transition-all border",
                  labelFilter === f.value
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "bg-card text-muted-foreground border-border hover-elevate"
                )}
                data-testid={`filter-${f.value}`}
              >
                {f.value !== "all" && f.value !== "unread" && (
                  <span className={cn("inline-block w-1.5 h-1.5 rounded-full mr-1", (f as any).color)} />
                )}
                {f.label}
              </button>
            ))}
          </div>
        )}

        <ScrollArea className="flex-1">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-xs">
              <MessageCircle className="w-8 h-8 mx-auto opacity-20 mb-2" />
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
                    "w-full px-2.5 py-2 text-left transition-colors flex items-center gap-2.5 border-b border-border",
                    isSelected ? "bg-accent" : "hover-elevate"
                  )}
                  data-testid={`button-conversation-${conv.id}`}
                >
                  <div className="relative shrink-0">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-xs",
                      labelInfo ? labelInfo.color : "bg-primary"
                    )}>
                      {(conv.contactName ?? conv.contactPhone).charAt(0).toUpperCase()}
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full text-primary-foreground text-[9px] flex items-center justify-center font-bold">
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={cn("text-xs truncate", conv.unreadCount > 0 ? "font-semibold text-foreground" : "text-foreground")} data-testid={`text-contact-${conv.id}`}>
                        {conv.contactName || `+${conv.contactPhone}`}
                      </span>
                      <span className={cn("text-[10px] whitespace-nowrap", conv.unreadCount > 0 ? "text-primary font-medium" : "text-muted-foreground")}>
                        {formatChatTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-px flex-wrap">
                      {conv.orderNumber && (
                        <span className="text-[9px] text-muted-foreground bg-muted px-1 py-px rounded font-mono">
                          #{conv.orderNumber}
                        </span>
                      )}
                      {labelInfo && (
                        <span className={cn("text-[9px] text-white px-1 py-px rounded", labelInfo.color)}>
                          {labelInfo.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-px">
                      <p className={cn("text-[11px] truncate flex-1", conv.unreadCount > 0 ? "text-foreground" : "text-muted-foreground")}>
                        {conv.lastMessage || "No messages"}
                      </p>
                      {conv.assignedToName && (
                        <span className="text-[9px] text-muted-foreground ml-1 flex items-center gap-0.5 shrink-0">
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

      <div className="flex-1 flex flex-col min-w-0">
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center bg-card">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                <MessageCircle className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-base font-light text-foreground">WhatsApp Support</h3>
              <p className="text-xs text-muted-foreground max-w-xs">Select a conversation to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            <div className="h-10 flex items-center px-3 gap-2.5 border-b border-border">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-xs shrink-0",
                getLabelInfo(selectedConv.label)?.color || "bg-primary"
              )}>
                {(selectedConv.contactName ?? selectedConv.contactPhone).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-xs text-foreground" data-testid="text-selected-contact">
                  {selectedConv.contactName || `+${selectedConv.contactPhone}`}
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
                  <span>+{selectedConv.contactPhone}</span>
                  {selectedConv.orderNumber && (
                    <>
                      <span>·</span>
                      <span className="font-mono">#{selectedConv.orderNumber}</span>
                    </>
                  )}
                  {selectedConv.assignedToName && (
                    <>
                      <span>·</span>
                      <span>{selectedConv.assignedToName}</span>
                    </>
                  )}
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" data-testid="button-chat-menu">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Tag className="w-4 h-4 mr-2" />
                      Label
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {LABELS.map(l => (
                        <DropdownMenuItem
                          key={l.value}
                          onClick={() => labelMutation.mutate({ convId: selectedConv.id, label: l.value })}
                          data-testid={`label-${l.value}`}
                        >
                          <span className={cn("w-3 h-3 rounded-full mr-2", l.color)} />
                          {l.label}
                          {selectedConv.label === l.value && <Check className="w-4 h-4 ml-auto" />}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => labelMutation.mutate({ convId: selectedConv.id, label: null })}
                        className="text-muted-foreground"
                        data-testid="label-clear"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Clear label
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Assign to
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {teamMembers.map(tm => (
                        <DropdownMenuItem
                          key={tm.userId}
                          onClick={() => assignMutation.mutate({
                            convId: selectedConv.id,
                            userId: tm.userId,
                            userName: `${tm.user.firstName} ${tm.user.lastName}`.trim()
                          })}
                          data-testid={`assign-${tm.userId}`}
                        >
                          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold mr-2">
                            {tm.user.firstName.charAt(0)}
                          </div>
                          {tm.user.firstName} {tm.user.lastName}
                          {selectedConv.assignedToUserId === tm.userId && <Check className="w-4 h-4 ml-auto" />}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => assignMutation.mutate({ convId: selectedConv.id, userId: null, userName: null })}
                        className="text-muted-foreground"
                        data-testid="assign-clear"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Unassign
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => deleteMutation.mutate(selectedConv.id)}
                    className="text-destructive focus:text-destructive"
                    data-testid="button-delete-conversation"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete conversation
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <ScrollArea className="flex-1 bg-muted/30">
              <div className="px-[6%] py-3 space-y-0.5">
                {messages.filter(m => m.messageType !== "reaction").length === 0 ? (
                  <div className="text-center py-6">
                    <span className="bg-card text-muted-foreground text-[10px] px-3 py-1 rounded-md inline-block border border-border">
                      No messages yet — start the conversation
                    </span>
                  </div>
                ) : (
                  messagesByDate.map(group => (
                    <div key={group.date}>
                      <div className="flex justify-center my-2">
                        <span className="bg-card text-muted-foreground text-[10px] px-2.5 py-0.5 rounded-md border border-border">
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
                            className={cn("flex mb-0.5 group", isOutbound ? "justify-end" : "justify-start")}
                            data-testid={`message-${msg.id}`}
                          >
                            <div className="relative max-w-[65%]">
                              <div className={cn(
                                "relative px-2.5 py-1 rounded-md text-xs border",
                                isOutbound
                                  ? "bg-primary/10 dark:bg-primary/20 text-foreground border-primary/20 rounded-tr-none"
                                  : "bg-card text-foreground border-border rounded-tl-none"
                              )}>
                                {isButtonReply && (
                                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium mb-0.5 bg-primary/10 text-primary">
                                    <Reply className="w-2.5 h-2.5" />
                                    {msg.text}
                                  </div>
                                )}
                                {!isButtonReply && (
                                  <div className="whitespace-pre-wrap break-words leading-normal">
                                    {isNonText && <MessageTypeIcon type={msg.messageType} />}
                                    {renderFormattedText(msg.text || "")}
                                  </div>
                                )}
                                <div className={cn(
                                  "flex items-center gap-0.5 mt-px",
                                  isOutbound ? "justify-end" : ""
                                )}>
                                  <span className="text-[9px] text-muted-foreground">
                                    {format(new Date(msg.createdAt), "HH:mm")}
                                  </span>
                                  {isOutbound && <StatusTicks status={msg.status} />}
                                </div>
                              </div>

                              {msgReactions.length > 0 && (
                                <div className={cn("flex gap-0.5 mt-[-8px]", isOutbound ? "justify-end pr-2" : "pl-2")}>
                                  {msgReactions.map(r => (
                                    <span key={r.id} className="bg-card border border-border rounded-full px-1.5 py-0.5 text-sm">
                                      {r.reactionEmoji}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {!isOutbound && msg.waMessageId && (
                                <div className="absolute top-1 right-[-32px] invisible group-hover:visible transition-opacity">
                                  <EmojiPicker
                                    onSelect={(emoji) => reactMutation.mutate({ convId: selectedConv.id, emoji, waMessageId: msg.waMessageId! })}
                                    trigger={
                                      <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`react-${msg.id}`}>
                                        <Smile className="w-4 h-4" />
                                      </Button>
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

            <div className="px-3 py-1.5 border-t border-border">
              <div className="flex items-center gap-0.5 mb-1">
                <Button size="icon" variant="ghost" onClick={() => insertFormatting("*", "*")} title="Bold" data-testid="button-format-bold">
                  <Bold className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => insertFormatting("_", "_")} title="Italic" data-testid="button-format-italic">
                  <Italic className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => insertFormatting("~", "~")} title="Strikethrough" data-testid="button-format-strike">
                  <Strikethrough className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => insertFormatting("```", "```")} title="Code" data-testid="button-format-code">
                  <Code className="w-3.5 h-3.5" />
                </Button>
              </div>

              <div className="flex items-end gap-1.5">
                <EmojiPicker
                  onSelect={(emoji) => {
                    setMessageText(prev => prev + emoji);
                    inputRef.current?.focus();
                  }}
                  trigger={
                    <Button size="icon" variant="ghost" className="shrink-0 mb-0.5" data-testid="button-emoji-picker">
                      <Smile className="w-4 h-4" />
                    </Button>
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
                  className="flex-1 resize-none bg-muted text-foreground rounded-md px-2.5 py-2 text-xs placeholder:text-muted-foreground border border-border outline-none focus:ring-1 focus:ring-ring max-h-[100px] min-h-[36px]"
                  style={{ height: "auto", overflow: messageText.split("\n").length > 3 ? "auto" : "hidden" }}
                  data-testid="input-message"
                />
                <Button
                  size="icon"
                  onClick={() => handleSend()}
                  disabled={!messageText.trim() || sendMutation.isPending}
                  className="shrink-0 mb-0.5"
                  data-testid="button-send-message"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
