import { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle, Search, Send, Lock, Phone, Mail,
  MoreVertical, Tag, UserPlus, Check, CheckCheck,
  Smile, Bold, Italic, Strikethrough, Code, Filter,
  X, ArrowLeft, Image as ImageIcon, Mic, FileText,
  MapPin, Users, Reply, Trash2, RefreshCw, AlertTriangle,
  Download, Play, Pause, Volume2, ExternalLink, File, Video,
  Bell, BellOff, LogOut,
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

function getActiveSlug(): string | null {
  return localStorage.getItem("agent_chat_active_slug");
}

function setActiveSlug(slug: string) {
  localStorage.setItem("agent_chat_active_slug", slug);
}

function clearActiveSlug() {
  localStorage.removeItem("agent_chat_active_slug");
}

function getCachedConversations(slug: string): Conversation[] | null {
  try {
    const raw = localStorage.getItem(`agent_chat_convs_${slug}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function setCachedConversations(slug: string, convs: Conversation[]) {
  try {
    localStorage.setItem(`agent_chat_convs_${slug}`, JSON.stringify(convs.slice(0, 50)));
  } catch {}
}

function getCachedMessages(slug: string, convId: string): Message[] | null {
  try {
    const raw = localStorage.getItem(`agent_chat_msgs_${slug}_${convId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function setCachedMessages(slug: string, convId: string, msgs: Message[]) {
  try {
    localStorage.setItem(`agent_chat_msgs_${slug}_${convId}`, JSON.stringify(msgs.slice(-100)));
  } catch {}
}

function clearAllCache(slug: string) {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith(`agent_chat_convs_${slug}`) || key.startsWith(`agent_chat_msgs_${slug}_`))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
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


interface WaLabelItem {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isSystem: boolean;
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "✅"];

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

function extractMediaId(mediaUrl: string | null): string | null {
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith("wa-media:")) return mediaUrl.slice(9);
  return null;
}

function useAuthMediaUrl(proxyUrl: string | null): string | null {
  const slug = useContext(SlugContext);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!proxyUrl) return;
    let cancelled = false;
    let url: string | null = null;

    agentFetch(proxyUrl, slug).then(resp => {
      if (!resp.ok || cancelled) return;
      return resp.blob();
    }).then(blob => {
      if (!blob || cancelled) return;
      url = URL.createObjectURL(blob);
      setObjectUrl(url);
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [proxyUrl, slug]);

  return objectUrl;
}

function AuthImage({ proxyUrl, alt, className, onClick, loading }: {
  proxyUrl: string | null; alt: string; className?: string; onClick?: () => void; loading?: "lazy" | "eager";
}) {
  const src = useAuthMediaUrl(proxyUrl);
  if (!src) return <div className={cn("bg-slate-700 animate-pulse rounded-lg", className)} style={{ minHeight: 100, minWidth: 100 }} />;
  return <img src={src} alt={alt} className={className} onClick={onClick} loading={loading} />;
}

function AuthVideo({ proxyUrl, className, caption }: { proxyUrl: string | null; className?: string; caption?: string | null }) {
  const src = useAuthMediaUrl(proxyUrl);
  if (!src) return <div className={cn("bg-slate-700 animate-pulse rounded-lg", className)} style={{ minHeight: 100, minWidth: 200 }} />;
  return (
    <div>
      <video src={src} controls preload="metadata" className={className} />
      {caption && <div className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-sm">{renderFormattedText(caption)}</div>}
    </div>
  );
}

const WAVEFORM_BARS = [3,5,8,4,7,10,6,9,4,7,5,8,11,6,4,9,7,5,10,8,6,3,7,5,9,4,8,6,10,5];

function AgentAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(false);

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
    if (safe > 0) { setDuration(safe); setLoaded(true); }
  };

  return (
    <div className="flex items-center gap-2.5 min-w-[220px] py-1" data-testid="audio-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={handleDuration}
        onDurationChange={handleDuration}
        onCanPlay={() => { handleDuration(); setLoaded(true); }}
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
        className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center active:bg-blue-600 transition-colors shadow-sm"
        data-testid="audio-play-btn"
      >
        {playing ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
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
                  isPlayed ? "bg-blue-400" : "bg-slate-600"
                )}
                style={{ height: `${h * 2}px` }}
              />
            );
          })}
        </div>
        <span className="text-[10px] text-slate-400 tabular-nums">
          {playing ? formatTime(currentTime) : formatTime(duration)}
        </span>
      </div>
    </div>
  );
}

function AuthAudioPlayer({ proxyUrl, msgId }: { proxyUrl: string; msgId: string }) {
  const src = useAuthMediaUrl(proxyUrl);
  if (!src) return <div className="h-10 bg-slate-700 animate-pulse rounded-lg min-w-[200px]" />;
  return (
    <div data-testid={`media-audio-${msgId}`}>
      <AgentAudioPlayer src={src} />
    </div>
  );
}

function AuthDocumentCard({ msg, proxyUrl }: { msg: Message; proxyUrl: string }) {
  const slug = useContext(SlugContext);
  const fName = msg.fileName || msg.text || "Document";
  const isPdf = msg.mimeType?.includes("pdf") || fName.toLowerCase().endsWith(".pdf");

  const handleDownload = async () => {
    try {
      const resp = await agentFetch(`${proxyUrl}?download=1&filename=${encodeURIComponent(fName)}`, slug);
      if (!resp.ok) return;
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-700/50 min-w-[200px]" data-testid={`media-document-${msg.id}`}>
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
        {isPdf ? <FileText className="w-5 h-5 text-red-400" /> : <File className="w-5 h-5 text-slate-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{fName}</div>
        {msg.mimeType && <div className="text-[10px] text-slate-500 uppercase">{msg.mimeType.split("/")[1] || msg.mimeType}</div>}
      </div>
      <button
        onClick={handleDownload}
        className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center active:bg-blue-500/20 transition-colors"
        data-testid={`download-document-${msg.id}`}
      >
        <Download className="w-4 h-4 text-blue-400" />
      </button>
    </div>
  );
}

function AgentMediaBubble({ msg, mediaProxyBase }: { msg: Message; mediaProxyBase: string }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const mediaId = extractMediaId(msg.mediaUrl);
  const proxyUrl = mediaId ? `${mediaProxyBase}/${mediaId}` : null;
  const placeholderTexts = ["Image", "Sticker", "Audio", "Video", "Document"];
  const caption = msg.text && !placeholderTexts.some(p => msg.text?.includes(p)) ? msg.text : null;

  if (msg.messageType === "image" && proxyUrl) {
    return (
      <div data-testid={`media-image-${msg.id}`}>
        <AuthImage
          proxyUrl={proxyUrl}
          alt={caption || "Image"}
          className="max-w-[280px] max-h-[300px] rounded-lg cursor-pointer object-cover"
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
            <button className="absolute top-4 right-4 text-white active:text-gray-300" onClick={() => setLightboxOpen(false)}>
              <X className="w-8 h-8" />
            </button>
            <AuthImage proxyUrl={proxyUrl} alt={caption || "Image"} className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
          </div>
        )}
      </div>
    );
  }

  if (msg.messageType === "sticker" && proxyUrl) {
    return (
      <div data-testid={`media-sticker-${msg.id}`}>
        <AuthImage proxyUrl={proxyUrl} alt="Sticker" className="w-32 h-32 object-contain" loading="lazy" />
      </div>
    );
  }

  if (msg.messageType === "audio" && proxyUrl) {
    return <AuthAudioPlayer proxyUrl={proxyUrl} msgId={msg.id} />;
  }

  if (msg.messageType === "video" && proxyUrl) {
    return (
      <div data-testid={`media-video-${msg.id}`}>
        <AuthVideo proxyUrl={proxyUrl} className="max-w-[280px] max-h-[240px] rounded-lg" caption={caption} />
      </div>
    );
  }

  if (msg.messageType === "document" && proxyUrl) {
    return <AuthDocumentCard msg={msg} proxyUrl={proxyUrl} />;
  }

  if (msg.messageType === "location" && msg.mediaUrl?.startsWith("geo:")) {
    const coords = msg.mediaUrl.slice(4).split(",");
    const lat = coords[0];
    const lng = coords[1];
    const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    return (
      <div data-testid={`media-location-${msg.id}`}>
        <a href={mapUrl} target="_blank" rel="noopener noreferrer"
          className="block rounded-lg overflow-hidden border border-slate-700 active:opacity-90 transition-opacity"
        >
          <div className="bg-slate-700/50 p-3 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{msg.text || "Shared Location"}</div>
              <div className="text-[10px] text-slate-500">{lat}, {lng}</div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-500 flex-shrink-0" />
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
          <Users className="w-4 h-4 text-slate-500" />
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
            <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-slate-700/50">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{name}</div>
                {phones.map((p: string, j: number) => (
                  <div key={j} className="text-[11px] text-slate-500">{p}</div>
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

function OtpLoginScreen({ onSuccess }: { onSuccess: (slug: string, token: string) => void }) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState(() => localStorage.getItem("agent_chat_last_email") || "");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [merchantName, setMerchantName] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/agent-chat/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        localStorage.setItem("agent_chat_last_email", email.trim().toLowerCase());
        setMerchantName(data.merchantName || "");
        setStep("otp");
        setCooldown(60);
      } else {
        setError(data.message || "Failed to send OTP. Check the email and try again.");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6 || loading) return;
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/agent-chat/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: otp }),
      });
      const data = await resp.json();
      if (resp.ok && data.success && data.token && data.slug) {
        storeToken(data.slug, data.token);
        setActiveSlug(data.slug);
        onSuccess(data.slug, data.token);
      } else {
        setError(data.message || "Invalid code. Please try again.");
        setOtp("");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/agent-chat/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setCooldown(60);
        setOtp("");
      } else {
        setError(data.message || "Failed to resend OTP.");
      }
    } catch {
      setError("Connection error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-950 p-6 select-none">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto">
            {step === "email" ? <Mail className="w-8 h-8 text-white" /> : <Lock className="w-8 h-8 text-white" />}
          </div>
          <h1 className="text-2xl font-bold text-white" data-testid="text-otp-title">
            {step === "email" ? "Agent Chat" : merchantName || "Verify Code"}
          </h1>
          <p className="text-slate-400 text-sm" data-testid="text-otp-subtitle">
            {step === "email"
              ? "Enter the merchant email to sign in"
              : `Enter the 6-digit code sent to ${email}`}
          </p>
        </div>

        <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
          {error && <p className="text-red-400 text-sm text-center" data-testid="text-otp-error">{error}</p>}

          {step === "email" ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="merchant@example.com"
                className="w-full bg-slate-800 text-white placeholder:text-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                autoComplete="email"
                data-testid="input-otp-email"
              />
              <button
                type="submit"
                disabled={!email.trim() || loading}
                className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm active:bg-blue-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                data-testid="button-send-otp"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Login Code
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="flex justify-center gap-2">
                {[0,1,2,3,4,5].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-10 h-12 rounded-lg border-2 flex items-center justify-center text-lg font-bold transition-colors",
                      i < otp.length ? "border-blue-400 bg-blue-600/20 text-white" : "border-slate-600 text-slate-500"
                    )}
                    data-testid={`otp-dot-${i}`}
                  >
                    {otp[i] || ""}
                  </div>
                ))}
              </div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); if (v.length <= 6) setOtp(v); }}
                className="sr-only"
                autoFocus
                data-testid="input-otp-code"
              />
              <div className="grid grid-cols-3 gap-2">
                {[1,2,3,4,5,6,7,8,9].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => { if (otp.length < 6) setOtp(p => p + n); }}
                    className="h-12 rounded-xl bg-slate-800 text-white text-lg font-semibold active:bg-slate-700 transition-colors"
                    data-testid={`otp-key-${n}`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setOtp(p => p.slice(0, -1))}
                  className="h-12 rounded-xl bg-slate-800 text-sm text-slate-400 active:bg-slate-700 transition-colors"
                  data-testid="otp-key-back"
                >
                  &#9003;
                </button>
                <button
                  type="button"
                  onClick={() => { if (otp.length < 6) setOtp(p => p + "0"); }}
                  className="h-12 rounded-xl bg-slate-800 text-white text-lg font-semibold active:bg-slate-700 transition-colors"
                  data-testid="otp-key-0"
                >
                  0
                </button>
                <button
                  type="submit"
                  disabled={otp.length < 6 || loading}
                  className="h-12 rounded-xl bg-blue-600 text-white text-sm font-semibold active:bg-blue-700 disabled:opacity-40 transition-colors flex items-center justify-center"
                  data-testid="button-verify-otp"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Verify"}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => { setStep("email"); setOtp(""); setError(""); }}
                  className="text-slate-400 active:text-white"
                  data-testid="button-otp-back-email"
                >
                  Change email
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={cooldown > 0 || loading}
                  className="text-blue-400 disabled:text-slate-600"
                  data-testid="button-resend-otp"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                </button>
              </div>
            </form>
          )}
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
  onLogout,
  isRefreshing,
}: {
  conversations: Conversation[];
  onSelect: (id: string) => void;
  totalUnread: number;
  onLogout?: () => void;
  isRefreshing?: boolean;
}) {
  const slug = useContext(SlugContext);
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data: agentLabels = [] } = useQuery<WaLabelItem[]>({
    queryKey: ["/api/agent-chat/labels", slug],
    queryFn: async () => {
      const token = getStoredToken(slug);
      if (!token) return [];
      const resp = await fetch("/api/agent-chat/labels", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return [];
      return resp.json();
    },
    enabled: !!slug,
  });

  const getLabelInfo = useCallback((label: string | null) => {
    if (!label) return null;
    return agentLabels.find(l => l.name === label) || null;
  }, [agentLabels]);

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
        <h1 className="font-bold text-lg flex-1" data-testid="text-agent-chat-title">
          Chats
          {isRefreshing && <RefreshCw className="w-3 h-3 animate-spin inline ml-2 text-slate-500" />}
        </h1>
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
        {onLogout && (
          <button
            onClick={onLogout}
            className="p-2 rounded-lg active:bg-slate-800 transition-colors text-slate-400"
            data-testid="button-agent-logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        )}
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
          <button
            onClick={() => setLabelFilter("all")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
              labelFilter === "all" ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400 active:bg-slate-800"
            )}
            data-testid="agent-filter-all"
          >
            All
          </button>
          <button
            onClick={() => setLabelFilter("unread")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
              labelFilter === "unread" ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400 active:bg-slate-800"
            )}
            data-testid="agent-filter-unread"
          >
            Unread
          </button>
          {agentLabels.map(l => (
            <button
              key={l.id}
              onClick={() => setLabelFilter(l.name)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                labelFilter === l.name ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400 active:bg-slate-800"
              )}
              data-testid={`agent-filter-${l.name.toLowerCase()}`}
            >
              <span className={cn("inline-block w-2 h-2 rounded-full mr-1.5", l.color)} />
              {l.name}
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
                        {labelInfo.name}
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
  sseConnected = false,
}: {
  conversation: Conversation;
  onBack: () => void;
  sseConnected?: boolean;
}) {
  const slug = useContext(SlugContext);
  const [messageText, setMessageText] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const [showFormatBar, setShowFormatBar] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const cachedMsgs = useMemo(() => getCachedMessages(slug, conversation.id), [slug, conversation.id]);
  const { data: messages = cachedMsgs || [] } = useQuery<Message[]>({
    queryKey: ["/api/agent-chat/conversations", slug, conversation.id, "messages"],
    queryFn: async () => {
      const resp = await agentFetch(`/api/agent-chat/conversations/${conversation.id}/messages`, slug);
      if (!resp.ok) throw new Error("Failed to fetch messages");
      const data = await resp.json();
      setCachedMessages(slug, conversation.id, data);
      return data;
    },
    refetchInterval: sseConnected ? 30_000 : 3000,
    staleTime: 2000,
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

  const { data: chatViewLabels = [] } = useQuery<WaLabelItem[]>({
    queryKey: ["/api/agent-chat/labels", slug],
    queryFn: async () => {
      const token = getStoredToken(slug);
      if (!token) return [];
      const resp = await fetch("/api/agent-chat/labels", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return [];
      return resp.json();
    },
    enabled: !!slug,
  });

  const getLabelInfo = useCallback((label: string | null) => {
    if (!label) return null;
    return chatViewLabels.find(l => l.name === label) || null;
  }, [chatViewLabels]);

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
              {chatViewLabels.map(l => (
                <button
                  key={l.id}
                  onClick={() => { labelMutation.mutate({ label: l.name }); setShowActions(false); }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium active:opacity-80 transition-colors",
                    conversation.label === l.name ? "ring-2 ring-white/30" : "",
                    l.color, "text-white"
                  )}
                  data-testid={`agent-label-${l.name.toLowerCase()}`}
                >
                  {l.name}
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
                          {!isButtonReply && isNonText && (
                            <AgentMediaBubble msg={msg} mediaProxyBase="/api/agent-chat/media" />
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

async function subscribeToPush(slug: string) {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = await navigator.serviceWorker.ready;
    const resp = await fetch("/api/agent-chat/push/vapid-key");
    const { publicKey } = await resp.json();
    if (!publicKey) return;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    const subJson = sub.toJSON();
    await agentFetch("/api/agent-chat/push/subscribe", slug, {
      method: "POST",
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: { p256dh: subJson.keys?.p256dh, auth: subJson.keys?.auth },
      }),
    });
  } catch (err) {
    console.error("[Push] Subscribe error:", err);
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export default function AgentChatPage() {
  const pathSlug = getSlugFromPath();
  const [activeSlugState, setActiveSlugState] = useState<string>(() => {
    if (pathSlug && getStoredToken(pathSlug)) return pathSlug;
    const stored = getActiveSlug();
    if (stored && getStoredToken(stored)) return stored;
    return pathSlug || "";
  });
  const slug = activeSlugState;
  const [hasAccess, setHasAccess] = useState(() => !!slug && !!getStoredToken(slug));
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [merchantNotFound, setMerchantNotFound] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const queryClient = useQueryClient();

  // ── SSE real-time connection ─────────────────────────────────────────────────
  const sseFailCount = useRef(0);
  const sseRef = useRef<EventSource | null>(null);
  const sseBackoffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const selectedConvIdRef = useRef<string | null>(null);
  selectedConvIdRef.current = selectedConvId;

  const connectAgentSse = useCallback(() => {
    const token = slug ? getStoredToken(slug) : null;
    if (!token || !hasAccess) return;
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    const es = new EventSource(`/api/agent-chat/sse?token=${encodeURIComponent(token)}`);
    sseRef.current = es;
    es.onopen = () => { sseFailCount.current = 0; setSseConnected(true); };
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "new_message") {
          if (data.conversationId && data.conversationId === selectedConvIdRef.current) {
            if (data.message) {
              queryClient.setQueryData<Message[]>(
                ["/api/agent-chat/conversations", slug, data.conversationId, "messages"],
                (old) => {
                  if (!old) return [data.message];
                  if (old.some(m => m.id === data.message.id)) return old;
                  return [...old, data.message];
                }
              );
            } else {
              queryClient.invalidateQueries({
                queryKey: ["/api/agent-chat/conversations", slug, data.conversationId, "messages"],
              });
            }
          }
          queryClient.invalidateQueries({ queryKey: ["/api/agent-chat/conversations", slug] });
        } else if (data.type === "status_update") {
          if (data.conversationId && data.conversationId === selectedConvIdRef.current) {
            queryClient.setQueryData<Message[]>(
              ["/api/agent-chat/conversations", slug, data.conversationId, "messages"],
              (old) => {
                if (!old) return old;
                return old.map(msg =>
                  msg.waMessageId === data.waMessageId ? { ...msg, status: data.status } : msg
                );
              }
            );
          }
        } else if (data.type === "conversation_update") {
          queryClient.invalidateQueries({ queryKey: ["/api/agent-chat/conversations", slug] });
        }
      } catch {}
    };
    es.onerror = () => {
      setSseConnected(false);
      es.close();
      sseRef.current = null;
      sseFailCount.current += 1;
      // Exponential backoff for first 3 attempts, then long-tail 30s retries
      const delay = sseFailCount.current <= 3
        ? Math.min(1000 * Math.pow(2, sseFailCount.current - 1), 30_000)
        : 30_000;
      sseBackoffRef.current = setTimeout(connectAgentSse, delay);
    };
  }, [slug, hasAccess, queryClient]);

  useEffect(() => {
    if (hasAccess && slug) {
      connectAgentSse();
    } else {
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
      setSseConnected(false);
    }
    return () => {
      if (sseBackoffRef.current) clearTimeout(sseBackoffRef.current);
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    };
  }, [connectAgentSse, hasAccess, slug]);

  const agentConvPollInterval = sseConnected ? 60_000 : (isVisible ? 5000 : false);
  const agentMsgPollInterval = sseConnected ? 30_000 : 3000;

  const cachedConvs = useMemo(() => slug ? getCachedConversations(slug) : null, [slug]);

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

  const { data: conversations = cachedConvs || [], isFetching: isFetchingConvs } = useQuery<Conversation[]>({
    queryKey: ["/api/agent-chat/conversations", slug],
    queryFn: async () => {
      const resp = await agentFetch("/api/agent-chat/conversations", slug);
      if (resp.status === 401) {
        clearToken(slug);
        setHasAccess(false);
        throw new Error("Token expired");
      }
      if (!resp.ok) throw new Error("Failed to fetch conversations");
      const data = await resp.json();
      setCachedConversations(slug, data);
      return data;
    },
    enabled: hasAccess && !!slug && isVisible,
    refetchInterval: agentConvPollInterval,
    staleTime: 3000,
  });

  useEffect(() => {
    const handler = () => {
      const visible = document.visibilityState === "visible";
      setIsVisible(visible);
      if (visible && hasAccess && slug) {
        queryClient.invalidateQueries({ queryKey: ["/api/agent-chat/conversations", slug] });
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [hasAccess, slug, queryClient]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "NEW_MESSAGE" && hasAccess && slug) {
        queryClient.invalidateQueries({ queryKey: ["/api/agent-chat/conversations", slug] });
        if (selectedConvId) {
          queryClient.invalidateQueries({ queryKey: ["/api/agent-chat/conversations", slug, selectedConvId, "messages"] });
        }
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [hasAccess, slug, selectedConvId, queryClient]);

  useEffect(() => {
    if (hasAccess && slug) {
      subscribeToPush(slug);
    }
  }, [hasAccess, slug]);

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
      start_url: `/agent-chat/`,
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

  const handleLogout = () => {
    if (slug) {
      clearToken(slug);
      clearAllCache(slug);
      clearActiveSlug();
    }
    setHasAccess(false);
    setActiveSlugState("");
    setSelectedConvId(null);
    queryClient.clear();
  };

  const handleLoginSuccess = (newSlug: string, _token: string) => {
    setActiveSlugState(newSlug);
    setHasAccess(true);
  };

  if (pathSlug && merchantNotFound) {
    return <NotFoundScreen />;
  }

  if (!hasAccess) {
    return <OtpLoginScreen onSuccess={handleLoginSuccess} />;
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
            sseConnected={sseConnected}
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
          onLogout={handleLogout}
          isRefreshing={isFetchingConvs && conversations.length > 0}
        />
      </div>
    </SlugContext.Provider>
  );
}
