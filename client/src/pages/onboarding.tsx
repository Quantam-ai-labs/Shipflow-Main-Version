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
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const steps = [
  { id: 1, title: "Connect Shopify", description: "Link your Shopify store", icon: Store },
  { id: 2, title: "Setup Couriers", description: "Connect courier APIs", icon: Truck },
  { id: 3, title: "Initial Sync", description: "Import all orders", icon: Package },
];

export default function Onboarding() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  
  // Shopify form state
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [shopifyToken, setShopifyToken] = useState("");
  const [shopifyApiKey, setShopifyApiKey] = useState("");
  const [shopifyApiPassword, setShopifyApiPassword] = useState("");
  const [useAccessToken, setUseAccessToken] = useState(true);
  
  // Courier form state
  const [leopardsApiKey, setLeopardsApiKey] = useState("");
  const [leopardsApiPassword, setLeopardsApiPassword] = useState("");
  const [postexToken, setPostexToken] = useState("");
  
  // Sync state
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "complete" | "error">("idle");
  const [syncResult, setSyncResult] = useState<{ synced: number; total: number } | null>(null);

  // Check existing integrations
  const { data: integrations } = useQuery<{
    shopify: { isConnected: boolean; shopDomain: string | null };
    couriers: Array<{ id: string; name: string; isActive: boolean }>;
  }>({
    queryKey: ["/api/integrations"],
  });

  const shopifyConnected = integrations?.shopify?.isConnected;

  // Connect Shopify mutation
  const connectShopifyMutation = useMutation({
    mutationFn: async () => {
      const fullDomain = shopifyDomain.includes(".myshopify.com")
        ? shopifyDomain
        : `${shopifyDomain}.myshopify.com`;
      
      const payload: any = { storeDomain: fullDomain };
      if (useAccessToken) {
        payload.accessToken = shopifyToken;
      } else {
        payload.apiKey = shopifyApiKey;
        payload.apiPassword = shopifyApiPassword;
      }
      
      const response = await apiRequest("POST", "/api/integrations/shopify/manual-connect", payload);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Shopify Connected", description: "Your store has been successfully connected." });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setCurrentStep(2);
    },
    onError: (error: Error) => {
      toast({ title: "Connection Failed", description: error.message, variant: "destructive" });
    },
  });

  // Save courier credentials mutation
  const saveCourierMutation = useMutation({
    mutationFn: async () => {
      const couriers = [];
      if (leopardsApiKey && leopardsApiPassword) {
        couriers.push({
          courierName: "leopards",
          apiKey: leopardsApiKey,
          apiSecret: leopardsApiPassword,
          isActive: true,
        });
      }
      if (postexToken) {
        couriers.push({
          courierName: "postex",
          apiKey: postexToken,
          isActive: true,
        });
      }
      
      for (const courier of couriers) {
        await apiRequest("POST", "/api/integrations/couriers", courier);
      }
      return { saved: couriers.length };
    },
    onSuccess: (data) => {
      toast({ title: "Couriers Configured", description: `${data.saved} courier(s) have been configured.` });
      setCurrentStep(3);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Sync all orders mutation
  const syncOrdersMutation = useMutation({
    mutationFn: async () => {
      setSyncStatus("syncing");
      setSyncProgress(10);
      
      const response = await apiRequest("POST", "/api/integrations/shopify/sync");
      const result = await response.json();
      
      setSyncProgress(100);
      return result;
    },
    onSuccess: (data) => {
      setSyncStatus("complete");
      setSyncResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ 
        title: "Sync Complete", 
        description: `Successfully imported ${data.synced} orders (${data.total} total found).` 
      });
    },
    onError: (error: Error) => {
      setSyncStatus("error");
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleFinish = () => {
    setLocation("/orders");
  };

  const progress = (currentStep / steps.length) * 100;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Progress Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-center mb-2">Welcome to ShipFlow</h1>
          <p className="text-muted-foreground text-center mb-6">Let's set up your logistics platform in a few simple steps</p>
          
          {/* Step Indicators */}
          <div className="flex items-center justify-between mb-4">
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              const isComplete = currentStep > step.id;
              const isCurrent = currentStep === step.id;
              
              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                    isComplete ? "bg-green-500 border-green-500 text-white" :
                    isCurrent ? "border-primary bg-primary text-primary-foreground" :
                    "border-muted-foreground/30 text-muted-foreground"
                  }`}>
                    {isComplete ? <Check className="w-5 h-5" /> : <StepIcon className="w-5 h-5" />}
                  </div>
                  <div className="ml-3 hidden sm:block">
                    <p className={`text-sm font-medium ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                      {step.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-4 ${isComplete ? "bg-green-500" : "bg-muted"}`} />
                  )}
                </div>
              );
            })}
          </div>
          
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step Content */}
        <Card>
          {/* Step 1: Connect Shopify */}
          {currentStep === 1 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="w-5 h-5" />
                  Connect Your Shopify Store
                </CardTitle>
                <CardDescription>
                  Enter your Shopify store details to start syncing orders. We support both Admin API access tokens and legacy API credentials.
                </CardDescription>
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
                      <Label htmlFor="shopify-domain">Store Domain</Label>
                      <Input
                        id="shopify-domain"
                        placeholder="your-store.myshopify.com"
                        value={shopifyDomain}
                        onChange={(e) => setShopifyDomain(e.target.value)}
                        data-testid="input-shopify-domain"
                      />
                    </div>
                    
                    <div className="flex gap-2 mb-4">
                      <Button
                        variant={useAccessToken ? "default" : "outline"}
                        size="sm"
                        onClick={() => setUseAccessToken(true)}
                      >
                        Access Token
                      </Button>
                      <Button
                        variant={!useAccessToken ? "default" : "outline"}
                        size="sm"
                        onClick={() => setUseAccessToken(false)}
                      >
                        API Key/Password
                      </Button>
                    </div>
                    
                    {useAccessToken ? (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="access-token">Admin API Access Token</Label>
                          <Input
                            id="access-token"
                            type="password"
                            placeholder="shpat_xxxxx..."
                            value={shopifyToken}
                            onChange={(e) => setShopifyToken(e.target.value)}
                            data-testid="input-shopify-token"
                          />
                        </div>
                        <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                          <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                            Required Admin API Scopes:
                          </p>
                          <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
                            <li><strong>read_orders</strong> - Access to order data</li>
                            <li><strong>read_customers</strong> - Access to customer names, addresses, phones</li>
                            <li><strong>read_products</strong> - Access to product data</li>
                            <li><strong>read_fulfillments</strong> - Access to fulfillment status</li>
                          </ul>
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                            Go to Shopify Admin → Apps → Develop Apps → Create App → Configure Admin API scopes
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="api-key">API Key</Label>
                          <Input
                            id="api-key"
                            placeholder="Your API Key"
                            value={shopifyApiKey}
                            onChange={(e) => setShopifyApiKey(e.target.value)}
                            data-testid="input-shopify-api-key"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="api-password">API Password</Label>
                          <Input
                            id="api-password"
                            type="password"
                            placeholder="Your API Password"
                            value={shopifyApiPassword}
                            onChange={(e) => setShopifyApiPassword(e.target.value)}
                            data-testid="input-shopify-api-password"
                          />
                        </div>
                      </>
                    )}
                  </>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <div />
                {shopifyConnected ? (
                  <Button onClick={() => setCurrentStep(2)} data-testid="button-next-step">
                    Continue
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => connectShopifyMutation.mutate()}
                    disabled={connectShopifyMutation.isPending || !shopifyDomain || (!shopifyToken && (!shopifyApiKey || !shopifyApiPassword))}
                    data-testid="button-connect-shopify"
                  >
                    {connectShopifyMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        Connect Shopify
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                )}
              </CardFooter>
            </>
          )}

          {/* Step 2: Setup Couriers */}
          {currentStep === 2 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  Configure Courier APIs
                </CardTitle>
                <CardDescription>
                  Connect your courier accounts to enable real-time shipment tracking. You can skip this step and add couriers later.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Leopards Courier */}
                <div className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Leopards Courier</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>API Key</Label>
                      <Input
                        type="password"
                        placeholder="Your Leopards API Key"
                        value={leopardsApiKey}
                        onChange={(e) => setLeopardsApiKey(e.target.value)}
                        data-testid="input-leopards-api-key"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>API Password</Label>
                      <Input
                        type="password"
                        placeholder="Your Leopards API Password"
                        value={leopardsApiPassword}
                        onChange={(e) => setLeopardsApiPassword(e.target.value)}
                        data-testid="input-leopards-api-password"
                      />
                    </div>
                  </div>
                </div>

                {/* PostEx */}
                <div className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">PostEx</Badge>
                  </div>
                  <div className="space-y-2">
                    <Label>API Token</Label>
                    <Input
                      type="password"
                      placeholder="Your PostEx API Token"
                      value={postexToken}
                      onChange={(e) => setPostexToken(e.target.value)}
                      data-testid="input-postex-token"
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setCurrentStep(3)}>
                    Skip for Now
                  </Button>
                  <Button
                    onClick={() => saveCourierMutation.mutate()}
                    disabled={saveCourierMutation.isPending || (!leopardsApiKey && !postexToken)}
                    data-testid="button-save-couriers"
                  >
                    {saveCourierMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        Save & Continue
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </CardFooter>
            </>
          )}

          {/* Step 3: Initial Sync */}
          {currentStep === 3 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Import Your Orders
                </CardTitle>
                <CardDescription>
                  We'll now fetch all your historical orders from Shopify. This may take a few minutes depending on how many orders you have.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {syncStatus === "idle" && (
                  <div className="text-center py-8">
                    <Package className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Ready to Import Orders</h3>
                    <p className="text-muted-foreground mb-6">
                      Click the button below to start importing all your orders from Shopify.
                      We'll fetch complete order details including customer data, shipping info, and tags.
                    </p>
                    <Button
                      size="lg"
                      onClick={() => syncOrdersMutation.mutate()}
                      disabled={syncOrdersMutation.isPending}
                      data-testid="button-start-sync"
                    >
                      <RefreshCw className="w-5 h-5 mr-2" />
                      Start Import
                    </Button>
                  </div>
                )}

                {syncStatus === "syncing" && (
                  <div className="text-center py-8">
                    <Loader2 className="w-16 h-16 mx-auto text-primary animate-spin mb-4" />
                    <h3 className="text-lg font-medium mb-2">Importing Orders...</h3>
                    <p className="text-muted-foreground mb-4">
                      Please wait while we fetch all your orders from Shopify.
                      This may take a few minutes for large stores.
                    </p>
                    <Progress value={syncProgress} className="max-w-xs mx-auto" />
                  </div>
                )}

                {syncStatus === "complete" && syncResult && (
                  <div className="text-center py-8">
                    <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Import Complete!</h3>
                    <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg inline-block">
                      <p className="text-2xl font-bold text-green-600">{syncResult.synced.toLocaleString()}</p>
                      <p className="text-sm text-green-600">new orders imported</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {syncResult.total.toLocaleString()} total orders found in Shopify
                      </p>
                    </div>
                  </div>
                )}

                {syncStatus === "error" && (
                  <div className="text-center py-8">
                    <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Import Failed</h3>
                    <p className="text-muted-foreground mb-4">
                      Something went wrong while importing your orders. Please try again.
                    </p>
                    <Button onClick={() => syncOrdersMutation.mutate()}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Retry Import
                    </Button>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(2)}>
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                {syncStatus === "complete" && (
                  <Button onClick={handleFinish} data-testid="button-finish-onboarding">
                    Go to Orders
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
