import type { Express } from "express";
import { db } from "../../db";
import { users, merchants, teamMembers } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "./replitAuth";
import bcrypt from "bcrypt";
import { z } from "zod";

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

      const existing = await db.select().from(users).where(eq(users.email, body.email));
      if (existing.length > 0) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      const passwordHash = await bcrypt.hash(body.password, 12);
      const slug = generateSlug(body.merchantName);

      const result = await db.transaction(async (tx) => {
        const [merchant] = await tx.insert(merchants).values({
          name: body.merchantName,
          slug,
          email: body.email,
          status: "ACTIVE",
          onboardingStep: "ACCOUNT_CREATED",
        }).returning();

        const [user] = await tx.insert(users).values({
          email: body.email,
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

      const [user] = await db.select().from(users).where(eq(users.email, body.email));
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
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
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
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
