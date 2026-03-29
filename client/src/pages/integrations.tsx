import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
  Truck,
  CheckCircle2,
  XCircle,
  Settings,
  ExternalLink,
  RefreshCw,
  Activity,
  Database,
  Phone,
  MapPin,
  User,
  Zap,
  ShieldCheck,
  Key,
  Lock,
  Loader2,
  AlertTriangle,
  Calendar,
  Check,
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

const COURIER_CONFIG: Record<string, {
  displayName: string;
  description: string;
  website: string;
  fields: Array<{
    key: string;
    label: string;
    placeholder: string;
    type: string;
    envVar: string;
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
        envVar: "LEOPARDS_API_KEY",
        required: true,
      },
      {
        key: "apiSecret",
        label: "API Password",
        placeholder: "Enter your Leopards API password",
        type: "password",
        envVar: "LEOPARDS_API_PASSWORD",
        required: true,
      },
      {
        key: "shipperId",
        label: "Shipper ID",
        placeholder: "Enter your Leopards Shipper ID (e.g. 2125655)",
        type: "text",
        envVar: "",
        required: false,
      },
      {
        key: "shipperCity",
        label: "Shipper City (Origin)",
        placeholder: "Enter your pickup/origin city (e.g. Lahore, Karachi)",
        type: "text",
        envVar: "",
        required: false,
      },
      {
        key: "shipperAddress",
        label: "Shipper Address (Pickup)",
        placeholder: "Enter your pickup/warehouse address",
        type: "text",
        envVar: "",
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
        envVar: "POSTEX_API_TOKEN",
        required: true,
      },
      {
        key: "pickupAddressCode",
        label: "Pickup Address Code",
        placeholder: "Enter your PostEx Pickup Address Code (e.g. 002)",
        type: "text",
        envVar: "",
        required: false,
      },
      {
        key: "storeAddressCode",
        label: "Store Address Code",
        placeholder: "Enter your PostEx Store/Default Address Code (e.g. 001)",
        type: "text",
        envVar: "",
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
        envVar: "TCS_API_KEY",
        required: true,
      },
    ],
  },
};

export default function Integrations() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [isCourierDialogOpen, setIsCourierDialogOpen] = useState(false);
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
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null);
  const [courierFormData, setCourierFormData] = useState<Record<string, string>>({});
  const [useEnvCreds, setUseEnvCreds] = useState(false);
  const [postexAddresses, setPostexAddresses] = useState<any[]>([]);
  const [fetchingAddresses, setFetchingAddresses] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const shopifyStatus = params.get('shopify');
    
    if (shopifyStatus === 'connected') {
      toast({
        title: "Shopify Connected!",
        description: "Your Shopify store has been connected successfully. You can now sync orders.",
      });
      setLocation('/integrations', { replace: true });
    } else if (shopifyStatus === 'error') {
      const message = params.get('message') || 'An error occurred while connecting to Shopify';
      toast({
        title: "Connection Failed",
        description: message,
        variant: "destructive",
      });
      setLocation('/integrations', { replace: true });
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

  const syncShopifyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/integrations/shopify/sync", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Sync started",
        description: "Syncing orders from Shopify. This may take a moment.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to sync orders. Please try again.",
        variant: "destructive",
      });
    },
  });

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

  const saveCourierMutation = useMutation({
    mutationFn: async (payload: { courierName: string; apiKey?: string; apiSecret?: string; accountNumber?: string; useEnvCredentials: boolean; settings?: Record<string, any> }) => {
      return apiRequest("POST", "/api/integrations/couriers", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setIsCourierDialogOpen(false);
      setCourierFormData({});
      setSelectedCourier(null);
      setUseEnvCreds(false);
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

    if (!useEnvCreds) {
      const missingRequired = config.fields.filter(f => f.required && !courierFormData[f.key]);
      if (missingRequired.length > 0) {
        toast({
          title: "Missing Credentials",
          description: `Please fill in: ${missingRequired.map(f => f.label).join(', ')}`,
          variant: "destructive",
        });
        return;
      }
    }

    saveCourierMutation.mutate({
      courierName: selectedCourier,
      apiKey: courierFormData.apiKey || undefined,
      apiSecret: courierFormData.apiSecret || undefined,
      accountNumber: courierFormData.accountNumber || undefined,
      useEnvCredentials: useEnvCreds,
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
    const hasEnv = hasFullEnvCreds(courierName);
    setUseEnvCreds(connectedCourier?.useEnvCredentials || (!connectedCourier?.hasDbCredentials && hasEnv));
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
    if (!connectedCourier && courierName === 'leopards') {
      setCourierFormData(prev => ({ ...prev, shipperId: '2125655' }));
    }
    if (!connectedCourier && courierName === 'postex') {
      setCourierFormData(prev => ({ ...prev, pickupAddressCode: '002', storeAddressCode: '001' }));
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

  const couriersList = Object.entries(COURIER_CONFIG).map(([name, config]) => ({
    name,
    ...config,
  }));

  function hasFullEnvCreds(courierName: string): boolean {
    const envCreds = data?.envCredentials?.[courierName];
    if (!envCreds) return false;
    if (courierName === 'leopards') return !!(envCreds.hasKey && envCreds.hasSecret);
    return !!envCreds.hasKey;
  }

  function getCourierStatus(courierName: string): { connected: boolean; source: string } {
    const connected = data?.couriers.find(c => c.name === courierName);
    const hasEnv = hasFullEnvCreds(courierName);
    
    if (connected?.isActive) {
      if (connected.useEnvCredentials || (!connected.hasDbCredentials && hasEnv)) {
        return { connected: true, source: 'env' };
      }
      return { connected: true, source: 'custom' };
    }
    
    if (hasEnv) {
      return { connected: false, source: 'env_available' };
    }
    
    return { connected: false, source: 'none' };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-integrations-title">Integrations</h1>
        <p className="text-muted-foreground">Connect your Shopify store and courier accounts.</p>
      </div>

      {/* Shopify Integration */}
      <Card>
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
                  <AlertTriangle className="w-4 h-4 shrink-0 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-700 dark:text-yellow-400">
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
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => syncShopifyMutation.mutate()}
                  disabled={syncShopifyMutation.isPending}
                  data-testid="button-sync-shopify"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncShopifyMutation.isPending ? "animate-spin" : ""}`} />
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

      {/* Courier Integrations */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Courier Integrations</h2>
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
                    ) : status.source === 'env_available' ? (
                      <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                        <Key className="w-3 h-3 mr-1" />
                        Key Available
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
                      {status.source === 'env' ? (
                        <>
                          <ShieldCheck className="w-3 h-3" />
                          <span>Using environment credentials</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3 h-3" />
                          <span>Using custom credentials</span>
                        </>
                      )}
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
                    ) : status.source === 'env_available' ? (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => openCourierDialog(courier.name)}
                        data-testid={`button-activate-${courier.name}`}
                      >
                        <Zap className="w-4 h-4 mr-2" />
                        Activate
                      </Button>
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
      </div>

      {/* Sync Health & Data Quality */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Sync Health & Data Quality</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
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

          <Card>
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
                      Last sync: {formatPkDateTime(dataHealth.lastApiSyncAt)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No sync data</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4">
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

      {/* Shopify Connection Dialog */}
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

      {/* Courier Configuration Dialog */}
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
              {/* Environment credential option */}
              {selectedCourier && hasFullEnvCreds(selectedCourier) && (
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <input
                        type="checkbox"
                        id="useEnvCreds"
                        checked={useEnvCreds}
                        onChange={(e) => setUseEnvCreds(e.target.checked)}
                        className="rounded border-input"
                        data-testid="checkbox-use-env-credentials"
                      />
                    </div>
                    <div>
                      <Label htmlFor="useEnvCreds" className="text-sm font-medium cursor-pointer">
                        Use pre-configured credentials
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        API credentials are already configured in the environment. Check this to use them instead of entering custom credentials.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!useEnvCreds && (
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
              )}

              {selectedCourier === 'leopards' && !useEnvCreds && (
                <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <p className="text-xs text-amber-400">
                    Find your API Key and Password in your Leopards account under <strong>API Settings</strong> &rarr; <strong>API Management</strong>.
                  </p>
                </div>
              )}

              {selectedCourier === 'postex' && !useEnvCreds && (
                <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <p className="text-xs text-amber-400">
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
            <Button variant="outline" onClick={() => setIsCourierDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveCourier}
              disabled={saveCourierMutation.isPending || (!useEnvCreds && !Object.values(courierFormData).some(v => v))}
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
