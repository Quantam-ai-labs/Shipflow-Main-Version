import { useState } from "react";
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
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

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
  const [useAccessToken, setUseAccessToken] = useState(true);
  const [leopardsApiKey, setLeopardsApiKey] = useState("");
  const [leopardsApiPassword, setLeopardsApiPassword] = useState("");
  const [postexToken, setPostexToken] = useState("");
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "complete" | "error">("idle");
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncResult, setSyncResult] = useState<{ synced: number; total: number } | null>(null);

  const { data: integrations } = useQuery<{
    shopify: { isConnected: boolean; shopDomain: string | null };
    couriers: Array<{ id: string; name: string; isActive: boolean }>;
  }>({
    queryKey: ["/api/integrations"],
  });

  const shopifyConnected = integrations?.shopify?.isConnected;

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
      if (useAccessToken) { payload.accessToken = shopifyToken; }
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

  const syncOrdersMutation = useMutation({
    mutationFn: async () => {
      setSyncStatus("syncing");
      setSyncProgress(10);
      const response = await apiRequest("POST", "/api/integrations/shopify/sync");
      const result = await response.json();
      setSyncProgress(100);
      return result;
    },
    onSuccess: async (data) => {
      setSyncStatus("complete");
      setSyncResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Sync Complete", description: `Imported ${data.synced} orders.` });
      await autoAdvance();
    },
    onError: (error: Error) => {
      setSyncStatus("error");
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  if (merchantStep === "COMPLETED") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
          <h2 className="text-2xl font-bold">Setup Complete</h2>
          <p className="text-muted-foreground">Your ShipFlow account is fully set up.</p>
          <Button onClick={() => setLocation("/dashboard")} data-testid="button-go-dashboard">Go to Dashboard</Button>
        </div>
      </div>
    );
  }

  const progress = (currentStepIndex / 5) * 100;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-center mb-2" data-testid="text-onboarding-title">Welcome to ShipFlow</h1>
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
                      <p className="font-medium text-green-800 dark:text-green-200">Shopify Already Connected</p>
                      <p className="text-sm text-green-600 dark:text-green-400">{integrations?.shopify?.shopDomain}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Store Domain</Label>
                      <Input placeholder="your-store.myshopify.com" value={shopifyDomain} onChange={e => setShopifyDomain(e.target.value)} data-testid="input-shopify-domain" />
                    </div>
                    <div className="flex gap-2 mb-4">
                      <Button variant={useAccessToken ? "default" : "outline"} size="sm" onClick={() => setUseAccessToken(true)}>Access Token</Button>
                      <Button variant={!useAccessToken ? "default" : "outline"} size="sm" onClick={() => setUseAccessToken(false)}>API Key/Password</Button>
                    </div>
                    {useAccessToken ? (
                      <div className="space-y-2">
                        <Label>Admin API Access Token</Label>
                        <Input type="password" placeholder="shpat_xxxxx..." value={shopifyToken} onChange={e => setShopifyToken(e.target.value)} data-testid="input-shopify-token" />
                      </div>
                    ) : (
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
                  ) : (
                    <Button onClick={() => connectShopifyMutation.mutate()} disabled={connectShopifyMutation.isPending || !shopifyDomain || (!shopifyToken && (!shopifyApiKey || !shopifyApiPassword))} data-testid="button-connect-shopify">
                      {connectShopifyMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting...</> : <>Connect Shopify<ChevronRight className="w-4 h-4 ml-2" /></>}
                    </Button>
                  )}
                </div>
              </CardFooter>
            </>
          )}

          {currentStepIndex === 2 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Package className="w-5 h-5" />Sync Orders</CardTitle>
                <CardDescription>Import your orders from Shopify.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {syncStatus === "idle" && (
                  <div className="text-center py-8">
                    <Package className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Ready to Import Orders</h3>
                    <p className="text-muted-foreground mb-6">Click below to import all your orders from Shopify.</p>
                    <Button size="lg" onClick={() => syncOrdersMutation.mutate()} disabled={syncOrdersMutation.isPending} data-testid="button-start-sync">
                      <RefreshCw className="w-5 h-5 mr-2" />Start Import
                    </Button>
                  </div>
                )}
                {syncStatus === "syncing" && (
                  <div className="text-center py-8">
                    <Loader2 className="w-16 h-16 mx-auto text-primary animate-spin mb-4" />
                    <h3 className="text-lg font-medium mb-2">Importing Orders...</h3>
                    <Progress value={syncProgress} className="max-w-xs mx-auto" />
                  </div>
                )}
                {syncStatus === "complete" && syncResult && (
                  <div className="text-center py-8">
                    <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Import Complete!</h3>
                    <p className="text-2xl font-bold text-green-600">{syncResult.synced.toLocaleString()} orders</p>
                  </div>
                )}
                {syncStatus === "error" && (
                  <div className="text-center py-8">
                    <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Import Failed</h3>
                    <Button onClick={() => syncOrdersMutation.mutate()}><RefreshCw className="w-4 h-4 mr-2" />Retry</Button>
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
                  {syncStatus === "complete" && (
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
