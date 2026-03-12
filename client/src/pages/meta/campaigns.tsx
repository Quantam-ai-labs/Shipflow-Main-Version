import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Megaphone, RefreshCw, Loader2, ExternalLink } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  created_time: string;
  updated_time: string;
  start_time?: string;
  stop_time?: string;
}

export default function MetaCampaigns() {
  const { toast } = useToast();
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<{ campaigns: MetaCampaign[] }>({
    queryKey: ["/api/meta/campaigns"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ campaignId, status }: { campaignId: string; status: "ACTIVE" | "PAUSED" }) => {
      const res = await apiRequest("POST", `/api/meta/campaigns/${campaignId}/status`, { status });
      return res.json();
    },
    onSuccess: (_, { campaignId, status }) => {
      toast({ title: `Campaign ${status === "ACTIVE" ? "Activated" : "Paused"}` });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/campaigns"] });
      setTogglingId(null);
    },
    onError: (error: any) => {
      toast({ title: "Status Update Failed", description: error.message, variant: "destructive" });
      setTogglingId(null);
    },
  });

  const campaigns = data?.campaigns || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" data-testid={`badge-status-${status}`}>Active</Badge>;
      case "PAUSED":
        return <Badge variant="secondary" data-testid={`badge-status-${status}`}>Paused</Badge>;
      case "ARCHIVED":
        return <Badge variant="outline" data-testid={`badge-status-${status}`}>Archived</Badge>;
      default:
        return <Badge variant="outline" data-testid={`badge-status-${status}`}>{status}</Badge>;
    }
  };

  const formatBudget = (amount?: string) => {
    if (!amount) return "—";
    const val = parseFloat(amount) / 100;
    return `PKR ${val.toLocaleString()}`;
  };

  return (
    <div className="space-y-6 max-w-5xl" data-testid="page-meta-campaigns">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Meta Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View and manage your Facebook ad campaigns. Toggle campaigns between Active and Paused.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-campaigns"
        >
          {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Megaphone className="w-10 h-10 text-muted-foreground mb-3" />
            <CardTitle className="text-base mb-1" data-testid="text-empty-state">No Campaigns Found</CardTitle>
            <CardDescription>
              Launch an ad from the Ad Launcher to create your first campaign, or ensure your Facebook account is connected.
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {campaigns.map((campaign) => (
            <Card key={campaign.id} className="hover:bg-muted/30 transition-colors" data-testid={`card-campaign-${campaign.id}`}>
              <CardContent className="flex items-center justify-between py-4 px-5 gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate" data-testid={`text-campaign-name-${campaign.id}`}>{campaign.name}</p>
                    {getStatusBadge(campaign.status)}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span data-testid={`text-campaign-objective-${campaign.id}`}>{campaign.objective?.replace("OUTCOME_", "")}</span>
                    {campaign.daily_budget && <span>Daily: {formatBudget(campaign.daily_budget)}</span>}
                    {campaign.lifetime_budget && <span>Lifetime: {formatBudget(campaign.lifetime_budget)}</span>}
                    <span>{new Date(campaign.created_time).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {(campaign.status === "ACTIVE" || campaign.status === "PAUSED") && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{campaign.status === "ACTIVE" ? "Active" : "Paused"}</span>
                      <Switch
                        checked={campaign.status === "ACTIVE"}
                        disabled={togglingId === campaign.id || toggleMutation.isPending}
                        onCheckedChange={(checked) => {
                          setTogglingId(campaign.id);
                          toggleMutation.mutate({
                            campaignId: campaign.id,
                            status: checked ? "ACTIVE" : "PAUSED",
                          });
                        }}
                        data-testid={`switch-campaign-${campaign.id}`}
                      />
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => window.open(`https://www.facebook.com/adsmanager/manage/campaigns?act=${campaign.id}`, "_blank")}
                    data-testid={`button-open-campaign-${campaign.id}`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
