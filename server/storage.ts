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
import { eq, desc, and, or, ilike, sql, count, inArray, isNull, isNotNull, gte } from "drizzle-orm";

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
  getOrders(merchantId: string, options?: { search?: string; status?: string; courier?: string; city?: string; month?: string; page?: number; pageSize?: number }): Promise<{ orders: Order[]; total: number }>;
  getUniqueCities(merchantId: string): Promise<string[]>;
  getUniqueStatuses(merchantId: string): Promise<string[]>;
  getOrderById(merchantId: string, id: string): Promise<Order | undefined>;
  getOrderByShopifyId(merchantId: string, shopifyOrderId: string): Promise<Order | undefined>;
  getExistingShopifyOrderIds(merchantId: string, shopifyOrderIds: string[]): Promise<Set<string>>;
  getExistingOrdersByShopifyIds(merchantId: string, shopifyOrderIds: string[]): Promise<Map<string, string>>;
  getOrdersWithCourierStatus(merchantId: string, shopifyOrderIds: string[]): Promise<Set<string>>;
  getRecentOrders(merchantId: string, limit?: number): Promise<Order[]>;
  getOrdersWithMissingCity(merchantId: string, limit?: number): Promise<{ id: string; shopifyOrderId: string }[]>;
  getOrdersForCourierSync(merchantId: string, options?: { forceRefresh?: boolean; limit?: number }): Promise<Order[]>;
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
  generateCodRecordsFromOrders(merchantId: string): Promise<{ created: number; skipped: number }>;

  // Sync Logs
  createSyncLog(log: InsertSyncLog): Promise<SyncLog>;
  updateSyncLog(id: string, data: Partial<InsertSyncLog>): Promise<void>;
  getRecentSyncLogs(merchantId: string, limit?: number): Promise<SyncLog[]>;

  // Data Health
  getDataHealthStats(merchantId: string): Promise<{ missingPhone: number; missingAddress: number; missingCity: number; missingName: number; totalOrders: number }>;
  getMerchantByShopDomain(shopDomain: string): Promise<{ merchantId: string; storeId: string; accessToken: string } | null>;
  getOrdersUpdatedSince(merchantId: string, since: Date, limit?: number): Promise<Order[]>;

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
  async getOrders(merchantId: string, options?: { search?: string; status?: string; courier?: string; city?: string; month?: string; page?: number; pageSize?: number; workflowStatus?: string; pendingReasonType?: string }): Promise<{ orders: Order[]; total: number }> {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    let conditions = [eq(orders.merchantId, merchantId)];
    
    if (options?.workflowStatus && options.workflowStatus !== "all") {
      conditions.push(eq(orders.workflowStatus, options.workflowStatus));
    }

    if (options?.pendingReasonType && options.pendingReasonType !== "all") {
      conditions.push(eq(orders.pendingReasonType, options.pendingReasonType));
    }

    if (options?.status && options.status !== "all") {
      if (options.status === "Unfulfilled") {
        conditions.push(
          or(
            isNull(orders.courierTracking),
            eq(orders.courierTracking, "")
          )!
        );
      } else {
        conditions.push(eq(orders.shipmentStatus, options.status));
      }
    }

    if (options?.courier && options.courier !== "all") {
      conditions.push(ilike(orders.courierName, `%${options.courier}%`));
    }

    // City filter
    if (options?.city) {
      conditions.push(eq(orders.city, options.city));
    }

    // Month filter - supports yyyy-MM format (e.g., "2026-01") or legacy values
    if (options?.month && options.month !== "all") {
      const now = new Date();
      let startDate: Date;
      let endDate: Date | null = null;
      
      // Check if it's a yyyy-MM format
      if (/^\d{4}-\d{2}$/.test(options.month)) {
        const [year, month] = options.month.split("-").map(Number);
        startDate = new Date(year, month - 1, 1);
        endDate = new Date(year, month, 1); // First day of next month (exclusive)
      } else if (options.month === "current") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (options.month === "last") {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 1);
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

  async getUniqueCities(merchantId: string): Promise<string[]> {
    const result = await db.selectDistinct({ city: orders.city })
      .from(orders)
      .where(and(eq(orders.merchantId, merchantId), sql`${orders.city} IS NOT NULL AND ${orders.city} != ''`))
      .orderBy(orders.city);
    
    return result.map(r => r.city).filter((c): c is string => c !== null);
  }

  async getUniqueStatuses(merchantId: string): Promise<string[]> {
    const result = await db.selectDistinct({ status: orders.shipmentStatus })
      .from(orders)
      .where(and(eq(orders.merchantId, merchantId), sql`${orders.shipmentStatus} IS NOT NULL AND ${orders.shipmentStatus} != ''`))
      .orderBy(orders.shipmentStatus);
    
    return result.map(r => r.status).filter((s): s is string => s !== null);
  }

  async getWorkflowCounts(merchantId: string): Promise<Record<string, number>> {
    const result = await db.select({
      status: orders.workflowStatus,
      count: count()
    }).from(orders)
      .where(eq(orders.merchantId, merchantId))
      .groupBy(orders.workflowStatus);
    
    const counts: Record<string, number> = { NEW: 0, PENDING: 0, HOLD: 0, READY_TO_SHIP: 0, FULFILLED: 0, CANCELLED: 0 };
    for (const row of result) {
      counts[row.status] = row.count;
    }
    return counts;
  }

  async updateOrderWorkflow(merchantId: string, orderId: string, data: Partial<Order>): Promise<Order | undefined> {
    const [updated] = await db.update(orders)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)))
      .returning();
    return updated;
  }

  async bulkUpdateOrderWorkflow(merchantId: string, orderIds: string[], data: Partial<Order>): Promise<number> {
    const result = await db.update(orders)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        inArray(orders.id, orderIds),
        eq(orders.merchantId, merchantId)
      ));
    return orderIds.length;
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

  async getOrdersWithCourierStatus(merchantId: string, shopifyOrderIds: string[]): Promise<Set<string>> {
    if (shopifyOrderIds.length === 0) return new Set();
    
    const chunkSize = 500;
    const courierConfirmedIds = new Set<string>();
    
    for (let i = 0; i < shopifyOrderIds.length; i += chunkSize) {
      const chunk = shopifyOrderIds.slice(i, i + chunkSize);
      const existing = await db.select({ shopifyOrderId: orders.shopifyOrderId })
        .from(orders)
        .where(and(
          eq(orders.merchantId, merchantId),
          inArray(orders.shopifyOrderId, chunk),
          sql`${orders.courierTracking} IS NOT NULL AND ${orders.courierTracking} != ''`
        ));
      
      for (const order of existing) {
        if (order.shopifyOrderId) {
          courierConfirmedIds.add(order.shopifyOrderId);
        }
      }
    }
    
    return courierConfirmedIds;
  }

  async getRecentOrders(merchantId: string, limit = 5): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.merchantId, merchantId)).orderBy(desc(orders.orderDate)).limit(limit);
  }

  async getOrdersWithMissingCity(merchantId: string, limit = 500): Promise<{ id: string; shopifyOrderId: string }[]> {
    const result = await db.select({
      id: orders.id,
      shopifyOrderId: orders.shopifyOrderId,
    })
    .from(orders)
    .where(and(
      eq(orders.merchantId, merchantId),
      isNull(orders.city)
    ))
    .limit(limit);
    
    return result.filter(r => r.shopifyOrderId !== null) as { id: string; shopifyOrderId: string }[];
  }

  async getOrdersForCourierSync(merchantId: string, options?: { forceRefresh?: boolean; limit?: number }): Promise<Order[]> {
    const syncLimit = options?.limit || 1500;
    const forceRefresh = options?.forceRefresh || false;

    let conditions = [
      eq(orders.merchantId, merchantId),
      sql`${orders.courierTracking} IS NOT NULL AND ${orders.courierTracking} != ''`,
      sql`${orders.courierName} IS NOT NULL AND ${orders.courierName} != ''`,
    ];

    if (!forceRefresh) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      conditions.push(
        or(
          isNull(orders.lastTrackingUpdate),
          sql`${orders.lastTrackingUpdate} < ${oneHourAgo}`
        )!
      );
    }

    return db.select().from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.orderDate))
      .limit(syncLimit);
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

  async generateCodRecordsFromOrders(merchantId: string): Promise<{ created: number; skipped: number }> {
    // Get delivered COD orders that don't have COD reconciliation records yet
    const deliveredCodOrders = await db.select()
      .from(orders)
      .where(
        and(
          eq(orders.merchantId, merchantId),
          eq(orders.paymentMethod, "cod"),
          eq(orders.shipmentStatus, "DELIVERED")
        )
      );
    
    // Get existing COD reconciliation records to avoid duplicates
    const existingRecords = await db.select({ orderId: codReconciliation.orderId })
      .from(codReconciliation)
      .where(eq(codReconciliation.merchantId, merchantId));
    
    const existingOrderIds = new Set(existingRecords.map(r => r.orderId));
    
    // Filter orders that need records created
    const ordersToCreate = deliveredCodOrders.filter(o => !existingOrderIds.has(o.id));
    const skipped = deliveredCodOrders.length - ordersToCreate.length;
    
    if (ordersToCreate.length === 0) {
      return { created: 0, skipped };
    }
    
    // Batch insert in chunks of 500 for better performance
    const BATCH_SIZE = 500;
    let created = 0;
    
    for (let i = 0; i < ordersToCreate.length; i += BATCH_SIZE) {
      const batch = ordersToCreate.slice(i, i + BATCH_SIZE);
      const values = batch.map(order => {
        const codAmount = Number(order.totalAmount) || 0;
        const courierFee = Math.round(codAmount * 0.025 * 100) / 100;
        const netAmount = codAmount - courierFee;
        return {
          merchantId,
          orderId: order.id,
          courierName: order.courierName,
          trackingNumber: order.courierTracking,
          codAmount: codAmount.toString(),
          courierFee: courierFee.toString(),
          netAmount: netAmount.toString(),
          status: "pending",
        };
      });
      
      await db.insert(codReconciliation).values(values);
      created += batch.length;
    }
    
    return { created, skipped };
  }

  // Analytics
  async getDashboardStats(merchantId: string): Promise<any> {
    const allOrders = await db.select().from(orders).where(eq(orders.merchantId, merchantId));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const deliveredToday = allOrders.filter(o => 
      o.shipmentStatus === "DELIVERED" && o.lastTrackingUpdate && new Date(o.lastTrackingUpdate) >= today
    ).length;

    const pendingShipments = allOrders.filter(o => 
      o.shipmentStatus === "Unfulfilled" || o.shipmentStatus === "pending" || !o.shipmentStatus
    ).length;

    const inTransit = allOrders.filter(o => 
      o.shipmentStatus === "IN_TRANSIT" || o.shipmentStatus === "ARRIVED_AT_DESTINATION" || o.shipmentStatus === "OUT_FOR_DELIVERY"
    ).length;

    const booked = allOrders.filter(o => 
      o.shipmentStatus === "BOOKED" || o.shipmentStatus === "PICKED_UP" || o.shipmentStatus === "ARRIVED_AT_ORIGIN"
    ).length;

    const codPending = allOrders
      .filter(o => o.paymentMethod === "cod" && o.shipmentStatus !== "DELIVERED")
      .reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

    const totalDelivered = allOrders.filter(o => o.shipmentStatus === "DELIVERED").length;
    const totalReturned = allOrders.filter(o => o.shipmentStatus === "RETURNED_TO_SHIPPER" || o.shipmentStatus === "RETURN_IN_TRANSIT").length;
    const totalFailed = allOrders.filter(o => o.shipmentStatus === "DELIVERY_FAILED" || o.shipmentStatus === "DELIVERY_ATTEMPTED").length;
    
    // Delivery rate = delivered / (delivered + returned + failed)
    const completedOrders = totalDelivered + totalReturned + totalFailed;
    const deliveryRate = completedOrders > 0 
      ? Math.round((totalDelivered / completedOrders) * 100) 
      : 0;

    // Calculate trend (compare this week vs last week)
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const thisWeekOrders = allOrders.filter(o => o.orderDate && new Date(o.orderDate) >= lastWeek).length;
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const lastWeekOrders = allOrders.filter(o => 
      o.orderDate && new Date(o.orderDate) >= twoWeeksAgo && new Date(o.orderDate) < lastWeek
    ).length;
    const ordersTrend = lastWeekOrders > 0 
      ? Math.round(((thisWeekOrders - lastWeekOrders) / lastWeekOrders) * 100)
      : 0;

    return {
      totalOrders: allOrders.length,
      pendingShipments,
      inTransit,
      booked,
      deliveredToday,
      totalDelivered,
      totalReturned,
      totalFailed,
      codPending: `PKR ${codPending.toLocaleString()}`,
      ordersTrend,
      deliveryRate,
    };
  }

  async getAnalytics(merchantId: string, dateRange: string): Promise<any> {
    const allOrders = await db.select().from(orders).where(eq(orders.merchantId, merchantId));

    const totalDelivered = allOrders.filter(o => o.shipmentStatus === "DELIVERED").length;
    const totalReturned = allOrders.filter(o => o.shipmentStatus === "RETURNED_TO_SHIPPER" || o.shipmentStatus === "RETURN_IN_TRANSIT").length;
    const totalFailed = allOrders.filter(o => o.shipmentStatus === "DELIVERY_FAILED" || o.shipmentStatus === "DELIVERY_ATTEMPTED").length;
    
    // Delivery rate = delivered / (delivered + returned + failed)
    const completedOrders = totalDelivered + totalReturned + totalFailed;
    const deliveryRate = completedOrders > 0 
      ? Math.round((totalDelivered / completedOrders) * 100) 
      : 0;

    const totalRevenue = allOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const deliveredRevenue = allOrders
      .filter(o => o.shipmentStatus === "DELIVERED")
      .reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

    // Courier performance from orders table
    const courierMap = new Map<string, { orders: number; delivered: number; returned: number; failed: number }>();
    allOrders.forEach(o => {
      const courier = o.courierName || "No Courier";
      const current = courierMap.get(courier) || { orders: 0, delivered: 0, returned: 0, failed: 0 };
      current.orders++;
      if (o.shipmentStatus === "DELIVERED") current.delivered++;
      if (o.shipmentStatus === "RETURNED_TO_SHIPPER" || o.shipmentStatus === "RETURN_IN_TRANSIT") current.returned++;
      if (o.shipmentStatus === "DELIVERY_FAILED" || o.shipmentStatus === "DELIVERY_ATTEMPTED") current.failed++;
      courierMap.set(courier, current);
    });

    const courierPerformance = Array.from(courierMap.entries())
      .filter(([courier]) => courier !== "No Courier")
      .map(([courier, data]) => ({
        courier: courier,
        ...data,
        deliveryRate: (data.delivered + data.returned + data.failed) > 0 
          ? Math.round((data.delivered / (data.delivered + data.returned + data.failed)) * 100) 
          : 0,
      }))
      .sort((a, b) => b.orders - a.orders);

    // City breakdown from orders table
    const cityMap = new Map<string, { orders: number; delivered: number; returned: number; revenue: number }>();
    allOrders.forEach(o => {
      const city = o.city || "Unknown";
      const current = cityMap.get(city) || { orders: 0, delivered: 0, returned: 0, revenue: 0 };
      current.orders++;
      current.revenue += Number(o.totalAmount || 0);
      if (o.shipmentStatus === "DELIVERED") current.delivered++;
      if (o.shipmentStatus === "RETURNED_TO_SHIPPER" || o.shipmentStatus === "RETURN_IN_TRANSIT") current.returned++;
      cityMap.set(city, current);
    });

    const cityBreakdown = Array.from(cityMap.entries())
      .map(([city, data]) => ({
        city,
        orders: data.orders,
        delivered: data.delivered,
        returned: data.returned,
        revenue: `PKR ${data.revenue.toLocaleString()}`,
        deliveryRate: (data.delivered + data.returned) > 0 
          ? Math.round((data.delivered / (data.delivered + data.returned)) * 100) 
          : 0,
      }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 20); // Top 20 cities

    // Daily orders for last 7 days
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const dayOrders = allOrders.filter(o => {
        if (!o.orderDate) return false;
        const orderDate = new Date(o.orderDate);
        return orderDate >= date && orderDate < nextDate;
      });
      
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      last7Days.push({
        date: dayName,
        orders: dayOrders.length,
        delivered: dayOrders.filter(o => o.shipmentStatus === "DELIVERED").length,
        revenue: dayOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0),
      });
    }

    return {
      overview: {
        totalOrders: allOrders.length,
        totalDelivered,
        totalReturned,
        totalFailed,
        deliveryRate,
        totalRevenue: `PKR ${totalRevenue.toLocaleString()}`,
        deliveredRevenue: `PKR ${deliveredRevenue.toLocaleString()}`,
      },
      courierPerformance,
      cityBreakdown,
      dailyOrders: last7Days,
    };
  }

  // Sync Logs
  async createSyncLog(log: InsertSyncLog): Promise<SyncLog> {
    const [created] = await db.insert(syncLogs).values(log).returning();
    return created;
  }

  async updateSyncLog(id: string, data: Partial<InsertSyncLog>): Promise<void> {
    await db.update(syncLogs).set({
      ...data,
      completedAt: new Date(),
    }).where(eq(syncLogs.id, id));
  }

  async getRecentSyncLogs(merchantId: string, limit = 20): Promise<SyncLog[]> {
    return db.select().from(syncLogs)
      .where(eq(syncLogs.merchantId, merchantId))
      .orderBy(desc(syncLogs.startedAt))
      .limit(limit);
  }

  // Data Health
  async getDataHealthStats(merchantId: string): Promise<{ missingPhone: number; missingAddress: number; missingCity: number; missingName: number; totalOrders: number }> {
    const [total] = await db.select({ count: count() }).from(orders)
      .where(eq(orders.merchantId, merchantId));
    const [missingPhoneResult] = await db.select({ count: count() }).from(orders)
      .where(and(eq(orders.merchantId, merchantId), or(isNull(orders.customerPhone), eq(orders.customerPhone, ''))));
    const [missingAddressResult] = await db.select({ count: count() }).from(orders)
      .where(and(eq(orders.merchantId, merchantId), or(isNull(orders.shippingAddress), eq(orders.shippingAddress, ''))));
    const [missingCityResult] = await db.select({ count: count() }).from(orders)
      .where(and(eq(orders.merchantId, merchantId), or(isNull(orders.city), eq(orders.city, ''))));
    const [missingNameResult] = await db.select({ count: count() }).from(orders)
      .where(and(eq(orders.merchantId, merchantId), or(eq(orders.customerName, 'Unknown'), eq(orders.customerName, ''))));

    return {
      totalOrders: total?.count || 0,
      missingPhone: missingPhoneResult?.count || 0,
      missingAddress: missingAddressResult?.count || 0,
      missingCity: missingCityResult?.count || 0,
      missingName: missingNameResult?.count || 0,
    };
  }

  async getMerchantByShopDomain(shopDomain: string): Promise<{ merchantId: string; storeId: string; accessToken: string } | null> {
    const [store] = await db.select().from(shopifyStores)
      .where(and(
        eq(shopifyStores.shopDomain, shopDomain),
        eq(shopifyStores.isConnected, true)
      ));
    if (!store || !store.accessToken) return null;
    return { merchantId: store.merchantId, storeId: store.id, accessToken: store.accessToken };
  }

  async getOrdersUpdatedSince(merchantId: string, since: Date, limit = 1000): Promise<Order[]> {
    return db.select().from(orders)
      .where(and(
        eq(orders.merchantId, merchantId),
        gte(orders.updatedAt, since)
      ))
      .orderBy(desc(orders.updatedAt))
      .limit(limit);
  }

  // Seed demo data
  async seedDemoData(): Promise<void> {
    return;
  }
}

export const storage = new DatabaseStorage();
