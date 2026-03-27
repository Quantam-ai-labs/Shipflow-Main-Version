CREATE TABLE "accounting_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"entity_type" varchar(30),
	"entity_id" varchar,
	"description" text,
	"balances_before" jsonb,
	"balances_after" jsonb,
	"metadata" jsonb,
	"actor_user_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "accounting_products" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"name" varchar(500) NOT NULL,
	"name_normalized" varchar(500),
	"sku" varchar(100) DEFAULT '' NOT NULL,
	"sku_normalized" varchar(100),
	"sale_price" numeric(18, 2) DEFAULT '0' NOT NULL,
	"unit" varchar(50) DEFAULT 'pcs' NOT NULL,
	"track_inventory" boolean DEFAULT true NOT NULL,
	"purchase_cost" numeric(18, 2),
	"category" varchar(200),
	"barcode" varchar(200),
	"costing_method" varchar(20) DEFAULT 'AVERAGE' NOT NULL,
	"stock_qty" integer DEFAULT 0 NOT NULL,
	"avg_unit_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"selling_price" numeric(12, 2),
	"active" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "accounting_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"advanced_mode" boolean DEFAULT false,
	"default_cash_account_id" varchar,
	"default_currency" varchar(10) DEFAULT 'PKR',
	"financial_year_start" integer DEFAULT 7,
	"opening_balances_set" boolean DEFAULT false,
	"opening_balances_unlocked" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"provider" varchar(50) DEFAULT 'facebook' NOT NULL,
	"account_id" varchar(100) NOT NULL,
	"name" varchar(255),
	"currency" varchar(10),
	"timezone" varchar(100),
	"status" varchar(20) DEFAULT 'ACTIVE',
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_automation_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"enabled" boolean DEFAULT true,
	"entity_type" varchar(20) DEFAULT 'campaign' NOT NULL,
	"entity_filter" jsonb,
	"condition_metric" varchar(50) NOT NULL,
	"condition_operator" varchar(10) NOT NULL,
	"condition_value" numeric(14, 2) NOT NULL,
	"condition_window" varchar(20) DEFAULT 'last_7d' NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"action_value" numeric(14, 2),
	"notify_on_trigger" boolean DEFAULT true,
	"last_triggered_at" timestamp,
	"trigger_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"ad_account_id" varchar NOT NULL,
	"campaign_id" varchar(100) NOT NULL,
	"name" varchar(500),
	"status" varchar(30),
	"effective_status" varchar(30),
	"configured_status" varchar(30),
	"objective" varchar(100),
	"buying_type" varchar(50),
	"daily_budget" numeric(14, 2),
	"lifetime_budget" numeric(14, 2),
	"created_time" timestamp,
	"raw_json" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_creatives" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"ad_account_id" varchar NOT NULL,
	"campaign_id" varchar(100),
	"adset_id" varchar(100) NOT NULL,
	"ad_id" varchar(100) NOT NULL,
	"name" varchar(500),
	"status" varchar(30),
	"effective_status" varchar(30),
	"creative_id" varchar(100),
	"destination_url" text,
	"matched_product_id" varchar,
	"raw_json" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_insights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"ad_account_id" varchar NOT NULL,
	"level" varchar(20) DEFAULT 'campaign' NOT NULL,
	"entity_id" varchar(100) NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"date" varchar(10) NOT NULL,
	"impressions" integer DEFAULT 0,
	"reach" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"spend" numeric(14, 2) DEFAULT '0',
	"frequency" numeric(8, 4) DEFAULT '0',
	"cpc" numeric(10, 4),
	"cpm" numeric(10, 4),
	"ctr" numeric(8, 4),
	"link_clicks" integer DEFAULT 0,
	"landing_page_views" integer DEFAULT 0,
	"outbound_clicks" integer DEFAULT 0,
	"unique_outbound_clicks" integer DEFAULT 0,
	"view_content" integer DEFAULT 0,
	"add_to_cart" integer DEFAULT 0,
	"initiate_checkout" integer DEFAULT 0,
	"purchases" integer DEFAULT 0,
	"purchase_value" numeric(14, 2) DEFAULT '0',
	"roas" numeric(10, 4),
	"cost_per_purchase" numeric(14, 2),
	"cost_per_checkout" numeric(14, 2),
	"cost_per_add_to_cart" numeric(14, 2),
	"cost_per_view_content" numeric(14, 2),
	"video_views" integer DEFAULT 0,
	"video_thru_plays" integer DEFAULT 0,
	"video_3s_views" integer DEFAULT 0,
	"video_95p_views" integer DEFAULT 0,
	"raw_json" jsonb,
	"raw_actions_json" jsonb,
	"raw_cost_per_action_json" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_launch_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"merchant_id" varchar NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"campaign_name" varchar(500) NOT NULL,
	"primary_text" text NOT NULL,
	"headline" varchar(500),
	"description" text,
	"image_url" varchar(2000),
	"image_hash" varchar(255),
	"link_url" varchar(2000),
	"call_to_action" varchar(100),
	"meta_campaign_id" varchar(100),
	"meta_adset_id" varchar(100),
	"meta_creative_id" varchar(100),
	"meta_ad_id" varchar(100),
	"error_message" text,
	"launched_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_launch_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"launch_type" varchar(20) DEFAULT 'single' NOT NULL,
	"campaign_name" varchar(500) NOT NULL,
	"objective" varchar(100) DEFAULT 'OUTCOME_SALES' NOT NULL,
	"daily_budget" numeric(14, 2) NOT NULL,
	"targeting" jsonb NOT NULL,
	"creative_config" jsonb NOT NULL,
	"page_id" varchar(255),
	"pixel_id" varchar(255),
	"meta_campaign_id" varchar(100),
	"meta_adset_id" varchar(100),
	"meta_ad_id" varchar(100),
	"meta_creative_id" varchar(100),
	"error_message" text,
	"launched_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"mode" varchar(30),
	"publish_mode" varchar(20),
	"validation_status" jsonb,
	"normalized_input" jsonb,
	"current_stage" varchar(50),
	"result_json" jsonb,
	"error_summary" text
);
--> statement-breakpoint
CREATE TABLE "ad_media_library" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"name" varchar(500) NOT NULL,
	"type" varchar(20) DEFAULT 'image' NOT NULL,
	"url" text NOT NULL,
	"meta_media_hash" varchar(255),
	"meta_media_id" varchar(100),
	"width" integer,
	"height" integer,
	"file_size" integer,
	"tags" text[],
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_profitability_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"campaign_name" varchar(500) NOT NULL,
	"product_id" varchar,
	"ad_spend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_sets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"ad_account_id" varchar NOT NULL,
	"campaign_id" varchar(100) NOT NULL,
	"adset_id" varchar(100) NOT NULL,
	"name" varchar(500),
	"status" varchar(30),
	"effective_status" varchar(30),
	"optimization_goal" varchar(100),
	"billing_event" varchar(50),
	"daily_budget" numeric(14, 2),
	"lifetime_budget" numeric(14, 2),
	"promoted_object" jsonb,
	"targeting" jsonb,
	"raw_json" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_action_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" varchar NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"target_merchant_id" varchar,
	"target_user_id" varchar,
	"details" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_chat_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"login_email" varchar(255) NOT NULL,
	"device_name" varchar(255),
	"device_ip" varchar(50),
	"is_revoked" boolean DEFAULT false NOT NULL,
	"last_active_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_insight_cache" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"section" varchar(50) NOT NULL,
	"insights" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"order_id" varchar NOT NULL,
	"courier_name" varchar(50) NOT NULL,
	"status" varchar(30) DEFAULT 'queued' NOT NULL,
	"tracking_number" varchar(100),
	"slip_url" text,
	"raw_request" jsonb,
	"raw_response" jsonb,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campaign_journey_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"campaign_key" varchar(500) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"action_type" varchar(100) NOT NULL,
	"selected_signal" varchar(20),
	"expected_outcome" varchar(255) DEFAULT '' NOT NULL,
	"evaluation_window_hours" integer DEFAULT 48 NOT NULL,
	"notes" varchar(120),
	"micro_tag" varchar(100),
	"snapshot_before" jsonb,
	"snapshot_after" jsonb,
	"evaluated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cancellation_job_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"order_id" varchar,
	"tracking_number" varchar(100),
	"shopify_order_id" varchar(100),
	"order_number" varchar(50),
	"action" varchar(30) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"error_message" text,
	"courier_response" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cancellation_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"job_type" varchar(30) NOT NULL,
	"status" varchar(20) DEFAULT 'QUEUED' NOT NULL,
	"created_by_user_id" varchar,
	"input_type" varchar(30) NOT NULL,
	"total_count" integer DEFAULT 0,
	"success_count" integer DEFAULT 0,
	"failed_count" integer DEFAULT 0,
	"skipped_count" integer DEFAULT 0,
	"last_error" text,
	"force_shopify_cancel" boolean DEFAULT false,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cash_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(30) DEFAULT 'cash' NOT NULL,
	"bank_name" varchar(255),
	"account_number" varchar(100),
	"balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"cash_account_id" varchar NOT NULL,
	"type" varchar(10) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"balance_after" numeric(14, 2),
	"party_id" varchar,
	"related_expense_id" varchar,
	"related_sale_id" varchar,
	"related_receipt_id" varchar,
	"related_settlement_id" varchar,
	"description" text,
	"reference" varchar(255),
	"date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cod_reconciliation" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"shipment_id" varchar,
	"order_id" varchar,
	"courier_name" varchar(50),
	"tracking_number" varchar(100),
	"cod_amount" numeric(12, 2) NOT NULL,
	"courier_fee" numeric(10, 2),
	"net_amount" numeric(12, 2),
	"status" varchar(30) DEFAULT 'pending',
	"courier_settlement_ref" varchar(100),
	"courier_settlement_date" timestamp,
	"bank_transfer_ref" varchar(100),
	"bank_transfer_date" timestamp,
	"notes" text,
	"reconciliated_at" timestamp,
	"reconciliated_by" varchar,
	"courier_payment_status" varchar(50),
	"courier_payment_ref" varchar(100),
	"courier_payment_method" varchar(50),
	"courier_slip_link" varchar(500),
	"courier_billing_method" varchar(100),
	"courier_message" text,
	"transaction_fee" numeric(10, 2),
	"transaction_tax" numeric(10, 2),
	"reversal_fee" numeric(10, 2),
	"reversal_tax" numeric(10, 2),
	"upfront_payment" numeric(12, 2),
	"reserve_payment" numeric(12, 2),
	"balance_payment" numeric(12, 2),
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "complaint_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"status" varchar(30) NOT NULL,
	"message_template" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"ticket_number" varchar(20) NOT NULL,
	"conversation_id" varchar,
	"order_id" varchar,
	"order_number" varchar(100),
	"customer_name" varchar(255),
	"customer_phone" varchar(50),
	"product_details" text,
	"delivery_details" text,
	"tracking_number" varchar(100),
	"source" varchar(30) DEFAULT 'other' NOT NULL,
	"reason" text,
	"status" varchar(30) DEFAULT 'logged' NOT NULL,
	"status_history" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "courier_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"courier_name" varchar(50) NOT NULL,
	"api_key" text,
	"api_secret" text,
	"account_number" varchar(100),
	"is_active" boolean DEFAULT true,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "courier_dues" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"courier_name" varchar(100) NOT NULL,
	"type" varchar(20) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"description" varchar(500),
	"reference" varchar(255),
	"due_date" timestamp,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"paid_date" timestamp,
	"date" timestamp NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "courier_keyword_mappings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"courier_name" varchar(50),
	"keyword" varchar(255) NOT NULL,
	"normalized_status" varchar(50) NOT NULL,
	"workflow_stage" varchar(50),
	"priority" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "courier_settlements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"courier_party_id" varchar NOT NULL,
	"type" varchar(30) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"cash_account_id" varchar NOT NULL,
	"statement_ref" varchar(255),
	"date" timestamp NOT NULL,
	"notes" text,
	"matched_items" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "courier_status_mappings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"courier_name" varchar(50) NOT NULL,
	"courier_status" varchar(255) NOT NULL,
	"normalized_status" varchar(50) NOT NULL,
	"workflow_stage" varchar(50),
	"is_custom" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "custom_audiences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"meta_audience_id" varchar(100),
	"name" varchar(500) NOT NULL,
	"description" text,
	"audience_type" varchar(50) DEFAULT 'customer_list' NOT NULL,
	"subtype" varchar(50),
	"source" varchar(50),
	"approximate_count" integer,
	"status" varchar(30) DEFAULT 'pending',
	"retention_days" integer,
	"rule" jsonb,
	"pixel_id" varchar(100),
	"lookalike_spec" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expense_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"expense_id" varchar NOT NULL,
	"cash_account_id" varchar NOT NULL,
	"party_id" varchar,
	"amount" numeric(12, 2) NOT NULL,
	"date" timestamp NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expense_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"add_to_product_cost" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"amount" numeric(12, 2) NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0',
	"remaining_due" numeric(12, 2),
	"payment_status" varchar(20) DEFAULT 'unpaid',
	"party_id" varchar,
	"category" varchar(100) NOT NULL,
	"date" timestamp NOT NULL,
	"payment_method" varchar(50),
	"cash_account_id" varchar,
	"reference" varchar(255),
	"is_recurring" boolean DEFAULT false,
	"recurring_frequency" varchar(20),
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"date" timestamp NOT NULL,
	"description" text,
	"debit_account" varchar(100) NOT NULL,
	"credit_account" varchar(100) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reference_type" varchar(30),
	"reference_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_lines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" varchar NOT NULL,
	"entity_type" varchar(10) NOT NULL,
	"entity_id" varchar NOT NULL,
	"direction" varchar(10) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing_sync_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"provider" varchar(50) DEFAULT 'facebook' NOT NULL,
	"sync_type" varchar(30) NOT NULL,
	"status" varchar(20) NOT NULL,
	"records_processed" integer DEFAULT 0,
	"error_message" text,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"address" text,
	"city" varchar(100),
	"country" varchar(100) DEFAULT 'Pakistan',
	"logo_url" varchar(500),
	"subscription_plan" varchar(50) DEFAULT 'free',
	"is_active" boolean DEFAULT true,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"onboarding_step" varchar(30) DEFAULT 'ACCOUNT_CREATED' NOT NULL,
	"shopify_app_client_id" varchar(255),
	"shopify_app_client_secret" text,
	"shopify_sync_from_date" timestamp,
	"facebook_app_id" varchar(255),
	"facebook_app_secret" text,
	"facebook_access_token" text,
	"facebook_ad_account_id" varchar(255),
	"facebook_page_id" varchar(255),
	"facebook_page_name" varchar(500),
	"facebook_pixel_id" varchar(255),
	"instagram_account_id" varchar(255),
	"instagram_account_name" varchar(500),
	"facebook_token_expires_at" timestamp,
	"facebook_oauth_connected" boolean DEFAULT false,
	"meta_oauth_access_token" text,
	"meta_oauth_token_expires_at" timestamp,
	"meta_selected_ad_account_id" varchar(255),
	"meta_selected_page_id" varchar(255),
	"meta_selected_page_name" varchar(500),
	"meta_selected_pixel_id" varchar(255),
	"meta_selected_ig_account_id" varchar(255),
	"meta_selected_ig_account_name" varchar(500),
	"timezone" varchar(100) DEFAULT 'Asia/Karachi',
	"robo_tags" jsonb DEFAULT '{"confirm":"Robo-Confirm","pending":"Robo-Pending","cancel":"Robo-Cancel"}'::jsonb,
	"otp_required" boolean DEFAULT true,
	"issue_preset_statuses" jsonb DEFAULT '[]'::jsonb,
	"booking_remarks" text,
	"warehouse_pin" varchar(6),
	"warehouse_pin_hash" varchar(128),
	"wa_allowed_shop_domains" jsonb DEFAULT '[]'::jsonb,
	"wa_phone_number_id" varchar(255),
	"wa_access_token" text,
	"wa_waba_id" varchar(255),
	"wa_verify_token" varchar(255),
	"wa_notifications_enabled" boolean DEFAULT true NOT NULL,
	"wa_disconnected" boolean DEFAULT false NOT NULL,
	"wa_phone_registered" boolean DEFAULT false NOT NULL,
	"support_chat_pin" varchar(6),
	"support_chat_pin_hash" varchar(128),
	"robocall_disconnected" boolean DEFAULT false NOT NULL,
	"robocall_email" varchar(255),
	"robocall_api_key" text,
	"robocall_start_time" varchar(5) DEFAULT '10:00',
	"robocall_end_time" varchar(5) DEFAULT '20:00',
	"robocall_voice_id" varchar(10) DEFAULT '735',
	"robocall_max_attempts" integer DEFAULT 3,
	"robocall_retry_gap_minutes" integer DEFAULT 45,
	"wa_max_attempts" integer DEFAULT 3,
	"wa_attempt2_delay_hours" integer DEFAULT 4,
	"wa_attempt3_delay_hours" integer DEFAULT 12,
	"wa_confirm_template1" varchar(100),
	"wa_confirm_template2" varchar(100),
	"wa_confirm_template3" varchar(100),
	"ai_auto_reply_enabled" boolean DEFAULT false NOT NULL,
	"ai_auto_reply_knowledge_base" text,
	"ai_auto_reply_store_name" varchar(255),
	"wa_auto_unarchive_on_new_message" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "merchants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "meta_api_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"launch_job_id" varchar,
	"stage" varchar(50) NOT NULL,
	"endpoint" varchar(500) NOT NULL,
	"method" varchar(10) DEFAULT 'POST' NOT NULL,
	"request_json" jsonb,
	"response_json" jsonb,
	"http_status" integer,
	"success" boolean DEFAULT false NOT NULL,
	"fbtrace_id" varchar(100),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "meta_column_presets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"name" varchar(100) NOT NULL,
	"level" varchar(20) DEFAULT 'campaign' NOT NULL,
	"columns" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "meta_sync_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"ad_account_id" varchar(100),
	"date_from" varchar(10),
	"date_to" varchar(10),
	"level" varchar(20),
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"error_message" text,
	"rows_upserted" integer DEFAULT 0,
	"started_at" timestamp DEFAULT now(),
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"type" varchar(50) NOT NULL,
	"category" varchar(20) DEFAULT 'other' NOT NULL,
	"resolvable" boolean DEFAULT false,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"order_id" varchar,
	"order_number" varchar(100),
	"read" boolean DEFAULT false,
	"resolved_at" timestamp,
	"resolved_by_user_id" varchar,
	"resolved_by_name" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "opening_balance_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"batch_number" varchar(20) NOT NULL,
	"opening_date" timestamp NOT NULL,
	"status" varchar(20) DEFAULT 'POSTED' NOT NULL,
	"reversal_of" varchar,
	"reversal_reason" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "opening_balance_lines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" varchar NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" varchar NOT NULL,
	"entity_name" varchar(255) NOT NULL,
	"balance_type" varchar(20) NOT NULL,
	"amount" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_change_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"merchant_id" varchar NOT NULL,
	"change_type" varchar(30) NOT NULL,
	"field_name" varchar(50),
	"old_value" text,
	"new_value" text,
	"reason" text,
	"actor_user_id" varchar,
	"actor_name" varchar(255),
	"actor_type" varchar(20) DEFAULT 'user' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_confirmation_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"order_id" varchar NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"channel" varchar(20),
	"old_status" varchar(50),
	"new_status" varchar(50),
	"old_tags" jsonb,
	"new_tags" jsonb,
	"response_payload" jsonb,
	"response_classification" varchar(30),
	"acting_user_id" varchar,
	"retry_count" integer,
	"queue_info" jsonb,
	"api_response" jsonb,
	"error_details" text,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"order_id" varchar NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" varchar(20) DEFAULT 'CASH' NOT NULL,
	"reference" varchar(255),
	"notes" text,
	"created_by_user_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"shopify_order_id" varchar(100),
	"order_number" varchar(100) NOT NULL,
	"customer_name" varchar(500) NOT NULL,
	"customer_email" varchar(255),
	"customer_phone" varchar(100),
	"shipping_address" text,
	"city" varchar(255),
	"province" varchar(100),
	"postal_code" varchar(255),
	"country" varchar(100) DEFAULT 'Pakistan',
	"total_amount" numeric(12, 2) NOT NULL,
	"subtotal_amount" numeric(12, 2),
	"shipping_amount" numeric(12, 2),
	"discount_amount" numeric(12, 2),
	"currency" varchar(50) DEFAULT 'PKR',
	"payment_method" varchar(255),
	"payment_status" varchar(255) DEFAULT 'pending',
	"fulfillment_status" varchar(255) DEFAULT 'unfulfilled',
	"order_status" varchar(255) DEFAULT 'pending',
	"line_items" jsonb,
	"total_quantity" integer DEFAULT 1,
	"tags" text[],
	"notes" text,
	"courier_name" varchar(255),
	"courier_tracking" varchar(255),
	"shipment_status" varchar(50) DEFAULT 'pending',
	"courier_raw_status" text,
	"courier_weight" numeric(10, 2),
	"remark" text,
	"landing_site" text,
	"referring_site" text,
	"browser_ip" varchar(100),
	"utm_source" varchar(100),
	"utm_medium" varchar(100),
	"utm_campaign" varchar(255),
	"utm_content" varchar(255),
	"utm_term" varchar(255),
	"fb_click_id" text,
	"attributed_campaign_id" varchar(100),
	"attributed_ad_id" varchar(100),
	"raw_shopify_data" jsonb,
	"raw_webhook_data" jsonb,
	"last_api_sync_at" timestamp,
	"last_webhook_at" timestamp,
	"shopify_updated_at" timestamp,
	"resolved_source" jsonb,
	"data_quality_flags" jsonb,
	"last_tracking_update" timestamp,
	"order_date" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"workflow_status" varchar(50) DEFAULT 'NEW' NOT NULL,
	"pending_reason" text,
	"pending_reason_type" varchar(50),
	"hold_until" timestamp,
	"hold_created_at" timestamp,
	"hold_created_by_user_id" varchar,
	"confirmed_at" timestamp,
	"confirmed_by_user_id" varchar,
	"cancelled_at" timestamp,
	"cancelled_by_user_id" varchar,
	"cancel_reason" text,
	"previous_workflow_status" varchar(50),
	"last_status_changed_at" timestamp,
	"last_status_changed_by_user_id" varchar,
	"item_summary" text,
	"courier_slip_url" text,
	"booking_status" varchar(50),
	"booking_error" text,
	"booked_at" timestamp,
	"fulfilled_at" timestamp,
	"fulfilled_by" varchar(255),
	"dispatched_at" timestamp,
	"delivered_at" timestamp,
	"returned_at" timestamp,
	"shopify_fulfillment_id" varchar(255),
	"prepaid_amount" numeric(12, 2) DEFAULT '0',
	"cod_remaining" numeric(12, 2),
	"cod_payment_status" varchar(20) DEFAULT 'UNPAID',
	"last_payment_at" timestamp,
	"order_source" varchar(50),
	"shop_domain" varchar(255),
	"confirmation_status" varchar(30) DEFAULT 'pending',
	"confirmation_source" varchar(20),
	"confirmation_locked" boolean DEFAULT false,
	"confirmation_locked_at" timestamp,
	"wa_confirmation_sent_at" timestamp,
	"wa_response_at" timestamp,
	"wa_response_payload" jsonb,
	"robo_response_at" timestamp,
	"conflict_detected" boolean DEFAULT false,
	"confirmation_response_count" integer DEFAULT 0,
	"wa_attempt_count" integer DEFAULT 0,
	"wa_next_attempt_at" timestamp,
	"wa_last_template_used" varchar(100),
	"wa_not_on_whatsapp" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(30) DEFAULT 'customer' NOT NULL,
	"phone" varchar(50),
	"email" varchar(255),
	"address" text,
	"tags" text[],
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "party_balances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"party_id" varchar NOT NULL,
	"balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"global_otp_required" boolean DEFAULT true NOT NULL,
	"meta_facebook_app_id" varchar,
	"meta_facebook_app_secret" varchar,
	"meta_whatsapp_embedded_signup_config_id" varchar,
	"meta_whatsapp_verify_token" varchar,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar(255) NOT NULL,
	"shopify_product_id" varchar(255) NOT NULL,
	"title" varchar(500) NOT NULL,
	"handle" varchar(500),
	"vendor" varchar(255),
	"product_type" varchar(255),
	"status" varchar(50) DEFAULT 'active',
	"image_url" text,
	"images" jsonb,
	"tags" text,
	"total_inventory" integer DEFAULT 0,
	"variants" jsonb,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"shopify_synced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"session_id" varchar,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "remarks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"content" text NOT NULL,
	"remark_type" varchar(30) DEFAULT 'general',
	"is_internal" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "robocall_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"call_id" varchar,
	"phone" varchar(50) NOT NULL,
	"amount" varchar(50),
	"voice_id" varchar(10),
	"brand_name" varchar(200),
	"order_number" varchar(100),
	"order_id" varchar,
	"source" varchar(20) DEFAULT 'manual',
	"attempt_number" integer DEFAULT 1,
	"status" varchar(50) DEFAULT 'Initiated' NOT NULL,
	"dtmf" integer,
	"error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "robocall_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"order_id" varchar NOT NULL,
	"order_number" varchar(100),
	"customer_name" varchar(500),
	"phone" varchar(50) NOT NULL,
	"amount" varchar(50),
	"brand_name" varchar(200),
	"status" varchar(20) DEFAULT 'waiting' NOT NULL,
	"reason" text,
	"scheduled_at" timestamp NOT NULL,
	"attempt_count" integer DEFAULT 0,
	"max_attempts" integer DEFAULT 3,
	"next_retry_at" timestamp,
	"last_call_result" varchar(50),
	"wa_response_arrived" boolean DEFAULT false,
	"call_id" varchar,
	"queued_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"cogs_per_unit" numeric(12, 2),
	"cogs_total" numeric(14, 2)
);
--> statement-breakpoint
CREATE TABLE "sale_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" varchar NOT NULL,
	"cash_account_id" varchar NOT NULL,
	"amount" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"customer_id" varchar,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cogs_total" numeric(14, 2),
	"gross_profit" numeric(14, 2),
	"paid_now_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"remaining" numeric(14, 2) DEFAULT '0' NOT NULL,
	"payment_mode" varchar(20) DEFAULT 'RECEIVE_NOW' NOT NULL,
	"reference_id" varchar(100),
	"date" timestamp NOT NULL,
	"notes" text,
	"completed_at" timestamp,
	"reversed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shipment_batch_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" varchar NOT NULL,
	"shipment_id" varchar,
	"order_id" varchar NOT NULL,
	"order_number" varchar(100),
	"booking_status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"booking_error" text,
	"tracking_number" varchar(100),
	"slip_url" text,
	"consignee_name" varchar(255),
	"consignee_phone" varchar(50),
	"consignee_city" varchar(100),
	"cod_amount" numeric(12, 2),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shipment_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"created_by_user_id" varchar,
	"courier_name" varchar(50) NOT NULL,
	"batch_type" varchar(20) DEFAULT 'BULK' NOT NULL,
	"status" varchar(30) DEFAULT 'CREATED' NOT NULL,
	"total_selected_count" integer DEFAULT 0,
	"success_count" integer DEFAULT 0,
	"failed_count" integer DEFAULT 0,
	"notes" text,
	"pdf_batch_path" text,
	"pdf_batch_meta" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shipment_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" varchar NOT NULL,
	"status" varchar(50) NOT NULL,
	"description" text,
	"location" varchar(255),
	"event_time" timestamp DEFAULT now(),
	"raw_data" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shipment_print_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"shipment_id" varchar,
	"order_id" varchar,
	"courier_name" varchar(50),
	"tracking_number" varchar(100),
	"print_template_version" varchar(20) DEFAULT '1.0',
	"generated_at" timestamp DEFAULT now(),
	"generated_by_user_id" varchar,
	"pdf_path" text,
	"pdf_meta" jsonb,
	"source" varchar(30) DEFAULT 'CUSTOM_TEMPLATE',
	"is_latest" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"merchant_id" varchar NOT NULL,
	"courier_name" varchar(50) NOT NULL,
	"tracking_number" varchar(100),
	"awb_number" varchar(100),
	"status" varchar(50) DEFAULT 'booked',
	"status_description" text,
	"weight" numeric(8, 2),
	"dimensions" jsonb,
	"cod_amount" numeric(12, 2),
	"cod_sent_to_courier" numeric(12, 2),
	"prepaid_at_booking" numeric(12, 2),
	"shipping_cost" numeric(10, 2),
	"estimated_delivery" timestamp,
	"actual_delivery" timestamp,
	"delivery_attempts" integer DEFAULT 0,
	"last_status_update" timestamp,
	"courier_response" jsonb,
	"loadsheet_batch_id" varchar(100),
	"loadsheet_generated_at" timestamp,
	"loadsheet_data" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shopify_import_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"shop_domain" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'QUEUED' NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"next_cursor" text,
	"current_page" integer DEFAULT 0,
	"batch_size" integer DEFAULT 100,
	"processed_count" integer DEFAULT 0,
	"created_count" integer DEFAULT 0,
	"updated_count" integer DEFAULT 0,
	"failed_count" integer DEFAULT 0,
	"total_fetched" integer DEFAULT 0,
	"last_error" text,
	"last_error_stage" varchar(30),
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shopify_stores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"shop_domain" varchar(255) NOT NULL,
	"access_token" text,
	"scopes" text,
	"is_connected" boolean DEFAULT false,
	"last_sync_at" timestamp,
	"webhook_subscriptions" jsonb,
	"webhook_status" varchar(30) DEFAULT 'NOT_REGISTERED',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shopify_webhook_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"shop_domain" varchar(255) NOT NULL,
	"topic" varchar(100) NOT NULL,
	"shopify_webhook_id" varchar(255),
	"payload_hash" varchar(64) NOT NULL,
	"processing_status" varchar(30) DEFAULT 'received' NOT NULL,
	"error_message" text,
	"received_at" timestamp DEFAULT now(),
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "stock_ledger" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"type" varchar(20) NOT NULL,
	"product_name" varchar(500) NOT NULL,
	"sku" varchar(100),
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"total_value" numeric(12, 2) NOT NULL,
	"supplier" varchar(255),
	"reference" varchar(255),
	"date" timestamp NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_receipt_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_receipt_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" numeric(12, 2) NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"allocated_extra" numeric(14, 2) DEFAULT '0',
	"final_unit_cost" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_receipts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"supplier_id" varchar NOT NULL,
	"payment_type" varchar(20) DEFAULT 'PAID_NOW' NOT NULL,
	"cash_account_id" varchar,
	"extra_costs" numeric(14, 2) DEFAULT '0',
	"items_subtotal" numeric(14, 2) NOT NULL,
	"inventory_value" numeric(14, 2) NOT NULL,
	"description" text,
	"date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"sync_type" varchar(50) NOT NULL,
	"status" varchar(30) DEFAULT 'running',
	"records_processed" integer DEFAULT 0,
	"records_failed" integer DEFAULT 0,
	"error_message" text,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "team_invites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" varchar(20) DEFAULT 'agent' NOT NULL,
	"token" varchar(64) NOT NULL,
	"token_hash" varchar(128),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"invited_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"accepted_at" timestamp,
	"accepted_by_user_id" varchar,
	"last_sent_at" timestamp,
	"send_count" integer DEFAULT 0,
	"last_email_error" text,
	CONSTRAINT "team_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"merchant_id" varchar NOT NULL,
	"role" varchar(20) DEFAULT 'agent' NOT NULL,
	"is_active" boolean DEFAULT true,
	"allowed_pages" text[],
	"invited_at" timestamp DEFAULT now(),
	"joined_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"txn_type" varchar(20) NOT NULL,
	"transfer_mode" varchar(30),
	"category" varchar(100),
	"description" text,
	"reference_id" varchar(255),
	"amount" numeric(14, 2) NOT NULL,
	"date" timestamp NOT NULL,
	"from_party_id" varchar,
	"to_party_id" varchar,
	"from_account_id" varchar,
	"to_account_id" varchar,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"reversal_of" varchar,
	"reversed_by" varchar,
	"reversed_at" timestamp,
	"reversal_reason" text
);
--> statement-breakpoint
CREATE TABLE "unmapped_courier_statuses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"courier_name" varchar(50) NOT NULL,
	"raw_status" varchar(255) NOT NULL,
	"sample_tracking_number" varchar(100),
	"occurrence_count" integer DEFAULT 1,
	"resolved" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wa_automations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"trigger_status" varchar(50) NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"message_text" text,
	"template_name" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"exclude_draft_orders" boolean DEFAULT false NOT NULL,
	"variable_order" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wa_conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"contact_phone" varchar(50) NOT NULL,
	"contact_name" varchar(255),
	"order_id" varchar,
	"order_number" varchar(100),
	"last_message" text,
	"last_message_at" timestamp DEFAULT now(),
	"unread_count" integer DEFAULT 0 NOT NULL,
	"label" varchar(50),
	"assigned_to_user_id" varchar,
	"assigned_to_name" varchar(255),
	"ai_paused" boolean DEFAULT false NOT NULL,
	"ai_paused_at" timestamp,
	"is_archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wa_failed_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"raw_event_id" varchar,
	"merchant_id" varchar,
	"event_type" varchar(30),
	"webhook_source" varchar(20),
	"payload" jsonb NOT NULL,
	"error_message" text,
	"attempt_count" integer DEFAULT 0,
	"failed_at" timestamp DEFAULT now(),
	"resolved_at" timestamp,
	"resolved_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "wa_labels" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"name" varchar(50) NOT NULL,
	"color" varchar(30) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wa_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"direction" varchar(10) DEFAULT 'inbound' NOT NULL,
	"sender_name" varchar(255),
	"text" text,
	"wa_message_id" varchar(255),
	"status" varchar(20) DEFAULT 'sent',
	"message_type" varchar(20) DEFAULT 'text',
	"media_url" text,
	"mime_type" varchar(100),
	"file_name" varchar(500),
	"reaction_emoji" varchar(10),
	"reaction_from" varchar(50),
	"reference_message_id" varchar(255),
	"link_preview_url" text,
	"link_preview_data" jsonb,
	"deleted_by_customer_at" timestamp,
	"delivered_at" timestamp,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wa_meta_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"category" varchar(50) DEFAULT 'utility' NOT NULL,
	"header_type" varchar(20) DEFAULT 'text' NOT NULL,
	"header_text" varchar(60),
	"body" text,
	"footer" varchar(60),
	"buttons" jsonb DEFAULT '[]'::jsonb,
	"status" varchar(20) DEFAULT 'approved' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wa_raw_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar,
	"event_type" varchar(30) NOT NULL,
	"wa_message_id" varchar(255),
	"from_phone" varchar(50),
	"webhook_source" varchar(20) DEFAULT 'generic',
	"payload" jsonb NOT NULL,
	"received_at" timestamp DEFAULT now(),
	"processed_at" timestamp,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "whatsapp_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"order_id" varchar,
	"wa_message_id" varchar(255) NOT NULL,
	"from_phone" varchar(50) NOT NULL,
	"message_type" varchar(50) DEFAULT 'text' NOT NULL,
	"message_body" text,
	"raw_payload" jsonb,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"workflow_status" varchar(50) NOT NULL,
	"template_name" varchar(255) DEFAULT 'status_notify' NOT NULL,
	"message_body" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workflow_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"merchant_id" varchar NOT NULL,
	"from_status" varchar(50) NOT NULL,
	"to_status" varchar(50) NOT NULL,
	"action" varchar(50) NOT NULL,
	"reason" text,
	"actor_user_id" varchar,
	"actor_name" varchar(255),
	"actor_type" varchar(20) DEFAULT 'user' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"password_hash" varchar(255),
	"role" varchar(20) DEFAULT 'USER' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"merchant_id" varchar,
	"sidebar_mode" varchar(20) DEFAULT 'advanced' NOT NULL,
	"sidebar_pinned_pages" text[],
	"setup_token" varchar(255),
	"setup_token_expires_at" timestamp,
	"password_reset_token" varchar(255),
	"password_reset_expires_at" timestamp,
	"last_login_at" timestamp,
	"last_login_device" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounting_audit_log" ADD CONSTRAINT "accounting_audit_log_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_products" ADD CONSTRAINT "accounting_products_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_settings" ADD CONSTRAINT "accounting_settings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_automation_rules" ADD CONSTRAINT "ad_automation_rules_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_matched_product_id_products_id_fk" FOREIGN KEY ("matched_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_insights" ADD CONSTRAINT "ad_insights_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_insights" ADD CONSTRAINT "ad_insights_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_launch_items" ADD CONSTRAINT "ad_launch_items_job_id_ad_launch_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ad_launch_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_launch_items" ADD CONSTRAINT "ad_launch_items_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_launch_jobs" ADD CONSTRAINT "ad_launch_jobs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_media_library" ADD CONSTRAINT "ad_media_library_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_profitability_entries" ADD CONSTRAINT "ad_profitability_entries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_profitability_entries" ADD CONSTRAINT "ad_profitability_entries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_sets" ADD CONSTRAINT "ad_sets_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_sets" ADD CONSTRAINT "ad_sets_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_sessions" ADD CONSTRAINT "agent_chat_sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insight_cache" ADD CONSTRAINT "ai_insight_cache_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_jobs" ADD CONSTRAINT "booking_jobs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_jobs" ADD CONSTRAINT "booking_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_journey_events" ADD CONSTRAINT "campaign_journey_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_job_items" ADD CONSTRAINT "cancellation_job_items_job_id_cancellation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."cancellation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_jobs" ADD CONSTRAINT "cancellation_jobs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_reconciliation" ADD CONSTRAINT "cod_reconciliation_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_reconciliation" ADD CONSTRAINT "cod_reconciliation_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_reconciliation" ADD CONSTRAINT "cod_reconciliation_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_templates" ADD CONSTRAINT "complaint_templates_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_accounts" ADD CONSTRAINT "courier_accounts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_dues" ADD CONSTRAINT "courier_dues_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_keyword_mappings" ADD CONSTRAINT "courier_keyword_mappings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_settlements" ADD CONSTRAINT "courier_settlements_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_settlements" ADD CONSTRAINT "courier_settlements_courier_party_id_parties_id_fk" FOREIGN KEY ("courier_party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_settlements" ADD CONSTRAINT "courier_settlements_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_status_mappings" ADD CONSTRAINT "courier_status_mappings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_audiences" ADD CONSTRAINT "custom_audiences_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_types" ADD CONSTRAINT "expense_types_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_lines" ADD CONSTRAINT "ledger_lines_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_sync_logs" ADD CONSTRAINT "marketing_sync_logs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_api_logs" ADD CONSTRAINT "meta_api_logs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_api_logs" ADD CONSTRAINT "meta_api_logs_launch_job_id_ad_launch_jobs_id_fk" FOREIGN KEY ("launch_job_id") REFERENCES "public"."ad_launch_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_column_presets" ADD CONSTRAINT "meta_column_presets_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_sync_runs" ADD CONSTRAINT "meta_sync_runs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balance_batches" ADD CONSTRAINT "opening_balance_batches_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balance_lines" ADD CONSTRAINT "opening_balance_lines_batch_id_opening_balance_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."opening_balance_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_change_log" ADD CONSTRAINT "order_change_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_change_log" ADD CONSTRAINT "order_change_log_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_confirmation_log" ADD CONSTRAINT "order_confirmation_log_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_confirmation_log" ADD CONSTRAINT "order_confirmation_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_balances" ADD CONSTRAINT "party_balances_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_balances" ADD CONSTRAINT "party_balances_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_session_id_agent_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remarks" ADD CONSTRAINT "remarks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robocall_logs" ADD CONSTRAINT "robocall_logs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robocall_queue" ADD CONSTRAINT "robocall_queue_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robocall_queue" ADD CONSTRAINT "robocall_queue_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_accounting_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."accounting_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_parties_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_batch_items" ADD CONSTRAINT "shipment_batch_items_batch_id_shipment_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."shipment_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_batches" ADD CONSTRAINT "shipment_batches_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_print_records" ADD CONSTRAINT "shipment_print_records_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_import_jobs" ADD CONSTRAINT "shopify_import_jobs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_stores" ADD CONSTRAINT "shopify_stores_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_webhook_events" ADD CONSTRAINT "shopify_webhook_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_stock_receipt_id_stock_receipts_id_fk" FOREIGN KEY ("stock_receipt_id") REFERENCES "public"."stock_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_product_id_accounting_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."accounting_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_supplier_id_parties_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_from_party_id_parties_id_fk" FOREIGN KEY ("from_party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_party_id_parties_id_fk" FOREIGN KEY ("to_party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_from_account_id_cash_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_id_cash_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unmapped_courier_statuses" ADD CONSTRAINT "unmapped_courier_statuses_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_automations" ADD CONSTRAINT "wa_automations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_conversations" ADD CONSTRAINT "wa_conversations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_conversations" ADD CONSTRAINT "wa_conversations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_failed_events" ADD CONSTRAINT "wa_failed_events_raw_event_id_wa_raw_events_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."wa_raw_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_labels" ADD CONSTRAINT "wa_labels_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_meta_templates" ADD CONSTRAINT "wa_meta_templates_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_responses" ADD CONSTRAINT "whatsapp_responses_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_responses" ADD CONSTRAINT "whatsapp_responses_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_audit_log" ADD CONSTRAINT "workflow_audit_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_audit_log" ADD CONSTRAINT "workflow_audit_log_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_acct_audit_merchant" ON "accounting_audit_log" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_acct_audit_type" ON "accounting_audit_log" USING btree ("merchant_id","event_type");--> statement-breakpoint
CREATE INDEX "idx_acct_audit_date" ON "accounting_audit_log" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_acct_products_merchant" ON "accounting_products" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_acct_products_name_norm" ON "accounting_products" USING btree ("merchant_id","name_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_acct_products_sku_norm" ON "accounting_products" USING btree ("merchant_id","sku_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_acct_settings_merchant" ON "accounting_settings" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_ad_accounts_merchant" ON "ad_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_ad_automation_rules_merchant" ON "ad_automation_rules" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_ad_automation_rules_enabled" ON "ad_automation_rules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_ad_campaigns_merchant" ON "ad_campaigns" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_ad_campaigns_account" ON "ad_campaigns" USING btree ("ad_account_id");--> statement-breakpoint
CREATE INDEX "idx_ad_campaigns_status" ON "ad_campaigns" USING btree ("effective_status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ad_campaigns_unique" ON "ad_campaigns" USING btree ("merchant_id","campaign_id");--> statement-breakpoint
CREATE INDEX "idx_ad_creatives_merchant" ON "ad_creatives" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_ad_creatives_campaign" ON "ad_creatives" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_ad_creatives_adset" ON "ad_creatives" USING btree ("adset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ad_creatives_unique" ON "ad_creatives" USING btree ("merchant_id","ad_id");--> statement-breakpoint
CREATE INDEX "idx_ad_insights_merchant" ON "ad_insights" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_ad_insights_date" ON "ad_insights" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_ad_insights_level" ON "ad_insights" USING btree ("level");--> statement-breakpoint
CREATE INDEX "idx_ad_insights_entity" ON "ad_insights" USING btree ("entity_id","level");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ad_insights_unique" ON "ad_insights" USING btree ("merchant_id","entity_id","entity_type","date");--> statement-breakpoint
CREATE INDEX "idx_ad_launch_items_job" ON "ad_launch_items" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_ad_launch_items_merchant" ON "ad_launch_items" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_ad_launch_merchant" ON "ad_launch_jobs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_ad_launch_status" ON "ad_launch_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ad_media_merchant" ON "ad_media_library" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_ad_profitability_merchant" ON "ad_profitability_entries" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_ad_sets_merchant" ON "ad_sets" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_ad_sets_campaign" ON "ad_sets" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ad_sets_unique" ON "ad_sets" USING btree ("merchant_id","adset_id");--> statement-breakpoint
CREATE INDEX "idx_agent_chat_sessions_merchant" ON "agent_chat_sessions" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ai_insight_cache_merchant_section" ON "ai_insight_cache" USING btree ("merchant_id","section");--> statement-breakpoint
CREATE INDEX "idx_booking_jobs_merchant" ON "booking_jobs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_booking_jobs_order" ON "booking_jobs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_booking_jobs_order_courier" ON "booking_jobs" USING btree ("order_id","courier_name");--> statement-breakpoint
CREATE INDEX "idx_journey_events_campaign" ON "campaign_journey_events" USING btree ("campaign_key","created_at");--> statement-breakpoint
CREATE INDEX "idx_journey_events_merchant" ON "campaign_journey_events" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_cancel_items_job" ON "cancellation_job_items" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_cancel_items_order" ON "cancellation_job_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_cancel_jobs_merchant" ON "cancellation_jobs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_cancel_jobs_status" ON "cancellation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_cash_accounts_merchant" ON "cash_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_cash_movements_merchant" ON "cash_movements" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_cash_movements_account" ON "cash_movements" USING btree ("cash_account_id");--> statement-breakpoint
CREATE INDEX "idx_cash_movements_date" ON "cash_movements" USING btree ("merchant_id","date");--> statement-breakpoint
CREATE INDEX "idx_cod_reconciliation_merchant" ON "cod_reconciliation" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_cod_reconciliation_status" ON "cod_reconciliation" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_complaint_templates_merchant_status" ON "complaint_templates" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "idx_complaints_merchant" ON "complaints" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_complaints_status" ON "complaints" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_complaints_ticket" ON "complaints" USING btree ("merchant_id","ticket_number");--> statement-breakpoint
CREATE INDEX "idx_courier_accounts_merchant" ON "courier_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_courier_dues_merchant" ON "courier_dues" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_courier_dues_courier" ON "courier_dues" USING btree ("merchant_id","courier_name");--> statement-breakpoint
CREATE INDEX "idx_courier_dues_status" ON "courier_dues" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "idx_ckm_merchant" ON "courier_keyword_mappings" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_courier_settlements_merchant" ON "courier_settlements" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_courier_settlements_courier" ON "courier_settlements" USING btree ("courier_party_id");--> statement-breakpoint
CREATE INDEX "idx_courier_settlements_date" ON "courier_settlements" USING btree ("merchant_id","date");--> statement-breakpoint
CREATE INDEX "idx_csm_merchant" ON "courier_status_mappings" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_csm_merchant_courier" ON "courier_status_mappings" USING btree ("merchant_id","courier_name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_csm_unique_mapping" ON "courier_status_mappings" USING btree ("merchant_id","courier_name","courier_status");--> statement-breakpoint
CREATE INDEX "idx_custom_audiences_merchant" ON "custom_audiences" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_custom_audiences_type" ON "custom_audiences" USING btree ("audience_type");--> statement-breakpoint
CREATE INDEX "idx_expense_payments_expense" ON "expense_payments" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "idx_expense_payments_merchant" ON "expense_payments" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_expense_types_merchant" ON "expense_types" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_expenses_merchant" ON "expenses" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_expenses_date" ON "expenses" USING btree ("merchant_id","date");--> statement-breakpoint
CREATE INDEX "idx_expenses_category" ON "expenses" USING btree ("merchant_id","category");--> statement-breakpoint
CREATE INDEX "idx_expenses_payment_status" ON "expenses" USING btree ("merchant_id","payment_status");--> statement-breakpoint
CREATE INDEX "idx_ledger_entries_merchant" ON "ledger_entries" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_ledger_entries_date" ON "ledger_entries" USING btree ("merchant_id","date");--> statement-breakpoint
CREATE INDEX "idx_ledger_entries_ref" ON "ledger_entries" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "idx_ll_transaction" ON "ledger_lines" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_ll_entity" ON "ledger_lines" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_marketing_sync_merchant" ON "marketing_sync_logs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_meta_api_logs_merchant" ON "meta_api_logs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_meta_api_logs_job" ON "meta_api_logs" USING btree ("launch_job_id");--> statement-breakpoint
CREATE INDEX "idx_meta_api_logs_stage" ON "meta_api_logs" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_meta_column_presets_user" ON "meta_column_presets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_meta_sync_runs_merchant" ON "meta_sync_runs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_merchant" ON "notifications" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_read" ON "notifications" USING btree ("merchant_id","read");--> statement-breakpoint
CREATE INDEX "idx_notifications_resolved" ON "notifications" USING btree ("merchant_id","resolved_at");--> statement-breakpoint
CREATE INDEX "idx_ob_batches_merchant" ON "opening_balance_batches" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_ob_batches_status" ON "opening_balance_batches" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "idx_ob_lines_batch" ON "opening_balance_lines" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_change_log_order" ON "order_change_log" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_change_log_merchant" ON "order_change_log" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_ocl_order" ON "order_confirmation_log" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_ocl_merchant" ON "order_confirmation_log" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_ocl_event_type" ON "order_confirmation_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_order_payments_order" ON "order_payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_payments_merchant" ON "order_payments" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_orders_merchant" ON "orders" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_orders_shopify_id" ON "orders" USING btree ("shopify_order_id");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("order_status");--> statement-breakpoint
CREATE INDEX "idx_orders_shipment_status" ON "orders" USING btree ("shipment_status");--> statement-breakpoint
CREATE INDEX "idx_orders_city" ON "orders" USING btree ("city");--> statement-breakpoint
CREATE INDEX "idx_orders_date" ON "orders" USING btree ("order_date");--> statement-breakpoint
CREATE INDEX "idx_orders_courier" ON "orders" USING btree ("courier_name");--> statement-breakpoint
CREATE INDEX "idx_orders_workflow_status" ON "orders" USING btree ("workflow_status");--> statement-breakpoint
CREATE INDEX "idx_orders_merchant_workflow_date" ON "orders" USING btree ("merchant_id","workflow_status","order_date");--> statement-breakpoint
CREATE INDEX "idx_orders_merchant_shipment" ON "orders" USING btree ("merchant_id","workflow_status","shipment_status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_orders_merchant_shopify_unique" ON "orders" USING btree ("merchant_id","shopify_order_id") WHERE shopify_order_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_parties_merchant" ON "parties" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_parties_type" ON "parties" USING btree ("merchant_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_party_balances_unique" ON "party_balances" USING btree ("merchant_id","party_id");--> statement-breakpoint
CREATE INDEX "idx_products_merchant" ON "products" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_products_shopify_unique" ON "products" USING btree ("merchant_id","shopify_product_id");--> statement-breakpoint
CREATE INDEX "idx_push_subscriptions_merchant" ON "push_subscriptions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_remarks_order" ON "remarks" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_robocall_logs_merchant" ON "robocall_logs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_robocall_logs_call_id" ON "robocall_logs" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "idx_robocall_logs_order_id" ON "robocall_logs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_rcq_merchant" ON "robocall_queue" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_rcq_order" ON "robocall_queue" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_rcq_status" ON "robocall_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rcq_scheduled" ON "robocall_queue" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_sale_items_sale" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "idx_sale_items_product" ON "sale_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_sale_payments_sale" ON "sale_payments" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "idx_sales_merchant" ON "sales" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_sales_status" ON "sales" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "idx_sales_date" ON "sales" USING btree ("merchant_id","date");--> statement-breakpoint
CREATE INDEX "idx_batch_items_batch" ON "shipment_batch_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_batch_items_order" ON "shipment_batch_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_shipment_batches_merchant" ON "shipment_batches" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_shipment_events_shipment" ON "shipment_events" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "idx_print_records_merchant" ON "shipment_print_records" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_print_records_shipment" ON "shipment_print_records" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "idx_shipments_order" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_shipments_merchant" ON "shipments" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_shipments_tracking" ON "shipments" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX "idx_shipments_status" ON "shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_merchant" ON "shopify_import_jobs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_status" ON "shopify_import_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_shopify_stores_merchant" ON "shopify_stores" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_events_merchant" ON "shopify_webhook_events" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_events_hash" ON "shopify_webhook_events" USING btree ("payload_hash");--> statement-breakpoint
CREATE INDEX "idx_webhook_events_webhook_id" ON "shopify_webhook_events" USING btree ("shopify_webhook_id");--> statement-breakpoint
CREATE INDEX "idx_stock_ledger_merchant" ON "stock_ledger" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_stock_ledger_type" ON "stock_ledger" USING btree ("merchant_id","type");--> statement-breakpoint
CREATE INDEX "idx_stock_ledger_date" ON "stock_ledger" USING btree ("merchant_id","date");--> statement-breakpoint
CREATE INDEX "idx_stock_receipt_items_receipt" ON "stock_receipt_items" USING btree ("stock_receipt_id");--> statement-breakpoint
CREATE INDEX "idx_stock_receipt_items_product" ON "stock_receipt_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_stock_receipts_merchant" ON "stock_receipts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_stock_receipts_date" ON "stock_receipts" USING btree ("merchant_id","date");--> statement-breakpoint
CREATE INDEX "idx_sync_logs_merchant" ON "sync_logs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_team_invites_merchant" ON "team_invites" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_team_invites_email" ON "team_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_team_invites_token" ON "team_invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_team_members_merchant" ON "team_members" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_team_members_user" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_txn_merchant" ON "transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_txn_type" ON "transactions" USING btree ("merchant_id","txn_type");--> statement-breakpoint
CREATE INDEX "idx_txn_date" ON "transactions" USING btree ("merchant_id","date");--> statement-breakpoint
CREATE INDEX "idx_txn_party_from" ON "transactions" USING btree ("from_party_id");--> statement-breakpoint
CREATE INDEX "idx_txn_party_to" ON "transactions" USING btree ("to_party_id");--> statement-breakpoint
CREATE INDEX "idx_txn_account_from" ON "transactions" USING btree ("from_account_id");--> statement-breakpoint
CREATE INDEX "idx_txn_account_to" ON "transactions" USING btree ("to_account_id");--> statement-breakpoint
CREATE INDEX "idx_txn_reversal_of" ON "transactions" USING btree ("reversal_of");--> statement-breakpoint
CREATE INDEX "idx_ucs_merchant" ON "unmapped_courier_statuses" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ucs_unique" ON "unmapped_courier_statuses" USING btree ("merchant_id","courier_name","raw_status");--> statement-breakpoint
CREATE INDEX "idx_wa_automations_merchant" ON "wa_automations" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_wa_conversations_merchant" ON "wa_conversations" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_wa_conversations_phone" ON "wa_conversations" USING btree ("merchant_id","contact_phone");--> statement-breakpoint
CREATE INDEX "idx_wa_failed_events_merchant" ON "wa_failed_events" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_wa_failed_events_failed_at" ON "wa_failed_events" USING btree ("failed_at");--> statement-breakpoint
CREATE INDEX "idx_wa_labels_merchant" ON "wa_labels" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_wa_messages_conversation" ON "wa_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_wa_messages_wa_message_id" ON "wa_messages" USING btree ("wa_message_id");--> statement-breakpoint
CREATE INDEX "idx_wa_meta_templates_merchant" ON "wa_meta_templates" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_wa_meta_templates_merchant_name_lang" ON "wa_meta_templates" USING btree ("merchant_id","name","language");--> statement-breakpoint
CREATE INDEX "idx_wa_raw_events_merchant" ON "wa_raw_events" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_wa_raw_events_status" ON "wa_raw_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_wa_raw_events_wa_message_id" ON "wa_raw_events" USING btree ("wa_message_id");--> statement-breakpoint
CREATE INDEX "idx_whatsapp_responses_merchant" ON "whatsapp_responses" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_whatsapp_responses_order" ON "whatsapp_responses" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_whatsapp_responses_phone" ON "whatsapp_responses" USING btree ("from_phone");--> statement-breakpoint
CREATE INDEX "idx_whatsapp_templates_merchant" ON "whatsapp_templates" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_whatsapp_templates_merchant_status" ON "whatsapp_templates" USING btree ("merchant_id","workflow_status");--> statement-breakpoint
CREATE INDEX "idx_audit_order" ON "workflow_audit_log" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_audit_merchant" ON "workflow_audit_log" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");