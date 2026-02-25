import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useRoute, useLocation } from "wouter";
import { Loader2, Users, CheckCircle, XCircle, AlertTriangle, Eye, EyeOff } from "lucide-react";
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

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  const handleSignupAndAccept = async () => {
    if (!token) return;
    setFormError(null);

    if (!firstName.trim()) {
      setFormError("First name is required");
      return;
    }
    if (!password) {
      setFormError("Password is required");
      return;
    }
    if (password.length < 6) {
      setFormError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }

    setAccepting(true);
    try {
      const res = await apiRequest("POST", `/api/team/invite/${token}/accept-with-signup`, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
      });
      const data = await res.json();
      setAccepted(true);
      toast({ title: "Welcome!", description: data.message });
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 2000);
    } catch (err: any) {
      setFormError(err.message || "Failed to create account");
      toast({ title: "Error", description: err.message || "Failed to create account", variant: "destructive" });
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
          <CardHeader className="text-center">
            <div className="w-12 h-12 rounded-md bg-primary flex items-center justify-center mx-auto mb-2">
              <Users className="w-7 h-7 text-primary-foreground" />
            </div>
            <CardTitle data-testid="text-invite-signup-title">Join {inviteData?.merchantName || "the Team"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              You've been invited to join <strong>{inviteData?.merchantName}</strong> as a{" "}
              <Badge variant="secondary" className="ml-1">
                {inviteData?.role?.charAt(0).toUpperCase() + inviteData?.role?.slice(1)}
              </Badge>
            </p>
            <p className="text-sm text-muted-foreground text-center">
              Create your account to get started.
            </p>

            {formError && (
              <div className="p-3 rounded-md bg-destructive/10 text-sm text-destructive" data-testid="text-signup-error">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={inviteData?.email || ""}
                  disabled
                  className="bg-muted"
                  data-testid="input-email-readonly"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    data-testid="input-confirm-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid="button-toggle-confirm-password"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleSignupAndAccept}
              disabled={accepting}
              data-testid="button-create-account"
            >
              {accepting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Account & Join Team
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Already have an account?{" "}
              <a href="/" className="text-primary underline" data-testid="link-login">
                Log in
              </a>{" "}
              and accept from your dashboard.
            </p>
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
