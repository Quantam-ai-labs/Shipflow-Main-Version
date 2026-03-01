import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Store,
  Truck,
  RefreshCw,
  Package,
  Loader2,
  CheckCircle,
  AlertCircle,
  SkipForward,
  ExternalLink,
  KeyRound,
  Calendar,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { formatPkDate } from "@/lib/dateFormat";

const ONBOARDING_STEPS = [
  { key: "ACCOUNT_CREATED", label: "Account Created", stepIndex: 0 },
  { key: "SHOPIFY_CONNECTED", label: "Connect Shopify", stepIndex: 1, icon: Store },
  { key: "ORDERS_SYNCED", label: "Sync Orders", stepIndex: 2, icon: Package },
  { key: "LEOPARDS_CONNECTED", label: "Connect Leopards", stepIndex: 3, icon: Truck },
  { key: "POSTEX_CONNECTED", label: "Connect PostEx", stepIndex: 4, icon: Truck },
  { key: "COMPLETED", label: "Complete", stepIndex: 5, icon: CheckCircle },
];

function getStepIndex(step: string): number {
  const found = ONBOARDING_STEPS.find(s => s.key === step);
  return found ? found.stepIndex : 0;
}

const visibleSteps = ONBOARDING_STEPS.filter(s => s.stepIndex >= 1 && s.stepIndex <= 5);

export default function Onboarding() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const merchantStep = user?.merchant?.onboardingStep || "ACCOUNT_CREATED";
  const currentStepIndex = getStepIndex(merchantStep);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const [shopifyDomain, setShopifyDomain] = useState("");
  const [shopifyToken, setShopifyToken] = useState("");
  const [shopifyApiKey, setShopifyApiKey] = useState("");
  const [shopifyApiPassword, setShopifyApiPassword] = useState("");
  const [connectMode, setConnectMode] = useState<"oauth" | "token" | "legacy">("oauth");
  const [leopardsApiKey, setLeopardsApiKey] = useState("");
  const [leopardsApiPassword, setLeopardsApiPassword] = useState("");
  const [postexToken, setPostexToken] = useState("");
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [appClientId, setAppClientId] = useState("");
  const [appClientSecret, setAppClientSecret] = useState("");
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [syncFromDate, setSyncFromDate] = useState(() => {
    const d = new Date();
    d.setMonth(0, 1);
    return d.toISOString().split("T")[0];
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shopifyStatus = params.get("shopify");
    if (shopifyStatus === "connected") {
      toast({ title: "Shopify Connected", description: "Your store has been connected and initial sync is running." });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (shopifyStatus === "error") {
      const message = params.get("message") || "Connection failed";
      toast({ title: "Shopify Error", description: decodeURIComponent(message), variant: "destructive" });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const { data: integrations } = useQuery<{
    shopify: { isConnected: boolean; shopDomain: string | null };
    couriers: Array<{ id: string; name: string; isActive: boolean }>;
  }>({
    queryKey: ["/api/integrations"],
  });

  const shopifyConnected = integrations?.shopify?.isConnected;

  const { data: savedCreds } = useQuery<{ clientId: string; clientSecretSet: boolean }>({
    queryKey: ["/api/merchants/shopify-credentials"],
  });

  useEffect(() => {
    if (savedCreds?.clientId) {
      setAppClientId(savedCreds.clientId);
      if (savedCreds.clientSecretSet) {
        setCredentialsSaved(true);
      }
    }
  }, [savedCreds]);

  const saveCredentialsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/merchants/shopify-credentials", {
        clientId: appClientId.trim(),
        clientSecret: appClientSecret.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Credentials Saved", description: "Your Shopify app credentials have been saved securely." });
      setCredentialsSaved(true);
      setAppClientSecret("");
      queryClient.invalidateQueries({ queryKey: ["/api/merchants/shopify-credentials"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const canonicalHost = "lala-logistics.replit.app";
  const isNonCanonicalHost = typeof window !== 'undefined' && window.location.hostname !== canonicalHost && window.location.hostname !== 'localhost';

  const advanceStepMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/onboarding/advance-step");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Step Advanced", description: `Onboarding moved to: ${data.onboardingStep}` });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      if (data.onboardingStep === "COMPLETED") {
        setLocation("/dashboard");
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const autoAdvance = async () => {
    try {
      const res = await apiRequest("POST", "/api/onboarding/advance-step");
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      if (data.onboardingStep === "COMPLETED") {
        setLocation("/dashboard");
      }
    } catch {}
  };

  const connectShopifyMutation = useMutation({
    mutationFn: async () => {
      const fullDomain = shopifyDomain.includes(".myshopify.com")
        ? shopifyDomain : `${shopifyDomain}.myshopify.com`;
      const payload: any = { storeDomain: fullDomain };
      if (connectMode === "token") { payload.accessToken = shopifyToken; }
      else { payload.apiKey = shopifyApiKey; payload.apiPassword = shopifyApiPassword; }
      const response = await apiRequest("POST", "/api/integrations/shopify/manual-connect", payload);
      return response.json();
    },
    onSuccess: async () => {
      toast({ title: "Shopify Connected" });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      await autoAdvance();
    },
    onError: (error: Error) => {
      toast({ title: "Connection Failed", description: error.message, variant: "destructive" });
    },
  });

  const saveCourierMutation = useMutation({
    mutationFn: async (courierData: { courierName: string; apiKey: string; apiSecret?: string }) => {
      await apiRequest("POST", "/api/integrations/couriers", courierData);
    },
    onSuccess: async () => {
      toast({ title: "Courier saved" });
      await autoAdvance();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const importStatusQuery = useQuery<{ job: any }>({
    queryKey: ["/api/shopify/import/status", importJobId],
    queryFn: async () => {
      const url = importJobId
        ? `/api/shopify/import/status?jobId=${importJobId}`
        : `/api/shopify/import/status`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    enabled: currentStepIndex === 2,
    refetchInterval: (query) => {
      const job = query.state.data?.job;
      if (job && (job.status === 'RUNNING' || job.status === 'QUEUED')) return 1500;
      return false;
    },
  });

  const importJob = importStatusQuery.data?.job;

  useEffect(() => {
    if (importJob?.status === 'COMPLETED') {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    }
  }, [importJob?.status]);

  const startImportMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/merchants/sync-from-date", {
        syncFromDate: new Date(syncFromDate).toISOString(),
      });
      const res = await apiRequest("POST", "/api/shopify/import/start");
      return res.json();
    },
    onSuccess: (data) => {
      setImportJobId(data.jobId);
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/import/status"] });
    },
    onError: (error: Error) => {
      toast({ title: "Import Failed", description: error.message, variant: "destructive" });
    },
  });

  const resumeImportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/shopify/import/resume", { jobId: importJob?.id });
      return res.json();
    },
    onSuccess: (data) => {
      setImportJobId(data.jobId);
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/import/status"] });
      toast({ title: "Import Resumed", description: "Continuing from where it left off." });
    },
    onError: (error: Error) => {
      toast({ title: "Resume Failed", description: error.message, variant: "destructive" });
    },
  });

  const cancelImportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/shopify/import/cancel", { jobId: importJob?.id });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/import/status"] });
      toast({ title: "Import Cancelled" });
    },
  });

  if (merchantStep === "COMPLETED") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
          <h2 className="text-2xl font-bold">Setup Complete</h2>
          <p className="text-muted-foreground">Your 1SOL.AI account is fully set up.</p>
          <Button onClick={() => setLocation("/dashboard")} data-testid="button-go-dashboard">Go to Dashboard</Button>
        </div>
      </div>
    );
  }

  const progress = (currentStepIndex / 5) * 100;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {isNonCanonicalHost && currentStepIndex <= 1 && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center justify-between gap-2 flex-wrap" data-testid="banner-canonical-host">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <AlertCircle className="w-4 h-4 inline mr-1.5" />
              For Shopify connect, please use the official app URL.
            </p>
            <Button size="sm" variant="outline" onClick={() => { window.location.href = `https://${canonicalHost}/onboarding`; }} data-testid="button-open-canonical">
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Open Canonical URL
            </Button>
          </div>
        )}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-center mb-2" data-testid="text-onboarding-title">Welcome to 1SOL.AI</h1>
          <p className="text-muted-foreground text-center mb-6">Let's set up your logistics platform</p>

          <div className="flex items-center justify-between mb-4">
            {visibleSteps.map((step, index) => {
              const StepIcon = step.icon || CheckCircle;
              const isComplete = currentStepIndex > step.stepIndex;
              const isCurrent = currentStepIndex === step.stepIndex || (currentStepIndex < step.stepIndex && step.stepIndex === currentStepIndex + 1);
              return (
                <div key={step.key} className="flex items-center flex-1">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors shrink-0 ${
                    isComplete ? "bg-green-500 border-green-500 text-white" :
                    isCurrent ? "border-primary bg-primary text-primary-foreground" :
                    "border-muted-foreground/30 text-muted-foreground"
                  }`}>
                    {isComplete ? <Check className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                  </div>
                  <div className="ml-2 hidden md:block">
                    <p className={`text-xs font-medium ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                      {step.label}
                    </p>
                  </div>
                  {index < visibleSteps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-3 ${isComplete ? "bg-green-500" : "bg-muted"}`} />
                  )}
                </div>
              );
            })}
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <Card>
          {(currentStepIndex <= 1) && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Store className="w-5 h-5" />Connect Your Shopify Store</CardTitle>
                <CardDescription>Enter your Shopify store details to start syncing orders.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {shopifyConnected ? (
                  <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                    <div>
                      <p className="font-medium text-green-800 dark:text-green-200">Shopify Connected</p>
                      <p className="text-sm text-green-600 dark:text-green-400">{integrations?.shopify?.shopDomain}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-muted-foreground" />
                          <Label className="text-sm font-medium">Shopify App Credentials</Label>
                        </div>
                        {credentialsSaved && (
                          <Badge variant="secondary" className="text-xs" data-testid="badge-credentials-saved">
                            <CheckCircle className="w-3 h-3 mr-1" />Saved
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Enter your Shopify app's Client ID and Client Secret. You can find these in your Shopify Partners dashboard under App setup.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Client ID</Label>
                          <Input
                            placeholder="e.g. 9e891f161c95eaf..."
                            value={appClientId}
                            onChange={e => { setAppClientId(e.target.value); setCredentialsSaved(false); }}
                            data-testid="input-app-client-id"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Client Secret</Label>
                          <Input
                            type="password"
                            placeholder={credentialsSaved ? "••••••••••••" : "Enter client secret"}
                            value={appClientSecret}
                            onChange={e => { setAppClientSecret(e.target.value); setCredentialsSaved(false); }}
                            data-testid="input-app-client-secret"
                          />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveCredentialsMutation.mutate()}
                        disabled={saveCredentialsMutation.isPending || !appClientId.trim() || (!appClientSecret.trim() && !credentialsSaved)}
                        data-testid="button-save-credentials"
                      >
                        {saveCredentialsMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                        Save Credentials
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label>Store Domain</Label>
                      <Input placeholder="your-store.myshopify.com" value={shopifyDomain} onChange={e => setShopifyDomain(e.target.value)} data-testid="input-shopify-domain" />
                    </div>

                    <div className="flex gap-2">
                      <Button variant={connectMode === "oauth" ? "default" : "outline"} size="sm" onClick={() => setConnectMode("oauth")} data-testid="button-mode-oauth">
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />OAuth Connect
                      </Button>
                      <Button variant={connectMode === "token" ? "default" : "outline"} size="sm" onClick={() => setConnectMode("token")} data-testid="button-mode-token">
                        <KeyRound className="w-3.5 h-3.5 mr-1.5" />Access Token
                      </Button>
                      <Button variant={connectMode === "legacy" ? "default" : "outline"} size="sm" onClick={() => setConnectMode("legacy")} data-testid="button-mode-legacy">
                        <KeyRound className="w-3.5 h-3.5 mr-1.5" />API Key/Password
                      </Button>
                    </div>

                    {connectMode === "oauth" && (
                      <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Connect securely via Shopify OAuth. You'll be redirected to Shopify to authorize 1SOL.AI, then sent back here automatically.
                        </p>
                        <Button
                          className="w-full"
                          onClick={async () => {
                            if (!shopifyDomain) {
                              toast({ title: "Missing Domain", description: "Please enter your store domain first.", variant: "destructive" });
                              return;
                            }
                            setOauthLoading(true);
                            try {
                              const fullDomain = shopifyDomain.includes(".myshopify.com") ? shopifyDomain : `${shopifyDomain}.myshopify.com`;
                              const res = await apiRequest("GET", `/api/shopify/auth-url?shop=${encodeURIComponent(fullDomain)}`);
                              const data = await res.json();
                              if (data.authUrl) {
                                if (data.canonicalHost && window.location.hostname !== data.canonicalHost) {
                                  window.location.href = `https://${data.canonicalHost}/onboarding`;
                                  return;
                                }
                                window.location.href = data.authUrl;
                              } else {
                                toast({ title: "Error", description: "Failed to generate auth URL", variant: "destructive" });
                              }
                            } catch (err: any) {
                              toast({ title: "Error", description: err.message || "Failed to start OAuth", variant: "destructive" });
                            } finally {
                              setOauthLoading(false);
                            }
                          }}
                          disabled={oauthLoading || !shopifyDomain}
                          data-testid="button-oauth-connect"
                        >
                          {oauthLoading ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Redirecting to Shopify...</>
                          ) : (
                            <><ExternalLink className="w-4 h-4 mr-2" />Connect with Shopify</>
                          )}
                        </Button>
                      </div>
                    )}

                    {connectMode === "token" && (
                      <div className="space-y-2">
                        <Label>Admin API Access Token</Label>
                        <Input type="password" placeholder="shpat_xxxxx..." value={shopifyToken} onChange={e => setShopifyToken(e.target.value)} data-testid="input-shopify-token" />
                      </div>
                    )}

                    {connectMode === "legacy" && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label>API Key</Label>
                          <Input placeholder="Your API Key" value={shopifyApiKey} onChange={e => setShopifyApiKey(e.target.value)} data-testid="input-shopify-api-key" />
                        </div>
                        <div className="space-y-2">
                          <Label>API Password</Label>
                          <Input type="password" placeholder="Your API Password" value={shopifyApiPassword} onChange={e => setShopifyApiPassword(e.target.value)} data-testid="input-shopify-api-password" />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
              <CardFooter className="flex justify-between gap-2">
                <div />
                <div className="flex gap-2">
                  {isSuperAdmin && (
                    <Button variant="ghost" size="sm" onClick={() => advanceStepMutation.mutate()} disabled={advanceStepMutation.isPending} data-testid="button-advance-step">
                      <SkipForward className="w-4 h-4 mr-1" />Skip (Admin)
                    </Button>
                  )}
                  {shopifyConnected ? (
                    <Button onClick={() => advanceStepMutation.mutate()} data-testid="button-next-step">Continue <ChevronRight className="w-4 h-4 ml-2" /></Button>
                  ) : connectMode !== "oauth" ? (
                    <Button onClick={() => connectShopifyMutation.mutate()} disabled={connectShopifyMutation.isPending || !shopifyDomain || (connectMode === "token" ? !shopifyToken : (!shopifyApiKey || !shopifyApiPassword))} data-testid="button-connect-shopify">
                      {connectShopifyMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting...</> : <>Connect Shopify<ChevronRight className="w-4 h-4 ml-2" /></>}
                    </Button>
                  ) : null}
                </div>
              </CardFooter>
            </>
          )}

          {currentStepIndex === 2 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Package className="w-5 h-5" />Sync Orders</CardTitle>
                <CardDescription>Choose a start date and import your Shopify orders. Only orders from that date onward will be synced.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {(!importJob || importJob.status === 'CANCELLED') && (
                  <div className="text-center py-8">
                    <Package className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium mb-2" data-testid="text-ready-import">Ready to Import Orders</h3>
                    <p className="text-muted-foreground mb-4">Select the date from which you want to bring your Shopify data.</p>

                    <div className="max-w-xs mx-auto mb-6">
                      <Label className="text-sm font-medium flex items-center justify-center gap-1.5 mb-2">
                        <Calendar className="w-4 h-4" />
                        Sync orders from
                      </Label>
                      <Input
                        type="date"
                        value={syncFromDate}
                        onChange={(e) => setSyncFromDate(e.target.value)}
                        min="2015-01-01"
                        max={new Date().toISOString().split("T")[0]}
                        className="text-center"
                        data-testid="input-sync-from-date"
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        Orders created on or after {formatPkDate(syncFromDate)} will be imported.
                      </p>
                    </div>

                    <p className="text-xs text-muted-foreground mb-6">The import runs in the background — you can close this tab and come back anytime.</p>
                    <Button size="lg" onClick={() => startImportMutation.mutate()} disabled={startImportMutation.isPending} data-testid="button-start-import">
                      {startImportMutation.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <RefreshCw className="w-5 h-5 mr-2" />}
                      Start Import
                    </Button>
                  </div>
                )}

                {importJob && (importJob.status === 'QUEUED' || importJob.status === 'RUNNING') && (
                  <div className="py-6 space-y-4">
                    <div className="flex items-center justify-center gap-3 mb-2">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      <div>
                        <h3 className="text-lg font-medium" data-testid="text-importing">Importing Orders...</h3>
                        <p className="text-sm text-muted-foreground">
                          {importJob.status === 'QUEUED' ? 'Starting up...' : `Fetching batch ${importJob.currentPage || 1}...`}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-2xl font-bold" data-testid="text-processed-count">{(importJob.processedCount || 0).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Processed</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-2xl font-bold text-green-600" data-testid="text-created-count">{(importJob.createdCount || 0).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">New</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-2xl font-bold text-blue-600" data-testid="text-updated-count">{(importJob.updatedCount || 0).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Updated</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-2xl font-bold text-red-600" data-testid="text-failed-count">{(importJob.failedCount || 0).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Failed</p>
                      </div>
                    </div>

                    <p className="text-xs text-center text-muted-foreground">
                      Importing from {importJob.startDate ? formatPkDate(importJob.startDate) : `01-01-${new Date().getFullYear()}`} &middot; Page {importJob.currentPage || 0}
                    </p>

                    <div className="flex justify-center">
                      <Button variant="ghost" size="sm" onClick={() => cancelImportMutation.mutate()} disabled={cancelImportMutation.isPending} data-testid="button-cancel-import">
                        Cancel Import
                      </Button>
                    </div>
                  </div>
                )}

                {importJob && importJob.status === 'COMPLETED' && (
                  <div className="text-center py-8">
                    <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
                    <h3 className="text-lg font-medium mb-2" data-testid="text-import-complete">Import Complete!</h3>
                    <div className="flex items-center justify-center gap-4 mb-2">
                      <div>
                        <p className="text-2xl font-bold text-green-600" data-testid="text-total-created">{(importJob.createdCount || 0).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">New Orders</p>
                      </div>
                      {(importJob.updatedCount || 0) > 0 && (
                        <div>
                          <p className="text-2xl font-bold text-blue-600">{(importJob.updatedCount || 0).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">Updated</p>
                        </div>
                      )}
                    </div>
                    {(importJob.failedCount || 0) > 0 && (
                      <p className="text-sm text-red-500">{importJob.failedCount} orders had errors (they can be retried later)</p>
                    )}
                  </div>
                )}

                {importJob && importJob.status === 'FAILED' && (
                  <div className="text-center py-6 space-y-4">
                    <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-2" />
                    <h3 className="text-lg font-medium" data-testid="text-import-failed">Import Failed</h3>
                    {importJob.lastError && (
                      <div className="max-w-md mx-auto p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                        <p className="text-sm text-red-700 dark:text-red-300 break-words" data-testid="text-error-message">{importJob.lastError}</p>
                        {importJob.lastErrorStage && (
                          <p className="text-xs text-red-500 mt-1">Stage: {importJob.lastErrorStage}</p>
                        )}
                      </div>
                    )}
                    {(importJob.processedCount || 0) > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Progress so far: {importJob.processedCount?.toLocaleString()} orders processed ({importJob.createdCount?.toLocaleString()} new, {importJob.updatedCount?.toLocaleString()} updated)
                      </p>
                    )}
                    <div className="flex items-center justify-center gap-3">
                      <Button onClick={() => resumeImportMutation.mutate()} disabled={resumeImportMutation.isPending} data-testid="button-resume-import">
                        {resumeImportMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                        Resume Import
                      </Button>
                      <Button variant="outline" onClick={() => startImportMutation.mutate()} disabled={startImportMutation.isPending} data-testid="button-restart-import">
                        Start Over
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between gap-2">
                <div />
                <div className="flex gap-2">
                  {isSuperAdmin && (
                    <Button variant="ghost" size="sm" onClick={() => advanceStepMutation.mutate()} disabled={advanceStepMutation.isPending} data-testid="button-advance-step">
                      <SkipForward className="w-4 h-4 mr-1" />Skip (Admin)
                    </Button>
                  )}
                  {importJob?.status === 'COMPLETED' && (
                    <Button onClick={() => advanceStepMutation.mutate()} data-testid="button-next-step">Continue <ChevronRight className="w-4 h-4 ml-2" /></Button>
                  )}
                </div>
              </CardFooter>
            </>
          )}

          {currentStepIndex === 3 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Truck className="w-5 h-5" />Connect Leopards Courier</CardTitle>
                <CardDescription>Add your Leopards API credentials for shipment booking and tracking.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <Input type="password" placeholder="Leopards API Key" value={leopardsApiKey} onChange={e => setLeopardsApiKey(e.target.value)} data-testid="input-leopards-api-key" />
                  </div>
                  <div className="space-y-2">
                    <Label>API Password</Label>
                    <Input type="password" placeholder="Leopards API Password" value={leopardsApiPassword} onChange={e => setLeopardsApiPassword(e.target.value)} data-testid="input-leopards-api-password" />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between gap-2">
                <div />
                <div className="flex gap-2">
                  {isSuperAdmin && (
                    <Button variant="ghost" size="sm" onClick={() => advanceStepMutation.mutate()} disabled={advanceStepMutation.isPending} data-testid="button-advance-step">
                      <SkipForward className="w-4 h-4 mr-1" />Skip (Admin)
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => advanceStepMutation.mutate()}>Skip for Now</Button>
                  <Button onClick={() => { saveCourierMutation.mutate({ courierName: "leopards", apiKey: leopardsApiKey, apiSecret: leopardsApiPassword }); }} disabled={saveCourierMutation.isPending || !leopardsApiKey || !leopardsApiPassword} data-testid="button-save-leopards">
                    {saveCourierMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Save & Continue
                  </Button>
                </div>
              </CardFooter>
            </>
          )}

          {currentStepIndex === 4 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Truck className="w-5 h-5" />Connect PostEx</CardTitle>
                <CardDescription>Add your PostEx API token for shipment booking and tracking.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>API Token</Label>
                  <Input type="password" placeholder="PostEx API Token" value={postexToken} onChange={e => setPostexToken(e.target.value)} data-testid="input-postex-token" />
                </div>
              </CardContent>
              <CardFooter className="flex justify-between gap-2">
                <div />
                <div className="flex gap-2">
                  {isSuperAdmin && (
                    <Button variant="ghost" size="sm" onClick={() => advanceStepMutation.mutate()} disabled={advanceStepMutation.isPending} data-testid="button-advance-step">
                      <SkipForward className="w-4 h-4 mr-1" />Skip (Admin)
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => advanceStepMutation.mutate()}>Skip for Now</Button>
                  <Button onClick={() => { saveCourierMutation.mutate({ courierName: "postex", apiKey: postexToken }); }} disabled={saveCourierMutation.isPending || !postexToken} data-testid="button-save-postex">
                    {saveCourierMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Save & Complete Setup
                  </Button>
                </div>
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
