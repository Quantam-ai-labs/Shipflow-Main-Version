import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Megaphone, CheckCircle2, XCircle, Clock, Loader2, Save, Plug, Eye, EyeOff, Key, LogIn, Unplug } from "lucide-react";
import { SiFacebook } from "react-icons/si";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatPkDateTime } from "@/lib/dateFormat";

interface CredentialsData {
  facebookAppId: string;
  facebookAppSecret: string;
  facebookAccessToken: string;
  facebookAdAccountId: string;
  hasAppId: boolean;
  hasAppSecret: boolean;
  hasAccessToken: boolean;
  hasAdAccountId: boolean;
}

export default function MarketingSettings() {
  const { toast } = useToast();

  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [showAppSecret, setShowAppSecret] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [credsDirty, setCredsDirty] = useState(false);

  const { data: syncStatus, isLoading: statusLoading } = useQuery<{
    hasCredentials: boolean;
    credentialSource: "merchant" | "environment" | "none";
    lastSync: {
      completedAt: string | null;
      campaigns: number;
      insights: number;
    } | null;
  }>({
    queryKey: ["/api/marketing/sync-status"],
  });

  const { data: credentials, isLoading: credsLoading } = useQuery<CredentialsData>({
    queryKey: ["/api/marketing/credentials"],
  });

  const { data: campaigns } = useQuery<any[]>({
    queryKey: ["/api/marketing/all-campaigns"],
  });

  const { data: oauthStatus } = useQuery<{
    connected: boolean;
    hasToken: boolean;
    tokenExpiresAt: string | null;
    pageId: string | null;
    pageName: string | null;
    pixelId: string | null;
    adAccountId: string | null;
  }>({
    queryKey: ["/api/meta/oauth/status"],
  });

  useEffect(() => {
    if (credentials) {
      setAppId(credentials.facebookAppId || "");
      setAppSecret(credentials.facebookAppSecret || "");
      setAccessToken(credentials.facebookAccessToken || "");
      setAdAccountId(credentials.facebookAdAccountId || "");
      setCredsDirty(false);
    }
  }, [credentials]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/marketing/credentials", {
        facebookAppId: appId,
        facebookAppSecret: appSecret,
        facebookAccessToken: accessToken,
        facebookAdAccountId: adAccountId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Credentials Saved", description: "Your Facebook credentials have been saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/credentials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/sync-status"] });
      setCredsDirty(false);
    },
    onError: (error: any) => {
      toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketing/test-connection");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Connection Successful", description: `Connected to ad account: ${data.accountName}` });
      } else {
        toast({ title: "Connection Failed", description: data.error || "Could not connect to Facebook.", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Connection Test Failed", description: error.message, variant: "destructive" });
    },
  });

  const oauthConnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/meta/oauth/url");
      return res.json();
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (error: any) => {
      toast({ title: "OAuth Error", description: error.message, variant: "destructive" });
    },
  });

  const oauthDisconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/meta/oauth/disconnect");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Disconnected", description: "Facebook OAuth has been disconnected." });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/oauth/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/sync-status"] });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get("oauth");
    if (oauthResult === "success") {
      toast({ title: "Facebook Connected!", description: "Your Facebook account has been connected via OAuth." });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/oauth/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/credentials"] });
      window.history.replaceState({}, "", window.location.pathname + "?tab=marketing");
    } else if (oauthResult === "error") {
      const message = params.get("message") || "OAuth connection failed.";
      toast({ title: "OAuth Failed", description: message, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname + "?tab=marketing");
    }
  }, []);

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketing/sync");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Sync Complete",
        description: `Synced ${data.campaigns} campaigns and ${data.insights} insights from Facebook Ads.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/all-campaigns"] });
    },
    onError: (error: any) => {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const isConnected = syncStatus?.hasCredentials ?? false;
  const credentialSource = syncStatus?.credentialSource ?? "none";
  const lastSync = syncStatus?.lastSync;
  const activeCampaigns = campaigns?.filter((c: any) => c.status === "ACTIVE").length ?? 0;
  const totalCampaigns = campaigns?.length ?? 0;

  const handleFieldChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    setCredsDirty(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[900px] mx-auto" data-testid="marketing-settings">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Marketing Integration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your Facebook / Meta Ads integration and campaign sync settings.
        </p>
      </div>

      <Card data-testid="card-oauth-connect">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <SiFacebook className="w-5 h-5 text-[#1877F2]" />
            <div>
              <CardTitle className="text-base">One-Click Connect</CardTitle>
              <CardDescription className="text-xs">
                Connect your Facebook account with OAuth — no need to manually enter tokens.
              </CardDescription>
            </div>
          </div>
          {oauthStatus?.connected ? (
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" data-testid="badge-oauth-status">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              OAuth Connected
            </Badge>
          ) : (
            <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" data-testid="badge-oauth-status">
              Not Connected
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {oauthStatus?.connected ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {oauthStatus.pageName && (
                  <div>
                    <span className="text-muted-foreground text-xs">Facebook Page</span>
                    <p className="font-medium" data-testid="text-oauth-page">{oauthStatus.pageName}</p>
                  </div>
                )}
                {oauthStatus.adAccountId && (
                  <div>
                    <span className="text-muted-foreground text-xs">Ad Account</span>
                    <p className="font-medium" data-testid="text-oauth-ad-account">{oauthStatus.adAccountId}</p>
                  </div>
                )}
                {oauthStatus.tokenExpiresAt && (
                  <div>
                    <span className="text-muted-foreground text-xs">Token Expires</span>
                    <p className="font-medium text-xs" data-testid="text-token-expires">
                      {formatPkDateTime(oauthStatus.tokenExpiresAt)}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => oauthConnectMutation.mutate()}
                  disabled={oauthConnectMutation.isPending}
                  data-testid="button-reconnect-oauth"
                >
                  {oauthConnectMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <LogIn className="w-3.5 h-3.5 mr-1" />}
                  Reconnect
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => oauthDisconnectMutation.mutate()}
                  disabled={oauthDisconnectMutation.isPending}
                  className="text-destructive hover:text-destructive"
                  data-testid="button-disconnect-oauth"
                >
                  <Unplug className="w-3.5 h-3.5 mr-1" />
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Click the button below to connect your Facebook account. This will grant 1SOL.AI permission to manage your ads.
                Make sure you have your Facebook App ID and App Secret configured below first.
              </p>
              <Button
                onClick={() => oauthConnectMutation.mutate()}
                disabled={oauthConnectMutation.isPending}
                className="bg-[#1877F2] hover:bg-[#166FE5] text-white"
                data-testid="button-connect-oauth"
              >
                {oauthConnectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <SiFacebook className="w-4 h-4 mr-2" />
                )}
                Connect with Facebook
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-facebook-credentials">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <SiFacebook className="w-5 h-5 text-[#1877F2]" />
            <div>
              <CardTitle className="text-base">Facebook App Credentials</CardTitle>
              <CardDescription className="text-xs">
                Enter your Facebook App credentials to connect your Meta Ads account.
              </CardDescription>
            </div>
          </div>
          {statusLoading ? (
            <Skeleton className="h-5 w-20" />
          ) : isConnected ? (
            <div className="flex flex-col items-end gap-1">
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" data-testid="badge-connection-status">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Connected
              </Badge>
              {credentialSource === "environment" && (
                <span className="text-[10px] text-muted-foreground" data-testid="text-credential-source">via system config</span>
              )}
            </div>
          ) : (
            <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" data-testid="badge-connection-status">
              <XCircle className="w-3 h-3 mr-1" />
              Not Connected
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {credsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fb-app-id" className="text-xs font-medium">
                    <Key className="w-3 h-3 inline mr-1" />
                    App ID
                  </Label>
                  <Input
                    id="fb-app-id"
                    placeholder="e.g. 123456789012345"
                    value={appId}
                    onChange={handleFieldChange(setAppId)}
                    data-testid="input-facebook-app-id"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fb-app-secret" className="text-xs font-medium">
                    <Key className="w-3 h-3 inline mr-1" />
                    App Secret
                  </Label>
                  <div className="relative">
                    <Input
                      id="fb-app-secret"
                      type={showAppSecret ? "text" : "password"}
                      placeholder="Enter app secret"
                      value={appSecret}
                      onChange={handleFieldChange(setAppSecret)}
                      data-testid="input-facebook-app-secret"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowAppSecret(!showAppSecret)}
                      data-testid="button-toggle-app-secret"
                    >
                      {showAppSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fb-access-token" className="text-xs font-medium">
                    <Key className="w-3 h-3 inline mr-1" />
                    Access Token
                  </Label>
                  <div className="relative">
                    <Input
                      id="fb-access-token"
                      type={showAccessToken ? "text" : "password"}
                      placeholder="Enter access token"
                      value={accessToken}
                      onChange={handleFieldChange(setAccessToken)}
                      data-testid="input-facebook-access-token"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowAccessToken(!showAccessToken)}
                      data-testid="button-toggle-access-token"
                    >
                      {showAccessToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fb-ad-account-id" className="text-xs font-medium">
                    <Key className="w-3 h-3 inline mr-1" />
                    Ad Account ID
                  </Label>
                  <Input
                    id="fb-ad-account-id"
                    placeholder="e.g. act_123456789 or 123456789"
                    value={adAccountId}
                    onChange={handleFieldChange(setAdAccountId)}
                    data-testid="input-facebook-ad-account-id"
                  />
                </div>
              </div>

              <Separator />

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !credsDirty}
                  data-testid="button-save-credentials"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Credentials
                </Button>
                <Button
                  variant="outline"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending || credsDirty}
                  data-testid="button-test-connection"
                >
                  {testMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Plug className="w-4 h-4 mr-2" />
                  )}
                  Test Connection
                </Button>
                {credsDirty && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    You have unsaved changes. Save first to test the connection.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-campaign-summary">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Campaign Summary</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Total Campaigns</p>
                <p className="text-lg font-bold" data-testid="text-total-campaigns">{totalCampaigns}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Active Campaigns</p>
                <p className="text-lg font-bold" data-testid="text-active-campaigns">{activeCampaigns}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Paused / Inactive</p>
                <p className="text-lg font-bold" data-testid="text-inactive-campaigns">{totalCampaigns - activeCampaigns}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-sync-settings">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Sync Settings</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Last Sync</p>
                  <p className="text-sm" data-testid="text-last-sync">
                    {lastSync?.completedAt
                      ? formatPkDateTime(lastSync.completedAt)
                      : "Never synced"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Auto-Sync Schedule</p>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-sm" data-testid="text-auto-sync-schedule">Every 15 minutes</p>
                  </div>
                </div>
              </div>

              {lastSync && (
                <div className="text-xs text-muted-foreground" data-testid="text-last-sync-details">
                  Last sync fetched {lastSync.campaigns} campaigns and {lastSync.insights} insights.
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending || !isConnected}
                  data-testid="button-sync-now"
                >
                  {syncMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Sync Now
                </Button>
                {!isConnected && (
                  <p className="text-xs text-muted-foreground">
                    Connect your Facebook Ads account first to enable syncing.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
