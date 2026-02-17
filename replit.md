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
- **Shopify Integration**: OAuth-based credentials per merchant, encrypted access tokens, webhook processing for orders and fulfillments, and reconciliation.
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
- **Webhook Resilience**: All webhook endpoints respond 200 immediately before processing, preventing Shopify from removing webhooks due to timeouts. Webhook health check API and re-register UI button in Integrations page.

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