import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { z } from "zod";
import crypto from "crypto";
import { shopifyService } from "./services/shopify";

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
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  accountNumber: z.string().optional(),
  useEnvCredentials: z.boolean().optional(),
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

// Helper function to generate unique order number
function generateOrderNumber(): string {
  const prefix = "SF";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// Helper function to generate tracking number
function generateTrackingNumber(courier: string): string {
  const prefixes: Record<string, string> = {
    leopards: "LEO",
    postex: "PEX",
    tcs: "TCS",
  };
  const prefix = prefixes[courier] || "TRK";
  return `${prefix}${Date.now().toString().slice(-8)}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

// Simulate syncing orders from Shopify (generates demo data for testing)
async function syncShopifyOrders(merchantId: string, storeDomain: string): Promise<{ synced: number; total: number }> {
  // Generate realistic demo orders (simulating Shopify API response)
  const customerNames = [
    "Ahmad Ali", "Sara Khan", "Muhammad Hassan", "Fatima Zahra", "Ali Raza",
    "Ayesha Malik", "Usman Ahmed", "Hira Noor", "Bilal Qureshi", "Zainab Shah"
  ];
  
  const cities = ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta"];
  
  const products = [
    { name: "Designer Kurta", price: 2500 },
    { name: "Silk Dupatta", price: 1800 },
    { name: "Lawn Suit 3pc", price: 4500 },
    { name: "Cotton Shalwar", price: 1200 },
    { name: "Embroidered Shirt", price: 3200 },
    { name: "Chiffon Dress", price: 5500 },
    { name: "Formal Suit", price: 6800 },
    { name: "Casual Kurti", price: 1500 },
  ];

  const statuses: Array<"pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "returned"> = 
    ["pending", "confirmed", "processing", "shipped", "delivered"];
  
  const couriers = ["leopards", "postex", "tcs"];

  // Generate 5-10 new orders
  const orderCount = Math.floor(Math.random() * 6) + 5;
  let syncedCount = 0;

  for (let i = 0; i < orderCount; i++) {
    const customer = customerNames[Math.floor(Math.random() * customerNames.length)];
    const city = cities[Math.floor(Math.random() * cities.length)];
    const product = products[Math.floor(Math.random() * products.length)];
    const quantity = Math.floor(Math.random() * 3) + 1;
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const courier = couriers[Math.floor(Math.random() * couriers.length)];
    
    const subtotal = product.price * quantity;
    const shippingCost = Math.random() > 0.5 ? 200 : 0;
    const total = subtotal + shippingCost;
    
    const isCod = Math.random() > 0.3; // 70% COD orders
    
    // Create order
    const order = await storage.createOrder({
      merchantId,
      shopifyOrderId: `shopify_${Date.now()}_${i}`,
      orderNumber: generateOrderNumber(),
      customerName: customer,
      customerEmail: `${customer.toLowerCase().replace(" ", ".")}@example.com`,
      customerPhone: `+92${Math.floor(Math.random() * 900000000) + 100000000}`,
      shippingAddress: `House ${Math.floor(Math.random() * 500) + 1}, Street ${Math.floor(Math.random() * 50) + 1}`,
      city,
      country: "Pakistan",
      lineItems: [{ name: product.name, quantity, price: product.price }],
      subtotalAmount: subtotal.toString(),
      shippingAmount: shippingCost.toString(),
      totalAmount: total.toString(),
      currency: "PKR",
      paymentMethod: isCod ? "cod" : "prepaid",
      paymentStatus: isCod ? "pending" : "paid",
      orderStatus: status,
    });

    // Create shipment for non-pending orders
    if (status !== "pending") {
      const shipmentStatus = status === "delivered" ? "delivered" : 
                            status === "shipped" ? "in_transit" : "booked";
      
      await storage.createShipment({
        merchantId,
        orderId: order.id,
        courierName: courier,
        trackingNumber: generateTrackingNumber(courier),
        status: shipmentStatus,
        estimatedDelivery: new Date(Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000),
        shippingCost: shippingCost.toString(),
        weight: (Math.random() * 2 + 0.5).toFixed(2),
      });
    }

    // Create COD record for COD orders
    if (isCod) {
      const codStatus = status === "delivered" ? "received" : "pending";
      const courierFee = Math.floor(total * 0.03); // 3% courier fee
      await storage.createCodReconciliation({
        merchantId,
        orderId: order.id,
        courierName: courier,
        trackingNumber: order.orderNumber,
        codAmount: total.toString(),
        courierFee: courierFee.toString(),
        netAmount: (total - courierFee).toString(),
        status: codStatus,
      });
    }

    syncedCount++;
  }

  // Update last sync timestamp
  const store = await storage.getShopifyStore(merchantId);
  if (store) {
    await storage.updateShopifyStore(store.id, { lastSyncAt: new Date() });
  }

  return { synced: syncedCount, total: orderCount };
}

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

  function normalizeCourierName(raw: string): string {
    const name = raw.toLowerCase().trim();
    if (name.includes('leopard')) return 'leopards';
    if (name.includes('postex') || name.includes('post ex')) return 'postex';
    if (name.includes('tcs')) return 'tcs';
    return name;
  }

  async function getCourierCredentials(merchantId: string, courierName: string): Promise<{ apiKey: string | null; apiSecret: string | null } | null> {
    const normalized = normalizeCourierName(courierName);
    const accounts = await storage.getCourierAccounts(merchantId);
    const account = accounts.find(a => a.courierName === normalized);
    const settings = (account?.settings as Record<string, any>) || {};

    if (normalized === 'leopards') {
      const apiKey = (!settings.useEnvCredentials && account?.apiKey) || process.env.LEOPARDS_API_KEY || null;
      const apiSecret = (!settings.useEnvCredentials && account?.apiSecret) || process.env.LEOPARDS_API_PASSWORD || null;
      if (!apiKey || !apiSecret) return null;
      return { apiKey, apiSecret };
    }

    if (normalized === 'postex') {
      const apiKey = (!settings.useEnvCredentials && account?.apiKey) || process.env.POSTEX_API_TOKEN || null;
      if (!apiKey) return null;
      return { apiKey, apiSecret: null };
    }

    return null;
  }

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

      const { search, status, courier, city, month, workflowStatus, page, pageSize } = req.query;
      
      const result = await storage.getOrders(merchantId, {
        search: search as string,
        status: status as string,
        courier: courier as string,
        city: city as string,
        month: month as string,
        workflowStatus: workflowStatus as string,
        page: parseInt(page as string) || 1,
        pageSize: parseInt(pageSize as string) || 20,
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/counts", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const counts = await storage.getWorkflowCounts(merchantId);
      res.json(counts);
    } catch (error) {
      console.error("Error fetching workflow counts:", error);
      res.status(500).json({ message: "Failed to fetch counts" });
    }
  });

  app.post("/api/orders/:id/confirm", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const userId = (req.user as any)?.id || "unknown";
      const orderId = req.params.id as string;
      const order = await storage.confirmOrder(merchantId, orderId, userId);
      if (!order) {
        return res.status(404).json({ message: "Order not found or not in NEW status" });
      }
      res.json(order);
    } catch (error) {
      console.error("Error confirming order:", error);
      res.status(500).json({ message: "Failed to confirm order" });
    }
  });

  app.post("/api/orders/:id/cancel", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const userId = (req.user as any)?.id || "unknown";
      const orderId = req.params.id as string;
      const { reason } = req.body;
      if (!reason || typeof reason !== "string") {
        return res.status(400).json({ message: "Cancel reason is required" });
      }

      const order = await storage.cancelOrder(merchantId, orderId, userId, reason);
      if (!order) {
        return res.status(404).json({ message: "Order not found or not in NEW status" });
      }
      res.json(order);
    } catch (error) {
      console.error("Error cancelling order:", error);
      res.status(500).json({ message: "Failed to cancel order" });
    }
  });

  app.get("/api/orders/cities", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      
      const cities = await storage.getUniqueCities(merchantId);
      res.json({ cities });
    } catch (error) {
      console.error("Error fetching cities:", error);
      res.status(500).json({ message: "Failed to fetch cities" });
    }
  });

  app.get("/api/orders/:id", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      // Get order with merchantId scope (will return undefined if not found or not owned)
      const orderId = req.params.id as string;
      const order = await storage.getOrderById(merchantId, orderId);
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

  // Update order remark
  app.patch("/api/orders/:id/remark", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { value } = req.body;
      if (typeof value !== 'string') {
        return res.status(400).json({ message: "Invalid remark value" });
      }

      // Verify order exists and belongs to merchant
      const order = await storage.getOrderById(merchantId, req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const updated = await storage.updateOrder(merchantId, req.params.id, { remark: value });
      res.json(updated);
    } catch (error) {
      console.error("Error updating remark:", error);
      res.status(500).json({ message: "Failed to update remark" });
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

  // Generate COD records from delivered orders
  app.post("/api/cod-reconciliation/generate", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const result = await storage.generateCodRecordsFromOrders(merchantId);
      res.json({ 
        message: `Generated ${result.created} COD records (${result.skipped} already existed)`,
        ...result 
      });
    } catch (error) {
      console.error("Error generating COD records:", error);
      res.status(500).json({ message: "Failed to generate COD records" });
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
      const memberId = req.params.id as string;
      const existingMember = await storage.getTeamMemberById(merchantId, memberId);
      if (!existingMember) {
        return res.status(404).json({ message: "Team member not found" });
      }

      // Update role (scoped by merchantId)
      const member = await storage.updateTeamMemberRole(merchantId, memberId, validated.data.role);
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
      const memberId = req.params.id as string;
      const existingMember = await storage.getTeamMemberById(merchantId, memberId);
      if (!existingMember) {
        return res.status(404).json({ message: "Team member not found" });
      }

      // Delete (scoped by merchantId)
      await storage.deleteTeamMember(merchantId, memberId);
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

      // Filter out demo store in production if needed, or just return real data
      const isShopifyConnected = !!(shopifyStore?.isConnected && shopifyStore?.accessToken && shopifyStore.accessToken !== "demo-access-token");

      const envCredentials: Record<string, { hasKey: boolean; hasSecret: boolean }> = {
        leopards: {
          hasKey: !!process.env.LEOPARDS_API_KEY,
          hasSecret: !!process.env.LEOPARDS_API_PASSWORD,
        },
        postex: {
          hasKey: !!process.env.POSTEX_API_TOKEN,
          hasSecret: false,
        },
      };

      res.json({
        shopify: {
          isConnected: isShopifyConnected,
          shopDomain: shopifyStore?.shopDomain || null,
          lastSyncAt: shopifyStore?.lastSyncAt || null,
        },
        couriers: couriers.map((c) => {
          const settings = (c.settings as Record<string, any>) || {};
          return {
            id: c.id,
            name: c.courierName,
            isActive: c.isActive,
            accountNumber: c.accountNumber,
            hasDbCredentials: !!(c.apiKey || c.apiSecret),
            useEnvCredentials: !!settings.useEnvCredentials,
          };
        }),
        envCredentials,
      });
    } catch (error) {
      console.error("Error fetching integrations:", error);
      res.status(500).json({ message: "Failed to fetch integrations" });
    }
  });

  // Shopify connect schema
  const shopifyConnectSchema = z.object({
    storeDomain: z.string().min(1, "Store domain is required"),
  });

  app.post("/api/integrations/shopify/connect", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const validated = shopifyConnectSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ message: validated.error.errors[0].message });
      }

      const { storeDomain } = validated.data;
      const fullDomain = storeDomain.includes('.myshopify.com') 
        ? storeDomain 
        : `${storeDomain}.myshopify.com`;

      // Check if store already exists for this merchant
      const existingStore = await storage.getShopifyStore(merchantId);
      
      if (existingStore) {
        // Update existing store
        await storage.updateShopifyStore(existingStore.id, {
          shopDomain: fullDomain,
          isConnected: true,
          accessToken: "demo-access-token", // In production, this comes from OAuth
        });
      } else {
        // Create new store connection
        await storage.createShopifyStore({
          merchantId,
          shopDomain: fullDomain,
          accessToken: "demo-access-token",
          isConnected: true,
        });
      }

      // Trigger sync for last 2 months
      await shopifyService.syncOrders(merchantId, storeDomain);

      res.json({ success: true, message: "Shopify store connected successfully" });
    } catch (error) {
      console.error("Error connecting Shopify:", error);
      res.status(500).json({ message: "Failed to connect Shopify" });
    }
  });

  // Manual Shopify connection with access token or legacy API key/password (bypasses OAuth)
  app.post("/api/integrations/shopify/manual-connect", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { storeDomain, accessToken, apiKey, apiPassword } = req.body;
      
      if (!storeDomain) {
        return res.status(400).json({ message: "Store domain is required" });
      }

      // Need either access token OR legacy api key/password
      const hasModernToken = !!accessToken;
      const hasLegacyCredentials = apiKey && apiPassword;
      
      if (!hasModernToken && !hasLegacyCredentials) {
        return res.status(400).json({ message: "Either access token or API key/password is required" });
      }

      // Validate store domain format
      const shopDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
      if (!shopDomainRegex.test(storeDomain)) {
        return res.status(400).json({ message: "Invalid store domain format" });
      }

      // Validate credentials by making a test API call
      try {
        let testResponse;
        
        if (hasModernToken) {
          // Modern access token auth
          testResponse = await fetch(`https://${storeDomain}/admin/api/2024-01/shop.json`, {
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json',
            },
          });
        } else {
          // Legacy API key/password auth (Basic Auth)
          const credentials = Buffer.from(`${apiKey}:${apiPassword}`).toString('base64');
          testResponse = await fetch(`https://${storeDomain}/admin/api/2024-01/shop.json`, {
            headers: {
              'Authorization': `Basic ${credentials}`,
              'Content-Type': 'application/json',
            },
          });
        }

        if (!testResponse.ok) {
          const errorText = await testResponse.text();
          console.error("Shopify API error:", testResponse.status, errorText);
          return res.status(400).json({ message: "Invalid credentials - could not connect to Shopify" });
        }
      } catch (err) {
        console.error("Shopify connection error:", err);
        return res.status(400).json({ message: "Could not verify credentials with Shopify" });
      }

      // Store credentials - for legacy apps, store as "apiKey:apiPassword" format
      const tokenToStore = hasModernToken ? accessToken : `${apiKey}:${apiPassword}`;

      // Store or update the Shopify connection
      const existingStore = await storage.getShopifyStore(merchantId);
      
      if (existingStore) {
        await storage.updateShopifyStore(existingStore.id, {
          shopDomain: storeDomain,
          accessToken: tokenToStore,
          isConnected: true,
          lastSyncAt: new Date(),
        });
      } else {
        await storage.createShopifyStore({
          merchantId,
          shopDomain: storeDomain,
          accessToken: tokenToStore,
          scopes: 'read_orders',
          isConnected: true,
        });
      }

      // Trigger sync for last 2 months
      await shopifyService.syncOrders(merchantId, storeDomain);

      res.json({ success: true, message: "Shopify store connected successfully" });
    } catch (error) {
      console.error("Error manually connecting Shopify:", error);
      res.status(500).json({ message: "Failed to connect Shopify store" });
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

      const store = await storage.getShopifyStore(merchantId);
      if (!store || !store.isConnected) {
        return res.status(400).json({ message: "Shopify store is not connected" });
      }

      if (!store.accessToken || store.accessToken === "demo-access-token") {
        const result = await syncShopifyOrders(merchantId, store.shopDomain!);
        return res.json({ 
          success: true, 
          message: `Successfully synced ${result.synced} orders (demo mode)`,
          synced: result.synced,
          total: result.total 
        });
      }

      // Otherwise use the real Shopify service
      const forceFullSync = req.body?.forceFullSync === true;
      const result = await shopifyService.syncOrders(merchantId, store.shopDomain!, forceFullSync);
      res.json({ 
        success: true, 
        message: `Successfully synced ${result.synced} new orders, ${result.updated} updated`,
        synced: result.synced,
        updated: result.updated,
        total: result.total
      });
    } catch (error: any) {
      console.error("Error syncing Shopify:", error);
      res.status(500).json({ message: error.message || "Failed to sync Shopify" });
    }
  });

  app.get("/api/integrations/shopify/sync-status", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { getLastSyncResult, isSyncRunning } = await import('./services/autoSync');
      const lastResult = getLastSyncResult(merchantId);
      const running = isSyncRunning();
      res.json({
        autoSyncEnabled: true,
        intervalSeconds: 30,
        isRunning: running,
        lastSync: lastResult,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get sync status" });
    }
  });

  // Fix city data for existing orders using GraphQL
  // This is needed because Shopify Basic plan restricts PII in REST API
  // but GraphQL returns some fields like city
  app.post("/api/integrations/shopify/fix-city-data", isAuthenticated, async (req, res) => {
    try {
      const { merchantId } = req.body.user;
      
      const store = await storage.getShopifyStore(merchantId);
      if (!store || !store.isConnected || !store.accessToken || !store.shopDomain) {
        return res.status(400).json({ message: "Shopify store not connected" });
      }

      // Get orders with missing city data
      const ordersWithMissingCity = await storage.getOrdersWithMissingCity(merchantId, 500);
      
      if (ordersWithMissingCity.length === 0) {
        return res.json({ 
          success: true, 
          message: "No orders need city data update",
          updated: 0 
        });
      }

      console.log(`[Fix City Data] Found ${ordersWithMissingCity.length} orders with missing city, triggering full re-sync...`);

      const result = await shopifyService.syncOrders(merchantId, store.shopDomain, true);

      res.json({ 
        success: true, 
        message: `Full re-sync complete: ${result.synced} new, ${result.updated} updated orders with complete data`,
        updated: result.updated,
        processed: result.total
      });
    } catch (error: any) {
      console.error("Error fixing city data:", error);
      res.status(500).json({ message: error.message || "Failed to fix city data" });
    }
  });

  app.get("/api/shopify/install", async (req, res) => {
    try {
      const { shop } = req.query;
      if (!shop || typeof shop !== 'string') {
        return res.status(400).json({ message: "Shop parameter is required" });
      }

      const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
      
      // Validate shop domain format (must be valid Shopify store domain)
      const shopDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
      if (!shopDomainRegex.test(shopDomain)) {
        return res.status(400).json({ message: "Invalid shop domain format" });
      }

      const state = crypto.randomBytes(16).toString('hex');

      (req.session as any).shopifyState = state;
      (req.session as any).shopDomain = shopDomain;

      const installUrl = shopifyService.getInstallUrl(shopDomain, state);
      res.redirect(installUrl);
    } catch (error) {
      console.error("Error initiating Shopify install:", error);
      res.status(500).json({ message: "Failed to initiate Shopify install" });
    }
  });

  app.get("/api/shopify/callback", async (req: any, res) => {
    try {
      const { code, shop, state, hmac } = req.query;

      if (!code || !shop || !state) {
        return res.redirect('/integrations?shopify=error&message=Missing+required+parameters');
      }

      // Validate state to prevent CSRF attacks
      const savedState = req.session?.shopifyState;
      if (state !== savedState) {
        console.warn("State mismatch - potential CSRF attack", { received: state, expected: savedState });
        return res.redirect('/integrations?shopify=error&message=Invalid+state+parameter');
      }

      // Validate shop domain format
      const shopDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
      if (!shopDomainRegex.test(shop as string)) {
        return res.redirect('/integrations?shopify=error&message=Invalid+shop+domain');
      }

      // Validate HMAC if provided (Shopify signs the callback)
      if (hmac) {
        const queryParams: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.query)) {
          if (typeof value === 'string') {
            queryParams[key] = value;
          }
        }
        const isValid = shopifyService.validateHmac(queryParams);
        if (!isValid) {
          console.warn("HMAC validation failed");
          return res.redirect('/integrations?shopify=error&message=Invalid+signature');
        }
      }

      // Clear the state from session after validation
      delete req.session.shopifyState;

      const { accessToken, scope } = await shopifyService.exchangeCodeForToken(shop as string, code as string);

      const userId = req.user?.claims?.sub;
      let merchantId: string | null = null;

      if (userId) {
        merchantId = await storage.getUserMerchantId(userId);
      }

      if (!merchantId) {
        const demoMerchant = await storage.getMerchantBySlug("demo-fashion");
        merchantId = demoMerchant?.id || null;
      }

      if (!merchantId) {
        return res.status(400).send("No merchant found. Please create a merchant account first.");
      }

      const existingStore = await storage.getShopifyStore(merchantId);
      
      if (existingStore) {
        await storage.updateShopifyStore(existingStore.id, {
          shopDomain: shop as string,
          accessToken,
          scopes: scope,
          isConnected: true,
          lastSyncAt: new Date(),
        });
      } else {
        await storage.createShopifyStore({
          merchantId,
          shopDomain: shop as string,
          accessToken,
          scopes: scope,
          isConnected: true,
        });
      }

      delete req.session.shopifyState;
      delete req.session.shopDomain;

      res.redirect('/integrations?shopify=connected');
    } catch (error) {
      console.error("Error in Shopify callback:", error);
      res.redirect('/integrations?shopify=error&message=' + encodeURIComponent(String(error)));
    }
  });

  // ============================================
  // DATA HEALTH & SYNC LOG ENDPOINTS
  // ============================================
  app.get("/api/data-health", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const [dataHealth, lastSync, recentSyncLogs] = await Promise.all([
        storage.getDataHealthStats(merchantId),
        storage.getShopifyStore(merchantId),
        storage.getRecentSyncLogs(merchantId, 10),
      ]);

      res.json({
        dataHealth,
        lastApiSyncAt: lastSync?.lastSyncAt || null,
        shopDomain: lastSync?.shopDomain || null,
        isConnected: lastSync?.isConnected || false,
        recentSyncLogs,
      });
    } catch (error) {
      console.error("Error fetching data health:", error);
      res.status(500).json({ message: "Failed to fetch data health" });
    }
  });

  app.get("/api/sync-logs", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const limit = parseInt(req.query.limit as string) || 20;
      const logs = await storage.getRecentSyncLogs(merchantId, limit);
      res.json({ logs });
    } catch (error) {
      console.error("Error fetching sync logs:", error);
      res.status(500).json({ message: "Failed to fetch sync logs" });
    }
  });

  app.post("/api/integrations/couriers", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const validated = courierAccountSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ message: validated.error.errors[0].message });
      }

      const { courierName, apiKey, apiSecret, accountNumber, useEnvCredentials } = validated.data;

      const existing = (await storage.getCourierAccounts(merchantId)).find(c => c.courierName === courierName);

      const settings: Record<string, any> = { useEnvCredentials: !!useEnvCredentials };

      if (existing) {
        const account = await storage.updateCourierAccount(existing.id, {
          apiKey: useEnvCredentials ? null : (apiKey || existing.apiKey),
          apiSecret: useEnvCredentials ? null : (apiSecret || existing.apiSecret),
          accountNumber: accountNumber || existing.accountNumber,
          settings,
          isActive: true,
        });
        res.json(account);
      } else {
        const account = await storage.createCourierAccount({
          merchantId,
          courierName,
          apiKey: useEnvCredentials ? null : (apiKey || null),
          apiSecret: useEnvCredentials ? null : (apiSecret || null),
          accountNumber: accountNumber || null,
          settings,
          isActive: true,
        });
        res.json(account);
      }
    } catch (error) {
      console.error("Error saving courier:", error);
      res.status(500).json({ message: "Failed to save courier" });
    }
  });

  app.post("/api/integrations/couriers/test", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { courierName } = req.body;
      if (!courierName) return res.status(400).json({ message: "courierName required" });

      const creds = await getCourierCredentials(merchantId, courierName);
      if (!creds) {
        return res.json({ success: false, message: "No credentials configured" });
      }

      if (courierName === 'leopards') {
        try {
          const resp = await fetch('https://merchantapi.leopardscourier.com/api/getAllCities/format/json/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: creds.apiKey, api_password: creds.apiSecret }),
          });
          const data = await resp.json();
          if (data.status === 1) {
            return res.json({ success: true, message: `Connected! ${data.city_list?.length || 0} cities available.` });
          }
          return res.json({ success: false, message: data.error || 'Authentication failed' });
        } catch (err: any) {
          return res.json({ success: false, message: err.message });
        }
      }

      if (courierName === 'postex') {
        try {
          const resp = await fetch('https://api.postex.pk/services/integration/api/order/v2/get-operational-city', {
            headers: { 'Content-Type': 'application/json', 'token': creds.apiKey! },
          });
          const data = await resp.json();
          if (data.statusCode === '200') {
            return res.json({ success: true, message: `Connected! ${data.dist?.length || 0} operational cities.` });
          }
          return res.json({ success: false, message: data.statusMessage || 'Authentication failed' });
        } catch (err: any) {
          return res.json({ success: false, message: err.message });
        }
      }

      return res.json({ success: false, message: `Test not available for ${courierName}` });
    } catch (error) {
      console.error("Error testing courier:", error);
      res.status(500).json({ message: "Failed to test courier connection" });
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

  // Sync courier statuses for orders with tracking numbers (batched)
  app.post("/api/couriers/sync-statuses", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { trackShipment } = await import('./services/couriers');
      const forceRefresh = req.body?.forceRefresh === true;
      
      const trackableOrders = await storage.getOrdersForCourierSync(merchantId, {
        forceRefresh,
        limit: 1500,
      });

      if (trackableOrders.length === 0) {
        return res.json({ success: true, updated: 0, failed: 0, skipped: 0, total: 0, message: "No orders need status updates" });
      }

      console.log(`[Courier Sync] Syncing ${trackableOrders.length} orders (forceRefresh=${forceRefresh})...`);

      const courierCredsCache = new Map<string, { apiKey: string | null; apiSecret: string | null } | null>();
      for (const order of trackableOrders) {
        const cn = normalizeCourierName(order.courierName!);
        if (!courierCredsCache.has(cn)) {
          courierCredsCache.set(cn, await getCourierCredentials(merchantId, cn));
        }
      }

      let updated = 0;
      let failed = 0;
      let skipped = 0;

      const batchSize = 10;
      for (let i = 0; i < trackableOrders.length; i += batchSize) {
        const batch = trackableOrders.slice(i, i + batchSize);
        
        const results = await Promise.allSettled(
          batch.map(async (order) => {
            try {
              const cn = normalizeCourierName(order.courierName!);
              const creds = courierCredsCache.get(cn);
              if (!creds) {
                return 'skipped';
              }
              const credObj = { apiKey: creds.apiKey || undefined, apiSecret: creds.apiSecret || undefined };
              
              const result = await trackShipment(order.courierName!, order.courierTracking!, credObj);
              
              if (result && result.success) {
                await storage.updateOrder(merchantId, order.id, {
                  shipmentStatus: result.status,
                  lastTrackingUpdate: new Date(),
                });
                return 'updated';
              }
              return 'failed';
            } catch (err) {
              console.error(`[Courier Sync] Error for ${order.courierTracking}:`, err);
              return 'failed';
            }
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            if (result.value === 'updated') updated++;
            else if (result.value === 'skipped') skipped++;
            else failed++;
          } else {
            failed++;
          }
        }
        
        if (i + batchSize < trackableOrders.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      console.log(`[Courier Sync] Complete: ${updated} updated, ${failed} failed, ${skipped} skipped (no creds)`);

      res.json({ 
        success: true, 
        updated, 
        failed,
        skipped,
        total: trackableOrders.length 
      });
    } catch (error) {
      console.error("Error syncing courier statuses:", error);
      res.status(500).json({ message: "Failed to sync courier statuses" });
    }
  });

  // Track single shipment
  app.get("/api/couriers/track/:courier/:trackingNumber", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const courier = req.params.courier as string;
      const trackingNumber = req.params.trackingNumber as string;
      const { trackShipment } = await import('./services/couriers');
      
      const creds = await getCourierCredentials(merchantId, courier);
      const credObj = creds ? { apiKey: creds.apiKey || undefined, apiSecret: creds.apiSecret || undefined } : undefined;
      const result = await trackShipment(courier, trackingNumber, credObj);
      
      if (!result) {
        return res.status(400).json({ message: "Unknown courier" });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error tracking shipment:", error);
      res.status(500).json({ message: "Failed to track shipment" });
    }
  });

  return httpServer;
}
