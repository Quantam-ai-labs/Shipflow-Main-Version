import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { shipmentPrintRecords, users, merchants, adminActionLogs, teamMembers } from "@shared/schema";
import { and, eq, inArray, ilike, or } from "drizzle-orm";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { z } from "zod";
import crypto from "crypto";
import { shopifyService } from "./services/shopify";
import { transitionOrder, bulkTransitionOrders, revertOrder } from "./services/workflowTransition";
import { addPayment, deletePayment, markFullyPaid, resetPayments, bulkMarkPrepaid, recalculateOrderPayment } from "./services/payments";
import { encryptToken, decryptToken } from './services/encryption';
import { registerShopifyWebhooks } from './services/webhookRegistration';
import { webhookHandler } from './services/webhookHandler';

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
  settings: z.record(z.any()).optional(),
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

// Helper to get user ID from session
function getSessionUserId(req: any): string | null {
  return req.session?.userId || null;
}

// Helper to get user name from DB for audit logging
async function getSessionUserName(req: any): Promise<string> {
  const userId = getSessionUserId(req);
  if (!userId) return "Unknown";
  try {
    const user = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, userId));
    if (user.length > 0) {
      return ((user[0].firstName || "") + " " + (user[0].lastName || "")).trim() || "Unknown";
    }
  } catch {}
  return "Unknown";
}

// Helper to get merchant ID from authenticated user
async function getMerchantIdForUser(req: any): Promise<string | null> {
  const userId = getSessionUserId(req);
  if (!userId) {
    return null;
  }

  const existingMerchantId = await storage.getUserMerchantId(userId);
  if (existingMerchantId) {
    return existingMerchantId;
  }

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

      const { search, status, courier, city, month, page, pageSize, workflowStatus, pendingReasonType } = req.query;
      
      const result = await storage.getOrders(merchantId, {
        search: search as string,
        status: status as string,
        courier: courier as string,
        city: city as string,
        month: month as string,
        page: parseInt(page as string) || 1,
        pageSize: parseInt(pageSize as string) || 20,
        workflowStatus: workflowStatus as string,
        pendingReasonType: pendingReasonType as string,
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
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

  app.get("/api/orders/statuses", isAuthenticated, async (req, res) => {
    try {
      const { UNIVERSAL_STATUSES } = await import('./services/statusNormalization');
      const { getStatusDisplayLabel } = await import('./services/statusNormalization');
      res.json({ 
        statuses: UNIVERSAL_STATUSES.map(s => ({ value: s, label: getStatusDisplayLabel(s) }))
      });
    } catch (error) {
      console.error("Error fetching statuses:", error);
      res.status(500).json({ message: "Failed to fetch statuses" });
    }
  });

  app.get("/api/orders/workflow-counts", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const counts = await storage.getWorkflowCounts(merchantId);
      res.json(counts);
    } catch (error) {
      console.error("Error fetching workflow counts:", error);
      res.status(500).json({ message: "Failed to fetch workflow counts" });
    }
  });

  app.post("/api/orders/:id/workflow", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const orderId = req.params.id;
      const { action, cancelReason, pendingReasonType, pendingReason, holdUntil, customerPhone, shippingAddress, city } = req.body;
      const userId = getSessionUserId(req) || "system";

      let toStatus: string;
      let reason: string | undefined;
      let extraData: any = {};

      switch (action) {
        case "confirm":
          toStatus = "READY_TO_SHIP";
          extraData = { confirmedAt: new Date(), confirmedByUserId: userId };
          break;
        case "cancel":
          if (!cancelReason) return res.status(400).json({ message: "Cancel reason is required" });
          toStatus = "CANCELLED";
          reason = cancelReason;
          extraData = { cancelledAt: new Date(), cancelledByUserId: userId, cancelReason };
          break;
        case "pending":
          if (!pendingReasonType) return res.status(400).json({ message: "Pending reason type is required" });
          toStatus = "PENDING";
          reason = pendingReason;
          extraData = { pendingReasonType, pendingReason: pendingReason || "" };
          break;
        case "hold":
          if (!holdUntil) return res.status(400).json({ message: "Hold until date is required" });
          toStatus = "HOLD";
          extraData = { holdUntil: new Date(holdUntil), holdCreatedAt: new Date(), holdCreatedByUserId: userId };
          break;
        case "release-hold":
          toStatus = "READY_TO_SHIP";
          extraData = { confirmedAt: new Date(), confirmedByUserId: userId, holdUntil: null };
          break;
        case "fix-confirm":
          toStatus = "READY_TO_SHIP";
          extraData = { confirmedAt: new Date(), confirmedByUserId: userId, pendingReason: null, pendingReasonType: null };
          if (customerPhone) extraData.customerPhone = customerPhone;
          if (shippingAddress) extraData.shippingAddress = shippingAddress;
          if (city) extraData.city = city;
          break;
        case "move-to-pending":
          if (!pendingReasonType) return res.status(400).json({ message: "Pending reason type is required" });
          toStatus = "PENDING";
          reason = pendingReason;
          extraData = { pendingReasonType, pendingReason: pendingReason || "", holdUntil: null };
          break;
        case "revert":
          const revertResult = await revertOrder(merchantId, orderId, userId, req.body.reason);
          if (!revertResult.success) return res.status(400).json({ message: revertResult.error });
          return res.json(revertResult.order);
        default:
          return res.status(400).json({ message: "Invalid action" });
      }

      const result = await transitionOrder({ merchantId, orderId, toStatus, action, actorUserId: userId, reason, extraData });
      if (!result.success) return res.status(400).json({ message: result.error });
      res.json(result.order);
    } catch (error) {
      console.error("Error updating workflow:", error);
      res.status(500).json({ message: "Failed to update workflow" });
    }
  });

  app.post("/api/orders/bulk-workflow", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { orderIds, action, cancelReason, pendingReasonType, pendingReason, holdUntil } = req.body;
      const userId = getSessionUserId(req) || "system";

      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ message: "Order IDs are required" });
      }

      let toStatus: string;
      let reason: string | undefined;
      let extraData: any = {};

      switch (action) {
        case "confirm":
          toStatus = "READY_TO_SHIP";
          extraData = { confirmedAt: new Date(), confirmedByUserId: userId };
          break;
        case "cancel":
          if (!cancelReason) return res.status(400).json({ message: "Cancel reason is required" });
          toStatus = "CANCELLED";
          reason = cancelReason;
          extraData = { cancelledAt: new Date(), cancelledByUserId: userId, cancelReason };
          break;
        case "pending":
          if (!pendingReasonType) return res.status(400).json({ message: "Pending reason type is required" });
          toStatus = "PENDING";
          reason = pendingReason;
          extraData = { pendingReasonType, pendingReason: pendingReason || "" };
          break;
        case "hold":
          if (!holdUntil) return res.status(400).json({ message: "Hold until date is required" });
          toStatus = "HOLD";
          extraData = { holdUntil: new Date(holdUntil), holdCreatedAt: new Date(), holdCreatedByUserId: userId };
          break;
        case "release-hold":
          toStatus = "READY_TO_SHIP";
          extraData = { confirmedAt: new Date(), confirmedByUserId: userId, holdUntil: null };
          break;
        default:
          return res.status(400).json({ message: "Invalid action" });
      }

      const result = await bulkTransitionOrders({ merchantId, orderIds, toStatus, action, actorUserId: userId, reason, extraData });
      res.json(result);
    } catch (error) {
      console.error("Error bulk updating workflow:", error);
      res.status(500).json({ message: "Failed to bulk update workflow" });
    }
  });

  app.get("/api/orders/:id/audit-log", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const orderId = req.params.id;
      const logs = await storage.getOrderAuditLog(merchantId, orderId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching audit log:", error);
      res.status(500).json({ message: "Failed to fetch audit log" });
    }
  });

  app.get("/api/orders/:id/change-log", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const orderId = req.params.id;
      const logs = await storage.getOrderChangeLog(merchantId, orderId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching change log:", error);
      res.status(500).json({ message: "Failed to fetch change log" });
    }
  });

  const PICKED_UP_OR_BEYOND_STATUSES = [
    'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION', 'OUT_FOR_DELIVERY',
    'DELIVERY_ATTEMPTED', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNED_TO_SHIPPER', 'RETURN_IN_TRANSIT'
  ];

  app.patch("/api/orders/:id/customer", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const orderId = req.params.id;

      const order = await storage.getOrderById(merchantId, orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });

      if (order.shipmentStatus && PICKED_UP_OR_BEYOND_STATUSES.includes(order.shipmentStatus)) {
        return res.status(403).json({ message: "Order is locked - courier has picked up the shipment" });
      }

      const { customerName, customerPhone, shippingAddress, city } = req.body;

      const updateData: any = {};
      const fieldsToCheck: Array<{ key: string; newVal: any }> = [];
      if (customerName !== undefined) { updateData.customerName = customerName; fieldsToCheck.push({ key: 'customerName', newVal: customerName }); }
      if (customerPhone !== undefined) { updateData.customerPhone = customerPhone; fieldsToCheck.push({ key: 'customerPhone', newVal: customerPhone }); }
      if (shippingAddress !== undefined) { updateData.shippingAddress = shippingAddress; fieldsToCheck.push({ key: 'shippingAddress', newVal: shippingAddress }); }
      if (city !== undefined) { updateData.city = city; fieldsToCheck.push({ key: 'city', newVal: city }); }

      const updated = await storage.updateOrderWorkflow(merchantId, orderId, updateData);
      if (!updated) return res.status(404).json({ message: "Order not found" });

      const actorUserId = getSessionUserId(req) || null;
      const actorName = await getSessionUserName(req);

      for (const field of fieldsToCheck) {
        const oldValue = (order as any)[field.key];
        if (String(oldValue ?? "") !== String(field.newVal ?? "")) {
          await storage.createOrderChangeLog({
            orderId,
            merchantId,
            changeType: "FIELD_EDIT",
            fieldName: field.key,
            oldValue: oldValue != null ? String(oldValue) : null,
            newValue: field.newVal != null ? String(field.newVal) : null,
            actorUserId,
            actorName,
            actorType: "user",
          });
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating customer info:", error);
      res.status(500).json({ message: "Failed to update customer info" });
    }
  });

  app.post("/api/orders/:id/cancel-booking", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const orderId = req.params.id;

      const order = await storage.getOrderById(merchantId, orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });

      if (order.workflowStatus !== "FULFILLED") {
        return res.status(400).json({ message: "Order must be in FULFILLED status to cancel booking" });
      }

      if (order.shipmentStatus && PICKED_UP_OR_BEYOND_STATUSES.includes(order.shipmentStatus)) {
        return res.status(403).json({ message: "Cannot cancel - courier has already picked up" });
      }

      const oldCourierTracking = order.courierTracking;
      const oldCourierName = order.courierName;

      await storage.updateOrderWorkflow(merchantId, orderId, {
        courierName: null,
        courierTracking: null,
        courierSlipUrl: null,
        bookingStatus: null,
        bookingError: null,
        bookedAt: null,
        shipmentStatus: 'Unfulfilled',
        courierRawStatus: null,
      });

      const userId = getSessionUserId(req) || "system";
      const result = await transitionOrder({
        merchantId,
        orderId,
        toStatus: "PENDING",
        action: "cancel_booking",
        actorUserId: userId,
        actorType: "user",
        reason: "Booking cancelled by user",
      });

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      const actorName = await getSessionUserName(req);

      await storage.createOrderChangeLog({
        orderId,
        merchantId,
        changeType: "BOOKING_CANCELLED",
        actorUserId: userId,
        actorName,
        actorType: "user",
        metadata: { oldCourierTracking, oldCourierName },
      });

      res.json(result.order);
    } catch (error) {
      console.error("Error cancelling booking:", error);
      res.status(500).json({ message: "Failed to cancel booking" });
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

      // Get change log
      const changeLog = await storage.getOrderChangeLog(merchantId, order.id);

      res.json({
        ...order,
        shipments: shipmentsWithEvents,
        remarks: orderRemarks,
        changeLog,
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

      const userId = getSessionUserId(req) || "unknown";

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

  // ============================================
  // ORDER PAYMENTS
  // ============================================
  app.get("/api/orders/:id/payments", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const order = await storage.getOrderById(merchantId, req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      const payments = await storage.getOrderPayments(merchantId, req.params.id);
      const totalAmount = parseFloat(order.totalAmount) || 0;
      const prepaidAmount = parseFloat(order.prepaidAmount || "0");
      const codRemaining = parseFloat(order.codRemaining || String(totalAmount));
      res.json({
        payments,
        totalAmount,
        prepaidAmount,
        codRemaining,
        codPaymentStatus: order.codPaymentStatus || "UNPAID",
        isBooked: order.workflowStatus === "FULFILLED",
      });
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.post("/api/orders/:id/payments", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const order = await storage.getOrderById(merchantId, req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.shipmentStatus && PICKED_UP_OR_BEYOND_STATUSES.includes(order.shipmentStatus)) {
        return res.status(403).json({ message: "Order is locked - courier has picked up the shipment" });
      }

      const { amount, method, reference, notes } = req.body;
      if (!amount || typeof amount !== "number" || amount <= 0) {
        return res.status(400).json({ message: "Amount must be a positive number" });
      }
      if (!method) return res.status(400).json({ message: "Payment method is required" });
      const userId = getSessionUserId(req) || "unknown";
      const state = await addPayment(merchantId, req.params.id, amount, method, userId, reference, notes);
      res.json(state);
    } catch (error: any) {
      console.error("Error adding payment:", error);
      res.status(400).json({ message: error.message || "Failed to add payment" });
    }
  });

  app.delete("/api/orders/:orderId/payments/:paymentId", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const state = await deletePayment(merchantId, req.params.paymentId, req.params.orderId);
      res.json(state);
    } catch (error: any) {
      console.error("Error deleting payment:", error);
      res.status(400).json({ message: error.message || "Failed to delete payment" });
    }
  });

  app.post("/api/orders/:id/payments/mark-paid", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { method } = req.body;
      const userId = getSessionUserId(req) || "unknown";
      const state = await markFullyPaid(merchantId, req.params.id, method || "CASH", userId);
      res.json(state);
    } catch (error: any) {
      console.error("Error marking fully paid:", error);
      res.status(400).json({ message: error.message || "Failed to mark as paid" });
    }
  });

  app.post("/api/orders/:id/payments/reset", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const state = await resetPayments(merchantId, req.params.id);
      res.json(state);
    } catch (error: any) {
      console.error("Error resetting payments:", error);
      res.status(400).json({ message: error.message || "Failed to reset payments" });
    }
  });

  app.post("/api/orders/bulk-mark-prepaid", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      const { orderIds, method } = req.body;
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ message: "orderIds array is required" });
      }
      const userId = getSessionUserId(req) || "unknown";
      const result = await bulkMarkPrepaid(merchantId, orderIds, method || "CASH", userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error bulk marking prepaid:", error);
      res.status(500).json({ message: error.message || "Failed to bulk mark prepaid" });
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
      const userId = getSessionUserId(req) || "unknown";

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
            settings,
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

      const tokenToStore = hasModernToken ? accessToken : `${apiKey}:${apiPassword}`;
      const encryptedTokenToStore = encryptToken(tokenToStore);

      const existingStore = await storage.getShopifyStore(merchantId);
      
      if (existingStore) {
        await storage.updateShopifyStore(existingStore.id, {
          shopDomain: storeDomain,
          accessToken: encryptedTokenToStore,
          isConnected: true,
          lastSyncAt: new Date(),
        });
      } else {
        await storage.createShopifyStore({
          merchantId,
          shopDomain: storeDomain,
          accessToken: encryptedTokenToStore,
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

  app.get("/api/shopify/auth-url", isAuthenticated, async (req, res) => {
    try {
      const { shop } = req.query;
      if (!shop || typeof shop !== 'string') {
        return res.status(400).json({ message: "Shop parameter is required" });
      }
      const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
      const shopDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
      if (!shopDomainRegex.test(shopDomain)) {
        return res.status(400).json({ message: "Invalid shop domain format" });
      }
      const state = crypto.randomBytes(16).toString('hex');
      (req.session as any).shopifyState = state;
      (req.session as any).shopDomain = shopDomain;
      const installUrl = shopifyService.getInstallUrl(shopDomain, state);
      res.json({ authUrl: installUrl, state });
    } catch (error) {
      console.error("Error generating Shopify auth URL:", error);
      res.status(500).json({ message: "Failed to generate auth URL" });
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
        return res.redirect('/onboarding?shopify=error&message=Missing+required+parameters');
      }

      const savedState = req.session?.shopifyState;
      if (state !== savedState) {
        console.warn("State mismatch - potential CSRF attack", { received: state, expected: savedState });
        return res.redirect('/onboarding?shopify=error&message=Invalid+state+parameter');
      }

      const shopDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
      if (!shopDomainRegex.test(shop as string)) {
        return res.redirect('/onboarding?shopify=error&message=Invalid+shop+domain');
      }

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
          return res.redirect('/onboarding?shopify=error&message=Invalid+signature');
        }
      }

      delete req.session.shopifyState;

      const userId = getSessionUserId(req);
      if (!userId) {
        return res.redirect('/onboarding?shopify=error&message=Not+authenticated');
      }

      const merchantId = await storage.getUserMerchantId(userId);
      if (!merchantId) {
        return res.redirect('/onboarding?shopify=error&message=No+merchant+account');
      }

      const { accessToken, scope } = await shopifyService.exchangeCodeForToken(shop as string, code as string);

      const encryptedToken = encryptToken(accessToken);

      const existingStore = await storage.getShopifyStore(merchantId);
      
      if (existingStore) {
        await storage.updateShopifyStore(existingStore.id, {
          shopDomain: shop as string,
          accessToken: encryptedToken,
          scopes: scope,
          isConnected: true,
          lastSyncAt: new Date(),
        });
      } else {
        await storage.createShopifyStore({
          merchantId,
          shopDomain: shop as string,
          accessToken: encryptedToken,
          scopes: scope,
          isConnected: true,
        });
      }

      try {
        await storage.updateMerchant(merchantId, { onboardingStep: 'SHOPIFY_CONNECTED' } as any);
      } catch (e) {
        console.error("Error advancing onboarding to SHOPIFY_CONNECTED:", e);
      }

      try {
        await registerShopifyWebhooks(merchantId);
      } catch (webhookErr) {
        console.error("Error registering Shopify webhooks:", webhookErr);
      }

      shopifyService.syncOrders(merchantId, shop as string)
        .then(() => {
          storage.updateMerchant(merchantId!, { onboardingStep: 'ORDERS_SYNCED' } as any)
            .catch(e => console.error("Error advancing onboarding to ORDERS_SYNCED:", e));
        })
        .catch(err => console.error("Background sync error:", err));

      delete req.session.shopifyState;
      delete req.session.shopDomain;

      res.redirect('/onboarding?shopify=connected');
    } catch (error) {
      console.error("Error in Shopify callback:", error);
      res.redirect('/onboarding?shopify=error&message=' + encodeURIComponent(String(error)));
    }
  });

  // Shopify Webhook Routes (no auth - verified via HMAC)
  app.post("/webhooks/shopify/orders-create", async (req: any, res) => {
    try {
      const hmac = req.headers['x-shopify-hmac-sha256'] as string;
      const topic = req.headers['x-shopify-topic'] as string;
      const shopDomain = req.headers['x-shopify-shop-domain'] as string;
      const webhookId = req.headers['x-shopify-webhook-id'] as string;
      const rawBody = req.rawBody as Buffer;
      
      if (!rawBody || !hmac) {
        return res.status(401).json({ message: "Missing HMAC or body" });
      }
      
      if (!webhookHandler.verifyHmac(rawBody, hmac)) {
        console.warn("[Webhook] HMAC verification failed for orders/create");
        return res.status(401).json({ message: "Invalid HMAC" });
      }
      
      res.status(200).json({ received: true });
      
      webhookHandler.processOrderWebhook('orders/create', shopDomain, rawBody, webhookId)
        .catch(err => console.error("[Webhook] Background processing error:", err));
    } catch (error) {
      console.error("[Webhook] orders/create error:", error);
      res.status(200).json({ received: true });
    }
  });

  app.post("/webhooks/shopify/orders-updated", async (req: any, res) => {
    try {
      const hmac = req.headers['x-shopify-hmac-sha256'] as string;
      const topic = req.headers['x-shopify-topic'] as string;
      const shopDomain = req.headers['x-shopify-shop-domain'] as string;
      const webhookId = req.headers['x-shopify-webhook-id'] as string;
      const rawBody = req.rawBody as Buffer;
      
      if (!rawBody || !hmac) {
        return res.status(401).json({ message: "Missing HMAC or body" });
      }
      
      if (!webhookHandler.verifyHmac(rawBody, hmac)) {
        console.warn("[Webhook] HMAC verification failed for orders/updated");
        return res.status(401).json({ message: "Invalid HMAC" });
      }
      
      res.status(200).json({ received: true });
      
      webhookHandler.processOrderWebhook('orders/updated', shopDomain, rawBody, webhookId)
        .catch(err => console.error("[Webhook] Background processing error:", err));
    } catch (error) {
      console.error("[Webhook] orders/updated error:", error);
      res.status(200).json({ received: true });
    }
  });

  app.post("/webhooks/shopify/fulfillments-create", async (req: any, res) => {
    try {
      const hmac = req.headers['x-shopify-hmac-sha256'] as string;
      const shopDomain = req.headers['x-shopify-shop-domain'] as string;
      const webhookId = req.headers['x-shopify-webhook-id'] as string;
      const rawBody = req.rawBody as Buffer;
      
      if (!rawBody || !hmac) {
        return res.status(401).json({ message: "Missing HMAC or body" });
      }
      
      if (!webhookHandler.verifyHmac(rawBody, hmac)) {
        console.warn("[Webhook] HMAC verification failed for fulfillments/create");
        return res.status(401).json({ message: "Invalid HMAC" });
      }
      
      res.status(200).json({ received: true });
      
      webhookHandler.processFulfillmentWebhook('fulfillments/create', shopDomain, rawBody, webhookId)
        .catch(err => console.error("[Webhook] Background processing error:", err));
    } catch (error) {
      console.error("[Webhook] fulfillments/create error:", error);
      res.status(200).json({ received: true });
    }
  });

  app.post("/api/shopify/reconcile", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;
      
      const store = await storage.getShopifyStore(merchantId);
      if (!store || !store.isConnected || !store.shopDomain) {
        return res.status(400).json({ message: "Shopify store not connected" });
      }
      
      const result = await shopifyService.syncOrders(merchantId, store.shopDomain, false);
      res.json({ 
        success: true,
        ...result,
        lastSyncAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Error reconciling orders:", error);
      res.status(500).json({ message: error.message || "Reconciliation failed" });
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

      const { courierName, apiKey, apiSecret, accountNumber, useEnvCredentials, settings: incomingSettings } = validated.data;

      const existing = (await storage.getCourierAccounts(merchantId)).find(c => c.courierName === courierName);

      const settings: Record<string, any> = { useEnvCredentials: !!useEnvCredentials, ...incomingSettings };

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

  app.post("/api/integrations/postex/addresses", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const creds = await getCourierCredentials(merchantId, "postex");
      if (!creds || !creds.apiKey) {
        return res.status(400).json({ message: "PostEx credentials not configured. Save your API Token first." });
      }

      const resp = await fetch("https://api.postex.pk/services/integration/api/order/v1/get-merchant-address", {
        headers: {
          "Content-Type": "application/json",
          "token": creds.apiKey,
        },
      });
      const data = await resp.json();
      console.log("[PostEx] Merchant addresses response:", JSON.stringify(data).substring(0, 500));

      if (data.statusCode === "200" && data.dist) {
        return res.json({ success: true, addresses: data.dist });
      }
      return res.json({ success: false, message: data.statusMessage || "Failed to fetch addresses" });
    } catch (error: any) {
      console.error("Error fetching PostEx addresses:", error);
      res.status(500).json({ message: error.message || "Failed to fetch PostEx addresses" });
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
              
              const result = await trackShipment(order.courierName!, order.courierTracking!, credObj, order.shipmentStatus);
              
              if (result && result.success) {
                await storage.updateOrder(merchantId, order.id, {
                  shipmentStatus: result.normalizedStatus,
                  courierRawStatus: result.rawCourierStatus,
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

  // ============================================
  // COURIER CITIES ENDPOINT
  // ============================================

  app.get("/api/booking/cities/:courier", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const courier = req.params.courier as string;
      if (!["leopards", "postex"].includes(courier)) {
        return res.status(400).json({ message: "Valid courier required" });
      }

      const creds = await getCourierCredentials(merchantId, courier);
      if (!creds) {
        return res.status(400).json({ message: `No ${courier} credentials configured` });
      }

      if (courier === "leopards") {
        const { loadLeopardsCities } = await import("./services/couriers/booking");
        const cities = await loadLeopardsCities(creds.apiKey!, creds.apiSecret!);
        res.json({
          courier,
          cities: cities.map(c => ({
            id: c.id,
            name: c.name,
            shipmentTypes: c.shipmentTypes,
          })),
        });
      } else {
        const { loadPostExCities } = await import("./services/couriers/booking");
        const cities = await loadPostExCities(creds.apiKey!);
        res.json({
          courier,
          cities: cities.map(c => ({
            name: c.name,
            isDeliveryCity: c.isDeliveryCity,
          })),
        });
      }
    } catch (error) {
      console.error("Error loading courier cities:", error);
      res.status(500).json({ message: "Failed to load cities" });
    }
  });

  // ============================================
  // COURIER BOOKING ENDPOINTS
  // ============================================

  app.post("/api/booking/preview", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { orderIds, courier } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ message: "Order IDs required" });
      }
      if (!courier || !["leopards", "postex"].includes(courier)) {
        return res.status(400).json({ message: "Valid courier required (leopards or postex)" });
      }

      const { validateOrderForBooking, normalizePhone, matchCityForCourier, loadLeopardsCities, loadPostExCities } = await import("./services/couriers/booking");

      const creds = await getCourierCredentials(merchantId, courier);
      let courierCities: Array<{ id?: number; name: string }> = [];
      if (creds) {
        if (courier === "leopards") {
          const leopCities = await loadLeopardsCities(creds.apiKey!, creds.apiSecret!);
          courierCities = leopCities.map(c => ({ id: c.id, name: c.name }));
        } else {
          const postCities = await loadPostExCities(creds.apiKey!);
          courierCities = postCities.filter(c => c.isDeliveryCity).map(c => ({ name: c.name }));
        }
      }

      const fetchedOrders = await storage.getOrdersByIds(merchantId, orderIds);
      const existingJobs = await storage.getBookingJobsByOrderIds(merchantId, orderIds);
      const bookedOrderIds = new Set(
        existingJobs.filter(j => j.status === "success" && j.trackingNumber).map(j => j.orderId)
      );

      const buildProductDescription = (order: any): string => {
        const items = order.lineItems as any[];
        if (items && items.length > 0) {
          return items.map((i: any) => {
            const name = (i.name || i.title || "Item").trim();
            const variant = i.variant_title ? ` - ${i.variant_title}` : "";
            const qty = i.quantity > 1 ? ` x ${i.quantity}` : "";
            return `${name}${variant}${qty}`;
          }).join(" | ");
        }
        return order.itemSummary || "Order items";
      };

      type PreviewOrder = {
        orderId: string; orderNumber: string; customerName: string; city: string;
        address: string; phone: string; weight: number; pieces: number;
        productDescription: string; codAmount: number; amount: string;
        cityMatched: boolean; matchedCityName: string; matchedCityId?: number;
        missingFields?: string[];
      };

      const valid: PreviewOrder[] = [];
      const invalid: PreviewOrder[] = [];
      const alreadyBooked: Array<{ orderId: string; orderNumber: string; trackingNumber: string }> = [];

      for (const order of fetchedOrders) {
        if (order.workflowStatus !== "READY_TO_SHIP") {
          const cityMatch = matchCityForCourier(order.city || "", courierCities, courier);
          invalid.push({
            orderId: order.id, orderNumber: order.orderNumber,
            customerName: order.customerName || "", city: order.city || "",
            address: order.shippingAddress || "", phone: normalizePhone(order.customerPhone),
            weight: 200, pieces: order.totalQuantity || 1,
            productDescription: buildProductDescription(order),
            codAmount: parseFloat(order.totalAmount) || 0,
            amount: order.totalAmount,
            cityMatched: cityMatch.matched, matchedCityName: cityMatch.matchedCity, matchedCityId: cityMatch.matchedCityId,
            missingFields: ["Not in Ready to Ship status"],
          });
          continue;
        }

        if (bookedOrderIds.has(order.id) || order.courierTracking) {
          const existingJob = existingJobs.find(j => j.orderId === order.id && j.status === "success");
          alreadyBooked.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            trackingNumber: existingJob?.trackingNumber || order.courierTracking || "Unknown",
          });
          continue;
        }

        const pieces = order.totalQuantity || ((order.lineItems as any[])?.length) || 1;
        const productDescription = buildProductDescription(order);
        const codAmount = parseFloat(order.totalAmount) || 0;
        const phone = normalizePhone(order.customerPhone);
        const cityMatch = matchCityForCourier(order.city || "", courierCities, courier);

        const missing = validateOrderForBooking(order);
        if (missing.length > 0) {
          invalid.push({
            orderId: order.id, orderNumber: order.orderNumber,
            customerName: order.customerName || "", city: order.city || "",
            address: order.shippingAddress || "", phone,
            weight: 200, pieces, productDescription, codAmount,
            amount: order.totalAmount,
            cityMatched: cityMatch.matched, matchedCityName: cityMatch.matchedCity, matchedCityId: cityMatch.matchedCityId,
            missingFields: missing,
          });
        } else {
          valid.push({
            orderId: order.id, orderNumber: order.orderNumber,
            customerName: order.customerName, city: order.city || "",
            address: order.shippingAddress || "", phone,
            weight: 200, pieces, productDescription, codAmount,
            amount: order.totalAmount,
            cityMatched: cityMatch.matched, matchedCityName: cityMatch.matchedCity, matchedCityId: cityMatch.matchedCityId,
          });
        }
      }

      res.json({
        valid, invalid, alreadyBooked, courier,
        courierCities: courierCities.map(c => ({ id: (c as any).id, name: c.name })),
      });
    } catch (error) {
      console.error("Error previewing booking:", error);
      res.status(500).json({ message: "Failed to preview booking" });
    }
  });

  app.post("/api/booking/book", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const { orderIds, courier, orderOverrides } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ message: "Order IDs required" });
      }
      if (!courier || !["leopards", "postex"].includes(courier)) {
        return res.status(400).json({ message: "Valid courier required" });
      }

      const overridesMap = new Map<string, {
        weight?: number; mode?: string; customerName?: string;
        phone?: string; address?: string; city?: string;
        codAmount?: number; description?: string;
      }>();
      if (orderOverrides && typeof orderOverrides === "object") {
        for (const [oid, ov] of Object.entries(orderOverrides)) {
          overridesMap.set(oid, ov as any);
        }
      }

      const creds = await getCourierCredentials(merchantId, courier);
      if (!creds) {
        return res.status(400).json({ message: `No ${courier} credentials configured. Go to Settings to add them.` });
      }

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(400).json({ message: "Merchant not found" });
      }

      const courierAccount = (await storage.getCourierAccounts(merchantId)).find(c => c.courierName === courier);
      const courierSettings = courierAccount?.settings as Record<string, any> | null;

      let pickupAddressCode = courierSettings?.pickupAddressCode ? String(courierSettings.pickupAddressCode).trim() : "";
      let storeAddressCode = courierSettings?.storeAddressCode ? String(courierSettings.storeAddressCode).trim() : "";

      if (courier === "postex" && (!pickupAddressCode || !storeAddressCode)) {
        try {
          console.log("[PostEx] Address codes missing/empty, auto-fetching from PostEx API...");
          const addrResp = await fetch("https://api.postex.pk/services/integration/api/order/v1/get-merchant-address", {
            headers: { "Content-Type": "application/json", "token": creds.apiKey! },
          });
          const addrData = await addrResp.json() as any;
          if (addrData.statusCode === "200" && Array.isArray(addrData.dist) && addrData.dist.length > 0) {
            for (const addr of addrData.dist) {
              const code = String(addr.addressCode).trim();
              if (addr.addressType === "Default Address" && !storeAddressCode) {
                storeAddressCode = code;
              }
              if ((addr.addressType === "Pickup/Return Address" || addr.addressType === "Pickup Address") && !pickupAddressCode) {
                pickupAddressCode = code;
              }
            }
            if (!pickupAddressCode) pickupAddressCode = String(addrData.dist[0].addressCode).trim();
            if (!storeAddressCode) storeAddressCode = String(addrData.dist[0].addressCode).trim();
            console.log(`[PostEx] Auto-resolved address codes: pickup="${pickupAddressCode}", store="${storeAddressCode}"`);

            if (courierAccount) {
              const updatedSettings = { ...courierSettings, pickupAddressCode, storeAddressCode };
              await storage.updateCourierAccount(courierAccount.id, { settings: updatedSettings });
              console.log("[PostEx] Persisted auto-fetched address codes to DB");
            }
          } else {
            console.warn("[PostEx] Could not auto-fetch addresses:", addrData.statusMessage || "No addresses returned");
          }
        } catch (e) {
          console.error("[PostEx] Failed to auto-fetch address codes:", e);
        }
      }

      if (courier === "postex" && !pickupAddressCode) {
        return res.status(400).json({
          message: "Please sync pickup addresses from PostEx and select a valid pickup address code. Go to Integrations > PostEx and click 'Sync Addresses from PostEx'.",
        });
      }

      console.log(`[PostEx] Final address codes for booking: pickupAddressCode="${pickupAddressCode}" (type=${typeof pickupAddressCode})`);

      const shipperInfo = {
        name: merchant.name || "ShipFlow Merchant",
        phone: merchant.phone || "",
        address: merchant.address || "",
        city: merchant.city || "Lahore",
        shipperId: courierSettings?.shipperId || "2125655",
        pickupAddressCode,
        storeAddressCode,
      };

      const { validateOrderForBooking, orderToPacket, bookLeopardsBatch, bookPostExBulk } = await import("./services/couriers/booking");
      const { generateBatchLoadsheetPdf } = await import("./services/pdfGenerator");

      const fetchedOrders = await storage.getOrdersByIds(merchantId, orderIds);
      const userId = getSessionUserId(req) || "system";

      const batch = await storage.createShipmentBatch({
        merchantId,
        createdByUserId: userId,
        courierName: courier,
        batchType: orderIds.length > 1 ? "BULK" : "SINGLE",
        status: "CREATED",
        totalSelectedCount: orderIds.length,
        successCount: 0,
        failedCount: 0,
      });

      const results: Array<{
        orderId: string;
        orderNumber: string;
        success: boolean;
        trackingNumber?: string;
        slipUrl?: string;
        error?: string;
      }> = [];

      const toBook: typeof fetchedOrders = [];
      for (const order of fetchedOrders) {
        const existingJob = await storage.getBookingJob(merchantId, order.id, courier);
        if (existingJob && existingJob.status === "success" && existingJob.trackingNumber) {
          results.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            success: true,
            trackingNumber: existingJob.trackingNumber,
            slipUrl: existingJob.slipUrl || undefined,
            error: "Already booked",
          });
          continue;
        }
        if (existingJob && existingJob.status === "processing") {
          results.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            success: false,
            error: "Booking in progress",
          });
          continue;
        }

        const ovr = overridesMap.get(order.id);
        const orderForValidation = { ...order };
        if (ovr) {
          if (ovr.customerName) orderForValidation.customerName = ovr.customerName;
          if (ovr.phone) orderForValidation.customerPhone = ovr.phone;
          if (ovr.address) orderForValidation.shippingAddress = ovr.address;
          if (ovr.city) orderForValidation.city = ovr.city;
          if (ovr.codAmount !== undefined) orderForValidation.totalAmount = String(ovr.codAmount);
        }
        const missing = validateOrderForBooking(orderForValidation);
        if (missing.length > 0) {
          results.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            success: false,
            error: `Missing: ${missing.join(", ")}`,
          });
          continue;
        }

        toBook.push(order);
      }

      if (toBook.length === 0) {
        return res.json({
          successCount: results.filter(r => r.success).length,
          failedCount: results.filter(r => !r.success).length,
          results,
        });
      }

      const jobMap = new Map<string, string>();
      for (const order of toBook) {
        const job = await storage.createBookingJob({
          merchantId,
          orderId: order.id,
          courierName: courier,
          status: "processing",
        });
        jobMap.set(order.id, job.id);
      }

      const packets = toBook.map(order => {
        const pkt = orderToPacket(order);
        const ovr = overridesMap.get(order.id);
        if (ovr) {
          if (ovr.weight) pkt.weight = ovr.weight;
          if (ovr.mode) pkt.mode = ovr.mode;
          if (ovr.customerName) pkt.customerName = ovr.customerName;
          if (ovr.phone) pkt.customerPhone = ovr.phone;
          if (ovr.address) pkt.shippingAddress = ovr.address;
          if (ovr.city) pkt.city = ovr.city;
          if (ovr.codAmount !== undefined) pkt.codAmount = ovr.codAmount;
          if (ovr.description) pkt.itemSummary = ovr.description;
        }
        return pkt;
      });

      let bookingResults: Array<{
        orderId: string;
        orderNumber: string;
        success: boolean;
        trackingNumber?: string;
        slipUrl?: string;
        error?: string;
        rawResponse?: any;
      }>;

      if (courier === "leopards") {
        bookingResults = await bookLeopardsBatch(packets, {
          apiKey: creds.apiKey!,
          apiPassword: creds.apiSecret!,
        }, shipperInfo);
      } else {
        bookingResults = await bookPostExBulk(packets, creds.apiKey!, shipperInfo);
      }

      for (const br of bookingResults) {
        const jobId = jobMap.get(br.orderId);
        if (jobId) {
          await storage.updateBookingJob(jobId, {
            status: br.success ? "success" : "failed",
            trackingNumber: br.trackingNumber || null,
            slipUrl: br.slipUrl || null,
            rawResponse: br.rawResponse || null,
            errorMessage: br.error || null,
          });
        }

        if (br.success && br.trackingNumber) {
          await storage.updateOrder(merchantId, br.orderId, {
            courierName: courier === "leopards" ? "Leopards" : "PostEx",
            courierTracking: br.trackingNumber,
            courierSlipUrl: br.slipUrl || null,
            bookingStatus: "BOOKED",
            bookingError: null,
            bookedAt: new Date(),
            shipmentStatus: "BOOKED",
          });

          await transitionOrder({
            merchantId,
            orderId: br.orderId,
            toStatus: "FULFILLED",
            action: "courier_booked",
            actorUserId: userId,
            actorType: "user",
            reason: `Booked with ${courier === "leopards" ? "Leopards" : "PostEx"} - ${br.trackingNumber}`,
          });
        } else {
          await storage.updateOrder(merchantId, br.orderId, {
            bookingStatus: "FAILED",
            bookingError: br.error || "Booking failed",
          });
        }

        results.push({
          orderId: br.orderId,
          orderNumber: br.orderNumber,
          success: br.success,
          trackingNumber: br.trackingNumber,
          slipUrl: br.slipUrl,
          error: br.error,
        });
      }

      const successCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;

      const batchStatus = failedCount === 0 ? "SUCCESS" : (successCount === 0 ? "FAILED" : "PARTIAL_SUCCESS");
      await storage.updateShipmentBatch(batch.id, {
        successCount,
        failedCount,
        status: batchStatus,
      });

      for (const r of results) {
        await storage.createShipmentBatchItem({
          batchId: batch.id,
          orderId: r.orderId,
          orderNumber: r.orderNumber,
          bookingStatus: r.success ? "BOOKED" : "FAILED",
          bookingError: r.error || null,
          trackingNumber: r.trackingNumber || null,
          slipUrl: r.slipUrl || null,
          consigneeName: fetchedOrders.find(o => o.id === r.orderId)?.customerName || null,
          consigneePhone: fetchedOrders.find(o => o.id === r.orderId)?.customerPhone || null,
          consigneeCity: fetchedOrders.find(o => o.id === r.orderId)?.city || null,
          codAmount: (fetchedOrders.find(o => o.id === r.orderId)?.codRemaining ?? fetchedOrders.find(o => o.id === r.orderId)?.totalAmount) || null,
        });
      }

      try {
        for (const r of results.filter(r => r.success && r.trackingNumber)) {
          const order = fetchedOrders.find(o => o.id === r.orderId);
          if (!order) continue;

          const shipmentsList = await storage.getShipmentsByOrderId(merchantId, order.id);
          const shipment = shipmentsList.find(s => s.trackingNumber === r.trackingNumber);

          await storage.createShipmentPrintRecord({
            merchantId,
            shipmentId: shipment?.id || null,
            orderId: order.id,
            courierName: courier,
            trackingNumber: r.trackingNumber!,
            generatedByUserId: userId,
            pdfPath: null,
            source: "COURIER_NATIVE",
            isLatest: true,
          });
        }

        const batchLoadsheetPath = await generateBatchLoadsheetPdf({
          batchId: batch.id,
          courierName: courier === "leopards" ? "Leopards" : "PostEx",
          createdBy: userId,
          createdAt: new Date().toLocaleDateString(),
          merchantName: merchant.name,
          totalCount: results.length,
          successCount,
          failedCount,
          items: results.map(r => {
            const order = fetchedOrders.find(o => o.id === r.orderId);
            return {
              orderNumber: r.orderNumber,
              trackingNumber: r.trackingNumber || "",
              consigneeName: order?.customerName || "",
              consigneeCity: order?.city || "",
              consigneePhone: order?.customerPhone || "",
              codAmount: Number(order?.totalAmount) || 0,
              status: r.success ? "BOOKED" : "FAILED",
              error: r.error,
            };
          }),
        });

        await storage.updateShipmentBatch(batch.id, {
          pdfBatchPath: batchLoadsheetPath,
        });
      } catch (pdfErr) {
        console.error("[Booking] PDF generation error (non-blocking):", pdfErr);
      }

      console.log(`[Booking] ${courier}: ${successCount} success, ${failedCount} failed out of ${results.length}, batch=${batch.id}`);

      res.json({ successCount, failedCount, results, batchId: batch.id });
    } catch (error) {
      console.error("Error booking orders:", error);
      res.status(500).json({ message: "Failed to book orders" });
    }
  });

  // ============================================
  // SHIPMENT BATCHES & PRINT ROUTES
  // ============================================

  app.get("/api/shipment-batches", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const courier = req.query.courier as string;

      const result = await storage.getShipmentBatches(merchantId, { page, pageSize, courier });
      res.json(result);
    } catch (error) {
      console.error("Error fetching batches:", error);
      res.status(500).json({ message: "Failed to fetch batches" });
    }
  });

  app.get("/api/shipment-batches/:id", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const batch = await storage.getShipmentBatchById(merchantId, req.params.id);
      if (!batch) {
        return res.status(404).json({ message: "Batch not found" });
      }

      const items = await storage.getShipmentBatchItems(batch.id);
      
      const bookedOrderIds = items
        .filter(item => item.orderId && item.bookingStatus === "BOOKED")
        .map(item => item.orderId);
      
      let printRecordMap: Record<string, string> = {};
      if (bookedOrderIds.length > 0) {
        const printRecords = await db.select({ id: shipmentPrintRecords.id, orderId: shipmentPrintRecords.orderId })
          .from(shipmentPrintRecords)
          .where(and(
            eq(shipmentPrintRecords.merchantId, merchantId),
            inArray(shipmentPrintRecords.orderId, bookedOrderIds),
            eq(shipmentPrintRecords.isLatest, true),
          ));
        for (const pr of printRecords) {
          if (pr.orderId) printRecordMap[pr.orderId] = pr.id;
        }
      }
      
      const itemsWithPrint = items.map(item => ({
        ...item,
        printRecordId: (item.orderId && printRecordMap[item.orderId]) || null,
      }));
      
      res.json({ batch, items: itemsWithPrint });
    } catch (error) {
      console.error("Error fetching batch details:", error);
      res.status(500).json({ message: "Failed to fetch batch details" });
    }
  });

  app.get("/api/print/batch/:id.pdf", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const batch = await storage.getShipmentBatchById(merchantId, req.params.id);
      if (!batch || !batch.pdfBatchPath) {
        return res.status(404).json({ message: "Batch PDF not found" });
      }

      const { getPdfPath } = await import("./services/pdfGenerator");
      const pdfPath = getPdfPath(batch.pdfBatchPath);
      if (!pdfPath) {
        return res.status(404).json({ message: "PDF file not found on disk" });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="batch_${batch.id.substring(0, 8)}.pdf"`);
      const fs = await import("fs");
      fs.createReadStream(pdfPath).pipe(res);
    } catch (error) {
      console.error("Error serving batch PDF:", error);
      res.status(500).json({ message: "Failed to serve PDF" });
    }
  });

  app.get("/api/print/shipment/:id.pdf", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const printRecord = await storage.getShipmentPrintRecordById(merchantId, req.params.id);
      if (!printRecord || !printRecord.pdfPath) {
        return res.status(404).json({ message: "Print record not found" });
      }

      const { getPdfPath } = await import("./services/pdfGenerator");
      const pdfPath = getPdfPath(printRecord.pdfPath);
      if (!pdfPath) {
        return res.status(404).json({ message: "PDF file not found on disk" });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="awb_${printRecord.trackingNumber}.pdf"`);
      const fs = await import("fs");
      fs.createReadStream(pdfPath).pipe(res);
    } catch (error) {
      console.error("Error serving shipment PDF:", error);
      res.status(500).json({ message: "Failed to serve PDF" });
    }
  });

  app.get("/api/print/order/:orderId", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const order = await storage.getOrderById(merchantId, req.params.orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const shipmentsList = await storage.getShipmentsByOrderId(merchantId, order.id);
      const printRecords: any[] = [];
      for (const s of shipmentsList) {
        const record = await storage.getShipmentPrintRecord(merchantId, s.id);
        if (record) {
          printRecords.push({ ...record, shipment: s });
        }
      }

      res.json({
        order: { id: order.id, orderNumber: order.orderNumber, courierName: order.courierName, courierTracking: order.courierTracking },
        shipments: shipmentsList,
        printRecords,
      });
    } catch (error) {
      console.error("Error fetching print info:", error);
      res.status(500).json({ message: "Failed to fetch print info" });
    }
  });

  app.get("/api/couriers/postex/invoice", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const trackingNumber = String(req.query.trackingNumber || "").trim();
      if (!trackingNumber) {
        return res.status(400).json({ message: "Missing trackingNumber query parameter" });
      }

      const creds = await getCourierCredentials(merchantId, "postex");
      if (!creds?.apiKey) {
        return res.status(400).json({ message: "PostEx credentials not configured" });
      }

      console.log(`[PostEx Invoice Route] Single invoice request: merchantId=${merchantId}, tracking=${trackingNumber}`);

      const { fetchPostExSlip } = await import("./services/courierSlips");
      const result = await fetchPostExSlip(trackingNumber, creds.apiKey);

      if (!result.success || !result.pdfBuffer) {
        return res.status(502).json({
          message: result.error || "Failed to fetch PostEx invoice",
          trackingNumber,
        });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="postex-invoice-${trackingNumber}.pdf"`);
      res.send(result.pdfBuffer);
    } catch (error) {
      console.error("[PostEx Invoice Route] Error:", error);
      res.status(500).json({ message: "Failed to fetch PostEx invoice" });
    }
  });

  app.post("/api/couriers/postex/invoices", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const rawTrackingNumbers: string[] = req.body?.trackingNumbers;
      if (!Array.isArray(rawTrackingNumbers) || rawTrackingNumbers.length === 0) {
        return res.status(400).json({ message: "Missing or empty trackingNumbers array in request body" });
      }

      const trackingNumbers = rawTrackingNumbers.map(t => String(t).trim()).filter(Boolean);
      if (trackingNumbers.length === 0) {
        return res.status(400).json({ message: "No valid tracking numbers provided" });
      }

      const creds = await getCourierCredentials(merchantId, "postex");
      if (!creds?.apiKey) {
        return res.status(400).json({ message: "PostEx credentials not configured" });
      }

      console.log(`[PostEx Invoice Route] Bulk invoice request: merchantId=${merchantId}, count=${trackingNumbers.length}`);

      const { fetchPostExSlipBulk } = await import("./services/courierSlips");
      const result = await fetchPostExSlipBulk(trackingNumbers, creds.apiKey);

      if (!result.success || !result.pdfBuffer) {
        return res.status(502).json({
          message: result.error || "Failed to fetch PostEx invoices",
          failedTrackingNumbers: result.failedTrackingNumbers || trackingNumbers,
          chunkErrors: (result as any).chunkErrors,
        });
      }

      if (result.failedTrackingNumbers && result.failedTrackingNumbers.length > 0) {
        res.setHeader("X-Partial-Failure", "true");
        res.setHeader("X-Failed-Tracking-Numbers", result.failedTrackingNumbers.join(","));
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="postex-invoices-bulk.pdf"`);
      res.send(result.pdfBuffer);
    } catch (error) {
      console.error("[PostEx Invoice Route] Bulk error:", error);
      res.status(500).json({ message: "Failed to fetch PostEx invoices" });
    }
  });

  app.get("/api/print/native-slip/:orderId.pdf", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const order = await storage.getOrderById(merchantId, req.params.orderId);
      if (!order || !order.courierTracking) {
        return res.status(404).json({ message: "Order not found or not booked" });
      }

      const { fetchLeopardsSlip, fetchPostExSlip } = await import("./services/courierSlips");
      const courierNorm = normalizeCourierName(order.courierName || "");

      let result;
      if (courierNorm === "leopards") {
        if (!order.courierSlipUrl) {
          return res.status(404).json({ message: "No Leopards slip URL available for this order" });
        }
        result = await fetchLeopardsSlip(order.courierSlipUrl);
      } else if (courierNorm === "postex") {
        const creds = await getCourierCredentials(merchantId, "postex");
        if (!creds?.apiKey) {
          return res.status(400).json({ message: "PostEx credentials not configured" });
        }
        result = await fetchPostExSlip(order.courierTracking, creds.apiKey);
      } else {
        return res.status(400).json({ message: `Native slips not supported for courier: ${order.courierName}` });
      }

      if (!result.success || !result.pdfBuffer) {
        return res.status(502).json({ message: result.error || "Failed to fetch courier airway bill" });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="awb_${order.orderNumber}_${order.courierTracking}.pdf"`);
      res.send(result.pdfBuffer);
    } catch (error) {
      console.error("Error fetching native slip:", error);
      res.status(500).json({ message: "Failed to fetch courier airway bill" });
    }
  });

  app.get("/api/print/batch-awb/:batchId.pdf", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const batch = await storage.getShipmentBatchById(merchantId, req.params.batchId);
      if (!batch) {
        return res.status(404).json({ message: "Batch not found" });
      }

      const items = await storage.getShipmentBatchItems(batch.id);
      const bookedItems = items.filter(item => item.bookingStatus === "BOOKED" && item.trackingNumber);

      if (bookedItems.length === 0) {
        return res.status(404).json({ message: "No booked items in this batch" });
      }

      const { fetchLeopardsSlip, fetchPostExSlipBulk, combinePdfs } = await import("./services/courierSlips");
      const courierNorm = normalizeCourierName(batch.courierName || "");

      if (courierNorm === "postex") {
        const creds = await getCourierCredentials(merchantId, "postex");
        const postexToken = creds?.apiKey || null;
        if (!postexToken) {
          return res.status(400).json({ message: "PostEx credentials not configured" });
        }
        const trackingNums = bookedItems.map(item => item.trackingNumber!);
        const result = await fetchPostExSlipBulk(trackingNums, postexToken);
        if (!result.success || !result.pdfBuffer) {
          return res.status(502).json({ message: result.error || "Failed to fetch PostEx airway bills" });
        }
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="batch_awb_${batch.id.substring(0, 8)}.pdf"`);
        return res.send(result.pdfBuffer);
      }

      const pdfBuffers: Buffer[] = [];
      const errors: string[] = [];

      for (const item of bookedItems) {
        let result;
        if (courierNorm === "leopards") {
          const slipUrl = item.slipUrl;
          if (!slipUrl) {
            const order = await storage.getOrderById(merchantId, item.orderId);
            if (order?.courierSlipUrl) {
              result = await fetchLeopardsSlip(order.courierSlipUrl);
            } else {
              errors.push(`${item.orderNumber}: No slip URL`);
              continue;
            }
          } else {
            result = await fetchLeopardsSlip(slipUrl);
          }
        } else {
          errors.push(`${item.orderNumber}: Unsupported courier`);
          continue;
        }

        if (result?.success && result.pdfBuffer) {
          pdfBuffers.push(result.pdfBuffer);
        } else {
          errors.push(`${item.orderNumber}: ${result?.error || "Failed"}`);
        }
      }

      if (pdfBuffers.length === 0) {
        return res.status(502).json({
          message: "Could not fetch any courier airway bills",
          errors,
        });
      }

      if (errors.length > 0) {
        console.warn(`[BatchAWB] ${errors.length} items failed:`, errors);
      }

      const combinedPdf = await combinePdfs(pdfBuffers);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="batch_awb_${batch.id.substring(0, 8)}.pdf"`);
      res.send(combinedPdf);
    } catch (error) {
      console.error("Error fetching batch AWB:", error);
      res.status(500).json({ message: "Failed to fetch batch airway bills" });
    }
  });

  app.post("/api/print/regenerate/:orderId", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const order = await storage.getOrderById(merchantId, req.params.orderId);
      if (!order || !order.courierTracking) {
        return res.status(400).json({ message: "Order not found or not booked" });
      }

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(400).json({ message: "Merchant not found" });

      const userId = getSessionUserId(req) || "system";

      const shipmentsList = await storage.getShipmentsByOrderId(merchantId, order.id);
      const shipment = shipmentsList.find(s => s.trackingNumber === order.courierTracking);

      const printRecord = await storage.createShipmentPrintRecord({
        merchantId,
        shipmentId: shipment?.id || null,
        orderId: order.id,
        courierName: order.courierName || "unknown",
        trackingNumber: order.courierTracking,
        generatedByUserId: userId,
        pdfPath: null,
        source: "COURIER_NATIVE",
        isLatest: true,
      });

      res.json({ success: true, printRecordId: printRecord.id });
    } catch (error) {
      console.error("Error regenerating PDF:", error);
      res.status(500).json({ message: "Failed to regenerate PDF" });
    }
  });

  // ============================================
  // ONBOARDING ROUTES
  // ============================================
  const ONBOARDING_ORDER = [
    "ACCOUNT_CREATED",
    "SHOPIFY_CONNECTED",
    "ORDERS_SYNCED",
    "LEOPARDS_CONNECTED",
    "POSTEX_CONNECTED",
    "COMPLETED",
  ];

  app.post("/api/onboarding/advance-step", isAuthenticated, async (req, res) => {
    try {
      const merchantId = await requireMerchant(req, res);
      if (!merchantId) return;

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });

      const currentIndex = ONBOARDING_ORDER.indexOf(merchant.onboardingStep || "ACCOUNT_CREATED");
      if (currentIndex >= ONBOARDING_ORDER.length - 1) {
        return res.json({ onboardingStep: "COMPLETED", message: "Already completed" });
      }

      const nextStep = ONBOARDING_ORDER[currentIndex + 1];
      await db.update(merchants).set({ onboardingStep: nextStep }).where(eq(merchants.id, merchantId));

      res.json({ onboardingStep: nextStep });
    } catch (error) {
      console.error("Error advancing onboarding:", error);
      res.status(500).json({ message: "Failed to advance onboarding step" });
    }
  });

  // ============================================
  // ADMIN ROUTES (SUPER_ADMIN only)
  // ============================================
  async function requireSuperAdmin(req: any, res: any): Promise<string | null> {
    const userId = getSessionUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return null;
    }
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user || user.role !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Admin access required" });
      return null;
    }
    return userId;
  }

  app.get("/api/admin/merchants", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      const search = req.query.search as string | undefined;
      let merchantList;
      if (search) {
        merchantList = await db.select().from(merchants).where(
          or(ilike(merchants.name, `%${search}%`), ilike(merchants.email, `%${search}%`))
        );
      } else {
        merchantList = await db.select().from(merchants);
      }

      res.json(merchantList);
    } catch (error) {
      console.error("Error fetching merchants:", error);
      res.status(500).json({ message: "Failed to fetch merchants" });
    }
  });

  app.get("/api/admin/merchants/:id", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      const [merchant] = await db.select().from(merchants).where(eq(merchants.id, req.params.id));
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });

      const merchantUsers = await db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
      }).from(users).where(eq(users.merchantId, merchant.id));

      res.json({ ...merchant, users: merchantUsers });
    } catch (error) {
      console.error("Error fetching merchant:", error);
      res.status(500).json({ message: "Failed to fetch merchant" });
    }
  });

  app.post("/api/admin/merchants/:id/suspend", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      await db.update(merchants).set({ status: "SUSPENDED" }).where(eq(merchants.id, req.params.id));
      await db.insert(adminActionLogs).values({
        adminUserId: adminId,
        actionType: "SUSPEND_MERCHANT",
        targetMerchantId: req.params.id,
        details: "Merchant suspended by admin",
      });

      res.json({ message: "Merchant suspended" });
    } catch (error) {
      console.error("Error suspending merchant:", error);
      res.status(500).json({ message: "Failed to suspend merchant" });
    }
  });

  app.post("/api/admin/merchants/:id/unsuspend", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      await db.update(merchants).set({ status: "ACTIVE" }).where(eq(merchants.id, req.params.id));
      await db.insert(adminActionLogs).values({
        adminUserId: adminId,
        actionType: "UNSUSPEND_MERCHANT",
        targetMerchantId: req.params.id,
        details: "Merchant unsuspended by admin",
      });

      res.json({ message: "Merchant unsuspended" });
    } catch (error) {
      res.status(500).json({ message: "Failed to unsuspend merchant" });
    }
  });

  app.post("/api/admin/merchants/:id/advance-onboarding", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      const [merchant] = await db.select().from(merchants).where(eq(merchants.id, req.params.id));
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });

      const currentIndex = ONBOARDING_ORDER.indexOf(merchant.onboardingStep || "ACCOUNT_CREATED");
      if (currentIndex >= ONBOARDING_ORDER.length - 1) {
        return res.json({ onboardingStep: "COMPLETED" });
      }

      const nextStep = ONBOARDING_ORDER[currentIndex + 1];
      await db.update(merchants).set({ onboardingStep: nextStep }).where(eq(merchants.id, req.params.id));
      await db.insert(adminActionLogs).values({
        adminUserId: adminId,
        actionType: "ADVANCE_ONBOARDING",
        targetMerchantId: req.params.id,
        details: `Advanced onboarding from ${merchant.onboardingStep} to ${nextStep}`,
      });

      res.json({ onboardingStep: nextStep });
    } catch (error) {
      res.status(500).json({ message: "Failed to advance onboarding" });
    }
  });

  app.post("/api/admin/users/:id/block", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      await db.update(users).set({ isActive: false }).where(eq(users.id, req.params.id));
      await db.insert(adminActionLogs).values({
        adminUserId: adminId,
        actionType: "BLOCK_USER",
        targetUserId: req.params.id,
        details: "User blocked by admin",
      });

      res.json({ message: "User blocked" });
    } catch (error) {
      res.status(500).json({ message: "Failed to block user" });
    }
  });

  app.post("/api/admin/users/:id/unblock", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      await db.update(users).set({ isActive: true }).where(eq(users.id, req.params.id));
      await db.insert(adminActionLogs).values({
        adminUserId: adminId,
        actionType: "UNBLOCK_USER",
        targetUserId: req.params.id,
        details: "User unblocked by admin",
      });

      res.json({ message: "User unblocked" });
    } catch (error) {
      res.status(500).json({ message: "Failed to unblock user" });
    }
  });

  app.post("/api/admin/users/:id/reset-password", isAuthenticated, async (req, res) => {
    try {
      const adminId = await requireSuperAdmin(req, res);
      if (!adminId) return;

      const bcrypt = await import("bcrypt");
      const tempPassword = crypto.randomBytes(8).toString("hex");
      const passwordHash = await bcrypt.default.hash(tempPassword, 12);

      await db.update(users).set({ passwordHash }).where(eq(users.id, req.params.id));
      await db.insert(adminActionLogs).values({
        adminUserId: adminId,
        actionType: "RESET_PASSWORD",
        targetUserId: req.params.id,
        details: "Password reset by admin",
      });

      res.json({ message: "Password reset", tempPassword });
    } catch (error) {
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  return httpServer;
}
