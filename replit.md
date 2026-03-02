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
- **Authentication**: Two-factor authentication for merchants/teams (email+password then email OTP), and OTP-only for admin. All sessions require a display name for audit trails. OTPs are sent via Resend, are 6-digit, 5-min expiry, and rate-limited. Forgot password flow: email OTP verification → new password set. "Remember this device" checkbox: checked = 7-day session, unchecked = 12-hour session. Admin sessions are always 24 hours. Registration and invite-accept default to 12 hours. Device tracking: `lastLoginDevice` (parsed from User-Agent) stored on each login and displayed on team page. Login displayName is parsed into firstName/lastName and saved to the users table on each login.

### Multi-Tenancy & Access Control
- Merchant-based data isolation with all data scoped by `merchantId`.
- Team roles: **Manager**, **Customer Support**, **Accountant**, **Logistics Manager**. Legacy `admin`/`agent` roles are mapped to Manager/Customer Support for display.
- Merchant owner is identified by matching user email to merchant email — they always have full access, cannot be role-changed, removed, or access-restricted.
- Page-level permissions enforced via `allowedPages` arrays; only the merchant owner bypasses restrictions.
- Settings pages (`/settings/*`) are restricted to merchant owner and Manager role only (sidebar + ProtectedRoute + backend).

### UI/UX Decisions
- All user-facing dates use Pakistani format `dd-MM-yyyy` (e.g., "28-02-2026") via centralized helpers.
- Settings pages are organized into a collapsible sidebar.
- Shopify-style layout for order details.

### Key Features
- **Merchant & Team Management**: Core tenant entity with subscription and profile; team invite system with role-based access. Merchant owner (Merchant-Self) cannot be removed from team. Admin panel can only suspend/unsuspend merchants, not delete them. Super Admin can impersonate any user (session swap via `originalAdminId`), manage cross-tenant teams (add/remove members, change roles, update permissions), and permanently delete user accounts. Impersonation shows a persistent amber banner with "Return to Admin" button.
- **Shopify Integration**: OAuth-based access, encrypted tokens, webhook processing for orders and fulfillments, configurable historical data import, and bi-directional write-back for order edits and status updates. Configurable per-merchant "Robo-Tags" (`roboTags` jsonb on merchants table) for order automation — tags like Confirm/Pending/Cancel are customizable via Settings > Shopify > Order Automation Tags. Defaults: `Robo-Confirm`, `Robo-Pending`, `Robo-Cancel`.
- **Courier Management**: API credentials per courier, specific handling for PostEx booking, universal status normalization, optimized courier sync scheduler with batching and parallel processing, and display of courier logged weight.
- **Order & Shipment Management**: Syncs from Shopify, tracks status, allows remarks with history tracking, and a strict 9-stage workflow transition system. Supports batch booking with Leopards and PostEx, including preview and overrides.
- **COD Reconciliation**: Tracks payment settlements, `prepaidAmount`, `codRemaining`, `codPaymentStatus`, and supports payment detail fetching from couriers and automatic settlement marking. Includes a detailed Payment Ledger.
- **Onboarding Wizard**: Guides initial setup for Shopify and courier configuration. Includes a "Configure Order Tags" step (TAGS_CONFIGURED) between Shopify connect and orders sync, so merchants set their robo-tag names before the first import. Steps: ACCOUNT_CREATED → SHOPIFY_CONNECTED → TAGS_CONFIGURED → ORDERS_SYNCED → LEOPARDS_CONNECTED → POSTEX_CONNECTED → COMPLETED.
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