import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Megaphone, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { SiFacebook } from "react-icons/si";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function MarketingSettings() {
  const { toast } = useToast();

  const { data: syncStatus, isLoading: statusLoading } = useQuery<{
    hasCredentials: boolean;
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
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isConnected = syncStatus?.hasCredentials ?? false;
  const lastSync = syncStatus?.lastSync;
  const activeCampaigns = campaigns?.filter((c: any) => c.status === "ACTIVE").length ?? 0;
  const totalCampaigns = campaigns?.length ?? 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[900px] mx-auto" data-testid="marketing-settings">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Marketing Integration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your Facebook / Meta Ads integration and campaign sync settings.
        </p>
      </div>

      <Card data-testid="card-facebook-integration">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <SiFacebook className="w-5 h-5 text-[#1877F2]" />
            <div>
              <CardTitle className="text-base">Facebook Ads Integration</CardTitle>
              <CardDescription className="text-xs">
                Connect your Meta Ads account to sync campaign data automatically.
              </CardDescription>
            </div>
          </div>
          {statusLoading ? (
            <Skeleton className="h-5 w-20" />
          ) : isConnected ? (
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" data-testid="badge-connection-status">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Connected
            </Badge>
          ) : (
            <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" data-testid="badge-connection-status">
              <XCircle className="w-3 h-3 mr-1" />
              Not Connected
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {statusLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Ad Account ID</p>
                  <p className="text-sm font-mono" data-testid="text-ad-account-id">
                    {isConnected ? "(configured via environment)" : "Not configured"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Access Token</p>
                  <p className="text-sm font-mono" data-testid="text-access-token-status">
                    {isConnected ? "(configured via environment)" : "Not configured"}
                  </p>
                </div>
              </div>

              {!isConnected && (
                <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground" data-testid="text-setup-instructions">
                  To connect Facebook Ads, set the <code className="font-mono text-xs bg-background px-1 py-0.5 rounded">FACEBOOK_ACCESS_TOKEN</code> and{" "}
                  <code className="font-mono text-xs bg-background px-1 py-0.5 rounded">FACEBOOK_AD_ACCOUNT_ID</code> environment variables.
                </div>
              )}
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
                      ? format(new Date(lastSync.completedAt), "MMM d, yyyy 'at' h:mm a")
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
