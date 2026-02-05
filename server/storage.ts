import {
  merchants, teamMembers, shopifyStores, courierAccounts,
  orders, shipments, shipmentEvents, remarks, codReconciliation, syncLogs,
  type Merchant, type InsertMerchant,
  type TeamMember, type InsertTeamMember,
  type ShopifyStore, type InsertShopifyStore,
  type CourierAccount, type InsertCourierAccount,
  type Order, type InsertOrder,
  type Shipment, type InsertShipment,
  type ShipmentEvent, type InsertShipmentEvent,
  type Remark, type InsertRemark,
  type CodReconciliation, type InsertCodReconciliation,
  type SyncLog, type InsertSyncLog,
  users,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, ilike, sql, count, inArray, isNull } from "drizzle-orm";

export interface IStorage {
  // Merchants
  getMerchant(id: string): Promise<Merchant | undefined>;
  getMerchantBySlug(slug: string): Promise<Merchant | undefined>;
  createMerchant(merchant: InsertMerchant): Promise<Merchant>;
  updateMerchant(id: string, data: Partial<InsertMerchant>): Promise<Merchant | undefined>;

  // Team Members
  getTeamMembers(merchantId: string): Promise<TeamMember[]>;
  getTeamMemberByUserId(merchantId: string, userId: string): Promise<TeamMember | undefined>;
  getTeamMemberById(merchantId: string, id: string): Promise<TeamMember | undefined>;
  getUserMerchantId(userId: string): Promise<string | null>;
  createTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  updateTeamMemberRole(merchantId: string, id: string, role: string): Promise<TeamMember | undefined>;
  deleteTeamMember(merchantId: string, id: string): Promise<void>;

  // Shopify Stores
  getShopifyStore(merchantId: string): Promise<ShopifyStore | undefined>;
  createShopifyStore(store: InsertShopifyStore): Promise<ShopifyStore>;
  updateShopifyStore(id: string, data: Partial<InsertShopifyStore>): Promise<ShopifyStore | undefined>;

  // Courier Accounts
  getCourierAccounts(merchantId: string): Promise<CourierAccount[]>;
  createCourierAccount(account: InsertCourierAccount): Promise<CourierAccount>;
  updateCourierAccount(id: string, data: Partial<InsertCourierAccount>): Promise<CourierAccount | undefined>;

  // Orders - All scoped by merchantId
  getOrders(merchantId: string, options?: { search?: string; status?: string; courier?: string; month?: string; page?: number; pageSize?: number }): Promise<{ orders: Order[]; total: number }>;
  getOrderById(merchantId: string, id: string): Promise<Order | undefined>;
  getOrderByShopifyId(merchantId: string, shopifyOrderId: string): Promise<Order | undefined>;
  getExistingShopifyOrderIds(merchantId: string, shopifyOrderIds: string[]): Promise<Set<string>>;
  getExistingOrdersByShopifyIds(merchantId: string, shopifyOrderIds: string[]): Promise<Map<string, string>>;
  getRecentOrders(merchantId: string, limit?: number): Promise<Order[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(merchantId: string, id: string, data: Partial<InsertOrder>): Promise<Order | undefined>;

  // Shipments - All scoped by merchantId
  getShipments(merchantId: string, options?: { search?: string; status?: string; courier?: string; page?: number; pageSize?: number }): Promise<{ shipments: Shipment[]; total: number }>;
  getShipmentsByOrderId(merchantId: string, orderId: string): Promise<Shipment[]>;
  createShipment(shipment: InsertShipment): Promise<Shipment>;
  updateShipment(merchantId: string, id: string, data: Partial<InsertShipment>): Promise<Shipment | undefined>;

  // Shipment Events - Scoped via shipment's merchantId
  getShipmentEvents(merchantId: string, shipmentId: string): Promise<ShipmentEvent[]>;
  createShipmentEvent(event: InsertShipmentEvent): Promise<ShipmentEvent>;

  // Remarks - Scoped via order's merchantId
  getRemarks(merchantId: string, orderId: string): Promise<Remark[]>;
  createRemark(merchantId: string, remark: InsertRemark): Promise<Remark>;

  // COD Reconciliation - All scoped by merchantId
  getCodReconciliation(merchantId: string, options?: { search?: string; status?: string; page?: number; pageSize?: number }): Promise<{ records: CodReconciliation[]; total: number; summary: any }>;
  getCodRecordById(merchantId: string, id: string): Promise<CodReconciliation | undefined>;
  createCodReconciliation(record: InsertCodReconciliation): Promise<CodReconciliation>;
  updateCodReconciliation(merchantId: string, id: string, data: Partial<InsertCodReconciliation>): Promise<CodReconciliation | undefined>;

  // Analytics
  getDashboardStats(merchantId: string): Promise<any>;
  getAnalytics(merchantId: string, dateRange: string): Promise<any>;

  // Seed
  seedDemoData(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Merchants
  async getMerchant(id: string): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, id));
    return merchant;
  }

  async getMerchantBySlug(slug: string): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.slug, slug));
    return merchant;
  }

  async createMerchant(merchant: InsertMerchant): Promise<Merchant> {
    const [created] = await db.insert(merchants).values(merchant).returning();
    return created;
  }

  async updateMerchant(id: string, data: Partial<InsertMerchant>): Promise<Merchant | undefined> {
    const [updated] = await db.update(merchants).set({ ...data, updatedAt: new Date() }).where(eq(merchants.id, id)).returning();
    return updated;
  }

  // Team Members
  async getTeamMembers(merchantId: string): Promise<TeamMember[]> {
    return db.select().from(teamMembers).where(eq(teamMembers.merchantId, merchantId));
  }

  async getTeamMemberByUserId(merchantId: string, userId: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(
      and(eq(teamMembers.merchantId, merchantId), eq(teamMembers.userId, userId))
    );
    return member;
  }

  async getTeamMemberById(merchantId: string, id: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(
      and(eq(teamMembers.merchantId, merchantId), eq(teamMembers.id, id))
    );
    return member;
  }

  // Get the merchantId for a user based on their team membership
  async getUserMerchantId(userId: string): Promise<string | null> {
    const [membership] = await db.select().from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)));
    return membership?.merchantId || null;
  }

  async createTeamMember(member: InsertTeamMember): Promise<TeamMember> {
    const [created] = await db.insert(teamMembers).values(member).returning();
    return created;
  }

  async updateTeamMemberRole(merchantId: string, id: string, role: string): Promise<TeamMember | undefined> {
    const [updated] = await db.update(teamMembers).set({ role })
      .where(and(eq(teamMembers.id, id), eq(teamMembers.merchantId, merchantId)))
      .returning();
    return updated;
  }

  async deleteTeamMember(merchantId: string, id: string): Promise<void> {
    await db.delete(teamMembers).where(
      and(eq(teamMembers.id, id), eq(teamMembers.merchantId, merchantId))
    );
  }

  // Shopify Stores
  async getShopifyStore(merchantId: string): Promise<ShopifyStore | undefined> {
    const [store] = await db.select().from(shopifyStores).where(eq(shopifyStores.merchantId, merchantId));
    return store;
  }

  async createShopifyStore(store: InsertShopifyStore): Promise<ShopifyStore> {
    const [created] = await db.insert(shopifyStores).values(store).returning();
    return created;
  }

  async updateShopifyStore(id: string, data: Partial<InsertShopifyStore>): Promise<ShopifyStore | undefined> {
    const [updated] = await db.update(shopifyStores).set({ ...data, updatedAt: new Date() }).where(eq(shopifyStores.id, id)).returning();
    return updated;
  }

  // Courier Accounts
  async getCourierAccounts(merchantId: string): Promise<CourierAccount[]> {
    return db.select().from(courierAccounts).where(eq(courierAccounts.merchantId, merchantId));
  }

  async createCourierAccount(account: InsertCourierAccount): Promise<CourierAccount> {
    const [created] = await db.insert(courierAccounts).values(account).returning();
    return created;
  }

  async updateCourierAccount(id: string, data: Partial<InsertCourierAccount>): Promise<CourierAccount | undefined> {
    const [updated] = await db.update(courierAccounts).set({ ...data, updatedAt: new Date() }).where(eq(courierAccounts.id, id)).returning();
    return updated;
  }

  // Orders - All scoped by merchantId
  async getOrders(merchantId: string, options?: { search?: string; status?: string; courier?: string; month?: string; page?: number; pageSize?: number }): Promise<{ orders: Order[]; total: number }> {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    let conditions = [eq(orders.merchantId, merchantId)];
    
    if (options?.status && options.status !== "all") {
      // "unfulfilled" means orders without courier tracking (null or empty)
      if (options.status === "unfulfilled") {
        conditions.push(
          or(
            isNull(orders.courierTracking),
            eq(orders.courierTracking, "")
          )!
        );
      } else {
        // For other statuses, filter by shipmentStatus
        conditions.push(eq(orders.shipmentStatus, options.status));
      }
    }

    if (options?.courier && options.courier !== "all") {
      conditions.push(ilike(orders.courierName, `%${options.courier}%`));
    }

    // Month filter
    if (options?.month && options.month !== "all") {
      const now = new Date();
      let startDate: Date;
      let endDate: Date | null = null;
      
      if (options.month === "current") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (options.month === "last") {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 1); // exclusive end
      } else if (options.month === "2months") {
        startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      } else if (options.month === "3months") {
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      } else {
        startDate = new Date(0); // fallback to all time
      }
      
      conditions.push(sql`${orders.orderDate} >= ${startDate.toISOString()}`);
      if (endDate) {
        conditions.push(sql`${orders.orderDate} < ${endDate.toISOString()}`);
      }
    }

    if (options?.search) {
      conditions.push(
        or(
          ilike(orders.orderNumber, `%${options.search}%`),
          ilike(orders.customerName, `%${options.search}%`),
          ilike(orders.city, `%${options.search}%`),
          ilike(orders.customerPhone, `%${options.search}%`)
        )!
      );
    }

    const whereClause = and(...conditions);

    const [result, totalResult] = await Promise.all([
      db.select().from(orders).where(whereClause).orderBy(desc(orders.orderDate)).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(orders).where(whereClause)
    ]);

    return { orders: result, total: totalResult[0]?.count || 0 };
  }

  async getOrderById(merchantId: string, id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders)
      .where(and(eq(orders.id, id), eq(orders.merchantId, merchantId)));
    return order;
  }

  async getOrderByShopifyId(merchantId: string, shopifyOrderId: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders)
      .where(and(eq(orders.shopifyOrderId, shopifyOrderId), eq(orders.merchantId, merchantId)));
    return order;
  }

  async getExistingShopifyOrderIds(merchantId: string, shopifyOrderIds: string[]): Promise<Set<string>> {
    if (shopifyOrderIds.length === 0) return new Set();
    
    // Batch query in chunks of 500 to avoid query size limits
    const chunkSize = 500;
    const existingIds = new Set<string>();
    
    for (let i = 0; i < shopifyOrderIds.length; i += chunkSize) {
      const chunk = shopifyOrderIds.slice(i, i + chunkSize);
      const existing = await db.select({ shopifyOrderId: orders.shopifyOrderId })
        .from(orders)
        .where(and(
          eq(orders.merchantId, merchantId),
          inArray(orders.shopifyOrderId, chunk)
        ));
      
      for (const order of existing) {
        if (order.shopifyOrderId) {
          existingIds.add(order.shopifyOrderId);
        }
      }
    }
    
    return existingIds;
  }

  async getExistingOrdersByShopifyIds(merchantId: string, shopifyOrderIds: string[]): Promise<Map<string, string>> {
    if (shopifyOrderIds.length === 0) return new Map();
    
    // Batch query in chunks of 500 to avoid query size limits
    const chunkSize = 500;
    const existingMap = new Map<string, string>();
    
    for (let i = 0; i < shopifyOrderIds.length; i += chunkSize) {
      const chunk = shopifyOrderIds.slice(i, i + chunkSize);
      const existing = await db.select({ id: orders.id, shopifyOrderId: orders.shopifyOrderId })
        .from(orders)
        .where(and(
          eq(orders.merchantId, merchantId),
          inArray(orders.shopifyOrderId, chunk)
        ));
      
      for (const order of existing) {
        if (order.shopifyOrderId) {
          existingMap.set(order.shopifyOrderId, order.id);
        }
      }
    }
    
    return existingMap;
  }

  async getRecentOrders(merchantId: string, limit = 5): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.merchantId, merchantId)).orderBy(desc(orders.orderDate)).limit(limit);
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [created] = await db.insert(orders).values(order).returning();
    return created;
  }

  async updateOrder(merchantId: string, id: string, data: Partial<InsertOrder>): Promise<Order | undefined> {
    const [updated] = await db.update(orders).set({ ...data, updatedAt: new Date() })
      .where(and(eq(orders.id, id), eq(orders.merchantId, merchantId)))
      .returning();
    return updated;
  }

  // Shipments - All scoped by merchantId
  async getShipments(merchantId: string, options?: { search?: string; status?: string; courier?: string; page?: number; pageSize?: number }): Promise<{ shipments: Shipment[]; total: number }> {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    let conditions = [eq(shipments.merchantId, merchantId)];

    if (options?.status && options.status !== "all") {
      conditions.push(eq(shipments.status, options.status));
    }

    if (options?.courier && options.courier !== "all") {
      conditions.push(eq(shipments.courierName, options.courier));
    }

    const whereClause = and(...conditions);

    const [result, totalResult] = await Promise.all([
      db.select().from(shipments).where(whereClause).orderBy(desc(shipments.createdAt)).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(shipments).where(whereClause)
    ]);

    return { shipments: result, total: totalResult[0]?.count || 0 };
  }

  async getShipmentsByOrderId(merchantId: string, orderId: string): Promise<Shipment[]> {
    return db.select().from(shipments)
      .where(and(eq(shipments.orderId, orderId), eq(shipments.merchantId, merchantId)));
  }

  async createShipment(shipment: InsertShipment): Promise<Shipment> {
    const [created] = await db.insert(shipments).values(shipment).returning();
    return created;
  }

  async updateShipment(merchantId: string, id: string, data: Partial<InsertShipment>): Promise<Shipment | undefined> {
    const [updated] = await db.update(shipments).set({ ...data, updatedAt: new Date() })
      .where(and(eq(shipments.id, id), eq(shipments.merchantId, merchantId)))
      .returning();
    return updated;
  }

  // Shipment Events - Verified via shipment's merchantId
  async getShipmentEvents(merchantId: string, shipmentId: string): Promise<ShipmentEvent[]> {
    // First verify the shipment belongs to this merchant
    const [shipment] = await db.select().from(shipments)
      .where(and(eq(shipments.id, shipmentId), eq(shipments.merchantId, merchantId)));
    
    if (!shipment) {
      return []; // Return empty if shipment doesn't belong to merchant
    }

    return db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, shipmentId)).orderBy(desc(shipmentEvents.eventTime));
  }

  async createShipmentEvent(event: InsertShipmentEvent): Promise<ShipmentEvent> {
    const [created] = await db.insert(shipmentEvents).values(event).returning();
    return created;
  }

  // Remarks - Verified via order's merchantId
  async getRemarks(merchantId: string, orderId: string): Promise<Remark[]> {
    // First verify the order belongs to this merchant
    const [order] = await db.select().from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)));
    
    if (!order) {
      return []; // Return empty if order doesn't belong to merchant
    }

    return db.select().from(remarks).where(eq(remarks.orderId, orderId)).orderBy(desc(remarks.createdAt));
  }

  async createRemark(merchantId: string, remark: InsertRemark): Promise<Remark> {
    // Verify order belongs to merchant before creating remark
    const [order] = await db.select().from(orders)
      .where(and(eq(orders.id, remark.orderId), eq(orders.merchantId, merchantId)));
    
    if (!order) {
      throw new Error("Order not found or access denied");
    }

    const [created] = await db.insert(remarks).values(remark).returning();
    return created;
  }

  // COD Reconciliation - All scoped by merchantId
  async getCodReconciliation(merchantId: string, options?: { search?: string; status?: string; page?: number; pageSize?: number }): Promise<{ records: CodReconciliation[]; total: number; summary: any }> {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    let conditions = [eq(codReconciliation.merchantId, merchantId)];

    if (options?.status && options.status !== "all") {
      conditions.push(eq(codReconciliation.status, options.status));
    }

    const whereClause = and(...conditions);

    const [result, totalResult] = await Promise.all([
      db.select().from(codReconciliation).where(whereClause).orderBy(desc(codReconciliation.createdAt)).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(codReconciliation).where(whereClause)
    ]);

    // Calculate summary (scoped to merchant)
    const allRecords = await db.select().from(codReconciliation).where(eq(codReconciliation.merchantId, merchantId));
    const summary = {
      totalPending: allRecords.filter(r => r.status === "pending").reduce((sum, r) => sum + Number(r.codAmount || 0), 0).toLocaleString(),
      totalReceived: allRecords.filter(r => r.status === "received").reduce((sum, r) => sum + Number(r.codAmount || 0), 0).toLocaleString(),
      totalDisputed: allRecords.filter(r => r.status === "disputed").reduce((sum, r) => sum + Number(r.codAmount || 0), 0).toLocaleString(),
      pendingCount: allRecords.filter(r => r.status === "pending").length,
      receivedCount: allRecords.filter(r => r.status === "received").length,
    };

    return { records: result, total: totalResult[0]?.count || 0, summary };
  }

  async getCodRecordById(merchantId: string, id: string): Promise<CodReconciliation | undefined> {
    const [record] = await db.select().from(codReconciliation)
      .where(and(eq(codReconciliation.id, id), eq(codReconciliation.merchantId, merchantId)));
    return record;
  }

  async createCodReconciliation(record: InsertCodReconciliation): Promise<CodReconciliation> {
    const [created] = await db.insert(codReconciliation).values(record).returning();
    return created;
  }

  async updateCodReconciliation(merchantId: string, id: string, data: Partial<InsertCodReconciliation>): Promise<CodReconciliation | undefined> {
    const [updated] = await db.update(codReconciliation).set({ ...data, updatedAt: new Date() })
      .where(and(eq(codReconciliation.id, id), eq(codReconciliation.merchantId, merchantId)))
      .returning();
    return updated;
  }

  // Analytics
  async getDashboardStats(merchantId: string): Promise<any> {
    const allOrders = await db.select().from(orders).where(eq(orders.merchantId, merchantId));
    const allShipments = await db.select().from(shipments).where(eq(shipments.merchantId, merchantId));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const deliveredToday = allShipments.filter(s => 
      s.status === "delivered" && s.actualDelivery && new Date(s.actualDelivery) >= today
    ).length;

    const pendingShipments = allShipments.filter(s => 
      s.status === "booked" || s.status === "picked"
    ).length;

    const inTransit = allShipments.filter(s => 
      s.status === "in_transit" || s.status === "out_for_delivery"
    ).length;

    const codPending = allOrders
      .filter(o => o.paymentMethod === "cod" && o.paymentStatus === "pending")
      .reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

    const totalDelivered = allShipments.filter(s => s.status === "delivered").length;
    const deliveryRate = allShipments.length > 0 
      ? Math.round((totalDelivered / allShipments.length) * 100) 
      : 0;

    return {
      totalOrders: allOrders.length,
      pendingShipments,
      inTransit,
      deliveredToday,
      codPending: codPending.toLocaleString(),
      ordersTrend: 12,
      deliveryRate,
    };
  }

  async getAnalytics(merchantId: string, dateRange: string): Promise<any> {
    const allOrders = await db.select().from(orders).where(eq(orders.merchantId, merchantId));
    const allShipments = await db.select().from(shipments).where(eq(shipments.merchantId, merchantId));

    const totalDelivered = allShipments.filter(s => s.status === "delivered").length;
    const totalReturned = allShipments.filter(s => s.status === "returned").length;
    const deliveryRate = allShipments.length > 0 
      ? Math.round((totalDelivered / allShipments.length) * 100) 
      : 0;

    const totalRevenue = allOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

    // Courier performance
    const courierMap = new Map<string, { orders: number; delivered: number; returned: number }>();
    allShipments.forEach(s => {
      const current = courierMap.get(s.courierName) || { orders: 0, delivered: 0, returned: 0 };
      current.orders++;
      if (s.status === "delivered") current.delivered++;
      if (s.status === "returned") current.returned++;
      courierMap.set(s.courierName, current);
    });

    const courierPerformance = Array.from(courierMap.entries()).map(([courier, data]) => ({
      courier: courier.charAt(0).toUpperCase() + courier.slice(1),
      ...data,
      deliveryRate: data.orders > 0 ? Math.round((data.delivered / data.orders) * 100) : 0,
    }));

    // City breakdown
    const cityMap = new Map<string, { orders: number; delivered: number; revenue: number }>();
    allOrders.forEach(o => {
      const city = o.city || "Unknown";
      const current = cityMap.get(city) || { orders: 0, delivered: 0, revenue: 0 };
      current.orders++;
      current.revenue += Number(o.totalAmount || 0);
      if (o.orderStatus === "delivered") current.delivered++;
      cityMap.set(city, current);
    });

    const cityBreakdown = Array.from(cityMap.entries())
      .map(([city, data]) => ({
        city,
        orders: data.orders,
        delivered: data.delivered,
        revenue: data.revenue.toLocaleString(),
      }))
      .sort((a, b) => b.orders - a.orders);

    // Daily orders (simplified)
    const dailyOrders = [
      { date: "Mon", orders: 12, delivered: 10 },
      { date: "Tue", orders: 15, delivered: 12 },
      { date: "Wed", orders: 8, delivered: 8 },
      { date: "Thu", orders: 20, delivered: 18 },
      { date: "Fri", orders: 25, delivered: 22 },
      { date: "Sat", orders: 18, delivered: 15 },
      { date: "Sun", orders: 10, delivered: 9 },
    ];

    return {
      overview: {
        totalOrders: allOrders.length,
        totalDelivered,
        totalReturned,
        deliveryRate,
        avgDeliveryTime: 2.5,
        totalRevenue: totalRevenue.toLocaleString(),
      },
      courierPerformance,
      cityBreakdown,
      dailyOrders,
    };
  }

  // Seed demo data
  async seedDemoData(): Promise<void> {
    // Demo data seeding disabled to favor real data
    return;
  }
}

export const storage = new DatabaseStorage();
