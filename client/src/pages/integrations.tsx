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
  AlertTriangle,
  Database,
  Webhook,
  Phone,
  MapPin,
  User,
  Mail,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { SiShopify } from "react-icons/si";
import { useLocation, useSearch } from "wouter";

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
  }>;
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
  recentSyncLogs?: Array<{
    id: string;
    syncType: string;
    ordersCreated: number;
    ordersUpdated: number;
    totalFetched: number;
    status: string;
    startedAt: string;
    completedAt: string | null;
  }>;
}

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
  const [useLegacyAuth, setUseLegacyAuth] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null);
  const [courierApiKey, setCourierApiKey] = useState("");
  const [courierAccountNumber, setCourierAccountNumber] = useState("");

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
      return apiRequest("POST", "/api/integrations/shopify/reconcile", {});
    },
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/data-health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Reconciliation Complete",
        description: result.message || `${result.created} new, ${result.updated} updated`,
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

  const handleConnectShopify = () => {
    if (!shopifyStoreDomain) return;
    
    // Validate store name (alphanumeric and hyphens only)
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
    
    if (useLegacyAuth) {
      // Legacy API key/password authentication
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
      // Modern access token authentication
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

  const saveCourierMutation = useMutation({
    mutationFn: async (data: { courierName: string; apiKey: string; accountNumber: string }) => {
      return apiRequest("POST", "/api/integrations/couriers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setIsCourierDialogOpen(false);
      setCourierApiKey("");
      setCourierAccountNumber("");
      setSelectedCourier(null);
      toast({
        title: "Courier connected",
        description: "Your courier account has been saved.",
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

  const handleSaveCourier = () => {
    if (!selectedCourier || !courierApiKey) return;
    saveCourierMutation.mutate({
      courierName: selectedCourier,
      apiKey: courierApiKey,
      accountNumber: courierAccountNumber,
    });
  };

  const openCourierDialog = (courierName: string) => {
    setSelectedCourier(courierName);
    setIsCourierDialogOpen(true);
  };

  const couriersList = [
    {
      name: "leopards",
      displayName: "Leopards Courier",
      description: "Pakistan's leading courier service with extensive network coverage.",
      logo: "🐆",
    },
    {
      name: "postex",
      displayName: "PostEx",
      description: "Modern logistics solution for e-commerce businesses.",
      logo: "📦",
    },
    {
      name: "tcs",
      displayName: "TCS",
      description: "Trusted courier service with nationwide delivery.",
      logo: "🚚",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
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
                      {new Date(data.shopify.lastSyncAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
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
                Connect your Shopify store to automatically import orders and receive real-time updates via webhooks.
              </p>
              <Button
                onClick={() => setIsShopifyDialogOpen(true)}
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
            const connectedCourier = data?.couriers.find((c) => c.name === courier.name);
            const isConnected = !!connectedCourier?.isActive;

            return (
              <Card key={courier.name} className="hover-elevate">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-2xl">
                      {courier.logo}
                    </div>
                    {isConnected ? (
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
                  <h3 className="font-semibold mb-1">{courier.displayName}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{courier.description}</p>
                  {isConnected ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCourierDialog(courier.name)}
                        data-testid={`button-configure-${courier.name}`}
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Configure
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`https://${courier.name}.pk`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                    </div>
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Data Health & Webhook Monitoring */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Sync Health & Data Quality</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {/* Data Quality Card */}
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

          {/* Sync Status Card */}
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

        {/* Reconciliation Action */}
        <Card className="mt-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">Manual Reconciliation</p>
                  <p className="text-xs text-muted-foreground">
                    Fetch recent order updates from Shopify API to fill in any gaps from missed webhooks.
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

        {/* Recent Webhook Events */}
      </div>

      {/* Shopify Connection Dialog */}
      <Dialog open={isShopifyDialogOpen} onOpenChange={setIsShopifyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Shopify Store</DialogTitle>
            <DialogDescription>
              Enter your Shopify store details to connect and start syncing orders.
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
                  <p className="text-xs text-muted-foreground">
                    Find these in your Shopify Admin → Apps → Manage private apps → Your app
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="accessToken">Admin API Access Token</Label>
                  <Input
                    id="accessToken"
                    type="password"
                    placeholder="shpat_xxxxxxxxxx"
                    value={shopifyAccessToken}
                    onChange={(e) => setShopifyAccessToken(e.target.value)}
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
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsShopifyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConnectShopify}
              disabled={!shopifyStoreDomain || (useLegacyAuth ? (!shopifyApiKey || !shopifyApiPassword) : !shopifyAccessToken) || manualConnectMutation.isPending}
              data-testid="button-confirm-shopify"
            >
              {manualConnectMutation.isPending ? "Connecting..." : "Connect Store"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Courier Configuration Dialog */}
      <Dialog open={isCourierDialogOpen} onOpenChange={setIsCourierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Configure {selectedCourier ? couriersList.find((c) => c.name === selectedCourier)?.displayName : "Courier"}
            </DialogTitle>
            <DialogDescription>
              Enter your API credentials to connect your courier account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter your API key"
                value={courierApiKey}
                onChange={(e) => setCourierApiKey(e.target.value)}
                data-testid="input-courier-api-key"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account Number (Optional)</Label>
              <Input
                id="accountNumber"
                placeholder="Enter your account number"
                value={courierAccountNumber}
                onChange={(e) => setCourierAccountNumber(e.target.value)}
                data-testid="input-courier-account"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCourierDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveCourier}
              disabled={saveCourierMutation.isPending || !courierApiKey}
              data-testid="button-save-courier"
            >
              {saveCourierMutation.isPending ? "Saving..." : "Save Credentials"}
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
