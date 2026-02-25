# ShipFlow - Logistics Operations Platform

## Overview
ShipFlow is a production-grade, multi-tenant logistics operations platform designed for Shopify merchants in Pakistan. It offers an all-in-one dashboard for syncing Shopify orders, tracking courier shipments (Leopards, PostEx, TCS), managing COD reconciliation, and facilitating team collaboration. The platform aims to streamline logistics operations for e-commerce businesses as a scalable SaaS product with robust role-based access control and merchant isolation.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui (built on Radix UI)
- **Styling**: Tailwind CSS with CSS variables (light/dark mode)
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ESM modules)
- **API Pattern**: RESTful JSON APIs with Zod validation
- **Authentication**: Replit OpenID Connect (OIDC) via Passport.js
- **Session Management**: PostgreSQL-backed sessions using connect-pg-simple

### Database
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod
- **Schema**: `shared/schema.ts` for client/server type sharing
- **Migrations**: Drizzle Kit

### Multi-Tenancy
- **Isolation**: Merchant-based, all data scoped by `merchantId`.
- **Team Structure**: Users linked to merchants via `teamMembers` table.
- **Roles**: Admin, Manager, Agent with tiered permissions.

### Core Features & Data Models
- **Merchant Management**: Root tenant entity with subscription and profile.
- **Team Collaboration**: `teamMembers` for user-to-merchant links and roles; token-based team invite system with email integration.
- **Shopify Integration**: OAuth-based credentials per merchant, encrypted access tokens, webhook processing for orders and fulfillments, and reconciliation. Merchants choose a `shopifySyncFromDate` during onboarding to control how far back Shopify data is imported; this date is stored on the merchant record and used by both the batch import job and incremental sync. Changeable later via Settings > Shopify page (`/settings/shopify`).
- **Courier Management**: Per-courier API credentials (Leopards, PostEx, TCS) with environment secret fallback, specific handling for PostEx booking parameters. Leopards parser combines "Pending" status with Reason field for granular mapping (e.g., "Pending - CONSIGNEE NOT AVAILABLE"). Unmapped courier statuses are tracked in `unmapped_courier_statuses` table with notification badge on Settings sidebar and auto-resolution when mappings are created.
- **Order Management**: Syncs from Shopify, tracks status, and allows remarks.
- **Shipment Tracking**: Records courier tracking and events with universal status normalization.
- **COD Reconciliation**: Tracks payment settlements, including `prepaidAmount`, `codRemaining`, and `codPaymentStatus`. Payment records are immutable after booking. Includes automatic courier payment sync via `POST /api/cod-reconciliation/sync-payments` which fetches payment details from Leopards (batch via getPaymentDetails) and PostEx (per-record via getPaymentStatus + getTrackingWithFinancials with 200ms rate limiting). Auto-marks records as "received" when courier confirms settlement. Schema includes detailed fee breakdown fields: transactionFee, transactionTax, reversalFee, reversalTax, upfrontPayment, reservePayment, balancePayment, courierPaymentStatus, courierSettlementDate, courierPaymentRef, courierSlipLink, lastSyncedAt. Frontend shows expandable rows with fee breakdowns and CSV export with full financial data.
- **Onboarding Wizard**: Guides initial setup including Shopify connection and courier configuration.
- **Workflow Transition System**: A 9-stage pipeline (NEW to DELIVERED/RETURN/CANCELLED) with a **strict state machine** enforcing allowed transitions. Both user and system transitions are validated against a hardcoded transition map — invalid transitions are blocked and logged. Bypass actions that skip the state machine: "revert", "admin_override", "data_repair", "courier_status_sync", "shopify_sync". Supports Robo-tag processing for status changes and a 12h auto-move for new orders. Pipeline UI includes shipment status sub-tabs for BOOKED, FULFILLED, and RETURN stages (At Origin, In Transit, Picked Up, etc.).
- **Batch Import System**: Asynchronous, resumable background jobs for large Shopify order imports, with progress tracking and error handling.
- **API-Only Sync System**: Background polling every 30 seconds for incremental Shopify order updates, with manual sync option and live sync status indicator. **Critical mapping**: Shopify `fulfillment_status=fulfilled` maps to ShipFlow `BOOKED` (not FULFILLED). In ShipFlow's pipeline, BOOKED = courier tracking added/booked, FULFILLED = courier has dispatched/picked up. The courier sync scheduler handles BOOKED→FULFILLED transitions based on actual courier dispatch status. Shopify sync only moves pre-booked orders (NEW, PENDING, HOLD, READY_TO_SHIP) to BOOKED when Shopify says fulfilled. Orders already in BOOKED or later stages are not touched by Shopify sync. Terminal states (DELIVERED, RETURN, CANCELLED) are always protected.
- **Direct Courier Booking**: Allows batch booking of "Ready-to-Ship" orders with Leopards and PostEx, including preview, confirmation, per-order overrides, and Shopify fulfillment write-back with tracking information.
- **Print & Logs System**: Generates native courier airway bills from courier APIs (e.g., Leopards slip_link, PostEx get-invoice) and batch loadsheets, with support for single and bulk PDF generation.
- **Shopify Write-Back System**: Bi-directional sync via `server/services/shopifyWriteBack.ts`:
  - Address/phone/email edits push to Shopify shipping_address
  - Order cancellation in ShipFlow cancels on Shopify
  - Workflow status changes update Shopify tags (SF-Confirmed, SF-Hold, SF-Cancelled, etc.)
  - Loop prevention via in-memory cooldown map (10s) to skip webhook echoes from our own writes
  - Bulk write-backs are serialized with 500ms delay for Shopify API rate limit compliance
- **Webhook Resilience**: All webhook endpoints respond 200 immediately before processing, preventing Shopify from removing webhooks due to timeouts. Webhook health check API and re-register UI button in Settings > Shopify page.
- **Ads Profitability Calculator** (`/marketing/profitability`): Manual campaign profitability tracking. Users create campaign entries, link them to Shopify products, enter ad spend (in USD), and the system auto-calculates order stats (total orders, dispatched, delivered) from order data within the selected date range. Computes CPA (Ad Spend / Orders × USD-to-PKR rate), Profit Margin (Sale Price - Cost Price - CPA - Delivery Charges - Packing Expense), and Net Profit. Settings (dollar rate, delivery charges, packing expense) persist in localStorage. Data stored in `ad_profitability_entries` table; stats computed dynamically from orders + products tables.
- **Settings Page Organization**: Settings section uses collapsible sidebar group with sub-pages:
  - General (`/settings`): Business Profile, Notifications, Security
  - Shopify (`/settings/shopify`): Shopify connection, sync, webhooks, data quality
  - Couriers (`/settings/couriers`): Leopards, PostEx, TCS credentials and configuration
  - Status Mapping (`/settings/status-mapping`): Courier status to workflow stage mappings
  - Marketing (`/settings/marketing`): Facebook/Meta Ads integration settings
  - The old `/integrations` route redirects to `/settings/shopify`
- **Product & Inventory Management**: Shopify product sync via `products` table. Stores product title, variants (with SKU, price, cost per item, inventory per variant), images, tags, vendor, type, and total inventory. Synced via `POST /api/products/sync` endpoint using paginated Shopify Admin API calls. Cost per item is fetched from Shopify's Inventory Items API in batches of 50 (Shopify's max per request). Products page (`/products`) shows searchable/filterable product catalog with inventory levels, variant details, and product images. Order line items display product thumbnails captured during order sync.
- **Order Detail Layout**: Shopify-style layout with Order Summary (line items with product thumbnails, pricing breakdown) in the main content area and Customer Details (name, phone, email, shipping address) in the right sidebar.
- **Accounting & Finance Module**: Comprehensive Vyapar/QuickBooks-like accounting system with double-entry ledger backbone, 19 dedicated pages under collapsible "Accounting" sidebar group with sub-sections:
  - **Overview** (`/accounting`): Dashboard with Cash in Hand, Money Coming, Money Owed, Profit, Stock Value, Working Capital summary cards + Recent Activity feed.
  - **Money In/Out** (`/accounting/money`): Two-button (Money In/Money Out) cash flow management with 5 Money Out intents (Pay Existing Expense, New Expense, Pay Party, Transfer, Courier Settlement). Transaction history table.
  - **Parties** (`/accounting/parties`): Customer/Supplier/Courier party management with balance tracking, search, and type filters.
  - **Products** (`/accounting/products`): Full product catalog with enforced unique SKU (auto-generated via SKU-XXXXXX sequence if empty), normalized name/SKU uniqueness per merchant, minimal primary form (Name, SKU, Sale Price) with collapsible Advanced section (Unit, Track Inventory toggle, Purchase Cost, Costing Method, Category, Barcode). Supports CSV/Excel bulk import with server-side validation preview and atomic batch insert. Safe soft-delete (deactivate) for products with linked transactions.
  - **Add Stock** (`/accounting/stock-receipts`): Stock receipt recording with landed cost (unit cost + extra costs), supplier linking, cash account deduction.
  - **Sell** (`/accounting/sales`): Sales recording with automatic COGS calculation based on weighted average cost, margin display.
  - **Expense History** (`/accounting/expenses`): All expenses with partial payment status tracking (paid/partial/unpaid).
  - **Needs Payment** (`/accounting/expenses-unpaid`): Unpaid expenses with inline Pay button, create unpaid expense flow.
  - **COD Receivable** (`/accounting/cod-receivable`): Delivered shipments pending COD collection from couriers.
  - **Courier Payable** (`/accounting/courier-payable`): Amounts owed to couriers for shipping services.
  - **Settlements** (`/accounting/settlements`): Courier settlement recording and reconciliation.
  - **Reports**: Profit & Loss, Balance Snapshot, Cash Flow (with recharts), Stock Report, Party Balances.
  - **Advanced** (visible in Advanced Mode): Ledger view, Trial Balance, Cash Accounts management.
  - **Settings** (`/accounting/settings`): Simple/Advanced mode toggle, financial year start, currency preferences.
  - Backend: 40+ API endpoints in `server/routes/accounting.ts` with atomic transactions, immutable ledger entries, and audit logging.
  - Database tables: `parties`, `partyBalances`, `cashAccounts`, `cashMovements`, `expenseTypes`, `expensePayments`, `accountingProducts`, `stockReceipts`, `sales`, `courierSettlements`, `ledgerEntries`, `accountingAuditLog`, `accountingSettings` - all scoped by `merchantId`.
  - Legacy pages still accessible: Financial Dashboard (`/financial-dashboard`), Expense Tracker (`/expense-tracker`), Stock Ledger (`/stock-ledger`), Courier Dues (`/courier-dues`).

## External Dependencies

### Database
- PostgreSQL

### Authentication
- Replit OIDC provider

### Third-Party Integrations
- Shopify Admin API
- Leopards Courier API
- PostEx Courier API
- TCS Courier API
- Resend (for email services)