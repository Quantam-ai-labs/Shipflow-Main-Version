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

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit`: Database ORM and migrations
- `@tanstack/react-query`: Client-side data fetching
- `zod`: Runtime type validation
- `passport` / `openid-client`: Authentication
- `express-session` / `connect-pg-simple`: Session management
- Radix UI primitives: Accessible UI components