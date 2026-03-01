import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Shield, Loader2, ArrowLeft, Mail, User } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminLoginPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSendOtp = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSending(true);
    try {
      const res = await apiRequest("POST", "/api/admin-auth/send-otp", { email });
      const data = await res.json();
      toast({ title: "Code Sent", description: data.message });
      setStep("otp");
      setOtp("");
      setCooldown(60);
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("not found") || msg.includes("No account")) {
        toast({ title: "Account Not Found", description: "No administrator account found with this email address.", variant: "destructive" });
      } else if (msg.includes("rate") || msg.includes("wait") || msg.includes("recently")) {
        toast({ title: "Too Many Requests", description: "A code was sent recently. Please wait before requesting another.", variant: "destructive" });
      } else {
        toast({ title: "Failed to Send Code", description: msg || "Something went wrong. Please try again.", variant: "destructive" });
      }
    } finally {
      setIsSending(false);
    }
  }, [email, toast]);

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast({ title: "Name Required", description: "Please enter your name for session tracking.", variant: "destructive" });
      return;
    }
    setIsVerifying(true);
    try {
      const res = await apiRequest("POST", "/api/admin-auth/verify-otp", { email, otp, displayName: displayName.trim() });
      const result = await res.json();
      if (result.role !== "SUPER_ADMIN") {
        toast({ title: "Access Denied", description: "This login is for platform administrators only.", variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      window.location.href = "/admin";
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("expired")) {
        toast({ title: "Code Expired", description: "Your verification code has expired. Please request a new one.", variant: "destructive" });
      } else if (msg.includes("attempts") || msg.includes("Too many")) {
        toast({ title: "Too Many Attempts", description: "Too many incorrect attempts. Please request a new code.", variant: "destructive" });
      } else if (msg.includes("Invalid") || msg.includes("incorrect")) {
        toast({ title: "Invalid Code", description: "The code you entered is incorrect. Please check and try again.", variant: "destructive" });
      } else if (msg.includes("name")) {
        toast({ title: "Name Required", description: "Please enter your name.", variant: "destructive" });
      } else {
        toast({ title: "Verification Failed", description: msg || "Something went wrong. Please try again.", variant: "destructive" });
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-md bg-primary flex items-center justify-center mx-auto">
            <Shield className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold" data-testid="text-admin-login-title">ShipFlow Admin</h1>
          <p className="text-muted-foreground text-sm">Platform Control Room</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base text-center">
              {step === "email" ? "Administrator Login" : "Verify & Identify"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {step === "email" ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-email">Email</Label>
                  <Input
                    id="admin-email"
                    data-testid="input-admin-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="admin@shipflow.pk"
                    required
                    autoComplete="email"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isSending} data-testid="button-send-otp">
                  {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                  Send Verification Code
                </Button>
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
                  <Label htmlFor="admin-otp">6-Digit Code</Label>
                  <Input
                    id="admin-otp"
                    data-testid="input-admin-otp"
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
                  <Label htmlFor="admin-display-name">Your Name (for activity tracking)</Label>
                  <Input
                    id="admin-display-name"
                    data-testid="input-admin-display-name"
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
                <Button type="submit" className="w-full" disabled={isVerifying || otp.length !== 6 || !displayName.trim()} data-testid="button-verify-otp">
                  {isVerifying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Verify & Login
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => { setStep("email"); setOtp(""); setDisplayName(""); }}
                    className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                    data-testid="button-back-to-email"
                  >
                    <ArrowLeft className="w-3 h-3" /> Change email
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendOtp()}
                    disabled={cooldown > 0 || isSending}
                    className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                    data-testid="button-resend-otp"
                  >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Not an administrator? <a href="/" className="text-primary underline" data-testid="link-merchant-login">Go to merchant login</a>
        </p>
      </div>
    </div>
  );
}
