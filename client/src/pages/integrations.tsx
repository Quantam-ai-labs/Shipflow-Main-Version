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

export default function Integrations() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [isCourierDialogOpen, setIsCourierDialogOpen] = useState(false);
  const [isShopifyDialogOpen, setIsShopifyDialogOpen] = useState(false);
  const [shopifyStoreDomain, setShopifyStoreDomain] = useState("");
  const [shopifyAccessToken, setShopifyAccessToken] = useState("");
  const [useManualToken, setUseManualToken] = useState(true);
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

  const manualConnectMutation = useMutation({
    mutationFn: async (data: { storeDomain: string; accessToken: string }) => {
      return apiRequest("POST", "/api/integrations/shopify/manual-connect", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setIsShopifyDialogOpen(false);
      setShopifyStoreDomain("");
      setShopifyAccessToken("");
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
    
    if (useManualToken) {
      if (!shopifyAccessToken) {
        toast({
          title: "Access Token Required",
          description: "Please enter your Shopify Admin API Access Token.",
          variant: "destructive",
        });
        return;
      }
      const shop = `${storeName}.myshopify.com`;
      manualConnectMutation.mutate({ storeDomain: shop, accessToken: shopifyAccessToken });
    } else {
      const shop = `${storeName}.myshopify.com`;
      window.location.href = `/api/shopify/install?shop=${encodeURIComponent(shop)}`;
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
              <p className="text-xs text-muted-foreground">
                Get this from your Shopify Admin → Settings → Apps → Develop apps → Create an app → Configure Admin API scopes (read_orders) → Install app → Reveal token
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsShopifyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConnectShopify}
              disabled={!shopifyStoreDomain || !shopifyAccessToken || manualConnectMutation.isPending}
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
