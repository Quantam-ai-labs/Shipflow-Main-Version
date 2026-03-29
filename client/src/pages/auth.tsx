import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { Package, Loader2, ArrowLeft, Mail, Lock, KeyRound, Eye, EyeOff } from "lucide-react";

function StarField() {
  const stars = useRef<{ x: number; y: number; r: number; opacity: number; speed: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    stars.current = Array.from({ length: 120 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.2 + 0.3,
      opacity: Math.random() * 0.6 + 0.1,
      speed: Math.random() * 0.015 + 0.005,
    }));

    let time = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time += 1;
      stars.current.forEach((star) => {
        const twinkle = star.opacity + Math.sin(time * star.speed * 3) * 0.25;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0.05, Math.min(0.85, twinkle))})`;
        ctx.fill();
      });
      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

const glassInput = "bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:ring-violet-500/50 focus-visible:border-violet-400/50";
const glassLabel = "text-white/70 text-sm font-medium";
const gradientBtn = "w-full bg-gradient-to-r from-violet-600 to-emerald-500 hover:from-violet-500 hover:to-emerald-400 text-white font-semibold shadow-lg shadow-violet-500/20 border-0";

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
  const [rememberDevice, setRememberDevice] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSendOtp = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const data = await sendOtp({ email, password });
      if (data?.otpSkipped) {
        toast({ title: "Logged In", description: "Welcome back!" });
        return;
      }
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
      await verifyOtp({ email, otp, displayName: displayName.trim(), rememberDevice });
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
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "#08080f" }}
    >
      <StarField />

      {/* Aurora orbs */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        <div
          className="absolute rounded-full blur-3xl"
          style={{
            width: 600,
            height: 600,
            top: "-15%",
            left: "-10%",
            background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute rounded-full blur-3xl"
          style={{
            width: 500,
            height: 500,
            bottom: "-10%",
            right: "-8%",
            background: "radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute rounded-full blur-3xl"
          style={{
            width: 400,
            height: 400,
            top: "40%",
            left: "55%",
            background: "radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Content */}
      <div className="w-full max-w-md space-y-6 relative" style={{ zIndex: 2 }}>
        {/* Logo / brand */}
        <div className="text-center space-y-3">
          <div className="relative mx-auto w-14 h-14">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-600 to-emerald-500 blur-md opacity-60" />
            <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-emerald-500 flex items-center justify-center shadow-xl">
              <Package className="w-7 h-7 text-white" />
            </div>
          </div>
          <h1
            className="text-3xl font-bold bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(to right, #a78bfa, #34d399, #fbbf24)" }}
            data-testid="text-app-title"
          >
            1SOL.AI
          </h1>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            Logistics operations for Shopify merchants
          </p>
        </div>

        {/* Glass card */}
        <div className="rounded-2xl border border-white/10 backdrop-blur-xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.04)" }}>
          <h2 className="text-lg font-semibold text-center text-white">{getTitle()}</h2>

          {mode === "login" ? (
            loginStep === "credentials" ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email" className={glassLabel}>Email</Label>
                  <Input
                    id="login-email"
                    data-testid="input-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className={glassInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password" className={glassLabel}>Password</Label>
                    <button
                      type="button"
                      className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                      onClick={() => { setMode("forgot"); setForgotStep("email"); setOtp(""); setNewPassword(""); setConfirmNewPassword(""); }}
                      data-testid="link-forgot-password"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="login-password"
                      data-testid="input-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      autoComplete="current-password"
                      className={`${glassInput} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
                      data-testid="button-toggle-password"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember-device"
                    data-testid="checkbox-remember-device"
                    checked={rememberDevice}
                    onCheckedChange={(checked) => setRememberDevice(checked === true)}
                    className="border-white/20 data-[state=checked]:bg-violet-600 data-[state=checked]:border-violet-600"
                  />
                  <Label htmlFor="remember-device" className="text-sm font-normal cursor-pointer" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Remember this device for 7 days
                  </Label>
                </div>
                <Button type="submit" className={gradientBtn} disabled={isSendingOtp} data-testid="button-send-otp">
                  {isSendingOtp ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                  Continue
                </Button>
                <p className="text-center text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Don't have an account?{" "}
                  <button type="button" className="text-violet-400 hover:text-violet-300 underline transition-colors" onClick={() => setMode("register")} data-testid="link-register">
                    Sign up free
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 p-2.5 rounded-lg text-sm" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                    <Mail className="w-4 h-4 shrink-0" />
                    <span className="truncate">{email}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-otp" className={glassLabel}>6-Digit Code</Label>
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
                    className={`${glassInput} text-center text-2xl tracking-[0.5em] font-mono`}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-display-name" className={glassLabel}>Your Name (for activity tracking)</Label>
                  <Input
                    id="login-display-name"
                    data-testid="input-display-name"
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Enter your full name"
                    required
                    className={glassInput}
                  />
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                    This name will be recorded with all your actions during this session.
                  </p>
                </div>
                <Button type="submit" className={gradientBtn} disabled={isVerifyingOtp || otp.length !== 6 || !displayName.trim()} data-testid="button-verify-otp">
                  {isVerifyingOtp && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Verify & Sign In
                </Button>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => { setLoginStep("credentials"); setOtp(""); setDisplayName(""); }}
                    className="flex items-center gap-1 transition-colors"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                    data-testid="button-back-to-email"
                  >
                    <ArrowLeft className="w-3 h-3" /> Back
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendOtp()}
                    disabled={cooldown > 0 || isSendingOtp}
                    className="text-violet-400 hover:text-violet-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                <p className="text-sm text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Enter your email address and we'll send you a verification code to reset your password.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email" className={glassLabel}>Email</Label>
                  <Input
                    id="forgot-email"
                    data-testid="input-forgot-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className={glassInput}
                  />
                </div>
                <Button type="submit" className={gradientBtn} disabled={isSendingReset} data-testid="button-send-reset-code">
                  {isSendingReset ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                  Send Reset Code
                </Button>
                <p className="text-center text-sm">
                  <button
                    type="button"
                    className="flex items-center gap-1 mx-auto transition-colors hover:text-white/60"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                    onClick={() => { setMode("login"); setLoginStep("credentials"); }}
                    data-testid="link-back-to-login"
                  >
                    <ArrowLeft className="w-3 h-3" /> Back to sign in
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 p-2.5 rounded-lg text-sm" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                    <Mail className="w-4 h-4 shrink-0" />
                    <span className="truncate">{email}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reset-otp" className={glassLabel}>6-Digit Code</Label>
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
                    className={`${glassInput} text-center text-2xl tracking-[0.5em] font-mono`}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reset-new-password" className={glassLabel}>New Password</Label>
                  <div className="relative">
                    <Input
                      id="reset-new-password"
                      data-testid="input-new-password"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className={`${glassInput} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
                      data-testid="button-toggle-new-password"
                      tabIndex={-1}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reset-confirm-password" className={glassLabel}>Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="reset-confirm-password"
                      data-testid="input-confirm-new-password"
                      type={showNewPassword ? "text" : "password"}
                      value={confirmNewPassword}
                      onChange={e => setConfirmNewPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className={`${glassInput} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
                      data-testid="button-toggle-confirm-new-password"
                      tabIndex={-1}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className={gradientBtn} disabled={isResetting || otp.length !== 6} data-testid="button-reset-password">
                  {isResetting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
                  Reset Password
                </Button>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => { setMode("login"); setLoginStep("credentials"); setOtp(""); setNewPassword(""); setConfirmNewPassword(""); setForgotStep("email"); }}
                    className="flex items-center gap-1 transition-colors hover:text-white/60"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                    data-testid="link-back-to-login-from-reset"
                  >
                    <ArrowLeft className="w-3 h-3" /> Back to sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => handleForgotSendOtp({ preventDefault: () => {} } as React.FormEvent)}
                    disabled={cooldown > 0 || isSendingReset}
                    className="text-violet-400 hover:text-violet-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                <div className="space-y-1.5">
                  <Label htmlFor="reg-first" className={glassLabel}>First Name</Label>
                  <Input
                    id="reg-first"
                    data-testid="input-first-name"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="First name"
                    required
                    className={glassInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-last" className={glassLabel}>Last Name</Label>
                  <Input
                    id="reg-last"
                    data-testid="input-last-name"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Last name"
                    className={glassInput}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-business" className={glassLabel}>Business Name</Label>
                <Input
                  id="reg-business"
                  data-testid="input-merchant-name"
                  value={merchantName}
                  onChange={e => setMerchantName(e.target.value)}
                  placeholder="Your store or business name"
                  required
                  className={glassInput}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-email" className={glassLabel}>Email</Label>
                <Input
                  id="reg-email"
                  data-testid="input-register-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className={glassInput}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-password" className={glassLabel}>Password</Label>
                <div className="relative">
                  <Input
                    id="reg-password"
                    data-testid="input-register-password"
                    type={showRegPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={`${glassInput} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
                    data-testid="button-toggle-register-password"
                    tabIndex={-1}
                  >
                    {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-confirm" className={glassLabel}>Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="reg-confirm"
                    data-testid="input-confirm-password"
                    type={showRegPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={`${glassInput} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
                    data-testid="button-toggle-confirm-register-password"
                    tabIndex={-1}
                  >
                    {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className={gradientBtn} disabled={isRegistering} data-testid="button-register">
                {isRegistering && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Account
              </Button>
              <p className="text-center text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                Already have an account?{" "}
                <button type="button" className="text-violet-400 hover:text-violet-300 underline transition-colors" onClick={() => { setMode("login"); setLoginStep("credentials"); }} data-testid="link-login">
                  Sign in
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
