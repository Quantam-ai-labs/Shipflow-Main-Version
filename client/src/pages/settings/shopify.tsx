import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Store,
  CheckCircle2,
  XCircle,
  Settings,
  RefreshCw,
  Activity,
  Database,
  Phone,
  MapPin,
  User,
  Zap,
  Key,
  Loader2,
  AlertTriangle,
  Calendar,
  Check,
  Tags,
  Save,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { SiShopify } from "react-icons/si";
import { useLocation, useSearch } from "wouter";
import { formatPkDate, formatPkDateTime } from "@/lib/dateFormat";

interface IntegrationsData {
  shopify: {
    isConnected: boolean;
    shopDomain: string | null;
    lastSyncAt: string | null;
  };
  couriers: Array<{
    id: string;
    name: string;
    isActive: boolean;
    accountNumber: string | null;
    hasDbCredentials: boolean;
    useEnvCredentials: boolean;
    settings?: Record<string, any>;
  }>;
  envCredentials: Record<string, { hasKey: boolean; hasSecret: boolean }>;
}

interface DataHealthData {
  dataHealth: {
    totalOrders: number;
    missingPhone: number;
    missingAddress: number;
    missingCity: number;
    missingName: number;
  };
  lastApiSyncAt: string | null;
  shopDomain: string | null;
  isConnected: boolean;
}

interface ShopifySyncProgress {
  status: 'idle' | 'running' | 'done' | 'error';
  processed: number;
  total: number;
  created: number;
  updated: number;
  error?: string;
}

export default function ShopifySettings() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [isShopifyDialogOpen, setIsShopifyDialogOpen] = useState(false);
  const [shopifyStoreDomain, setShopifyStoreDomain] = useState("");
  const [shopifyAccessToken, setShopifyAccessToken] = useState("");
  const [shopifyApiKey, setShopifyApiKey] = useState("");
  const [shopifyApiPassword, setShopifyApiPassword] = useState("");
  const [editingSyncDate, setEditingSyncDate] = useState(false);
  const [syncFromDateInput, setSyncFromDateInput] = useState("");
  const [useLegacyAuth, setUseLegacyAuth] = useState(false);
  const [useManualAuth, setUseManualAuth] = useState(false);
  const [isOAuthRedirecting, setIsOAuthRedirecting] = useState(false);
  const [shopifySyncProgress, setShopifySyncProgress] = useState<ShopifySyncProgress>({
    status: 'idle',
    processed: 0,
    total: 0,
    created: 0,
    updated: 0,
  });
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const shopifyStatus = params.get('shopify');
    
    if (shopifyStatus === 'connected') {
      toast({
        title: "Shopify Connected!",
        description: "Your Shopify store has been connected successfully. You can now sync orders.",
      });
      setLocation('/settings/shopify', { replace: true });
    } else if (shopifyStatus === 'error') {
      const message = params.get('message') || 'An error occurred while connecting to Shopify';
      toast({
        title: "Connection Failed",
        description: message,
        variant: "destructive",
      });
      setLocation('/settings/shopify', { replace: true });
    }
  }, [searchString, toast, setLocation]);

  const { data, isLoading } = useQuery<IntegrationsData>({
    queryKey: ["/api/integrations"],
  });

  const { data: dataHealth, isLoading: isDataHealthLoading } = useQuery<DataHealthData>({
    queryKey: ["/api/data-health"],
  });

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/shopify/reconcile", {});
    },
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/data-health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Reconciliation Complete",
        description: result.message || `${result.synced} new, ${result.updated} updated`,
      });
    },
    onError: () => {
      toast({
        title: "Reconciliation Failed",
        description: "Could not reconcile orders. Please try again.",
        variant: "destructive",
      });
    },
  });

  const manualConnectMutation = useMutation({
    mutationFn: async (data: { storeDomain: string; accessToken?: string; apiKey?: string; apiPassword?: string }) => {
      return apiRequest("POST", "/api/integrations/shopify/manual-connect", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setIsShopifyDialogOpen(false);
      setShopifyStoreDomain("");
      setShopifyAccessToken("");
      setShopifyApiKey("");
      setShopifyApiPassword("");
      toast({
        title: "Shopify Connected!",
        description: "Your Shopify store has been connected successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect Shopify store.",
        variant: "destructive",
      });
    },
  });

  const handleConnectShopify = async () => {
    if (!shopifyStoreDomain) return;
    
    const storeNameRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;
    const storeName = shopifyStoreDomain.replace('.myshopify.com', '').trim();
    
    if (!storeNameRegex.test(storeName)) {
      toast({
        title: "Invalid Store Name",
        description: "Store name can only contain letters, numbers, and hyphens.",
        variant: "destructive",
      });
      return;
    }
    
    const shop = `${storeName}.myshopify.com`;
    
    if (useManualAuth) {
      if (useLegacyAuth) {
        if (!shopifyApiKey || !shopifyApiPassword) {
          toast({
            title: "Credentials Required",
            description: "Please enter both API key and API password.",
            variant: "destructive",
          });
          return;
        }
        manualConnectMutation.mutate({ storeDomain: shop, apiKey: shopifyApiKey, apiPassword: shopifyApiPassword });
      } else {
        if (!shopifyAccessToken) {
          toast({
            title: "Access Token Required",
            description: "Please enter your Shopify Admin API Access Token.",
            variant: "destructive",
          });
          return;
        }
        manualConnectMutation.mutate({ storeDomain: shop, accessToken: shopifyAccessToken });
      }
    } else {
      setIsOAuthRedirecting(true);
      try {
        const res = await fetch(`/api/shopify/auth-url?shop=${encodeURIComponent(shop)}`, { credentials: 'include' });
        const result = await res.json();
        if (!res.ok) {
          throw new Error(result.message || "Failed to start Shopify authorization");
        }
        window.location.href = result.authUrl;
      } catch (error: any) {
        setIsOAuthRedirecting(false);
        toast({
          title: "Connection Failed",
          description: error.message || "Failed to connect to Shopify. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  const disconnectShopifyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/integrations/shopify/disconnect", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({
        title: "Disconnected",
        description: "Your Shopify store has been disconnected.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to disconnect Shopify. Please try again.",
        variant: "destructive",
      });
    },
  });

  const { data: webhookHealth, isLoading: isWebhookHealthLoading, refetch: refetchWebhookHealth } = useQuery<{
    status: 'healthy' | 'partial' | 'missing' | 'error';
    registered: string[];
    missing: string[];
    callbackUrl: string;
  }>({
    queryKey: ["/api/shopify/webhooks/health"],
    enabled: !!data?.shopify?.isConnected,
    refetchInterval: 60000,
  });

  const { data: scopeData } = useQuery<{
    connected: boolean;
    grantedScopes: string[];
    requiredScopes: string[];
    missingScopes: string[];
    hasScopeMismatch: boolean;
    writeBackEnabled: boolean;
  }>({
    queryKey: ["/api/shopify/scopes"],
    enabled: !!data?.shopify?.isConnected,
  });

  const { data: webhookActivity } = useQuery<{
    lastEvent: { topic: string; status: string; receivedAt: string; error: string | null } | null;
    last24h: { total: number; processed: number; failed: number; byTopic: Record<string, number> };
  }>({
    queryKey: ["/api/shopify/webhook-activity"],
    enabled: !!data?.shopify?.isConnected,
    refetchInterval: 30000,
  });

  const formatWebhookTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const webhookTopicLabel = (topic: string) => {
    if (topic === "orders/create") return "New Order";
    if (topic === "orders/updated") return "Order Updated";
    if (topic === "fulfillments/create") return "Fulfillment";
    if (topic === "orders/cancelled") return "Cancelled";
    return topic;
  };

  const registerWebhooksMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/shopify/webhooks/register", {});
    },
    onSuccess: async (res) => {
      const result = await res.json();
      refetchWebhookHealth();
      toast({
        title: result.success ? "Webhooks Registered" : "Partial Registration",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    },
    onError: () => {
      toast({
        title: "Registration Failed",
        description: "Could not register webhooks. Please try again.",
        variant: "destructive",
      });
    },
  });

  const { data: syncFromDateData } = useQuery<{ shopifySyncFromDate: string | null }>({
    queryKey: ["/api/merchants/sync-from-date"],
  });

  const saveSyncFromDateMutation = useMutation({
    mutationFn: async (dateStr: string) => {
      const res = await apiRequest("PATCH", "/api/merchants/sync-from-date", {
        syncFromDate: new Date(dateStr).toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants/sync-from-date"] });
      setEditingSyncDate(false);
      toast({ title: "Sync date updated", description: "To fetch older orders, run a full re-import from the Orders page or trigger a manual sync." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const pollShopifySyncProgress = async () => {
    try {
      const res = await fetch("/api/integrations/shopify/sync-progress", {
        credentials: "include",
      });
      if (!res.ok) return;
      const progress = await res.json();
      setShopifySyncProgress(progress);
      
      if (progress.status === 'done' || progress.status === 'error') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (progress.status === 'done') {
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
          toast({
            title: "Sync Complete",
            description: `${progress.created} new, ${progress.updated} updated orders.`,
          });
          setTimeout(() => {
            setShopifySyncProgress({
              status: 'idle',
              processed: 0,
              total: 0,
              created: 0,
              updated: 0,
            });
          }, 2000);
        } else if (progress.status === 'error') {
          toast({
            title: "Sync Failed",
            description: progress.error || "An error occurred during sync.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("Error polling sync progress:", error);
    }
  };

  const syncShopifyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/integrations/shopify/sync", {});
    },
    onSuccess: async (res) => {
      const result = await res.json();
      if (result.started) {
        setShopifySyncProgress({
          status: 'running',
          processed: 0,
          total: 0,
          created: 0,
          updated: 0,
        });
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        pollIntervalRef.current = setInterval(pollShopifySyncProgress, 1500);
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to sync orders. Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const retryFulfillmentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/orders/retry-fulfillment-writeback", {});
    },
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Fulfillment Retry Complete",
        description: `${data.succeeded} succeeded, ${data.failed} failed out of ${data.retried} orders.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to retry fulfillment write-backs.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-shopify-settings-title">Shopify Integration</h1>
        <p className="text-muted-foreground">Manage your Shopify store connection, sync settings, and data quality.</p>
      </div>

      <Card className="bg-[#0d1322] border-white/[0.08]">
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#96BF48]/10 flex items-center justify-center">
                <SiShopify className="w-6 h-6 text-[#96BF48]" />
              </div>
              <div>
                <CardTitle className="text-lg">Shopify</CardTitle>
                <CardDescription>
                  Connect your Shopify store to automatically sync orders.
                </CardDescription>
              </div>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : data?.shopify.isConnected ? (
              <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <XCircle className="w-3 h-3 mr-1" />
                Not Connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-10 w-32" />
            </div>
          ) : data?.shopify.isConnected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-6 flex-wrap text-sm">
                <div>
                  <span className="text-muted-foreground">Store:</span>{" "}
                  <span className="font-medium">{data.shopify.shopDomain}</span>
                </div>
                {data.shopify.lastSyncAt && (
                  <div>
                    <span className="text-muted-foreground">Last sync:</span>{" "}
                    <span className="font-medium">
                      {formatPkDateTime(data.shopify.lastSyncAt)}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap text-sm p-3 rounded-md border" data-testid="sync-from-date-section">
                <Calendar className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">Sync data from:</span>
                {editingSyncDate ? (
                  <>
                    <Input
                      type="date"
                      value={syncFromDateInput}
                      onChange={(e) => setSyncFromDateInput(e.target.value)}
                      min="2015-01-01"
                      max={new Date().toISOString().split("T")[0]}
                      className="w-auto h-8 text-sm"
                      data-testid="input-edit-sync-from-date"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => saveSyncFromDateMutation.mutate(syncFromDateInput)}
                      disabled={saveSyncFromDateMutation.isPending || !syncFromDateInput}
                      data-testid="button-save-sync-date"
                    >
                      {saveSyncFromDateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => setEditingSyncDate(false)}
                      data-testid="button-cancel-sync-date"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="font-medium" data-testid="text-sync-from-date">
                      {syncFromDateData?.shopifySyncFromDate
                        ? formatPkDate(syncFromDateData.shopifySyncFromDate)
                        : `01-01-${new Date().getFullYear()} (default)`}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        const currentDate = syncFromDateData?.shopifySyncFromDate
                          ? new Date(syncFromDateData.shopifySyncFromDate).toISOString().split("T")[0]
                          : `${new Date().getFullYear()}-01-01`;
                        setSyncFromDateInput(currentDate);
                        setEditingSyncDate(true);
                      }}
                      data-testid="button-edit-sync-date"
                    >
                      Change
                    </Button>
                  </>
                )}
              </div>
              {data?.shopify.isConnected && (
                <div className="flex items-center gap-2 flex-wrap text-sm p-3 rounded-md border" data-testid="webhook-health-status">
                  <Zap className="w-4 h-4 shrink-0" />
                  <span className="text-muted-foreground">Webhooks:</span>
                  {isWebhookHealthLoading ? (
                    <Skeleton className="h-5 w-20" />
                  ) : webhookHealth?.status === 'healthy' ? (
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      All Active ({webhookHealth.registered.length})
                    </Badge>
                  ) : webhookHealth?.status === 'partial' ? (
                    <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                      <Activity className="w-3 h-3 mr-1" />
                      {webhookHealth.missing.length} Missing
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <XCircle className="w-3 h-3 mr-1" />
                      Not Registered
                    </Badge>
                  )}
                  {webhookHealth && webhookHealth.status !== 'healthy' && (
                    <Button
                      size="sm"
                      onClick={() => registerWebhooksMutation.mutate()}
                      disabled={registerWebhooksMutation.isPending}
                      data-testid="button-register-webhooks"
                    >
                      {registerWebhooksMutation.isPending ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Zap className="w-3 h-3 mr-1" />
                      )}
                      Re-register
                    </Button>
                  )}
                  {webhookHealth?.status === 'healthy' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refetchWebhookHealth()}
                      data-testid="button-refresh-webhook-health"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              )}
              {data?.shopify.isConnected && (
                <div className="rounded-md border p-3 space-y-2" data-testid="shopify-webhook-activity">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <Activity className="w-3.5 h-3.5" />
                      Webhook Activity
                    </div>
                    <span className="text-xs text-muted-foreground">Last 24h</span>
                  </div>
                  {!webhookActivity ? (
                    <div className="space-y-1.5">
                      <Skeleton className="h-3.5 w-full" />
                      <Skeleton className="h-3.5 w-2/3" />
                    </div>
                  ) : webhookActivity.lastEvent ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap" data-testid="webhook-last-event">
                        {Date.now() - new Date(webhookActivity.lastEvent.receivedAt).getTime() < 5 * 60 * 1000 && (
                          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                        )}
                        <Badge variant="outline" className="text-xs font-normal">
                          {webhookTopicLabel(webhookActivity.lastEvent.topic)}
                        </Badge>
                        {webhookActivity.lastEvent.status === "processed" ? (
                          <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20">processed</Badge>
                        ) : webhookActivity.lastEvent.status === "failed" ? (
                          <Badge className="text-xs bg-red-500/10 text-red-600 border-red-500/20">failed</Badge>
                        ) : (
                          <Badge className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/20">{webhookActivity.lastEvent.status}</Badge>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatWebhookTimeAgo(webhookActivity.lastEvent.receivedAt)}
                        </span>
                      </div>
                      {webhookActivity.lastEvent.error && (
                        <p className="text-xs text-red-500 truncate" data-testid="webhook-error-message">{webhookActivity.lastEvent.error}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-0.5 border-t flex-wrap" data-testid="webhook-24h-stats">
                        <span><span className="font-medium text-foreground">{webhookActivity.last24h.total}</span> received</span>
                        <span className="text-green-600"><span className="font-medium">{webhookActivity.last24h.processed}</span> processed</span>
                        {webhookActivity.last24h.failed > 0 && (
                          <span className="text-red-500"><span className="font-medium">{webhookActivity.last24h.failed}</span> failed</span>
                        )}
                        {Object.entries(webhookActivity.last24h.byTopic).map(([topic, n]) => (
                          <span key={topic} className="text-muted-foreground/70">{webhookTopicLabel(topic)}: {n}</span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground" data-testid="webhook-no-events">No webhook events received yet</p>
                  )}
                </div>
              )}
              {scopeData?.hasScopeMismatch && (
                <div className="flex items-start gap-2 text-sm p-3 rounded-md border border-yellow-500/30 bg-yellow-500/5" data-testid="scope-warning">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-400">
                      Missing Shopify permissions
                    </p>
                    <p className="text-muted-foreground mt-1">
                      Your Shopify app is missing these scopes: <strong>{scopeData.missingScopes.join(', ')}</strong>. 
                      Features like order tag sync, fulfillment write-back, and address updates may not work. 
                      Click <strong>"Re-authorize Permissions"</strong> below to grant the missing permissions. This will redirect you to Shopify to approve the updated scopes.
                    </p>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => syncShopifyMutation.mutate()}
                    disabled={syncShopifyMutation.isPending || shopifySyncProgress.status === 'running'}
                    data-testid="button-sync-shopify"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${syncShopifyMutation.isPending || shopifySyncProgress.status === 'running' ? "animate-spin" : ""}`} />
                    Sync Orders
                  </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShopifyStoreDomain(data?.shopify.shopDomain || "");
                    setIsShopifyDialogOpen(true);
                  }}
                  data-testid="button-update-shopify-token"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Update Token
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const shopDomain = data?.shopify.shopDomain;
                    if (!shopDomain) {
                      toast({ title: "Error", description: "No Shopify store domain found.", variant: "destructive" });
                      return;
                    }
                    try {
                      const res = await fetch(`/api/shopify/auth-url?shop=${encodeURIComponent(shopDomain)}`, { credentials: 'include' });
                      const result = await res.json();
                      if (!res.ok) throw new Error(result.message || "Failed to start re-authorization");
                      window.location.href = result.authUrl;
                    } catch (error: any) {
                      toast({ title: "Re-authorization Failed", description: error.message, variant: "destructive" });
                    }
                  }}
                  data-testid="button-reauthorize-shopify"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Re-authorize Permissions
                </Button>
                <Button
                  variant="outline"
                  onClick={() => retryFulfillmentMutation.mutate()}
                  disabled={retryFulfillmentMutation.isPending}
                  data-testid="button-retry-fulfillment"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${retryFulfillmentMutation.isPending ? "animate-spin" : ""}`} />
                  Retry Fulfillments
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/shopify/test-token", { credentials: "include" });
                      const data = await res.json();
                      const actualScopes = Array.isArray(data.actualScopes) ? data.actualScopes.join(", ") : JSON.stringify(data.actualScopes);
                      toast({
                        title: "Token Test Results",
                        description: `Read Orders: ${data.readOrders?.ok ? "OK" : data.readOrders?.status || "FAIL"} | Actual Scopes: ${actualScopes}`,
                      });
                      console.log("Token test results:", data);
                    } catch (e: any) {
                      toast({ title: "Test Failed", description: e.message, variant: "destructive" });
                    }
                  }}
                  data-testid="button-test-shopify-token"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Test Token
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => disconnectShopifyMutation.mutate()}
                  disabled={disconnectShopifyMutation.isPending}
                  className="text-destructive hover:text-destructive"
                  data-testid="button-disconnect-shopify"
                >
                  Disconnect
                </Button>
                </div>
                {shopifySyncProgress.status === 'running' && shopifySyncProgress.total > 0 && (
                  <div className="space-y-2" data-testid="shopify-sync-progress">
                    <Progress 
                      value={(shopifySyncProgress.processed / shopifySyncProgress.total) * 100} 
                      className="h-2"
                      data-testid="progress-shopify-sync"
                    />
                    <p className="text-sm text-muted-foreground" data-testid="text-sync-progress">
                      Syncing {shopifySyncProgress.processed} of {shopifySyncProgress.total} orders...
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect your Shopify store to automatically import orders and sync them in real-time.
              </p>
              <Button
                onClick={() => {
                  const existingDomain = data?.shopify.shopDomain;
                  if (existingDomain) {
                    setShopifyStoreDomain(existingDomain.replace('.myshopify.com', ''));
                  }
                  setUseManualAuth(false);
                  setIsShopifyDialogOpen(true);
                }}
                data-testid="button-connect-shopify"
              >
                <Store className="w-4 h-4 mr-2" />
                Connect Shopify Store
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {data?.shopify?.isConnected && <OrderTagsConfig />}

      <div>
        <h2 className="text-lg font-semibold mb-4">Sync Health & Data Quality</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="bg-[#0d1322] border-white/[0.08]">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Data Quality</CardTitle>
                <CardDescription>Customer data completeness across all orders</CardDescription>
              </div>
              <Database className="w-5 h-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isDataHealthLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : dataHealth ? (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground mb-2">
                    {dataHealth.dataHealth.totalOrders.toLocaleString()} total orders
                  </div>
                  <DataQualityRow
                    icon={<User className="w-4 h-4" />}
                    label="Name"
                    missing={dataHealth.dataHealth.missingName}
                    total={dataHealth.dataHealth.totalOrders}
                  />
                  <DataQualityRow
                    icon={<Phone className="w-4 h-4" />}
                    label="Phone"
                    missing={dataHealth.dataHealth.missingPhone}
                    total={dataHealth.dataHealth.totalOrders}
                  />
                  <DataQualityRow
                    icon={<MapPin className="w-4 h-4" />}
                    label="Address"
                    missing={dataHealth.dataHealth.missingAddress}
                    total={dataHealth.dataHealth.totalOrders}
                  />
                  <DataQualityRow
                    icon={<MapPin className="w-4 h-4" />}
                    label="City"
                    missing={dataHealth.dataHealth.missingCity}
                    total={dataHealth.dataHealth.totalOrders}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data available</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#0d1322] border-white/[0.08]">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Sync Status</CardTitle>
                <CardDescription>API sync activity with Shopify</CardDescription>
              </div>
              <RefreshCw className="w-5 h-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isDataHealthLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : dataHealth ? (
                <div className="space-y-3">
                  <div className="text-center p-3 rounded-md bg-muted/50">
                    <div className="text-lg font-semibold" data-testid="text-total-orders">
                      {dataHealth.dataHealth.totalOrders.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Orders Synced</div>
                  </div>
                  {dataHealth.lastApiSyncAt && (
                    <p className="text-xs text-muted-foreground">
                      Last sync: {new Date(dataHealth.lastApiSyncAt).toLocaleString()}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No sync data</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4 bg-[#0d1322] border-white/[0.08]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">Manual Reconciliation</p>
                  <p className="text-xs text-muted-foreground">
                    Fetch recent order updates from Shopify API to fill in any data gaps.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => reconcileMutation.mutate()}
                disabled={reconcileMutation.isPending || !data?.shopify.isConnected}
                data-testid="button-reconcile"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${reconcileMutation.isPending ? 'animate-spin' : ''}`} />
                {reconcileMutation.isPending ? "Reconciling..." : "Run Reconciliation"}
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>

      <Dialog open={isShopifyDialogOpen} onOpenChange={(open) => {
        setIsShopifyDialogOpen(open);
        if (!open) {
          setUseManualAuth(false);
          setUseLegacyAuth(false);
          setIsOAuthRedirecting(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Shopify Store</DialogTitle>
            <DialogDescription>
              Enter your store name and authorize 1SOL.AI to access your Shopify data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="storeDomain">Store Domain</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="storeDomain"
                  placeholder="your-store"
                  value={shopifyStoreDomain}
                  onChange={(e) => setShopifyStoreDomain(e.target.value)}
                  data-testid="input-shopify-domain"
                />
                <span className="text-muted-foreground text-sm whitespace-nowrap">.myshopify.com</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter your store name without the .myshopify.com part
              </p>
            </div>

            {!useManualAuth && (
              <div className="p-3 bg-blue-500/10 rounded-md border border-blue-500/20">
                <p className="text-sm text-blue-300">
                  You'll be redirected to Shopify to authorize 1SOL.AI. This uses the standard Shopify app install flow.
                </p>
              </div>
            )}

            {useManualAuth && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="useLegacy"
                    checked={useLegacyAuth}
                    onChange={(e) => setUseLegacyAuth(e.target.checked)}
                    className="rounded border-input"
                  />
                  <Label htmlFor="useLegacy" className="text-sm cursor-pointer">
                    Use Legacy App (API Key + Password)
                  </Label>
                </div>

                {useLegacyAuth ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="apiKey">API Key</Label>
                      <Input
                        id="apiKey"
                        placeholder="Your legacy app API key"
                        value={shopifyApiKey}
                        onChange={(e) => setShopifyApiKey(e.target.value)}
                        data-testid="input-shopify-api-key"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apiPassword">API Password</Label>
                      <Input
                        id="apiPassword"
                        type="password"
                        placeholder="Your legacy app API password"
                        value={shopifyApiPassword}
                        onChange={(e) => setShopifyApiPassword(e.target.value)}
                        data-testid="input-shopify-api-password"
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="accessToken">Admin API Access Token</Label>
                    <Input
                      id="accessToken"
                      type="password"
                      placeholder="shpat_xxxxx..."
                      value={shopifyAccessToken}
                      onChange={(e) => setShopifyAccessToken(e.target.value)}
                      data-testid="input-shopify-token"
                    />
                  </div>
                )}
              </>
            )}

            <button
              type="button"
              className="text-xs text-muted-foreground underline cursor-pointer"
              onClick={() => setUseManualAuth(!useManualAuth)}
              data-testid="button-toggle-manual-auth"
            >
              {useManualAuth ? "Use Shopify App authorization instead" : "Use manual access token instead"}
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsShopifyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConnectShopify}
              disabled={
                !shopifyStoreDomain ||
                isOAuthRedirecting ||
                (useManualAuth && (useLegacyAuth ? (!shopifyApiKey || !shopifyApiPassword) : !shopifyAccessToken)) ||
                manualConnectMutation.isPending
              }
              data-testid="button-confirm-shopify"
            >
              {isOAuthRedirecting ? "Redirecting..." : manualConnectMutation.isPending ? "Connecting..." : useManualAuth ? "Connect Store" : "Authorize with Shopify"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderTagsConfig() {
  const { toast } = useToast();
  const { data: tagConfig, isLoading } = useQuery<{ confirm: string; pending: string; cancel: string }>({
    queryKey: ["/api/settings/robo-tags"],
  });

  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState("");
  const [cancel, setCancel] = useState("");

  useEffect(() => {
    if (tagConfig) {
      setConfirm(tagConfig.confirm);
      setPending(tagConfig.pending);
      setCancel(tagConfig.cancel);
    }
  }, [tagConfig]);

  const saveMutation = useMutation({
    mutationFn: async (data: { confirm: string; pending: string; cancel: string }) => {
      const res = await apiRequest("PATCH", "/api/settings/robo-tags", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/robo-tags"] });
      toast({ title: "Tags saved", description: "Order automation tags have been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save tags.", variant: "destructive" });
    },
  });

  const hasChanges = tagConfig && (confirm !== tagConfig.confirm || pending !== tagConfig.pending || cancel !== tagConfig.cancel);
  const allFilled = confirm.trim() && pending.trim() && cancel.trim();

  if (isLoading) {
    return (
      <Card className="bg-[#0d1322] border-white/[0.08]">
        <CardContent className="p-6">
          <Skeleton className="h-4 w-48 mb-4" />
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#0d1322] border-white/[0.08]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Tags className="w-5 h-5" />
              Order Automation Tags
            </CardTitle>
            <CardDescription>
              Configure which Shopify tags automatically sort incoming orders into Confirmed, Pending, or Cancelled.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="tag-confirm" className="text-sm font-medium flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Confirm Tag
            </Label>
            <Input
              id="tag-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="e.g. Robo-Confirm"
              data-testid="input-tag-confirm"
            />
            <p className="text-xs text-muted-foreground">Moves order to Ready to Ship</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tag-pending" className="text-sm font-medium flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              Pending Tag
            </Label>
            <Input
              id="tag-pending"
              value={pending}
              onChange={(e) => setPending(e.target.value)}
              placeholder="e.g. Robo-Pending"
              data-testid="input-tag-pending"
            />
            <p className="text-xs text-muted-foreground">Keeps order for manual review</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tag-cancel" className="text-sm font-medium flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              Cancel Tag
            </Label>
            <Input
              id="tag-cancel"
              value={cancel}
              onChange={(e) => setCancel(e.target.value)}
              placeholder="e.g. Robo-Cancel"
              data-testid="input-tag-cancel"
            />
            <p className="text-xs text-muted-foreground">Automatically cancels the order</p>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button
            onClick={() => saveMutation.mutate({ confirm: confirm.trim(), pending: pending.trim(), cancel: cancel.trim() })}
            disabled={!hasChanges || !allFilled || saveMutation.isPending}
            data-testid="button-save-tags"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Tags
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DataQualityRow({ icon, label, missing, total }: { icon: React.ReactNode; label: string; missing: number; total: number }) {
  const hasData = total > 0 ? ((total - missing) / total) * 100 : 0;
  const isGood = hasData >= 80;
  const isWarning = hasData >= 50 && hasData < 80;

  return (
    <div className="flex items-center gap-3">
      <div className="text-muted-foreground shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-sm font-medium">{label}</span>
          <span className={`text-xs font-medium ${isGood ? 'text-green-600' : isWarning ? 'text-yellow-600' : 'text-red-600'}`} data-testid={`text-quality-${label.toLowerCase()}`}>
            {Math.round(hasData)}%
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${isGood ? 'bg-green-500' : isWarning ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${hasData}%` }}
          />
        </div>
        {missing > 0 && (
          <span className="text-xs text-muted-foreground">{missing.toLocaleString()} missing</span>
        )}
      </div>
    </div>
  );
}
