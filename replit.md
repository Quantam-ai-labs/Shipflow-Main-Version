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
- **Courier Management**: Per-courier API credentials (Leopards, PostEx, TCS) with environment secret fallback, specific handling for PostEx booking parameters.
- **Order Management**: Syncs from Shopify, tracks status, and allows remarks.
- **Shipment Tracking**: Records courier tracking and events with universal status normalization.
- **COD Reconciliation**: Tracks payment settlements, including `prepaidAmount`, `codRemaining`, and `codPaymentStatus`. Payment records are immutable after booking.
- **Onboarding Wizard**: Guides initial setup including Shopify connection and courier configuration.
- **Workflow Transition System**: A 9-stage pipeline (NEW to DELIVERED/RETURN/CANCELLED) with automated transitions based on courier updates, audit logging, and final state protection. Supports Robo-tag processing for status changes and a 24h auto-move for new orders.
- **Batch Import System**: Asynchronous, resumable background jobs for large Shopify order imports, with progress tracking and error handling.
- **API-Only Sync System**: Background polling every 30 seconds for incremental Shopify order updates, with manual sync option and live sync status indicator.
- **Direct Courier Booking**: Allows batch booking of "Ready-to-Ship" orders with Leopards and PostEx, including preview, confirmation, per-order overrides, and Shopify fulfillment write-back with tracking information.
- **Print & Logs System**: Generates native courier airway bills from courier APIs (e.g., Leopards slip_link, PostEx get-invoice) and batch loadsheets, with support for single and bulk PDF generation.

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