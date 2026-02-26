import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Package, Loader2, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [email, setEmail] = useState("");
  const [isReset, setIsReset] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function validateToken() {
      try {
        const res = await fetch(`/api/auth/reset-password/${token}/validate`);
        const data = await res.json();
        if (res.ok && data.valid) {
          setIsValid(true);
          setEmail(data.email || "");
        } else {
          setIsValid(false);
          setErrorMessage(data.message || "Invalid or expired reset link");
        }
      } catch {
        setIsValid(false);
        setErrorMessage("Failed to validate reset link");
      } finally {
        setIsValidating(false);
      }
    }
    if (token) {
      validateToken();
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords are the same.", variant: "destructive" });
      return;
    }

    if (password.length < 6) {
      toast({ title: "Password too short", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to reset password");
      }
      setIsReset(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-md bg-primary flex items-center justify-center mx-auto">
            <Package className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold" data-testid="text-app-title">ShipFlow</h1>
          <p className="text-muted-foreground text-sm">Logistics operations for Shopify merchants</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-center">
              {isReset ? "Password Reset" : "Set New Password"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isValidating ? (
              <div className="flex flex-col items-center gap-3 py-6" data-testid="loading-validation">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Validating reset link...</p>
              </div>
            ) : !isValid ? (
              <div className="flex flex-col items-center gap-3 py-6" data-testid="error-invalid-token">
                <XCircle className="w-12 h-12 text-destructive" />
                <p className="text-sm font-medium text-foreground">Invalid Reset Link</p>
                <p className="text-sm text-muted-foreground text-center">{errorMessage}</p>
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => window.location.href = "/"}
                  data-testid="button-go-to-login"
                >
                  Go to Sign In
                </Button>
              </div>
            ) : isReset ? (
              <div className="flex flex-col items-center gap-3 py-6" data-testid="success-reset">
                <CheckCircle className="w-12 h-12 text-green-500" />
                <p className="text-sm font-medium text-foreground">Password updated successfully!</p>
                <p className="text-sm text-muted-foreground text-center">You can now sign in with your new password.</p>
                <Button
                  className="mt-2 w-full"
                  onClick={() => window.location.href = "/"}
                  data-testid="button-sign-in"
                >
                  Sign In
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {email && (
                  <p className="text-sm text-muted-foreground text-center">
                    Setting password for <strong>{email}</strong>
                  </p>
                )}
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      data-testid="input-new-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      required
                      minLength={6}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                      data-testid="button-toggle-new-password"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      data-testid="input-confirm-password"
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      required
                      minLength={6}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowConfirm(!showConfirm)}
                      data-testid="button-toggle-confirm-password"
                      aria-label={showConfirm ? "Hide password" : "Show password"}
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting} data-testid="button-reset-password">
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Reset Password
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
