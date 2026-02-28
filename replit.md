# ShipFlow - Logistics Operations Platform

## Overview
ShipFlow is a production-grade, multi-tenant logistics operations platform designed for Shopify merchants in Pakistan. It provides an all-in-one dashboard for syncing Shopify orders, tracking courier shipments (Leopards, PostEx, TCS), managing COD reconciliation, and facilitating team collaboration. The platform aims to streamline logistics operations for e-commerce businesses as a scalable SaaS product with robust role-based access control and merchant isolation.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: React 18 with TypeScript, Wouter for routing, TanStack React Query for state management, shadcn/ui (Radix UI) for UI components, Tailwind CSS for styling, and Vite for building.
- **Backend**: Node.js with Express.js, TypeScript (ESM), RESTful JSON APIs with Zod validation.
- **Database**: PostgreSQL with Drizzle ORM and Drizzle Kit for migrations.
- **Authentication**: Email/password with bcrypt, PostgreSQL-backed sessions.

### Multi-Tenancy & Access Control
- Merchant-based data isolation with all data scoped by `merchantId`.
- Team structure with `teamMembers` and roles (Admin, Manager, Agent) for tiered permissions.

### Key Features
- **Merchant Management**: Core tenant entity with subscription and profile.
- **Team Collaboration**: Invite system via email, supporting new user sign-up and existing user team joining.
- **Shopify Integration**: OAuth-based, encrypted access tokens, webhook processing for orders and fulfillments, and configurable historical data import (`shopifySyncFromDate`).
- **Courier Management**: API credentials per courier (Leopards, PostEx, TCS), specific handling for PostEx booking, and normalization of courier statuses.
- **Order & Shipment Management**: Syncs from Shopify, tracks status, allows remarks, and includes a universal status normalization for tracking events. The Pipeline page (all stages) and Shipments page have an editable Remark column — clicking opens a dialog to edit. When a remark is updated, the previous value is automatically saved as a history entry in the `remarks` table and logged in `order_change_log`, visible on the Order Detail page remarks timeline. Features an optimized courier sync scheduler with batching and parallel processing. Per-courier sync buttons on Settings > Couriers page (Leopards, PostEx, Sync All) each with their own progress bars. Shopify orders sync now runs as background job with real-time progress bar (polls `GET /api/integrations/shopify/sync-progress`). PostEx webhook receiver at `POST /webhooks/postex/status-update` requires `x-webhook-secret` header matching `POSTEX_WEBHOOK_SECRET` env var; full copy-paste config (URL + Header Key + Header Value) shown in Couriers settings. Terminal order re-check sweep runs hourly for recently-finalized orders (last 7 days). Frontend displays universal status labels with raw courier status as tooltip only.
- **COD Reconciliation**: Tracks payment settlements, `prepaidAmount`, `codRemaining`, and `codPaymentStatus`. Supports payment detail fetching from couriers and automatic marking of received settlements.
- **Onboarding Wizard**: Guides initial setup for Shopify connection and courier configuration.
- **Workflow Transition System**: A strict 9-stage state machine (NEW to DELIVERED/RETURN/CANCELLED) with validation for allowed transitions. Includes bypass actions for specific scenarios.
- **Batch Import & API-Only Sync**: Asynchronous, resumable background jobs for large Shopify order imports and an incremental sync system with background polling and manual sync options.
- **Direct Courier Booking**: Allows batch booking with Leopards and PostEx, including preview, overrides, and Shopify fulfillment write-back. Booking popup overrides (customer name, phone, address, city) are persisted back to the order record after successful booking, with audit trail in orderChangeLog.
- **Print & Logs System**: Generates native courier airway bills and batch loadsheets.
- **CSV Export**: Client-side CSV export on all major data pages (Pipeline, Shipments, Courier Dues, Products, Expense Tracker, Stock Ledger, Accounting Ledger/Transactions/Trial Balance, Team, Payment Ledger, Manage Cheques, Analytics). Shared utility at `client/src/lib/exportCsv.ts`.
- **Shopify Write-Back System**: Bi-directional sync for address/phone/email edits, order cancellations, and workflow status updates via Shopify tags. Includes rate limit compliance and webhook echo prevention.
- **Webhook Resilience**: Immediate 200 responses to prevent timeouts and a webhook health check API.
- **Ads Profitability Calculator**: Tracks Facebook/Meta campaign profitability, auto-syncs campaign data, and provides detailed financial metrics with a flexible product matching system. Includes Campaign Signal buttons (Scale/Watch/Risk) per campaign for manual decision tracking, and a Campaign Journey section below the table for action tracking, snapshot evaluation, and deterministic insights/next-move recommendations. Journey events are stored in `campaign_journey_events` table with before/after snapshots and lazy evaluation.
- **AI Marketing Intelligence**: AI-powered analytics page at `/marketing/intelligence` with auto-generated insight cards (campaign performance, return rates, spend efficiency, top cities, order trends, funnel analysis) and a conversational chat interface. Uses Replit AI Integrations (OpenAI GPT-4o) for natural language queries against real database data. All queries are read-only and merchant-scoped. Includes a Weekly Strategy Brief feature. Service: `server/services/aiInsights.ts`, routes in `server/routes/marketing.ts`, frontend: `client/src/pages/marketing/ai-insights.tsx`.
- **Universal AI Assistant**: Dedicated `/ai` page (`client/src/pages/ai-assistant.tsx`) with its own sidebar section "AI Assistant". Features: (1) Critical Alerts section showing severity-coded insight cards (critical/warning/info) from all business areas, (2) Full chat interface with `react-markdown` rendering for proper formatting, (3) Voice input via Web Speech API (`SpeechRecognition`), (4) Voice output via `SpeechSynthesis` with per-message speaker buttons, (5) Multi-language support (English/Urdu) with language selector that sets speech recognition language and adds Urdu instructions to AI system prompt. Universal chat endpoint: `POST /api/ai/chat` accepts `{ question, language }`. Chat message component: `client/src/components/ai-chat-message.tsx`.
- **Cross-Section AI Insights Banner**: Reusable `AIInsightsBanner` component (`client/src/components/ai-insights-banner.tsx`) added to Dashboard, Analytics, Pipeline, Shipments, and Accounting Overview pages. Each section has 2-3 tailored AI prompts. Endpoint: `GET /api/ai/insights/:section` (sections: dashboard, analytics, pipeline, shipments, finance). Server-side caching in `ai_insight_cache` table with 24-hour TTL — insights generate once/day, subsequent loads are instant from cache. Refresh button passes `?force=true` to bypass cache. Frontend uses `staleTime: Infinity` so no re-fetching on navigation. Collapse state persisted per section in localStorage. Full-width stacked cards with severity color coding (red=critical, amber=warning, blue=info) and trend indicators.
- **Settings Page**: Organized into a collapsible sidebar with sections for General, Shopify, Couriers, Status Mapping, and Marketing configurations.
- **Timezone-Aware Date Filtering**: All date-based queries use the merchant's timezone for accurate data representation, particularly for dashboard stats, orders, and financial reporting.
- **Product & Inventory Management**: Syncs Shopify product data (title, variants, SKU, price, cost, inventory) and displays a searchable/filterable product catalog.
- **Order Detail Layout**: Shopify-style layout with order summary and customer details.
- **Accounting & Finance Module**: A comprehensive double-entry accounting system with 19 dedicated pages for:
    - **Overview**: Dashboard with financial summaries.
    - **Money In/Out**: Cash flow management and transaction history.
    - **Parties**: Customer/Supplier/Courier management.
    - **Products**: Full product catalog with inventory tracking, bulk import, and soft-delete.
    - **Stock Management**: Stock receipt recording with landed cost.
    - **Sales**: Sales recording with automatic COGS calculation.
    - **Expenses**: Expense history, tracking unpaid expenses.
    - **Receivables/Payables**: COD receivables and courier payables.
    - **Settlements**: Courier settlement recording.
    - **Reports**: Profit & Loss, Balance Snapshot, Cash Flow, Stock Report, Party Balances.
    - **Advanced**: Ledger view, Trial Balance, Cash Accounts management.
    - **Settings**: Simple/Advanced mode toggle, financial year, currency.
    - Backend includes 40+ API endpoints with atomic transactions and immutable ledger entries.

## External Dependencies

- **Database**: PostgreSQL
- **Authentication**: Replit OIDC provider
- **Third-Party Integrations**:
    - Shopify Admin API
    - Leopards Courier API
    - PostEx Courier API
    - TCS Courier API
    - Resend (for email services)
    - OpenAI via Replit AI Integrations (GPT-4o for AI marketing insights)