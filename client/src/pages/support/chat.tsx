import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearch } from "wouter";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MessageCircle, Search, Send, Trash2, Phone,
  MoreVertical, Tag, UserPlus, Check, CheckCheck,
  Smile, Bold, Italic, Strikethrough, Code, Filter,
  X, ChevronDown, Image as ImageIcon, Mic, FileText,
  MapPin, Users, Reply, Download, Play, Pause, Volume2, VolumeX,
  ExternalLink, File as FileIcon, Video, Plus, Pencil, Settings2,
  Paperclip, Camera, FileUp, Loader2, ClipboardList, AlertCircle,
  Archive, ArchiveRestore, CheckSquare, Square, MinusSquare, Copy, Info,
  ArrowDown, ChevronUp, Zap, Images, Link as LinkIcon, GalleryHorizontal,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  linkPreviewUrl: string | null;
  linkPreviewData: { url: string; title: string | null; description: string | null; image: string | null; siteName: string | null } | null;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
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

interface WaContact {
  name?: { formatted_name?: string };
  phones?: Array<{ phone?: string }>;
}

interface WaTemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | string;
  text: string;
  url?: string | null;
  phone_number?: string | null;
}

interface WaTemplateComponentParameter {
  type: string;
  text?: string;
  [key: string]: unknown;
}

interface WaTemplateComponent {
  type: "header" | "body" | "button" | string;
  parameters?: WaTemplateComponentParameter[];
  sub_type?: string;
  index?: number;
}

interface WaMetaTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  headerType: string;
  headerText: string | null;
  body: string | null;
  footer: string | null;
  buttons: WaTemplateButton[];
  status: string;
}

interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
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

function getAvatarGradient(name: string): string {
  const gradients = [
    "bg-gradient-to-br from-blue-500 to-blue-700",
    "bg-gradient-to-br from-violet-500 to-violet-700",
    "bg-gradient-to-br from-emerald-500 to-emerald-700",
    "bg-gradient-to-br from-blue-600 to-violet-600",
    "bg-gradient-to-br from-violet-500 to-emerald-600",
    "bg-gradient-to-br from-emerald-500 to-blue-600",
  ];
  if (!name?.length) return gradients[0];
  return gradients[name.charCodeAt(0) % gradients.length];
}

function StatusTicks({ status, createdAt, sentAt, deliveredAt, readAt }: {
  status: string | null;
  createdAt?: string | Date;
  sentAt?: string | Date;
  deliveredAt?: string | Date;
  readAt?: string | Date;
}) {
  const formatTimestamp = (ts: string | Date | undefined) =>
    ts ? format(new Date(ts), "MMM d, HH:mm:ss") : null;

  const tooltipLines: string[] = [];
  if (createdAt) tooltipLines.push(`Sent: ${formatTimestamp(createdAt)}`);
  if (deliveredAt) tooltipLines.push(`Delivered: ${formatTimestamp(deliveredAt)}`);
  if (readAt) tooltipLines.push(`Read: ${formatTimestamp(readAt)}`);

  const icon =
    status === "read" ? <CheckCheck className="w-3.5 h-3.5 text-blue-400 inline-block ml-1" /> :
    status === "delivered" ? <CheckCheck className="w-3.5 h-3.5 text-muted-foreground inline-block ml-1" /> :
    status === "sent" ? <Check className="w-3.5 h-3.5 text-muted-foreground inline-block ml-1" /> :
    status === "failed" ? <AlertCircle className="w-3.5 h-3.5 text-red-500 inline-block ml-1" /> :
    null;

  if (!icon) return null;

  if (tooltipLines.length === 0) return icon;

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default">{icon}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {tooltipLines.map((line, i) => <div key={i}>{line}</div>)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
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
      parts.push(<a key={key++} href={m} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline break-all hover:text-blue-600">{m}</a>);
    }
    lastIndex = match.index + m.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function highlightSearchText(text: string, query: string): JSX.Element {
  if (!query || query.length < 2) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-400/40 text-inherit rounded-sm px-px">{text.slice(idx, idx + query.length)}</mark>
      {highlightSearchText(text.slice(idx + query.length), query)}
    </>
  );
}

type LinkPreviewData = { url: string; title: string | null; description: string | null; image: string | null; siteName: string | null };

function LinkPreviewBubble({ storedData, url, messageId }: { storedData?: LinkPreviewData | null; url?: string | null; messageId?: string | null }) {
  const resolvedUrl = storedData?.url ?? url ?? null;
  const { data: fetchedData } = useQuery<LinkPreviewData | null>({
    queryKey: ["/api/whatsapp/link-preview", resolvedUrl],
    queryFn: async () => {
      if (!resolvedUrl) return null;
      const resp = await fetch(`/api/whatsapp/link-preview?url=${encodeURIComponent(resolvedUrl)}`, { credentials: "include" });
      if (!resp.ok) return null;
      return resp.json();
    },
    enabled: !storedData && !!resolvedUrl,
    staleTime: 1000 * 60 * 30,
    retry: false,
  });

  // Persist fetched OG data back to the message record for durable first-view caching
  const persistedRef = useRef(false);
  useEffect(() => {
    if (!fetchedData || storedData || !messageId || persistedRef.current) return;
    if (!fetchedData.title && !fetchedData.description) return;
    persistedRef.current = true;
    fetch(`/api/support/messages/${messageId}/link-preview`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ linkPreviewUrl: fetchedData.url, linkPreviewData: fetchedData }),
    }).catch(() => { /* fire-and-forget */ });
  }, [fetchedData, storedData, messageId]);

  const data = storedData ?? fetchedData;
  if (!data || (!data.title && !data.description)) return null;
  return (
    <div className="mt-1.5 rounded-md border border-black/10 dark:border-white/10 overflow-hidden bg-black/5 dark:bg-white/5">
      {data.image && (
        <img src={data.image} alt={data.title || "Preview"} className="w-full h-24 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      )}
      <div className="px-2.5 py-1.5">
        {data.siteName && <p className="text-[10px] text-[#008069] font-semibold uppercase tracking-wide">{data.siteName}</p>}
        {data.title && <p className="text-xs font-semibold leading-tight mt-0.5 line-clamp-2">{data.title}</p>}
        {data.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{data.description}</p>}
      </div>
    </div>
  );
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

const TEMPLATE_VAR_ORDER = ["name", "order_number", "items", "order_total", "tracking_number", "tracking_link", "courier_name", "new_status", "city", "address", "shipping_amount"];
const TEMPLATE_VAR_LABELS: Record<string, string> = {
  name: "Customer Name",
  order_number: "Order #",
  items: "Items",
  order_total: "Total",
  tracking_number: "Tracking #",
  tracking_link: "Tracking Link (URL)",
  courier_name: "Courier",
  new_status: "Status",
  city: "City",
  address: "Address",
  shipping_amount: "Shipping",
};

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
        preload="auto"
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
                  "flex-1 rounded-full",
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
    let contacts: WaContact[] = [];
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
        {contacts.map((c: WaContact, i: number) => {
          const name = c.name?.formatted_name || "Unknown";
          const phones = c.phones?.map((p) => p.phone).filter(Boolean) || [];
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

function QuotedMessagePreview({ msg, messages, onJumpToQuoted }: {
  msg: Message;
  messages: Message[];
  onJumpToQuoted?: (id: string) => void;
}) {
  const quoted = messages.find(m => m.id === msg.referenceMessageId);
  if (!quoted) return null;
  const isInboundQuote = quoted.direction === "inbound";
  const previewText = quoted.text || (quoted.messageType === "image" ? "📷 Image" : quoted.messageType === "audio" ? "🎵 Audio" : quoted.messageType === "video" ? "🎬 Video" : quoted.messageType === "document" ? "📄 Document" : "Message");
  return (
    <div
      className={cn(
        "mb-1.5 rounded-md px-2 py-1 text-xs border-l-[3px] bg-black/5 dark:bg-white/5 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors",
        isInboundQuote ? "border-l-[#128C7E]" : "border-l-[#007AFF]"
      )}
      onClick={() => onJumpToQuoted?.(quoted.id)}
    >
      <div className={cn("font-semibold mb-0.5", isInboundQuote ? "text-[#128C7E]" : "text-[#007AFF]")}>
        {isInboundQuote ? (quoted.senderName || "Customer") : (quoted.senderName || "You")}
      </div>
      <div className="truncate text-[#54656f] dark:text-[#8696a0]">{previewText}</div>
    </div>
  );
}

// Web Audio notification sound
let audioCtx: AudioContext | null = null;
function playNotificationSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const ctx = audioCtx;
    // Resume suspended context (required after browser autoplay policy blocks initial creation)
    const play = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  } catch {}
}

// Message context menu component
interface MsgContextMenuState {
  x: number;
  y: number;
  msg: Message;
}

export default function SupportChatPage() {
  const searchStr = useSearch();
  const deepLinkOrderId = new URLSearchParams(searchStr).get("orderId");
  const deepLinkApplied = useRef(false);

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
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const firstConvLoadRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingBarsRef = useRef<number[]>(new Array(22).fill(5));
  const [recordingBars, setRecordingBars] = useState<number[]>(new Array(22).fill(5));
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingRafRef = useRef<number | null>(null);
  const recordDiscardRef = useRef(false);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const [showFileComplaint, setShowFileComplaint] = useState(false);

  // Archive multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Context menu state (conversation list)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conv: Conversation } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Message context menu state
  const [msgContextMenu, setMsgContextMenu] = useState<MsgContextMenuState | null>(null);
  const msgContextMenuRef = useRef<HTMLDivElement>(null);

  // Scroll-to-bottom FAB / new messages banner state
  const [showScrollFab, setShowScrollFab] = useState(false);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const isNearBottomRef = useRef(true);

  // Highlighted message (jump-to-quoted flash)
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mute toggle
  const [soundMuted, setSoundMuted] = useState(() => {
    try { return localStorage.getItem("chat-sound-muted") === "true"; } catch { return false; }
  });

  // Long-press for mobile context menu
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reply-to-message state
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Clipboard image paste state
  const [pastedImage, setPastedImage] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [isUploadingPaste, setIsUploadingPaste] = useState(false);

  // In-conversation message search state
  const [msgSearchOpen, setMsgSearchOpen] = useState(false);
  const [msgSearchQuery, setMsgSearchQuery] = useState("");
  const [msgSearchDebounced, setMsgSearchDebounced] = useState("");
  const [msgSearchMatchIds, setMsgSearchMatchIds] = useState<string[]>([]);
  const [msgSearchIndex, setMsgSearchIndex] = useState(0);
  const msgSearchInputRef = useRef<HTMLInputElement>(null);

  // Gallery panel state
  const [galleryOpen, setGalleryOpen] = useState(false);

  // Template picker state
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<WaMetaTemplate | null>(null);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [orderVars, setOrderVars] = useState<Record<string, string> | null>(null);

  // Link preview state (compose)
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
  const [linkPreviewDismissed, setLinkPreviewDismissed] = useState(false);
  const linkPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Persist mute preference
  useEffect(() => {
    try { localStorage.setItem("chat-sound-muted", String(soundMuted)); } catch {}
  }, [soundMuted]);

  // Rehydrate templateVars when orderVars resolves after a template was already selected
  useEffect(() => {
    if (!orderVars || !selectedTemplate?.body) return;
    const nums = [...new Set(Array.from(selectedTemplate.body.matchAll(/\{\{(\d+)\}\}/g)).map(m => m[1]))].sort();
    if (nums.length === 0) return;
    setTemplateVars(prev => {
      const next = { ...prev };
      nums.forEach(n => {
        const varKey = TEMPLATE_VAR_ORDER[parseInt(n) - 1];
        if (varKey && orderVars[varKey] && !next[n]) next[n] = orderVars[varKey];
      });
      return next;
    });
  }, [orderVars, selectedTemplate]);

  // Close conversation context menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [contextMenu]);

  // Close message context menu on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (msgContextMenuRef.current && !msgContextMenuRef.current.contains(e.target as Node)) {
        setMsgContextMenu(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMsgContextMenu(null);
    };
    if (msgContextMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEsc);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [msgContextMenu]);

  // ── SSE real-time connection ─────────────────────────────────────────────────
  const sseFailCount = useRef(0);
  const sseRef = useRef<EventSource | null>(null);
  const sseBackoffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const selectedConvIdRef = useRef<string | null>(null);
  selectedConvIdRef.current = selectedConvId;
  const soundMutedRef = useRef(soundMuted);
  soundMutedRef.current = soundMuted;

  const connectSse = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    const es = new EventSource("/api/whatsapp/sse", { withCredentials: true });
    sseRef.current = es;

    es.onopen = () => {
      sseFailCount.current = 0;
      setSseConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "new_message") {
          if (data.conversationId && data.conversationId === selectedConvIdRef.current) {
            if (data.message) {
              queryClient.setQueryData<{ messages: Message[]; total: number; hasMore: boolean }>(
                ["/api/support/conversations", data.conversationId, "messages"],
                (old) => {
                  if (!old) return { messages: [data.message], total: 1, hasMore: false };
                  if (old.messages.some(m => m.id === data.message.id)) return old;
                  // Only auto-scroll if near bottom; otherwise increment new msg count
                  if (!isNearBottomRef.current && data.message.direction === "inbound") {
                    setNewMsgCount(c => c + 1);
                  }
                  if (!soundMutedRef.current && data.message.direction === "inbound") {
                    playNotificationSound();
                  }
                  return { ...old, messages: [...old.messages, data.message], total: old.total + 1 };
                }
              );
            } else {
              queryClient.invalidateQueries({
                queryKey: ["/api/support/conversations", data.conversationId, "messages"],
              });
            }
          }
          queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
        } else if (data.type === "status_update") {
          if (data.conversationId && data.conversationId === selectedConvIdRef.current) {
            queryClient.setQueryData<{ messages: Message[]; total: number; hasMore: boolean }>(
              ["/api/support/conversations", data.conversationId, "messages"],
              (old) => {
                if (!old) return old;
                return {
                  ...old,
                  messages: old.messages.map(msg =>
                    msg.waMessageId === data.waMessageId ? { ...msg, status: data.status } : msg
                  ),
                };
              }
            );
          }
        } else if (data.type === "conversation_update") {
          queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
        }
      } catch {}
    };

    es.onerror = () => {
      setSseConnected(false);
      es.close();
      sseRef.current = null;
      sseFailCount.current += 1;
      const delay = sseFailCount.current <= 3
        ? Math.min(1000 * Math.pow(2, sseFailCount.current - 1), 30_000)
        : 30_000;
      sseBackoffRef.current = setTimeout(connectSse, delay);
    };
  }, [queryClient]);

  useEffect(() => {
    connectSse();
    return () => {
      if (sseBackoffRef.current) clearTimeout(sseBackoffRef.current);
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
      setSseConnected(false);
    };
  }, [connectSse]);

  const convPollInterval = sseConnected ? 60_000 : 10_000;
  const msgPollInterval = sseConnected ? 30_000 : 8_000;

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
    refetchInterval: convPollInterval,
    staleTime: 5000,
  });

  const { data: archivedConversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/support/conversations", true],
    queryFn: async () => {
      const resp = await fetch("/api/support/conversations?archived=true", { credentials: "include" });
      return resp.json();
    },
    refetchInterval: 30000,
    staleTime: 15000,
    enabled: !isArchivedView,
  });

  const archivedCount = isArchivedView ? conversations.length : archivedConversations.length;

  // Fetch order vars when template picker opens for a conversation with a linked order
  const selectedConvOrderId = conversations.find(c => c.id === selectedConvId)?.orderId;
  useEffect(() => {
    if (!templatePickerOpen || !selectedConvId || !selectedConvOrderId) {
      setOrderVars(null);
      return;
    }
    fetch(`/api/support/conversations/${selectedConvId}/order-vars`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => setOrderVars(data?.vars ?? null))
      .catch(() => setOrderVars(null));
  }, [templatePickerOpen, selectedConvId, selectedConvOrderId]);

  useEffect(() => {
    if (!deepLinkOrderId || deepLinkApplied.current || conversations.length === 0) return;
    const match = conversations.find(c => c.orderId === deepLinkOrderId);
    if (match) {
      deepLinkApplied.current = true;
      setSelectedConvId(match.id);
    }
  }, [conversations, deepLinkOrderId]);

  // ── Pagination state ─────────────────────────────────────────────────────────
  const PAGE_SIZE = 50;
  const [paginatedMessages, setPaginatedMessages] = useState<Message[]>([]);
  const [paginationOffset, setPaginationOffset] = useState(0); // how many older messages we've fetched beyond the initial page
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const prevConvIdForPaginationRef = useRef<string | null>(null);

  // Initial fetch of the last PAGE_SIZE messages
  const { data: latestPageData, isLoading: isMessagesLoading } = useQuery<{ messages: Message[]; total: number; hasMore: boolean }>({
    queryKey: ["/api/support/conversations", selectedConvId, "messages"],
    queryFn: async () => {
      if (!selectedConvId) return { messages: [], total: 0, hasMore: false };
      const resp = await fetch(`/api/support/conversations/${selectedConvId}/messages?limit=${PAGE_SIZE}&offset=0`, { credentials: "include" });
      if (!resp.ok) return { messages: [], total: 0, hasMore: false };
      return resp.json();
    },
    enabled: !!selectedConvId,
    refetchInterval: msgPollInterval,
    staleTime: 4000,
  });

  // Merge latest page data with paginated (older) messages
  useEffect(() => {
    if (!latestPageData) return;
    const convChanged = prevConvIdForPaginationRef.current !== selectedConvId;
    if (convChanged) {
      prevConvIdForPaginationRef.current = selectedConvId;
      setPaginationOffset(0);
      setPaginatedMessages([]);
      setHasMoreMessages(latestPageData.hasMore);
    } else {
      setHasMoreMessages(latestPageData.hasMore);
    }
  }, [latestPageData, selectedConvId]);

  // Combined messages: older pages prepended, latest page at end (deduplicated)
  const messages = useMemo(() => {
    const latest = latestPageData?.messages ?? [];
    if (paginatedMessages.length === 0) return latest;
    const latestIds = new Set(latest.map(m => m.id));
    const olderOnly = paginatedMessages.filter(m => !latestIds.has(m.id));
    return [...olderOnly, ...latest];
  }, [paginatedMessages, latestPageData]);

  // Ref for stable access to hasMoreMessages in async contexts
  const hasMoreMessagesRef = useRef(hasMoreMessages);
  hasMoreMessagesRef.current = hasMoreMessages;

  // Load older messages when user scrolls to top
  const loadOlderMessages = useCallback(async () => {
    if (!selectedConvId || isLoadingOlder || !hasMoreMessages) return;
    const container = messagesScrollRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const prevScrollTop = container?.scrollTop ?? 0;
    setIsLoadingOlder(true);
    try {
      const newOffset = paginationOffset + PAGE_SIZE;
      const resp = await fetch(
        `/api/support/conversations/${selectedConvId}/messages?limit=${PAGE_SIZE}&offset=${newOffset}`,
        { credentials: "include" }
      );
      if (!resp.ok) return;
      const data: { messages: Message[]; total: number; hasMore: boolean } = await resp.json();
      setHasMoreMessages(data.hasMore);
      setPaginationOffset(newOffset);
      setPaginatedMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const novel = data.messages.filter(m => !existingIds.has(m.id));
        return [...novel, ...prev];
      });
      // Preserve scroll position after prepend
      requestAnimationFrame(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
        }
      });
    } finally {
      setIsLoadingOlder(false);
    }
  }, [selectedConvId, isLoadingOlder, hasMoreMessages, paginationOffset]);

  const { data: teamData } = useQuery<{ members: TeamMember[]; total: number }>({
    queryKey: ["/api/team"],
  });
  const teamMembers = teamData?.members ?? [];

  // ── Scroll helpers ───────────────────────────────────────────────────────────
  const scrollToBottom = useCallback((behavior: "smooth" | "instant" | "auto" = "smooth") => {
    const container = messagesScrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: behavior as ScrollBehavior });
  }, []);

  // Track scroll position to show/hide FAB and "near bottom" flag
  const handleChatScroll = useCallback(() => {
    const container = messagesScrollRef.current;
    if (!container) return;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distFromBottom < 200;
    isNearBottomRef.current = nearBottom;
    setShowScrollFab(!nearBottom);
    if (nearBottom) setNewMsgCount(0);
    // Load older messages when scrolled near the top
    if (container.scrollTop < 80) {
      loadOlderMessages();
    }
  }, [loadOlderMessages]);

  const prevMsgCountRef = useRef(0);

  // Track last-seen messages for polling-based new message detection
  const prevMessagesRef = useRef<Message[]>([]);

  // Auto-scroll only if near bottom; also count new inbound messages for polling fallback
  useEffect(() => {
    const count = messages.length;
    // First load for this conversation: always scroll to bottom instantly
    if (firstConvLoadRef.current && count > 0) {
      firstConvLoadRef.current = false;
      prevMsgCountRef.current = count;
      prevMessagesRef.current = messages;
      scrollToBottom("instant");
      return;
    }
    if (count !== prevMsgCountRef.current) {
      // Detect new inbound messages received via polling (when SSE is down)
      if (count > prevMsgCountRef.current && prevMessagesRef.current.length > 0) {
        const prevIds = new Set(prevMessagesRef.current.map(m => m.id));
        const newInbound = messages.filter(m => !prevIds.has(m.id) && m.direction === "inbound");
        if (newInbound.length > 0 && !isNearBottomRef.current) {
          setNewMsgCount(c => c + newInbound.length);
        }
        if (newInbound.length > 0 && !soundMutedRef.current) {
          playNotificationSound();
        }
      }
      prevMsgCountRef.current = count;
      prevMessagesRef.current = messages;
      if (isNearBottomRef.current) {
        scrollToBottom();
      }
    }
  }, [messages, scrollToBottom]);

  // When switching conversations: reset counters and mark first-load so messages effect scrolls to bottom
  useEffect(() => {
    prevMsgCountRef.current = 0;
    setNewMsgCount(0);
    setShowScrollFab(false);
    isNearBottomRef.current = true;
    firstConvLoadRef.current = true;
  }, [selectedConvId]);

  // Jump to a specific message and flash-highlight it; loads older pages if not rendered yet
  const jumpToMessage = useCallback(async (msgId: string) => {
    const tryJump = () => {
      const el = document.querySelector(`[data-msg-id="${msgId}"]`);
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      setHighlightedMsgId(msgId);
      highlightTimeoutRef.current = setTimeout(() => setHighlightedMsgId(null), 1500);
      return true;
    };
    if (tryJump()) return;
    // Message not visible — load older pages until found or no more pages remain
    for (;;) {
      if (!hasMoreMessagesRef.current) return;
      await loadOlderMessages();
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => setTimeout(r, 150));
      if (tryJump()) return;
      // loadOlderMessages sets isLoadingOlder guard — if hasMore went false, we're done
      if (!hasMoreMessagesRef.current) return;
    }
  }, [loadOlderMessages]);

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
    mutationFn: async ({ text, referenceMessageId, linkPreviewUrl, linkPreviewData }: { text: string; referenceMessageId?: string; linkPreviewUrl?: string | null; linkPreviewData?: LinkPreview | null }) => {
      lastSentTextRef.current = text;
      return apiRequest("POST", `/api/support/conversations/${selectedConvId}/messages`, { text, referenceMessageId, linkPreviewUrl: linkPreviewUrl ?? null, linkPreviewData: linkPreviewData ?? null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations", selectedConvId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      setReplyingTo(null);
      inputRef.current?.focus();
      // Scroll to bottom after sending
      setTimeout(() => scrollToBottom(), 100);
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

  const validateMediaFile = (file: globalThis.File): string | null => {
    const mime = file.type;
    if (mime.startsWith("image/")) {
      if (mime === "image/heic" || mime === "image/heif") {
        return "HEIC photos are not supported by WhatsApp. Please convert to JPEG or PNG first.";
      }
      const supported = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!supported.includes(mime)) {
        return `Image format not supported by WhatsApp. Use JPEG, PNG, WebP, or GIF.`;
      }
      if (file.size > 5 * 1024 * 1024) {
        return "Image too large for WhatsApp (max 5MB). Please compress it first.";
      }
    } else if (mime.startsWith("video/")) {
      if (file.size > 16 * 1024 * 1024) {
        return "Video too large for WhatsApp (max 16MB). Please trim or compress it.";
      }
    } else if (mime.startsWith("audio/")) {
      if (file.size > 16 * 1024 * 1024) {
        return "Audio too large for WhatsApp (max 16MB).";
      }
    }
    return null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validationError = validateMediaFile(file);
      if (validationError) {
        toast({ title: "Cannot send file", description: validationError, variant: "destructive" });
      } else {
        mediaUploadMutation.mutate(file);
      }
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
    const ext = pastedImage.blob.type.split("/")[1] || "png";
    const file = new File([pastedImage.blob], `paste-${Date.now()}.${ext}`, { type: pastedImage.blob.type });
    const validationError = validateMediaFile(file);
    if (validationError) {
      toast({ title: "Cannot send file", description: validationError, variant: "destructive" });
      return;
    }
    setIsUploadingPaste(true);
    try {
      await mediaUploadMutation.mutateAsync(file);
    } finally {
      setIsUploadingPaste(false);
    }
  };

  const clearPastedImage = () => {
    if (pastedImage) URL.revokeObjectURL(pastedImage.previewUrl);
    setPastedImage(null);
  };

  const stopRecordingCleanup = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recordingRafRef.current !== null) {
      cancelAnimationFrame(recordingRafRef.current);
      recordingRafRef.current = null;
    }
    try { audioContextRef.current?.close(); } catch {}
    audioContextRef.current = null;
    analyserRef.current = null;
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach(t => t.stop());
      recordingStreamRef.current = null;
    }
    setIsRecording(false);
    recordingBarsRef.current = new Array(22).fill(5);
    setRecordingBars(new Array(22).fill(5));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      recordDiscardRef.current = false;

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
        if (recordDiscardRef.current) return;
        const blob = new Blob(recordingChunksRef.current, { type: supported.type });
        const audioFile = new File([blob], `voice-message.${supported.ext}`, { type: supported.type });
        const validationError = validateMediaFile(audioFile);
        if (validationError) {
          toast({ title: "Cannot send voice note", description: validationError, variant: "destructive" });
          return;
        }
        mediaUploadMutation.mutate(audioFile);
      };
      mediaRecorder.start(250);

      try {
        const audioCtx = new AudioContext();
        audioContextRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.6;
        analyserRef.current = analyser;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const NUM_BARS = 22;
        const tick = () => {
          analyser.getByteTimeDomainData(dataArray);
          const bars: number[] = [];
          const step = Math.floor(dataArray.length / NUM_BARS);
          for (let i = 0; i < NUM_BARS; i++) {
            const val = dataArray[i * step] ?? 128;
            const amplitude = Math.abs(val - 128) / 128;
            bars.push(Math.max(4, Math.round(amplitude * 36) + 4));
          }
          recordingBarsRef.current = bars;
          setRecordingBars([...bars]);
          recordingRafRef.current = requestAnimationFrame(tick);
        };
        recordingRafRef.current = requestAnimationFrame(tick);
      } catch {}

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
    stopRecordingCleanup();
  };

  const cancelRecording = () => {
    recordDiscardRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    stopRecordingCleanup();
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
      apiRequest("POST", `/api/whatsapp/messages/${waMessageId}/react`, { emoji, conversationId: convId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations", selectedConvId, "messages"] });
    },
  });

  const sendTemplateMutation = useMutation({
    mutationFn: async ({ convId, templateId, components }: { convId: string; templateId: string; components?: WaTemplateComponent[] }) =>
      apiRequest("POST", `/api/support/conversations/${convId}/send-template`, { templateId, components }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations", selectedConvId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      setTemplatePickerOpen(false);
      setSelectedTemplate(null);
      setTemplateSearch("");
      setTemplateVars({});
      setTimeout(() => scrollToBottom(), 100);
      toast({ title: "Template sent" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send template", description: err.message, variant: "destructive" });
    },
  });

  // Template data
  const { data: waTemplates = [] } = useQuery<WaMetaTemplate[]>({
    queryKey: ["/api/wa-meta-templates"],
    enabled: templatePickerOpen,
  });

  const filteredTemplates = useMemo(() => {
    if (!templateSearch.trim()) return waTemplates.filter(t => t.status === "approved");
    const q = templateSearch.toLowerCase();
    return waTemplates.filter(t =>
      t.status === "approved" &&
      (t.name.toLowerCase().includes(q) || (t.body || "").toLowerCase().includes(q))
    );
  }, [waTemplates, templateSearch]);

  // Link preview debounce logic
  useEffect(() => {
    if (linkPreviewTimerRef.current) clearTimeout(linkPreviewTimerRef.current);
    if (linkPreviewDismissed) return;

    const urlMatch = messageText.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/);
    if (!urlMatch) {
      setLinkPreview(null);
      return;
    }
    const url = urlMatch[0];
    if (linkPreview?.url === url) return;

    linkPreviewTimerRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/whatsapp/link-preview?url=${encodeURIComponent(url)}`, { credentials: "include" });
        if (!resp.ok) { setLinkPreview(null); return; }
        const data: LinkPreview = await resp.json();
        if (data.title || data.description) setLinkPreview(data);
        else setLinkPreview(null);
      } catch { setLinkPreview(null); }
    }, 600);

    return () => { if (linkPreviewTimerRef.current) clearTimeout(linkPreviewTimerRef.current); };
  }, [messageText, linkPreviewDismissed]);

  // Reset link preview when conversation changes or message sent
  useEffect(() => {
    setLinkPreview(null);
    setLinkPreviewDismissed(false);
  }, [selectedConvId]);

  // Debounce search query 500ms before sending to server
  useEffect(() => {
    if (!msgSearchOpen) { setMsgSearchDebounced(""); return; }
    const t = setTimeout(() => setMsgSearchDebounced(msgSearchQuery.trim()), 500);
    return () => clearTimeout(t);
  }, [msgSearchQuery, msgSearchOpen]);

  // Server-backed search: fetches ALL historical messages (beyond loaded window)
  const { data: serverSearchData } = useQuery<{ results: { id: string }[]; total: number }>({
    queryKey: ["/api/whatsapp/conversations", selectedConvId, "search", msgSearchDebounced],
    queryFn: async () => {
      if (!selectedConvId || msgSearchDebounced.length < 2) return { results: [], total: 0, limit: 20, offset: 0 };
      const res = await fetch(`/api/whatsapp/conversations/${selectedConvId}/search?q=${encodeURIComponent(msgSearchDebounced)}&limit=100`);
      return res.json();
    },
    enabled: !!selectedConvId && msgSearchDebounced.length >= 2 && msgSearchOpen,
    staleTime: 10_000,
  });

  // Message search logic: merge client-side local matches + server result IDs
  useEffect(() => {
    if (!msgSearchOpen || !msgSearchQuery.trim() || msgSearchQuery.trim().length < 2) {
      setMsgSearchMatchIds([]);
      setMsgSearchIndex(0);
      return;
    }
    const q = msgSearchQuery.toLowerCase();
    const localIds = messages
      .filter(m => m.messageType !== "reaction" && m.text && m.text.toLowerCase().includes(q))
      .map(m => m.id);
    // Merge server IDs (covers historical messages not yet loaded) — keep order, deduplicate
    const serverIds = (serverSearchData?.results ?? []).map((r: { id: string }) => r.id);
    const merged = Array.from(new Set([...localIds, ...serverIds]));
    setMsgSearchMatchIds(merged);
    setMsgSearchIndex(merged.length > 0 ? merged.length - 1 : 0);
  }, [msgSearchQuery, msgSearchOpen, messages, serverSearchData]);

  useEffect(() => {
    if (!msgSearchOpen) {
      setMsgSearchQuery("");
      setMsgSearchMatchIds([]);
      setMsgSearchIndex(0);
    } else {
      setTimeout(() => msgSearchInputRef.current?.focus(), 50);
    }
  }, [msgSearchOpen]);

  // Jump to highlighted search result
  useEffect(() => {
    if (msgSearchMatchIds.length === 0) return;
    const id = msgSearchMatchIds[msgSearchIndex];
    if (id) jumpToMessage(id);
  }, [msgSearchMatchIds, msgSearchIndex]);

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
    const capturedPreview = linkPreview ? { ...linkPreview } : null;
    setMessageText("");
    setLinkPreview(null);
    setLinkPreviewDismissed(false);
    sendMutation.mutate({ text, referenceMessageId: replyingTo?.id, linkPreviewUrl: capturedPreview?.url ?? null, linkPreviewData: capturedPreview });
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

  // Copy message text to clipboard
  const copyMessageText = (msg: Message) => {
    const text = msg.text || "";
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {});
    toast({ title: "Copied", description: "Message text copied to clipboard" });
  };

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <div className="w-[380px] border-r border-white/[0.06] flex flex-col shrink-0 bg-[#070b14]">
        <div className="h-14 bg-[#070b14] border-b border-white/[0.06] flex items-center px-4 gap-3">
          <div className="w-9 h-9 bg-blue-500/20 rounded-full flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-blue-400" />
          </div>
          <h2 className="font-semibold text-white/90 text-sm flex-1">Chats</h2>
          {!isArchivedView && totalUnread > 0 && (
            <Badge variant="default" className="text-xs rounded-full bg-blue-500 text-white border-blue-500" data-testid="badge-total-unread">
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 z-10" />
            <Input
              placeholder="Search by name, phone, or order..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-8 bg-white/[0.06] border-white/10 text-white/90 placeholder:text-white/30 focus-visible:ring-blue-500/50"
              data-testid="input-search-conversations"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
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
                    ? "bg-blue-500 text-white border-transparent"
                    : "bg-white/[0.06] text-white/60 border-white/10 hover:bg-white/[0.08]"
                )}
                data-testid={`filter-${f.key}`}
              >
                {f.key === "archived" && <Archive className="w-3 h-3" />}
                {f.label}
                {f.key === "archived" && archivedCount > 0 && (
                  <span className={cn(
                    "rounded-full px-1.5 py-0 text-[10px] font-bold leading-tight",
                    labelFilter === "archived" ? "bg-white/20 text-white" : "bg-white/10 text-white/40"
                  )}>
                    {archivedCount}
                  </span>
                )}
              </button>
            ))}
            {waLabels.map(l => (
              <button
                key={l.id}
                onClick={() => setLabelFilter(l.name)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all border",
                  labelFilter === l.name
                    ? "bg-blue-500 text-white border-transparent"
                    : "bg-white/[0.06] text-white/60 border-white/10 hover:bg-white/[0.08]"
                )}
                data-testid={`filter-${l.name.toLowerCase()}`}
              >
                <span className={cn("inline-block w-2 h-2 rounded-full mr-1.5", l.color)} />
                {l.name}
              </button>
            ))}
            <button
              onClick={() => setShowLabelManager(true)}
              className="px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all border border-dashed border-white/20 text-white/40 hover:text-white/70 hover:border-white/40"
              data-testid="button-manage-labels"
            >
              <Settings2 className="w-3 h-3 inline mr-1" />
              Manage
            </button>
          </div>
        )}

        {/* Multi-select bulk action bar */}
        {selectMode && selectedIds.size > 0 && (
          <div className="px-3 pb-2 flex items-center gap-2 bg-white/[0.04] border-b border-white/[0.06] py-2">
            <span className="text-xs font-medium flex-1 text-white/80">{selectedIds.size} selected</span>
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
            className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-white/[0.04] border-b border-white/[0.05]"
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
            <span className="text-xs text-white/40">Select all</span>
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
                    "group w-full px-3 py-3 text-left transition-colors flex items-center gap-3 border-b border-white/[0.05] cursor-pointer",
                    isSelected && !selectMode ? "bg-blue-500/10 border-l-2 border-l-blue-500" : "border-l-2 border-l-transparent hover:bg-white/[0.04]"
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
                    setContextMenu({ x: e.clientX, y: e.clientY, conv });
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
                      getAvatarGradient(conv.contactName ?? conv.contactPhone)
                    )}>
                      {(conv.contactName ?? conv.contactPhone).charAt(0).toUpperCase()}
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-emerald-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold shadow-sm">
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className={cn("text-sm truncate", conv.unreadCount > 0 ? "font-bold text-white" : "text-white/90")} data-testid={`text-contact-${conv.id}`}>
                          {conv.contactName || `+${conv.contactPhone}`}
                        </span>
                        {labelInfo && (
                          <span className={cn("text-[9px] text-white px-1 py-0 rounded shrink-0 leading-tight", labelInfo.color)}>
                            {labelInfo.name}
                          </span>
                        )}
                      </div>
                      <span className={cn("text-xs whitespace-nowrap shrink-0", conv.unreadCount > 0 ? "text-emerald-400 font-medium" : "text-white/30")}>
                        {formatChatTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {conv.orderNumber && (
                        <span className="text-[10px] text-amber-400 bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded font-mono">
                          #{conv.orderNumber}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <p className={cn("text-xs truncate flex-1", conv.unreadCount > 0 ? "text-white/70" : "text-white/40")}>
                        {conv.lastMessage || "No messages"}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        {conv.assignedToName && (
                          <span className="text-[10px] text-white/30 italic ml-2 flex items-center gap-0.5">
                            <UserPlus className="w-2.5 h-2.5" />
                            {conv.assignedToName.split(" ")[0]}
                          </span>
                        )}
                        {!selectMode && (
                          <button
                            className="text-white/30 opacity-0 group-hover:opacity-100 hover:text-white/70 p-0.5 rounded transition-opacity"
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
          <div className="px-3 py-1.5 border-t border-white/[0.06] flex items-center justify-between">
            <button
              onClick={() => setSelectMode(true)}
              className="text-xs text-white/50 hover:text-white/80 flex items-center gap-1 px-3 py-0.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.06] transition-colors"
              data-testid="button-enter-select-mode"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Select
            </button>
          </div>
        )}
      </div>

      {/* Conversation right-click context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[180px]"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 200),
            left: Math.min(contextMenu.x, window.innerWidth - 200),
          }}
          data-testid="conversation-context-menu"
        >
          <button
            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent rounded transition-colors"
            onClick={() => {
              setSelectedConvId(contextMenu.conv.id);
              setContextMenu(null);
            }}
            data-testid="context-menu-open"
          >
            <MessageCircle className="w-4 h-4" />
            Open chat
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent rounded transition-colors"
            onClick={() => {
              setSelectMode(true);
              setSelectedIds(new Set([contextMenu.conv.id]));
              setContextMenu(null);
            }}
            data-testid="context-menu-select"
          >
            <CheckSquare className="w-4 h-4" />
            Select
          </button>
          <div className="border-t border-border my-1" />
          <button
            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent rounded transition-colors"
            onClick={() => {
              archiveMutation.mutate({ ids: [contextMenu.conv.id], unarchive: contextMenu.conv.isArchived });
              if (selectedConvId === contextMenu.conv.id && !contextMenu.conv.isArchived) setSelectedConvId(null);
              setContextMenu(null);
            }}
            data-testid="context-menu-archive"
          >
            {contextMenu.conv.isArchived ? (
              <><ArchiveRestore className="w-4 h-4" />Unarchive</>
            ) : (
              <><Archive className="w-4 h-4" />Archive</>
            )}
          </button>
          <div className="border-t border-border my-1" />
          <button
            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent text-destructive rounded transition-colors"
            onClick={() => {
              deleteMutation.mutate(contextMenu.conv.id);
              setContextMenu(null);
            }}
            data-testid="context-menu-delete"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}

      {/* Message right-click context menu */}
      {msgContextMenu && (
        <div
          ref={msgContextMenuRef}
          className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{
            top: Math.min(msgContextMenu.y, window.innerHeight - 160),
            left: Math.min(msgContextMenu.x, window.innerWidth - 180),
          }}
          data-testid="message-context-menu"
        >
          <button
            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent rounded transition-colors"
            onClick={() => {
              setReplyingTo(msgContextMenu.msg);
              setMsgContextMenu(null);
              inputRef.current?.focus();
            }}
            data-testid="msg-ctx-reply"
          >
            <Reply className="w-4 h-4" />
            Reply
          </button>
          {msgContextMenu.msg.text && (
            <button
              className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent rounded transition-colors"
              onClick={() => {
                copyMessageText(msgContextMenu.msg);
                setMsgContextMenu(null);
              }}
              data-testid="msg-ctx-copy"
            >
              <Copy className="w-4 h-4" />
              Copy text
            </button>
          )}
          <div className="border-t border-border my-1" />
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground space-y-0.5">
            <div className="flex items-center gap-1.5">
              <Info className="w-3 h-3 shrink-0" />
              <span>Sent: {format(new Date(msgContextMenu.msg.createdAt), "MMM d, HH:mm:ss")}</span>
            </div>
            {msgContextMenu.msg.deliveredAt != null && (
              <div className="pl-4 text-[10px]">
                Delivered: {format(new Date(msgContextMenu.msg.deliveredAt), "MMM d, HH:mm:ss")}
              </div>
            )}
            {msgContextMenu.msg.readAt != null && (
              <div className="pl-4 text-[10px]">
                Read: {format(new Date(msgContextMenu.msg.readAt), "MMM d, HH:mm:ss")}
              </div>
            )}
          </div>
        </div>
      )}

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

              {/* In-chat search toggle */}
              <Button
                size="icon"
                variant="ghost"
                data-testid="button-msg-search"
                className={cn("text-white hover:bg-white/10 h-8 w-8", msgSearchOpen && "bg-white/20")}
                onClick={() => setMsgSearchOpen(v => !v)}
                title="Search messages"
              >
                <Search className="w-4 h-4" />
              </Button>

              {/* Mute toggle */}
              <Button
                size="icon"
                variant="ghost"
                data-testid="button-sound-toggle"
                className="text-white hover:bg-white/10 h-8 w-8"
                onClick={() => setSoundMuted(m => !m)}
                title={soundMuted ? "Unmute notifications" : "Mute notifications"}
              >
                {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
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
                        data-testid="assign-unassign"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Unassign
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={() => setGalleryOpen(true)}
                    data-testid="button-view-media"
                  >
                    <Images className="w-4 h-4 mr-2" />
                    View Media &amp; Links
                  </DropdownMenuItem>

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

            {/* In-conversation search bar */}
            {msgSearchOpen && (
              <div className="px-3 py-2 bg-[#f0f2f5] dark:bg-[#1f2c34] border-b border-border flex items-center gap-2" data-testid="msg-search-bar">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  ref={msgSearchInputRef}
                  type="text"
                  placeholder="Search messages..."
                  value={msgSearchQuery}
                  onChange={(e) => setMsgSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { setMsgSearchOpen(false); return; }
                    if (e.key === "Enter" || e.key === "ArrowDown") {
                      e.preventDefault();
                      if (msgSearchMatchIds.length > 0) {
                        setMsgSearchIndex(i => i === 0 ? msgSearchMatchIds.length - 1 : i - 1);
                      }
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      if (msgSearchMatchIds.length > 0) {
                        setMsgSearchIndex(i => i === msgSearchMatchIds.length - 1 ? 0 : i + 1);
                      }
                    }
                  }}
                  className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
                  data-testid="input-msg-search"
                />
                {msgSearchQuery && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {msgSearchMatchIds.length > 0 ? `${msgSearchMatchIds.length - msgSearchIndex}/${msgSearchMatchIds.length}` : "0 results"}
                  </span>
                )}
                {msgSearchMatchIds.length > 1 && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0"
                      onClick={() => setMsgSearchIndex(i => i === msgSearchMatchIds.length - 1 ? 0 : i + 1)}
                      data-testid="button-search-prev"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0"
                      onClick={() => setMsgSearchIndex(i => i === 0 ? msgSearchMatchIds.length - 1 : i - 1)}
                      data-testid="button-search-next"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  onClick={() => setMsgSearchOpen(false)}
                  data-testid="button-close-msg-search"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            {/* Chat message area with scroll tracking */}
            <div className="flex-1 relative overflow-hidden">
              <div
                className="absolute inset-0 overflow-y-auto wa-chat-bg"
                ref={messagesScrollRef}
                onScroll={handleChatScroll}
              >
              <div className="px-[8%] py-4 space-y-1">
                  {/* Load older messages spinner */}
                  {isLoadingOlder && (
                    <div className="flex justify-center py-3">
                      <span className="flex items-center gap-2 bg-white dark:bg-[#202c33] text-muted-foreground text-xs px-4 py-2 rounded-lg shadow-sm">
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Loading earlier messages…
                      </span>
                    </div>
                  )}
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
                          const isHighlighted = highlightedMsgId === msg.id;
                          const isSearchMatch = msgSearchMatchIds.includes(msg.id);
                          const isCurrentSearchTarget = isSearchMatch && msgSearchMatchIds[msgSearchIndex] === msg.id;

                          return (
                            <div
                              key={msg.id}
                              data-msg-id={msg.id}
                              className={cn("flex mb-1 group", isOutbound ? "justify-end" : "justify-start")}
                              data-testid={`message-${msg.id}`}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setMsgContextMenu({ x: e.clientX, y: e.clientY, msg });
                              }}
                              onTouchStart={(e) => {
                                const touch = e.touches[0];
                                longPressTimerRef.current = setTimeout(() => {
                                  setMsgContextMenu({ x: touch.clientX, y: touch.clientY, msg });
                                }, 500);
                              }}
                              onTouchEnd={() => {
                                if (longPressTimerRef.current) {
                                  clearTimeout(longPressTimerRef.current);
                                  longPressTimerRef.current = null;
                                }
                              }}
                              onTouchMove={() => {
                                if (longPressTimerRef.current) {
                                  clearTimeout(longPressTimerRef.current);
                                  longPressTimerRef.current = null;
                                }
                              }}
                            >
                              <div className={cn("relative max-w-[65%]", isOutbound ? "mr-2" : "ml-2")}>
                                <div className={cn(
                                  "relative px-2.5 py-1.5 rounded-lg text-sm shadow-sm transition-colors duration-300",
                                  isOutbound
                                    ? "wa-bubble-out text-[#111b21] dark:text-[#e9edef] rounded-tr-none"
                                    : "wa-bubble-in text-[#111b21] dark:text-[#e9edef] rounded-tl-none",
                                  isHighlighted && "ring-2 ring-yellow-400 ring-offset-1 bg-yellow-400/20",
                                  isCurrentSearchTarget && "ring-2 ring-[#008069] ring-offset-1 bg-[#008069]/10 dark:bg-[#008069]/20",
                                  isSearchMatch && !isCurrentSearchTarget && "ring-1 ring-[#008069]/40 bg-[#008069]/5 dark:bg-[#008069]/10"
                                )}>
                                  {hasQuote && (
                                    <QuotedMessagePreview
                                      msg={msg}
                                      messages={messages}
                                      onJumpToQuoted={jumpToMessage}
                                    />
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
                                      {isSearchMatch && msg.text && msgSearchQuery
                                        ? highlightSearchText(msg.text, msgSearchQuery)
                                        : renderFormattedText(msg.text || "")}
                                    </div>
                                  )}
                                  {/* Rich link preview card — use stored linkPreviewData if persisted (no refetch), else lazy-fetch and persist on first view */}
                                  {!isButtonReply && !isNonText && (() => {
                                    if (msg.linkPreviewData) {
                                      return <LinkPreviewBubble storedData={msg.linkPreviewData} messageId={msg.id} />;
                                    }
                                    const extractedUrl = (msg.text || "").match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/)?.[0] ?? null;
                                    if (!extractedUrl) return null;
                                    return <LinkPreviewBubble url={extractedUrl} messageId={msg.id} />;
                                  })()}
                                  <div className={cn(
                                    "flex items-center gap-1 mt-0.5",
                                    isOutbound ? "justify-end" : ""
                                  )}>
                                    <span className="text-[10px] text-[#667781] dark:text-[#8696a0]">
                                      {format(new Date(msg.createdAt), "HH:mm")}
                                    </span>
                                    {isOutbound && (
                                      <StatusTicks
                                        status={msg.status}
                                        createdAt={msg.createdAt ?? undefined}
                                        deliveredAt={msg.deliveredAt ?? undefined}
                                        readAt={msg.readAt ?? undefined}
                                      />
                                    )}
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
                                  {msg.waMessageId && (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-7 w-7 bg-white/80 dark:bg-[#202c33]/80 shadow-sm rounded-full" data-testid={`react-${msg.id}`}>
                                          <Smile className="w-3.5 h-3.5" />
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent side={isOutbound ? "left" : "right"} className="w-auto p-1.5 flex gap-0.5">
                                        {["👍", "❤️", "😂", "😮", "😢", "🙏"].map(e => (
                                          <button key={e} onClick={() => { reactMutation.mutate({ convId: selectedConv.id, emoji: e, waMessageId: msg.waMessageId! }); }} className="text-xl px-1 py-0.5 rounded hover:bg-muted transition-colors" data-testid={`react-emoji-${e}-${msg.id}`}>{e}</button>
                                        ))}
                                      </PopoverContent>
                                    </Popover>
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
              </div>

              {/* Scroll-to-bottom FAB with unread badge */}
              {showScrollFab && (
                <button
                  onClick={() => { scrollToBottom(); setNewMsgCount(0); }}
                  className="absolute bottom-4 right-4 z-10 w-10 h-10 bg-white dark:bg-[#202c33] border border-border rounded-full shadow-lg flex items-center justify-center hover:bg-accent transition-colors"
                  data-testid="fab-scroll-bottom"
                >
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  {newMsgCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-[#008069] text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center leading-none" data-testid="fab-unread-badge">
                      {newMsgCount > 99 ? "99+" : newMsgCount}
                    </span>
                  )}
                </button>
              )}

              {/* "↓ N new messages" jump banner (shown when FAB has unread count) */}
              {showScrollFab && newMsgCount > 0 && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                  <button
                    onClick={() => { scrollToBottom(); setNewMsgCount(0); }}
                    className="pointer-events-auto flex items-center gap-2 bg-[#008069] hover:bg-[#017561] text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium transition-colors"
                    data-testid="banner-new-messages"
                  >
                    <ArrowDown className="w-4 h-4" />
                    {newMsgCount} new message{newMsgCount > 1 ? "s" : ""}
                  </button>
                </div>
              )}
            </div>

            {/* Link preview card above compose */}
            {linkPreview && !linkPreviewDismissed && (
              <div className="mx-3 mb-1 rounded-lg border border-border bg-card overflow-hidden flex items-start gap-2 shadow-sm" data-testid="link-preview-card">
                {linkPreview.image && (
                  <img src={linkPreview.image} alt={linkPreview.title || "Preview"} className="w-16 h-16 object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0 p-2">
                  {linkPreview.siteName && (
                    <p className="text-[10px] text-[#008069] font-medium uppercase tracking-wide mb-0.5">{linkPreview.siteName}</p>
                  )}
                  {linkPreview.title && (
                    <p className="text-xs font-semibold text-foreground line-clamp-1">{linkPreview.title}</p>
                  )}
                  {linkPreview.description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{linkPreview.description}</p>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0 m-1 text-muted-foreground"
                  onClick={() => { setLinkPreviewDismissed(true); setLinkPreview(null); }}
                  data-testid="button-dismiss-link-preview"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}

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

              {isRecording ? (
                /* WhatsApp-style recording toolbar */
                <div className="flex items-center gap-3 py-1" data-testid="recording-toolbar">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={cancelRecording}
                    className="shrink-0 h-10 w-10 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    data-testid="button-cancel-recording"
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
                  <div className="flex-1 flex flex-col gap-0.5">
                    <div className="flex items-end gap-[2px] h-8">
                      {recordingBars.map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-full bg-red-500"
                          style={{ height: `${h}px`, maxHeight: "32px", minHeight: "4px" }}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] text-red-500 tabular-nums font-medium">
                      {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                  <Button
                    size="icon"
                    onClick={stopRecording}
                    disabled={mediaUploadMutation.isPending}
                    className="shrink-0 h-11 w-11 rounded-full bg-[#008069] hover:bg-[#017561] text-white shadow-md"
                    data-testid="button-stop-send-recording"
                  >
                    {mediaUploadMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </Button>
                </div>
              ) : (
                <>
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
                    <div className="w-px h-4 bg-border mx-0.5" />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setTemplatePickerOpen(true)}
                      title="Send template message"
                      data-testid="button-template-picker"
                      className="h-7 w-7 text-[#008069] hover:text-[#008069] hover:bg-[#008069]/10"
                    >
                      <Zap className="w-4 h-4" />
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
                        onClick={startRecording}
                        className="shrink-0 mb-0.5 rounded-full h-10 w-10 text-[#54656f] dark:text-[#8696a0] hover:text-[#008069]"
                        disabled={mediaUploadMutation.isPending}
                        data-testid="button-voice-record"
                      >
                        <Mic className="w-5 h-5" />
                      </Button>
                    )}
                  </div>
                </>
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

      {/* Gallery Sheet — Photos, Documents, Links */}
      <Sheet open={galleryOpen} onOpenChange={setGalleryOpen}>
        <SheetContent side="right" className="w-[380px] sm:w-[420px] p-0 flex flex-col" data-testid="gallery-sheet">
          <SheetHeader className="px-4 py-3 border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <GalleryHorizontal className="w-4 h-4 text-[#008069]" />
              Media, Docs &amp; Links
            </SheetTitle>
          </SheetHeader>
          <Tabs defaultValue="photos" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-4 mt-3 mb-0 shrink-0">
              <TabsTrigger value="photos" className="flex-1" data-testid="tab-gallery-photos">
                <Images className="w-3.5 h-3.5 mr-1" />
                Photos
              </TabsTrigger>
              <TabsTrigger value="docs" className="flex-1" data-testid="tab-gallery-docs">
                <FileText className="w-3.5 h-3.5 mr-1" />
                Docs
              </TabsTrigger>
              <TabsTrigger value="links" className="flex-1" data-testid="tab-gallery-links">
                <LinkIcon className="w-3.5 h-3.5 mr-1" />
                Links
              </TabsTrigger>
            </TabsList>

            {/* Photos & Videos */}
            <TabsContent value="photos" className="flex-1 overflow-y-auto px-4 py-3 mt-0">
              {(() => {
                const mediaMessages = messages.filter(m =>
                  m.messageType === "image" || m.messageType === "video"
                );
                if (mediaMessages.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <Images className="w-10 h-10 mb-2 opacity-30" />
                      <p className="text-sm">No photos or videos yet</p>
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-3 gap-1">
                    {mediaMessages.map(m => {
                      const mediaId = extractMediaId(m.mediaUrl);
                      const mediaHref = mediaId ? `/api/whatsapp/media/${mediaId}` : m.mediaUrl || "#";
                      return (
                        <div key={m.id} className="aspect-square rounded-md overflow-hidden bg-muted border border-border">
                          {m.messageType === "image" ? (
                            <a href={mediaHref} target="_blank" rel="noopener noreferrer">
                              <img
                                src={mediaHref}
                                alt="Media"
                                className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                data-testid={`gallery-photo-${m.id}`}
                              />
                            </a>
                          ) : (
                            <a href={mediaHref} target="_blank" rel="noopener noreferrer"
                              className="w-full h-full flex items-center justify-center bg-black/10 cursor-pointer hover:bg-black/20 transition-colors"
                              data-testid={`gallery-video-${m.id}`}>
                              <Play className="w-8 h-8 text-white/80" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </TabsContent>

            {/* Documents */}
            <TabsContent value="docs" className="flex-1 overflow-y-auto px-4 py-3 mt-0">
              {(() => {
                const docMessages = messages.filter(m =>
                  m.messageType === "document" || m.messageType === "audio" || m.messageType === "sticker"
                );
                if (docMessages.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <FileText className="w-10 h-10 mb-2 opacity-30" />
                      <p className="text-sm">No documents yet</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-2">
                    {docMessages.map(m => {
                      const mediaId = extractMediaId(m.mediaUrl);
                      const mediaHref = mediaId ? `/api/whatsapp/media/${mediaId}` : m.mediaUrl || "#";
                      return (
                        <a
                          key={m.id}
                          href={mediaHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors no-underline"
                          data-testid={`gallery-doc-${m.id}`}
                        >
                          <div className="w-10 h-10 rounded-md bg-[#008069]/10 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-[#008069]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate text-foreground">{m.fileName || m.messageType}</p>
                            <p className="text-[11px] text-muted-foreground">{format(new Date(m.createdAt), "MMM d, yyyy · HH:mm")}</p>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        </a>
                      );
                    })}
                  </div>
                );
              })()}
            </TabsContent>

            {/* Links */}
            <TabsContent value="links" className="flex-1 overflow-y-auto px-4 py-3 mt-0">
              {(() => {
                const linkMessages = messages.filter(m => m.text && /https?:\/\/[^\s<>"{}|\\^`[\]]+/.test(m.text));
                if (linkMessages.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <LinkIcon className="w-10 h-10 mb-2 opacity-30" />
                      <p className="text-sm">No links shared yet</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-2">
                    {linkMessages.map(m => {
                      const urls = m.text!.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/g) || [];
                      return urls.map((url, idx) => (
                        <a
                          key={`${m.id}-${idx}`}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-2 p-2.5 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors no-underline"
                          data-testid={`gallery-link-${m.id}-${idx}`}
                        >
                          <LinkIcon className="w-4 h-4 text-[#008069] mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-[#008069] break-all">
                              {url.length > 55 ? url.slice(0, 55) + "…" : url}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(m.createdAt), "MMM d · HH:mm")}</p>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        </a>
                      ));
                    })}
                  </div>
                );
              })()}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Template Picker Dialog */}
      <Dialog open={templatePickerOpen} onOpenChange={(v) => { setTemplatePickerOpen(v); if (!v) { setSelectedTemplate(null); setTemplateSearch(""); setTemplateVars({}); } }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col p-0 gap-0" data-testid="template-picker-dialog">
          <DialogHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#008069]" />
              Send Template Message
            </DialogTitle>
          </DialogHeader>

          {/* Search */}
          <div className="px-4 py-2 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                data-testid="input-template-search"
              />
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex">
            {/* Template list */}
            <div className="w-1/2 border-r border-border overflow-y-auto">
              {filteredTemplates.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                  <Zap className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">No approved templates</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredTemplates.map(t => (
                    <button
                      key={t.id}
                      className={cn(
                        "w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors",
                        selectedTemplate?.id === t.id && "bg-[#008069]/10 border-l-2 border-[#008069]"
                      )}
                      onClick={() => {
                        setSelectedTemplate(t);
                        if (orderVars && t.body) {
                          const nums = [...new Set(Array.from(t.body.matchAll(/\{\{(\d+)\}\}/g)).map(m => m[1]))].sort();
                          const autoFilled: Record<string, string> = {};
                          nums.forEach(n => {
                            const varKey = TEMPLATE_VAR_ORDER[parseInt(n) - 1];
                            if (varKey && orderVars[varKey]) autoFilled[n] = orderVars[varKey];
                          });
                          setTemplateVars(autoFilled);
                        } else {
                          setTemplateVars({});
                        }
                      }}
                      data-testid={`template-item-${t.id}`}
                    >
                      <p className="text-xs font-medium text-foreground">{t.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{t.body}</p>
                      {t.category && (
                        <span className="inline-block mt-1 text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                          {t.category}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Template preview + variable inputs */}
            <div className="w-1/2 overflow-y-auto p-3 flex flex-col gap-3">
              {selectedTemplate ? (() => {
                const bodyVarNums = [...new Set(Array.from(selectedTemplate.body?.matchAll(/\{\{(\d+)\}\}/g) || []).map(m => m[1]))].sort();
                const resolvedBody = bodyVarNums.reduce((t, n) => t.replaceAll(`{{${n}}}`, templateVars[n] || `{{${n}}}`), selectedTemplate.body || "");
                const components: WaTemplateComponent[] = bodyVarNums.length > 0 ? [{
                  type: "body",
                  parameters: bodyVarNums.map(n => ({ type: "text", text: templateVars[n] || "" })),
                }] : [];
                return (
                  <>
                    <div className="bg-[#dcf8c6] dark:bg-[#005c4b] rounded-lg p-3 text-sm text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap">
                      {selectedTemplate.headerText && (
                        <p className="font-semibold mb-1">{selectedTemplate.headerText}</p>
                      )}
                      <p className="text-xs leading-relaxed">{resolvedBody}</p>
                      {selectedTemplate.footer && (
                        <p className="text-[11px] text-[#667781] dark:text-[#8696a0] mt-1">{selectedTemplate.footer}</p>
                      )}
                      {selectedTemplate.buttons && selectedTemplate.buttons.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-black/10 dark:border-white/10 pt-2">
                          {selectedTemplate.buttons.map((btn: WaTemplateButton, i: number) => (
                            <div key={i} className="text-[11px] text-[#008069] font-medium text-center py-0.5">
                              {btn.text}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {bodyVarNums.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Fill Variables</p>
                          {orderVars && <span className="text-[10px] text-[#008069] font-medium">Auto-filled from order</span>}
                        </div>
                        {bodyVarNums.map(n => {
                          const varKey = TEMPLATE_VAR_ORDER[parseInt(n) - 1];
                          const label = varKey ? TEMPLATE_VAR_LABELS[varKey] || varKey : `Variable ${n}`;
                          return (
                            <div key={n}>
                              <label className="text-xs text-muted-foreground mb-0.5 block">
                                <span className="font-mono">{`{{${n}}}`}</span>
                                {varKey && <span className="ml-1 text-muted-foreground/70">— {label}</span>}
                              </label>
                              <Input
                                placeholder={label}
                                value={templateVars[n] || ""}
                                onChange={(e) => setTemplateVars(prev => ({ ...prev, [n]: e.target.value }))}
                                className="h-7 text-xs"
                                data-testid={`input-template-var-${n}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          if (selectedTemplate?.body) {
                            setMessageText(resolvedBody);
                            setTemplatePickerOpen(false);
                            setSelectedTemplate(null);
                            setTemplateSearch("");
                            setTemplateVars({});
                            setTimeout(() => inputRef.current?.focus(), 50);
                          }
                        }}
                        data-testid="button-fill-template"
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        Fill in Compose
                      </Button>
                      <Button
                        className="w-full bg-[#008069] hover:bg-[#017561] text-white"
                        onClick={() => {
                          if (selectedConvId && selectedTemplate) {
                            sendTemplateMutation.mutate({
                              convId: selectedConvId,
                              templateId: selectedTemplate.id,
                              components: components.length > 0 ? components : undefined,
                            });
                          }
                        }}
                        disabled={sendTemplateMutation.isPending}
                        data-testid="button-send-template"
                      >
                        {sendTemplateMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4 mr-2" />
                        )}
                        Send Now
                      </Button>
                    </div>
                  </>
                );
              })() : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <p className="text-sm">Select a template to preview</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
    onSuccess: async (res: Response) => {
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
            <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
              <ClipboardList className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Complaint Filed</p>
              <p className="text-lg font-mono font-bold mt-1" data-testid="text-created-ticket">{ticketCreated}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Customer: {conversation.contactName || conversation.contactPhone}
            </p>
            <Button size="sm" onClick={() => onOpenChange(false)} data-testid="button-close-complaint">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                Customer: <span className="font-medium text-foreground">{conversation.contactName || conversation.contactPhone}</span>
              </p>
              {conversation.orderNumber && (
                <p className="text-sm text-muted-foreground">
                  Order: <span className="font-mono font-medium text-foreground">#{conversation.orderNumber}</span>
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="complaint-reason" className="text-sm font-medium">Reason (optional)</Label>
              <Textarea
                id="complaint-reason"
                placeholder="Describe the issue..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 h-24 resize-none"
                data-testid="textarea-complaint-reason"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-complaint">
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                data-testid="button-submit-complaint"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                File Complaint
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
