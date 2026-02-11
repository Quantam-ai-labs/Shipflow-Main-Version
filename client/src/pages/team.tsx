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
  Users,
  UserPlus,
  MoreVertical,
  Shield,
  ShieldCheck,
  User,
  Mail,
  Trash2,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
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

export default function Team() {
  const { toast } = useToast();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");

  const { data, isLoading } = useQuery<TeamResponse>({
    queryKey: ["/api/team"],
  });

  const { data: pendingInvites } = useQuery<{ invites: any[] }>({
    queryKey: ["/api/team/invites"],
  });

  const members = data?.members ?? [];

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const res = await apiRequest("POST", "/api/team/invite", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team/invites"] });
      setIsInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("agent");

      if (data.autoJoined) {
        toast({
          title: "Member added",
          description: "The user has been added to your team.",
        });
      } else {
        toast({
          title: "Invitation created",
          description: "Share the invite link with the new team member.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      return apiRequest("PATCH", `/api/team/${memberId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({
        title: "Role updated",
        description: "The team member's role has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update role. Please try again.",
        variant: "destructive",
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      return apiRequest("DELETE", `/api/team/${memberId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({
        title: "Member removed",
        description: "The team member has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove member. Please try again.",
        variant: "destructive",
      });
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Team Management</h1>
          <p className="text-muted-foreground">Manage your team members and their access levels.</p>
        </div>
        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
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
                Send an invitation to join your team. They'll receive access once they log in.
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
                {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Role Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{members.filter((m) => m.role === "admin").length}</p>
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
              <p className="text-2xl font-bold">{members.filter((m) => m.role === "manager").length}</p>
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
              <p className="text-2xl font-bold">{members.filter((m) => m.role === "agent").length}</p>
              <p className="text-sm text-muted-foreground">Agents</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team Members List */}
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
                  <div className="flex items-center gap-3">
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
                          onClick={() => removeMemberMutation.mutate(member.id)}
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

      {pendingInvites?.invites && pendingInvites.invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Pending Invitations
              <Badge variant="secondary">{pendingInvites.invites.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingInvites.invites.map((invite: any) => (
                <div key={invite.id} className="flex items-center gap-4 p-4 border rounded-md" data-testid={`pending-invite-${invite.id}`}>
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Mail className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{invite.email}</p>
                    <p className="text-sm text-muted-foreground">
                      Invited as {invite.role} · Expires {new Date(invite.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {getRoleBadge(invite.role)}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const url = `${window.location.origin}/invite/${invite.token}`;
                        navigator.clipboard.writeText(url);
                        toast({ title: "Link copied", description: "Invite link copied to clipboard." });
                      }}
                      data-testid={`button-copy-invite-${invite.id}`}
                    >
                      Copy Link
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
