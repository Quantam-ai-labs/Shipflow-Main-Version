import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Copy,
  RotateCw,
  XCircle,
  CheckCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Link as LinkIcon,
  Download,
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

export default function Team() {
  const { toast } = useToast();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [revokeTarget, setRevokeTarget] = useState<Invite | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMemberWithUser | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

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

      if (data.autoJoined) {
        setIsInviteDialogOpen(false);
        setLastInviteUrl(null);
        toast({ title: "Member added", description: "The user already had an account and has been added to your team." });
      } else {
        setLastInviteUrl(data.inviteUrl);
        if (data.emailSent) {
          toast({ title: "Invitation sent", description: `An email has been sent to ${data.invite?.email || 'the invitee'}.` });
        } else {
          toast({ title: "Invitation created", description: data.emailError ? `Email couldn't be sent (${data.emailError}). You can share the link manually.` : "Copy and share the invite link below." });
        }
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
    setLastInviteUrl(null);
    inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  const handleCopyLink = async (invite: Invite) => {
    try {
      const res = await fetch(`/api/team/invite/${invite.id}/link`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to get link");
      }
      const { inviteUrl } = await res.json();
      await navigator.clipboard.writeText(inviteUrl);
      toast({ title: "Link copied", description: "Invite link copied to clipboard." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to copy link.", variant: "destructive" });
    }
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
          <Dialog open={isInviteDialogOpen} onOpenChange={(open) => { setIsInviteDialogOpen(open); if (!open) { setLastInviteUrl(null); setInviteEmail(""); setInviteRole("agent"); } }}>
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
            {lastInviteUrl ? (
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 text-sm text-green-700 dark:text-green-400">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Invitation created successfully!</span>
                </div>
                <div className="space-y-2">
                  <Label>Invite Link</Label>
                  <div className="flex gap-2">
                    <Input value={lastInviteUrl} readOnly className="text-xs" data-testid="input-invite-url" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(lastInviteUrl);
                        toast({ title: "Copied", description: "Invite link copied to clipboard." });
                      }}
                      data-testid="button-copy-new-invite"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Share this link with the invitee. It expires in 7 days.</p>
                </div>
              </div>
            ) : (
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
            )}
            <DialogFooter>
              {lastInviteUrl ? (
                <Button onClick={() => { setIsInviteDialogOpen(false); setLastInviteUrl(null); }}>
                  Done
                </Button>
              ) : (
                <>
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
                </>
              )}
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-member-menu-${member.id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
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
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyLink(invite)}
                      data-testid={`button-copy-invite-${invite.id}`}
                    >
                      <LinkIcon className="w-3 h-3 mr-1" />
                      Copy Link
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
    </div>
  );
}
