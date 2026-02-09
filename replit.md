# ShipFlow - Logistics Operations Platform

## Overview
ShipFlow is a production-grade, multi-tenant logistics operations platform designed for Shopify merchants in Pakistan. It offers an all-in-one dashboard for syncing Shopify orders, tracking courier shipments (Leopards, PostEx, TCS), managing COD reconciliation, and facilitating team collaboration. The platform is envisioned as a scalable SaaS product with robust role-based access control and merchant isolation, aiming to streamline logistics operations for e-commerce businesses.

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
- **Development**: Relaxed isolation, strict in production.

### Core Features & Data Models
- **Merchant Management**: Root tenant entity with subscription and profile.
- **Team Collaboration**: `teamMembers` for user-to-merchant links and roles.
- **Shopify Integration**: OAuth credentials and sync state.
- **Courier Management**: Per-courier API credentials with env secret fallback. Leopards uses `apiKey` + `apiSecret` (API Password). PostEx uses `apiKey` (API Token). Credentials resolved via `getCourierCredentials()` helper: DB custom creds > env secrets.
- **Order Management**: Syncs from Shopify, tracks status, allows remarks.
- **Shipment Tracking**: Records courier tracking and events.
- **COD Reconciliation**: Tracks payment settlements.
- **Onboarding Wizard**: Guides initial setup (Shopify connection, courier config, initial sync).
- **Courier Status Tracking**: Universal status normalization system converts all courier-specific statuses into 12 fixed universal statuses: BOOKED, PICKED_UP, ARRIVED_AT_ORIGIN, IN_TRANSIT, ARRIVED_AT_DESTINATION, OUT_FOR_DELIVERY, DELIVERY_ATTEMPTED, DELIVERED, DELIVERY_FAILED, RETURNED_TO_SHIPPER, RETURN_IN_TRANSIT, CANCELLED. Raw courier statuses preserved in `courier_raw_status` column for reference. Normalization via `server/services/statusNormalization.ts` with per-courier mapping tables, partial matching, keyword fallback, and final state protection (DELIVERED/RETURNED_TO_SHIPPER/CANCELLED cannot be overwritten). Status flow: Unfulfilled → Universal Status (via courier API) / CANCELLED (voided orders). Batched syncing via `trackBookedPacket` (Leopards) and `track-order` (PostEx). Credentials resolved per-merchant with env fallback. Test connectivity at `POST /api/integrations/couriers/test`.
- **Customer Data Extraction**: Priority chain: `shipping_address` > `customer` > `billing_address` > `customer.default_address` > order-level fields > `note_attributes` (last resort for PII, used directly for courier tracking: `hxs_courier_name`, `hxs_courier_tracking`).
- **Shopify Permissions Handling**: Grow plan provides full customer data access via REST API.

### API-Only Sync System (Auto-Sync)
- **Auto-Sync Scheduler** (`server/services/autoSync.ts`): Background polling every 30 seconds for new/updated orders. Per-merchant sync status tracking. Starts automatically on server boot.
- **Incremental Sync**: Uses `updated_at_min` parameter to only fetch orders changed since last sync. Quiet logging when no changes found.
- **Manual Sync**: `POST /api/integrations/shopify/sync` endpoint still available as fallback with optional `forceFullSync` body parameter.
- **Sync Status API**: `GET /api/integrations/shopify/sync-status` returns per-merchant auto-sync state (enabled, interval, running, last result with created/updated counts).
- **Live Indicator**: Orders page shows green pulsing "Live" indicator with last sync timestamp. Auto-refreshes order data when new orders arrive.
- **Data Health Dashboard**: Integrations page shows data quality metrics (% of orders with name/phone/address/city).

## External Dependencies

### Database
- PostgreSQL

### Authentication
- Replit OIDC provider

### Third-Party Integrations
- Shopify Admin API (OAuth-based)
- Leopards Courier API
- PostEx Courier API
- TCS Courier API