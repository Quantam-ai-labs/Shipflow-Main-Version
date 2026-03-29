import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RefreshCw, Megaphone, CheckCircle2, XCircle, Clock, Loader2, Plug, LogIn, Unplug, ChevronDown, Settings2, Save } from "lucide-react";
import { SiFacebook } from "react-icons/si";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatPkDateTime } from "@/lib/dateFormat";

export default function MarketingSettings() {
  const { toast } = useToast();

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
    instagramAccountId: string | null;
    instagramAccountName: string | null;
  }>({
    queryKey: ["/api/meta/oauth/status"],
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
      toast({ title: "Disconnected", description: "Facebook account has been disconnected." });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/oauth/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/sync-status"] });
    },
  });

  const { data: adAccountsList } = useQuery<{ adAccounts: { id: string; name: string; status: number; currency: string }[] }>({
    queryKey: ["/api/meta/ad-accounts"],
    enabled: !!oauthStatus?.connected,
  });

  const { data: pagesList } = useQuery<{ pages: { id: string; name: string }[] }>({
    queryKey: ["/api/meta/pages"],
    enabled: !!oauthStatus?.connected,
  });

  const { data: igAccountsList } = useQuery<{ instagramAccounts: { id: string; name?: string; username?: string }[] }>({
    queryKey: ["/api/meta/instagram-accounts"],
    enabled: !!oauthStatus?.connected,
  });

  const refreshTokenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/meta/oauth/refresh-token");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Token Refreshed", description: "Your Facebook access token has been refreshed." });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/oauth/status"] });
    },
    onError: (error: any) => {
      toast({ title: "Refresh Failed", description: error.message, variant: "destructive" });
    },
  });

  const updateOAuthSettingsMutation = useMutation({
    mutationFn: async (settings: { adAccountId?: string; pageId?: string; pageName?: string; pixelId?: string; instagramAccountId?: string; instagramAccountName?: string }) => {
      const res = await apiRequest("PUT", "/api/meta/oauth/settings", settings);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Settings Updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/oauth/status"] });
    },
    onError: (error: any) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
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

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketing/sync");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Sync Complete", description: `Synced ${data.campaigns ?? 0} campaigns.` });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/all-campaigns"] });
    },
    onError: (error: any) => {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get("oauth");
    if (oauthResult === "success") {
      toast({ title: "Facebook Connected!", description: "Your Facebook account has been connected successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/oauth/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/sync-status"] });
      window.history.replaceState({}, "", window.location.pathname + "?tab=marketing");
    } else if (oauthResult === "error") {
      const message = params.get("message") || "OAuth connection failed.";
      toast({ title: "Connection Failed", description: decodeURIComponent(message), variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname + "?tab=marketing");
    }
  }, []);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [manualAccessToken, setManualAccessToken] = useState("");
  const [manualAdAccountId, setManualAdAccountId] = useState("");

  const { data: manualCreds } = useQuery<{
    facebookAccessToken: string;
    facebookAdAccountId: string;
    hasAccessToken: boolean;
    hasAdAccountId: boolean;
  }>({
    queryKey: ["/api/marketing/credentials"],
  });

  useEffect(() => {
    if (manualCreds) {
      setManualAccessToken(manualCreds.facebookAccessToken || "");
      setManualAdAccountId(manualCreds.facebookAdAccountId || "");
    }
  }, [manualCreds]);

  const saveCredentialsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/marketing/credentials", {
        facebookAccessToken: manualAccessToken,
        facebookAdAccountId: manualAdAccountId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Credentials Saved", description: "Manual credentials have been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/credentials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/sync-status"] });
    },
    onError: (error: any) => {
      toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    },
  });

  const isConnected = oauthStatus?.connected || syncStatus?.hasCredentials;
  const lastSync = syncStatus?.lastSync;
  const totalCampaigns = campaigns?.length || 0;
  const activeCampaigns = campaigns?.filter((c: any) => c.status === "ACTIVE" || c.effectiveStatus === "ACTIVE").length || 0;

  const tokenExpiry = oauthStatus?.tokenExpiresAt ? new Date(oauthStatus.tokenExpiresAt) : null;
  const isTokenExpiringSoon = tokenExpiry && (tokenExpiry.getTime() - Date.now()) < 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="space-y-6" data-testid="marketing-settings-page">
      <Card data-testid="card-facebook-oauth">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <SiFacebook className="w-5 h-5 text-[#1877F2]" />
            <div>
              <CardTitle className="text-base">Facebook & Instagram</CardTitle>
              <CardDescription className="text-xs">
                Connect your Facebook account to manage ads, pages, and Instagram.
              </CardDescription>
            </div>
          </div>
          {statusLoading ? (
            <Skeleton className="h-5 w-20" />
          ) : oauthStatus?.connected ? (
            <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" data-testid="badge-connection-status">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Connected
            </Badge>
          ) : (
            <Badge className="bg-red-500/10 text-red-400 border border-red-500/20" data-testid="badge-connection-status">
              <XCircle className="w-3 h-3 mr-1" />
              Not Connected
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {oauthStatus?.connected ? (
            <div className="space-y-4">
              {oauthStatus.pageName && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Page:</span>
                  <span className="font-medium" data-testid="text-page-name">{oauthStatus.pageName}</span>
                </div>
              )}

              {tokenExpiry && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Token expires:</span>
                  <span className={isTokenExpiringSoon ? "text-amber-400 font-medium" : ""} data-testid="text-token-expiry">
                    {formatPkDateTime(tokenExpiry.toISOString())}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => refreshTokenMutation.mutate()}
                    disabled={refreshTokenMutation.isPending}
                    data-testid="button-refresh-token"
                  >
                    {refreshTokenMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  </Button>
                </div>
              )}

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Ad Account</label>
                  <Select
                    value={oauthStatus.adAccountId || ""}
                    onValueChange={(val) => updateOAuthSettingsMutation.mutate({ adAccountId: val })}
                    data-testid="select-ad-account"
                  >
                    <SelectTrigger className="h-9 text-sm" data-testid="trigger-ad-account">
                      <SelectValue placeholder="Select ad account" />
                    </SelectTrigger>
                    <SelectContent>
                      {(adAccountsList?.adAccounts || []).map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.id})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Facebook Page</label>
                  <Select
                    value={oauthStatus.pageId || ""}
                    onValueChange={(val) => {
                      const page = pagesList?.pages?.find(p => p.id === val);
                      updateOAuthSettingsMutation.mutate({ pageId: val, pageName: page?.name || "" });
                    }}
                    data-testid="select-page"
                  >
                    <SelectTrigger className="h-9 text-sm" data-testid="trigger-page">
                      <SelectValue placeholder="Select page" />
                    </SelectTrigger>
                    <SelectContent>
                      {(pagesList?.pages || []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Instagram Account</label>
                  <Select
                    value={oauthStatus.instagramAccountId || ""}
                    onValueChange={(val) => {
                      const ig = igAccountsList?.instagramAccounts?.find(a => a.id === val);
                      updateOAuthSettingsMutation.mutate({ instagramAccountId: val, instagramAccountName: ig?.username || ig?.name || "" });
                    }}
                    data-testid="select-instagram"
                  >
                    <SelectTrigger className="h-9 text-sm" data-testid="trigger-instagram">
                      <SelectValue placeholder="Select Instagram account" />
                    </SelectTrigger>
                    <SelectContent position="popper" side="top" className="max-h-60">
                      {(igAccountsList?.instagramAccounts || []).map((ig) => (
                        <SelectItem key={ig.id} value={ig.id}>{ig.username || ig.name || ig.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending}
                  data-testid="button-test-connection"
                >
                  {testMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plug className="w-3.5 h-3.5 mr-1" />}
                  Test Connection
                </Button>
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
                Connect your Facebook account to manage your ads, select your pages, and run campaigns through 1SOL.AI.
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

      <Card data-testid="card-advanced-credentials">
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CardHeader className="pb-2">
            <CollapsibleTrigger className="flex items-center justify-between w-full text-left" data-testid="trigger-advanced-credentials">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Advanced: Manual Credentials</CardTitle>
                  <CardDescription className="text-xs">
                    Override with your own access token or ad account ID
                  </CardDescription>
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Only use these fields if you need to manually override the OAuth-connected credentials. OAuth is the recommended method.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="manual-access-token" className="text-xs">Access Token</Label>
                  <Input
                    id="manual-access-token"
                    type="password"
                    placeholder="Paste Facebook access token"
                    value={manualAccessToken}
                    onChange={e => setManualAccessToken(e.target.value)}
                    data-testid="input-manual-access-token"
                  />
                  {manualCreds?.hasAccessToken && (
                    <p className="text-xs text-emerald-400">Token is set</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="manual-ad-account" className="text-xs">Ad Account ID</Label>
                  <Input
                    id="manual-ad-account"
                    placeholder="act_123456789"
                    value={manualAdAccountId}
                    onChange={e => setManualAdAccountId(e.target.value)}
                    data-testid="input-manual-ad-account"
                  />
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => saveCredentialsMutation.mutate()}
                disabled={saveCredentialsMutation.isPending}
                data-testid="button-save-manual-credentials"
              >
                {saveCredentialsMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                ) : (
                  <Save className="w-3.5 h-3.5 mr-1" />
                )}
                Save Credentials
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
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
                    Connect your Facebook account first to enable syncing.
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
