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
  MessageCircle, Search, Send, Trash2, Phone,
  MoreVertical, Tag, UserPlus, Check, CheckCheck,
  Smile, Bold, Italic, Strikethrough, Code, Filter,
  X, ChevronDown, Image as ImageIcon, Mic, FileText,
  MapPin, Users, Reply, Download, Play, Pause, Volume2,
  ExternalLink, File as FileIcon, Video, Plus, Pencil, Settings2,
  Paperclip, Camera, FileUp, StopCircle, Loader2, ClipboardList, AlertCircle,
  Archive, ArchiveRestore, CheckSquare, Square, MinusSquare,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { EmojiPicker } from "@/components/emoji-picker";
import { useToast } from "@/hooks/use-toast";

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
  aiPaused: boolean;
  aiPausedAt: string | null;
  isArchived: boolean;
  archivedAt: string | null;
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

interface WaLabel {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isSystem: boolean;
}

const LABEL_COLORS = [
  { value: "bg-blue-500", label: "Blue" },
  { value: "bg-green-500", label: "Green" },
  { value: "bg-yellow-500", label: "Yellow" },
  { value: "bg-gray-400", label: "Gray" },
  { value: "bg-red-500", label: "Red" },
  { value: "bg-purple-500", label: "Purple" },
  { value: "bg-orange-500", label: "Orange" },
  { value: "bg-rose-600", label: "Rose" },
  { value: "bg-amber-600", label: "Amber" },
  { value: "bg-teal-500", label: "Teal" },
  { value: "bg-indigo-500", label: "Indigo" },
  { value: "bg-pink-500", label: "Pink" },
  { value: "bg-cyan-500", label: "Cyan" },
  { value: "bg-emerald-500", label: "Emerald" },
  { value: "bg-lime-500", label: "Lime" },
];

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
  if (status === "failed") return <AlertCircle className="w-3.5 h-3.5 text-red-500 inline-block ml-1" />;
  return null;
}

function renderFormattedText(text: string) {
  const parts: (string | JSX.Element)[] = [];
  const regex = /(\*[^*]+\*)|(_[^_]+_)|(~[^~]+~)|(```[^`]+```)|(`[^`]+`)|(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;
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
    } else if (m.startsWith("http")) {
      parts.push(<a key={key++} href={m} target="_blank" rel="noopener noreferrer" className="text-blue-500 dark:text-blue-400 underline break-all hover:text-blue-600">{m}</a>);
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
  const [loadError, setLoadError] = useState(false);

  const safeDuration = (d: number) => (isFinite(d) && !isNaN(d) && d > 0) ? d : 0;

  const toggle = () => {
    const a = audioRef.current;
    if (!a || loadError) return;
    if (playing) { a.pause(); } else { a.play().catch(() => setLoadError(true)); }
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

  if (loadError) {
    return (
      <div className="flex items-center gap-2 min-w-[220px] py-1 text-muted-foreground" data-testid="audio-player-error">
        <Volume2 className="w-4 h-4 flex-shrink-0 opacity-50" />
        <span className="text-xs">Audio unavailable</span>
      </div>
    );
  }

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
        onError={() => setLoadError(true)}
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
          {isPdf ? <FileText className="w-5 h-5 text-red-500" /> : <FileIcon className="w-5 h-5 text-muted-foreground" />}
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

function QuotedMessagePreview({ msg, messages }: { msg: Message; messages: Message[] }) {
  const quoted = messages.find(m => m.id === msg.referenceMessageId);
  if (!quoted) return null;
  const isInboundQuote = quoted.direction === "inbound";
  const previewText = quoted.text || (quoted.messageType === "image" ? "📷 Image" : quoted.messageType === "audio" ? "🎵 Audio" : quoted.messageType === "video" ? "🎬 Video" : quoted.messageType === "document" ? "📄 Document" : "Message");
  return (
    <div className={cn(
      "mb-1.5 rounded-md px-2 py-1 text-xs border-l-[3px] bg-black/5 dark:bg-white/5",
      isInboundQuote ? "border-l-[#128C7E]" : "border-l-[#007AFF]"
    )}>
      <div className={cn("font-semibold mb-0.5", isInboundQuote ? "text-[#128C7E]" : "text-[#007AFF]")}>
        {isInboundQuote ? (quoted.senderName || "Customer") : (quoted.senderName || "You")}
      </div>
      <div className="truncate text-[#54656f] dark:text-[#8696a0]">{previewText}</div>
    </div>
  );
}

export default function SupportChatPage() {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [messageText, setMessageText] = useState("");
  const [labelFilter, setLabelFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("bg-blue-500");
  const [editingLabel, setEditingLabel] = useState<WaLabel | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showFileComplaint, setShowFileComplaint] = useState(false);

  // Archive multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reply-to-message state
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Clipboard image paste state
  const [pastedImage, setPastedImage] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [isUploadingPaste, setIsUploadingPaste] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: waLabels = [] } = useQuery<WaLabel[]>({
    queryKey: ["/api/support/labels"],
  });

  const getLabelInfo = useCallback((label: string | null) => {
    if (!label) return null;
    return waLabels.find(l => l.name === label) || null;
  }, [waLabels]);

  const isArchivedView = labelFilter === "archived";

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/support/conversations", isArchivedView],
    queryFn: async () => {
      const url = isArchivedView ? "/api/support/conversations?archived=true" : "/api/support/conversations";
      const resp = await fetch(url, { credentials: "include" });
      return resp.json();
    },
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
    enabled: !!selectedConvId,
    refetchInterval: 8000,
    staleTime: 4000,
  });

  const { data: teamData } = useQuery<{ members: TeamMember[]; total: number }>({
    queryKey: ["/api/team"],
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

  // Reset select mode when switching views
  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [labelFilter]);

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
    mutationFn: async ({ text, referenceMessageId }: { text: string; referenceMessageId?: string }) => {
      lastSentTextRef.current = text;
      return apiRequest("POST", `/api/support/conversations/${selectedConvId}/messages`, { text, referenceMessageId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations", selectedConvId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      setReplyingTo(null);
      inputRef.current?.focus();
    },
    onError: () => {
      setMessageText(lastSentTextRef.current);
    },
  });

  const mediaUploadMutation = useMutation({
    mutationFn: async (file: globalThis.File) => {
      if (!selectedConvId) throw new Error("No conversation selected");
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch(`/api/support/conversations/${selectedConvId}/media`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations", selectedConvId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      setPastedImage(prev => {
        if (prev) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
    },
    onError: (error: Error) => {
      toast({ title: "Media send failed", description: error.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ ids, unarchive }: { ids: string[]; unarchive?: boolean }) =>
      apiRequest("POST", `/api/support/conversations/${unarchive ? "unarchive" : "archive"}`, { ids }),
    onSuccess: (_, { ids, unarchive }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations", true] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations", false] });
      setSelectedIds(new Set());
      setSelectMode(false);
      if (selectedConvId && ids.includes(selectedConvId) && !unarchive) {
        setSelectedConvId(null);
      }
      toast({
        title: unarchive ? "Unarchived" : "Archived",
        description: `${ids.length} conversation${ids.length > 1 ? "s" : ""} ${unarchive ? "unarchived" : "archived"}`,
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      mediaUploadMutation.mutate(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const blob = imageItem.getAsFile();
    if (!blob) return;
    const previewUrl = URL.createObjectURL(blob);
    setPastedImage({ blob, previewUrl });
  }, []);

  const sendPastedImage = async () => {
    if (!pastedImage || !selectedConvId) return;
    setIsUploadingPaste(true);
    try {
      const ext = pastedImage.blob.type.split("/")[1] || "png";
      const file = new File([pastedImage.blob], `paste-${Date.now()}.${ext}`, { type: pastedImage.blob.type });
      await mediaUploadMutation.mutateAsync(file);
    } finally {
      setIsUploadingPaste(false);
    }
  };

  const clearPastedImage = () => {
    if (pastedImage) URL.revokeObjectURL(pastedImage.previewUrl);
    setPastedImage(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimes = [
        { mime: "audio/ogg;codecs=opus", ext: "ogg", type: "audio/ogg" },
        { mime: "audio/webm;codecs=opus", ext: "webm", type: "audio/webm" },
        { mime: "audio/webm", ext: "webm", type: "audio/webm" },
      ];
      const supported = preferredMimes.find(m => MediaRecorder.isTypeSupported(m.mime)) || preferredMimes[1];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: supported.mime });
      mediaRecorderRef.current = mediaRecorder;
      recordingChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recordingChunksRef.current, { type: supported.type });
        const audioFile = new File([blob], `voice-message.${supported.ext}`, { type: supported.type });
        mediaUploadMutation.mutate(audioFile);
      };
      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch {
      console.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

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

  const createLabelMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) =>
      apiRequest("POST", "/api/support/labels", { name, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/labels"] });
      setNewLabelName("");
      setNewLabelColor("bg-blue-500");
    },
  });

  const updateLabelMutation = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) =>
      apiRequest("PATCH", `/api/support/labels/${id}`, { name, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/labels"] });
      setEditingLabel(null);
    },
  });

  const deleteLabelMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/support/labels/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/support/labels"] }),
  });

  const assignMutation = useMutation({
    mutationFn: async ({ convId, userId, userName }: { convId: string; userId: string | null; userName: string | null }) =>
      apiRequest("PATCH", `/api/support/conversations/${convId}/assign`, { userId, userName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] }),
  });

  const aiToggleMutation = useMutation({
    mutationFn: async ({ convId, paused }: { convId: string; paused: boolean }) =>
      apiRequest("PATCH", `/api/support/conversations/${convId}/ai-toggle`, { paused }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
    },
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

  const filtered = conversations.filter(c => {
    if (labelFilter === "unread" && c.unreadCount === 0) return false;
    if (labelFilter !== "all" && labelFilter !== "unread" && labelFilter !== "archived" && c.label !== labelFilter) return false;
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
    sendMutation.mutate({ text, referenceMessageId: replyingTo?.id });
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

  const toggleSelectConv = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id));

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <div className="w-[380px] border-r border-border flex flex-col shrink-0 bg-background">
        <div className="h-14 bg-card border-b border-border flex items-center px-4 gap-3">
          <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-primary-foreground" />
          </div>
          <h2 className="font-semibold text-foreground text-sm flex-1">Chats</h2>
          {!isArchivedView && totalUnread > 0 && (
            <Badge variant="default" className="text-xs rounded-full bg-green-500 text-white border-green-500" data-testid="badge-total-unread">
              {totalUnread}
            </Badge>
          )}
          {selectMode ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
              className="text-xs"
              data-testid="button-cancel-select"
            >
              Cancel
            </Button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(showFilters && "text-primary")}
              data-testid="button-toggle-filters"
            >
              <Filter className="w-5 h-5" />
            </Button>
          )}
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
            {[
              { key: "all", label: "All" },
              { key: "unread", label: "Unread" },
              { key: "archived", label: "Archived" },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => { setLabelFilter(f.key); setSelectedConvId(null); }}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all border flex items-center gap-1",
                  labelFilter === f.key
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "bg-card text-muted-foreground border-border hover-elevate"
                )}
                data-testid={`filter-${f.key}`}
              >
                {f.key === "archived" && <Archive className="w-3 h-3" />}
                {f.label}
              </button>
            ))}
            {waLabels.map(l => (
              <button
                key={l.id}
                onClick={() => setLabelFilter(l.name)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all border",
                  labelFilter === l.name
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "bg-card text-muted-foreground border-border hover-elevate"
                )}
                data-testid={`filter-${l.name.toLowerCase()}`}
              >
                <span className={cn("inline-block w-2 h-2 rounded-full mr-1.5", l.color)} />
                {l.name}
              </button>
            ))}
            <button
              onClick={() => setShowLabelManager(true)}
              className="px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground"
              data-testid="button-manage-labels"
            >
              <Settings2 className="w-3 h-3 inline mr-1" />
              Manage
            </button>
          </div>
        )}

        {/* Multi-select bulk action bar */}
        {selectMode && selectedIds.size > 0 && (
          <div className="px-3 pb-2 flex items-center gap-2 bg-accent/50 border-b border-border py-2">
            <span className="text-xs font-medium flex-1">{selectedIds.size} selected</span>
            {isArchivedView ? (
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 gap-1"
                disabled={archiveMutation.isPending}
                onClick={() => archiveMutation.mutate({ ids: Array.from(selectedIds), unarchive: true })}
                data-testid="button-bulk-unarchive"
              >
                <ArchiveRestore className="w-3.5 h-3.5" />
                Unarchive
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 gap-1"
                disabled={archiveMutation.isPending}
                onClick={() => archiveMutation.mutate({ ids: Array.from(selectedIds) })}
                data-testid="button-bulk-archive"
              >
                <Archive className="w-3.5 h-3.5" />
                Archive
              </Button>
            )}
          </div>
        )}

        {/* Select All header row */}
        {selectMode && (
          <div
            className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-accent/30 border-b border-border"
            onClick={() => {
              if (allSelected) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(filtered.map(c => c.id)));
              }
            }}
            data-testid="button-select-all"
          >
            {allSelected ? (
              <CheckSquare className="w-4 h-4 text-primary" />
            ) : selectedIds.size > 0 ? (
              <MinusSquare className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Square className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground">Select all</span>
          </div>
        )}

        <ScrollArea className="flex-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <MessageCircle className="w-12 h-12 mx-auto opacity-20 mb-3" />
              {search
                ? "No conversations match your search"
                : isArchivedView
                ? "No archived conversations"
                : "No conversations yet"}
            </div>
          ) : (
            filtered.map((conv) => {
              const labelInfo = getLabelInfo(conv.label);
              const isSelected = selectedConvId === conv.id;
              const isChecked = selectedIds.has(conv.id);
              return (
                <div
                  key={conv.id}
                  className={cn(
                    "w-full px-3 py-3 text-left transition-colors flex items-center gap-3 border-b border-border cursor-pointer",
                    isSelected && !selectMode ? "bg-accent" : "hover-elevate"
                  )}
                  data-testid={`button-conversation-${conv.id}`}
                  onClick={() => {
                    if (selectMode) {
                      toggleSelectConv(conv.id);
                    } else {
                      setSelectedConvId(conv.id);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectMode(true);
                    setSelectedIds(new Set([conv.id]));
                  }}
                >
                  {selectMode && (
                    <div className="shrink-0 flex items-center justify-center" onClick={e => { e.stopPropagation(); toggleSelectConv(conv.id); }}>
                      {isChecked
                        ? <CheckSquare className="w-4 h-4 text-primary" />
                        : <Square className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  )}
                  <div className="relative shrink-0">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-base",
                      labelInfo ? labelInfo.color : "bg-primary"
                    )}>
                      {(conv.contactName ?? conv.contactPhone).charAt(0).toUpperCase()}
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-green-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold shadow-sm">
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className={cn("text-sm truncate", conv.unreadCount > 0 ? "font-bold text-foreground" : "text-foreground")} data-testid={`text-contact-${conv.id}`}>
                          {conv.contactName || `+${conv.contactPhone}`}
                        </span>
                        {labelInfo && (
                          <span className={cn("text-[9px] text-white px-1 py-0 rounded shrink-0 leading-tight", labelInfo.color)}>
                            {labelInfo.name}
                          </span>
                        )}
                      </div>
                      <span className={cn("text-xs whitespace-nowrap shrink-0", conv.unreadCount > 0 ? "text-primary font-medium" : "text-muted-foreground")}>
                        {formatChatTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {conv.orderNumber && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                          #{conv.orderNumber}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <p className={cn("text-xs truncate flex-1", conv.unreadCount > 0 ? "text-foreground" : "text-muted-foreground")}>
                        {conv.lastMessage || "No messages"}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        {conv.assignedToName && (
                          <span className="text-[10px] text-muted-foreground ml-2 flex items-center gap-0.5">
                            <UserPlus className="w-2.5 h-2.5" />
                            {conv.assignedToName.split(" ")[0]}
                          </span>
                        )}
                        {!selectMode && (
                          <button
                            className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground p-0.5 rounded"
                            onClick={e => {
                              e.stopPropagation();
                              archiveMutation.mutate({ ids: [conv.id], unarchive: conv.isArchived });
                            }}
                            title={conv.isArchived ? "Unarchive" : "Archive"}
                            data-testid={`button-archive-${conv.id}`}
                          >
                            {conv.isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </ScrollArea>

        {!selectMode && filtered.length > 0 && (
          <div className="px-3 py-1.5 border-t border-border flex items-center justify-between">
            <button
              onClick={() => setSelectMode(true)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-0.5"
              data-testid="button-enter-select-mode"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Select
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center wa-chat-bg">
            <div className="text-center space-y-4">
              <div className="w-[200px] h-[200px] mx-auto opacity-30">
                <svg viewBox="0 0 303 172" className="w-full h-full text-muted-foreground">
                  <path fill="currentColor" d="M229.565 160.229c-1.167-5.6-15.846-7.676-15.846-7.676s-1.924-7.318 4.434-12.516c0 0-3.449-.449-5.629 1.542-.063-1.592.237-4.767 3.232-8.529 0 0-3.63.579-5.502 3.165-.063-1.17.021-3.36 1.308-5.862 0 0-4.725 3.133-5.044 9.18-.108 1.851.355 3.693.355 3.693s-2.366-2.079-4.188-3.384c-1.822-1.304-3.27-1.593-3.27-1.593.893 1.17 2.854 3.489 4.48 5.133 1.627 1.644 3.093 2.568 3.093 2.568s-1.376-.193-4.38-1.542c-3.003-1.35-4.245-1.869-4.245-1.869 1.82 2.198 5.27 4.135 7.135 5.017 1.864.882 2.854 1.044 2.854 1.044s-4.91 1.205-8.529 2.925c-3.618 1.72-5.273 3.043-5.273 3.043 4.188-.32 10.627-1.891 13.556-2.977 2.928-1.086 4.053-1.689 4.053-1.689s.466 1.415.94 3.768c.424 2.108.947 4.576 1.503 7.084l15.963-1.524zM173.468 86.532l.016-.018c1.277-1.456 3.471-1.552 4.876-.215l.004.004c1.404 1.338 1.457 3.577.117 4.981l-.016.018-15.493 17.679-5.013-4.78 15.51-17.649z" opacity=".3"/>
                  <path fill="currentColor" d="M159.36 108.376l-14.193 15.161-8.058-7.685 14.221-15.176 8.03 7.7z" opacity=".15"/>
                  <path fill="currentColor" d="M145.09 123.556L136.14 133l-7.993-7.623 8.887-9.437 8.057 7.616z" opacity=".08"/>
                </svg>
              </div>
              <h3 className="text-xl font-light text-foreground/60">WhatsApp Business</h3>
              <p className="text-sm text-muted-foreground max-w-sm">Select a conversation to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            <div className="h-[60px] wa-header flex items-center px-4 gap-3 shrink-0">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-semibold shrink-0">
                {(selectedConv.contactName ?? selectedConv.contactPhone).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-white" data-testid="text-selected-contact">
                  {selectedConv.contactName || `+${selectedConv.contactPhone}`}
                </p>
                <div className="flex items-center gap-2 text-xs text-white/70 flex-wrap">
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
                  {getLabelInfo(selectedConv.label) && (
                    <>
                      <span>·</span>
                      <span className={cn("px-1.5 py-0 rounded text-[10px] text-white", getLabelInfo(selectedConv.label)!.color)}>
                        {getLabelInfo(selectedConv.label)!.name}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <Button
                size="sm"
                variant="ghost"
                data-testid="button-ai-toggle"
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 h-7 transition-colors",
                  selectedConv.aiPaused
                    ? "bg-white/10 text-white/70 hover:bg-white/20"
                    : "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                )}
                disabled={aiToggleMutation.isPending}
                onClick={() => aiToggleMutation.mutate({ convId: selectedConv.id, paused: !selectedConv.aiPaused })}
              >
                {aiToggleMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : selectedConv.aiPaused ? (
                  <Pause className="w-3 h-3" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                {selectedConv.aiPaused ? "AI Off" : "AI On"}
              </Button>

              <Button
                size="sm"
                variant="ghost"
                data-testid="button-file-complaint"
                className="flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 h-7 bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
                onClick={() => setShowFileComplaint(true)}
              >
                <ClipboardList className="w-3 h-3" />
                File Complaint
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" data-testid="button-chat-menu" className="text-white hover:bg-white/10">
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
                      {waLabels.map(l => (
                        <DropdownMenuItem
                          key={l.id}
                          onClick={() => labelMutation.mutate({ convId: selectedConv.id, label: l.name })}
                          data-testid={`label-${l.name.toLowerCase()}`}
                        >
                          <span className={cn("w-3 h-3 rounded-full mr-2", l.color)} />
                          {l.name}
                          {selectedConv.label === l.name && <Check className="w-4 h-4 ml-auto" />}
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
                    onClick={() => archiveMutation.mutate({ ids: [selectedConv.id], unarchive: selectedConv.isArchived })}
                    data-testid="button-archive-selected"
                  >
                    {selectedConv.isArchived ? (
                      <><ArchiveRestore className="w-4 h-4 mr-2" />Unarchive conversation</>
                    ) : (
                      <><Archive className="w-4 h-4 mr-2" />Archive conversation</>
                    )}
                  </DropdownMenuItem>

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

            <ScrollArea className="flex-1 wa-chat-bg">
              <div className="px-[8%] py-4 space-y-1">
                {messages.filter(m => m.messageType !== "reaction").length === 0 ? (
                  <div className="text-center py-8">
                    <span className="bg-white dark:bg-[#202c33] text-muted-foreground text-xs px-4 py-2 rounded-lg inline-block shadow-sm">
                      No messages yet — start the conversation
                    </span>
                  </div>
                ) : (
                  messagesByDate.map(group => (
                    <div key={group.date}>
                      <div className="flex justify-center my-3">
                        <span className="bg-white dark:bg-[#182229] text-[#54656f] dark:text-[#8696a0] text-[11px] px-3 py-1.5 rounded-lg shadow-sm">
                          {formatDateHeader(group.date)}
                        </span>
                      </div>
                      {group.messages.map(msg => {
                        const isOutbound = msg.direction === "outbound";
                        const msgReactions = getReactionsForMessage(msg.waMessageId);
                        const isButtonReply = msg.messageType === "button_reply";
                        const isNonText = msg.messageType && !["text", "button_reply"].includes(msg.messageType);
                        const hasQuote = !!msg.referenceMessageId && messages.some(m => m.id === msg.referenceMessageId);

                        return (
                          <div
                            key={msg.id}
                            className={cn("flex mb-1 group", isOutbound ? "justify-end" : "justify-start")}
                            data-testid={`message-${msg.id}`}
                          >
                            <div className={cn("relative max-w-[65%]", isOutbound ? "mr-2" : "ml-2")}>
                              <div className={cn(
                                "relative px-2.5 py-1.5 rounded-lg text-sm shadow-sm",
                                isOutbound
                                  ? "wa-bubble-out text-[#111b21] dark:text-[#e9edef] rounded-tr-none"
                                  : "wa-bubble-in text-[#111b21] dark:text-[#e9edef] rounded-tl-none"
                              )}>
                                {hasQuote && (
                                  <QuotedMessagePreview msg={msg} messages={messages} />
                                )}
                                {isButtonReply && (
                                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium mb-1 bg-[#008069]/10 text-[#008069] dark:text-[#00a884]">
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
                                  <span className="text-[10px] text-[#667781] dark:text-[#8696a0]">
                                    {format(new Date(msg.createdAt), "HH:mm")}
                                  </span>
                                  {isOutbound && <StatusTicks status={msg.status} />}
                                </div>
                              </div>

                              {msgReactions.length > 0 && (
                                <div className={cn("flex gap-0.5 mt-[-8px]", isOutbound ? "justify-end pr-2" : "pl-2")}>
                                  {msgReactions.map(r => (
                                    <span key={r.id} className="bg-white dark:bg-[#202c33] border border-black/5 dark:border-white/10 rounded-full px-1.5 py-0.5 text-sm shadow-sm">
                                      {r.reactionEmoji}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Hover action buttons */}
                              <div className={cn(
                                "absolute top-1 invisible group-hover:visible transition-opacity flex gap-0.5",
                                isOutbound ? "right-full mr-1" : "left-full ml-1"
                              )}>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 bg-white/80 dark:bg-[#202c33]/80 shadow-sm rounded-full"
                                  onClick={() => setReplyingTo(msg)}
                                  title="Reply"
                                  data-testid={`reply-${msg.id}`}
                                >
                                  <Reply className="w-3.5 h-3.5" />
                                </Button>
                                {!isOutbound && msg.waMessageId && (
                                  <EmojiPicker
                                    onSelect={(emoji) => reactMutation.mutate({ convId: selectedConv.id, emoji, waMessageId: msg.waMessageId! })}
                                    trigger={
                                      <Button size="icon" variant="ghost" className="h-7 w-7 bg-white/80 dark:bg-[#202c33]/80 shadow-sm rounded-full" data-testid={`react-${msg.id}`}>
                                        <Smile className="w-3.5 h-3.5" />
                                      </Button>
                                    }
                                    side={isOutbound ? "left" : "right"}
                                  />
                                )}
                              </div>
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

            <div className="wa-input-bar px-3 py-2">
              {/* Pasted image preview */}
              {pastedImage && (
                <div className="flex items-center gap-3 mb-2 p-2 bg-muted/50 rounded-lg border border-border">
                  <img
                    src={pastedImage.previewUrl}
                    alt="Paste preview"
                    className="w-14 h-14 object-cover rounded-md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">Image ready to send</p>
                    <p className="text-[11px] text-muted-foreground">Click Send to deliver</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={clearPastedImage}
                    data-testid="button-clear-pasted-image"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={sendPastedImage}
                    disabled={isUploadingPaste || mediaUploadMutation.isPending}
                    className="shrink-0 bg-[#008069] hover:bg-[#017561] text-white h-8"
                    data-testid="button-send-pasted-image"
                  >
                    {isUploadingPaste ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Send
                  </Button>
                </div>
              )}

              {/* Reply-to strip */}
              {replyingTo && (
                <div className="flex items-center gap-2 mb-1.5 px-2 py-1.5 bg-[#f0f2f5] dark:bg-[#2a3942] rounded-lg border-l-[3px] border-l-[#00a884]">
                  <Reply className="w-3.5 h-3.5 text-[#00a884] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-[#00a884]">
                      {replyingTo.direction === "inbound" ? (replyingTo.senderName || "Customer") : "You"}
                    </div>
                    <div className="text-[11px] text-[#54656f] dark:text-[#8696a0] truncate">
                      {replyingTo.text || (replyingTo.messageType === "image" ? "📷 Image" : replyingTo.messageType === "audio" ? "🎵 Audio" : "Message")}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setReplyingTo(null)}
                    data-testid="button-cancel-reply"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-1 mb-1">
                <Button size="icon" variant="ghost" onClick={() => insertFormatting("*", "*")} title="Bold" data-testid="button-format-bold" className="h-7 w-7 text-[#54656f] dark:text-[#8696a0]">
                  <Bold className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => insertFormatting("_", "_")} title="Italic" data-testid="button-format-italic" className="h-7 w-7 text-[#54656f] dark:text-[#8696a0]">
                  <Italic className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => insertFormatting("~", "~")} title="Strikethrough" data-testid="button-format-strike" className="h-7 w-7 text-[#54656f] dark:text-[#8696a0]">
                  <Strikethrough className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => insertFormatting("```", "```")} title="Code" data-testid="button-format-code" className="h-7 w-7 text-[#54656f] dark:text-[#8696a0]">
                  <Code className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-end gap-1.5">
                <EmojiPicker
                  onSelect={(emoji) => {
                    setMessageText(prev => prev + emoji);
                    inputRef.current?.focus();
                  }}
                  trigger={
                    <Button size="icon" variant="ghost" className="shrink-0 mb-0.5 text-[#54656f] dark:text-[#8696a0] hover:text-[#008069]" data-testid="button-emoji-picker">
                      <Smile className="w-5 h-5" />
                    </Button>
                  }
                  side="top"
                  align="start"
                />
                <div className="relative shrink-0 mb-0.5">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                    onChange={handleFileSelect}
                    data-testid="input-file-upload"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[#54656f] dark:text-[#8696a0] hover:text-[#008069]"
                    disabled={mediaUploadMutation.isPending}
                    data-testid="button-attach-file"
                  >
                    {mediaUploadMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                  </Button>
                </div>
                <textarea
                  ref={inputRef}
                  placeholder={replyingTo ? "Write a reply..." : "Type a message — or paste an image with Ctrl+V"}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  rows={1}
                  className="flex-1 resize-none bg-white dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef] rounded-lg px-3 py-2.5 text-sm placeholder:text-[#667781] dark:placeholder:text-[#8696a0] outline-none focus:ring-0 max-h-[120px] min-h-[42px]"
                  style={{ height: "auto", overflow: messageText.split("\n").length > 3 ? "auto" : "hidden" }}
                  data-testid="input-message"
                />
                {messageText.trim() ? (
                  <Button
                    size="icon"
                    onClick={() => handleSend()}
                    disabled={sendMutation.isPending}
                    className="shrink-0 mb-0.5 bg-[#008069] hover:bg-[#017561] text-white rounded-full h-10 w-10"
                    data-testid="button-send-message"
                  >
                    <Send className="w-5 h-5" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={isRecording ? stopRecording : startRecording}
                    className={cn("shrink-0 mb-0.5 rounded-full h-10 w-10", isRecording ? "bg-red-500 hover:bg-red-600 text-white" : "text-[#54656f] dark:text-[#8696a0] hover:text-[#008069]")}
                    disabled={mediaUploadMutation.isPending}
                    data-testid="button-voice-record"
                  >
                    {isRecording ? <StopCircle className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </Button>
                )}
              </div>
              {isRecording && (
                <div className="flex items-center gap-2 mt-2 text-red-500 text-xs animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  Recording... {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <Dialog open={showLabelManager} onOpenChange={setShowLabelManager}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Labels</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {waLabels.map(l => (
                <div key={l.id} className="flex items-center gap-2 p-2 rounded-md border border-border">
                  {editingLabel?.id === l.id ? (
                    <>
                      <Input
                        value={editingLabel.name}
                        onChange={(e) => setEditingLabel({ ...editingLabel, name: e.target.value })}
                        className="h-8 text-sm flex-1"
                        data-testid={`input-edit-label-${l.id}`}
                      />
                      <div className="flex gap-1 flex-wrap">
                        {LABEL_COLORS.map(c => (
                          <button
                            key={c.value}
                            onClick={() => setEditingLabel({ ...editingLabel, color: c.value })}
                            className={cn(
                              "w-5 h-5 rounded-full border-2",
                              c.value,
                              editingLabel.color === c.value ? "border-foreground scale-110" : "border-transparent"
                            )}
                            title={c.label}
                          />
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateLabelMutation.mutate({ id: l.id, name: editingLabel.name, color: editingLabel.color })}
                        disabled={updateLabelMutation.isPending}
                        data-testid={`button-save-label-${l.id}`}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingLabel(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className={cn("w-4 h-4 rounded-full shrink-0", l.color)} />
                      <span className="text-sm flex-1">{l.name}</span>
                      {l.isSystem && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">System</span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingLabel({ ...l })}
                        data-testid={`button-edit-label-${l.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteLabelMutation.mutate(l.id)}
                        disabled={deleteLabelMutation.isPending}
                        className="text-destructive hover:text-destructive"
                        data-testid={`button-delete-label-${l.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-sm font-medium">Add New Label</p>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Label name..."
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  className="h-8 text-sm flex-1"
                  data-testid="input-new-label-name"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (newLabelName.trim()) {
                      createLabelMutation.mutate({ name: newLabelName.trim(), color: newLabelColor });
                    }
                  }}
                  disabled={!newLabelName.trim() || createLabelMutation.isPending}
                  data-testid="button-create-label"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {LABEL_COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setNewLabelColor(c.value)}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 transition-transform",
                      c.value,
                      newLabelColor === c.value ? "border-foreground scale-110" : "border-transparent"
                    )}
                    title={c.label}
                    data-testid={`color-${c.label.toLowerCase()}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showFileComplaint && selectedConv && (
        <FileComplaintFromChat
          open={showFileComplaint}
          onOpenChange={setShowFileComplaint}
          conversation={selectedConv}
        />
      )}
    </div>
  );
}

function FileComplaintFromChat({
  open,
  onOpenChange,
  conversation,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversation: Conversation;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [ticketCreated, setTicketCreated] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/support/complaints", {
        orderId: conversation.orderId || undefined,
        orderNumber: conversation.orderNumber || undefined,
        customerName: conversation.contactName || undefined,
        customerPhone: conversation.contactPhone || undefined,
        conversationId: conversation.id,
        source: "whatsapp_chat",
        reason: reason || undefined,
      }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      setTicketCreated(data.ticketNumber);
      queryClient.invalidateQueries({ queryKey: ["/api/support/complaints"] });
      toast({ title: "Complaint filed", description: `Ticket: ${data.ticketNumber}` });
    },
    onError: () => {
      toast({ title: "Failed to create complaint", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>File Complaint</DialogTitle>
        </DialogHeader>
        {ticketCreated ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-950/30 rounded-full flex items-center justify-center mx-auto">
              <ClipboardList className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Complaint Filed</p>
              <p className="text-lg font-mono font-bold mt-1" data-testid="text-created-ticket">{ticketCreated}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Customer: {conversation.contactName || conversation.contactPhone}
            </p>
            <Button size="sm" onClick={() => onOpenChange(false)} data-testid="button-close-complaint-success">
              Close
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{conversation.contactName || conversation.contactPhone}</span>
              </div>
              {conversation.orderNumber && (
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Order</span>
                  <span className="font-medium">{conversation.orderNumber}</span>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Reason for Complaint</Label>
                <Textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Describe the issue..."
                  rows={3}
                  data-testid="textarea-complaint-reason"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                data-testid="button-submit-complaint"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                File Complaint
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
