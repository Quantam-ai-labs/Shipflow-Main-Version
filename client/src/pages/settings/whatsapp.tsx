import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Wifi, WifiOff, Eye, EyeOff, FlaskConical, Save, Copy, Check, Lock, Smartphone, QrCode, Shield, XCircle, Unplug, PlugZap, MessageSquare, ChevronDown, Settings2, Zap, AlertTriangle, KeyRound } from "lucide-react";
import { SiWhatsapp, SiFacebook } from "react-icons/si";
import { format } from "date-fns";
import QRCode from "qrcode";

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

interface ConnectionData {
  waPhoneNumberId: string;
  waAccessToken: string;
  waWabaId: string;
  connected: boolean;
  waDisconnected: boolean;
  waPhoneRegistered: boolean;
  waVerifyToken: string;
  webhookUrl: string;
}

interface EmbeddedSignupResult {
  success: boolean;
  wabaId: string;
  phoneNumberId: string;
  displayPhone: string;
  verifiedName: string;
  webhookUrl: string;
  verifyToken: string;
  registrationStatus?: "success" | "failed" | "2fa_required";
  registrationError?: string;
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

function useLoadFacebookSDK(appId: string | null) {
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    if (!appId) return;

    if (window.FB) {
      setSdkReady(true);
      return;
    }

    window.fbAsyncInit = function () {
      window.FB.init({
        appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: "v22.0",
      });
      setSdkReady(true);
    };

    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  }, [appId]);

  return sdkReady;
}

export default function SettingsWhatsApp() {
  const { toast } = useToast();
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState({ waPhoneNumberId: "", waAccessToken: "", waWabaId: "" });
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [chatPin, setChatPin] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [signupInProgress, setSignupInProgress] = useState(false);
  const [regStatus, setRegStatus] = useState<"success" | "failed" | "2fa_required" | null>(null);
  const [regError, setRegError] = useState<string | null>(null);
  const [twoFaPin, setTwoFaPin] = useState("");
  const sessionInfoRef = useRef<{ wabaId?: string; phoneId?: string }>({});
  const agentChatQrRef = useRef<HTMLCanvasElement>(null);

  const { data, isLoading } = useQuery<ConnectionData>({
    queryKey: ["/api/support/connection"],
    refetchOnWindowFocus: false,
  });

  const { data: sdkConfig } = useQuery<{ appId: string; configId: string }>({
    queryKey: ["/api/whatsapp/embedded-signup/config"],
    refetchOnWindowFocus: false,
  });

  const sdkReady = useLoadFacebookSDK(sdkConfig?.appId ?? null);

  if (data && !loaded) {
    setForm({
      waPhoneNumberId: data.waPhoneNumberId || "",
      waAccessToken: data.waAccessToken || "",
      waWabaId: data.waWabaId || "",
    });
    if (data.connected && !data.waPhoneRegistered && regStatus === null) {
      setRegStatus("failed");
    } else if (data.connected && data.waPhoneRegistered && regStatus === null) {
      setRegStatus("success");
    }
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

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data.type === "WA_EMBEDDED_SIGNUP") {
          if (data.event === "FINISH") {
            const { phone_number_id, waba_id } = data.data || {};
            if (waba_id) sessionInfoRef.current.wabaId = waba_id;
            if (phone_number_id) sessionInfoRef.current.phoneId = phone_number_id;
            console.log("[WA-Signup] sessionInfoListener FINISH:", { waba_id, phone_number_id });
          } else if (data.event === "CANCEL") {
            console.log("[WA-Signup] sessionInfoListener CANCEL");
          } else if (data.event === "ERROR") {
            console.warn("[WA-Signup] sessionInfoListener ERROR:", data.data);
          }
        }
      } catch {}
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

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

  const disconnectMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/support/connection/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/connection"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/dashboard-stats"] });
      toast({ title: "WhatsApp Disconnected", description: "WhatsApp message sending has been paused. Your credentials are preserved." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const reconnectMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/support/connection/reconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/connection"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/dashboard-stats"] });
      toast({ title: "WhatsApp Reconnected", description: "WhatsApp message sending has been re-enabled." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const embeddedSignupMutation = useMutation({
    mutationFn: async (code: string) => {
      const sessionInfo = sessionInfoRef.current;
      const res = await apiRequest("POST", "/api/whatsapp/embedded-signup", {
        code,
        sessionWabaId: sessionInfo.wabaId || undefined,
        sessionPhoneId: sessionInfo.phoneId || undefined,
      });
      return (await res.json()) as EmbeddedSignupResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/connection"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/dashboard-stats"] });
      setLoaded(false);
      sessionInfoRef.current = {};

      if (result.registrationStatus === "2fa_required") {
        setRegStatus("2fa_required");
        setRegError(result.registrationError || null);
        toast({
          title: "WhatsApp Connected — PIN Required",
          description: "Your account is connected but needs a 2FA PIN to complete phone registration.",
        });
      } else if (result.registrationStatus === "failed") {
        setRegStatus("failed");
        setRegError(result.registrationError || null);
        toast({
          title: "WhatsApp Connected — Registration Incomplete",
          description: result.registrationError || "Phone registration failed. You can retry below.",
          variant: "destructive",
        });
      } else {
        setRegStatus("success");
        setRegError(null);
        toast({
          title: "WhatsApp Connected!",
          description: `Phone ${result.displayPhone || result.phoneNumberId} connected and registered successfully.`,
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Connection Failed", description: err.message || "Failed to complete WhatsApp signup", variant: "destructive" });
    },
  });

  const registerPhoneMutation = useMutation({
    mutationFn: async (pin: string) => {
      const body: Record<string, string> = {};
      if (pin) body.pin = pin;
      const res = await apiRequest("POST", "/api/whatsapp/register-phone", body);
      return (await res.json()) as { success: boolean; registrationStatus: string };
    },
    onSuccess: () => {
      setRegStatus("success");
      setRegError(null);
      setTwoFaPin("");
      queryClient.invalidateQueries({ queryKey: ["/api/support/connection"] });
      toast({
        title: "Phone Registered!",
        description: "Your WhatsApp phone number is now fully registered and ready to send messages.",
      });
    },
    onError: (err: any) => {
      const serverStatus = err?.registrationStatus;
      if (serverStatus === "2fa_required") {
        setRegStatus("2fa_required");
        setRegError(err.message || "Two-factor authentication PIN required.");
      } else if (serverStatus === "failed") {
        setRegStatus("failed");
        setRegError(err.message || "Registration failed.");
      }
      toast({
        title: "Registration Failed",
        description: err.message || "Could not register phone number. Check your PIN and try again.",
        variant: "destructive",
      });
    },
  });

  const handleEmbeddedSignup = useCallback(() => {
    if (!window.FB || !sdkReady) {
      toast({ title: "Not ready", description: "Facebook SDK is still loading. Please try again.", variant: "destructive" });
      return;
    }

    setSignupInProgress(true);
    sessionInfoRef.current = {};

    const configId = sdkConfig?.configId;

    if (configId) {
      window.FB.login(
        (response: any) => {
          if (response.authResponse?.code) {
            embeddedSignupMutation.mutate(response.authResponse.code);
          } else {
            toast({ title: "Cancelled", description: "WhatsApp signup was cancelled.", variant: "destructive" });
          }
          setSignupInProgress(false);
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: "whatsapp_embedded_signup",
            sessionInfoVersion: "3",
          },
        }
      );
    } else {
      window.FB.login(
        (response: any) => {
          if (response.authResponse?.code) {
            embeddedSignupMutation.mutate(response.authResponse.code);
          } else {
            toast({ title: "Cancelled", description: "WhatsApp signup was cancelled.", variant: "destructive" });
          }
          setSignupInProgress(false);
        },
        {
          scope: "whatsapp_business_management,whatsapp_business_messaging,business_management",
          response_type: "code",
          override_default_response_type: true,
        }
      );
    }
  }, [sdkReady, sdkConfig, embeddedSignupMutation, toast]);

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

  const isConnected = data?.connected && !data?.waDisconnected;
  const isDisconnected = data?.waDisconnected;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight" data-testid="text-wa-settings-title">WhatsApp Business API</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Connect your WhatsApp Business account for automated messaging</p>
        </div>
        {isLoading ? (
          <Skeleton className="h-7 w-28" />
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant={isConnected ? "default" : "secondary"}
              className={
                isConnected && data?.waPhoneRegistered
                  ? "bg-green-500 text-white gap-1.5 no-default-hover-elevate no-default-active-elevate"
                  : isConnected && !data?.waPhoneRegistered
                    ? "bg-amber-500 text-white gap-1.5 no-default-hover-elevate no-default-active-elevate"
                    : isDisconnected
                      ? "bg-amber-500 text-white gap-1.5 no-default-hover-elevate no-default-active-elevate"
                      : "gap-1.5"
              }
              data-testid="status-wa-connection"
            >
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isDisconnected ? "Paused" : isConnected && data?.waPhoneRegistered ? "Connected" : isConnected ? "Phone Not Registered" : "Not Connected"}
            </Badge>
            {isConnected && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    data-testid="button-disconnect-wa"
                  >
                    <Unplug className="w-3.5 h-3.5 mr-1.5" />
                    Pause
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Pause WhatsApp?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will pause all WhatsApp message sending (order confirmations, status updates, etc.). Your credentials will be preserved and you can resume at any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-disconnect">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => disconnectMutation.mutate()}
                      className="bg-destructive text-destructive-foreground"
                      data-testid="button-confirm-disconnect"
                    >
                      {disconnectMutation.isPending ? "Pausing..." : "Pause Messaging"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {isDisconnected && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => reconnectMutation.mutate()}
                disabled={reconnectMutation.isPending}
                data-testid="button-reconnect-wa"
              >
                <PlugZap className="w-3.5 h-3.5 mr-1.5" />
                {reconnectMutation.isPending ? "Resuming..." : "Resume"}
              </Button>
            )}
          </div>
        )}
      </div>

      {!isLoading && !data?.connected && (
        <Card className="border-2 border-dashed border-green-500/30 bg-green-50/50 dark:bg-green-950/10">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <SiWhatsapp className="w-8 h-8 text-green-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Connect WhatsApp Business</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Connect your WhatsApp Business Account with one click. Sign in with Facebook, select your business, and you're all set — no API keys needed.
                </p>
              </div>
              <Button
                size="lg"
                className="bg-[#1877F2] hover:bg-[#166FE5] text-white gap-2 px-8"
                onClick={handleEmbeddedSignup}
                disabled={signupInProgress || embeddedSignupMutation.isPending || !sdkReady}
                data-testid="button-connect-whatsapp-embedded"
              >
                <SiFacebook className="w-5 h-5" />
                {signupInProgress || embeddedSignupMutation.isPending
                  ? "Connecting..."
                  : !sdkReady
                    ? "Loading..."
                    : "Connect with Facebook"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Powered by Meta's Embedded Signup — securely connect your WhatsApp Business Account
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && data?.connected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <SiWhatsapp className="w-4 h-4 text-green-500" />
              Connected Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Phone Number ID</Label>
                <p className="text-sm font-mono mt-0.5" data-testid="text-connected-phone-id">{data.waPhoneNumberId || "—"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">WABA ID</Label>
                <p className="text-sm font-mono mt-0.5" data-testid="text-connected-waba-id">{data.waWabaId || "—"}</p>
              </div>
            </div>

            {(regStatus === "2fa_required" || regStatus === "failed") && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10 p-4 space-y-3" data-testid="section-registration-status">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">
                      {regStatus === "2fa_required" ? "2FA PIN Required" : "Phone Registration Failed"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {regStatus === "2fa_required"
                        ? "Your WhatsApp number has two-factor authentication enabled. Enter your 6-digit WhatsApp PIN to complete registration."
                        : regError || "Phone registration did not complete. You can retry below."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder={regStatus === "2fa_required" ? "6-digit WhatsApp PIN" : "PIN (optional)"}
                    value={twoFaPin}
                    onChange={(e) => setTwoFaPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="max-w-[160px]"
                    data-testid="input-2fa-pin"
                  />
                  <Button
                    size="sm"
                    onClick={() => registerPhoneMutation.mutate(twoFaPin || "")}
                    disabled={(regStatus === "2fa_required" && twoFaPin.length !== 6) || (twoFaPin.length > 0 && twoFaPin.length !== 6) || registerPhoneMutation.isPending}
                    data-testid="button-register-phone"
                  >
                    <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                    {registerPhoneMutation.isPending ? "Registering..." : regStatus === "2fa_required" ? "Complete Registration" : "Retry Registration"}
                  </Button>
                </div>
              </div>
            )}

            {regStatus === "success" && (
              <div className="rounded-lg border border-green-500/30 bg-green-50/50 dark:bg-green-950/10 p-3 flex items-center gap-2" data-testid="section-registration-success">
                <Check className="w-4 h-4 text-green-500" />
                <p className="text-sm text-green-700 dark:text-green-400">Phone number registered and ready to send messages</p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="bg-[#1877F2] hover:bg-[#166FE5] text-white border-0 gap-1.5"
                onClick={handleEmbeddedSignup}
                disabled={signupInProgress || embeddedSignupMutation.isPending || !sdkReady}
                data-testid="button-reconnect-whatsapp-embedded"
              >
                <SiFacebook className="w-3.5 h-3.5" />
                {signupInProgress || embeddedSignupMutation.isPending ? "Connecting..." : "Reconnect via Facebook"}
              </Button>
              {regStatus !== "2fa_required" && regStatus !== "failed" && !data?.waPhoneRegistered && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => {
                    setRegStatus("failed");
                    setRegError(null);
                  }}
                  data-testid="button-show-reregister"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Re-register Phone
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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

      <Collapsible open={manualOpen} onOpenChange={setManualOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings2 className="w-4 h-4" />
                    Manual API Credentials
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Advanced: Enter credentials manually if you prefer not to use the one-click connect
                  </CardDescription>
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${manualOpen ? "rotate-180" : ""}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
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
          </CollapsibleContent>
        </Card>
      </Collapsible>

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
              Share this link with your support agents. They can sign in using the merchant email OTP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Agent Chat URL (Universal)</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate" data-testid="text-agent-chat-url">
                  {`${window.location.origin}/agent-chat/`}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/agent-chat/`);
                    toast({ title: "URL copied" });
                  }}
                  data-testid="button-copy-agent-chat-url"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground font-medium mt-2">Direct Link (Store-specific)</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate" data-testid="text-agent-chat-direct-url">
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
                  data-testid="button-copy-agent-chat-direct-url"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <div className="flex flex-col items-center gap-2 pt-2">
                <canvas ref={agentChatQrRef} className="rounded border" data-testid="qr-agent-chat" />
                <div className="text-xs text-muted-foreground text-center space-y-0.5">
                  <p className="flex items-center justify-center gap-1"><QrCode className="w-3 h-3" /> Scan QR to open on mobile</p>
                  <p>Agents sign in with merchant email OTP</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <AgentChatSessionsCard />
    </div>
  );
}

function AgentChatSessionsCard() {
  const { toast } = useToast();

  const { data: sessions = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/settings/agent-chat-sessions"],
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/settings/agent-chat-sessions/${id}/revoke`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/agent-chat-sessions"] });
      toast({ title: "Session revoked" });
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/settings/agent-chat-sessions/revoke-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/agent-chat-sessions"] });
      toast({ title: "All sessions revoked" });
    },
  });

  const activeSessions = sessions.filter((s: any) => !s.isRevoked);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Agent Chat Sessions
            </CardTitle>
            <CardDescription>
              {activeSessions.length} active session{activeSessions.length !== 1 ? "s" : ""}. Revoke access for any device.
            </CardDescription>
          </div>
          {activeSessions.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => revokeAllMutation.mutate()}
              disabled={revokeAllMutation.isPending}
              data-testid="button-revoke-all-sessions"
            >
              {revokeAllMutation.isPending ? "Revoking..." : "Revoke All"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No agent chat logins yet</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session: any) => (
              <div
                key={session.id}
                className={`rounded-lg border p-3 flex items-center gap-3 ${session.isRevoked ? "opacity-50" : ""}`}
                data-testid={`row-session-${session.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{session.deviceInfo || "Unknown device"}</span>
                    <Badge variant={session.isRevoked ? "secondary" : "default"} className={session.isRevoked ? "" : "bg-green-500 text-white"}>
                      {session.isRevoked ? "Revoked" : "Active"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Last seen: {session.lastSeenAt ? format(new Date(session.lastSeenAt), "PPp") : "Never"}
                  </p>
                </div>
                {!session.isRevoked && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive shrink-0"
                    onClick={() => revokeMutation.mutate(session.id)}
                    disabled={revokeMutation.isPending}
                    data-testid={`button-revoke-session-${session.id}`}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
