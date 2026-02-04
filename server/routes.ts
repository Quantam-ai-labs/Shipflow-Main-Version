import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { z } from "zod";

// Zod schemas for validation
const remarkSchema = z.object({
  content: z.string().min(1, "Content is required"),
  remarkType: z.enum(["general", "delivery", "payment", "return"]).optional().default("general"),
});

const reconcileSchema = z.object({
  recordIds: z.array(z.string()).min(1, "At least one record ID is required"),
  settlementRef: z.string().optional(),
});

const teamInviteSchema = z.object({
  email: z.string().email("Valid email is required"),
  role: z.enum(["admin", "manager", "agent"]).optional().default("agent"),
});

const teamRoleUpdateSchema = z.object({
  role: z.enum(["admin", "manager", "agent"]),
});

const courierAccountSchema = z.object({
  courierName: z.enum(["leopards", "postex", "tcs"]),
  apiKey: z.string().min(1, "API key is required"),
  accountNumber: z.string().optional(),
});

const settingsUpdateSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  notifications: z.object({
    emailOrderUpdates: z.boolean(),
    emailDeliveryAlerts: z.boolean(),
    emailCodReminders: z.boolean(),
  }).optional(),
});

// Demo mode flag - set to false in production for strict tenant isolation
const DEMO_MODE = process.env.NODE_ENV !== "production";

// Helper to get merchant ID from authenticated user
// Uses explicit team membership lookup for tenant isolation
async function getMerchantIdForUser(req: any): Promise<string | null> {
  const userId = req.user?.claims?.sub;
  if (!userId) {
    return null;
  }

  // Check for existing team membership
  const existingMerchantId = await storage.getUserMerchantId(userId);
  if (existingMerchantId) {
    return existingMerchantId;
  }

  // DEMO MODE ONLY: Auto-enroll new users into demo merchant for testing
  // In production (DEMO_MODE=false), users must be explicitly invited to a merchant
  if (DEMO_MODE) {
    const demoMerchant = await storage.getMerchantBySlug("demo-fashion");
    if (demoMerchant) {
      await storage.createTeamMember({
        userId,
        merchantId: demoMerchant.id,
        role: "admin",
        isActive: true,
      });
      return demoMerchant.id;
    }
  }

  // No merchant access - user must be invited to a merchant first
  return null;
}

// Middleware to ensure merchant access
async function requireMerchant(req: any, res: any): Promise<string | null> {
  const merchantId = await getMerchantIdForUser(req);
  if (!merchantId) {
    res.status(403).json({ message: "Access denied. No merchant access." });
    return null;
  }
  return merchantId;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication
  await setupAuth(app);
  registerAuthRoutes(app);

  // Seed demo data on startup
  await storage.seedDemoData();

  // Dashboard Stats
  app.get("/api/dashboard/stats", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const stats = await storage.getDashboardStats(merchantId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Orders
  app.get("/api/orders/recent", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const orders = await storage.getRecentOrders(merchantId, 5);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching recent orders:", error);
      res.status(500).json({ message: "Failed to fetch recent orders" });
    }
  });

  app.get("/api/orders", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { search, status, page, pageSize } = req.query;
      const result = await storage.getOrders(merchantId, {
        search: search as string,
        status: status as string,
        page: parseInt(page as string) || 1,
        pageSize: parseInt(pageSize as string) || 20,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/:id", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      // Get order with merchantId scope (will return undefined if not found or not owned)
      const order = await storage.getOrderById(merchantId, req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Get related shipments with events (all scoped by merchantId)
      const orderShipments = await storage.getShipmentsByOrderId(merchantId, order.id);
      const shipmentsWithEvents = await Promise.all(
        orderShipments.map(async (shipment) => ({
          ...shipment,
          events: await storage.getShipmentEvents(merchantId, shipment.id),
        }))
      );

      // Get remarks (scoped by merchantId via order ownership)
      const orderRemarks = await storage.getRemarks(merchantId, order.id);

      res.json({
        ...order,
        shipments: shipmentsWithEvents,
        remarks: orderRemarks,
      });
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  app.post("/api/orders/:id/remarks", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      // Validate request body
      const validated = remarkSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ message: validated.error.errors[0].message });
      }

      // Verify order exists and belongs to merchant
      const order = await storage.getOrderById(merchantId, req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const userId = req.user?.claims?.sub || "unknown";

      // Create remark with merchantId scope check
      const remark = await storage.createRemark(merchantId, {
        orderId: req.params.id,
        userId,
        content: validated.data.content,
        remarkType: validated.data.remarkType,
        isInternal: true,
      });

      res.json(remark);
    } catch (error) {
      console.error("Error creating remark:", error);
      res.status(500).json({ message: "Failed to create remark" });
    }
  });

  // Shipments
  app.get("/api/shipments", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { search, status, courier, page, pageSize } = req.query;
      const result = await storage.getShipments(merchantId, {
        search: search as string,
        status: status as string,
        courier: courier as string,
        page: parseInt(page as string) || 1,
        pageSize: parseInt(pageSize as string) || 20,
      });

      // Attach order data to shipments (already scoped by merchantId)
      const shipmentsWithOrders = await Promise.all(
        result.shipments.map(async (shipment) => ({
          ...shipment,
          order: await storage.getOrderById(merchantId, shipment.orderId),
        }))
      );

      res.json({ ...result, shipments: shipmentsWithOrders });
    } catch (error) {
      console.error("Error fetching shipments:", error);
      res.status(500).json({ message: "Failed to fetch shipments" });
    }
  });

  // Analytics
  app.get("/api/analytics", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const dateRange = (req.query.dateRange as string) || "30d";
      const analytics = await storage.getAnalytics(merchantId, dateRange);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // COD Reconciliation
  app.get("/api/cod-reconciliation", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { search, status, page, pageSize } = req.query;
      const result = await storage.getCodReconciliation(merchantId, {
        search: search as string,
        status: status as string,
        page: parseInt(page as string) || 1,
        pageSize: parseInt(pageSize as string) || 20,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching COD reconciliation:", error);
      res.status(500).json({ message: "Failed to fetch COD reconciliation" });
    }
  });

  app.post("/api/cod-reconciliation/reconcile", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      // Validate request body
      const validated = reconcileSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ message: validated.error.errors[0].message });
      }

      const { recordIds, settlementRef } = validated.data;
      const userId = req.user?.claims?.sub || "unknown";

      // Verify all records belong to this merchant using direct DB lookup
      for (const recordId of recordIds) {
        const record = await storage.getCodRecordById(merchantId, recordId);
        if (!record) {
          return res.status(403).json({ message: "Access denied to one or more records" });
        }
      }

      // Update all records (scoped by merchantId)
      const updated = await Promise.all(
        recordIds.map((id: string) =>
          storage.updateCodReconciliation(merchantId, id, {
            status: "received",
            courierSettlementRef: settlementRef || null,
            reconciliatedAt: new Date(),
            reconciliatedBy: userId,
          })
        )
      );

      res.json({ updated: updated.filter(Boolean).length });
    } catch (error) {
      console.error("Error reconciling COD:", error);
      res.status(500).json({ message: "Failed to reconcile COD" });
    }
  });

  // Team Management
  app.get("/api/team", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const members = await storage.getTeamMembers(merchantId);
      res.json({ members, total: members.length });
    } catch (error) {
      console.error("Error fetching team:", error);
      res.status(500).json({ message: "Failed to fetch team" });
    }
  });

  app.post("/api/team/invite", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      // Validate request body
      const validated = teamInviteSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ message: validated.error.errors[0].message });
      }

      const { email, role } = validated.data;

      // In a real app, this would send an email invitation
      // For now, we'll create a pending member record
      const member = await storage.createTeamMember({
        userId: email, // Placeholder - would be actual user ID after they accept
        merchantId,
        role,
        isActive: false,
      });

      res.json(member);
    } catch (error) {
      console.error("Error inviting team member:", error);
      res.status(500).json({ message: "Failed to invite team member" });
    }
  });

  app.patch("/api/team/:id/role", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      // Validate request body
      const validated = teamRoleUpdateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ message: validated.error.errors[0].message });
      }

      // Verify team member exists and belongs to this merchant
      const existingMember = await storage.getTeamMemberById(merchantId, req.params.id);
      if (!existingMember) {
        return res.status(404).json({ message: "Team member not found" });
      }

      // Update role (scoped by merchantId)
      const member = await storage.updateTeamMemberRole(merchantId, req.params.id, validated.data.role);
      res.json(member);
    } catch (error) {
      console.error("Error updating role:", error);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.delete("/api/team/:id", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      // Verify team member exists and belongs to this merchant
      const existingMember = await storage.getTeamMemberById(merchantId, req.params.id);
      if (!existingMember) {
        return res.status(404).json({ message: "Team member not found" });
      }

      // Delete (scoped by merchantId)
      await storage.deleteTeamMember(merchantId, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing member:", error);
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  // Integrations
  app.get("/api/integrations", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const shopifyStore = await storage.getShopifyStore(merchantId);
      const couriers = await storage.getCourierAccounts(merchantId);

      res.json({
        shopify: {
          isConnected: shopifyStore?.isConnected || false,
          shopDomain: shopifyStore?.shopDomain || null,
          lastSyncAt: shopifyStore?.lastSyncAt || null,
        },
        couriers: couriers.map((c) => ({
          id: c.id,
          name: c.courierName,
          isActive: c.isActive,
          accountNumber: c.accountNumber,
        })),
      });
    } catch (error) {
      console.error("Error fetching integrations:", error);
      res.status(500).json({ message: "Failed to fetch integrations" });
    }
  });

  app.post("/api/integrations/shopify/connect", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      // In a real app, this would initiate Shopify OAuth flow
      // For demo, we'll just return a mock auth URL
      res.json({
        authUrl: "/api/integrations/shopify/callback?shop=demo-store.myshopify.com",
      });
    } catch (error) {
      console.error("Error connecting Shopify:", error);
      res.status(500).json({ message: "Failed to connect Shopify" });
    }
  });

  app.post("/api/integrations/shopify/disconnect", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const store = await storage.getShopifyStore(merchantId);
      if (store) {
        await storage.updateShopifyStore(store.id, { isConnected: false });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting Shopify:", error);
      res.status(500).json({ message: "Failed to disconnect Shopify" });
    }
  });

  app.post("/api/integrations/shopify/sync", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      // In a real app, this would trigger a Shopify order sync
      res.json({ success: true, message: "Sync initiated" });
    } catch (error) {
      console.error("Error syncing Shopify:", error);
      res.status(500).json({ message: "Failed to sync Shopify" });
    }
  });

  app.post("/api/integrations/couriers", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      // Validate request body
      const validated = courierAccountSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ message: validated.error.errors[0].message });
      }

      const { courierName, apiKey, accountNumber } = validated.data;

      const account = await storage.createCourierAccount({
        merchantId,
        courierName,
        apiKey,
        accountNumber,
        isActive: true,
      });

      res.json(account);
    } catch (error) {
      console.error("Error saving courier:", error);
      res.status(500).json({ message: "Failed to save courier" });
    }
  });

  // Settings
  app.get("/api/settings", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const merchant = await storage.getMerchant(merchantId);
      
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json({
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        phone: merchant.phone,
        address: merchant.address,
        city: merchant.city,
        notifications: {
          emailOrderUpdates: true,
          emailDeliveryAlerts: true,
          emailCodReminders: true,
        },
      });
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.patch("/api/settings", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      // Validate request body
      const validated = settingsUpdateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ message: validated.error.errors[0].message });
      }

      const { name, email, phone, address, city } = validated.data;

      const updated = await storage.updateMerchant(merchantId, {
        name,
        email,
        phone,
        address,
        city,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  return httpServer;
}
