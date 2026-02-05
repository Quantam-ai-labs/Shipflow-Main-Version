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
- **Courier Management**: API credentials for various couriers.
- **Order Management**: Syncs from Shopify, tracks status, allows remarks.
- **Shipment Tracking**: Records courier tracking and events.
- **COD Reconciliation**: Tracks payment settlements.
- **Onboarding Wizard**: Guides initial setup (Shopify connection, courier config, initial sync).
- **Courier Status Tracking**: Batched, efficient syncing of shipment statuses.
- **Customer Data Extraction**: Prioritizes `shipping_address`, then `billing_address`, `customer` object, and critically, `note_attributes` for custom checkout forms.
- **Shopify Permissions Handling**: UI indicators and guidance for required `read_orders`, `read_customers`, `read_products`, `read_fulfillments` scopes.

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