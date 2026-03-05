import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";
export * from "./models/chat";

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
  status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
  onboardingStep: varchar("onboarding_step", { length: 30 }).notNull().default("ACCOUNT_CREATED"),
  shopifyAppClientId: varchar("shopify_app_client_id", { length: 255 }),
  shopifyAppClientSecret: text("shopify_app_client_secret"),
  shopifySyncFromDate: timestamp("shopify_sync_from_date"),
  facebookAppId: varchar("facebook_app_id", { length: 255 }),
  facebookAppSecret: text("facebook_app_secret"),
  facebookAccessToken: text("facebook_access_token"),
  facebookAdAccountId: varchar("facebook_ad_account_id", { length: 255 }),
  timezone: varchar("timezone", { length: 100 }).default("Asia/Karachi"),
  roboTags: jsonb("robo_tags").default({ confirm: "Robo-Confirm", pending: "Robo-Pending", cancel: "Robo-Cancel" }),
  otpRequired: boolean("otp_required").default(true),
  issuePresetStatuses: jsonb("issue_preset_statuses").default([]),
  bookingRemarks: text("booking_remarks"),
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
  userId: varchar("user_id").notNull(),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().default("agent"),
  isActive: boolean("is_active").default(true),
  allowedPages: text("allowed_pages").array(),
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
// TEAM INVITES (Proper invite flow)
// ============================================
export const teamInvites = pgTable("team_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("agent"),
  token: varchar("token", { length: 64 }).notNull().unique(),
  tokenHash: varchar("token_hash", { length: 128 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  invitedBy: varchar("invited_by"),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  acceptedAt: timestamp("accepted_at"),
  acceptedByUserId: varchar("accepted_by_user_id"),
  lastSentAt: timestamp("last_sent_at"),
  sendCount: integer("send_count").default(0),
  lastEmailError: text("last_email_error"),
}, (table) => [
  index("idx_team_invites_merchant").on(table.merchantId),
  index("idx_team_invites_email").on(table.email),
  index("idx_team_invites_token").on(table.token),
]);

export const insertTeamInviteSchema = createInsertSchema(teamInvites).omit({
  id: true,
  createdAt: true,
});
export type InsertTeamInvite = z.infer<typeof insertTeamInviteSchema>;
export type TeamInvite = typeof teamInvites.$inferSelect;

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
  webhookStatus: varchar("webhook_status", { length: 30 }).default("NOT_REGISTERED"),
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
  postalCode: varchar("postal_code", { length: 255 }),
  country: varchar("country", { length: 100 }).default("Pakistan"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  subtotalAmount: decimal("subtotal_amount", { precision: 12, scale: 2 }),
  shippingAmount: decimal("shipping_amount", { precision: 12, scale: 2 }),
  discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 50 }).default("PKR"),
  paymentMethod: varchar("payment_method", { length: 255 }),
  paymentStatus: varchar("payment_status", { length: 255 }).default("pending"),
  fulfillmentStatus: varchar("fulfillment_status", { length: 255 }).default("unfulfilled"),
  orderStatus: varchar("order_status", { length: 255 }).default("pending"),
  lineItems: jsonb("line_items"),
  totalQuantity: integer("total_quantity").default(1),
  tags: text("tags").array(),
  notes: text("notes"),
  courierName: varchar("courier_name", { length: 255 }),
  courierTracking: varchar("courier_tracking", { length: 255 }),
  shipmentStatus: varchar("shipment_status", { length: 50 }).default("pending"),
  courierRawStatus: text("courier_raw_status"),
  courierWeight: decimal("courier_weight", { precision: 10, scale: 2 }),
  remark: text("remark"),
  landingSite: text("landing_site"),
  referringSite: text("referring_site"),
  browserIp: varchar("browser_ip", { length: 100 }),
  rawShopifyData: jsonb("raw_shopify_data"),
  rawWebhookData: jsonb("raw_webhook_data"),
  lastApiSyncAt: timestamp("last_api_sync_at"),
  lastWebhookAt: timestamp("last_webhook_at"),
  shopifyUpdatedAt: timestamp("shopify_updated_at"),
  resolvedSource: jsonb("resolved_source"),
  dataQualityFlags: jsonb("data_quality_flags"),
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
  fulfilledAt: timestamp("fulfilled_at"),
  fulfilledBy: varchar("fulfilled_by", { length: 255 }),
  dispatchedAt: timestamp("dispatched_at"),
  deliveredAt: timestamp("delivered_at"),
  returnedAt: timestamp("returned_at"),
  shopifyFulfillmentId: varchar("shopify_fulfillment_id", { length: 255 }),
  prepaidAmount: decimal("prepaid_amount", { precision: 12, scale: 2 }).default("0"),
  codRemaining: decimal("cod_remaining", { precision: 12, scale: 2 }),
  codPaymentStatus: varchar("cod_payment_status", { length: 20 }).default("UNPAID"),
  lastPaymentAt: timestamp("last_payment_at"),
  orderSource: varchar("order_source", { length: 50 }),
}, (table) => [
  index("idx_orders_merchant").on(table.merchantId),
  index("idx_orders_shopify_id").on(table.shopifyOrderId),
  index("idx_orders_status").on(table.orderStatus),
  index("idx_orders_shipment_status").on(table.shipmentStatus),
  index("idx_orders_city").on(table.city),
  index("idx_orders_date").on(table.orderDate),
  index("idx_orders_courier").on(table.courierName),
  index("idx_orders_workflow_status").on(table.workflowStatus),
  index("idx_orders_merchant_workflow_date").on(table.merchantId, table.workflowStatus, table.orderDate),
  index("idx_orders_merchant_shipment").on(table.merchantId, table.workflowStatus, table.shipmentStatus),
  uniqueIndex("idx_orders_merchant_shopify_unique").on(table.merchantId, table.shopifyOrderId).where(sql`shopify_order_id IS NOT NULL`),
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
  actorName: varchar("actor_name", { length: 255 }),
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
// ORDER CHANGE LOG (Field edits, payment changes, booking actions audit)
// ============================================
export const orderChangeLog = pgTable("order_change_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  changeType: varchar("change_type", { length: 30 }).notNull(),
  fieldName: varchar("field_name", { length: 50 }),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  reason: text("reason"),
  actorUserId: varchar("actor_user_id"),
  actorName: varchar("actor_name", { length: 255 }),
  actorType: varchar("actor_type", { length: 20 }).notNull().default("user"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_change_log_order").on(table.orderId),
  index("idx_change_log_merchant").on(table.merchantId),
]);

export const insertOrderChangeLogSchema = createInsertSchema(orderChangeLog).omit({
  id: true,
  createdAt: true,
});
export type InsertOrderChangeLog = z.infer<typeof insertOrderChangeLogSchema>;
export type OrderChangeLog = typeof orderChangeLog.$inferSelect;


// ============================================
// WHATSAPP TEMPLATES (Per-merchant, per-status template config)
// ============================================
export const whatsappTemplates = pgTable("whatsapp_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  workflowStatus: varchar("workflow_status", { length: 50 }).notNull(),
  templateName: varchar("template_name", { length: 255 }).notNull().default("status_notify"),
  messageBody: text("message_body"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_whatsapp_templates_merchant").on(table.merchantId),
  uniqueIndex("idx_whatsapp_templates_merchant_status").on(table.merchantId, table.workflowStatus),
]);
export const insertWhatsappTemplateSchema = createInsertSchema(whatsappTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWhatsappTemplate = z.infer<typeof insertWhatsappTemplateSchema>;
export type WhatsappTemplate = typeof whatsappTemplates.$inferSelect;


// ============================================
// ORDER PAYMENTS (Prepaid / partial payment tracking)
// ============================================
export const orderPayments = pgTable("order_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  method: varchar("method", { length: 20 }).notNull().default("CASH"),
  reference: varchar("reference", { length: 255 }),
  notes: text("notes"),
  createdByUserId: varchar("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_order_payments_order").on(table.orderId),
  index("idx_order_payments_merchant").on(table.merchantId),
]);

export const insertOrderPaymentSchema = createInsertSchema(orderPayments).omit({
  id: true,
  createdAt: true,
});
export type InsertOrderPayment = z.infer<typeof insertOrderPaymentSchema>;
export type OrderPayment = typeof orderPayments.$inferSelect;

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
  codSentToCourier: decimal("cod_sent_to_courier", { precision: 12, scale: 2 }),
  prepaidAtBooking: decimal("prepaid_at_booking", { precision: 12, scale: 2 }),
  shippingCost: decimal("shipping_cost", { precision: 10, scale: 2 }),
  estimatedDelivery: timestamp("estimated_delivery"),
  actualDelivery: timestamp("actual_delivery"),
  deliveryAttempts: integer("delivery_attempts").default(0),
  lastStatusUpdate: timestamp("last_status_update"),
  courierResponse: jsonb("courier_response"), // Raw API response
  loadsheetBatchId: varchar("loadsheet_batch_id", { length: 100 }),
  loadsheetGeneratedAt: timestamp("loadsheet_generated_at"),
  loadsheetData: jsonb("loadsheet_data"),
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
  shipmentId: varchar("shipment_id").references(() => shipments.id, { onDelete: "cascade" }),
  orderId: varchar("order_id").references(() => orders.id, { onDelete: "cascade" }),
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
  courierPaymentStatus: varchar("courier_payment_status", { length: 50 }),
  courierPaymentRef: varchar("courier_payment_ref", { length: 100 }),
  courierPaymentMethod: varchar("courier_payment_method", { length: 50 }),
  courierSlipLink: varchar("courier_slip_link", { length: 500 }),
  courierBillingMethod: varchar("courier_billing_method", { length: 100 }),
  courierMessage: text("courier_message"),
  transactionFee: decimal("transaction_fee", { precision: 10, scale: 2 }),
  transactionTax: decimal("transaction_tax", { precision: 10, scale: 2 }),
  reversalFee: decimal("reversal_fee", { precision: 10, scale: 2 }),
  reversalTax: decimal("reversal_tax", { precision: 10, scale: 2 }),
  upfrontPayment: decimal("upfront_payment", { precision: 12, scale: 2 }),
  reservePayment: decimal("reserve_payment", { precision: 12, scale: 2 }),
  balancePayment: decimal("balance_payment", { precision: 12, scale: 2 }),
  lastSyncedAt: timestamp("last_synced_at"),
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
// SHOPIFY WEBHOOK EVENTS (Idempotency tracking)
// ============================================
export const shopifyWebhookEvents = pgTable("shopify_webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  shopDomain: varchar("shop_domain", { length: 255 }).notNull(),
  topic: varchar("topic", { length: 100 }).notNull(),
  shopifyWebhookId: varchar("shopify_webhook_id", { length: 255 }),
  payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
  processingStatus: varchar("processing_status", { length: 30 }).notNull().default("received"),
  errorMessage: text("error_message"),
  receivedAt: timestamp("received_at").defaultNow(),
  processedAt: timestamp("processed_at"),
}, (table) => [
  index("idx_webhook_events_merchant").on(table.merchantId),
  index("idx_webhook_events_hash").on(table.payloadHash),
  index("idx_webhook_events_webhook_id").on(table.shopifyWebhookId),
]);

export const insertShopifyWebhookEventSchema = createInsertSchema(shopifyWebhookEvents).omit({
  id: true,
  receivedAt: true,
  processedAt: true,
});
export type InsertShopifyWebhookEvent = z.infer<typeof insertShopifyWebhookEventSchema>;
export type ShopifyWebhookEvent = typeof shopifyWebhookEvents.$inferSelect;

// ============================================
// ADMIN ACTION LOGS
// ============================================
export const adminActionLogs = pgTable("admin_action_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").notNull(),
  actionType: varchar("action_type", { length: 50 }).notNull(),
  targetMerchantId: varchar("target_merchant_id"),
  targetUserId: varchar("target_user_id"),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AdminActionLog = typeof adminActionLogs.$inferSelect;

// ============================================
// PLATFORM SETTINGS (global config, single-row)
// ============================================
export const platformSettings = pgTable("platform_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  globalOtpRequired: boolean("global_otp_required").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PlatformSettings = typeof platformSettings.$inferSelect;

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

// ============================================
// SHOPIFY IMPORT JOBS (Async batch imports)
// ============================================
export const shopifyImportJobs = pgTable("shopify_import_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  shopDomain: varchar("shop_domain", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("QUEUED"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  nextCursor: text("next_cursor"),
  currentPage: integer("current_page").default(0),
  batchSize: integer("batch_size").default(100),
  processedCount: integer("processed_count").default(0),
  createdCount: integer("created_count").default(0),
  updatedCount: integer("updated_count").default(0),
  failedCount: integer("failed_count").default(0),
  totalFetched: integer("total_fetched").default(0),
  lastError: text("last_error"),
  lastErrorStage: varchar("last_error_stage", { length: 30 }),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_import_jobs_merchant").on(table.merchantId),
  index("idx_import_jobs_status").on(table.status),
]);

export const insertShopifyImportJobSchema = createInsertSchema(shopifyImportJobs).omit({
  id: true,
  createdAt: true,
});
export type InsertShopifyImportJob = z.infer<typeof insertShopifyImportJobSchema>;
export type ShopifyImportJob = typeof shopifyImportJobs.$inferSelect;

// ============================================
// CANCELLATION JOBS (Async bulk cancellation)
// ============================================
export const cancellationJobs = pgTable("cancellation_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  jobType: varchar("job_type", { length: 30 }).notNull(), // COURIER_CANCEL, SHOPIFY_CANCEL, BOTH
  status: varchar("status", { length: 20 }).notNull().default("QUEUED"), // QUEUED, RUNNING, COMPLETED, FAILED, PARTIAL
  createdByUserId: varchar("created_by_user_id"),
  inputType: varchar("input_type", { length: 30 }).notNull(), // ORDER_IDS, SHOPIFY_NAMES, TRACKING_NUMBERS
  totalCount: integer("total_count").default(0),
  successCount: integer("success_count").default(0),
  failedCount: integer("failed_count").default(0),
  skippedCount: integer("skipped_count").default(0),
  lastError: text("last_error"),
  forceShopifyCancel: boolean("force_shopify_cancel").default(false),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_cancel_jobs_merchant").on(table.merchantId),
  index("idx_cancel_jobs_status").on(table.status),
]);

export const insertCancellationJobSchema = createInsertSchema(cancellationJobs).omit({
  id: true,
  createdAt: true,
});
export type InsertCancellationJob = z.infer<typeof insertCancellationJobSchema>;
export type CancellationJob = typeof cancellationJobs.$inferSelect;

// ============================================
// CANCELLATION JOB ITEMS (Per-order results)
// ============================================
export const cancellationJobItems = pgTable("cancellation_job_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => cancellationJobs.id, { onDelete: "cascade" }),
  orderId: varchar("order_id"),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  shopifyOrderId: varchar("shopify_order_id", { length: 100 }),
  orderNumber: varchar("order_number", { length: 50 }),
  action: varchar("action", { length: 30 }).notNull(), // COURIER_CANCEL, SHOPIFY_CANCEL
  status: varchar("status", { length: 20 }).notNull().default("PENDING"), // PENDING, SUCCESS, FAILED, SKIPPED
  errorMessage: text("error_message"),
  courierResponse: jsonb("courier_response"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_cancel_items_job").on(table.jobId),
  index("idx_cancel_items_order").on(table.orderId),
]);

export const insertCancellationJobItemSchema = createInsertSchema(cancellationJobItems).omit({
  id: true,
  createdAt: true,
});
export type InsertCancellationJobItem = z.infer<typeof insertCancellationJobItemSchema>;
export type CancellationJobItem = typeof cancellationJobItems.$inferSelect;

// ============================================
// COURIER STATUS MAPPINGS (Per-merchant customizable)
// ============================================
export const courierStatusMappings = pgTable("courier_status_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  courierName: varchar("courier_name", { length: 50 }).notNull(),
  courierStatus: varchar("courier_status", { length: 255 }).notNull(),
  normalizedStatus: varchar("normalized_status", { length: 50 }).notNull(),
  workflowStage: varchar("workflow_stage", { length: 50 }),
  isCustom: boolean("is_custom").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_csm_merchant").on(table.merchantId),
  index("idx_csm_merchant_courier").on(table.merchantId, table.courierName),
  uniqueIndex("idx_csm_unique_mapping").on(table.merchantId, table.courierName, table.courierStatus),
]);

export const insertCourierStatusMappingSchema = createInsertSchema(courierStatusMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCourierStatusMapping = z.infer<typeof insertCourierStatusMappingSchema>;
export type CourierStatusMapping = typeof courierStatusMappings.$inferSelect;

// ============================================
// UNMAPPED COURIER STATUSES (Track unknown statuses for resolution)
// ============================================
export const unmappedCourierStatuses = pgTable("unmapped_courier_statuses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  courierName: varchar("courier_name", { length: 50 }).notNull(),
  rawStatus: varchar("raw_status", { length: 255 }).notNull(),
  sampleTrackingNumber: varchar("sample_tracking_number", { length: 100 }),
  occurrenceCount: integer("occurrence_count").default(1),
  resolved: boolean("resolved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_ucs_merchant").on(table.merchantId),
  uniqueIndex("idx_ucs_unique").on(table.merchantId, table.courierName, table.rawStatus),
]);

export const insertUnmappedCourierStatusSchema = createInsertSchema(unmappedCourierStatuses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUnmappedCourierStatus = z.infer<typeof insertUnmappedCourierStatusSchema>;
export type UnmappedCourierStatus = typeof unmappedCourierStatuses.$inferSelect;

// ============================================
// COURIER KEYWORD MAPPINGS (Keyword-based normalization rules)
// ============================================
export const courierKeywordMappings = pgTable("courier_keyword_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  courierName: varchar("courier_name", { length: 50 }),
  keyword: varchar("keyword", { length: 255 }).notNull(),
  normalizedStatus: varchar("normalized_status", { length: 50 }).notNull(),
  workflowStage: varchar("workflow_stage", { length: 50 }),
  priority: integer("priority").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_ckm_merchant").on(table.merchantId),
]);

export const insertCourierKeywordMappingSchema = createInsertSchema(courierKeywordMappings).omit({
  id: true,
  createdAt: true,
});
export type InsertCourierKeywordMapping = z.infer<typeof insertCourierKeywordMappingSchema>;
export type CourierKeywordMapping = typeof courierKeywordMappings.$inferSelect;

// ============================================
// PRODUCTS (Shopify product sync & inventory)
// ============================================
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id", { length: 255 }).notNull(),
  shopifyProductId: varchar("shopify_product_id", { length: 255 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  handle: varchar("handle", { length: 500 }),
  vendor: varchar("vendor", { length: 255 }),
  productType: varchar("product_type", { length: 255 }),
  status: varchar("status", { length: 50 }).default("active"),
  imageUrl: text("image_url"),
  images: jsonb("images"),
  tags: text("tags"),
  totalInventory: integer("total_inventory").default(0),
  variants: jsonb("variants"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  shopifySyncedAt: timestamp("shopify_synced_at"),
}, (table) => [
  index("idx_products_merchant").on(table.merchantId),
  uniqueIndex("idx_products_shopify_unique").on(table.merchantId, table.shopifyProductId),
]);

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// ============================================
// EXPENSES (Accounting - expense tracking)
// ============================================
export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).default("0"),
  remainingDue: decimal("remaining_due", { precision: 12, scale: 2 }),
  paymentStatus: varchar("payment_status", { length: 20 }).default("unpaid"),
  partyId: varchar("party_id"),
  category: varchar("category", { length: 100 }).notNull(),
  date: timestamp("date").notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }),
  cashAccountId: varchar("cash_account_id"),
  reference: varchar("reference", { length: 255 }),
  isRecurring: boolean("is_recurring").default(false),
  recurringFrequency: varchar("recurring_frequency", { length: 20 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_expenses_merchant").on(table.merchantId),
  index("idx_expenses_date").on(table.merchantId, table.date),
  index("idx_expenses_category").on(table.merchantId, table.category),
  index("idx_expenses_payment_status").on(table.merchantId, table.paymentStatus),
]);

export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

// ============================================
// STOCK LEDGER (Accounting - stock movements)
// ============================================
export const stockLedger = pgTable("stock_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(),
  productName: varchar("product_name", { length: 500 }).notNull(),
  sku: varchar("sku", { length: 100 }),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  totalValue: decimal("total_value", { precision: 12, scale: 2 }).notNull(),
  supplier: varchar("supplier", { length: 255 }),
  reference: varchar("reference", { length: 255 }),
  date: timestamp("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_stock_ledger_merchant").on(table.merchantId),
  index("idx_stock_ledger_type").on(table.merchantId, table.type),
  index("idx_stock_ledger_date").on(table.merchantId, table.date),
]);

export const insertStockLedgerSchema = createInsertSchema(stockLedger).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStockLedger = z.infer<typeof insertStockLedgerSchema>;
export type StockLedgerEntry = typeof stockLedger.$inferSelect;

// ============================================
// COURIER DUES (Accounting - courier payables/receivables)
// ============================================
export const courierDues = pgTable("courier_dues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  courierName: varchar("courier_name", { length: 100 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  description: varchar("description", { length: 500 }),
  reference: varchar("reference", { length: 255 }),
  dueDate: timestamp("due_date"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  paidDate: timestamp("paid_date"),
  date: timestamp("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_courier_dues_merchant").on(table.merchantId),
  index("idx_courier_dues_courier").on(table.merchantId, table.courierName),
  index("idx_courier_dues_status").on(table.merchantId, table.status),
])

export const insertCourierDueSchema = createInsertSchema(courierDues).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCourierDue = z.infer<typeof insertCourierDueSchema>;
export type CourierDue = typeof courierDues.$inferSelect;

// ============================================
// ACCOUNTING: PARTIES (Customers, Suppliers, Couriers)
// ============================================
export const parties = pgTable("parties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 30 }).notNull().default("customer"),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  tags: text("tags").array(),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_parties_merchant").on(table.merchantId),
  index("idx_parties_type").on(table.merchantId, table.type),
]);

export const insertPartySchema = createInsertSchema(parties).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertParty = z.infer<typeof insertPartySchema>;
export type Party = typeof parties.$inferSelect;

// ============================================
// ACCOUNTING: PARTY BALANCES (Running balance per party)
// ============================================
export const partyBalances = pgTable("party_balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  partyId: varchar("party_id").notNull().references(() => parties.id, { onDelete: "cascade" }),
  balance: decimal("balance", { precision: 14, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_party_balances_unique").on(table.merchantId, table.partyId),
]);

export const insertPartyBalanceSchema = createInsertSchema(partyBalances).omit({
  id: true,
  updatedAt: true,
});
export type InsertPartyBalance = z.infer<typeof insertPartyBalanceSchema>;
export type PartyBalance = typeof partyBalances.$inferSelect;

// ============================================
// ACCOUNTING: CASH ACCOUNTS (Bank / Cash wallets)
// ============================================
export const cashAccounts = pgTable("cash_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 30 }).notNull().default("cash"),
  bankName: varchar("bank_name", { length: 255 }),
  accountNumber: varchar("account_number", { length: 100 }),
  balance: decimal("balance", { precision: 14, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_cash_accounts_merchant").on(table.merchantId),
]);

export const insertCashAccountSchema = createInsertSchema(cashAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCashAccount = z.infer<typeof insertCashAccountSchema>;
export type CashAccount = typeof cashAccounts.$inferSelect;

// ============================================
// ACCOUNTING: CASH MOVEMENTS (Money in/out records)
// ============================================
export const cashMovements = pgTable("cash_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  cashAccountId: varchar("cash_account_id").notNull().references(() => cashAccounts.id),
  type: varchar("type", { length: 10 }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 14, scale: 2 }),
  partyId: varchar("party_id").references(() => parties.id),
  relatedExpenseId: varchar("related_expense_id"),
  relatedSaleId: varchar("related_sale_id"),
  relatedReceiptId: varchar("related_receipt_id"),
  relatedSettlementId: varchar("related_settlement_id"),
  description: text("description"),
  reference: varchar("reference", { length: 255 }),
  date: timestamp("date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_cash_movements_merchant").on(table.merchantId),
  index("idx_cash_movements_account").on(table.cashAccountId),
  index("idx_cash_movements_date").on(table.merchantId, table.date),
]);

export const insertCashMovementSchema = createInsertSchema(cashMovements).omit({
  id: true,
  createdAt: true,
});
export type InsertCashMovement = z.infer<typeof insertCashMovementSchema>;
export type CashMovement = typeof cashMovements.$inferSelect;

// ============================================
// ACCOUNTING: EXPENSE TYPES (Categories for expenses)
// ============================================
export const expenseTypes = pgTable("expense_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  addToProductCost: boolean("add_to_product_cost").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_expense_types_merchant").on(table.merchantId),
]);

export const insertExpenseTypeSchema = createInsertSchema(expenseTypes).omit({
  id: true,
  createdAt: true,
});
export type InsertExpenseType = z.infer<typeof insertExpenseTypeSchema>;
export type ExpenseType = typeof expenseTypes.$inferSelect;

// ============================================
// ACCOUNTING: EXPENSE PAYMENTS (Partial payment tracking)
// ============================================
export const expensePayments = pgTable("expense_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  expenseId: varchar("expense_id").notNull().references(() => expenses.id, { onDelete: "cascade" }),
  cashAccountId: varchar("cash_account_id").notNull().references(() => cashAccounts.id),
  partyId: varchar("party_id").references(() => parties.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  date: timestamp("date").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_expense_payments_expense").on(table.expenseId),
  index("idx_expense_payments_merchant").on(table.merchantId),
]);

export const insertExpensePaymentSchema = createInsertSchema(expensePayments).omit({
  id: true,
  createdAt: true,
});
export type InsertExpensePayment = z.infer<typeof insertExpensePaymentSchema>;
export type ExpensePayment = typeof expensePayments.$inferSelect;

// ============================================
// ACCOUNTING: ACCOUNTING PRODUCTS (Internal stock with avg cost)
// ============================================
export const accountingProducts = pgTable("accounting_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 500 }).notNull(),
  nameNormalized: varchar("name_normalized", { length: 500 }),
  sku: varchar("sku", { length: 100 }).notNull().default(""),
  skuNormalized: varchar("sku_normalized", { length: 100 }),
  salePrice: decimal("sale_price", { precision: 18, scale: 2 }).notNull().default("0"),
  unit: varchar("unit", { length: 50 }).notNull().default("pcs"),
  trackInventory: boolean("track_inventory").notNull().default(true),
  purchaseCost: decimal("purchase_cost", { precision: 18, scale: 2 }),
  category: varchar("category", { length: 200 }),
  barcode: varchar("barcode", { length: 200 }),
  costingMethod: varchar("costing_method", { length: 20 }).notNull().default("AVERAGE"),
  stockQty: integer("stock_qty").notNull().default(0),
  avgUnitCost: decimal("avg_unit_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  sellingPrice: decimal("selling_price", { precision: 12, scale: 2 }),
  active: boolean("active").notNull().default(true),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_acct_products_merchant").on(table.merchantId),
  uniqueIndex("idx_acct_products_name_norm").on(table.merchantId, table.nameNormalized),
  uniqueIndex("idx_acct_products_sku_norm").on(table.merchantId, table.skuNormalized),
]);

export const insertAccountingProductSchema = createInsertSchema(accountingProducts).omit({
  id: true,
  nameNormalized: true,
  skuNormalized: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAccountingProduct = z.infer<typeof insertAccountingProductSchema>;
export type AccountingProduct = typeof accountingProducts.$inferSelect;

// ============================================
// ACCOUNTING: STOCK RECEIPTS (Purchases / stock in) - Multi-item
// ============================================
export const stockReceipts = pgTable("stock_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  supplierId: varchar("supplier_id").notNull().references(() => parties.id),
  paymentType: varchar("payment_type", { length: 20 }).notNull().default("PAID_NOW"),
  cashAccountId: varchar("cash_account_id").references(() => cashAccounts.id),
  extraCosts: decimal("extra_costs", { precision: 14, scale: 2 }).default("0"),
  itemsSubtotal: decimal("items_subtotal", { precision: 14, scale: 2 }).notNull(),
  inventoryValue: decimal("inventory_value", { precision: 14, scale: 2 }).notNull(),
  description: text("description"),
  date: timestamp("date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_stock_receipts_merchant").on(table.merchantId),
  index("idx_stock_receipts_date").on(table.merchantId, table.date),
]);

export const stockReceiptItems = pgTable("stock_receipt_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stockReceiptId: varchar("stock_receipt_id").notNull().references(() => stockReceipts.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => accountingProducts.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 14, scale: 2 }).notNull(),
  allocatedExtra: decimal("allocated_extra", { precision: 14, scale: 2 }).default("0"),
  finalUnitCost: decimal("final_unit_cost", { precision: 12, scale: 2 }).notNull(),
}, (table) => [
  index("idx_stock_receipt_items_receipt").on(table.stockReceiptId),
  index("idx_stock_receipt_items_product").on(table.productId),
]);

export const insertStockReceiptSchema = createInsertSchema(stockReceipts).omit({
  id: true,
  createdAt: true,
});
export type InsertStockReceipt = z.infer<typeof insertStockReceiptSchema>;
export type StockReceipt = typeof stockReceipts.$inferSelect;

export const insertStockReceiptItemSchema = createInsertSchema(stockReceiptItems).omit({
  id: true,
});
export type InsertStockReceiptItem = z.infer<typeof insertStockReceiptItemSchema>;
export type StockReceiptItem = typeof stockReceiptItems.$inferSelect;

// ============================================
// ACCOUNTING: SALES (Multi-product invoices with split payments)
// ============================================
export const sales = pgTable("sales", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").references(() => parties.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
  total: decimal("total", { precision: 14, scale: 2 }).notNull().default("0"),
  cogsTotal: decimal("cogs_total", { precision: 14, scale: 2 }),
  grossProfit: decimal("gross_profit", { precision: 14, scale: 2 }),
  paidNow: decimal("paid_now_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  remaining: decimal("remaining", { precision: 14, scale: 2 }).notNull().default("0"),
  paymentMode: varchar("payment_mode", { length: 20 }).notNull().default("RECEIVE_NOW"),
  referenceId: varchar("reference_id", { length: 100 }),
  date: timestamp("date").notNull(),
  notes: text("notes"),
  completedAt: timestamp("completed_at"),
  reversedAt: timestamp("reversed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_sales_merchant").on(table.merchantId),
  index("idx_sales_status").on(table.merchantId, table.status),
  index("idx_sales_date").on(table.merchantId, table.date),
]);

export const insertSaleSchema = createInsertSchema(sales).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof sales.$inferSelect;

// ============================================
// ACCOUNTING: SALE ITEMS (line items per sale)
// ============================================
export const saleItems = pgTable("sale_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  saleId: varchar("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => accountingProducts.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 14, scale: 2 }).notNull(),
  cogsPerUnit: decimal("cogs_per_unit", { precision: 12, scale: 2 }),
  cogsTotal: decimal("cogs_total", { precision: 14, scale: 2 }),
}, (table) => [
  index("idx_sale_items_sale").on(table.saleId),
  index("idx_sale_items_product").on(table.productId),
]);

export const insertSaleItemSchema = createInsertSchema(saleItems).omit({
  id: true,
});
export type InsertSaleItem = z.infer<typeof insertSaleItemSchema>;
export type SaleItem = typeof saleItems.$inferSelect;

// ============================================
// ACCOUNTING: SALE PAYMENTS (split payment lines)
// ============================================
export const salePayments = pgTable("sale_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  saleId: varchar("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  cashAccountId: varchar("cash_account_id").notNull().references(() => cashAccounts.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
}, (table) => [
  index("idx_sale_payments_sale").on(table.saleId),
]);

export const insertSalePaymentSchema = createInsertSchema(salePayments).omit({
  id: true,
});
export type InsertSalePayment = z.infer<typeof insertSalePaymentSchema>;
export type SalePayment = typeof salePayments.$inferSelect;

// ============================================
// ACCOUNTING: COURIER SETTLEMENTS (COD / charge settlements)
// ============================================
export const courierSettlements = pgTable("courier_settlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  courierPartyId: varchar("courier_party_id").notNull().references(() => parties.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 30 }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  cashAccountId: varchar("cash_account_id").notNull().references(() => cashAccounts.id, { onDelete: "cascade" }),
  statementRef: varchar("statement_ref", { length: 255 }),
  date: timestamp("date").notNull(),
  notes: text("notes"),
  matchedItems: jsonb("matched_items"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_courier_settlements_merchant").on(table.merchantId),
  index("idx_courier_settlements_courier").on(table.courierPartyId),
  index("idx_courier_settlements_date").on(table.merchantId, table.date),
]);

export const insertCourierSettlementSchema = createInsertSchema(courierSettlements).omit({
  id: true,
  createdAt: true,
});
export type InsertCourierSettlement = z.infer<typeof insertCourierSettlementSchema>;
export type CourierSettlement = typeof courierSettlements.$inferSelect;

// ============================================
// ACCOUNTING: LEDGER ENTRIES (Double-entry backbone)
// ============================================
export const ledgerEntries = pgTable("ledger_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  description: text("description"),
  debitAccount: varchar("debit_account", { length: 100 }).notNull(),
  creditAccount: varchar("credit_account", { length: 100 }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  referenceType: varchar("reference_type", { length: 30 }),
  referenceId: varchar("reference_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_ledger_entries_merchant").on(table.merchantId),
  index("idx_ledger_entries_date").on(table.merchantId, table.date),
  index("idx_ledger_entries_ref").on(table.referenceType, table.referenceId),
]);

export const insertLedgerEntrySchema = createInsertSchema(ledgerEntries).omit({
  id: true,
  createdAt: true,
});
export type InsertLedgerEntry = z.infer<typeof insertLedgerEntrySchema>;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;

// ============================================
// ACCOUNTING: AUDIT LOG (Immutable event log)
// ============================================
export const accountingAuditLog = pgTable("accounting_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  entityType: varchar("entity_type", { length: 30 }),
  entityId: varchar("entity_id"),
  description: text("description"),
  balancesBefore: jsonb("balances_before"),
  balancesAfter: jsonb("balances_after"),
  metadata: jsonb("metadata"),
  actorUserId: varchar("actor_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_acct_audit_merchant").on(table.merchantId),
  index("idx_acct_audit_type").on(table.merchantId, table.eventType),
  index("idx_acct_audit_date").on(table.merchantId, table.createdAt),
]);

export const insertAccountingAuditLogSchema = createInsertSchema(accountingAuditLog).omit({
  id: true,
  createdAt: true,
});
export type InsertAccountingAuditLog = z.infer<typeof insertAccountingAuditLogSchema>;
export type AccountingAuditLogEntry = typeof accountingAuditLog.$inferSelect;

// ============================================
// ACCOUNTING: SETTINGS (per-merchant preferences)
// ============================================
export const accountingSettings = pgTable("accounting_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  advancedMode: boolean("advanced_mode").default(false),
  defaultCashAccountId: varchar("default_cash_account_id"),
  defaultCurrency: varchar("default_currency", { length: 10 }).default("PKR"),
  financialYearStart: integer("financial_year_start").default(7),
  openingBalancesSet: boolean("opening_balances_set").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_acct_settings_merchant").on(table.merchantId),
]);

export const insertAccountingSettingsSchema = createInsertSchema(accountingSettings).omit({
  id: true,
  updatedAt: true,
});
export type InsertAccountingSettings = z.infer<typeof insertAccountingSettingsSchema>;
export type AccountingSettings = typeof accountingSettings.$inferSelect;

// ============================================
// ACCOUNTING: TRANSACTIONS (Unified Money In/Out/Transfer/Reversal)
// ============================================
export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  txnType: varchar("txn_type", { length: 20 }).notNull(),
  transferMode: varchar("transfer_mode", { length: 30 }),
  category: varchar("category", { length: 100 }),
  description: text("description"),
  referenceId: varchar("reference_id", { length: 255 }),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  date: timestamp("date").notNull(),
  fromPartyId: varchar("from_party_id").references(() => parties.id, { onDelete: "cascade" }),
  toPartyId: varchar("to_party_id").references(() => parties.id, { onDelete: "cascade" }),
  fromAccountId: varchar("from_account_id").references(() => cashAccounts.id, { onDelete: "cascade" }),
  toAccountId: varchar("to_account_id").references(() => cashAccounts.id, { onDelete: "cascade" }),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  reversalOf: varchar("reversal_of"),
  reversedBy: varchar("reversed_by"),
  reversedAt: timestamp("reversed_at"),
  reversalReason: text("reversal_reason"),
}, (table) => [
  index("idx_txn_merchant").on(table.merchantId),
  index("idx_txn_type").on(table.merchantId, table.txnType),
  index("idx_txn_date").on(table.merchantId, table.date),
  index("idx_txn_party_from").on(table.fromPartyId),
  index("idx_txn_party_to").on(table.toPartyId),
  index("idx_txn_account_from").on(table.fromAccountId),
  index("idx_txn_account_to").on(table.toAccountId),
  index("idx_txn_reversal_of").on(table.reversalOf),
]);

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

// ============================================
// ACCOUNTING: LEDGER LINES (Journal lines for double-entry)
// ============================================
export const ledgerLines = pgTable("ledger_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  transactionId: varchar("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  entityType: varchar("entity_type", { length: 10 }).notNull(),
  entityId: varchar("entity_id").notNull(),
  direction: varchar("direction", { length: 10 }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_ll_transaction").on(table.transactionId),
  index("idx_ll_entity").on(table.entityType, table.entityId),
]);

export const insertLedgerLineSchema = createInsertSchema(ledgerLines).omit({
  id: true,
  createdAt: true,
});
export type InsertLedgerLine = z.infer<typeof insertLedgerLineSchema>;
export type LedgerLine = typeof ledgerLines.$inferSelect;

// ============================================
// ACCOUNTING: OPENING BALANCE BATCHES
// ============================================
export const openingBalanceBatches = pgTable("opening_balance_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  batchNumber: varchar("batch_number", { length: 20 }).notNull(),
  openingDate: timestamp("opening_date").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("POSTED"),
  reversalOf: varchar("reversal_of"),
  reversalReason: text("reversal_reason"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_ob_batches_merchant").on(table.merchantId),
  index("idx_ob_batches_status").on(table.merchantId, table.status),
]);

export const insertOpeningBalanceBatchSchema = createInsertSchema(openingBalanceBatches).omit({
  id: true,
  createdAt: true,
});
export type InsertOpeningBalanceBatch = z.infer<typeof insertOpeningBalanceBatchSchema>;
export type OpeningBalanceBatch = typeof openingBalanceBatches.$inferSelect;

// ============================================
// ACCOUNTING: OPENING BALANCE LINES
// ============================================
export const openingBalanceLines = pgTable("opening_balance_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: varchar("batch_id").notNull().references(() => openingBalanceBatches.id, { onDelete: "cascade" }),
  entityType: varchar("entity_type", { length: 20 }).notNull(),
  entityId: varchar("entity_id").notNull(),
  entityName: varchar("entity_name", { length: 255 }).notNull(),
  balanceType: varchar("balance_type", { length: 20 }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
}, (table) => [
  index("idx_ob_lines_batch").on(table.batchId),
]);

export const insertOpeningBalanceLineSchema = createInsertSchema(openingBalanceLines).omit({
  id: true,
});
export type InsertOpeningBalanceLine = z.infer<typeof insertOpeningBalanceLineSchema>;
export type OpeningBalanceLine = typeof openingBalanceLines.$inferSelect;

// ============================================
// MARKETING: AD ACCOUNTS
// ============================================
export const adAccounts = pgTable("ad_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull().default("facebook"),
  accountId: varchar("account_id", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }),
  currency: varchar("currency", { length: 10 }),
  timezone: varchar("timezone", { length: 100 }),
  status: varchar("status", { length: 20 }).default("ACTIVE"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_ad_accounts_merchant").on(table.merchantId),
]);

export const insertAdAccountSchema = createInsertSchema(adAccounts).omit({ id: true, createdAt: true });
export type InsertAdAccount = z.infer<typeof insertAdAccountSchema>;
export type AdAccount = typeof adAccounts.$inferSelect;

// ============================================
// MARKETING: CAMPAIGNS
// ============================================
export const adCampaigns = pgTable("ad_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  adAccountId: varchar("ad_account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
  campaignId: varchar("campaign_id", { length: 100 }).notNull(),
  name: varchar("name", { length: 500 }),
  status: varchar("status", { length: 30 }),
  effectiveStatus: varchar("effective_status", { length: 30 }),
  configuredStatus: varchar("configured_status", { length: 30 }),
  objective: varchar("objective", { length: 100 }),
  buyingType: varchar("buying_type", { length: 50 }),
  dailyBudget: decimal("daily_budget", { precision: 14, scale: 2 }),
  lifetimeBudget: decimal("lifetime_budget", { precision: 14, scale: 2 }),
  createdTime: timestamp("created_time"),
  rawJson: jsonb("raw_json"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_ad_campaigns_merchant").on(table.merchantId),
  index("idx_ad_campaigns_account").on(table.adAccountId),
  index("idx_ad_campaigns_status").on(table.effectiveStatus),
  uniqueIndex("idx_ad_campaigns_unique").on(table.merchantId, table.campaignId),
]);

export const insertAdCampaignSchema = createInsertSchema(adCampaigns).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAdCampaign = z.infer<typeof insertAdCampaignSchema>;
export type AdCampaign = typeof adCampaigns.$inferSelect;

// ============================================
// MARKETING: AD SETS
// ============================================
export const adSets = pgTable("ad_sets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  adAccountId: varchar("ad_account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
  campaignId: varchar("campaign_id", { length: 100 }).notNull(),
  adsetId: varchar("adset_id", { length: 100 }).notNull(),
  name: varchar("name", { length: 500 }),
  status: varchar("status", { length: 30 }),
  effectiveStatus: varchar("effective_status", { length: 30 }),
  optimizationGoal: varchar("optimization_goal", { length: 100 }),
  billingEvent: varchar("billing_event", { length: 50 }),
  dailyBudget: decimal("daily_budget", { precision: 14, scale: 2 }),
  lifetimeBudget: decimal("lifetime_budget", { precision: 14, scale: 2 }),
  promotedObject: jsonb("promoted_object"),
  targeting: jsonb("targeting"),
  rawJson: jsonb("raw_json"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_ad_sets_merchant").on(table.merchantId),
  index("idx_ad_sets_campaign").on(table.campaignId),
  uniqueIndex("idx_ad_sets_unique").on(table.merchantId, table.adsetId),
]);

export const insertAdSetSchema = createInsertSchema(adSets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAdSet = z.infer<typeof insertAdSetSchema>;
export type AdSet = typeof adSets.$inferSelect;

// ============================================
// MARKETING: ADS
// ============================================
export const adCreatives = pgTable("ad_creatives", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  adAccountId: varchar("ad_account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
  campaignId: varchar("campaign_id", { length: 100 }),
  adsetId: varchar("adset_id", { length: 100 }).notNull(),
  adId: varchar("ad_id", { length: 100 }).notNull(),
  name: varchar("name", { length: 500 }),
  status: varchar("status", { length: 30 }),
  effectiveStatus: varchar("effective_status", { length: 30 }),
  creativeId: varchar("creative_id", { length: 100 }),
  destinationUrl: text("destination_url"),
  matchedProductId: varchar("matched_product_id").references(() => products.id, { onDelete: "set null" }),
  rawJson: jsonb("raw_json"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_ad_creatives_merchant").on(table.merchantId),
  index("idx_ad_creatives_campaign").on(table.campaignId),
  index("idx_ad_creatives_adset").on(table.adsetId),
  uniqueIndex("idx_ad_creatives_unique").on(table.merchantId, table.adId),
]);

export const insertAdCreativeSchema = createInsertSchema(adCreatives).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAdCreative = z.infer<typeof insertAdCreativeSchema>;
export type AdCreative = typeof adCreatives.$inferSelect;

// ============================================
// MARKETING: INSIGHTS (DAILY GRAIN)
// ============================================
export const adInsights = pgTable("ad_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  adAccountId: varchar("ad_account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
  level: varchar("level", { length: 20 }).notNull().default("campaign"),
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 20 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  impressions: integer("impressions").default(0),
  reach: integer("reach").default(0),
  clicks: integer("clicks").default(0),
  spend: decimal("spend", { precision: 14, scale: 2 }).default("0"),
  frequency: decimal("frequency", { precision: 8, scale: 4 }).default("0"),
  cpc: decimal("cpc", { precision: 10, scale: 4 }),
  cpm: decimal("cpm", { precision: 10, scale: 4 }),
  ctr: decimal("ctr", { precision: 8, scale: 4 }),
  linkClicks: integer("link_clicks").default(0),
  landingPageViews: integer("landing_page_views").default(0),
  outboundClicks: integer("outbound_clicks").default(0),
  uniqueOutboundClicks: integer("unique_outbound_clicks").default(0),
  viewContent: integer("view_content").default(0),
  addToCart: integer("add_to_cart").default(0),
  initiateCheckout: integer("initiate_checkout").default(0),
  purchases: integer("purchases").default(0),
  purchaseValue: decimal("purchase_value", { precision: 14, scale: 2 }).default("0"),
  roas: decimal("roas", { precision: 10, scale: 4 }),
  costPerPurchase: decimal("cost_per_purchase", { precision: 14, scale: 2 }),
  costPerCheckout: decimal("cost_per_checkout", { precision: 14, scale: 2 }),
  costPerAddToCart: decimal("cost_per_add_to_cart", { precision: 14, scale: 2 }),
  costPerViewContent: decimal("cost_per_view_content", { precision: 14, scale: 2 }),
  videoViews: integer("video_views").default(0),
  videoThruPlays: integer("video_thru_plays").default(0),
  video3sViews: integer("video_3s_views").default(0),
  video95pViews: integer("video_95p_views").default(0),
  rawJson: jsonb("raw_json"),
  rawActionsJson: jsonb("raw_actions_json"),
  rawCostPerActionJson: jsonb("raw_cost_per_action_json"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_ad_insights_merchant").on(table.merchantId),
  index("idx_ad_insights_date").on(table.date),
  index("idx_ad_insights_level").on(table.level),
  index("idx_ad_insights_entity").on(table.entityId, table.level),
  uniqueIndex("idx_ad_insights_unique").on(table.merchantId, table.entityId, table.entityType, table.date),
]);

export const insertAdInsightSchema = createInsertSchema(adInsights).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAdInsight = z.infer<typeof insertAdInsightSchema>;
export type AdInsight = typeof adInsights.$inferSelect;

// ============================================
// MARKETING: SYNC RUNS
// ============================================
export const metaSyncRuns = pgTable("meta_sync_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  adAccountId: varchar("ad_account_id", { length: 100 }),
  dateFrom: varchar("date_from", { length: 10 }),
  dateTo: varchar("date_to", { length: 10 }),
  level: varchar("level", { length: 20 }),
  status: varchar("status", { length: 20 }).notNull().default("running"),
  errorMessage: text("error_message"),
  rowsUpserted: integer("rows_upserted").default(0),
  startedAt: timestamp("started_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
}, (table) => [
  index("idx_meta_sync_runs_merchant").on(table.merchantId),
]);

export const insertMetaSyncRunSchema = createInsertSchema(metaSyncRuns).omit({ id: true, startedAt: true });
export type InsertMetaSyncRun = z.infer<typeof insertMetaSyncRunSchema>;
export type MetaSyncRun = typeof metaSyncRuns.$inferSelect;

// ============================================
// MARKETING: COLUMN PRESETS
// ============================================
export const metaColumnPresets = pgTable("meta_column_presets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  level: varchar("level", { length: 20 }).notNull().default("campaign"),
  columns: jsonb("columns").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_meta_column_presets_user").on(table.userId),
]);

export const insertMetaColumnPresetSchema = createInsertSchema(metaColumnPresets).omit({ id: true, createdAt: true });
export type InsertMetaColumnPreset = z.infer<typeof insertMetaColumnPresetSchema>;
export type MetaColumnPreset = typeof metaColumnPresets.$inferSelect;

// ============================================
// MARKETING: SYNC LOG (legacy, kept for compatibility)
// ============================================
export const adProfitabilityEntries = pgTable("ad_profitability_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  campaignName: varchar("campaign_name", { length: 500 }).notNull(),
  productId: varchar("product_id").references(() => products.id, { onDelete: "set null" }),
  adSpend: decimal("ad_spend", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_ad_profitability_merchant").on(table.merchantId),
]);

export const insertAdProfitabilityEntrySchema = createInsertSchema(adProfitabilityEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAdProfitabilityEntry = z.infer<typeof insertAdProfitabilityEntrySchema>;
export type AdProfitabilityEntry = typeof adProfitabilityEntries.$inferSelect;

// ============================================
// MARKETING: CAMPAIGN JOURNEY EVENTS
// ============================================
export const campaignJourneyEvents = pgTable("campaign_journey_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  campaignKey: varchar("campaign_key", { length: 500 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  actionType: varchar("action_type", { length: 100 }).notNull(),
  selectedSignal: varchar("selected_signal", { length: 20 }),
  expectedOutcome: varchar("expected_outcome", { length: 255 }).notNull().default(""),
  evaluationWindowHours: integer("evaluation_window_hours").notNull().default(48),
  notes: varchar("notes", { length: 120 }),
  microTag: varchar("micro_tag", { length: 100 }),
  snapshotBefore: jsonb("snapshot_before"),
  snapshotAfter: jsonb("snapshot_after"),
  evaluatedAt: timestamp("evaluated_at"),
}, (table) => [
  index("idx_journey_events_campaign").on(table.campaignKey, table.createdAt),
  index("idx_journey_events_merchant").on(table.merchantId),
]);

export const insertCampaignJourneyEventSchema = createInsertSchema(campaignJourneyEvents).omit({
  id: true,
  createdAt: true,
  evaluatedAt: true,
});
export type InsertCampaignJourneyEvent = z.infer<typeof insertCampaignJourneyEventSchema>;
export type CampaignJourneyEvent = typeof campaignJourneyEvents.$inferSelect;

export const marketingSyncLogs = pgTable("marketing_sync_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull().default("facebook"),
  syncType: varchar("sync_type", { length: 30 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  recordsProcessed: integer("records_processed").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_marketing_sync_merchant").on(table.merchantId),
]);

export const aiInsightCache = pgTable("ai_insight_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  section: varchar("section", { length: 50 }).notNull(),
  insights: jsonb("insights").notNull(),
  generatedAt: timestamp("generated_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => [
  uniqueIndex("idx_ai_insight_cache_merchant_section").on(table.merchantId, table.section),
]);

export const insertAiInsightCacheSchema = createInsertSchema(aiInsightCache).omit({ id: true, generatedAt: true });
export type InsertAiInsightCache = z.infer<typeof insertAiInsightCacheSchema>;
export type AiInsightCache = typeof aiInsightCache.$inferSelect;
