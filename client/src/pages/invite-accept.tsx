import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useRoute, useLocation } from "wouter";
import { Loader2, Users, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function InviteAccept() {
  const [, params] = useRoute("/invite/:token");
  const token = params?.token;
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [inviteData, setInviteData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/team/invite/${token}`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Invalid invite");
        }
        return res.json();
      })
      .then((data) => {
        setInviteData(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  const handleAccept = async () => {
    if (!token || !user) return;
    setAccepting(true);
    try {
      const res = await apiRequest("POST", `/api/team/invite/${token}/accept`, {});
      const data = await res.json();
      setAccepted(true);
      toast({ title: "Welcome to the team!", description: data.message });
      setTimeout(() => setLocation("/dashboard"), 2000);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to accept invite", variant: "destructive" });
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <XCircle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-lg font-bold" data-testid="text-invite-error">Invalid Invitation</h2>
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => setLocation("/")} data-testid="button-go-home">
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <h2 className="text-lg font-bold" data-testid="text-invite-accepted">You've Joined the Team!</h2>
            <p className="text-muted-foreground">Redirecting to dashboard...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto" />
            <h2 className="text-lg font-bold">Login Required</h2>
            <p className="text-muted-foreground">
              You need to log in or create an account with the email <strong>{inviteData?.email}</strong> to accept this invitation.
            </p>
            <Button onClick={() => setLocation("/")} data-testid="button-login-to-accept">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-md bg-primary flex items-center justify-center mx-auto mb-2">
            <Users className="w-7 h-7 text-primary-foreground" />
          </div>
          <CardTitle data-testid="text-invite-title">Team Invitation</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            You've been invited to join <strong>{inviteData?.merchantName}</strong> as a team member.
          </p>
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm text-muted-foreground">Role:</span>
            <Badge variant="secondary">{inviteData?.role?.charAt(0).toUpperCase() + inviteData?.role?.slice(1)}</Badge>
          </div>
          {user.email !== inviteData?.email && (
            <div className="p-3 rounded-md bg-destructive/10 text-sm text-destructive">
              This invitation was sent to <strong>{inviteData?.email}</strong>, but you're logged in as <strong>{user.email}</strong>. Please log in with the correct account.
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => setLocation("/")} data-testid="button-decline-invite">
              Decline
            </Button>
            <Button 
              onClick={handleAccept} 
              disabled={accepting || user.email !== inviteData?.email}
              data-testid="button-accept-invite"
            >
              {accepting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Accept Invitation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
