import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Shield, Search, Ban, CheckCircle, UserX, UserCheck, SkipForward,
  Loader2, Building2, Users, Database, Activity, AlertTriangle, Eye,
  TrendingUp, Package, ShoppingCart, Truck, Server,
  BarChart3, ClipboardList, Crown, ArrowLeft, HardDrive, Cpu,
  Clock, Zap, Globe, ChevronRight, LogOut, Plus, Trash2, ExternalLink,
  PenLine, KeyRound,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient as globalQueryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { formatPkShortDate, formatPkDateTime } from "@/lib/dateFormat";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"];

function formatDate(d: string | Date | null) {
  if (!d) return "—";
  return formatPkShortDate(d);
}

function formatDateTime(d: string | Date | null) {
  if (!d) return "—";
  return formatPkDateTime(d);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function StatCard({ label, value, icon: Icon, sub, color }: { label: string; value: string | number; icon: any; sub?: string; color?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className={`text-2xl font-bold ${color || ""}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── DASHBOARD TAB ───
function DashboardTab() {
  const { data: stats, isLoading } = useQuery<any>({ queryKey: ["/api/admin/platform-stats"] });
  const { data: health } = useQuery<any>({ queryKey: ["/api/admin/health"] });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  if (!stats) return <p className="text-muted-foreground text-center py-8">Failed to load platform stats.</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="stats-grid">
        <StatCard label="Merchants" value={stats.totalMerchants} icon={Building2} sub={`${stats.activeMerchants} active, ${stats.suspendedMerchants} suspended`} />
        <StatCard label="Users" value={stats.totalUsers} icon={Users} sub={`${stats.activeUsers} active`} />
        <StatCard label="Orders" value={stats.totalOrders?.toLocaleString()} icon={ShoppingCart} sub={`+${stats.newOrders30d} last 30d`} />
        <StatCard label="Shipments" value={stats.totalShipments?.toLocaleString()} icon={Truck} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="New Merchants (30d)" value={stats.newMerchants30d} icon={TrendingUp} color="text-green-600" />
        <StatCard label="DB Latency" value={health ? `${health.dbLatencyMs}ms` : "—"} icon={Zap} color={health?.dbLatencyMs > 100 ? "text-destructive" : "text-green-600"} />
        <StatCard label="DB Size" value={health?.dbSize || "—"} icon={HardDrive} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Crown className="w-4 h-4" />Subscription Plans</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.planBreakdown?.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={stats.planBreakdown} dataKey="count" nameKey="plan" cx="50%" cy="50%" outerRadius={70} label={({ plan, count }: any) => `${plan}: ${count}`}>
                    {stats.planBreakdown.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-8">No data</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4" />Onboarding Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.onboardingBreakdown?.map((item: any) => (
                <div key={item.step} className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">{item.step}</Badge>
                  <span className="text-sm font-medium">{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4" />Top Merchants by Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.topMerchants?.map((m: any, i: number) => (
                <div key={m.id} className="flex items-center justify-between gap-2 py-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                    <span className="text-sm font-medium truncate">{m.name}</span>
                    <Badge variant={m.status === "ACTIVE" ? "secondary" : "destructive"} className="text-[10px] shrink-0">{m.status}</Badge>
                  </div>
                  <span className="text-sm font-bold shrink-0">{m.order_count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4" />Recent Signups</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentSignups?.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between gap-2 py-1">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{formatDate(m.created_at)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── MERCHANTS TAB ───
function MerchantsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [peekId, setPeekId] = useState<string | null>(null);
  const [subDialog, setSubDialog] = useState<{ merchant: any; plan: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    merchantName: "", email: "", firstName: "", lastName: "", phone: "", city: "", subscriptionPlan: "free", skipOnboarding: false,
  });

  const { data: merchantList = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/merchants", search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/admin/merchants${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: peekData, isLoading: peekLoading } = useQuery<any>({
    queryKey: ["/api/admin/merchants", peekId, "peek"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/merchants/${peekId}/peek`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to peek");
      return res.json();
    },
    enabled: !!peekId,
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ merchantId, action }: { merchantId: string; action: "suspend" | "unsuspend" }) => {
      const res = await apiRequest("POST", `/api/admin/merchants/${merchantId}/${action}`);
      return res.json();
    },
    onSuccess: () => { toast({ title: "Merchant updated" }); queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] }); },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });


  const advanceOnboardingMutation = useMutation({
    mutationFn: async (merchantId: string) => {
      const res = await apiRequest("POST", `/api/admin/merchants/${merchantId}/advance-onboarding`);
      return res.json();
    },
    onSuccess: () => { toast({ title: "Onboarding advanced" }); queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] }); },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const subMutation = useMutation({
    mutationFn: async ({ id, plan }: { id: string; plan: string }) => {
      const res = await apiRequest("PUT", `/api/admin/merchants/${id}/subscription`, { plan });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Subscription updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-stats"] });
      setSubDialog(null);
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const userActionMutation = useMutation({
    mutationFn: async ({ userId, action }: { userId: string; action: "block" | "unblock" }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/${action}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const createMerchantMutation = useMutation({
    mutationFn: async (data: typeof createForm) => {
      const res = await apiRequest("POST", "/api/admin/merchants/create", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Merchant Created", description: data.message, duration: 8000 });
      if (!data.emailSent && data.emailError) {
        toast({ title: "Email Failed", description: `Setup invite email could not be sent: ${data.emailError}`, variant: "destructive", duration: 12000 });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-stats"] });
      setCreateOpen(false);
      setCreateForm({ merchantName: "", email: "", firstName: "", lastName: "", phone: "", city: "", subscriptionPlan: "free", skipOnboarding: false });
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  if (peekId && peekData) {
    const m = peekData.merchant;
    const os = peekData.orderStats || {};
    const ps = peekData.productStats || {};
    const as2 = peekData.accountingStats || {};
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setPeekId(null)} className="mb-2" data-testid="button-back-merchants">
          <ArrowLeft className="w-4 h-4 mr-2" />Back to Merchants
        </Button>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2" data-testid="text-peek-merchant-name">
              <Eye className="w-5 h-5" />{m.name}
            </h2>
            <p className="text-sm text-muted-foreground">{m.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={m.status === "ACTIVE" ? "secondary" : "destructive"}>{m.status}</Badge>
            <Badge variant="outline" className="capitalize">{m.subscriptionPlan || "free"}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Orders" value={os.total || 0} icon={ShoppingCart} />
          <StatCard label="Delivered" value={os.delivered || 0} icon={CheckCircle} color="text-green-600" />
          <StatCard label="Revenue" value={`Rs. ${parseInt(os.revenue || "0").toLocaleString()}`} icon={TrendingUp} />
          <StatCard label="Returns" value={os.returned || 0} icon={AlertTriangle} color="text-orange-600" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Products" value={ps.total || 0} icon={Package} sub={`${ps.active_count || 0} active, ${ps.total_stock || 0} stock`} />
          <StatCard label="Parties" value={as2.total_parties || 0} icon={Users} />
          <StatCard label="Sales" value={as2.total_sales || 0} icon={ShoppingCart} />
          <StatCard label="Stock Receipts" value={as2.total_receipts || 0} icon={Package} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Shopify Connection</CardTitle></CardHeader>
            <CardContent>
              {peekData.shopify ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Store</span><span className="font-medium">{peekData.shopify.shopDomain}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Status</span>
                    <Badge variant={peekData.shopify.isConnected ? "secondary" : "destructive"}>{peekData.shopify.isConnected ? "Connected" : "Disconnected"}</Badge>
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Last Sync</span><span>{formatDateTime(peekData.shopify.lastSyncAt)}</span></div>
                </div>
              ) : <p className="text-sm text-muted-foreground">Not connected</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Courier Accounts</CardTitle></CardHeader>
            <CardContent>
              {peekData.couriers?.length > 0 ? (
                <div className="space-y-2">
                  {peekData.couriers.map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">{c.courierName}</span>
                      <Badge variant={c.isActive ? "secondary" : "outline"}>{c.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">No couriers configured</p>}
            </CardContent>
          </Card>
        </div>

        <PeekTeamSection merchantId={peekId!} users={peekData.users || []} />

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShoppingCart className="w-4 h-4" />Recent Orders</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {peekData.recentOrders?.map((o: any) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.order_number || o.id.slice(0, 8)}</TableCell>
                    <TableCell>{o.customer_name || "—"}</TableCell>
                    <TableCell>Rs. {parseInt(o.total_amount || "0").toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{o.workflow_status}</Badge></TableCell>
                    <TableCell className="text-xs">{formatDate(o.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex gap-2 pt-2">
          {m.status === "ACTIVE" ? (
            <Button variant="destructive" size="sm" onClick={() => suspendMutation.mutate({ merchantId: m.id, action: "suspend" })}><Ban className="w-4 h-4 mr-1" />Suspend</Button>
          ) : (
            <Button size="sm" onClick={() => suspendMutation.mutate({ merchantId: m.id, action: "unsuspend" })}><CheckCircle className="w-4 h-4 mr-1" />Unsuspend</Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setSubDialog({ merchant: m, plan: m.subscriptionPlan || "free" })}>
            <Crown className="w-4 h-4 mr-1" />Change Plan
          </Button>
          {m.onboardingStep !== "COMPLETED" && (
            <Button variant="outline" size="sm" onClick={() => advanceOnboardingMutation.mutate(m.id)}><SkipForward className="w-4 h-4 mr-1" />Advance Onboarding</Button>
          )}
        </div>


        <Dialog open={!!subDialog} onOpenChange={(open) => !open && setSubDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Subscription</DialogTitle>
              <DialogDescription>Update the subscription plan for {subDialog?.merchant?.name}.</DialogDescription>
            </DialogHeader>
            <Select value={subDialog?.plan || "free"} onValueChange={(v) => subDialog && setSubDialog({ ...subDialog, plan: v })}>
              <SelectTrigger data-testid="select-plan"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSubDialog(null)}>Cancel</Button>
              <Button onClick={() => subDialog && subMutation.mutate({ id: subDialog.merchant.id, plan: subDialog.plan })} disabled={subMutation.isPending}>
                {subMutation.isPending ? "Saving..." : "Update Plan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search merchants by name or email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" data-testid="input-admin-search" />
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-create-merchant">
          <Plus className="w-4 h-4 mr-2" />Add Merchant
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table data-testid="table-merchants">
              <TableHeader>
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Onboarding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {merchantList.map((m: any) => (
                  <TableRow key={m.id} data-testid={`row-merchant-${m.id}`}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-sm">{m.email}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs capitalize">{m.subscriptionPlan || "free"}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{m.onboardingStep}</Badge></TableCell>
                    <TableCell><Badge variant={m.status === "ACTIVE" ? "secondary" : "destructive"} className="text-xs">{m.status}</Badge></TableCell>
                    <TableCell className="text-xs">{formatDate(m.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setPeekId(m.id)} data-testid={`button-peek-${m.id}`}><Eye className="w-4 h-4" /></Button>
                        {m.status === "ACTIVE" ? (
                          <Button size="sm" variant="ghost" onClick={() => suspendMutation.mutate({ merchantId: m.id, action: "suspend" })}><Ban className="w-4 h-4 text-destructive" /></Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => suspendMutation.mutate({ merchantId: m.id, action: "unsuspend" })}><CheckCircle className="w-4 h-4 text-green-600" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {merchantList.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No merchants found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}


      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) setCreateOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5" />Add New Merchant</DialogTitle>
            <DialogDescription>Create a new merchant account with an admin user.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createMerchantMutation.mutate(createForm); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cm-business">Business Name *</Label>
              <Input id="cm-business" data-testid="input-create-merchant-name" placeholder="e.g. My Store" value={createForm.merchantName} onChange={(e) => setCreateForm({ ...createForm, merchantName: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cm-first">First Name *</Label>
                <Input id="cm-first" data-testid="input-create-first-name" placeholder="First name" value={createForm.firstName} onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cm-last">Last Name</Label>
                <Input id="cm-last" data-testid="input-create-last-name" placeholder="Last name" value={createForm.lastName} onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cm-email">Email *</Label>
              <Input id="cm-email" data-testid="input-create-email" type="email" placeholder="merchant@example.com" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />
            </div>
            <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">A setup invite email will be sent to the merchant so they can set their own password.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cm-phone">Phone</Label>
                <Input id="cm-phone" data-testid="input-create-phone" placeholder="03XX-XXXXXXX" value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cm-city">City</Label>
                <Input id="cm-city" data-testid="input-create-city" placeholder="e.g. Karachi" value={createForm.city} onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Subscription Plan</Label>
              <Select value={createForm.subscriptionPlan} onValueChange={(v) => setCreateForm({ ...createForm, subscriptionPlan: v })}>
                <SelectTrigger data-testid="select-create-plan"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="cm-skip" data-testid="checkbox-skip-onboarding" checked={createForm.skipOnboarding} onCheckedChange={(v) => setCreateForm({ ...createForm, skipOnboarding: !!v })} />
              <Label htmlFor="cm-skip" className="text-sm font-normal cursor-pointer">Skip onboarding wizard</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMerchantMutation.isPending} data-testid="button-submit-create-merchant">
                {createMerchantMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Merchant
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── ANALYTICS TAB ───
function AnalyticsTab() {
  const { data: trends, isLoading } = useQuery<any>({ queryKey: ["/api/admin/analytics/trends"] });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  if (!trends) return <p className="text-muted-foreground text-center py-8">Failed to load analytics.</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4" />Daily Signups (30 days)</CardTitle></CardHeader>
          <CardContent>
            {trends.dailySignups?.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={trends.dailySignups}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => formatPkShortDate(v)} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip labelFormatter={(v: string) => formatPkShortDate(v)} />
                  <Bar dataKey="count" fill="#3b82f6" name="Signups" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-8">No signups in the last 30 days</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShoppingCart className="w-4 h-4" />Daily Orders (30 days)</CardTitle></CardHeader>
          <CardContent>
            {trends.dailyOrders?.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={trends.dailyOrders}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => formatPkShortDate(v)} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip labelFormatter={(v: string) => formatPkShortDate(v)} />
                  <Line type="monotone" dataKey="count" stroke="#10b981" name="Orders" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-8">No orders in the last 30 days</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" />Order Status Breakdown</CardTitle></CardHeader>
          <CardContent>
            {trends.workflowBreakdown?.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={trends.workflowBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="status" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8b5cf6" name="Orders" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-8">No orders</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Truck className="w-4 h-4" />Courier Usage</CardTitle></CardHeader>
          <CardContent>
            {trends.courierUsage?.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={trends.courierUsage} dataKey="count" nameKey="courier" cx="50%" cy="50%" outerRadius={80}
                    label={({ courier, count }: any) => `${courier}: ${count}`}>
                    {trends.courierUsage.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-8">No shipments</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Globe className="w-4 h-4" />Merchants by City</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {trends.merchantsByCity?.map((item: any) => (
              <div key={item.city} className="p-3 border rounded-lg text-center">
                <p className="text-lg font-bold">{item.count}</p>
                <p className="text-xs text-muted-foreground">{item.city}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── PEEK TEAM SECTION ───
function PeekTeamSection({ merchantId, users: initialUsers }: { merchantId: string; users: any[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ email: "", firstName: "", lastName: "", role: "agent" });
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [removeConfirm, setRemoveConfirm] = useState<any>(null);

  const { data: teamData } = useQuery<any>({
    queryKey: ["/api/admin/merchants", merchantId, "team"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/merchants/${merchantId}/team`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch team");
      return res.json();
    },
  });

  const members = teamData?.members || initialUsers.map((u: any) => ({
    id: u.teamMemberId || u.id,
    userId: u.id,
    role: u.teamRole || "agent",
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    userIsActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    isMerchantOwner: u.isMerchantOwner || false,
  }));

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/impersonate/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      globalQueryClient.clear();
      globalQueryClient.invalidateQueries();
      setLocation("/dashboard");
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/team-members/${memberId}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Role updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants", merchantId, "team"] });
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/team-members/${memberId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Member removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants", merchantId, "team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      setRemoveConfirm(null);
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User account deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants", merchantId, "team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setDeleteConfirm(null);
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const addMemberMutation = useMutation({
    mutationFn: async (data: typeof addForm) => {
      const res = await apiRequest("POST", `/api/admin/merchants/${merchantId}/team/add`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Member added" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants", merchantId, "team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      setAddOpen(false);
      setAddForm({ email: "", firstName: "", lastName: "", role: "agent" });
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const userActionMutation = useMutation({
    mutationFn: async ({ userId, action }: { userId: string; action: "block" | "unblock" }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/${action}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants", merchantId, "team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" />Team Members</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} data-testid="button-add-team-member">
              <Plus className="w-3 h-3 mr-1" />Add Member
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {members.map((m: any) => (
              <div key={m.id || m.userId} className="flex items-center justify-between gap-3 p-3 border rounded-md" data-testid={`row-team-member-${m.userId}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{m.firstName} {m.lastName}</p>
                    {m.isMerchantOwner && <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">Owner</Badge>}
                    <Badge variant="outline" className="text-xs capitalize">{m.role}</Badge>
                    {m.userIsActive === false && <Badge variant="destructive" className="text-xs">Blocked</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{m.email} · Last login: {formatDateTime(m.lastLoginAt)}</p>
                </div>
                <div className="flex gap-1 shrink-0 items-center">
                  <Select value={m.role} onValueChange={(role) => changeRoleMutation.mutate({ memberId: m.id, role })}>
                    <SelectTrigger className="h-7 w-[100px] text-xs" data-testid={`select-role-${m.userId}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="agent">Agent</SelectItem>
                      <SelectItem value="accountant">Accountant</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => impersonateMutation.mutate(m.userId)} title="Open Account" data-testid={`button-impersonate-${m.userId}`}>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                  {m.userIsActive !== false ? (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => userActionMutation.mutate({ userId: m.userId, action: "block" })} title="Block">
                      <UserX className="w-3.5 h-3.5" />
                    </Button>
                  ) : (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => userActionMutation.mutate({ userId: m.userId, action: "unblock" })} title="Unblock">
                      <UserCheck className="w-3.5 h-3.5 text-green-600" />
                    </Button>
                  )}
                  {!m.isMerchantOwner && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRemoveConfirm(m)} title="Remove from team">
                      <UserX className="w-3.5 h-3.5 text-orange-500" />
                    </Button>
                  )}
                  {!m.isMerchantOwner && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteConfirm(m)} title="Delete account permanently">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {members.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No team members found</p>}
          </div>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) setAddOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>Add a new member to this merchant's team.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addMemberMutation.mutate(addForm); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input data-testid="input-add-member-email" type="email" placeholder="user@example.com" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input data-testid="input-add-member-first" placeholder="First" value={addForm.firstName} onChange={(e) => setAddForm({ ...addForm, firstName: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input data-testid="input-add-member-last" placeholder="Last" value={addForm.lastName} onChange={(e) => setAddForm({ ...addForm, lastName: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={addForm.role} onValueChange={(v) => setAddForm({ ...addForm, role: v })}>
                <SelectTrigger data-testid="select-add-member-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="accountant">Accountant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addMemberMutation.isPending} data-testid="button-submit-add-member">
                {addMemberMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add Member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeConfirm} onOpenChange={(open) => { if (!open) setRemoveConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{removeConfirm?.firstName} {removeConfirm?.lastName}</strong> ({removeConfirm?.email}) from this merchant's team? Their user account will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeConfirm && removeMemberMutation.mutate(removeConfirm.id)} className="bg-orange-600 hover:bg-orange-700">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete User Account</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteConfirm?.firstName} {deleteConfirm?.lastName}</strong> ({deleteConfirm?.email}) and remove them from all teams. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirm && deleteUserMutation.mutate(deleteConfirm.userId)} className="bg-destructive hover:bg-destructive/90">Delete Permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── USERS TAB ───
function UsersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);

  const { data: userList = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/users", search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/admin/users${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const userActionMutation = useMutation({
    mutationFn: async ({ userId, action }: { userId: string; action: "block" | "unblock" }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/${action}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/impersonate/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      globalQueryClient.clear();
      globalQueryClient.invalidateQueries();
      setLocation("/dashboard");
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User account deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setDeleteConfirm(null);
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search users by name or email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" data-testid="input-users-search" />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table data-testid="table-users">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userList.map((u: any) => (
                  <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                    <TableCell className="font-medium">{u.firstName} {u.lastName || ""}</TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell className="text-sm">
                      {u.merchantName ? (
                        <div className="flex items-center gap-1">
                          <span className="truncate max-w-[120px]">{u.merchantName}</span>
                          {u.merchantStatus === "SUSPENDED" && <Badge variant="destructive" className="text-[10px]">Suspended</Badge>}
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell><Badge variant={u.role === "SUPER_ADMIN" ? "default" : "outline"} className="text-xs">{u.role}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? "secondary" : "destructive"} className="text-xs">{u.isActive ? "Active" : "Blocked"}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{formatDateTime(u.lastLoginAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {u.role !== "SUPER_ADMIN" && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => impersonateMutation.mutate(u.id)} title="Open Account" data-testid={`button-impersonate-user-${u.id}`}>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {u.isActive ? (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => userActionMutation.mutate({ userId: u.id, action: "block" })} title="Block">
                            <UserX className="w-3.5 h-3.5" />
                          </Button>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => userActionMutation.mutate({ userId: u.id, action: "unblock" })} title="Unblock">
                            <UserCheck className="w-3.5 h-3.5 text-green-600" />
                          </Button>
                        )}
                        {u.role !== "SUPER_ADMIN" && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteConfirm(u)} title="Delete account" data-testid={`button-delete-user-${u.id}`}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {userList.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete User Account</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteConfirm?.firstName} {deleteConfirm?.lastName}</strong> ({deleteConfirm?.email}) and remove them from all teams. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirm && deleteUserMutation.mutate(deleteConfirm.id)} className="bg-destructive hover:bg-destructive/90">Delete Permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── HEALTH TAB ───
function HealthTab() {
  const { data: health, isLoading } = useQuery<any>({ queryKey: ["/api/admin/health"], refetchInterval: 15000 });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  if (!health) return <p className="text-muted-foreground text-center py-8">Failed to load health data.</p>;

  const mem = health.memoryUsage || {};
  const ts = health.tableStats || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="DB Latency" value={`${health.dbLatencyMs}ms`} icon={Zap} color={health.dbLatencyMs > 100 ? "text-destructive" : "text-green-600"} />
        <StatCard label="DB Size" value={health.dbSize} icon={HardDrive} />
        <StatCard label="Uptime" value={`${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m`} icon={Clock} />
        <StatCard label="Node.js" value={health.nodeVersion} icon={Cpu} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Server className="w-4 h-4" />Memory Usage</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">RSS</span><span className="font-medium">{formatBytes(mem.rss || 0)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Heap Total</span><span className="font-medium">{formatBytes(mem.heapTotal || 0)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Heap Used</span><span className="font-medium">{formatBytes(mem.heapUsed || 0)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">External</span><span className="font-medium">{formatBytes(mem.external || 0)}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Database className="w-4 h-4" />Table Row Counts</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span>Orders</span><span className="font-bold">{ts.orders?.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span>Shipments</span><span className="font-bold">{ts.shipments?.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span>Merchants</span><span className="font-bold">{ts.merchants?.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span>Users</span><span className="font-bold">{ts.users?.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span>Products</span><span className="font-bold">{ts.products?.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span>Sales</span><span className="font-bold">{ts.sales?.toLocaleString()}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Database className="w-4 h-4" />Largest Tables</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead className="text-right">Rows</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.largeTables?.map((t: any) => (
                <TableRow key={t.table_name}>
                  <TableCell className="font-mono text-sm">{t.table_name}</TableCell>
                  <TableCell className="text-right font-medium">{t.row_count?.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── AUDIT LOG TAB ───
function AuditLogTab() {
  const [filter, setFilter] = useState<string>("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/audit-log", filter],
    queryFn: async () => {
      const params = filter ? `?actionType=${encodeURIComponent(filter)}&limit=200` : "?limit=200";
      const res = await fetch(`/api/admin/audit-log${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const actionTypes = ["SUSPEND_MERCHANT", "UNSUSPEND_MERCHANT", "DELETE_MERCHANT", "BLOCK_USER", "UNBLOCK_USER",
    "RESET_PASSWORD", "ADVANCE_ONBOARDING", "UPDATE_SUBSCRIPTION", "PEEK_MERCHANT",
    "IMPERSONATE_USER", "STOP_IMPERSONATION", "ADD_TEAM_MEMBER", "REMOVE_TEAM_MEMBER", "CHANGE_TEAM_ROLE", "CHANGE_PERMISSIONS", "DELETE_USER"];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={filter || "all"} onValueChange={(v) => setFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[200px]" data-testid="select-audit-filter"><SelectValue placeholder="All actions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {actionTypes.map(a => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        {data && <Badge variant="secondary">{data.total} total entries</Badge>}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table data-testid="table-audit-log">
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Target Merchant</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.logs?.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell><Badge variant="outline" className="text-xs">{log.actionType?.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-sm">{log.adminName || log.adminEmail || log.adminUserId?.slice(0, 8)}</TableCell>
                    <TableCell className="text-sm">{log.merchantName || log.targetMerchantId?.slice(0, 8) || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{log.details}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(log.createdAt)}</TableCell>
                  </TableRow>
                ))}
                {(!data?.logs || data.logs.length === 0) && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No audit log entries</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── MAIN ADMIN PANEL ───
export default function AdminPanel() {
  const { user } = useAuth();

  if (user?.role !== "SUPER_ADMIN") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield className="w-16 h-16 mx-auto text-muted-foreground/50" />
          <h2 className="text-xl font-bold" data-testid="text-admin-denied">Access Denied</h2>
          <p className="text-muted-foreground">Only super administrators can access this page.</p>
          <Link href="/dashboard"><Button variant="outline">Go to Dashboard</Button></Link>
        </div>
      </div>
    );
  }

  const { logout } = useAuth();
  const [, setLocation] = useLocation();

  const handleAdminLogout = () => {
    logout();
    setLocation("/admin-login");
  };

  return (
    <div className="space-y-6" data-testid="admin-panel">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-admin-title">Control Room</h1>
            <p className="text-sm text-muted-foreground">Platform-wide administration and monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={handleAdminLogout} data-testid="button-admin-logout">
            <LogOut className="w-4 h-4 mr-1" />Sign Out
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid w-full grid-cols-6" data-testid="admin-tabs">
          <TabsTrigger value="dashboard" data-testid="tab-dashboard" className="text-xs sm:text-sm">
            <Activity className="w-4 h-4 mr-1 hidden sm:inline" />Dashboard
          </TabsTrigger>
          <TabsTrigger value="merchants" data-testid="tab-merchants" className="text-xs sm:text-sm">
            <Building2 className="w-4 h-4 mr-1 hidden sm:inline" />Merchants
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users" className="text-xs sm:text-sm">
            <Users className="w-4 h-4 mr-1 hidden sm:inline" />Users
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics" className="text-xs sm:text-sm">
            <BarChart3 className="w-4 h-4 mr-1 hidden sm:inline" />Analytics
          </TabsTrigger>
          <TabsTrigger value="health" data-testid="tab-health" className="text-xs sm:text-sm">
            <Server className="w-4 h-4 mr-1 hidden sm:inline" />Health
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit" className="text-xs sm:text-sm">
            <ClipboardList className="w-4 h-4 mr-1 hidden sm:inline" />Audit Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6"><DashboardTab /></TabsContent>
        <TabsContent value="merchants" className="mt-6"><MerchantsTab /></TabsContent>
        <TabsContent value="users" className="mt-6"><UsersTab /></TabsContent>
        <TabsContent value="analytics" className="mt-6"><AnalyticsTab /></TabsContent>
        <TabsContent value="health" className="mt-6"><HealthTab /></TabsContent>
        <TabsContent value="audit" className="mt-6"><AuditLogTab /></TabsContent>
      </Tabs>
    </div>
  );
}
