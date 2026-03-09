import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MessageCircle, Search, Send, Trash2, Lock, Phone } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  contactPhone: string;
  contactName: string | null;
  orderNumber: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
}

interface Message {
  id: string;
  conversationId: string;
  direction: string;
  senderName: string | null;
  text: string | null;
  status: string | null;
  createdAt: string;
}

const SESSION_KEY = "support_chat_access";
const MERCHANT_KEY = "support_chat_merchant";

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
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Support Chat</h1>
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
            className="text-center text-xl tracking-widest h-12"
            data-testid="input-pin"
          />
          {error && (
            <p className="text-red-500 text-sm text-center" data-testid="text-pin-error">{error}</p>
          )}
          <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={loading || pin.length < 4} data-testid="button-submit-pin">
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedConvId]);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/support/conversations"],
    enabled: hasAccess,
    refetchInterval: 5000,
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/support/conversations", selectedConvId, "messages"],
    queryFn: async () => {
      if (!selectedConvId) return [];
      const resp = await fetch(`/api/support/conversations/${selectedConvId}/messages`, {
        credentials: "include",
      });
      return resp.json();
    },
    enabled: hasAccess && !!selectedConvId,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async (text: string) =>
      apiRequest("POST", `/api/support/conversations/${selectedConvId}/messages`, { text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations", selectedConvId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      setMessageText("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("DELETE", `/api/support/conversations/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      if (selectedConvId === id) setSelectedConvId(null);
    },
  });

  if (!hasAccess) {
    return <PinScreen onSuccess={() => setHasAccess(true)} />;
  }

  const filtered = conversations.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.contactPhone.includes(q) ||
      (c.contactName ?? "").toLowerCase().includes(q) ||
      (c.orderNumber ?? "").toLowerCase().includes(q)
    );
  });

  const selectedConv = conversations.find(c => c.id === selectedConvId);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedConvId) return;
    sendMutation.mutate(messageText.trim());
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <div className="w-80 border-r flex flex-col shrink-0">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-500" />
            <h2 className="font-semibold text-sm">Support Inbox</h2>
            {conversations.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs">{conversations.length}</Badge>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
              data-testid="input-search-conversations"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              {search ? "No conversations match" : "No conversations yet"}
            </div>
          ) : (
            filtered.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                className={cn(
                  "w-full p-4 text-left hover:bg-muted/50 transition-colors border-b",
                  selectedConvId === conv.id && "bg-muted"
                )}
                data-testid={`button-conversation-${conv.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-green-500 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-white text-xs font-bold">
                      {(conv.contactName ?? conv.contactPhone).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate" data-testid={`text-contact-${conv.id}`}>
                        {conv.contactName || `+${conv.contactPhone}`}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: false })}
                      </span>
                    </div>
                    {conv.orderNumber && (
                      <span className="text-xs text-muted-foreground">#{conv.orderNumber}</span>
                    )}
                    {conv.lastMessage && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <MessageCircle className="w-12 h-12 mx-auto opacity-20" />
              <p className="text-sm">Select a conversation to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b flex items-center gap-3">
              <div className="w-9 h-9 bg-green-500 rounded-full flex items-center justify-center shrink-0">
                <span className="text-white text-sm font-bold">
                  {(selectedConv.contactName ?? selectedConv.contactPhone).charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm" data-testid="text-selected-contact">
                  {selectedConv.contactName || `+${selectedConv.contactPhone}`}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Phone className="w-3 h-3" />
                  <span>+{selectedConv.contactPhone}</span>
                  {selectedConv.orderNumber && (
                    <>
                      <Separator orientation="vertical" className="h-3" />
                      <span>Order #{selectedConv.orderNumber}</span>
                    </>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => deleteMutation.mutate(selectedConv.id)}
                disabled={deleteMutation.isPending}
                data-testid="button-delete-conversation"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    No messages yet
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn("flex", msg.direction === "outbound" ? "justify-end" : "justify-start")}
                      data-testid={`message-${msg.id}`}
                    >
                      <div
                        className={cn(
                          "max-w-xs lg:max-w-md px-3 py-2 rounded-2xl text-sm",
                          msg.direction === "outbound"
                            ? "bg-green-500 text-white rounded-br-sm"
                            : "bg-muted rounded-bl-sm"
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.text || "(empty)"}</p>
                        <p className={cn(
                          "text-xs mt-1",
                          msg.direction === "outbound" ? "text-green-100 text-right" : "text-muted-foreground"
                        )}>
                          {format(new Date(msg.createdAt), "HH:mm")}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-4 border-t">
              <form onSubmit={handleSend} className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="flex-1"
                  data-testid="input-message"
                />
                <Button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={!messageText.trim() || sendMutation.isPending}
                  data-testid="button-send-message"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
