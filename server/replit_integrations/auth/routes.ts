import type { Express } from "express";
import { db } from "../../db";
import { users, merchants, teamMembers } from "@shared/schema";
import { eq, ilike } from "drizzle-orm";
import { isAuthenticated } from "./replitAuth";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";
import { sendPasswordResetEmailSES } from "../../services/sesEmail";
import { sendAdminOtpEmail } from "../../services/email";

const adminOtpStore = new Map<string, { code: string; expiresAt: number; attempts: number; sentAt: number }>();

async function findSuperAdmin(email: string) {
  const [exact] = await db.select().from(users).where(ilike(users.email, email));
  if (exact?.role === "SUPER_ADMIN") return exact;
  const baseEmail = email.replace(/\+[^@]*@/, "@");
  if (baseEmail !== email) {
    const [base] = await db.select().from(users).where(ilike(users.email, baseEmail));
    if (base?.role === "SUPER_ADMIN") return base;
  }
  const allAdmins = await db.select().from(users).where(eq(users.role, "SUPER_ADMIN"));
  return allAdmins.find(u => {
    const adminBase = (u.email || "").toLowerCase().replace(/\+[^@]*@/, "@");
    return adminBase === baseEmail;
  }) || null;
}

const registerSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  merchantName: z.string().min(1, "Business name is required"),
});

const loginSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Valid email is required"),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") + "-" + Date.now().toString(36);
}

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/register", async (req, res) => {
    try {
      const body = registerSchema.parse(req.body);
      const normalizedEmail = body.email.toLowerCase().trim();

      const existing = await db.select().from(users).where(ilike(users.email, normalizedEmail));
      if (existing.length > 0) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      const passwordHash = await bcrypt.hash(body.password, 12);
      const slug = generateSlug(body.merchantName);

      const result = await db.transaction(async (tx) => {
        const [merchant] = await tx.insert(merchants).values({
          name: body.merchantName,
          slug,
          email: normalizedEmail,
          status: "ACTIVE",
          onboardingStep: "ACCOUNT_CREATED",
        }).returning();

        const [user] = await tx.insert(users).values({
          email: normalizedEmail,
          firstName: body.firstName,
          lastName: body.lastName || null,
          passwordHash,
          role: "USER",
          isActive: true,
          merchantId: merchant.id,
          lastLoginAt: new Date(),
        }).returning();

        await tx.insert(teamMembers).values({
          userId: user.id,
          merchantId: merchant.id,
          role: "admin",
          joinedAt: new Date(),
        });

        return { merchant, user };
      });

      const { merchant, user } = result;
      (req.session as any).userId = user.id;

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        merchantId: merchant.id,
        merchant: {
          id: merchant.id,
          name: merchant.name,
          status: merchant.status,
          onboardingStep: merchant.onboardingStep,
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const body = loginSchema.parse(req.body);
      const normalizedEmail = body.email.toLowerCase().trim();

      const [user] = await db.select().from(users).where(ilike(users.email, normalizedEmail));
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const valid = await bcrypt.compare(body.password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (!user.isActive) {
        return res.status(403).json({ message: "Your account has been deactivated. Contact support." });
      }

      if (user.merchantId) {
        const [merchant] = await db.select().from(merchants).where(eq(merchants.id, user.merchantId));
        if (merchant && merchant.status === "SUSPENDED") {
          return res.status(403).json({ message: "Your merchant account has been suspended. Contact support." });
        }
      }

      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

      (req.session as any).userId = user.id;

      let merchantData = null;
      if (user.merchantId) {
        const [m] = await db.select().from(merchants).where(eq(merchants.id, user.merchantId));
        if (m) {
          merchantData = {
            id: m.id,
            name: m.name,
            status: m.status,
            onboardingStep: m.onboardingStep,
          };
        }
      }

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        merchantId: user.merchantId,
        merchant: merchantData,
        sidebarMode: user.sidebarMode || "advanced",
        sidebarPinnedPages: user.sidebarPinnedPages || [],
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/admin-auth/send-otp", async (req, res) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const normalizedEmail = email.toLowerCase().trim();

      const user = await findSuperAdmin(normalizedEmail);
      if (!user) {
        return res.json({ message: "If an administrator account exists, a verification code has been sent." });
      }

      const otpKey = (user.email || normalizedEmail).toLowerCase();
      const existing = adminOtpStore.get(otpKey);
      if (existing && Date.now() - existing.sentAt < 60000) {
        const wait = Math.ceil((60000 - (Date.now() - existing.sentAt)) / 1000);
        return res.status(429).json({ message: `Please wait ${wait} seconds before requesting a new code.` });
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      adminOtpStore.set(otpKey, { code, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0, sentAt: Date.now() });

      const deliveryEmail = (user.email || normalizedEmail).toLowerCase().replace(/\+[^@]*@/, "@");
      const result = await sendAdminOtpEmail({ toEmail: deliveryEmail, code });
      if (!result.success) {
        console.error("[AdminOTP] Failed to send:", result.error);
        return res.status(500).json({ message: "Failed to send verification code. Please try again." });
      }

      console.log(`[AdminOTP] OTP sent to ${deliveryEmail}`);
      res.json({ message: "Verification code sent to your email." });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("[AdminOTP] send-otp error:", error);
      res.status(500).json({ message: "Failed to send verification code." });
    }
  });

  app.post("/api/admin-auth/verify-otp", async (req, res) => {
    try {
      const { email, otp } = z.object({ email: z.string().email(), otp: z.string().length(6) }).parse(req.body);
      const normalizedEmail = email.toLowerCase().trim();

      const user = await findSuperAdmin(normalizedEmail);
      const otpKey = user ? (user.email || normalizedEmail).toLowerCase() : normalizedEmail;

      const stored = adminOtpStore.get(otpKey);
      if (!stored) {
        return res.status(401).json({ message: "No verification code found. Please request a new one." });
      }

      if (Date.now() > stored.expiresAt) {
        adminOtpStore.delete(otpKey);
        return res.status(401).json({ message: "Verification code has expired. Please request a new one." });
      }

      if (stored.attempts >= 5) {
        adminOtpStore.delete(otpKey);
        return res.status(401).json({ message: "Too many failed attempts. Please request a new code." });
      }

      if (stored.code !== otp) {
        stored.attempts++;
        return res.status(401).json({ message: `Invalid code. ${5 - stored.attempts} attempts remaining.` });
      }

      adminOtpStore.delete(otpKey);

      if (!user) {
        return res.status(401).json({ message: "Access denied." });
      }

      if (!user.isActive) {
        return res.status(403).json({ message: "Your account has been deactivated." });
      }

      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      (req.session as any).userId = user.id;

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        merchantId: user.merchantId,
        merchant: null,
        sidebarMode: user.sidebarMode || "advanced",
        sidebarPinnedPages: user.sidebarPinnedPages || [],
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("[AdminOTP] verify-otp error:", error);
      res.status(500).json({ message: "Verification failed." });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const body = forgotPasswordSchema.parse(req.body);
      const normalizedEmail = body.email.toLowerCase().trim();

      const [user] = await db.select().from(users).where(ilike(users.email, normalizedEmail));

      if (!user || !user.passwordHash) {
        return res.json({ message: "If an account exists with that email, a reset link has been sent." });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db.update(users).set({
        passwordResetToken: token,
        passwordResetExpiresAt: expiresAt,
      }).where(eq(users.id, user.id));

      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.REPLIT_DOMAINS
          ? `https://${process.env.REPLIT_DOMAINS}`
          : "https://shipflow.replit.app";

      const resetUrl = `${baseUrl}/reset-password/${token}`;

      const emailResult = await sendPasswordResetEmailSES({
        toEmail: user.email!,
        resetUrl,
        firstName: user.firstName || "there",
        expiresAt,
      });

      if (!emailResult.success) {
        console.error("Failed to send password reset email:", emailResult.error);
      }

      res.json({ message: "If an account exists with that email, a reset link has been sent." });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const body = resetPasswordSchema.parse(req.body);

      const [user] = await db.select().from(users).where(eq(users.passwordResetToken, body.token));
      if (!user) {
        return res.status(400).json({ message: "Invalid or expired reset link" });
      }

      if (!user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
        return res.status(400).json({ message: "This reset link has expired. Please request a new one." });
      }

      const passwordHash = await bcrypt.hash(body.password, 12);

      await db.update(users).set({
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        updatedAt: new Date(),
      }).where(eq(users.id, user.id));

      res.json({ message: "Password has been reset successfully. You can now sign in." });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.get("/api/auth/reset-password/:token/validate", async (req, res) => {
    try {
      const { token } = req.params;
      const [user] = await db.select().from(users).where(eq(users.passwordResetToken, token));

      if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
        return res.status(400).json({ valid: false, message: "Invalid or expired reset link" });
      }

      res.json({ valid: true, email: user.email });
    } catch (error) {
      console.error("Token validation error:", error);
      res.status(500).json({ valid: false, message: "Failed to validate token" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      if (!user.isActive) {
        req.session.destroy(() => {});
        return res.status(403).json({ message: "Account deactivated" });
      }

      let merchantData = null;
      if (user.merchantId) {
        const [m] = await db.select().from(merchants).where(eq(merchants.id, user.merchantId));
        if (m) {
          if (m.status === "SUSPENDED") {
            return res.status(403).json({ message: "Merchant account suspended", suspended: true });
          }
          merchantData = {
            id: m.id,
            name: m.name,
            status: m.status,
            onboardingStep: m.onboardingStep,
          };
        }
      }

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        merchantId: user.merchantId,
        merchant: merchantData,
        sidebarMode: user.sidebarMode || "advanced",
        sidebarPinnedPages: user.sidebarPinnedPages || [],
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
