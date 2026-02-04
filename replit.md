# ShipFlow - Logistics Operations Platform

## Overview

ShipFlow is a production-grade, multi-tenant logistics operations platform designed for Shopify merchants in Pakistan. The platform provides an all-in-one dashboard for syncing Shopify orders, tracking courier shipments (Leopards, PostEx, TCS), managing COD reconciliation, and team collaboration. It is designed to scale as a SaaS product with role-based access control and merchant isolation.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Pattern**: RESTful JSON APIs with Zod validation
- **Authentication**: Replit OpenID Connect (OIDC) integration with Passport.js
- **Session Management**: PostgreSQL-backed sessions via connect-pg-simple

### Database Layer
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema validation
- **Schema Location**: `shared/schema.ts` for shared types between client and server
- **Migrations**: Drizzle Kit with `db:push` command

### Multi-Tenancy Design
- **Tenant Isolation**: Merchant-based isolation with all data scoped by `merchantId`
- **Team Structure**: Users belong to merchants through `teamMembers` table
- **Roles**: Admin, Manager, Agent with different permission levels
- **Demo Mode**: Relaxed tenant isolation in development, strict in production

### Key Data Models
- **Merchants**: Root tenant entity with subscription and profile data
- **Team Members**: Links users to merchants with roles
- **Shopify Stores**: OAuth credentials and sync state per merchant
- **Courier Accounts**: API credentials for Leopards, PostEx, TCS
- **Orders**: Synced from Shopify with status tracking
- **Shipments**: Courier tracking with events timeline
- **COD Reconciliation**: Payment settlement tracking

### Build Configuration
- **Development**: `tsx` for TypeScript execution with Vite dev server
- **Production**: esbuild bundles server, Vite builds client to `dist/`
- **Path Aliases**: `@/` maps to client source, `@shared/` maps to shared modules

## External Dependencies

### Database
- PostgreSQL (required, connection via `DATABASE_URL` environment variable)

### Authentication
- Replit OIDC provider for user authentication
- Session secret required (`SESSION_SECRET` environment variable)

### Third-Party Integrations (Planned)
- Shopify Admin API (OAuth-based store connection)
- Leopards Courier API
- PostEx Courier API
- TCS Courier API

## Development Mode

**Auth is currently bypassed for development.** The app uses a demo user without requiring login. This will be re-enabled once all features are working correctly.

## Recent Changes

### Onboarding Wizard (February 2026)
- Added `/onboarding` route with 3-step setup flow:
  1. Connect Shopify - supports both access tokens and legacy API key/password
  2. Setup Couriers - optional step to configure Leopards and PostEx credentials
  3. Initial Sync - imports all historical orders from Shopify

### Orders Page Enhancements
- Complete redesign with all columns: Status, Order ID, City, Name, Phone, Address, Qty, Amount, Tags, Remarks 1-4
- Month-wise filtering: Current Month, Last Month, Last 2/3 Months
- Courier filtering: Leopards, PostEx, TCS
- Universal shipment statuses: Pending, Booked, Dispatched, Arrived, Out for Delivery, Delivered, Failed, Reattempt, Returned
- Inline remark editing with 4 remark columns for team collaboration

### Backend Improvements
- `GET /api/orders` supports search, status, courier, month filters with pagination
- `PATCH /api/orders/:id/remark` for inline remark updates (tenant-isolated)
- Shopify sync extracts customer data from shipping_address with fallbacks
- Order metafields (hxs_courier_name, hxs_courier_tracking) captured during sync
- Storage layer implements proper month filtering with date range cutoffs

## Courier API Integration Plan

### Leopards Courier API

**Base URLs:**
- Staging: `https://merchantapistaging.leopardscourier.com/api/`
- Production: `https://merchantapi.leopardscourier.com/api/`

**Authentication:** POST body with `api_key` and `api_password`

**Required Secrets:**
- `LEOPARDS_API_KEY`
- `LEOPARDS_API_PASSWORD`

**Endpoints to Integrate:**

| Feature | Endpoint | Method | Description |
|---------|----------|--------|-------------|
| Get Cities | `/getAllCities/format/json/` | POST | Get all cities with origin/destination availability |
| Track Packet | `/trackBookedPacket/format/json/` | POST | Track single/multiple shipments by tracking numbers |
| Book Packet | `/bookPacket/format/json/` | POST | Create new shipment with customer, address, COD details |
| Cancel Packet | `/cancelBookedPacket/format/json/` | POST | Cancel shipment by CN numbers |
| Generate Load Sheet | `/generateLoadSheet/format/json/` | POST | Generate pickup manifest for multiple packages |
| Download Load Sheet | `/downloadLoadSheet/` | POST | Get PDF/JSON of load sheet |
| Get Payment Details | `/getPaymentDetailsByCnNumbers/format/json/` | GET | Get COD payment status by CN numbers |
| Get Shipping Charges | `/getShippingCharges/format/json/` | GET | Calculate shipping cost for package |
| Shipper Advice | `/addShipperAdvices/format/json/` | POST | Add remarks/instructions to shipments |

**Key Data Structures:**
```typescript
// Book Packet Request
{
  api_key: string,
  api_password: string,
  booked_packet_weight: number,
  booked_packet_no_piece: number,
  booked_packet_collect_amount: number, // COD amount
  booked_packet_order_id: string,
  origin_city: number, // City ID
  destination_city: number, // City ID
  shipment_name_eng: string,
  shipment_phone: string,
  shipment_address: string,
  consignment_name_eng: string, // Customer name
  consignment_phone: string,
  consignment_address: string,
  special_instructions: string,
  shipment_type_id: number // 1=Overnight, 2=Overland, 10=COD
}

// Track Packet Response
{
  track_number: string,
  booked_packet_status: string,
  booked_packet_collect_amount: number,
  destination_city_name: string,
  consignment_name_eng: string,
  activity_date: string,
  status_remarks: string,
  Tracking_Detail: Array<{Status, Activity_Date, Reason}>
}
```

### PostEx Courier API

**Base URL:** `https://api.postex.pk/services/integration/api/`

**Authentication:** Header token - `token: <API_TOKEN>`

**Required Secrets:**
- `POSTEX_API_TOKEN`

**Endpoints to Integrate:**

| Feature | Endpoint | Method | Description |
|---------|----------|--------|-------------|
| Get Cities | `/order/v2/get-operational-city` | GET | Get pickup/delivery cities |
| Get Addresses | `/order/v1/get-merchant-address` | GET | Get merchant pickup addresses |
| Create Address | `/order/v2/create-merchant-address` | POST | Add new pickup address |
| Get Order Types | `/order/v1/get-order-types` | GET | Get Normal/Reverse/Replacement types |
| Create Order | `/order/v3/create-order` | POST | Book new shipment |
| Track Order | `/order/v1/track-order/{trackingNumber}` | GET | Track single shipment |
| Bulk Track | `/order/v1/track-bulk-order` | GET | Track multiple shipments |
| Generate Load Sheet | `/order/v2/generate-load-sheet` | POST | Create pickup manifest |
| Cancel Order | `/order/v1/cancel-order` | PUT | Cancel un-booked order |
| Payment Status | `/order/v1/payment-status/{trackingNumber}` | GET | Get COD settlement status |
| Shipper Advice | `/order/v1/save-shipper-advice` | PUT | Add retry/return instructions |

**Key Data Structures:**
```typescript
// Create Order Request
{
  cityName: string,
  customerName: string,
  customerPhone: string, // Format: 03xxxxxxxxx
  deliveryAddress: string,
  invoiceDivision: number, // Split AWBs for multi-pack
  invoicePayment: number, // COD amount
  items: number, // Piece count
  orderDetail: string,
  orderRefNumber: string,
  orderType: "Normal" | "Reversed" | "Replacement",
  pickupAddressCode: string
}

// Track Order Response
{
  trackingNumber: string,
  transactionStatus: string,
  invoicePayment: number,
  customerName: string,
  cityName: string,
  transactionStatusHistory: Array<{
    transactionStatusMessage: string,
    transactionStatusMessageCode: string // 0001-0013
  }>
}

// Payment Status Response
{
  settle: boolean,
  settlementDate: string,
  upfrontPaymentDate: string,
  cprNumber_1: string
}
```

**PostEx Status Codes:**
- 0001: At Merchant's Warehouse
- 0002: Returned
- 0003: At PostEx Warehouse
- 0004: Package on Route
- 0005: Delivered
- 0006: Returned
- 0008: Delivery Under Review
- 0013: Attempt Made

### Implementation Approach

1. **Create Courier Service Layer** (`server/services/couriers/`)
   - `leopards.ts` - Leopards API client
   - `postex.ts` - PostEx API client
   - `types.ts` - Unified types for all couriers
   - `index.ts` - Factory pattern to get courier service by name

2. **Unified Courier Interface:**
```typescript
interface CourierService {
  getCities(): Promise<City[]>;
  bookShipment(data: BookingRequest): Promise<TrackingNumber>;
  trackShipment(trackingNumber: string): Promise<ShipmentStatus>;
  cancelShipment(trackingNumber: string): Promise<boolean>;
  getPaymentStatus(trackingNumber: string): Promise<PaymentStatus>;
}
```

3. **API Routes** (`server/routes.ts`)
   - `POST /api/couriers/:courier/book` - Book shipment
   - `GET /api/couriers/:courier/track/:trackingNumber` - Track shipment
   - `POST /api/couriers/:courier/cancel` - Cancel shipment
   - `GET /api/couriers/:courier/payment/:trackingNumber` - Payment status
   - `GET /api/couriers/:courier/cities` - Get available cities

4. **Database Integration:**
   - Store shipment records with tracking numbers
   - Poll for status updates (every 15 minutes)
   - Store COD payment details for reconciliation

5. **Error Handling:**
   - Retry logic for transient failures
   - Graceful degradation if courier API is down
   - Logging for debugging

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit`: Database ORM and migrations
- `@tanstack/react-query`: Client-side data fetching
- `zod`: Runtime type validation
- `passport` / `openid-client`: Authentication
- `express-session` / `connect-pg-simple`: Session management
- Radix UI primitives: Accessible UI components