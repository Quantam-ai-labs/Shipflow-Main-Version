import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Wifi, WifiOff, Eye, EyeOff, FlaskConical, Save, Copy, Check, Lock, Smartphone, QrCode } from "lucide-react";
import QRCode from "qrcode";

interface ConnectionData {
  waPhoneNumberId: string;
  waAccessToken: string;
  waWabaId: string;
  connected: boolean;
  waVerifyToken: string;
  webhookUrl: string;
}

function CopyButton({ value, testId }: { value: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title="Copy to clipboard"
      data-testid={testId}
    >
      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

export default function SettingsWhatsApp() {
  const { toast } = useToast();
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState({ waPhoneNumberId: "", waAccessToken: "", waWabaId: "" });
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [chatPin, setChatPin] = useState("");
  const agentChatQrRef = useRef<HTMLCanvasElement>(null);

  const { data, isLoading } = useQuery<ConnectionData>({
    queryKey: ["/api/support/connection"],
    refetchOnWindowFocus: false,
  });

  if (data && !loaded) {
    setForm({
      waPhoneNumberId: data.waPhoneNumberId || "",
      waAccessToken: data.waAccessToken || "",
      waWabaId: data.waWabaId || "",
    });
    setLoaded(true);
  }

  const { data: chatPinStatus } = useQuery<{ isSet: boolean; slug: string }>({
    queryKey: ["/api/support/chat-pin"],
    refetchOnWindowFocus: false,
  });

  const agentChatUrl = chatPinStatus?.slug ? `${window.location.origin}/agent-chat/${chatPinStatus.slug}` : "";

  useEffect(() => {
    if (agentChatUrl && agentChatQrRef.current) {
      QRCode.toCanvas(agentChatQrRef.current, agentChatUrl, { width: 160, margin: 1 }).catch(() => {});
    }
  }, [agentChatUrl]);

  const saveChatPinMutation = useMutation({
    mutationFn: async (pin: string) => apiRequest("POST", "/api/support/chat-pin", { pin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/chat-pin"] });
      setChatPin("");
      toast({ title: "PIN saved", description: "Support Chat PIN updated successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form) =>
      apiRequest("PUT", "/api/support/connection", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/connection"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/dashboard-stats"] });
      toast({ title: "Saved", description: "WhatsApp credentials updated successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleTest = async () => {
    const phoneId = form.waPhoneNumberId.trim();
    const token = form.waAccessToken.trim();
    if (!phoneId || !token || token === "••••••••") {
      toast({ title: "Missing credentials", description: "Enter Phone Number ID and Access Token to test.", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const resp = await fetch(`https://graph.facebook.com/v22.0/${phoneId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await resp.json() as any;
      if (resp.ok && body.id) {
        toast({ title: "Connection successful", description: `Phone: ${body.display_phone_number || phoneId}` });
      } else {
        toast({ title: "Connection failed", description: body.error?.message || "Invalid credentials", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Connection failed", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight" data-testid="text-wa-settings-title">WhatsApp Business API</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Configure your Meta WhatsApp Business API credentials and webhook</p>
        </div>
        {isLoading ? (
          <Skeleton className="h-7 w-28" />
        ) : (
          <Badge
            variant={data?.connected ? "default" : "secondary"}
            className={data?.connected ? "bg-green-500 hover:bg-green-600 text-white gap-1.5" : "gap-1.5"}
            data-testid="status-wa-connection"
          >
            {data?.connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {data?.connected ? "Connected" : "Not Connected"}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Credentials</CardTitle>
          <CardDescription>
            Get these values from the <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-primary underline">Meta Developer Portal</a> under your WhatsApp Business app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="phoneNumberId">Phone Number ID</Label>
                <Input
                  id="phoneNumberId"
                  placeholder="e.g. 123456789012345"
                  value={form.waPhoneNumberId}
                  onChange={(e) => setForm(f => ({ ...f, waPhoneNumberId: e.target.value }))}
                  data-testid="input-phone-number-id"
                />
                <p className="text-xs text-muted-foreground">Found in WhatsApp → Getting Started → Phone Number ID</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="accessToken">Access Token</Label>
                <div className="relative">
                  <Input
                    id="accessToken"
                    type={showToken ? "text" : "password"}
                    placeholder="Enter your permanent access token"
                    value={form.waAccessToken}
                    onChange={(e) => setForm(f => ({ ...f, waAccessToken: e.target.value }))}
                    className="pr-10"
                    data-testid="input-access-token"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid="button-toggle-token"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Use a permanent (system user) token for production use</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wabaId">WhatsApp Business Account ID</Label>
                <Input
                  id="wabaId"
                  placeholder="e.g. 987654321098765"
                  value={form.waWabaId}
                  onChange={(e) => setForm(f => ({ ...f, waWabaId: e.target.value }))}
                  data-testid="input-waba-id"
                />
                <p className="text-xs text-muted-foreground">Found in the WhatsApp Business Manager → Account Info</p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={handleTest}
                  disabled={testing}
                  data-testid="button-test-connection"
                >
                  <FlaskConical className="w-4 h-4 mr-2" />
                  {testing ? "Testing..." : "Test Connection"}
                </Button>
                <Button
                  onClick={() => saveMutation.mutate(form)}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-credentials"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saveMutation.isPending ? "Saving..." : "Save Credentials"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook Configuration</CardTitle>
          <CardDescription>
            Configure these values in Meta Developer Portal → WhatsApp → Configuration → Webhooks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Callback URL</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md break-all font-mono" data-testid="text-webhook-url">
                    {data?.webhookUrl ?? "—"}
                  </code>
                  {data?.webhookUrl && <CopyButton value={data.webhookUrl} testId="button-copy-webhook-url" />}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Verify Token</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md break-all font-mono" data-testid="text-verify-token">
                    {data?.waVerifyToken ?? "—"}
                  </code>
                  {data?.waVerifyToken && <CopyButton value={data.waVerifyToken} testId="button-copy-verify-token" />}
                </div>
                <p className="text-xs text-muted-foreground">This token is unique to your account — auto-generated and saved securely.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Subscribe to Fields</Label>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary">messages</Badge>
                  <Badge variant="secondary">message_deliveries</Badge>
                  <Badge variant="secondary">message_reads</Badge>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Chat PIN
          </CardTitle>
          <CardDescription>
            Required to open the Support Chat inbox. Set a 4–6 digit PIN.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant={chatPinStatus?.isSet ? "default" : "secondary"} className={chatPinStatus?.isSet ? "bg-green-500 hover:bg-green-600 text-white" : ""} data-testid="status-chat-pin">
              {chatPinStatus?.isSet ? "PIN set" : "Not set — using default (1234)"}
            </Badge>
          </div>
          <div className="space-y-2">
            <Label htmlFor="chatPin">{chatPinStatus?.isSet ? "Reset PIN" : "Set PIN"}</Label>
            <div className="flex gap-2">
              <Input
                id="chatPin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="4–6 digit PIN"
                value={chatPin}
                onChange={(e) => setChatPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="max-w-[160px]"
                data-testid="input-chat-pin"
              />
              <Button
                onClick={() => {
                  if (chatPin.length < 4) {
                    toast({ title: "Too short", description: "PIN must be at least 4 digits.", variant: "destructive" });
                    return;
                  }
                  saveChatPinMutation.mutate(chatPin);
                }}
                disabled={saveChatPinMutation.isPending || chatPin.length < 4}
                data-testid="button-save-chat-pin"
              >
                <Save className="w-4 h-4 mr-2" />
                {saveChatPinMutation.isPending ? "Saving..." : chatPinStatus?.isSet ? "Reset PIN" : "Set PIN"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {chatPinStatus?.slug && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Agent Chat Mobile App
            </CardTitle>
            <CardDescription>
              Share this link with your support agents to install the mobile WhatsApp chat app on their phones.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Agent Chat URL</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate" data-testid="text-agent-chat-url">
                  {agentChatUrl}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => {
                    navigator.clipboard.writeText(agentChatUrl);
                    toast({ title: "URL copied" });
                  }}
                  data-testid="button-copy-agent-chat-url"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <div className="flex flex-col items-center gap-2 pt-2">
                <canvas ref={agentChatQrRef} className="rounded border" data-testid="qr-agent-chat" />
                <div className="text-xs text-muted-foreground text-center space-y-0.5">
                  <p className="flex items-center justify-center gap-1"><QrCode className="w-3 h-3" /> Scan QR to open on mobile</p>
                  <p>Or share the link + Chat PIN with your agents</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
