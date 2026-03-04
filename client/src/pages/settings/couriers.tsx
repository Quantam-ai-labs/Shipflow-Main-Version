import { useState } from "react";
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
import { Truck, CheckCircle2, Settings, ExternalLink, Zap, Lock, Loader2, MapPin, RefreshCw, Copy, Webhook, Eye, EyeOff } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";

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
    settings?: Record<string, any>;
  }>;
}

const COURIER_CONFIG: Record<string, {
  displayName: string;
  description: string;
  website: string;
  fields: Array<{
    key: string;
    label: string;
    placeholder: string;
    type: string;
    required: boolean;
  }>;
}> = {
  leopards: {
    displayName: "Leopards Courier",
    description: "Pakistan's leading courier service with extensive network coverage across all major cities.",
    website: "https://www.leopardscourier.com",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "Enter your Leopards API key",
        type: "password",
        required: true,
      },
      {
        key: "apiSecret",
        label: "API Password",
        placeholder: "Enter your Leopards API password",
        type: "password",
        required: true,
      },
      {
        key: "shipperId",
        label: "Shipper ID",
        placeholder: "Enter your Leopards Shipper ID",
        type: "text",
        required: false,
      },
      {
        key: "shipperCity",
        label: "Shipper City (Origin)",
        placeholder: "Enter your pickup/origin city (e.g. Lahore, Karachi)",
        type: "text",
        required: false,
      },
      {
        key: "shipperAddress",
        label: "Shipper Address (Pickup)",
        placeholder: "Enter your pickup/warehouse address",
        type: "text",
        required: false,
      },
    ],
  },
  postex: {
    displayName: "PostEx",
    description: "Modern logistics and payment solution for e-commerce businesses in Pakistan.",
    website: "https://postex.pk",
    fields: [
      {
        key: "apiKey",
        label: "API Token",
        placeholder: "Enter your PostEx API token",
        type: "password",
        required: true,
      },
      {
        key: "pickupAddressCode",
        label: "Pickup Address Code",
        placeholder: "Enter your PostEx Pickup Address Code (e.g. 002)",
        type: "text",
        required: false,
      },
      {
        key: "storeAddressCode",
        label: "Store Address Code",
        placeholder: "Enter your PostEx Store/Default Address Code (e.g. 001)",
        type: "text",
        required: false,
      },
    ],
  },
  tcs: {
    displayName: "TCS",
    description: "Trusted courier service with nationwide delivery and COD support.",
    website: "https://www.tcsexpress.com",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "Enter your TCS API key",
        type: "password",
        required: true,
      },
    ],
  },
};

export default function CouriersSettings() {
  const { toast } = useToast();
  const [isCourierDialogOpen, setIsCourierDialogOpen] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null);
  const [courierFormData, setCourierFormData] = useState<Record<string, string>>({});
  const [postexAddresses, setPostexAddresses] = useState<any[]>([]);
  const [fetchingAddresses, setFetchingAddresses] = useState(false);

  const { data, isLoading } = useQuery<IntegrationsData>({
    queryKey: ["/api/integrations"],
  });

  const saveCourierMutation = useMutation({
    mutationFn: async (payload: { courierName: string; apiKey?: string; apiSecret?: string; accountNumber?: string; useEnvCredentials?: boolean; settings?: Record<string, any> }) => {
      return apiRequest("POST", "/api/integrations/couriers", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setIsCourierDialogOpen(false);
      setCourierFormData({});
      setSelectedCourier(null);
      toast({
        title: "Courier Connected",
        description: "Your courier account has been saved and is ready for tracking.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save courier credentials. Please try again.",
        variant: "destructive",
      });
    },
  });

  const testCourierMutation = useMutation({
    mutationFn: async (courierName: string) => {
      const resp = await apiRequest("POST", "/api/integrations/couriers/test", { courierName });
      return resp.json();
    },
    onSuccess: (result: { success: boolean; message: string }) => {
      toast({
        title: result.success ? "Connection Successful" : "Connection Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    },
    onError: () => {
      toast({
        title: "Test Failed",
        description: "Could not test the connection. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSaveCourier = () => {
    if (!selectedCourier) return;
    const config = COURIER_CONFIG[selectedCourier];
    if (!config) return;

    const missingRequired = config.fields.filter(f => f.required && !courierFormData[f.key]);
    if (missingRequired.length > 0) {
      toast({
        title: "Missing Credentials",
        description: `Please fill in: ${missingRequired.map(f => f.label).join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    saveCourierMutation.mutate({
      courierName: selectedCourier,
      apiKey: courierFormData.apiKey || undefined,
      apiSecret: courierFormData.apiSecret || undefined,
      accountNumber: courierFormData.accountNumber || undefined,
      useEnvCredentials: false,
      settings: {
        ...(courierFormData.shipperId ? { shipperId: courierFormData.shipperId } : {}),
        ...(courierFormData.shipperCity ? { shipperCity: courierFormData.shipperCity } : {}),
        ...(courierFormData.shipperAddress ? { shipperAddress: courierFormData.shipperAddress } : {}),
        ...(courierFormData.pickupAddressCode ? { pickupAddressCode: courierFormData.pickupAddressCode } : {}),
        ...(courierFormData.storeAddressCode ? { storeAddressCode: courierFormData.storeAddressCode } : {}),
      },
    });
  };

  const openCourierDialog = (courierName: string) => {
    setSelectedCourier(courierName);
    setCourierFormData({});
    const connectedCourier = data?.couriers.find(c => c.name === courierName);
    if (connectedCourier?.settings) {
      const s = connectedCourier.settings as Record<string, any>;
      if (s.shipperId) {
        setCourierFormData(prev => ({ ...prev, shipperId: s.shipperId }));
      }
      if (s.shipperCity) {
        setCourierFormData(prev => ({ ...prev, shipperCity: s.shipperCity }));
      }
      if (s.shipperAddress) {
        setCourierFormData(prev => ({ ...prev, shipperAddress: s.shipperAddress }));
      }
      if (s.pickupAddressCode) {
        setCourierFormData(prev => ({ ...prev, pickupAddressCode: s.pickupAddressCode }));
      }
      if (s.storeAddressCode) {
        setCourierFormData(prev => ({ ...prev, storeAddressCode: s.storeAddressCode }));
      }
    }
    setIsCourierDialogOpen(true);
  };

  const fetchPostexAddresses = async () => {
    setFetchingAddresses(true);
    try {
      const resp = await apiRequest("POST", "/api/integrations/postex/addresses");
      const data = await resp.json();
      if (data.success && data.addresses && data.addresses.length > 0) {
        setPostexAddresses(data.addresses);

        let autoPickup = "";
        let autoStore = "";
        for (const addr of data.addresses) {
          const code = String(addr.addressCode || "").trim();
          const type = (addr.addressType || "").toLowerCase();
          if ((type.includes("pickup") || type.includes("return")) && !autoPickup) {
            autoPickup = code;
          }
          if (type.includes("default") && !autoStore) {
            autoStore = code;
          }
        }
        if (!autoPickup && data.addresses.length > 0) autoPickup = String(data.addresses[0].addressCode || "").trim();
        if (!autoStore && data.addresses.length > 0) autoStore = String(data.addresses[0].addressCode || "").trim();

        setCourierFormData(prev => ({
          ...prev,
          pickupAddressCode: autoPickup || prev.pickupAddressCode || "",
          storeAddressCode: autoStore || prev.storeAddressCode || "",
        }));

        toast({ title: "Addresses Synced", description: `Found ${data.addresses.length} address(es). Pickup="${autoPickup}", Store="${autoStore}" auto-assigned.` });
      } else {
        toast({ title: "Failed", description: data.message || "Could not fetch addresses from PostEx.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to fetch PostEx addresses.", variant: "destructive" });
    } finally {
      setFetchingAddresses(false);
    }
  };

  const { data: courierSyncStatus } = useQuery<{
    autoSyncEnabled: boolean;
    intervalSeconds: number;
    isRunning: boolean;
    lastResult: {
      timestamp: string;
      updated: number;
      failed: number;
      skipped: number;
      total: number;
      error?: string;
    } | null;
  }>({
    queryKey: ["/api/couriers/sync-status"],
    refetchInterval: 30000,
  });

  const [courierSyncProgress, setCourierSyncProgress] = useState<{ processed: number; total: number } | null>(null);
  const [syncingCourier, setSyncingCourier] = useState<string | null>(null);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);

  const { data: webhookConfig, isLoading: isLoadingWebhookConfig } = useQuery<{
    webhookUrl: string;
    headerKey: string;
    headerValue: string;
  }>({
    queryKey: ["/api/couriers/postex-webhook-config"],
    enabled: !!data?.couriers.find(c => c.name === 'postex' && c.isActive),
  });

  const pollCourierProgress = async () => {
    const maxWait = 120000;
    const pollInterval = 1500;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));
      try {
        const progressRes = await fetch("/api/couriers/manual-sync-progress", { credentials: "include" });
        if (!progressRes.ok) continue;
        const progress = await progressRes.json();
        if (progress.processed !== undefined && progress.total !== undefined) {
          setCourierSyncProgress({ processed: progress.processed, total: progress.total });
        }
        if (progress.status === "done" && progress.result) {
          setCourierSyncProgress(null);
          return progress.result;
        }
        if (progress.status === "error") {
          setCourierSyncProgress(null);
          throw new Error(progress.error || "Courier sync failed");
        }
      } catch (e: any) {
        if (e.message?.includes("Courier sync failed")) throw e;
      }
    }
    setCourierSyncProgress(null);
    throw new Error("Sync is taking longer than expected. It will continue in the background.");
  };

  const courierSyncMutation = useMutation({
    mutationFn: async (courier?: string) => {
      const url = courier
        ? `/api/couriers/sync-statuses?courier=${encodeURIComponent(courier)}`
        : "/api/couriers/sync-statuses";
      const res = await apiRequest("POST", url, {});
      const startResult = await res.json();

      setCourierSyncProgress({ processed: 0, total: 0 });
      setSyncingCourier(courier || "all");

      if (startResult.status === 'already_running') {
        toast({ title: "Sync already running", description: "Showing current progress..." });
      } else if (!startResult.success) {
        setCourierSyncProgress(null);
        setSyncingCourier(null);
        throw new Error(startResult.message || "Failed to start sync");
      }

      return pollCourierProgress();
    },
    onSuccess: (result: any) => {
      setCourierSyncProgress(null);
      setSyncingCourier(null);
      queryClient.invalidateQueries({ queryKey: ["/api/couriers/sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Courier Sync Complete",
        description: `${result.updated ?? 0} updated, ${result.failed ?? 0} failed, ${result.skipped ?? 0} skipped out of ${result.total ?? 0} shipments`,
      });
    },
    onError: (err: any) => {
      setCourierSyncProgress(null);
      setSyncingCourier(null);
      queryClient.invalidateQueries({ queryKey: ["/api/couriers/sync-status"] });
      toast({
        title: "Courier Sync Failed",
        description: err.message || "Could not sync courier statuses. Please try again.",
        variant: "destructive",
      });
    },
  });

  const couriersList = Object.entries(COURIER_CONFIG).map(([name, config]) => ({
    name,
    ...config,
  }));

  function getCourierStatus(courierName: string): { connected: boolean; source: string } {
    const connected = data?.couriers.find(c => c.name === courierName);
    
    if (connected?.isActive) {
      return { connected: true, source: 'custom' };
    }
    
    return { connected: false, source: 'none' };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-couriers-title">Courier Integrations</h1>
        <p className="text-muted-foreground">Connect and configure your courier accounts for shipment tracking and booking.</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Courier Tracking Sync</p>
                <p className="text-xs text-muted-foreground">
                  Fetch latest shipment statuses from courier APIs.
                  {courierSyncStatus?.autoSyncEnabled && (
                    <span> Auto-syncs every {Math.round((courierSyncStatus.intervalSeconds || 300) / 60)} min.</span>
                  )}
                </p>
                {courierSyncStatus?.lastResult && (
                  <p className="text-xs text-muted-foreground mt-1" data-testid="text-courier-last-sync">
                    Last sync: {new Date(courierSyncStatus.lastResult.timestamp).toLocaleString()}
                    {courierSyncStatus.lastResult.total > 0 && (
                      <span> ({courierSyncStatus.lastResult.updated} updated, {courierSyncStatus.lastResult.total} total)</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex flex-col gap-3">
              <Button
                variant="default"
                size="sm"
                onClick={() => courierSyncMutation.mutate(undefined)}
                disabled={courierSyncMutation.isPending}
                data-testid="button-courier-sync-all"
                className="w-fit"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${courierSyncMutation.isPending && syncingCourier === "all" ? "animate-spin" : ""}`} />
                {courierSyncMutation.isPending && syncingCourier === "all" ? "Syncing All..." : "Sync All Couriers"}
              </Button>
              {courierSyncMutation.isPending && syncingCourier === "all" && courierSyncProgress && (
                <div className="space-y-1 max-w-sm" data-testid="courier-sync-progress-all">
                  <Progress value={courierSyncProgress.total > 0 ? (courierSyncProgress.processed / courierSyncProgress.total) * 100 : undefined} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {courierSyncProgress.total > 0
                      ? `Syncing ${courierSyncProgress.processed} of ${courierSyncProgress.total} orders...`
                      : "Starting sync..."}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => courierSyncMutation.mutate("leopards")}
                disabled={courierSyncMutation.isPending}
                data-testid="button-courier-sync-leopards"
                className="w-fit"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${courierSyncMutation.isPending && syncingCourier === "leopards" ? "animate-spin" : ""}`} />
                {courierSyncMutation.isPending && syncingCourier === "leopards" ? "Syncing..." : "Sync Leopards"}
              </Button>
              {courierSyncMutation.isPending && syncingCourier === "leopards" && courierSyncProgress && (
                <div className="space-y-1 max-w-sm" data-testid="courier-sync-progress-leopards">
                  <Progress value={courierSyncProgress.total > 0 ? (courierSyncProgress.processed / courierSyncProgress.total) * 100 : undefined} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {courierSyncProgress.total > 0
                      ? `Syncing ${courierSyncProgress.processed} of ${courierSyncProgress.total} orders...`
                      : "Starting sync..."}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => courierSyncMutation.mutate("postex")}
                disabled={courierSyncMutation.isPending}
                data-testid="button-courier-sync-postex"
                className="w-fit"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${courierSyncMutation.isPending && syncingCourier === "postex" ? "animate-spin" : ""}`} />
                {courierSyncMutation.isPending && syncingCourier === "postex" ? "Syncing..." : "Sync PostEx"}
              </Button>
              {courierSyncMutation.isPending && syncingCourier === "postex" && courierSyncProgress && (
                <div className="space-y-1 max-w-sm" data-testid="courier-sync-progress-postex">
                  <Progress value={courierSyncProgress.total > 0 ? (courierSyncProgress.processed / courierSyncProgress.total) * 100 : undefined} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {courierSyncProgress.total > 0
                      ? `Syncing ${courierSyncProgress.processed} of ${courierSyncProgress.total} orders...`
                      : "Starting sync..."}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled
                data-testid="button-courier-sync-tcs"
                className="w-fit"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Sync TCS
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {couriersList.map((courier) => {
          const status = getCourierStatus(courier.name);

          return (
            <Card key={courier.name} className="hover-elevate">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                    <Truck className="w-6 h-6 text-muted-foreground" />
                  </div>
                  {isLoading ? (
                    <Skeleton className="h-6 w-24" />
                  ) : status.connected ? (
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Not Connected
                    </Badge>
                  )}
                </div>
                <h3 className="font-semibold mb-1" data-testid={`text-courier-name-${courier.name}`}>{courier.displayName}</h3>
                <p className="text-sm text-muted-foreground mb-4">{courier.description}</p>
                
                {status.connected && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                    <Lock className="w-3 h-3" />
                    <span>Using custom credentials</span>
                  </div>
                )}

                {courier.name === 'postex' && status.connected && (
                  <div className="mb-3 p-4 rounded-lg border bg-muted/30 space-y-4">
                    <div className="flex items-center gap-2">
                      <Webhook className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold">Webhook Configuration</span>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Webhook URL</Label>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1.5 rounded flex-1 truncate border" data-testid="text-postex-webhook-url">
                            {webhookConfig?.webhookUrl || "Loading..."}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              if (webhookConfig?.webhookUrl) {
                                navigator.clipboard.writeText(webhookConfig.webhookUrl);
                                toast({ title: "Copied", description: "Webhook URL copied to clipboard." });
                              }
                            }}
                            data-testid="button-copy-postex-webhook-url"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Header Key</Label>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1.5 rounded flex-1 truncate border" data-testid="text-postex-webhook-header-key">
                            {webhookConfig?.headerKey || "x-webhook-secret"}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              navigator.clipboard.writeText(webhookConfig?.headerKey || "x-webhook-secret");
                              toast({ title: "Copied", description: "Header Key copied to clipboard." });
                            }}
                            data-testid="button-copy-postex-webhook-header-key"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Header Value (Secret)</Label>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <code className="text-xs bg-muted px-2 py-1.5 rounded w-full block truncate border pr-8" data-testid="text-postex-webhook-header-value">
                              {showWebhookSecret ? (webhookConfig?.headerValue || "not-configured") : "••••••••••••••••"}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 absolute right-1 top-1/2 -translate-y-1/2"
                              onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                            >
                              {showWebhookSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </Button>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              if (webhookConfig?.headerValue) {
                                navigator.clipboard.writeText(webhookConfig.headerValue);
                                toast({ title: "Copied", description: "Webhook secret copied to clipboard." });
                              }
                            }}
                            data-testid="button-copy-postex-webhook-header-value"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                      Copy these values into your PostEx dashboard. This ensures only authorized updates are processed.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  {status.connected ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCourierDialog(courier.name)}
                        data-testid={`button-configure-${courier.name}`}
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Configure
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testCourierMutation.mutate(courier.name)}
                        disabled={testCourierMutation.isPending}
                        data-testid={`button-test-${courier.name}`}
                      >
                        {testCourierMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Zap className="w-4 h-4 mr-2" />
                        )}
                        Test
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openCourierDialog(courier.name)}
                      data-testid={`button-connect-${courier.name}`}
                    >
                      <Truck className="w-4 h-4 mr-2" />
                      Connect
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" asChild>
                    <a href={courier.website} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={isCourierDialogOpen} onOpenChange={(open) => {
        setIsCourierDialogOpen(open);
        if (!open) {
          setCourierFormData({});
          setSelectedCourier(null);
          setPostexAddresses([]);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Configure {selectedCourier ? COURIER_CONFIG[selectedCourier]?.displayName : "Courier"}
            </DialogTitle>
            <DialogDescription>
              {selectedCourier && COURIER_CONFIG[selectedCourier] ? (
                `Set up API credentials for ${COURIER_CONFIG[selectedCourier].displayName} to enable shipment tracking.`
              ) : (
                "Enter your API credentials to connect your courier account."
              )}
            </DialogDescription>
          </DialogHeader>
          
          {selectedCourier && COURIER_CONFIG[selectedCourier] && (
            <div className="space-y-4 py-2">
              <div className="space-y-3">
                {COURIER_CONFIG[selectedCourier].fields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={`courier-${field.key}`}>
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <Input
                      id={`courier-${field.key}`}
                      type={field.type}
                      placeholder={field.placeholder}
                      value={courierFormData[field.key] || ""}
                      onChange={(e) => setCourierFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      data-testid={`input-courier-${field.key}`}
                    />
                  </div>
                ))}
              </div>

              {selectedCourier === 'leopards' && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/50 rounded-lg border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Find your API Key and Password in your Leopards account under <strong>API Settings</strong> &rarr; <strong>API Management</strong>.
                  </p>
                </div>
              )}

              {selectedCourier === 'postex' && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/50 rounded-lg border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Your API Token can be found in your PostEx merchant dashboard under <strong>Integration Settings</strong>.
                  </p>
                </div>
              )}

              {selectedCourier === 'postex' && (
                <div className="space-y-3">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="courier-pickupAddressCode">Pickup Address Code</Label>
                      <Input
                        id="courier-pickupAddressCode"
                        type="text"
                        placeholder="e.g. 002 — from PostEx"
                        value={courierFormData.pickupAddressCode || ""}
                        onChange={(e) => setCourierFormData(prev => ({ ...prev, pickupAddressCode: e.target.value }))}
                        data-testid="input-courier-pickupAddressCode"
                      />
                      <p className="text-xs text-muted-foreground">PostEx Pickup/Return address code (string, e.g. "002")</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="courier-storeAddressCode">Store/Default Address Code</Label>
                      <Input
                        id="courier-storeAddressCode"
                        type="text"
                        placeholder="e.g. 001 — from PostEx"
                        value={courierFormData.storeAddressCode || ""}
                        onChange={(e) => setCourierFormData(prev => ({ ...prev, storeAddressCode: e.target.value }))}
                        data-testid="input-courier-storeAddressCode"
                      />
                      <p className="text-xs text-muted-foreground">PostEx Default/Store address code (string, e.g. "001")</p>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchPostexAddresses}
                    disabled={fetchingAddresses}
                    data-testid="button-fetch-postex-addresses"
                  >
                    {fetchingAddresses ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Fetching...</>
                    ) : (
                      <><MapPin className="w-4 h-4 mr-2" />Sync Addresses from PostEx</>
                    )}
                  </Button>

                  {postexAddresses.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">Your registered PostEx addresses — click to assign:</p>
                      {postexAddresses.map((addr: any, idx: number) => {
                        const code = String(addr.addressCode || "").trim();
                        const addrType = addr.addressType || "";
                        const isPickup = addrType.toLowerCase().includes("pickup") || addrType.toLowerCase().includes("return");
                        const isDefault = addrType.toLowerCase().includes("default");
                        return (
                          <div
                            key={idx}
                            className="p-2 rounded-md border text-xs space-y-1"
                            data-testid={`postex-address-${idx}`}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="font-medium">{addr.address || "Address"}</span>
                              <div className="flex items-center gap-1">
                                <Badge variant="secondary">Code: {code || "N/A"}</Badge>
                                {addrType && <Badge variant="outline">{addrType}</Badge>}
                              </div>
                            </div>
                            {addr.cityName && <p className="text-muted-foreground">{addr.cityName}</p>}
                            {addr.contactPersonName && <p className="text-muted-foreground">Contact: {addr.contactPersonName}</p>}
                            <div className="flex gap-2 flex-wrap">
                              <Button
                                size="sm"
                                variant={isPickup ? "default" : "outline"}
                                onClick={() => setCourierFormData(prev => ({ ...prev, pickupAddressCode: code }))}
                                data-testid={`button-use-pickup-${idx}`}
                              >
                                Use as Pickup
                              </Button>
                              <Button
                                size="sm"
                                variant={isDefault ? "default" : "outline"}
                                onClick={() => setCourierFormData(prev => ({ ...prev, storeAddressCode: code }))}
                                data-testid={`button-use-store-${idx}`}
                              >
                                Use as Store
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsCourierDialogOpen(false)} data-testid="button-cancel-courier">
              Cancel
            </Button>
            <Button
              onClick={handleSaveCourier}
              disabled={saveCourierMutation.isPending || !Object.values(courierFormData).some(v => v)}
              data-testid="button-save-courier"
            >
              {saveCourierMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save & Connect"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
