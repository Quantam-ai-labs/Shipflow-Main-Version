# 1SOL.AI - Logistics Operations Platform

## Overview
1SOL.AI is a production-grade, multi-tenant logistics operations platform designed for Shopify merchants in Pakistan. Its primary purpose is to streamline e-commerce logistics by providing an all-in-one dashboard for Shopify order synchronization, multi-courier shipment tracking (Leopards, PostEx, TCS), COD reconciliation, and team collaboration. The platform aims to enhance operational efficiency and profitability through a scalable SaaS model with robust role-based access control and merchant isolation.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: React 18 with TypeScript, Wouter, TanStack React Query, shadcn/ui (Radix UI), Tailwind CSS, and Vite.
- **Backend**: Node.js with Express.js, TypeScript (ESM), and RESTful JSON APIs with Zod validation.
- **Database**: PostgreSQL with Drizzle ORM and Drizzle Kit for migrations.
- **Authentication**: Two-factor authentication for merchants/teams (email+password then email OTP) and OTP-only for admin, utilizing Resend for OTP delivery with rate-limiting. Sessions vary by user type and "remember device" preference. Device tracking and display name parsing are included for audit trails.

### Multi-Tenancy & Access Control
- Data is isolated per merchant using `merchantId` scoping.
- Role-based access control includes Manager, Customer Support, Accountant, and Logistics Manager. Merchant owners have full, unchangeable access. Page-level permissions are enforced, with settings pages restricted to merchant owners and Managers.

### UI/UX Decisions
- Dates are formatted `dd-MM-yyyy` (Pakistani standard).
- Settings feature a collapsible sidebar.
- Order details adopt a Shopify-like layout.

### Design System (UI Overhaul — Completed)
- **Font**: Inter (Google Fonts), system fallback stack.
- **Theme Variables**: Clean neutral palette defined in `client/src/index.css`. Light: pure white bg, near-white cards, light borders. Dark: deep bg (`220 10% 6%`), dark cards, subtle borders.
- **Primary Color**: Muted blue (`220 60% 50%` light / `220 60% 55%` dark) — used sparingly for CTAs only.
- **Border Radius**: `0.375rem` (6px) for a crisp feel.
- **Shadows**: None (`0 0 #0000`) — flat design throughout.
- **No Glassmorphism**: No `backdrop-blur`, no frosted glass effects anywhere. Header uses solid `bg-background`.
- **Icon Colors**: All decorative stat card icons use `text-muted-foreground`. Semantic indicators (trend up/down, success/error, severity) retain meaningful colors.
- **Badges**: Use `variant="secondary"` or `variant="outline"` instead of hardcoded colored backgrounds.
- **Chart Colors**: Use CSS chart tokens (`--chart-1` through `--chart-5`) instead of hardcoded Tailwind colors.
- **Consistency**: Same visual language across all pages — dashboard, pipeline, chat, AI, settings, accounting, marketing.

### Key Features
- **Merchant & Team Management**: Core tenant management, team invites, and role-based access. Super Admin functionalities include impersonation, cross-tenant team management, and user deletion.
- **Shopify Integration**: OAuth-based access, encrypted tokens, webhook processing for orders and fulfillments, historical data import, bi-directional write-back, and configurable "Robo-Tags" for order automation.
- **Courier Management**: API credential management per courier, specific handling for PostEx booking, universal status normalization, optimized courier sync, and display of logged weight. Booking is restricted if courier accounts are not configured.
- **Order & Shipment Management**: Shopify order synchronization, status tracking, remarks with history, and a strict 9-stage workflow transition system. Supports batch booking with Leopards and PostEx.
- **COD Reconciliation**: Tracks payment settlements, `prepaidAmount`, `codRemaining`, `codPaymentStatus`, and supports payment detail fetching and automatic settlement marking. Includes a detailed Payment Ledger.
- **Onboarding Wizard**: Guides initial setup for Shopify and courier configurations, including a "Configure Order Tags" step before initial order import.
- **Batch Import & API-Only Sync**: Asynchronous, resumable background jobs for large Shopify order imports and incremental sync.
- **Print & Logs System**: Generates native courier airway bills and batch loadsheets. Includes a picklist PDF generation feature aggregating line items from selected orders.
- **CSV Export**: Client-side CSV export available on all major data pages.
- **Webhook Resilience**: Immediate 200 responses, webhook health check API, and per-merchant HMAC verification using DB-stored `shopifyAppClientSecret` (with env var fallback). Debug endpoint at `GET /api/shopify/webhooks/debug`.
- **Ads Profitability Calculator**: Tracks Facebook/Meta campaign profitability, auto-syncs campaign data, and provides financial metrics with product matching and campaign journey tracking.
- **AI Marketing Intelligence**: AI-powered analytics with auto-generated insights and a conversational chat interface.
- **Universal AI Assistant**: Dedicated AI page with alerts, chat, voice input/output, and multi-language support. Insights are cached server-side.
- **Status Mapping Import/Export**: Allows importing and exporting custom status mappings and keyword rules for couriers via JSON files.
- **Product & Inventory Management**: Syncs Shopify product data (title, variants, SKU, price, cost, inventory) and displays a searchable catalog.
- **Accounting & Finance Module**: A comprehensive double-entry accounting system covering various financial aspects, including P&L, Balance Snapshot, and Cash Flow reports.
- **WhatsApp Order Notifications**: Sends automated WhatsApp messages to customers via Meta Graph API upon order status changes. Driven exclusively by the `wa_automations` system — no hardcoded template defaults. Each automation rule specifies the template name, message text, trigger status, and optional delay. Template parameters are built by looking up the Meta template body from `wa_meta_templates`, counting `{{N}}` placeholders, and mapping order variables (name, order_number, items, order_total, etc.) positionally. Logs all send attempts (with automationId/title) in `orderChangeLog`. Failed messages can be retried via `POST /api/whatsapp-logs/:logId/retry`. Credentials (Phone Number ID, Access Token, WABA ID) are stored per-merchant in the DB; env vars serve as fallback. The old `whatsapp_templates` table and hardcoded defaults (order_confirmation_2, order_updates) have been removed from active code.
- **Support Section**: A dedicated nav section with 4 pages — Dashboard (WA stats + activity feed), Templates (three-tab page: Templates + Automations + Message Logs), Chat (WhatsApp-style agent inbox), and Connection (redirects to Settings > WhatsApp). WhatsApp settings are now on the Settings page under a dedicated WhatsApp tab.
- **WhatsApp Chat UI**: Full WhatsApp Desktop-style rebuild at `/support/chat`. Features: PIN-gated access, dark theme (#111b21), left sidebar with conversation list (avatar initials, unread badges, label chips, assigned agent, order number, timestamp), search by name/phone/order, label filter pills (All, Unread, New, Open, Pending, Resolved, Spam, Sales, Urgent), right chat panel with WhatsApp wallpaper pattern, green outbound bubbles (#005c4b) and dark inbound bubbles (#202c33), message status ticks (sent/delivered/read), WhatsApp text formatting rendering (*bold*, _italic_, ~strikethrough~, \`code\`), emoji picker with 8 categories + search + recent, emoji reactions on inbound messages via Meta API, button reply messages shown as pills, date group headers, conversation label management, agent assignment from team members, conversation delete. Webhook handler parses all message types: text, button, interactive, reaction, image, sticker, document, audio, video, location, contacts. Unread count increments on inbound, resets when conversation selected. Messages without matching orders are still saved to inbox.
- **Templates Tab**: "Shopify Message Templates" page with Quick Start Presets grid (4 presets), flat "Your Templates" list with APPROVED badges and delete, and a full-page rich template editor (Header/Body/Footer/Buttons collapsible sections + live preview panel). Templates stored in `wa_meta_templates` table.
- **Automations Tab**: Automation rules page where users create rules that fire WhatsApp messages when order workflow statuses change. Create Automation dialog with Title/Description/Trigger (workflow statuses)/Delay/Message Text/Template dropdown. Automation cards show toggle/edit/delete. Rules stored in `wa_automations` table and executed in `sendOrderStatusWhatsApp`.
- **Loadsheet System**: A two-interface system for shipment handover manifest generation: a Portal Loadsheet with scanning capabilities and a Warehouse PWA for mobile-optimized warehouse operations, including PIN authentication and AWB PDF pre-generation.
- **Booking Remarks**: Customizable special instructions per merchant, used during courier booking.
- **Booking Modal Enhancements**: Full-screen modal with editable order numbers, product thumbnails, and keyboard-navigable city autocomplete.
- **All Orders View**: A unified view displaying all orders regardless of their workflow status, with context-aware actions and bulk operations.
- **Tag Management**: Bi-directional synchronization of tags with Shopify, displaying all tags with specific coloring for Robo-tags.
- **Pipeline Action Dropdown**: Consolidates various order actions into a dropdown menu, context-aware based on order status.

### Database Reliability
- **Connection Pool**: Configured PostgreSQL pool with `max: 20` connections and appropriate timeouts.
- **Pool Error Handling**: Catches unexpected disconnections on idle clients.
- **Retry Logic**: `withRetry()` utility for transient database operation errors.
- **Startup Recovery**: Delayed merchant syncs to prevent pool exhaustion during server startup.

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