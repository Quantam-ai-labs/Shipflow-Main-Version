import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

// ============================================
// MERCHANTS (Multi-tenant root entity)
// ============================================
export const merchants = pgTable("merchants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique().notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }).default("Pakistan"),
  logoUrl: varchar("logo_url", { length: 500 }),
  subscriptionPlan: varchar("subscription_plan", { length: 50 }).default("free"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMerchantSchema = createInsertSchema(merchants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type Merchant = typeof merchants.$inferSelect;

// ============================================
// TEAM MEMBERS (Users belonging to merchants)
// ============================================
export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // References auth users
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().default("agent"), // admin, manager, agent
  isActive: boolean("is_active").default(true),
  invitedAt: timestamp("invited_at").defaultNow(),
  joinedAt: timestamp("joined_at"),
}, (table) => [
  index("idx_team_members_merchant").on(table.merchantId),
  index("idx_team_members_user").on(table.userId),
]);

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  invitedAt: true,
});
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;

// ============================================
// SHOPIFY STORES (OAuth connections)
// ============================================
export const shopifyStores = pgTable("shopify_stores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  shopDomain: varchar("shop_domain", { length: 255 }).notNull(),
  accessToken: text("access_token"), // Encrypted
  scopes: text("scopes"),
  isConnected: boolean("is_connected").default(false),
  lastSyncAt: timestamp("last_sync_at"),
  webhookSubscriptions: jsonb("webhook_subscriptions"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_shopify_stores_merchant").on(table.merchantId),
]);

export const insertShopifyStoreSchema = createInsertSchema(shopifyStores).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShopifyStore = z.infer<typeof insertShopifyStoreSchema>;
export type ShopifyStore = typeof shopifyStores.$inferSelect;

// ============================================
// COURIER ACCOUNTS (API credentials per merchant)
// ============================================
export const courierAccounts = pgTable("courier_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  courierName: varchar("courier_name", { length: 50 }).notNull(), // leopards, postex
  apiKey: text("api_key"), // Encrypted
  apiSecret: text("api_secret"), // Encrypted
  accountNumber: varchar("account_number", { length: 100 }),
  isActive: boolean("is_active").default(true),
  settings: jsonb("settings"), // Courier-specific settings
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_courier_accounts_merchant").on(table.merchantId),
]);

export const insertCourierAccountSchema = createInsertSchema(courierAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCourierAccount = z.infer<typeof insertCourierAccountSchema>;
export type CourierAccount = typeof courierAccounts.$inferSelect;

// ============================================
// ORDERS (Synced from Shopify)
// ============================================
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  shopifyOrderId: varchar("shopify_order_id", { length: 100 }),
  orderNumber: varchar("order_number", { length: 100 }).notNull(),
  customerName: varchar("customer_name", { length: 500 }).notNull(),
  customerEmail: varchar("customer_email", { length: 255 }),
  customerPhone: varchar("customer_phone", { length: 100 }),
  shippingAddress: text("shipping_address"),
  city: varchar("city", { length: 255 }),
  province: varchar("province", { length: 100 }),
  postalCode: varchar("postal_code", { length: 50 }),
  country: varchar("country", { length: 100 }).default("Pakistan"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  subtotalAmount: decimal("subtotal_amount", { precision: 12, scale: 2 }),
  shippingAmount: decimal("shipping_amount", { precision: 12, scale: 2 }),
  discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 50 }).default("PKR"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  paymentStatus: varchar("payment_status", { length: 50 }).default("pending"),
  fulfillmentStatus: varchar("fulfillment_status", { length: 50 }).default("unfulfilled"),
  orderStatus: varchar("order_status", { length: 50 }).default("pending"),
  lineItems: jsonb("line_items"),
  totalQuantity: integer("total_quantity").default(1),
  tags: text("tags").array(),
  notes: text("notes"),
  courierName: varchar("courier_name", { length: 255 }),
  courierTracking: varchar("courier_tracking", { length: 255 }),
  shipmentStatus: varchar("shipment_status", { length: 50 }).default("pending"),
  courierRawStatus: text("courier_raw_status"),
  remark: text("remark"),
  landingSite: text("landing_site"),
  referringSite: text("referring_site"),
  browserIp: varchar("browser_ip", { length: 100 }),
  rawShopifyData: jsonb("raw_shopify_data"),
  lastApiSyncAt: timestamp("last_api_sync_at"),
  shopifyUpdatedAt: timestamp("shopify_updated_at"),
  lastTrackingUpdate: timestamp("last_tracking_update"),
  orderDate: timestamp("order_date").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  workflowStatus: varchar("workflow_status", { length: 50 }).notNull().default("NEW"),
  pendingReason: text("pending_reason"),
  pendingReasonType: varchar("pending_reason_type", { length: 50 }),
  holdUntil: timestamp("hold_until"),
  holdCreatedAt: timestamp("hold_created_at"),
  holdCreatedByUserId: varchar("hold_created_by_user_id"),
  confirmedAt: timestamp("confirmed_at"),
  confirmedByUserId: varchar("confirmed_by_user_id"),
  cancelledAt: timestamp("cancelled_at"),
  cancelledByUserId: varchar("cancelled_by_user_id"),
  cancelReason: text("cancel_reason"),
  previousWorkflowStatus: varchar("previous_workflow_status", { length: 50 }),
  lastStatusChangedAt: timestamp("last_status_changed_at"),
  lastStatusChangedByUserId: varchar("last_status_changed_by_user_id"),
  itemSummary: text("item_summary"),
  courierSlipUrl: text("courier_slip_url"),
  bookingStatus: varchar("booking_status", { length: 50 }),
  bookingError: text("booking_error"),
  bookedAt: timestamp("booked_at"),
}, (table) => [
  index("idx_orders_merchant").on(table.merchantId),
  index("idx_orders_shopify_id").on(table.shopifyOrderId),
  index("idx_orders_status").on(table.orderStatus),
  index("idx_orders_shipment_status").on(table.shipmentStatus),
  index("idx_orders_city").on(table.city),
  index("idx_orders_date").on(table.orderDate),
  index("idx_orders_courier").on(table.courierName),
  index("idx_orders_workflow_status").on(table.workflowStatus),
]);

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;


// ============================================
// WORKFLOW AUDIT LOG
// ============================================
export const workflowAuditLog = pgTable("workflow_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  fromStatus: varchar("from_status", { length: 50 }).notNull(),
  toStatus: varchar("to_status", { length: 50 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  reason: text("reason"),
  actorUserId: varchar("actor_user_id"),
  actorType: varchar("actor_type", { length: 20 }).notNull().default("user"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_audit_order").on(table.orderId),
  index("idx_audit_merchant").on(table.merchantId),
]);

export const insertWorkflowAuditLogSchema = createInsertSchema(workflowAuditLog).omit({
  id: true,
  createdAt: true,
});
export type InsertWorkflowAuditLog = z.infer<typeof insertWorkflowAuditLogSchema>;
export type WorkflowAuditLog = typeof workflowAuditLog.$inferSelect;


// ============================================
// SHIPMENTS (Courier tracking)
// ============================================
export const shipments = pgTable("shipments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  courierName: varchar("courier_name", { length: 50 }).notNull(), // leopards, postex
  trackingNumber: varchar("tracking_number", { length: 100 }),
  awbNumber: varchar("awb_number", { length: 100 }),
  status: varchar("status", { length: 50 }).default("booked"), // booked, picked, in_transit, out_for_delivery, delivered, returned, failed
  statusDescription: text("status_description"),
  weight: decimal("weight", { precision: 8, scale: 2 }),
  dimensions: jsonb("dimensions"), // { length, width, height }
  codAmount: decimal("cod_amount", { precision: 12, scale: 2 }),
  shippingCost: decimal("shipping_cost", { precision: 10, scale: 2 }),
  estimatedDelivery: timestamp("estimated_delivery"),
  actualDelivery: timestamp("actual_delivery"),
  deliveryAttempts: integer("delivery_attempts").default(0),
  lastStatusUpdate: timestamp("last_status_update"),
  courierResponse: jsonb("courier_response"), // Raw API response
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_shipments_order").on(table.orderId),
  index("idx_shipments_merchant").on(table.merchantId),
  index("idx_shipments_tracking").on(table.trackingNumber),
  index("idx_shipments_status").on(table.status),
]);

export const insertShipmentSchema = createInsertSchema(shipments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipments.$inferSelect;

// ============================================
// SHIPMENT EVENTS (Tracking timeline)
// ============================================
export const shipmentEvents = pgTable("shipment_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").notNull().references(() => shipments.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 }).notNull(),
  description: text("description"),
  location: varchar("location", { length: 255 }),
  eventTime: timestamp("event_time").defaultNow(),
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_shipment_events_shipment").on(table.shipmentId),
]);

export const insertShipmentEventSchema = createInsertSchema(shipmentEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertShipmentEvent = z.infer<typeof insertShipmentEventSchema>;
export type ShipmentEvent = typeof shipmentEvents.$inferSelect;

// ============================================
// REMARKS (Agent notes on orders)
// ============================================
export const remarks = pgTable("remarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(), // Who added
  content: text("content").notNull(),
  remarkType: varchar("remark_type", { length: 30 }).default("general"), // general, follow_up, issue, resolved
  isInternal: boolean("is_internal").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_remarks_order").on(table.orderId),
]);

export const insertRemarkSchema = createInsertSchema(remarks).omit({
  id: true,
  createdAt: true,
});
export type InsertRemark = z.infer<typeof insertRemarkSchema>;
export type Remark = typeof remarks.$inferSelect;

// ============================================
// COD RECONCILIATION (Payment tracking)
// ============================================
export const codReconciliation = pgTable("cod_reconciliation", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  shipmentId: varchar("shipment_id").references(() => shipments.id),
  orderId: varchar("order_id").references(() => orders.id),
  courierName: varchar("courier_name", { length: 50 }),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  codAmount: decimal("cod_amount", { precision: 12, scale: 2 }).notNull(),
  courierFee: decimal("courier_fee", { precision: 10, scale: 2 }),
  netAmount: decimal("net_amount", { precision: 12, scale: 2 }),
  status: varchar("status", { length: 30 }).default("pending"), // pending, received, disputed
  courierSettlementRef: varchar("courier_settlement_ref", { length: 100 }),
  courierSettlementDate: timestamp("courier_settlement_date"),
  bankTransferRef: varchar("bank_transfer_ref", { length: 100 }),
  bankTransferDate: timestamp("bank_transfer_date"),
  notes: text("notes"),
  reconciliatedAt: timestamp("reconciliated_at"),
  reconciliatedBy: varchar("reconciliated_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_cod_reconciliation_merchant").on(table.merchantId),
  index("idx_cod_reconciliation_status").on(table.status),
]);

export const insertCodReconciliationSchema = createInsertSchema(codReconciliation).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCodReconciliation = z.infer<typeof insertCodReconciliationSchema>;
export type CodReconciliation = typeof codReconciliation.$inferSelect;

// ============================================
// SYNC LOGS (Track sync operations)
// ============================================
export const syncLogs = pgTable("sync_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  syncType: varchar("sync_type", { length: 50 }).notNull(), // shopify_orders, courier_status, cod_reconciliation
  status: varchar("status", { length: 30 }).default("running"), // running, completed, failed
  recordsProcessed: integer("records_processed").default(0),
  recordsFailed: integer("records_failed").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_sync_logs_merchant").on(table.merchantId),
]);

export const insertSyncLogSchema = createInsertSchema(syncLogs).omit({
  id: true,
  startedAt: true,
});
export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;
export type SyncLog = typeof syncLogs.$inferSelect;

// ============================================
// BOOKING JOBS (Courier booking idempotency)
// ============================================
export const bookingJobs = pgTable("booking_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  courierName: varchar("courier_name", { length: 50 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("queued"),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  slipUrl: text("slip_url"),
  rawRequest: jsonb("raw_request"),
  rawResponse: jsonb("raw_response"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_booking_jobs_merchant").on(table.merchantId),
  index("idx_booking_jobs_order").on(table.orderId),
  index("idx_booking_jobs_order_courier").on(table.orderId, table.courierName),
]);

export const insertBookingJobSchema = createInsertSchema(bookingJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBookingJob = z.infer<typeof insertBookingJobSchema>;
export type BookingJob = typeof bookingJobs.$inferSelect;

// ============================================
// SHIPMENT BATCHES (Booking batch logs)
// ============================================
export const shipmentBatches = pgTable("shipment_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  createdByUserId: varchar("created_by_user_id"),
  courierName: varchar("courier_name", { length: 50 }).notNull(),
  batchType: varchar("batch_type", { length: 20 }).notNull().default("BULK"),
  status: varchar("status", { length: 30 }).notNull().default("CREATED"),
  totalSelectedCount: integer("total_selected_count").default(0),
  successCount: integer("success_count").default(0),
  failedCount: integer("failed_count").default(0),
  notes: text("notes"),
  pdfBatchPath: text("pdf_batch_path"),
  pdfBatchMeta: jsonb("pdf_batch_meta"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_shipment_batches_merchant").on(table.merchantId),
]);

export const insertShipmentBatchSchema = createInsertSchema(shipmentBatches).omit({
  id: true,
  createdAt: true,
});
export type InsertShipmentBatch = z.infer<typeof insertShipmentBatchSchema>;
export type ShipmentBatch = typeof shipmentBatches.$inferSelect;

// ============================================
// SHIPMENT BATCH ITEMS (Individual results in a batch)
// ============================================
export const shipmentBatchItems = pgTable("shipment_batch_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: varchar("batch_id").notNull().references(() => shipmentBatches.id, { onDelete: "cascade" }),
  shipmentId: varchar("shipment_id"),
  orderId: varchar("order_id").notNull(),
  orderNumber: varchar("order_number", { length: 100 }),
  bookingStatus: varchar("booking_status", { length: 30 }).notNull().default("PENDING"),
  bookingError: text("booking_error"),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  slipUrl: text("slip_url"),
  consigneeName: varchar("consignee_name", { length: 255 }),
  consigneePhone: varchar("consignee_phone", { length: 50 }),
  consigneeCity: varchar("consignee_city", { length: 100 }),
  codAmount: decimal("cod_amount", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_batch_items_batch").on(table.batchId),
  index("idx_batch_items_order").on(table.orderId),
]);

export const insertShipmentBatchItemSchema = createInsertSchema(shipmentBatchItems).omit({
  id: true,
  createdAt: true,
});
export type InsertShipmentBatchItem = z.infer<typeof insertShipmentBatchItemSchema>;
export type ShipmentBatchItem = typeof shipmentBatchItems.$inferSelect;

// ============================================
// SHIPMENT PRINT RECORDS (PDF generation tracking)
// ============================================
export const shipmentPrintRecords = pgTable("shipment_print_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  shipmentId: varchar("shipment_id"),
  orderId: varchar("order_id"),
  courierName: varchar("courier_name", { length: 50 }),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  printTemplateVersion: varchar("print_template_version", { length: 20 }).default("1.0"),
  generatedAt: timestamp("generated_at").defaultNow(),
  generatedByUserId: varchar("generated_by_user_id"),
  pdfPath: text("pdf_path"),
  pdfMeta: jsonb("pdf_meta"),
  source: varchar("source", { length: 30 }).default("CUSTOM_TEMPLATE"),
  isLatest: boolean("is_latest").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_print_records_merchant").on(table.merchantId),
  index("idx_print_records_shipment").on(table.shipmentId),
]);

export const insertShipmentPrintRecordSchema = createInsertSchema(shipmentPrintRecords).omit({
  id: true,
  createdAt: true,
});
export type InsertShipmentPrintRecord = z.infer<typeof insertShipmentPrintRecordSchema>;
export type ShipmentPrintRecord = typeof shipmentPrintRecords.$inferSelect;

// ============================================
// RELATIONS
// ============================================
export const merchantsRelations = relations(merchants, ({ many }) => ({
  teamMembers: many(teamMembers),
  shopifyStores: many(shopifyStores),
  courierAccounts: many(courierAccounts),
  orders: many(orders),
  shipments: many(shipments),
  codReconciliation: many(codReconciliation),
  syncLogs: many(syncLogs),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  merchant: one(merchants, {
    fields: [teamMembers.merchantId],
    references: [merchants.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [orders.merchantId],
    references: [merchants.id],
  }),
  shipments: many(shipments),
  remarks: many(remarks),
}));

export const shipmentsRelations = relations(shipments, ({ one, many }) => ({
  order: one(orders, {
    fields: [shipments.orderId],
    references: [orders.id],
  }),
  merchant: one(merchants, {
    fields: [shipments.merchantId],
    references: [merchants.id],
  }),
  events: many(shipmentEvents),
}));

export const shipmentEventsRelations = relations(shipmentEvents, ({ one }) => ({
  shipment: one(shipments, {
    fields: [shipmentEvents.shipmentId],
    references: [shipments.id],
  }),
}));

export const remarksRelations = relations(remarks, ({ one }) => ({
  order: one(orders, {
    fields: [remarks.orderId],
    references: [orders.id],
  }),
}));
