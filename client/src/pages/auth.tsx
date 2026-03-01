import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Package, Loader2, ArrowLeft, Mail, Lock, KeyRound } from "lucide-react";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [loginStep, setLoginStep] = useState<"credentials" | "otp">("credentials");
  const [forgotStep, setForgotStep] = useState<"email" | "reset">("email");
  const { sendOtp, isSendingOtp, verifyOtp, isVerifyingOtp, register, isRegistering } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSendOtp = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const data = await sendOtp({ email, password });
      toast({ title: "Code Sent", description: data.message || "Verification code sent to your email." });
      setLoginStep("otp");
      setOtp("");
      setCooldown(60);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send verification code.", variant: "destructive" });
    }
  }, [email, password, sendOtp, toast]);

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast({ title: "Name Required", description: "Please enter your name for session tracking.", variant: "destructive" });
      return;
    }
    try {
      await verifyOtp({ email, otp, displayName: displayName.trim() });
    } catch (err: any) {
      toast({ title: "Verification Failed", description: err.message || "Invalid verification code.", variant: "destructive" });
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Weak Password", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Password Mismatch", description: "Passwords do not match.", variant: "destructive" });
      return;
    }
    try {
      await register({ email, password, firstName, lastName, merchantName });
    } catch (err: any) {
      toast({ title: "Registration Failed", description: err.message || "Could not create account.", variant: "destructive" });
    }
  };

  const handleForgotSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingReset(true);
    try {
      const res = await apiRequest("POST", "/api/auth/forgot-password/send-otp", { email });
      const data = await res.json();
      toast({ title: "Code Sent", description: data.message });
      setForgotStep("reset");
      setOtp("");
      setCooldown(60);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send reset code.", variant: "destructive" });
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ title: "Weak Password", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: "Password Mismatch", description: "Passwords do not match.", variant: "destructive" });
      return;
    }
    setIsResetting(true);
    try {
      const res = await apiRequest("POST", "/api/auth/forgot-password/reset", { email, otp, newPassword });
      const data = await res.json();
      toast({ title: "Password Reset", description: data.message });
      setMode("login");
      setLoginStep("credentials");
      setPassword("");
      setOtp("");
      setNewPassword("");
      setConfirmNewPassword("");
      setForgotStep("email");
    } catch (err: any) {
      toast({ title: "Reset Failed", description: err.message || "Could not reset password.", variant: "destructive" });
    } finally {
      setIsResetting(false);
    }
  };

  const getTitle = () => {
    if (mode === "login") {
      return loginStep === "credentials" ? "Sign in to your account" : "Verify & Identify";
    }
    if (mode === "forgot") {
      return forgotStep === "email" ? "Reset your password" : "Set new password";
    }
    return "Create your account";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-md bg-primary flex items-center justify-center mx-auto">
            <Package className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold" data-testid="text-app-title">1SOL.AI</h1>
          <p className="text-muted-foreground text-sm">Logistics operations for Shopify merchants</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-center">{getTitle()}</CardTitle>
          </CardHeader>
          <CardContent>
            {mode === "login" ? (
              loginStep === "credentials" ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      data-testid="input-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password">Password</Label>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => { setMode("forgot"); setForgotStep("email"); setOtp(""); setNewPassword(""); setConfirmNewPassword(""); }}
                        data-testid="link-forgot-password"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <Input
                      id="login-password"
                      data-testid="input-password"
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isSendingOtp} data-testid="button-send-otp">
                    {isSendingOtp ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                    Continue
                  </Button>
                  <p className="text-center text-sm text-muted-foreground">
                    Don't have an account?{" "}
                    <button type="button" className="text-primary underline" onClick={() => setMode("register")} data-testid="link-register">
                      Sign up free
                    </button>
                  </p>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm text-muted-foreground">
                      <Mail className="w-4 h-4 shrink-0" />
                      <span className="truncate">{email}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-otp">6-Digit Code</Label>
                    <Input
                      id="login-otp"
                      data-testid="input-otp"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      required
                      autoComplete="one-time-code"
                      className="text-center text-2xl tracking-[0.5em] font-mono"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-display-name">Your Name (for activity tracking)</Label>
                    <Input
                      id="login-display-name"
                      data-testid="input-display-name"
                      type="text"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="Enter your full name"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      This name will be recorded with all your actions during this session.
                    </p>
                  </div>
                  <Button type="submit" className="w-full" disabled={isVerifyingOtp || otp.length !== 6 || !displayName.trim()} data-testid="button-verify-otp">
                    {isVerifyingOtp && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Verify & Sign In
                  </Button>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => { setLoginStep("credentials"); setOtp(""); setDisplayName(""); }}
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                      data-testid="button-back-to-email"
                    >
                      <ArrowLeft className="w-3 h-3" /> Back
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendOtp()}
                      disabled={cooldown > 0 || isSendingOtp}
                      className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                      data-testid="button-resend-otp"
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                    </button>
                  </div>
                </form>
              )
            ) : mode === "forgot" ? (
              forgotStep === "email" ? (
                <form onSubmit={handleForgotSendOtp} className="space-y-4">
                  <p className="text-sm text-muted-foreground text-center">
                    Enter your email address and we'll send you a verification code to reset your password.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email</Label>
                    <Input
                      id="forgot-email"
                      data-testid="input-forgot-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isSendingReset} data-testid="button-send-reset-code">
                    {isSendingReset ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                    Send Reset Code
                  </Button>
                  <p className="text-center text-sm text-muted-foreground">
                    <button
                      type="button"
                      className="text-primary hover:underline flex items-center gap-1 mx-auto"
                      onClick={() => { setMode("login"); setLoginStep("credentials"); }}
                      data-testid="link-back-to-login"
                    >
                      <ArrowLeft className="w-3 h-3" /> Back to sign in
                    </button>
                  </p>
                </form>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm text-muted-foreground">
                      <Mail className="w-4 h-4 shrink-0" />
                      <span className="truncate">{email}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-otp">6-Digit Code</Label>
                    <Input
                      id="reset-otp"
                      data-testid="input-reset-otp"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      required
                      autoComplete="one-time-code"
                      className="text-center text-2xl tracking-[0.5em] font-mono"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-new-password">New Password</Label>
                    <Input
                      id="reset-new-password"
                      data-testid="input-new-password"
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-confirm-password">Confirm New Password</Label>
                    <Input
                      id="reset-confirm-password"
                      data-testid="input-confirm-new-password"
                      type="password"
                      value={confirmNewPassword}
                      onChange={e => setConfirmNewPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isResetting || otp.length !== 6} data-testid="button-reset-password">
                    {isResetting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
                    Reset Password
                  </Button>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => { setMode("login"); setLoginStep("credentials"); setOtp(""); setNewPassword(""); setConfirmNewPassword(""); setForgotStep("email"); }}
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                      data-testid="link-back-to-login-from-reset"
                    >
                      <ArrowLeft className="w-3 h-3" /> Back to sign in
                    </button>
                    <button
                      type="button"
                      onClick={() => handleForgotSendOtp({ preventDefault: () => {} } as React.FormEvent)}
                      disabled={cooldown > 0 || isSendingReset}
                      className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                      data-testid="button-resend-reset-code"
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                    </button>
                  </div>
                </form>
              )
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="reg-first">First Name</Label>
                    <Input
                      id="reg-first"
                      data-testid="input-first-name"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      placeholder="First name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-last">Last Name</Label>
                    <Input
                      id="reg-last"
                      data-testid="input-last-name"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      placeholder="Last name"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-business">Business Name</Label>
                  <Input
                    id="reg-business"
                    data-testid="input-merchant-name"
                    value={merchantName}
                    onChange={e => setMerchantName(e.target.value)}
                    placeholder="Your store or business name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input
                    id="reg-email"
                    data-testid="input-register-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input
                    id="reg-password"
                    data-testid="input-register-password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-confirm">Confirm Password</Label>
                  <Input
                    id="reg-confirm"
                    data-testid="input-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isRegistering} data-testid="button-register">
                  {isRegistering && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Account
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <button type="button" className="text-primary underline" onClick={() => { setMode("login"); setLoginStep("credentials"); }} data-testid="link-login">
                    Sign in
                  </button>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
