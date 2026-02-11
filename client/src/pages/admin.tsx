import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Shield,
  Search,
  Ban,
  CheckCircle,
  UserX,
  UserCheck,
  Key,
  SkipForward,
  ArrowLeft,
  Loader2,
  Building2,
  Users,
  Database,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function AdminPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedMerchant, setSelectedMerchant] = useState<any>(null);

  if (user?.role !== "SUPER_ADMIN") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield className="w-16 h-16 mx-auto text-muted-foreground/50" />
          <h2 className="text-xl font-bold" data-testid="text-admin-denied">Access Denied</h2>
          <p className="text-muted-foreground">Only administrators can access this page.</p>
          <Link href="/dashboard"><Button variant="outline">Go to Dashboard</Button></Link>
        </div>
      </div>
    );
  }

  const { data: merchants, isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/merchants", search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/admin/merchants${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch merchants");
      return res.json();
    },
  });

  const { data: merchantDetail } = useQuery<any>({
    queryKey: ["/api/admin/merchants", selectedMerchant?.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/merchants/${selectedMerchant.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch merchant");
      return res.json();
    },
    enabled: !!selectedMerchant?.id,
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ merchantId, action }: { merchantId: string; action: "suspend" | "unsuspend" }) => {
      const res = await apiRequest("POST", `/api/admin/merchants/${merchantId}/${action}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Merchant updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const userActionMutation = useMutation({
    mutationFn: async ({ userId, action }: { userId: string; action: "block" | "unblock" | "reset-password" }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/${action}`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "User updated", description: data.tempPassword ? `Temporary password: ${data.tempPassword}` : undefined });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const advanceOnboardingMutation = useMutation({
    mutationFn: async (merchantId: string) => {
      const res = await apiRequest("POST", `/api/admin/merchants/${merchantId}/advance-onboarding`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Onboarding step advanced" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const { data: diagnostics, isLoading: diagnosticsLoading } = useQuery<any>({
    queryKey: ["/api/admin/diagnostics"],
  });

  const WORKFLOW_STATUSES = ["NEW", "PENDING", "HOLD", "READY_TO_SHIP", "FULFILLED", "CANCELLED"];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6" />
        <h1 className="text-2xl font-bold" data-testid="text-admin-title">Admin Panel</h1>
      </div>

      <Card data-testid="card-diagnostics">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4" />
            System Diagnostics
          </CardTitle>
        </CardHeader>
        <CardContent>
          {diagnosticsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : diagnostics ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Orders</p>
                  <p className="text-xl font-bold" data-testid="text-total-orders">{diagnostics.totalOrders}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Unique Shopify Orders</p>
                  <p className="text-xl font-bold" data-testid="text-unique-shopify-orders">{diagnostics.uniqueShopifyOrders}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {diagnostics.duplicates > 0 && <AlertTriangle className="w-3 h-3 text-destructive" />}
                    Duplicates Found
                  </p>
                  <p className={`text-xl font-bold ${diagnostics.duplicates > 0 ? "text-destructive" : ""}`} data-testid="text-duplicates">{diagnostics.duplicates}</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Shopify Connection</p>
                  <div className="flex items-center gap-2" data-testid="text-shopify-status">
                    <Activity className="w-4 h-4" />
                    {diagnostics.shopifyStore ? (
                      <Badge variant={diagnostics.shopifyStore.isConnected ? "secondary" : "destructive"}>
                        {diagnostics.shopifyStore.isConnected ? "Connected" : "Disconnected"}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not configured</Badge>
                    )}
                  </div>
                  {diagnostics.shopifyStore?.shopDomain && (
                    <p className="text-xs text-muted-foreground" data-testid="text-shop-domain">{diagnostics.shopifyStore.shopDomain}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Last Sync</p>
                  <p className="text-sm font-medium" data-testid="text-last-sync">
                    {diagnostics.shopifyStore?.lastSyncAt
                      ? new Date(diagnostics.shopifyStore.lastSyncAt).toLocaleString()
                      : "Never"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Shipments</p>
                  <p className="text-xl font-bold" data-testid="text-total-shipments">{diagnostics.totalShipments}</p>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-2">Orders by Workflow Status</p>
                <div className="flex flex-wrap gap-2">
                  {WORKFLOW_STATUSES.map((status) => (
                    <Badge key={status} variant="outline" data-testid={`badge-workflow-${status.toLowerCase()}`}>
                      {status}: {diagnostics.workflowCounts?.[status] || 0}
                    </Badge>
                  ))}
                </div>
              </div>
              {diagnostics.webhookEvents > 0 && (
                <div className="pt-1">
                  <p className="text-xs text-muted-foreground">
                    Webhook Events: <span className="font-medium" data-testid="text-webhook-events">{diagnostics.webhookEvents}</span>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Failed to load diagnostics</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4" />Merchants</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search by email or name..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" data-testid="input-admin-search" />
              </div>
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-1 max-h-[60vh] overflow-auto">
                  {merchants?.map((m: any) => (
                    <button
                      key={m.id}
                      className={`w-full text-left p-3 rounded-md text-sm hover-elevate transition-colors ${selectedMerchant?.id === m.id ? "bg-accent" : ""}`}
                      onClick={() => setSelectedMerchant(m)}
                      data-testid={`button-merchant-${m.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{m.name}</span>
                        <Badge variant={m.status === "ACTIVE" ? "secondary" : "destructive"} className="text-xs shrink-0">
                          {m.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{m.email}</p>
                    </button>
                  ))}
                  {merchants?.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No merchants found</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {selectedMerchant && merchantDetail ? (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base">{merchantDetail.name}</CardTitle>
                    <Badge variant={merchantDetail.status === "ACTIVE" ? "secondary" : "destructive"}>
                      {merchantDetail.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Email</p>
                      <p className="font-medium">{merchantDetail.email}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Onboarding</p>
                      <Badge variant="outline">{merchantDetail.onboardingStep}</Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Plan</p>
                      <p className="font-medium capitalize">{merchantDetail.subscriptionPlan || "free"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Created</p>
                      <p className="font-medium">{merchantDetail.createdAt ? new Date(merchantDetail.createdAt).toLocaleDateString() : "-"}</p>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex gap-2 flex-wrap">
                    {merchantDetail.status === "ACTIVE" ? (
                      <Button variant="destructive" size="sm" onClick={() => suspendMutation.mutate({ merchantId: merchantDetail.id, action: "suspend" })} disabled={suspendMutation.isPending} data-testid="button-suspend-merchant">
                        <Ban className="w-4 h-4 mr-1" />Suspend
                      </Button>
                    ) : (
                      <Button variant="default" size="sm" onClick={() => suspendMutation.mutate({ merchantId: merchantDetail.id, action: "unsuspend" })} disabled={suspendMutation.isPending} data-testid="button-unsuspend-merchant">
                        <CheckCircle className="w-4 h-4 mr-1" />Unsuspend
                      </Button>
                    )}
                    {merchantDetail.onboardingStep !== "COMPLETED" && (
                      <Button variant="outline" size="sm" onClick={() => advanceOnboardingMutation.mutate(merchantDetail.id)} disabled={advanceOnboardingMutation.isPending} data-testid="button-admin-advance-step">
                        <SkipForward className="w-4 h-4 mr-1" />Advance Onboarding
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" />Users</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {merchantDetail.users?.map((u: any) => (
                      <div key={u.id} className="flex items-center justify-between gap-3 p-3 border rounded-md" data-testid={`admin-user-${u.id}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{u.firstName} {u.lastName}</p>
                            <Badge variant="outline" className="text-xs">{u.role}</Badge>
                            {!u.isActive && <Badge variant="destructive" className="text-xs">Blocked</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {u.isActive ? (
                            <Button variant="ghost" size="icon" onClick={() => userActionMutation.mutate({ userId: u.id, action: "block" })} title="Block user" data-testid={`button-block-user-${u.id}`}>
                              <UserX className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" onClick={() => userActionMutation.mutate({ userId: u.id, action: "unblock" })} title="Unblock user" data-testid={`button-unblock-user-${u.id}`}>
                              <UserCheck className="w-4 h-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => userActionMutation.mutate({ userId: u.id, action: "reset-password" })} title="Reset password" data-testid={`button-reset-password-${u.id}`}>
                            <Key className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {(!merchantDetail.users || merchantDetail.users.length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-16">
                <div className="text-center text-muted-foreground">
                  <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Select a merchant from the list to view details</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
