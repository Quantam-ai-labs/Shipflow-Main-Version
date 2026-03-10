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
  MapPin, Users, Reply, Download, Play, Pause, Volume2,
  ExternalLink, File, Video,
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
  mimeType: string | null;
  fileName: string | null;
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
  if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-muted-foreground inline-block ml-1" />;
  if (status === "sent") return <Check className="w-3.5 h-3.5 text-muted-foreground inline-block ml-1" />;
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
    case "video": return <Video className="w-3 h-3 inline mr-1" />;
    case "document": return <FileText className="w-3 h-3 inline mr-1" />;
    case "location": return <MapPin className="w-3 h-3 inline mr-1" />;
    case "contacts": return <Users className="w-3 h-3 inline mr-1" />;
    default: return null;
  }
}

function extractMediaId(mediaUrl: string | null): string | null {
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith("wa-media:")) return mediaUrl.slice(9);
  return null;
}

const WAVEFORM_BARS = [3,5,8,4,7,10,6,9,4,7,5,8,11,6,4,9,7,5,10,8,6,3,7,5,9,4,8,6,10,5];

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const safeDuration = (d: number) => (isFinite(d) && !isNaN(d) && d > 0) ? d : 0;

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); } else { a.play(); }
    setPlaying(!playing);
  };

  const formatTime = (s: number) => {
    if (!isFinite(s) || isNaN(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleDuration = () => {
    const d = audioRef.current?.duration ?? 0;
    const safe = safeDuration(d);
    if (safe > 0) setDuration(safe);
  };

  return (
    <div className="flex items-center gap-2.5 min-w-[220px] py-1" data-testid="audio-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={handleDuration}
        onDurationChange={handleDuration}
        onCanPlay={handleDuration}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (!a) return;
          const d = safeDuration(a.duration);
          if (d > 0) {
            setCurrentTime(a.currentTime);
            setProgress((a.currentTime / d) * 100);
            if (!duration) setDuration(d);
          }
        }}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); }}
      />
      <button
        onClick={toggle}
        className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 active:bg-primary/80 transition-colors shadow-sm"
        data-testid="audio-play-btn"
      >
        {playing ? <Pause className="w-4 h-4 text-primary-foreground" /> : <Play className="w-4 h-4 text-primary-foreground ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className="relative w-full h-[22px] flex items-end gap-[2px] cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            const a = audioRef.current;
            const d = safeDuration(a?.duration ?? 0);
            if (a && d > 0) { a.currentTime = pct * d; }
          }}
        >
          {WAVEFORM_BARS.map((h, i) => {
            const barPct = ((i + 0.5) / WAVEFORM_BARS.length) * 100;
            const isPlayed = barPct <= progress;
            return (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-full transition-colors duration-150",
                  isPlayed ? "bg-primary" : "bg-muted-foreground/30"
                )}
                style={{ height: `${h * 2}px` }}
              />
            );
          })}
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {playing ? formatTime(currentTime) : formatTime(duration)}
        </span>
      </div>
    </div>
  );
}

function MediaBubble({ msg, mediaProxyBase }: { msg: Message; mediaProxyBase: string }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const mediaId = extractMediaId(msg.mediaUrl);
  const proxyUrl = mediaId ? `${mediaProxyBase}/${mediaId}` : null;
  const caption = msg.text && !["📷 Image", "🎨 Sticker", "🎵 Audio", "🎬 Video", "📄 Document"].includes(msg.text) ? msg.text : null;

  if (msg.messageType === "image" && proxyUrl) {
    return (
      <div data-testid={`media-image-${msg.id}`}>
        <img
          src={proxyUrl}
          alt={caption || "Image"}
          className="max-w-[280px] max-h-[300px] rounded-md cursor-pointer object-cover"
          onClick={() => setLightboxOpen(true)}
          loading="lazy"
        />
        {caption && <div className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-sm">{renderFormattedText(caption)}</div>}
        {lightboxOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setLightboxOpen(false)}
            data-testid="image-lightbox"
          >
            <button className="absolute top-4 right-4 text-white hover:text-gray-300" onClick={() => setLightboxOpen(false)}>
              <X className="w-8 h-8" />
            </button>
            <img src={proxyUrl} alt={caption || "Image"} className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
          </div>
        )}
      </div>
    );
  }

  if (msg.messageType === "sticker" && proxyUrl) {
    return (
      <div data-testid={`media-sticker-${msg.id}`}>
        <img src={proxyUrl} alt="Sticker" className="w-32 h-32 object-contain" loading="lazy" />
      </div>
    );
  }

  if (msg.messageType === "audio" && proxyUrl) {
    return (
      <div data-testid={`media-audio-${msg.id}`}>
        <AudioPlayer src={proxyUrl} />
      </div>
    );
  }

  if (msg.messageType === "video" && proxyUrl) {
    return (
      <div data-testid={`media-video-${msg.id}`}>
        <video
          src={proxyUrl}
          controls
          preload="metadata"
          className="max-w-[280px] max-h-[240px] rounded-md"
        />
        {caption && <div className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-sm">{renderFormattedText(caption)}</div>}
      </div>
    );
  }

  if (msg.messageType === "document" && proxyUrl) {
    const fName = msg.fileName || msg.text || "Document";
    const isPdf = msg.mimeType?.includes("pdf") || fName.toLowerCase().endsWith(".pdf");
    return (
      <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50 min-w-[200px]" data-testid={`media-document-${msg.id}`}>
        <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
          {isPdf ? <FileText className="w-5 h-5 text-red-500" /> : <File className="w-5 h-5 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{fName}</div>
          {msg.mimeType && <div className="text-[10px] text-muted-foreground uppercase">{msg.mimeType.split("/")[1] || msg.mimeType}</div>}
        </div>
        <a
          href={`${proxyUrl}?download=1&filename=${encodeURIComponent(fName)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"
          data-testid={`download-document-${msg.id}`}
        >
          <Download className="w-4 h-4 text-primary" />
        </a>
      </div>
    );
  }

  if (msg.messageType === "location" && msg.mediaUrl?.startsWith("geo:")) {
    const coords = msg.mediaUrl.slice(4).split(",");
    const lat = coords[0];
    const lng = coords[1];
    const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    return (
      <div data-testid={`media-location-${msg.id}`}>
        <a href={mapUrl} target="_blank" rel="noopener noreferrer"
          className="block rounded-md overflow-hidden border border-border hover:opacity-90 transition-opacity"
        >
          <div className="bg-muted/50 p-3 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{msg.text || "Shared Location"}</div>
              <div className="text-[10px] text-muted-foreground">{lat}, {lng}</div>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </div>
        </a>
      </div>
    );
  }

  if (msg.messageType === "contacts") {
    let contacts: any[] = [];
    try { contacts = JSON.parse(msg.mediaUrl || "[]"); } catch { }
    if (contacts.length === 0) {
      return (
        <div className="flex items-center gap-2" data-testid={`media-contacts-${msg.id}`}>
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">{msg.text || "Contact shared"}</span>
        </div>
      );
    }
    return (
      <div className="space-y-2" data-testid={`media-contacts-${msg.id}`}>
        {contacts.map((c: any, i: number) => {
          const name = c.name?.formatted_name || "Unknown";
          const phones = c.phones?.map((p: any) => p.phone).filter(Boolean) || [];
          return (
            <div key={i} className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{name}</div>
                {phones.map((p: string, j: number) => (
                  <div key={j} className="text-[11px] text-muted-foreground">{p}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="whitespace-pre-wrap break-words leading-relaxed">
      <MessageTypeIcon type={msg.messageType} />
      {renderFormattedText(msg.text || "")}
    </div>
  );
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
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Support Chat</h1>
          <p className="text-muted-foreground text-sm">Enter your PIN to access the chat inbox</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="password"
            placeholder="Enter PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            maxLength={8}
            autoFocus
            className="text-center text-xl tracking-widest"
            data-testid="input-pin"
          />
          {error && <p className="text-destructive text-sm text-center" data-testid="text-pin-error">{error}</p>}
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

  function formatDateHeader(dateStr: string) {
    const d = new Date(dateStr);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "MMMM d, yyyy");
  }

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <div className="w-[380px] border-r border-border flex flex-col shrink-0 bg-background">
        <div className="h-14 bg-card border-b border-border flex items-center px-4 gap-3">
          <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-primary-foreground" />
          </div>
          <h2 className="font-semibold text-foreground text-sm flex-1">Chats</h2>
          {totalUnread > 0 && (
            <Badge variant="default" className="text-xs rounded-full" data-testid="badge-total-unread">
              {totalUnread}
            </Badge>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(showFilters && "text-primary")}
            data-testid="button-toggle-filters"
          >
            <Filter className="w-5 h-5" />
          </Button>
        </div>

        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, or order..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-8"
              data-testid="input-search-conversations"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
            {LABEL_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setLabelFilter(f.value)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all border",
                  labelFilter === f.value
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "bg-card text-muted-foreground border-border hover-elevate"
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

        <ScrollArea className="flex-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
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
                    "w-full px-3 py-3 text-left transition-colors flex items-center gap-3 border-b border-border",
                    isSelected ? "bg-accent" : "hover-elevate"
                  )}
                  data-testid={`button-conversation-${conv.id}`}
                >
                  <div className="relative shrink-0">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-base",
                      labelInfo ? labelInfo.color : "bg-primary"
                    )}>
                      {(conv.contactName ?? conv.contactPhone).charAt(0).toUpperCase()}
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-primary rounded-full text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("text-sm truncate", conv.unreadCount > 0 ? "font-bold text-foreground" : "text-foreground")} data-testid={`text-contact-${conv.id}`}>
                        {conv.contactName || `+${conv.contactPhone}`}
                      </span>
                      <span className={cn("text-xs whitespace-nowrap", conv.unreadCount > 0 ? "text-primary font-medium" : "text-muted-foreground")}>
                        {formatChatTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {conv.orderNumber && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
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
                      <p className={cn("text-xs truncate flex-1", conv.unreadCount > 0 ? "text-foreground" : "text-muted-foreground")}>
                        {conv.lastMessage || "No messages"}
                      </p>
                      {conv.assignedToName && (
                        <span className="text-[10px] text-muted-foreground ml-2 flex items-center gap-0.5 shrink-0">
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
            <div className="text-center space-y-3">
              <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto">
                <MessageCircle className="w-12 h-12 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-light text-foreground">WhatsApp Support</h3>
              <p className="text-sm text-muted-foreground max-w-sm">Select a conversation from the sidebar to start chatting with your customers</p>
            </div>
          </div>
        ) : (
          <>
            <div className="h-14 bg-card flex items-center px-4 gap-3 border-b border-border">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold shrink-0",
                getLabelInfo(selectedConv.label)?.color || "bg-primary"
              )}>
                {(selectedConv.contactName ?? selectedConv.contactPhone).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground" data-testid="text-selected-contact">
                  {selectedConv.contactName || `+${selectedConv.contactPhone}`}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <Phone className="w-3 h-3" />
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
                      <UserPlus className="w-3 h-3" />
                      <span>{selectedConv.assignedToName}</span>
                    </>
                  )}
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" data-testid="button-chat-menu">
                    <MoreVertical className="w-5 h-5" />
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
              <div className="px-[8%] py-4 space-y-1">
                {messages.filter(m => m.messageType !== "reaction").length === 0 ? (
                  <div className="text-center py-8">
                    <span className="bg-card text-muted-foreground text-xs px-4 py-2 rounded-md inline-block border border-border">
                      No messages yet — start the conversation
                    </span>
                  </div>
                ) : (
                  messagesByDate.map(group => (
                    <div key={group.date}>
                      <div className="flex justify-center my-3">
                        <span className="bg-card text-muted-foreground text-[11px] px-3 py-1 rounded-md border border-border">
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
                                "relative px-3 py-1.5 rounded-md text-sm border",
                                isOutbound
                                  ? "bg-primary/10 dark:bg-primary/20 text-foreground border-primary/20 rounded-tr-none"
                                  : "bg-card text-foreground border-border rounded-tl-none"
                              )}>
                                {isButtonReply && (
                                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium mb-1 bg-primary/10 text-primary">
                                    <Reply className="w-3 h-3" />
                                    {msg.text}
                                  </div>
                                )}
                                {!isButtonReply && isNonText && (
                                  <MediaBubble msg={msg} mediaProxyBase="/api/whatsapp/media" />
                                )}
                                {!isButtonReply && !isNonText && (
                                  <div className="whitespace-pre-wrap break-words leading-relaxed">
                                    {renderFormattedText(msg.text || "")}
                                  </div>
                                )}
                                <div className={cn(
                                  "flex items-center gap-1 mt-0.5",
                                  isOutbound ? "justify-end" : ""
                                )}>
                                  <span className="text-[10px] text-muted-foreground">
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

            <div className="bg-card px-4 py-2 border-t border-border">
              <div className="flex items-center gap-1 mb-1.5">
                <Button size="icon" variant="ghost" onClick={() => insertFormatting("*", "*")} title="Bold" data-testid="button-format-bold" className="h-7 w-7">
                  <Bold className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => insertFormatting("_", "_")} title="Italic" data-testid="button-format-italic" className="h-7 w-7">
                  <Italic className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => insertFormatting("~", "~")} title="Strikethrough" data-testid="button-format-strike" className="h-7 w-7">
                  <Strikethrough className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => insertFormatting("```", "```")} title="Code" data-testid="button-format-code" className="h-7 w-7">
                  <Code className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-end gap-2">
                <EmojiPicker
                  onSelect={(emoji) => {
                    setMessageText(prev => prev + emoji);
                    inputRef.current?.focus();
                  }}
                  trigger={
                    <Button size="icon" variant="ghost" className="shrink-0 mb-0.5" data-testid="button-emoji-picker">
                      <Smile className="w-5 h-5" />
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
                  className="flex-1 resize-none bg-muted text-foreground rounded-md px-3 py-2.5 text-sm placeholder:text-muted-foreground border border-border outline-none focus:ring-1 focus:ring-ring max-h-[120px] min-h-[40px]"
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
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
