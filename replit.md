# 1SOL.AI - Logistics Operations Platform

## Overview
1SOL.AI is a production-grade, multi-tenant logistics operations platform for Shopify merchants in Pakistan. It offers an all-in-one dashboard to sync Shopify orders, track courier shipments (Leopards, PostEx, TCS), manage COD reconciliation, and facilitate team collaboration. The platform aims to streamline e-commerce logistics as a scalable SaaS product with robust role-based access control and merchant isolation, enhancing operational efficiency and profitability.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: React 18 with TypeScript, Wouter, TanStack React Query, shadcn/ui (Radix UI), Tailwind CSS, and Vite.
- **Backend**: Node.js with Express.js, TypeScript (ESM), and RESTful JSON APIs with Zod validation.
- **Database**: PostgreSQL with Drizzle ORM and Drizzle Kit for migrations.
- **Authentication**: Two-factor authentication for merchants/teams (email+password then email OTP), and OTP-only for admin. All sessions require a display name for audit trails and expire after 24 hours. OTPs are sent via Resend, are 6-digit, 5-min expiry, and rate-limited.

### Multi-Tenancy & Access Control
- Merchant-based data isolation with all data scoped by `merchantId`.
- Team structure with `teamMembers` and roles (Admin, Manager, Agent) for tiered permissions.
- Page-level permissions are enforced via `allowedPages` arrays, with Admins having full access.

### UI/UX Decisions
- All user-facing dates use Pakistani format `dd-MM-yyyy` (e.g., "28-02-2026") via centralized helpers.
- Settings pages are organized into a collapsible sidebar.
- Shopify-style layout for order details.

### Key Features
- **Merchant & Team Management**: Core tenant entity with subscription and profile; team invite system with role-based access.
- **Shopify Integration**: OAuth-based access, encrypted tokens, webhook processing for orders and fulfillments, configurable historical data import, and bi-directional write-back for order edits and status updates.
- **Courier Management**: API credentials per courier, specific handling for PostEx booking, universal status normalization, optimized courier sync scheduler with batching and parallel processing, and display of courier logged weight.
- **Order & Shipment Management**: Syncs from Shopify, tracks status, allows remarks with history tracking, and a strict 9-stage workflow transition system. Supports batch booking with Leopards and PostEx, including preview and overrides.
- **COD Reconciliation**: Tracks payment settlements, `prepaidAmount`, `codRemaining`, `codPaymentStatus`, and supports payment detail fetching from couriers and automatic settlement marking. Includes a detailed Payment Ledger.
- **Onboarding Wizard**: Guides initial setup for Shopify and courier configuration.
- **Batch Import & API-Only Sync**: Asynchronous, resumable background jobs for large Shopify order imports and incremental sync.
- **Print & Logs System**: Generates native courier airway bills and batch loadsheets.
- **CSV Export**: Client-side CSV export on all major data pages.
- **Webhook Resilience**: Immediate 200 responses and webhook health check API.
- **Ads Profitability Calculator**: Tracks Facebook/Meta campaign profitability, auto-syncs campaign data, and provides detailed financial metrics with a product matching system and campaign journey tracking.
- **AI Marketing Intelligence**: AI-powered analytics page with auto-generated insight cards (performance, return rates, spend efficiency, trends) and a conversational chat interface using OpenAI via Replit AI Integrations. Includes a Weekly Strategy Brief.
- **Universal AI Assistant**: Dedicated `/ai` page with critical alerts, full chat interface, voice input/output, and multi-language support (English/Urdu). Insights are cached server-side with a 24-hour TTL and displayed in a cross-section banner across various pages.
- **Status Mapping Import/Export**: Functionality to export and import custom status mappings and keyword rules for couriers via JSON files.
- **Product & Inventory Management**: Syncs Shopify product data (title, variants, SKU, price, cost, inventory) and displays a searchable catalog.
- **Accounting & Finance Module**: A comprehensive double-entry accounting system across 19 dedicated pages, covering overview, money in/out, parties, products, stock management, sales, expenses, receivables/payables, settlements, and various reports (P&L, Balance Snapshot, Cash Flow).

## External Dependencies

- **Database**: PostgreSQL
- **Authentication**: Replit OIDC provider
- **Third-Party Integrations**:
    - Shopify Admin API
    - Leopards Courier API
    - PostEx Courier API
    - TCS Courier API
    - Resend (for email services)
    - OpenAI via Replit AI Integrations (GPT-4o)