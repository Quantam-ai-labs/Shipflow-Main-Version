import { toMerchantStartOfDay, toMerchantEndOfDay, DEFAULT_TIMEZONE } from "./utils/timezone";
import {
  merchants, teamMembers, shopifyStores, courierAccounts,
  orders, shipments, shipmentEvents, remarks, codReconciliation, syncLogs, workflowAuditLog, bookingJobs,
  shipmentBatches, shipmentBatchItems, shipmentPrintRecords, orderPayments, orderChangeLog,
  shopifyWebhookEvents, cancellationJobs, cancellationJobItems,
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
  type BookingJob, type InsertBookingJob,
  type ShipmentBatch, type InsertShipmentBatch,
  type ShipmentBatchItem, type InsertShipmentBatchItem,
  type ShipmentPrintRecord, type InsertShipmentPrintRecord,
  type OrderPayment, type InsertOrderPayment,
  type OrderChangeLog, type InsertOrderChangeLog,
  type ShopifyWebhookEvent, type InsertShopifyWebhookEvent,
  type CancellationJob, type InsertCancellationJob,
  type CancellationJobItem, type InsertCancellationJobItem,
  courierStatusMappings,
  type CourierStatusMapping, type InsertCourierStatusMapping,
  unmappedCourierStatuses,
  type UnmappedCourierStatus,
  courierKeywordMappings,
  type CourierKeywordMapping, type InsertCourierKeywordMapping,
  products,
  type Product, type InsertProduct,
  users,
  campaignJourneyEvents,
  type CampaignJourneyEvent, type InsertCampaignJourneyEvent,
  platformSettings,
  type PlatformSettings,
  whatsappResponses,
  type WhatsappResponse, type InsertWhatsappResponse,
  waConversations, waMessages,
  type WaConversation, type InsertWaConversation,
  type WaMessage, type InsertWaMessage,
  waMetaTemplates,
  type WaMetaTemplate, type InsertWaMetaTemplate,
  waAutomations,
  type WaAutomation, type InsertWaAutomation,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, or, ilike, sql, count, inArray, isNull, isNotNull, gte, lte } from "drizzle-orm";
import { normalizePakistaniPhone } from "./utils/phone";

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
  getOrders(merchantId: string, options?: { search?: string; searchOrderNumber?: string; searchTracking?: string; searchName?: string; searchPhone?: string; status?: string; courier?: string; city?: string; month?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number; workflowStatus?: string; pendingReasonType?: string; shipmentStatus?: string; excludeHeavyFields?: boolean; timezone?: string; filterTag?: string; filterStatuses?: string; minItems?: number; maxItems?: number; sortBy?: string; sortDir?: string; filterPayment?: string }): Promise<{ orders: Order[]; total: number }>;
  getUniqueCities(merchantId: string): Promise<string[]>;
  getUniqueStatuses(merchantId: string): Promise<string[]>;
  getOrderById(merchantId: string, id: string): Promise<Order | undefined>;
  getOrderByShopifyId(merchantId: string, shopifyOrderId: string): Promise<Order | undefined>;
  getOrderByTracking(merchantId: string, trackingNumber: string): Promise<Order | undefined>;
  getExistingShopifyOrderIds(merchantId: string, shopifyOrderIds: string[]): Promise<Set<string>>;
  getExistingOrdersByShopifyIds(merchantId: string, shopifyOrderIds: string[]): Promise<Map<string, string>>;
  getOrdersWithCourierStatus(merchantId: string, shopifyOrderIds: string[]): Promise<Set<string>>;
  getOrdersInManagedWorkflow(merchantId: string, shopifyOrderIds: string[]): Promise<Set<string>>;
  getRecentOrders(merchantId: string, limit?: number): Promise<Order[]>;
  getOrdersWithMissingCity(merchantId: string, limit?: number): Promise<{ id: string; shopifyOrderId: string }[]>;
  getOrdersForCourierSync(merchantId: string, options?: { forceRefresh?: boolean; limit?: number; includeLowPriority?: boolean }): Promise<Order[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  createOrdersBulk(ordersList: InsertOrder[]): Promise<Order[]>;
  updateOrder(merchantId: string, id: string, data: Partial<InsertOrder>): Promise<Order | undefined>;

  // Shipments - All scoped by merchantId
  getShipments(merchantId: string, options?: { search?: string; status?: string; courier?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number; timezone?: string }): Promise<{ shipments: Shipment[]; total: number }>;
  getShipmentsByOrderId(merchantId: string, orderId: string): Promise<Shipment[]>;
  getShipmentsByOrderIds(merchantId: string, orderIds: string[]): Promise<Shipment[]>;
  createShipment(shipment: InsertShipment): Promise<Shipment>;
  updateShipment(merchantId: string, id: string, data: Partial<InsertShipment>): Promise<Shipment | undefined>;

  // Shipment Events - Scoped via shipment's merchantId
  getShipmentEvents(merchantId: string, shipmentId: string): Promise<ShipmentEvent[]>;
  createShipmentEvent(event: InsertShipmentEvent): Promise<ShipmentEvent>;

  // Remarks - Scoped via order's merchantId
  getRemarks(merchantId: string, orderId: string): Promise<Remark[]>;
  createRemark(merchantId: string, remark: InsertRemark): Promise<Remark>;

  // COD Reconciliation - All scoped by merchantId
  getCodReconciliation(merchantId: string, options?: { search?: string; status?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number; timezone?: string }): Promise<{ records: CodReconciliation[]; total: number; summary: any }>;
  getCodRecordById(merchantId: string, id: string): Promise<CodReconciliation | undefined>;
  createCodReconciliation(record: InsertCodReconciliation): Promise<CodReconciliation>;
  updateCodReconciliation(merchantId: string, id: string, data: Partial<InsertCodReconciliation>): Promise<CodReconciliation | undefined>;
  generateCodRecordsFromOrders(merchantId: string): Promise<{ created: number; skipped: number }>;
  getPendingCodRecordsByCourier(merchantId: string, courierName: string): Promise<CodReconciliation[]>;

  // Sync Logs
  createSyncLog(log: InsertSyncLog): Promise<SyncLog>;
  updateSyncLog(id: string, data: Partial<InsertSyncLog>): Promise<void>;
  getRecentSyncLogs(merchantId: string, limit?: number): Promise<SyncLog[]>;

  // Data Health
  getDataHealthStats(merchantId: string): Promise<{ missingPhone: number; missingAddress: number; missingCity: number; missingName: number; totalOrders: number }>;
  getMerchantByShopDomain(shopDomain: string): Promise<{ merchantId: string; storeId: string; accessToken: string } | null>;
  getOrdersUpdatedSince(merchantId: string, since: Date, limit?: number): Promise<Order[]>;

  // Audit Log
  getOrderAuditLog(merchantId: string, orderId: string): Promise<any[]>;

  // Booking Jobs
  getBookingJob(merchantId: string, orderId: string, courierName: string): Promise<BookingJob | undefined>;
  getBookingJobsByOrderIds(merchantId: string, orderIds: string[]): Promise<BookingJob[]>;
  createBookingJob(job: InsertBookingJob): Promise<BookingJob>;
  updateBookingJob(id: string, data: Partial<InsertBookingJob>): Promise<BookingJob | undefined>;
  getBookingLogs(merchantId: string, options?: { page?: number; pageSize?: number; courier?: string; status?: string; dateFrom?: string; dateTo?: string; timezone?: string }): Promise<{ logs: any[]; total: number }>;
  getOrdersByIds(merchantId: string, orderIds: string[]): Promise<Order[]>;
  updateOrderWorkflow(merchantId: string, orderId: string, data: Partial<InsertOrder>): Promise<Order | undefined>;

  // Analytics
  getDashboardStats(merchantId: string, options?: { dateFrom?: string; dateTo?: string; timezone?: string }): Promise<any>;
  getAnalytics(merchantId: string, dateRange: string, options?: { dateFrom?: string; dateTo?: string; timezone?: string }): Promise<any>;

  // Shipment Batches
  createShipmentBatch(batch: InsertShipmentBatch): Promise<ShipmentBatch>;
  updateShipmentBatch(id: string, data: Partial<InsertShipmentBatch>): Promise<ShipmentBatch | undefined>;
  getShipmentBatches(merchantId: string, options?: { page?: number; pageSize?: number; courier?: string; dateFrom?: string; dateTo?: string }): Promise<{ batches: ShipmentBatch[]; total: number }>;
  getShipmentBatchById(merchantId: string, id: string): Promise<ShipmentBatch | undefined>;

  // Shipment Batch Items
  createShipmentBatchItem(item: InsertShipmentBatchItem): Promise<ShipmentBatchItem>;
  getShipmentBatchItems(batchId: string): Promise<ShipmentBatchItem[]>;

  // Print Records
  createShipmentPrintRecord(record: InsertShipmentPrintRecord): Promise<ShipmentPrintRecord>;
  getShipmentPrintRecord(merchantId: string, shipmentId: string): Promise<ShipmentPrintRecord | undefined>;
  getShipmentPrintRecordById(merchantId: string, id: string): Promise<ShipmentPrintRecord | undefined>;
  updateShipmentPrintRecord(id: string, data: Partial<InsertShipmentPrintRecord>): Promise<ShipmentPrintRecord | undefined>;

  // Order Change Log
  createOrderChangeLog(entry: InsertOrderChangeLog): Promise<OrderChangeLog>;
  getOrderChangeLog(merchantId: string, orderId: string): Promise<OrderChangeLog[]>;

  // WA Meta Templates
  getWaMetaTemplates(merchantId: string): Promise<WaMetaTemplate[]>;
  getWaMetaTemplateById(merchantId: string, id: string): Promise<WaMetaTemplate | undefined>;
  createWaMetaTemplate(data: InsertWaMetaTemplate): Promise<WaMetaTemplate>;
  upsertWaMetaTemplate(merchantId: string, data: Omit<InsertWaMetaTemplate, "merchantId">): Promise<WaMetaTemplate>;
  deleteWaMetaTemplate(merchantId: string, id: string): Promise<void>;

  // WA Automations
  getWaAutomations(merchantId: string): Promise<WaAutomation[]>;
  getWaAutomationsByTrigger(merchantId: string, triggerStatus: string): Promise<WaAutomation[]>;
  createWaAutomation(data: InsertWaAutomation): Promise<WaAutomation>;
  updateWaAutomation(merchantId: string, id: string, data: Partial<InsertWaAutomation>): Promise<WaAutomation | undefined>;
  deleteWaAutomation(merchantId: string, id: string): Promise<void>;

  // Order Payments
  getOrderPayments(merchantId: string, orderId: string): Promise<OrderPayment[]>;
  createOrderPayment(payment: InsertOrderPayment): Promise<OrderPayment>;
  deleteOrderPayment(merchantId: string, id: string): Promise<void>;
  getOrderPaymentSum(merchantId: string, orderId: string): Promise<number>;

  // Webhook Events
  createWebhookEvent(event: InsertShopifyWebhookEvent): Promise<ShopifyWebhookEvent>;
  getWebhookEventByWebhookId(merchantId: string, webhookId: string): Promise<ShopifyWebhookEvent | undefined>;
  isDuplicateWebhook(merchantId: string, topic: string, payloadHash: string): Promise<boolean>;
  updateWebhookEventStatus(id: string, status: string, errorMessage?: string): Promise<void>;

  // Cancellation Jobs
  createCancellationJob(job: InsertCancellationJob): Promise<CancellationJob>;
  getCancellationJob(merchantId: string, jobId: string): Promise<CancellationJob | undefined>;
  updateCancellationJob(id: string, data: Partial<CancellationJob>): Promise<CancellationJob | undefined>;
  getCancellationJobs(merchantId: string, options?: { page?: number; pageSize?: number }): Promise<{ jobs: CancellationJob[]; total: number }>;
  createCancellationJobItem(item: InsertCancellationJobItem): Promise<CancellationJobItem>;
  getCancellationJobItems(jobId: string): Promise<CancellationJobItem[]>;
  updateCancellationJobItem(id: string, data: Partial<CancellationJobItem>): Promise<CancellationJobItem | undefined>;

  // Courier Status Mappings
  getCourierStatusMappings(merchantId: string, courierName?: string): Promise<CourierStatusMapping[]>;
  upsertCourierStatusMapping(mapping: InsertCourierStatusMapping): Promise<CourierStatusMapping>;
  deleteCourierStatusMapping(merchantId: string, id: string): Promise<void>;
  resetCourierStatusMappings(merchantId: string, courierName?: string): Promise<void>;
  seedDefaultMappings(merchantId: string): Promise<{ created: number; existing: number }>;

  // Unmapped Courier Statuses
  recordUnmappedStatus(merchantId: string, courierName: string, rawStatus: string, trackingNumber?: string): Promise<void>;
  getUnmappedStatuses(merchantId: string, resolved?: boolean): Promise<UnmappedCourierStatus[]>;
  getUnmappedStatusCount(merchantId: string): Promise<number>;
  resolveUnmappedStatus(merchantId: string, id: string): Promise<void>;
  dismissUnmappedStatus(merchantId: string, id: string): Promise<void>;

  // Courier Keyword Mappings
  getCourierKeywordMappings(merchantId: string): Promise<CourierKeywordMapping[]>;
  createCourierKeywordMapping(mapping: InsertCourierKeywordMapping): Promise<CourierKeywordMapping>;
  updateCourierKeywordMapping(merchantId: string, id: string, data: Partial<InsertCourierKeywordMapping>): Promise<CourierKeywordMapping | undefined>;
  deleteCourierKeywordMapping(merchantId: string, id: string): Promise<void>;

  // Products
  getProducts(merchantId: string, options?: { search?: string; status?: string; page?: number; pageSize?: number }): Promise<{ products: Product[]; total: number }>;
  getProductById(merchantId: string, id: string): Promise<Product | undefined>;
  getProductsByShopifyIds(merchantId: string, shopifyProductIds: string[]): Promise<Product[]>;
  upsertProduct(merchantId: string, shopifyProductId: string, data: Partial<InsertProduct>): Promise<Product>;
  deleteProductsByMerchant(merchantId: string): Promise<void>;

  // Terminal Order Re-check
  getRecentlyTerminalOrders(merchantId: string, daysSinceTerminal: number, minHoursSinceLastCheck: number): Promise<Order[]>;

  // Campaign Journey Events
  getJourneyEvents(merchantId: string, campaignKey?: string): Promise<CampaignJourneyEvent[]>;
  createJourneyEvent(event: InsertCampaignJourneyEvent): Promise<CampaignJourneyEvent>;
  updateJourneyEventSnapshot(id: string, snapshotAfter: any, evaluatedAt: Date): Promise<CampaignJourneyEvent | undefined>;

  // WhatsApp Responses
  saveWhatsappResponse(data: InsertWhatsappResponse): Promise<WhatsappResponse>;
  getWhatsappResponsesByOrder(merchantId: string, orderId: string): Promise<WhatsappResponse[]>;
  getWhatsappResponsesByPhone(merchantId: string, phone: string): Promise<WhatsappResponse[]>;

  // WA Conversations
  getConversations(merchantId: string): Promise<WaConversation[]>;
  getConversationById(id: string): Promise<WaConversation | undefined>;
  getConversationByPhone(merchantId: string, phone: string): Promise<WaConversation | undefined>;
  upsertConversation(data: { merchantId: string; contactPhone: string; contactName?: string; orderId?: string | null; orderNumber?: string | null; lastMessage?: string | null }): Promise<WaConversation>;
  deleteConversation(id: string): Promise<void>;
  getWaMessages(conversationId: string): Promise<WaMessage[]>;
  createWaMessage(data: { conversationId: string; direction: string; senderName?: string | null; text?: string | null; waMessageId?: string | null; status?: string | null; messageType?: string | null; mediaUrl?: string | null; reactionEmoji?: string | null; referenceMessageId?: string | null }): Promise<WaMessage>;
  updateConversationLabel(merchantId: string, convId: string, label: string | null): Promise<void>;
  updateConversationAssignment(merchantId: string, convId: string, userId: string | null, userName: string | null): Promise<void>;
  markConversationRead(merchantId: string, convId: string): Promise<void>;

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
  async getOrders(merchantId: string, options?: { search?: string; searchOrderNumber?: string; searchTracking?: string; searchName?: string; searchPhone?: string; status?: string; courier?: string; city?: string; month?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number; workflowStatus?: string; pendingReasonType?: string; shipmentStatus?: string; excludeHeavyFields?: boolean; timezone?: string; filterTag?: string; filterStatuses?: string; minItems?: number; maxItems?: number; sortBy?: string; sortDir?: string; filterPayment?: string }): Promise<{ orders: Order[]; total: number }> {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    let conditions = [eq(orders.merchantId, merchantId)];
    
    if (options?.workflowStatus && options.workflowStatus !== "all" && options.workflowStatus !== "ALL") {
      conditions.push(eq(orders.workflowStatus, options.workflowStatus));
    }

    if (options?.pendingReasonType && options.pendingReasonType !== "all") {
      conditions.push(eq(orders.pendingReasonType, options.pendingReasonType));
    }

    if (options?.shipmentStatus && options.shipmentStatus !== "all") {
      conditions.push(eq(orders.shipmentStatus, options.shipmentStatus));
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

    if (options?.city) {
      conditions.push(eq(orders.city, options.city));
    }

    if (options?.dateFrom) {
      const tz = options?.timezone || DEFAULT_TIMEZONE;
      conditions.push(sql`${orders.orderDate} >= ${toMerchantStartOfDay(options.dateFrom, tz)}`);
    }
    if (options?.dateTo) {
      const tz = options?.timezone || DEFAULT_TIMEZONE;
      conditions.push(sql`${orders.orderDate} <= ${toMerchantEndOfDay(options.dateTo, tz)}`);
    }

    if (!options?.dateFrom && !options?.dateTo && options?.month && options.month !== "all") {
      const tz = options?.timezone || DEFAULT_TIMEZONE;
      const now = new Date();
      let startDateStr: string;
      let endDateStr: string | null = null;
      
      const pad = (n: number) => String(n).padStart(2, '0');
      const toDateStr = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
      
      if (/^\d{4}-\d{2}$/.test(options.month)) {
        const [year, month] = options.month.split("-").map(Number);
        startDateStr = toDateStr(year, month, 1);
        const endMonth = month === 12 ? 1 : month + 1;
        const endYear = month === 12 ? year + 1 : year;
        endDateStr = toDateStr(endYear, endMonth, 1);
      } else if (options.month === "current") {
        startDateStr = toDateStr(now.getFullYear(), now.getMonth() + 1, 1);
      } else if (options.month === "last") {
        const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
        const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        startDateStr = toDateStr(lastMonthYear, lastMonth, 1);
        endDateStr = toDateStr(now.getFullYear(), now.getMonth() + 1, 1);
      } else if (options.month === "2months") {
        const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        startDateStr = toDateStr(d.getFullYear(), d.getMonth() + 1, 1);
      } else if (options.month === "3months") {
        const d = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        startDateStr = toDateStr(d.getFullYear(), d.getMonth() + 1, 1);
      } else {
        startDateStr = "1970-01-01";
      }
      
      conditions.push(sql`${orders.orderDate} >= ${toMerchantStartOfDay(startDateStr, tz)}`);
      if (endDateStr) {
        conditions.push(sql`${orders.orderDate} < ${toMerchantStartOfDay(endDateStr, tz)}`);
      }
    }

    if (options?.search) {
      conditions.push(
        or(
          ilike(orders.orderNumber, `%${options.search}%`),
          ilike(orders.customerName, `%${options.search}%`),
          ilike(orders.city, `%${options.search}%`),
          ilike(orders.customerPhone, `%${options.search}%`),
          ilike(orders.courierTracking, `%${options.search}%`)
        )!
      );
    }

    if (options?.searchOrderNumber) {
      const parts = options.searchOrderNumber.split(",").map(s => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        const partConds = parts.map(p =>
          or(
            ilike(orders.orderNumber, `%${p}%`),
            ilike(orders.customerPhone, `%${p}%`),
            ilike(orders.courierTracking, `%${p}%`),
            ilike(orders.customerName, `%${p}%`),
          )!
        );
        conditions.push(partConds.length > 1 ? or(...partConds)! : partConds[0]);
      }
    }
    if (options?.searchTracking) {
      const parts = options.searchTracking.split(",").map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        conditions.push(or(...parts.map(p => ilike(orders.courierTracking, `%${p}%`)))!);
      } else if (parts.length === 1) {
        conditions.push(ilike(orders.courierTracking, `%${parts[0]}%`));
      }
    }
    if (options?.searchName) {
      conditions.push(ilike(orders.customerName, `%${options.searchName}%`));
    }
    if (options?.searchPhone) {
      conditions.push(ilike(orders.customerPhone, `%${options.searchPhone}%`));
    }

    if (options?.filterTag && options.filterTag.trim()) {
      const tagVal = options.filterTag.trim();
      conditions.push(sql`${tagVal} = ANY(${orders.tags})`);
    }

    if (options?.filterStatuses && options.filterStatuses.trim()) {
      const statuses = options.filterStatuses.split(",").map(s => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        conditions.push(inArray(orders.workflowStatus, statuses));
      }
    }

    if (options?.minItems !== undefined && options.minItems > 0) {
      conditions.push(gte(orders.totalQuantity, options.minItems));
    }

    if (options?.maxItems !== undefined && options.maxItems > 0) {
      conditions.push(lte(orders.totalQuantity, options.maxItems));
    }

    if (options?.filterPayment && options.filterPayment !== "all") {
      conditions.push(eq(orders.codPaymentStatus, options.filterPayment));
    }

    const whereClause = and(...conditions);

    const lightColumns = {
      id: orders.id,
      merchantId: orders.merchantId,
      shopifyOrderId: orders.shopifyOrderId,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      customerEmail: orders.customerEmail,
      customerPhone: orders.customerPhone,
      shippingAddress: orders.shippingAddress,
      city: orders.city,
      province: orders.province,
      postalCode: orders.postalCode,
      country: orders.country,
      totalAmount: orders.totalAmount,
      subtotalAmount: orders.subtotalAmount,
      shippingAmount: orders.shippingAmount,
      discountAmount: orders.discountAmount,
      currency: orders.currency,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
      fulfillmentStatus: orders.fulfillmentStatus,
      orderStatus: orders.orderStatus,
      totalQuantity: orders.totalQuantity,
      tags: orders.tags,
      notes: orders.notes,
      courierName: orders.courierName,
      courierTracking: orders.courierTracking,
      shipmentStatus: orders.shipmentStatus,
      courierRawStatus: orders.courierRawStatus,
      remark: orders.remark,
      lastApiSyncAt: orders.lastApiSyncAt,
      lastWebhookAt: orders.lastWebhookAt,
      shopifyUpdatedAt: orders.shopifyUpdatedAt,
      lastTrackingUpdate: orders.lastTrackingUpdate,
      orderDate: orders.orderDate,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      workflowStatus: orders.workflowStatus,
      pendingReason: orders.pendingReason,
      pendingReasonType: orders.pendingReasonType,
      holdUntil: orders.holdUntil,
      holdCreatedAt: orders.holdCreatedAt,
      confirmedAt: orders.confirmedAt,
      cancelledAt: orders.cancelledAt,
      cancelReason: orders.cancelReason,
      previousWorkflowStatus: orders.previousWorkflowStatus,
      lastStatusChangedAt: orders.lastStatusChangedAt,
      itemSummary: orders.itemSummary,
      courierSlipUrl: orders.courierSlipUrl,
      bookingStatus: orders.bookingStatus,
      bookingError: orders.bookingError,
      bookedAt: orders.bookedAt,
      dispatchedAt: orders.dispatchedAt,
      deliveredAt: orders.deliveredAt,
      returnedAt: orders.returnedAt,
      shopifyFulfillmentId: orders.shopifyFulfillmentId,
      prepaidAmount: orders.prepaidAmount,
      codRemaining: orders.codRemaining,
      codPaymentStatus: orders.codPaymentStatus,
      lastPaymentAt: orders.lastPaymentAt,
      orderSource: orders.orderSource,
      lineItems: orders.lineItems,
    };

    const selectQuery = options?.excludeHeavyFields
      ? db.select(lightColumns).from(orders)
      : db.select().from(orders);

    const sortColumnMap: Record<string, any> = {
      orderDate: orders.orderDate,
      orderNumber: orders.orderNumber,
      totalAmount: orders.totalAmount,
      totalQuantity: orders.totalQuantity,
      workflowStatus: orders.workflowStatus,
      courierName: orders.courierName,
    };
    const sortCol = (options?.sortBy && sortColumnMap[options.sortBy]) ? sortColumnMap[options.sortBy] : orders.orderDate;
    const sortFn = options?.sortDir === "asc" ? asc : desc;

    const [result, totalResult] = await Promise.all([
      selectQuery.where(whereClause).orderBy(sortFn(sortCol)).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(orders).where(whereClause)
    ]);

    return { orders: result as Order[], total: totalResult[0]?.count || 0 };
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

  async getWorkflowCounts(merchantId: string, options?: { dateFrom?: string; dateTo?: string; timezone?: string }): Promise<{ counts: Record<string, number>; totalAmounts: Record<string, number> }> {
    let conditions = [eq(orders.merchantId, merchantId)];
    const tz = options?.timezone || DEFAULT_TIMEZONE;
    if (options?.dateFrom) {
      const fromDate = new Date(options.dateFrom);
      if (!isNaN(fromDate.getTime())) {
        conditions.push(sql`${orders.orderDate} >= ${toMerchantStartOfDay(options.dateFrom, tz)}`);
      }
    }
    if (options?.dateTo) {
      const toDate = new Date(options.dateTo);
      if (!isNaN(toDate.getTime())) {
        conditions.push(sql`${orders.orderDate} <= ${toMerchantEndOfDay(options.dateTo, tz)}`);
      }
    }
    const result = await db.select({
      status: orders.workflowStatus,
      count: count(),
      totalAmount: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
    }).from(orders)
      .where(and(...conditions))
      .groupBy(orders.workflowStatus);
    
    const counts: Record<string, number> = { NEW: 0, PENDING: 0, HOLD: 0, READY_TO_SHIP: 0, BOOKED: 0, FULFILLED: 0, DELIVERED: 0, RETURN: 0, CANCELLED: 0 };
    const totalAmounts: Record<string, number> = { NEW: 0, PENDING: 0, HOLD: 0, READY_TO_SHIP: 0, BOOKED: 0, FULFILLED: 0, DELIVERED: 0, RETURN: 0, CANCELLED: 0 };
    for (const row of result) {
      counts[row.status] = row.count;
      totalAmounts[row.status] = Number(row.totalAmount) || 0;
    }
    return { counts, totalAmounts };
  }

  async updateOrderWorkflow(merchantId: string, orderId: string, data: Partial<Order>): Promise<Order | undefined> {
    if ((data as any).customerPhone) {
      data = { ...data, customerPhone: normalizePakistaniPhone((data as any).customerPhone) } as Partial<Order>;
    }
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

  async getOrderAuditLog(merchantId: string, orderId: string): Promise<any[]> {
    return db.select().from(workflowAuditLog)
      .where(and(
        eq(workflowAuditLog.orderId, orderId),
        eq(workflowAuditLog.merchantId, merchantId)
      ))
      .orderBy(desc(workflowAuditLog.createdAt));
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

  async getOrderByTracking(merchantId: string, trackingNumber: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders)
      .where(and(eq(orders.courierTracking, trackingNumber), eq(orders.merchantId, merchantId)));
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

  async getOrdersInManagedWorkflow(merchantId: string, shopifyOrderIds: string[]): Promise<Set<string>> {
    if (shopifyOrderIds.length === 0) return new Set();
    
    const managedStatuses = ['PENDING', 'HOLD', 'READY_TO_SHIP', 'BOOKED', 'FULFILLED', 'DELIVERED', 'RETURN', 'CANCELLED'];
    const chunkSize = 500;
    const managedIds = new Set<string>();
    
    for (let i = 0; i < shopifyOrderIds.length; i += chunkSize) {
      const chunk = shopifyOrderIds.slice(i, i + chunkSize);
      const existing = await db.select({ shopifyOrderId: orders.shopifyOrderId })
        .from(orders)
        .where(and(
          eq(orders.merchantId, merchantId),
          inArray(orders.shopifyOrderId, chunk),
          inArray(orders.workflowStatus, managedStatuses)
        ));
      
      for (const order of existing) {
        if (order.shopifyOrderId) {
          managedIds.add(order.shopifyOrderId);
        }
      }
    }
    
    return managedIds;
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

  async getOrdersForCourierSync(merchantId: string, options?: { forceRefresh?: boolean; limit?: number; includeLowPriority?: boolean }): Promise<Order[]> {
    const syncLimit = options?.limit || 1500;
    const forceRefresh = options?.forceRefresh || false;
    const includeLowPriority = options?.includeLowPriority !== false;

    let conditions = [
      eq(orders.merchantId, merchantId),
      sql`${orders.courierTracking} IS NOT NULL AND ${orders.courierTracking} != ''`,
      sql`${orders.courierName} IS NOT NULL AND ${orders.courierName} != ''`,
      sql`${orders.workflowStatus} IN ('BOOKED', 'FULFILLED')`,
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

    if (!includeLowPriority) {
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      conditions.push(
        or(
          sql`${orders.bookedAt} >= ${fortyEightHoursAgo}`,
          isNull(orders.bookedAt),
          sql`${orders.lastTrackingUpdate} >= ${threeDaysAgo}`,
          isNull(orders.lastTrackingUpdate)
        )!
      );
    }

    return db.select().from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.orderDate))
      .limit(syncLimit);
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    if (order.customerPhone) {
      order = { ...order, customerPhone: normalizePakistaniPhone(order.customerPhone) };
    }
    if (order.shopifyOrderId && order.merchantId) {
      const [result] = await db.insert(orders)
        .values(order)
        .onConflictDoUpdate({
          target: [orders.merchantId, orders.shopifyOrderId],
          targetWhere: sql`shopify_order_id IS NOT NULL`,
          set: { ...order, updatedAt: new Date() },
        })
        .returning();
      return result;
    }
    const [created] = await db.insert(orders).values(order).returning();
    return created;
  }

  async createOrdersBulk(ordersList: InsertOrder[]): Promise<Order[]> {
    if (ordersList.length === 0) return [];
    const normalized = ordersList.map(order => {
      if (order.customerPhone) {
        return { ...order, customerPhone: normalizePakistaniPhone(order.customerPhone) };
      }
      return order;
    });
    const results = await db.insert(orders)
      .values(normalized)
      .onConflictDoUpdate({
        target: [orders.merchantId, orders.shopifyOrderId],
        targetWhere: sql`shopify_order_id IS NOT NULL`,
        set: {
          updatedAt: new Date(),
        },
      })
      .returning();
    return results;
  }

  async updateOrder(merchantId: string, id: string, data: Partial<InsertOrder>): Promise<Order | undefined> {
    if (data.customerPhone) {
      data = { ...data, customerPhone: normalizePakistaniPhone(data.customerPhone) };
    }
    const [updated] = await db.update(orders).set({ ...data, updatedAt: new Date() })
      .where(and(eq(orders.id, id), eq(orders.merchantId, merchantId)))
      .returning();
    return updated;
  }

  // Shipments - All scoped by merchantId
  async getShipments(merchantId: string, options?: { search?: string; status?: string; courier?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number; timezone?: string }): Promise<{ shipments: Shipment[]; total: number }> {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const offset = (page - 1) * pageSize;
    const tz = options?.timezone || DEFAULT_TIMEZONE;

    let conditions = [eq(shipments.merchantId, merchantId)];

    if (options?.status && options.status !== "all") {
      conditions.push(eq(shipments.status, options.status));
    }

    if (options?.courier && options.courier !== "all") {
      conditions.push(eq(shipments.courierName, options.courier));
    }

    if (options?.dateFrom) {
      conditions.push(sql`${shipments.createdAt} >= ${toMerchantStartOfDay(options.dateFrom, tz)}`);
    }
    if (options?.dateTo) {
      conditions.push(sql`${shipments.createdAt} <= ${toMerchantEndOfDay(options.dateTo, tz)}`);
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

  async getShipmentsByOrderIds(merchantId: string, orderIds: string[]): Promise<Shipment[]> {
    if (orderIds.length === 0) return [];
    return db.select().from(shipments)
      .where(and(eq(shipments.merchantId, merchantId), inArray(shipments.orderId, orderIds)));
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
  async getCodReconciliation(merchantId: string, options?: { search?: string; status?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number; timezone?: string }): Promise<{ records: CodReconciliation[]; total: number; summary: any }> {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    let conditions = [eq(codReconciliation.merchantId, merchantId)];

    if (options?.status && options.status !== "all") {
      conditions.push(eq(codReconciliation.status, options.status));
    }

    if (options?.dateFrom) {
      const tz = options?.timezone || DEFAULT_TIMEZONE;
      conditions.push(sql`${codReconciliation.createdAt} >= ${toMerchantStartOfDay(options.dateFrom, tz)}`);
    }
    if (options?.dateTo) {
      const tz = options?.timezone || DEFAULT_TIMEZONE;
      conditions.push(sql`${codReconciliation.createdAt} <= ${toMerchantEndOfDay(options.dateTo, tz)}`);
    }

    const whereClause = and(...conditions);

    const [result, totalResult] = await Promise.all([
      db.select().from(codReconciliation).where(whereClause).orderBy(desc(codReconciliation.createdAt)).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(codReconciliation).where(whereClause)
    ]);

    const allRecords = await db.select().from(codReconciliation).where(whereClause);
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

  async getPendingCodRecordsByCourier(merchantId: string, courierName: string): Promise<CodReconciliation[]> {
    return db.select().from(codReconciliation)
      .where(and(
        eq(codReconciliation.merchantId, merchantId),
        eq(codReconciliation.courierName, courierName),
        or(
          isNull(codReconciliation.courierPaymentRef),
          eq(codReconciliation.courierPaymentRef, ''),
        )
      ));
  }

  // Analytics
  async getDashboardStats(merchantId: string, options?: { dateFrom?: string; dateTo?: string; timezone?: string }): Promise<any> {
    let conditions = [eq(orders.merchantId, merchantId)];
    const tz = options?.timezone || DEFAULT_TIMEZONE;
    if (options?.dateFrom) {
      const fromDate = new Date(options.dateFrom);
      if (!isNaN(fromDate.getTime())) {
        conditions.push(sql`${orders.orderDate} >= ${toMerchantStartOfDay(options.dateFrom, tz)}`);
      }
    }
    if (options?.dateTo) {
      const toDate = new Date(options.dateTo);
      if (!isNaN(toDate.getTime())) {
        conditions.push(sql`${orders.orderDate} <= ${toMerchantEndOfDay(options.dateTo, tz)}`);
      }
    }
    const allOrders = await db.select().from(orders).where(and(...conditions));

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

  async getAnalytics(merchantId: string, dateRange: string, options?: { dateFrom?: string; dateTo?: string; timezone?: string }): Promise<any> {
    let conditions = [eq(orders.merchantId, merchantId)];
    const tz = options?.timezone || DEFAULT_TIMEZONE;
    
    if (options?.dateFrom) {
      conditions.push(sql`${orders.orderDate} >= ${toMerchantStartOfDay(options.dateFrom, tz)}`);
    }
    if (options?.dateTo) {
      conditions.push(sql`${orders.orderDate} <= ${toMerchantEndOfDay(options.dateTo, tz)}`);
    }
    
    const allOrders = await db.select().from(orders).where(and(...conditions));

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
    const { decryptToken } = await import('./services/encryption');
    const [store] = await db.select().from(shopifyStores)
      .where(and(
        eq(shopifyStores.shopDomain, shopDomain),
        eq(shopifyStores.isConnected, true)
      ));
    if (!store || !store.accessToken) return null;
    return { merchantId: store.merchantId, storeId: store.id, accessToken: decryptToken(store.accessToken) };
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

  // Booking Jobs
  async getBookingJob(merchantId: string, orderId: string, courierName: string): Promise<BookingJob | undefined> {
    const [job] = await db.select().from(bookingJobs)
      .where(and(
        eq(bookingJobs.merchantId, merchantId),
        eq(bookingJobs.orderId, orderId),
        sql`lower(${bookingJobs.courierName}) = lower(${courierName})`
      ))
      .orderBy(desc(bookingJobs.createdAt))
      .limit(1);
    return job;
  }

  async getBookingJobsByOrderIds(merchantId: string, orderIds: string[]): Promise<BookingJob[]> {
    if (orderIds.length === 0) return [];
    return db.select().from(bookingJobs)
      .where(and(
        eq(bookingJobs.merchantId, merchantId),
        inArray(bookingJobs.orderId, orderIds)
      ));
  }

  async createBookingJob(job: InsertBookingJob): Promise<BookingJob> {
    const [created] = await db.insert(bookingJobs).values(job).returning();
    return created;
  }

  async updateBookingJob(id: string, data: Partial<InsertBookingJob>): Promise<BookingJob | undefined> {
    const [updated] = await db.update(bookingJobs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(bookingJobs.id, id))
      .returning();
    return updated;
  }

  async getBookingLogs(merchantId: string, options?: { page?: number; pageSize?: number; courier?: string; status?: string; dateFrom?: string; dateTo?: string; timezone?: string }): Promise<{ logs: any[]; total: number }> {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [eq(bookingJobs.merchantId, merchantId)];
    if (options?.courier && options.courier !== 'all') {
      conditions.push(eq(bookingJobs.courierName, options.courier));
    }
    if (options?.status && options.status !== 'all') {
      conditions.push(eq(bookingJobs.status, options.status));
    }
    if (options?.dateFrom) {
      const tz = options?.timezone || DEFAULT_TIMEZONE;
      conditions.push(sql`${bookingJobs.createdAt} >= ${toMerchantStartOfDay(options.dateFrom, tz)}`);
    }
    if (options?.dateTo) {
      const tz = options?.timezone || DEFAULT_TIMEZONE;
      conditions.push(sql`${bookingJobs.createdAt} <= ${toMerchantEndOfDay(options.dateTo, tz)}`);
    }

    const whereClause = and(...conditions);

    const [totalResult] = await db.select({ count: count() }).from(bookingJobs).where(whereClause);

    const logs = await db.select({
      id: bookingJobs.id,
      orderId: bookingJobs.orderId,
      courierName: bookingJobs.courierName,
      status: bookingJobs.status,
      trackingNumber: bookingJobs.trackingNumber,
      slipUrl: bookingJobs.slipUrl,
      errorMessage: bookingJobs.errorMessage,
      createdAt: bookingJobs.createdAt,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      city: orders.city,
      totalAmount: orders.totalAmount,
    }).from(bookingJobs)
      .leftJoin(orders, eq(bookingJobs.orderId, orders.id))
      .where(whereClause)
      .orderBy(desc(bookingJobs.createdAt))
      .limit(pageSize)
      .offset(offset);

    return { logs, total: totalResult?.count || 0 };
  }

  async getOrdersByIds(merchantId: string, orderIds: string[]): Promise<Order[]> {
    if (orderIds.length === 0) return [];
    return db.select().from(orders)
      .where(and(
        eq(orders.merchantId, merchantId),
        inArray(orders.id, orderIds)
      ));
  }

  // Shipment Batches
  async createShipmentBatch(batch: InsertShipmentBatch): Promise<ShipmentBatch> {
    const [created] = await db.insert(shipmentBatches).values(batch).returning();
    return created;
  }

  async updateShipmentBatch(id: string, data: Partial<InsertShipmentBatch>): Promise<ShipmentBatch | undefined> {
    const [updated] = await db.update(shipmentBatches).set(data).where(eq(shipmentBatches.id, id)).returning();
    return updated;
  }

  async getShipmentBatches(merchantId: string, options?: { page?: number; pageSize?: number; courier?: string; dateFrom?: string; dateTo?: string; batchType?: string }): Promise<{ batches: ShipmentBatch[]; total: number }> {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [eq(shipmentBatches.merchantId, merchantId)];
    if (options?.batchType) {
      if (options.batchType === "BOOKING") {
        conditions.push(sql`${shipmentBatches.batchType} IN ('BULK', 'SINGLE')`);
      } else {
        conditions.push(eq(shipmentBatches.batchType, options.batchType));
      }
    }
    if (options?.courier && options.courier !== 'all') {
      conditions.push(eq(shipmentBatches.courierName, options.courier));
    }
    if (options?.dateFrom) {
      const tz = DEFAULT_TIMEZONE;
      conditions.push(sql`${shipmentBatches.createdAt} >= ${toMerchantStartOfDay(options.dateFrom, tz)}`);
    }
    if (options?.dateTo) {
      const tz = DEFAULT_TIMEZONE;
      conditions.push(sql`${shipmentBatches.createdAt} <= ${toMerchantEndOfDay(options.dateTo, tz)}`);
    }

    const whereClause = and(...conditions);

    const [totalResult] = await db.select({ count: count() }).from(shipmentBatches).where(whereClause);
    const batches = await db.select().from(shipmentBatches).where(whereClause).orderBy(desc(shipmentBatches.createdAt)).limit(pageSize).offset(offset);

    return { batches, total: totalResult?.count || 0 };
  }

  async getShipmentBatchById(merchantId: string, id: string): Promise<ShipmentBatch | undefined> {
    const [batch] = await db.select().from(shipmentBatches).where(and(eq(shipmentBatches.id, id), eq(shipmentBatches.merchantId, merchantId)));
    return batch;
  }

  // Shipment Batch Items
  async createShipmentBatchItem(item: InsertShipmentBatchItem): Promise<ShipmentBatchItem> {
    const [created] = await db.insert(shipmentBatchItems).values(item).returning();
    return created;
  }

  async getShipmentBatchItems(batchId: string): Promise<ShipmentBatchItem[]> {
    return db.select().from(shipmentBatchItems).where(eq(shipmentBatchItems.batchId, batchId)).orderBy(shipmentBatchItems.createdAt);
  }

  // Print Records
  async createShipmentPrintRecord(record: InsertShipmentPrintRecord): Promise<ShipmentPrintRecord> {
    const [created] = await db.insert(shipmentPrintRecords).values(record).returning();
    return created;
  }

  async getShipmentPrintRecord(merchantId: string, shipmentId: string): Promise<ShipmentPrintRecord | undefined> {
    const [record] = await db.select().from(shipmentPrintRecords).where(and(eq(shipmentPrintRecords.merchantId, merchantId), eq(shipmentPrintRecords.shipmentId, shipmentId), eq(shipmentPrintRecords.isLatest, true)));
    return record;
  }

  async getShipmentPrintRecordById(merchantId: string, id: string): Promise<ShipmentPrintRecord | undefined> {
    const [record] = await db.select().from(shipmentPrintRecords).where(and(eq(shipmentPrintRecords.id, id), eq(shipmentPrintRecords.merchantId, merchantId)));
    return record;
  }

  async updateShipmentPrintRecord(id: string, data: Partial<InsertShipmentPrintRecord>): Promise<ShipmentPrintRecord | undefined> {
    const [updated] = await db.update(shipmentPrintRecords).set(data).where(eq(shipmentPrintRecords.id, id)).returning();
    return updated;
  }

  // Order Change Log
  async createOrderChangeLog(entry: InsertOrderChangeLog): Promise<OrderChangeLog> {
    const [created] = await db.insert(orderChangeLog).values(entry).returning();
    return created;
  }

  async getOrderChangeLog(merchantId: string, orderId: string): Promise<OrderChangeLog[]> {
    return db.select().from(orderChangeLog).where(
      and(eq(orderChangeLog.merchantId, merchantId), eq(orderChangeLog.orderId, orderId))
    ).orderBy(desc(orderChangeLog.createdAt));
  }

  async getWaMetaTemplates(merchantId: string): Promise<WaMetaTemplate[]> {
    return db.select().from(waMetaTemplates)
      .where(eq(waMetaTemplates.merchantId, merchantId))
      .orderBy(desc(waMetaTemplates.createdAt));
  }

  async getWaMetaTemplateById(merchantId: string, id: string): Promise<WaMetaTemplate | undefined> {
    const [result] = await db.select().from(waMetaTemplates)
      .where(and(eq(waMetaTemplates.merchantId, merchantId), eq(waMetaTemplates.id, id)))
      .limit(1);
    return result;
  }

  async createWaMetaTemplate(data: InsertWaMetaTemplate): Promise<WaMetaTemplate> {
    const [result] = await db.insert(waMetaTemplates).values({ ...data, updatedAt: new Date() }).returning();
    return result;
  }

  async upsertWaMetaTemplate(merchantId: string, data: Omit<InsertWaMetaTemplate, "merchantId">): Promise<WaMetaTemplate> {
    const now = new Date();
    const [result] = await db.insert(waMetaTemplates)
      .values({ ...data, merchantId, updatedAt: now })
      .onConflictDoUpdate({
        target: [waMetaTemplates.merchantId, waMetaTemplates.name, waMetaTemplates.language],
        set: {
          category: data.category,
          headerType: data.headerType,
          headerText: data.headerText,
          body: data.body,
          footer: data.footer,
          buttons: data.buttons,
          status: data.status,
          updatedAt: now,
        },
      })
      .returning();
    return result;
  }

  async deleteWaMetaTemplate(merchantId: string, id: string): Promise<void> {
    await db.delete(waMetaTemplates).where(and(eq(waMetaTemplates.merchantId, merchantId), eq(waMetaTemplates.id, id)));
  }

  async getWaAutomations(merchantId: string): Promise<WaAutomation[]> {
    return db.select().from(waAutomations)
      .where(eq(waAutomations.merchantId, merchantId))
      .orderBy(desc(waAutomations.createdAt));
  }

  async getWaAutomationsByTrigger(merchantId: string, triggerStatus: string): Promise<WaAutomation[]> {
    return db.select().from(waAutomations)
      .where(and(eq(waAutomations.merchantId, merchantId), eq(waAutomations.triggerStatus, triggerStatus), eq(waAutomations.isActive, true)));
  }

  async createWaAutomation(data: InsertWaAutomation): Promise<WaAutomation> {
    const [result] = await db.insert(waAutomations).values({ ...data, updatedAt: new Date() }).returning();
    return result;
  }

  async updateWaAutomation(merchantId: string, id: string, data: Partial<InsertWaAutomation>): Promise<WaAutomation | undefined> {
    const [result] = await db.update(waAutomations)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(waAutomations.merchantId, merchantId), eq(waAutomations.id, id)))
      .returning();
    return result;
  }

  async deleteWaAutomation(merchantId: string, id: string): Promise<void> {
    await db.delete(waAutomations).where(and(eq(waAutomations.merchantId, merchantId), eq(waAutomations.id, id)));
  }

  // Order Payments
  async getOrderPayments(merchantId: string, orderId: string): Promise<OrderPayment[]> {
    return db.select().from(orderPayments).where(
      and(eq(orderPayments.merchantId, merchantId), eq(orderPayments.orderId, orderId))
    ).orderBy(desc(orderPayments.createdAt));
  }

  async createOrderPayment(payment: InsertOrderPayment): Promise<OrderPayment> {
    const [created] = await db.insert(orderPayments).values(payment).returning();
    return created;
  }

  async deleteOrderPayment(merchantId: string, id: string): Promise<void> {
    await db.delete(orderPayments).where(
      and(eq(orderPayments.id, id), eq(orderPayments.merchantId, merchantId))
    );
  }

  async getOrderPaymentSum(merchantId: string, orderId: string): Promise<number> {
    const result = await db.select({
      total: sql<string>`COALESCE(SUM(${orderPayments.amount}::numeric), 0)`
    }).from(orderPayments).where(
      and(eq(orderPayments.merchantId, merchantId), eq(orderPayments.orderId, orderId))
    );
    return parseFloat(result[0]?.total || "0");
  }

  // Webhook Events
  async createWebhookEvent(event: InsertShopifyWebhookEvent): Promise<ShopifyWebhookEvent> {
    const [created] = await db.insert(shopifyWebhookEvents).values(event).returning();
    return created;
  }

  async getWebhookEventByWebhookId(merchantId: string, webhookId: string): Promise<ShopifyWebhookEvent | undefined> {
    const [event] = await db.select().from(shopifyWebhookEvents)
      .where(and(
        eq(shopifyWebhookEvents.merchantId, merchantId),
        eq(shopifyWebhookEvents.shopifyWebhookId, webhookId)
      ));
    return event;
  }

  async isDuplicateWebhook(merchantId: string, topic: string, payloadHash: string): Promise<boolean> {
    const [existing] = await db.select({ id: shopifyWebhookEvents.id }).from(shopifyWebhookEvents)
      .where(and(
        eq(shopifyWebhookEvents.merchantId, merchantId),
        eq(shopifyWebhookEvents.topic, topic),
        eq(shopifyWebhookEvents.payloadHash, payloadHash)
      ))
      .limit(1);
    return !!existing;
  }

  async updateWebhookEventStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    const updateData: any = {
      processingStatus: status,
      processedAt: status === 'processed' || status === 'failed' ? new Date() : undefined,
    };
    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }
    await db.update(shopifyWebhookEvents)
      .set(updateData)
      .where(eq(shopifyWebhookEvents.id, id));
  }

  async createCancellationJob(job: InsertCancellationJob): Promise<CancellationJob> {
    const [created] = await db.insert(cancellationJobs).values(job).returning();
    return created;
  }

  async getCancellationJob(merchantId: string, jobId: string): Promise<CancellationJob | undefined> {
    const [job] = await db.select().from(cancellationJobs)
      .where(and(eq(cancellationJobs.id, jobId), eq(cancellationJobs.merchantId, merchantId)));
    return job;
  }

  async updateCancellationJob(id: string, data: Partial<CancellationJob>): Promise<CancellationJob | undefined> {
    const [updated] = await db.update(cancellationJobs).set(data).where(eq(cancellationJobs.id, id)).returning();
    return updated;
  }

  async getCancellationJobs(merchantId: string, options?: { page?: number; pageSize?: number }): Promise<{ jobs: CancellationJob[]; total: number }> {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const [totalResult] = await db.select({ count: count() }).from(cancellationJobs)
      .where(eq(cancellationJobs.merchantId, merchantId));

    const jobs = await db.select().from(cancellationJobs)
      .where(eq(cancellationJobs.merchantId, merchantId))
      .orderBy(desc(cancellationJobs.createdAt))
      .limit(pageSize).offset(offset);

    return { jobs, total: totalResult?.count || 0 };
  }

  async createCancellationJobItem(item: InsertCancellationJobItem): Promise<CancellationJobItem> {
    const [created] = await db.insert(cancellationJobItems).values(item).returning();
    return created;
  }

  async getCancellationJobItems(jobId: string): Promise<CancellationJobItem[]> {
    return db.select().from(cancellationJobItems)
      .where(eq(cancellationJobItems.jobId, jobId))
      .orderBy(cancellationJobItems.createdAt);
  }

  async updateCancellationJobItem(id: string, data: Partial<CancellationJobItem>): Promise<CancellationJobItem | undefined> {
    const [updated] = await db.update(cancellationJobItems).set(data).where(eq(cancellationJobItems.id, id)).returning();
    return updated;
  }

  async getCourierStatusMappings(merchantId: string, courierName?: string): Promise<CourierStatusMapping[]> {
    const conditions = [eq(courierStatusMappings.merchantId, merchantId)];
    if (courierName) {
      conditions.push(eq(courierStatusMappings.courierName, courierName));
    }
    return db.select().from(courierStatusMappings)
      .where(and(...conditions))
      .orderBy(courierStatusMappings.courierName, courierStatusMappings.courierStatus);
  }

  async upsertCourierStatusMapping(mapping: InsertCourierStatusMapping): Promise<CourierStatusMapping> {
    const [result] = await db.insert(courierStatusMappings)
      .values({ ...mapping, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [courierStatusMappings.merchantId, courierStatusMappings.courierName, courierStatusMappings.courierStatus],
        set: {
          normalizedStatus: mapping.normalizedStatus,
          workflowStage: mapping.workflowStage ?? null,
          isCustom: mapping.isCustom ?? true,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async deleteCourierStatusMapping(merchantId: string, id: string): Promise<void> {
    await db.delete(courierStatusMappings)
      .where(and(eq(courierStatusMappings.id, id), eq(courierStatusMappings.merchantId, merchantId)));
  }

  async resetCourierStatusMappings(merchantId: string, courierName?: string): Promise<void> {
    const conditions = [eq(courierStatusMappings.merchantId, merchantId)];
    if (courierName) {
      conditions.push(eq(courierStatusMappings.courierName, courierName));
    }
    await db.delete(courierStatusMappings).where(and(...conditions));
  }

  async seedDefaultMappings(merchantId: string): Promise<{ created: number; existing: number }> {
    const { LEOPARDS_STATUS_MAP, POSTEX_STATUS_MAP, DEFAULT_WORKFLOW_STAGE_MAP } = await import('./services/statusNormalization');

    const allDefaults: { courierName: string; courierStatus: string; normalizedStatus: string; workflowStage: string }[] = [];

    for (const [status, normalized] of Object.entries(LEOPARDS_STATUS_MAP)) {
      allDefaults.push({ courierName: 'leopards', courierStatus: status, normalizedStatus: normalized, workflowStage: DEFAULT_WORKFLOW_STAGE_MAP[normalized] || 'FULFILLED' });
    }
    for (const [status, normalized] of Object.entries(POSTEX_STATUS_MAP)) {
      allDefaults.push({ courierName: 'postex', courierStatus: status, normalizedStatus: normalized, workflowStage: DEFAULT_WORKFLOW_STAGE_MAP[normalized] || 'FULFILLED' });
    }

    let created = 0;
    let existing = 0;

    for (const def of allDefaults) {
      try {
        await db.insert(courierStatusMappings)
          .values({
            merchantId,
            courierName: def.courierName,
            courierStatus: def.courierStatus,
            normalizedStatus: def.normalizedStatus,
            workflowStage: def.workflowStage,
            isCustom: false,
          })
          .onConflictDoNothing();
        created++;
      } catch {
        existing++;
      }
    }

    const actualCount = await db.select({ count: count() }).from(courierStatusMappings)
      .where(eq(courierStatusMappings.merchantId, merchantId));

    return { created: actualCount[0]?.count || 0, existing };
  }

  async recordUnmappedStatus(merchantId: string, courierName: string, rawStatus: string, trackingNumber?: string): Promise<void> {
    await db.insert(unmappedCourierStatuses)
      .values({
        merchantId,
        courierName,
        rawStatus: rawStatus.toLowerCase().trim(),
        sampleTrackingNumber: trackingNumber || null,
        occurrenceCount: 1,
        resolved: false,
      })
      .onConflictDoUpdate({
        target: [unmappedCourierStatuses.merchantId, unmappedCourierStatuses.courierName, unmappedCourierStatuses.rawStatus],
        set: {
          occurrenceCount: sql`${unmappedCourierStatuses.occurrenceCount} + 1`,
          sampleTrackingNumber: trackingNumber || sql`${unmappedCourierStatuses.sampleTrackingNumber}`,
          updatedAt: new Date(),
        },
      });
  }

  async getUnmappedStatuses(merchantId: string, resolved?: boolean): Promise<UnmappedCourierStatus[]> {
    const conditions = [eq(unmappedCourierStatuses.merchantId, merchantId)];
    if (resolved !== undefined) {
      conditions.push(eq(unmappedCourierStatuses.resolved, resolved));
    }
    return db.select().from(unmappedCourierStatuses)
      .where(and(...conditions))
      .orderBy(desc(unmappedCourierStatuses.updatedAt));
  }

  async getUnmappedStatusCount(merchantId: string): Promise<number> {
    const result = await db.select({ count: count() }).from(unmappedCourierStatuses)
      .where(and(eq(unmappedCourierStatuses.merchantId, merchantId), eq(unmappedCourierStatuses.resolved, false)));
    return result[0]?.count || 0;
  }

  async resolveUnmappedStatus(merchantId: string, id: string): Promise<void> {
    await db.update(unmappedCourierStatuses)
      .set({ resolved: true, updatedAt: new Date() })
      .where(and(eq(unmappedCourierStatuses.id, id), eq(unmappedCourierStatuses.merchantId, merchantId)));
  }

  async dismissUnmappedStatus(merchantId: string, id: string): Promise<void> {
    await db.delete(unmappedCourierStatuses)
      .where(and(eq(unmappedCourierStatuses.id, id), eq(unmappedCourierStatuses.merchantId, merchantId)));
  }

  async getCourierKeywordMappings(merchantId: string): Promise<CourierKeywordMapping[]> {
    return db.select().from(courierKeywordMappings)
      .where(eq(courierKeywordMappings.merchantId, merchantId))
      .orderBy(desc(courierKeywordMappings.priority), courierKeywordMappings.createdAt);
  }

  async createCourierKeywordMapping(mapping: InsertCourierKeywordMapping): Promise<CourierKeywordMapping> {
    const [created] = await db.insert(courierKeywordMappings).values(mapping).returning();
    return created;
  }

  async updateCourierKeywordMapping(merchantId: string, id: string, data: Partial<InsertCourierKeywordMapping>): Promise<CourierKeywordMapping | undefined> {
    const [updated] = await db.update(courierKeywordMappings)
      .set(data)
      .where(and(eq(courierKeywordMappings.id, id), eq(courierKeywordMappings.merchantId, merchantId)))
      .returning();
    return updated;
  }

  async deleteCourierKeywordMapping(merchantId: string, id: string): Promise<void> {
    await db.delete(courierKeywordMappings)
      .where(and(eq(courierKeywordMappings.id, id), eq(courierKeywordMappings.merchantId, merchantId)));
  }

  async getProducts(merchantId: string, options?: { search?: string; status?: string; page?: number; pageSize?: number }): Promise<{ products: Product[]; total: number }> {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 50;
    const offset = (page - 1) * pageSize;
    const conditions: any[] = [eq(products.merchantId, merchantId)];

    if (options?.search) {
      conditions.push(
        or(
          ilike(products.title, `%${options.search}%`),
          ilike(products.vendor, `%${options.search}%`),
          ilike(products.productType, `%${options.search}%`),
          ilike(products.tags, `%${options.search}%`)
        )
      );
    }

    if (options?.status) {
      conditions.push(eq(products.status, options.status));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [totalResult, productRows] = await Promise.all([
      db.select({ count: count() }).from(products).where(whereClause),
      db.select().from(products).where(whereClause).orderBy(desc(products.updatedAt)).limit(pageSize).offset(offset),
    ]);

    return { products: productRows, total: totalResult[0]?.count || 0 };
  }

  async getProductById(merchantId: string, id: string): Promise<Product | undefined> {
    const result = await db.select().from(products).where(and(eq(products.id, id), eq(products.merchantId, merchantId)));
    return result[0];
  }

  async getProductsByShopifyIds(merchantId: string, shopifyProductIds: string[]): Promise<Product[]> {
    if (shopifyProductIds.length === 0) return [];
    return await db.select().from(products).where(
      and(eq(products.merchantId, merchantId), inArray(products.shopifyProductId, shopifyProductIds))
    );
  }

  async upsertProduct(merchantId: string, shopifyProductId: string, data: Partial<InsertProduct>): Promise<Product> {
    const existing = await db.select().from(products).where(and(eq(products.merchantId, merchantId), eq(products.shopifyProductId, shopifyProductId)));
    if (existing.length > 0) {
      const updated = await db.update(products).set({ ...data, updatedAt: new Date(), shopifySyncedAt: new Date() }).where(and(eq(products.merchantId, merchantId), eq(products.shopifyProductId, shopifyProductId))).returning();
      return updated[0];
    } else {
      const inserted = await db.insert(products).values({ ...data, merchantId, shopifyProductId, shopifySyncedAt: new Date() } as any).returning();
      return inserted[0];
    }
  }

  async deleteProductsByMerchant(merchantId: string): Promise<void> {
    await db.delete(products).where(eq(products.merchantId, merchantId));
  }

  async getRecentlyTerminalOrders(merchantId: string, daysSinceTerminal: number, minHoursSinceLastCheck: number): Promise<Order[]> {
    const terminalStatuses = ['DELIVERED', 'RETURN', 'CANCELLED'];
    const cutoffDate = new Date(Date.now() - daysSinceTerminal * 24 * 60 * 60 * 1000);
    const lastCheckCutoff = new Date(Date.now() - minHoursSinceLastCheck * 60 * 60 * 1000);

    const conditions = [
      eq(orders.merchantId, merchantId),
      inArray(orders.workflowStatus, terminalStatuses),
      sql`${orders.courierTracking} IS NOT NULL AND ${orders.courierTracking} != ''`,
      sql`${orders.courierName} IS NOT NULL AND ${orders.courierName} != ''`,
      gte(orders.updatedAt, cutoffDate),
      or(
        isNull(orders.lastTrackingUpdate),
        sql`${orders.lastTrackingUpdate} < ${lastCheckCutoff}`
      )!,
    ];

    return db.select().from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.updatedAt))
      .limit(100);
  }

  async getJourneyEvents(merchantId: string, campaignKey?: string): Promise<CampaignJourneyEvent[]> {
    const conditions = [eq(campaignJourneyEvents.merchantId, merchantId)];
    if (campaignKey) {
      conditions.push(eq(campaignJourneyEvents.campaignKey, campaignKey));
    }
    return db.select().from(campaignJourneyEvents)
      .where(and(...conditions))
      .orderBy(desc(campaignJourneyEvents.createdAt));
  }

  async createJourneyEvent(event: InsertCampaignJourneyEvent): Promise<CampaignJourneyEvent> {
    const [created] = await db.insert(campaignJourneyEvents).values(event).returning();
    return created;
  }

  async updateJourneyEventSnapshot(id: string, snapshotAfter: any, evaluatedAt: Date): Promise<CampaignJourneyEvent | undefined> {
    const [updated] = await db.update(campaignJourneyEvents)
      .set({ snapshotAfter, evaluatedAt })
      .where(eq(campaignJourneyEvents.id, id))
      .returning();
    return updated;
  }

  async getPlatformSettings(): Promise<PlatformSettings> {
    const [settings] = await db.select().from(platformSettings).limit(1);
    if (!settings) {
      const [created] = await db.insert(platformSettings).values({ id: "default", globalOtpRequired: true }).returning();
      return created;
    }
    return settings;
  }

  async updatePlatformSettings(data: { globalOtpRequired: boolean }): Promise<PlatformSettings> {
    const existing = await this.getPlatformSettings();
    const [updated] = await db.update(platformSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(platformSettings.id, existing.id))
      .returning();
    return updated;
  }

  async isOtpRequiredForUser(userId: string): Promise<boolean> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return true;

    if (user.merchantId) {
      const [merchant] = await db.select().from(merchants).where(eq(merchants.id, user.merchantId));
      if (merchant && merchant.otpRequired === false) return false;
    }

    const settings = await this.getPlatformSettings();
    return settings.globalOtpRequired;
  }

  async saveWhatsappResponse(data: InsertWhatsappResponse): Promise<WhatsappResponse> {
    const [row] = await db.insert(whatsappResponses).values(data).returning();
    return row;
  }

  async getWhatsappResponsesByOrder(merchantId: string, orderId: string): Promise<WhatsappResponse[]> {
    return db.select().from(whatsappResponses)
      .where(and(eq(whatsappResponses.merchantId, merchantId), eq(whatsappResponses.orderId, orderId)))
      .orderBy(desc(whatsappResponses.receivedAt));
  }

  async getWhatsappResponsesByPhone(merchantId: string, phone: string): Promise<WhatsappResponse[]> {
    return db.select().from(whatsappResponses)
      .where(and(eq(whatsappResponses.merchantId, merchantId), eq(whatsappResponses.fromPhone, phone)))
      .orderBy(desc(whatsappResponses.receivedAt));
  }

  async getConversations(merchantId: string): Promise<WaConversation[]> {
    return db.select().from(waConversations)
      .where(eq(waConversations.merchantId, merchantId))
      .orderBy(desc(waConversations.lastMessageAt));
  }

  async getConversationById(id: string): Promise<WaConversation | undefined> {
    const [row] = await db.select().from(waConversations).where(eq(waConversations.id, id));
    return row;
  }

  async getConversationByPhone(merchantId: string, phone: string): Promise<WaConversation | undefined> {
    const [row] = await db.select().from(waConversations)
      .where(and(eq(waConversations.merchantId, merchantId), eq(waConversations.contactPhone, phone)));
    return row;
  }

  async upsertConversation(data: { merchantId: string; contactPhone: string; contactName?: string; orderId?: string | null; orderNumber?: string | null; lastMessage?: string | null }): Promise<WaConversation> {
    const existing = await this.getConversationByPhone(data.merchantId, data.contactPhone);
    if (existing) {
      const [row] = await db.update(waConversations)
        .set({
          contactName: data.contactName ?? existing.contactName,
          orderId: data.orderId !== undefined ? data.orderId : existing.orderId,
          orderNumber: data.orderNumber !== undefined ? data.orderNumber : existing.orderNumber,
          lastMessage: data.lastMessage ?? existing.lastMessage,
          lastMessageAt: new Date(),
          unreadCount: sql`${waConversations.unreadCount} + 1`,
        })
        .where(eq(waConversations.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(waConversations).values({
      merchantId: data.merchantId,
      contactPhone: data.contactPhone,
      contactName: data.contactName,
      orderId: data.orderId,
      orderNumber: data.orderNumber,
      lastMessage: data.lastMessage,
      lastMessageAt: new Date(),
      unreadCount: 1,
    }).returning();
    return row;
  }

  async deleteConversation(id: string): Promise<void> {
    await db.delete(waMessages).where(eq(waMessages.conversationId, id));
    await db.delete(waConversations).where(eq(waConversations.id, id));
  }

  async getWaMessages(conversationId: string): Promise<WaMessage[]> {
    return db.select().from(waMessages)
      .where(eq(waMessages.conversationId, conversationId))
      .orderBy(asc(waMessages.createdAt));
  }

  async createWaMessage(data: { conversationId: string; direction: string; senderName?: string | null; text?: string | null; waMessageId?: string | null; status?: string | null; messageType?: string | null; mediaUrl?: string | null; reactionEmoji?: string | null; referenceMessageId?: string | null }): Promise<WaMessage> {
    const [row] = await db.insert(waMessages).values({
      conversationId: data.conversationId,
      direction: data.direction,
      senderName: data.senderName,
      text: data.text,
      waMessageId: data.waMessageId,
      status: data.status ?? "sent",
      messageType: data.messageType ?? "text",
      mediaUrl: data.mediaUrl,
      reactionEmoji: data.reactionEmoji,
      referenceMessageId: data.referenceMessageId,
    }).returning();
    return row;
  }

  async updateConversationLabel(merchantId: string, convId: string, label: string | null): Promise<void> {
    await db.update(waConversations)
      .set({ label })
      .where(and(eq(waConversations.id, convId), eq(waConversations.merchantId, merchantId)));
  }

  async updateConversationAssignment(merchantId: string, convId: string, userId: string | null, userName: string | null): Promise<void> {
    await db.update(waConversations)
      .set({ assignedToUserId: userId, assignedToName: userName })
      .where(and(eq(waConversations.id, convId), eq(waConversations.merchantId, merchantId)));
  }

  async markConversationRead(merchantId: string, convId: string): Promise<void> {
    await db.update(waConversations)
      .set({ unreadCount: 0 })
      .where(and(eq(waConversations.id, convId), eq(waConversations.merchantId, merchantId)));
  }

  async seedDemoData(): Promise<void> {
    return;
  }
}

export const storage = new DatabaseStorage();
