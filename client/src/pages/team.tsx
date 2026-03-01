import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users,
  UserPlus,
  MoreVertical,
  Shield,
  ShieldCheck,
  User,
  Mail,
  Trash2,
  RotateCw,
  XCircle,
  CheckCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Download,
  KeyRound,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { exportCsvWithDate } from "@/lib/exportCsv";
import { formatPkDate } from "@/lib/dateFormat";
import type { User as UserType } from "@shared/models/auth";

interface TeamMemberWithUser {
  id: string;
  userId: string;
  role: string;
  isActive: boolean;
  allowedPages: string[] | null;
  invitedAt: string | null;
  joinedAt: string | null;
  user: UserType;
}

interface TeamResponse {
  members: TeamMemberWithUser[];
  total: number;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  sendCount: number | null;
  lastSentAt: string | null;
  lastEmailError: string | null;
  acceptedAt: string | null;
}

interface PageSection {
  id: string;
  title: string;
  pages: { id: string; title: string }[];
}

const PAGE_SECTIONS: PageSection[] = [
  {
    id: "pipeline",
    title: "Pipeline",
    pages: [
      { id: "orders-new", title: "New Orders" },
      { id: "orders-pending", title: "Confirmation Pending" },
      { id: "orders-hold", title: "Hold" },
      { id: "orders-ready", title: "Ready to Ship" },
      { id: "orders-booked", title: "Booked" },
      { id: "orders-fulfilled", title: "Fulfilled" },
      { id: "orders-delivered", title: "Delivered" },
      { id: "orders-return", title: "Return" },
      { id: "orders-cancelled", title: "Cancelled" },
    ],
  },
  {
    id: "sales",
    title: "Sales",
    pages: [
      { id: "sale-invoices", title: "Sale Invoices" },
      { id: "sale-orders", title: "Sale Orders" },
      { id: "shipments", title: "Shipments" },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    pages: [
      { id: "products", title: "Products" },
      { id: "shopify-products", title: "Shopify Products" },
      { id: "add-stock", title: "Add Stock" },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    pages: [
      { id: "money", title: "Money In/Out" },
      { id: "cod-reconciliation", title: "COD Reconciliation" },
      { id: "payment-ledger", title: "Payment Ledger" },
      { id: "manage-cheques", title: "Manage Cheques" },
      { id: "customers", title: "Parties" },
      { id: "expense-history", title: "Expense History" },
      { id: "needs-payment", title: "Needs Payment" },
      { id: "cod-receivable", title: "COD Receivable" },
      { id: "courier-payable", title: "Courier Payable" },
      { id: "settlements", title: "Settlements" },
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    pages: [
      { id: "overview", title: "Overview" },
      { id: "profit-loss", title: "Profit & Loss" },
      { id: "balance-snapshot", title: "Balance Snapshot" },
      { id: "cash-flow", title: "Cash Flow" },
      { id: "stock-report", title: "Stock Report" },
      { id: "party-balances", title: "Party Balances" },
      { id: "product-analytics", title: "Product Analytics" },
      { id: "analytics-dashboard", title: "Analytics" },
    ],
  },
  {
    id: "ai-assistant",
    title: "AI",
    pages: [
      { id: "ai-hub", title: "AI Hub" },
    ],
  },
  {
    id: "marketing",
    title: "Marketing",
    pages: [
      { id: "ads-dashboard", title: "Ads Dashboard" },
      { id: "ads-manager", title: "Ads Manager" },
      { id: "ads-profitability", title: "Ads Profitability" },
      { id: "ai-intelligence", title: "AI Intelligence" },
      { id: "live-campaigns", title: "Live Campaigns" },
    ],
  },
  {
    id: "accounting-advanced",
    title: "Accounting",
    pages: [
      { id: "ledger", title: "Ledger" },
      { id: "trial-balance", title: "Trial Balance" },
      { id: "cash-accounts", title: "Cash Accounts" },
      { id: "opening-balances", title: "Opening Balances" },
    ],
  },
];

function getRoleBadge(role: string) {
  const roleConfig: Record<string, { color: string; icon: React.ElementType }> = {
    admin: { color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: ShieldCheck },
    manager: { color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Shield },
    agent: { color: "bg-gray-500/10 text-gray-600 border-gray-500/20", icon: User },
  };

  const config = roleConfig[role] || roleConfig.agent;
  const Icon = config.icon;

  return (
    <Badge className={config.color}>
      <Icon className="w-3 h-3 mr-1" />
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </Badge>
  );
}

function getInviteStatusBadge(invite: Invite) {
  if (invite.status === "accepted") {
    return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle className="w-3 h-3 mr-1" />Accepted</Badge>;
  }
  if (invite.status === "revoked") {
    return <Badge className="bg-red-500/10 text-red-600 border-red-500/20"><XCircle className="w-3 h-3 mr-1" />Revoked</Badge>;
  }
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20"><AlertTriangle className="w-3 h-3 mr-1" />Expired</Badge>;
  }
  return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatPkDate(date);
}

function ManageAccessDialog({
  member,
  open,
  onClose,
}: {
  member: TeamMemberWithUser;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const currentPages = member.allowedPages || [];
  const [selected, setSelected] = useState<Set<string>>(new Set(currentPages));

  const allPageIds = PAGE_SECTIONS.flatMap(s => s.pages.map(p => p.id));
  const isAllSelected = allPageIds.every(id => selected.has(id));

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSection = (section: PageSection) => {
    const sectionIds = section.pages.map(p => p.id);
    const allChecked = sectionIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allChecked) {
        sectionIds.forEach(id => next.delete(id));
      } else {
        sectionIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (isAllSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allPageIds));
    }
  };

  const updatePermsMutation = useMutation({
    mutationFn: async (allowedPages: string[] | null) => {
      const res = await apiRequest("PATCH", `/api/team/${member.id}/permissions`, { allowedPages });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({ title: "Permissions updated", description: `Page access updated for ${member.user?.firstName || member.user?.email || "this member"}.` });
      onClose();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update permissions.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (selected.size === 0 || isAllSelected) {
      updatePermsMutation.mutate(null);
    } else {
      updatePermsMutation.mutate(Array.from(selected));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" data-testid="dialog-manage-access">
        <DialogHeader>
          <DialogTitle>Manage Page Access</DialogTitle>
          <DialogDescription>
            Choose which pages <strong>{member.user?.firstName || member.user?.email}</strong> can access. Unchecked pages will be hidden from their sidebar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2 pb-2 border-b">
            <Checkbox
              id="select-all-pages"
              checked={isAllSelected}
              onCheckedChange={toggleAll}
              data-testid="checkbox-select-all-pages"
            />
            <Label htmlFor="select-all-pages" className="text-sm font-medium cursor-pointer">
              All Pages (Full Access)
            </Label>
          </div>
          {PAGE_SECTIONS.map((section) => {
            const sectionIds = section.pages.map(p => p.id);
            const checkedCount = sectionIds.filter(id => selected.has(id)).length;
            const allChecked = checkedCount === sectionIds.length;
            const someChecked = checkedCount > 0 && !allChecked;
            return (
              <div key={section.id}>
                <div className="flex items-center gap-2 mb-2">
                  <Checkbox
                    id={`section-${section.id}`}
                    checked={allChecked}
                    ref={(el) => {
                      if (el) {
                        const input = el as unknown as HTMLButtonElement;
                        input.dataset.indeterminate = someChecked ? "true" : "false";
                      }
                    }}
                    onCheckedChange={() => toggleSection(section)}
                    data-testid={`checkbox-section-${section.id}`}
                  />
                  <Label htmlFor={`section-${section.id}`} className="text-sm font-semibold cursor-pointer">
                    {section.title}
                  </Label>
                  <span className="text-xs text-muted-foreground">({checkedCount}/{sectionIds.length})</span>
                </div>
                <div className="grid grid-cols-2 gap-1 pl-6">
                  {section.pages.map((page) => (
                    <div key={page.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`page-${page.id}`}
                        checked={selected.has(page.id)}
                        onCheckedChange={() => toggle(page.id)}
                        data-testid={`checkbox-page-${page.id}`}
                      />
                      <Label htmlFor={`page-${page.id}`} className="text-sm cursor-pointer">
                        {page.title}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updatePermsMutation.isPending} data-testid="button-save-permissions">
            {updatePermsMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
            ) : (
              "Save Permissions"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Team() {
  const { toast } = useToast();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [revokeTarget, setRevokeTarget] = useState<Invite | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMemberWithUser | null>(null);
  const [accessTarget, setAccessTarget] = useState<TeamMemberWithUser | null>(null);

  const { data, isLoading } = useQuery<TeamResponse>({
    queryKey: ["/api/team"],
  });

  const { data: invitesData } = useQuery<{ invites: Invite[] }>({
    queryKey: ["/api/team/invites"],
  });

  const members = data?.members ?? [];
  const allInvites = invitesData?.invites ?? [];
  const pendingInvites = allInvites.filter((i) => i.status === "pending" && (!i.expiresAt || new Date(i.expiresAt) > new Date()));

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const res = await apiRequest("POST", "/api/team/invite", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team/invites"] });
      setInviteEmail("");
      setInviteRole("agent");
      setIsInviteDialogOpen(false);

      if (data.autoJoined) {
        toast({ title: "Member added", description: "The user already had an account and has been added to your team." });
      } else if (data.emailSent) {
        toast({ title: "Invitation sent", description: `An invitation email has been sent to ${data.invite?.email || 'the invitee'}.` });
      } else {
        toast({ title: "Invitation created", description: data.emailError ? `Email couldn't be sent: ${data.emailError}` : "Invitation created but email could not be sent.", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to send invitation.", variant: "destructive" });
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const res = await apiRequest("POST", `/api/team/invite/${inviteId}/resend`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team/invites"] });
      if (data.success) {
        toast({ title: "Email resent", description: `Invitation email has been resent (attempt #${data.sendCount}).` });
      } else {
        toast({ title: "Email failed", description: data.emailError || "Could not send email. The invite link is still valid.", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to resend.", variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      await apiRequest("DELETE", `/api/team/invite/${inviteId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team/invites"] });
      setRevokeTarget(null);
      toast({ title: "Invitation revoked", description: "The invite link is no longer valid." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to revoke.", variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      return apiRequest("PATCH", `/api/team/${memberId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({ title: "Role updated", description: "The team member's role has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update role.", variant: "destructive" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      return apiRequest("DELETE", `/api/team/${memberId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      setRemoveTarget(null);
      toast({ title: "Member removed", description: "The team member has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove member.", variant: "destructive" });
    },
  });

  const handleInvite = () => {
    if (!inviteEmail.trim()) return;
    inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  const getUserDisplayName = (member: TeamMemberWithUser) => {
    if (member.user?.firstName && member.user?.lastName) {
      return `${member.user.firstName} ${member.user.lastName}`;
    }
    return member.user?.email || "Unknown User";
  };

  const getUserInitials = (member: TeamMemberWithUser) => {
    if (member.user?.firstName && member.user?.lastName) {
      return `${member.user.firstName[0]}${member.user.lastName[0]}`.toUpperCase();
    }
    if (member.user?.email) {
      return member.user.email[0].toUpperCase();
    }
    return "U";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-team-title">Team Management</h1>
          <p className="text-muted-foreground">Manage your team members and their access levels.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => {
              if (members.length === 0) {
                toast({ title: "No data", description: "No team members to export.", variant: "destructive" });
                return;
              }
              const headers = ["Name", "Email", "Role", "Status", "Joined"];
              const rows = members.map(m => [
                getUserDisplayName(m),
                m.user?.email || "",
                m.role,
                m.isActive ? "Active" : "Inactive",
                m.joinedAt ? formatPkDate(m.joinedAt) : "",
              ]);
              exportCsvWithDate("team-members", headers, rows);
              toast({ title: "Export complete", description: `Exported ${members.length} team members.` });
            }}
            data-testid="button-export-team"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Dialog open={isInviteDialogOpen} onOpenChange={(open) => { setIsInviteDialogOpen(open); if (!open) { setInviteEmail(""); setInviteRole("agent"); } }}>
          <DialogTrigger asChild>
            <Button data-testid="button-invite-member">
              <UserPlus className="w-4 h-4 mr-2" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation email to join your team. They'll need to log in with the same email to accept.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
                  data-testid="input-invite-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger data-testid="select-invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Agent - View orders, add remarks
                      </div>
                    </SelectItem>
                    <SelectItem value="manager">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Manager - View analytics, manage operations
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4" />
                        Admin - Full access, manage team
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleInvite} disabled={inviteMutation.isPending || !inviteEmail.trim()} data-testid="button-send-invite">
                {inviteMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</>
                ) : (
                  <><Mail className="w-4 h-4 mr-2" />Send Invitation</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-admin-count">{members.filter((m) => m.role === "admin").length}</p>
              <p className="text-sm text-muted-foreground">Admins</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-manager-count">{members.filter((m) => m.role === "manager").length}</p>
              <p className="text-sm text-muted-foreground">Managers</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gray-500/10 flex items-center justify-center">
              <User className="w-6 h-6 text-gray-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-agent-count">{members.filter((m) => m.role === "agent").length}</p>
              <p className="text-sm text-muted-foreground">Agents</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5" />
            Team Members
            {data?.total !== undefined && (
              <Badge variant="secondary" className="ml-2">
                {data.total} members
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : members.length > 0 ? (
            <div className="space-y-3">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-4 p-4 border rounded-lg hover-elevate" data-testid={`team-member-${member.id}`}>
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={member.user?.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getUserInitials(member)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{getUserDisplayName(member)}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="w-3 h-3" />
                      <span className="truncate">{member.user?.email}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {getRoleBadge(member.role)}
                    {member.role !== "admin" && member.allowedPages && member.allowedPages.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        <KeyRound className="w-3 h-3 mr-1" />
                        {member.allowedPages.length} pages
                      </Badge>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-member-menu-${member.id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {member.role !== "admin" && (
                          <DropdownMenuItem
                            onClick={() => setAccessTarget(member)}
                            data-testid={`button-manage-access-${member.id}`}
                          >
                            <KeyRound className="w-4 h-4 mr-2" />
                            Manage Access
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => updateRoleMutation.mutate({ memberId: member.id, role: "admin" })}>
                          <ShieldCheck className="w-4 h-4 mr-2" />
                          Make Admin
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateRoleMutation.mutate({ memberId: member.id, role: "manager" })}>
                          <Shield className="w-4 h-4 mr-2" />
                          Make Manager
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateRoleMutation.mutate({ memberId: member.id, role: "agent" })}>
                          <User className="w-4 h-4 mr-2" />
                          Make Agent
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setRemoveTarget(member)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove Member
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="font-medium mb-1">No team members yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Invite colleagues to collaborate on your logistics operations.
              </p>
              <Button onClick={() => setIsInviteDialogOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Invite Member
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {pendingInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Pending Invitations
              <Badge variant="secondary">{pendingInvites.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="flex items-center gap-4 p-4 border rounded-md" data-testid={`pending-invite-${invite.id}`}>
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium" data-testid={`text-invite-email-${invite.id}`}>{invite.email}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>Invited as {invite.role}</span>
                      <span>·</span>
                      <span>Expires {formatPkDate(invite.expiresAt)}</span>
                      {invite.sendCount && invite.sendCount > 0 && (
                        <>
                          <span>·</span>
                          <span>Sent {invite.sendCount}x</span>
                        </>
                      )}
                      {invite.lastSentAt && (
                        <>
                          <span>·</span>
                          <span>Last sent {timeAgo(invite.lastSentAt)}</span>
                        </>
                      )}
                      {invite.lastEmailError && (
                        <>
                          <span>·</span>
                          <span className="text-destructive">Email failed</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                    {getRoleBadge(invite.role)}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => resendMutation.mutate(invite.id)}
                      disabled={resendMutation.isPending}
                      data-testid={`button-resend-invite-${invite.id}`}
                    >
                      {resendMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCw className="w-3 h-3 mr-1" />}
                      Resend
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRevokeTarget(invite)}
                      data-testid={`button-revoke-invite-${invite.id}`}
                    >
                      <XCircle className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the invitation to <strong>{revokeTarget?.email}</strong>? The invite link will no longer work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-revoke"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{removeTarget ? getUserDisplayName(removeTarget) : ''}</strong> from the team? They will lose access to all team resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeTarget && removeMemberMutation.mutate(removeTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-remove"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {accessTarget && (
        <ManageAccessDialog
          member={accessTarget}
          open={!!accessTarget}
          onClose={() => setAccessTarget(null)}
        />
      )}
    </div>
  );
}
