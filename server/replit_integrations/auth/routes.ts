import type { Express } from "express";
import { db } from "../../db";
import { users, merchants, teamMembers } from "@shared/schema";
import { eq, ilike } from "drizzle-orm";
import { isAuthenticated } from "./replitAuth";
import { z } from "zod";
import { sendOtpEmail } from "../../services/email";

export const otpStore = new Map<string, { code: string; expiresAt: number; attempts: number; sentAt: number }>();

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

export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function getOtpKey(email: string): string {
  return email.toLowerCase().trim();
}

const registerSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  merchantName: z.string().min(1, "Business name is required"),
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
        return res.status(400).json({ message: "An account with this email already exists." });
      }

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
      res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });

  app.post("/api/auth/send-otp", async (req, res) => {
    try {
      const { email } = z.object({ email: z.string().email("Please enter a valid email address.") }).parse(req.body);
      const normalizedEmail = email.toLowerCase().trim();

      const [user] = await db.select().from(users).where(ilike(users.email, normalizedEmail));
      if (!user) {
        return res.status(404).json({ message: "No account found with this email. Please sign up first." });
      }

      if (!user.isActive) {
        return res.status(403).json({ message: "Your account has been deactivated. Contact your administrator." });
      }

      if (user.merchantId) {
        const [merchant] = await db.select().from(merchants).where(eq(merchants.id, user.merchantId));
        if (merchant && merchant.status === "SUSPENDED") {
          return res.status(403).json({ message: "Your business account has been suspended. Contact support." });
        }
      }

      const otpKey = getOtpKey(normalizedEmail);
      const existing = otpStore.get(otpKey);
      if (existing && Date.now() - existing.sentAt < 60000) {
        const wait = Math.ceil((60000 - (Date.now() - existing.sentAt)) / 1000);
        return res.status(429).json({ message: `Please wait ${wait} seconds before requesting a new code.` });
      }

      const code = generateOtp();
      otpStore.set(otpKey, { code, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0, sentAt: Date.now() });

      const deliveryEmail = normalizedEmail.replace(/\+[^@]*@/, "@");
      const result = await sendOtpEmail({ toEmail: deliveryEmail, code, name: user.firstName || "there" });
      if (!result.success) {
        console.error("[Auth] OTP send failed:", result.error);
        otpStore.delete(otpKey);
        return res.status(500).json({ message: "Failed to send verification code. Please try again." });
      }

      res.json({ message: "Verification code sent to your email." });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("[Auth] send-otp error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const { email, otp } = z.object({
        email: z.string().email(),
        otp: z.string().length(6, "Please enter the 6-digit code."),
      }).parse(req.body);
      const normalizedEmail = email.toLowerCase().trim();
      const otpKey = getOtpKey(normalizedEmail);

      const stored = otpStore.get(otpKey);
      if (!stored) {
        return res.status(401).json({ message: "No verification code found. Please request a new one." });
      }

      if (Date.now() > stored.expiresAt) {
        otpStore.delete(otpKey);
        return res.status(401).json({ message: "Verification code has expired. Please request a new one." });
      }

      if (stored.attempts >= 5) {
        otpStore.delete(otpKey);
        return res.status(401).json({ message: "Too many failed attempts. Please request a new code." });
      }

      if (stored.code !== otp) {
        stored.attempts++;
        return res.status(401).json({ message: `Invalid code. ${5 - stored.attempts} attempts remaining.` });
      }

      otpStore.delete(otpKey);

      const [user] = await db.select().from(users).where(ilike(users.email, normalizedEmail));
      if (!user) {
        return res.status(401).json({ message: "Account not found." });
      }

      if (!user.isActive) {
        return res.status(403).json({ message: "Your account has been deactivated. Contact your administrator." });
      }

      if (user.merchantId) {
        const [merchant] = await db.select().from(merchants).where(eq(merchants.id, user.merchantId));
        if (merchant && merchant.status === "SUSPENDED") {
          return res.status(403).json({ message: "Your business account has been suspended. Contact support." });
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
      console.error("[Auth] verify-otp error:", error);
      res.status(500).json({ message: "Verification failed. Please try again." });
    }
  });

  app.post("/api/admin-auth/send-otp", async (req, res) => {
    try {
      const { email } = z.object({ email: z.string().email("Please enter a valid email address.") }).parse(req.body);
      const normalizedEmail = email.toLowerCase().trim();

      const user = await findSuperAdmin(normalizedEmail);
      if (!user) {
        return res.status(404).json({ message: "No administrator account found with this email." });
      }

      const otpKey = getOtpKey((user.email || normalizedEmail).toLowerCase());
      const existing = otpStore.get(otpKey);
      if (existing && Date.now() - existing.sentAt < 60000) {
        const wait = Math.ceil((60000 - (Date.now() - existing.sentAt)) / 1000);
        return res.status(429).json({ message: `Please wait ${wait} seconds before requesting a new code.` });
      }

      const code = generateOtp();
      otpStore.set(otpKey, { code, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0, sentAt: Date.now() });

      const deliveryEmail = (user.email || normalizedEmail).toLowerCase().replace(/\+[^@]*@/, "@");
      const result = await sendOtpEmail({ toEmail: deliveryEmail, code, name: user.firstName || "Admin" });
      if (!result.success) {
        console.error("[AdminOTP] Failed to send:", result.error);
        otpStore.delete(otpKey);
        return res.status(500).json({ message: "Failed to send verification code. Please try again." });
      }

      console.log(`[AdminOTP] OTP sent to ${deliveryEmail}`);
      res.json({ message: "Verification code sent to your email." });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("[AdminOTP] send-otp error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/admin-auth/verify-otp", async (req, res) => {
    try {
      const { email, otp } = z.object({
        email: z.string().email(),
        otp: z.string().length(6, "Please enter the 6-digit code."),
      }).parse(req.body);
      const normalizedEmail = email.toLowerCase().trim();

      const user = await findSuperAdmin(normalizedEmail);
      const otpKey = getOtpKey(user ? (user.email || normalizedEmail).toLowerCase() : normalizedEmail);

      const stored = otpStore.get(otpKey);
      if (!stored) {
        return res.status(401).json({ message: "No verification code found. Please request a new one." });
      }

      if (Date.now() > stored.expiresAt) {
        otpStore.delete(otpKey);
        return res.status(401).json({ message: "Verification code has expired. Please request a new one." });
      }

      if (stored.attempts >= 5) {
        otpStore.delete(otpKey);
        return res.status(401).json({ message: "Too many failed attempts. Please request a new code." });
      }

      if (stored.code !== otp) {
        stored.attempts++;
        return res.status(401).json({ message: `Invalid code. ${5 - stored.attempts} attempts remaining.` });
      }

      otpStore.delete(otpKey);

      if (!user) {
        return res.status(401).json({ message: "Administrator account not found." });
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
      res.status(500).json({ message: "Verification failed. Please try again." });
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
      let allowedPages: string[] | null = null;
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

        const [teamMember] = await db.select().from(teamMembers)
          .where(eq(teamMembers.userId, user.id));
        if (teamMember) {
          allowedPages = teamMember.allowedPages || null;
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
        allowedPages,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
