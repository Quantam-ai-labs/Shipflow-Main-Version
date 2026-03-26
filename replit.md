# 1SOL.AI - Logistics Operations Platform

## Overview
1SOL.AI is a production-grade, multi-tenant logistics operations platform designed for Shopify merchants in Pakistan. Its primary purpose is to streamline e-commerce logistics by offering a unified dashboard for Shopify order synchronization, multi-courier shipment tracking (Leopards, PostEx, TCS), COD reconciliation, and team collaboration. The platform aims to enhance operational efficiency and profitability through a scalable SaaS model, robust role-based access control, and merchant isolation, thereby improving the e-commerce logistics landscape in Pakistan.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: React 18 with TypeScript, Wouter, TanStack React Query, shadcn/ui (Radix UI), Tailwind CSS, and Vite.
- **Backend**: Node.js with Express.js, TypeScript (ESM), and RESTful JSON APIs with Zod validation.
- **Database**: PostgreSQL with Drizzle ORM and Drizzle Kit.
- **Authentication**: Two-factor authentication (email+password then email OTP) for merchants/teams and OTP-only for admin, utilizing Resend for OTP delivery with rate-limiting.

### Multi-Tenancy & Access Control
- Data isolation is achieved using `merchantId` scoping.
- Role-based access control supports roles such as Manager, Customer Support, Accountant, and Logistics Manager, with merchant owners having unchangeable full access. Page-level permissions are enforced.

### UI/UX Decisions
- Dates are formatted `dd-MM-yyyy`.
- Features a collapsible sidebar for settings and a Shopify-like layout for order details.
- **Design System**: Uses Inter font, a clean neutral palette with a muted blue primary color for CTAs, `0.375rem` border radius, and a flat design approach for consistent visual language.
- **Specific UI Elements**: Icons use `text-muted-foreground`, badges use `variant="secondary"` or `variant="outline"`, and chart colors use CSS chart tokens (`--chart-1` to `--chart-5`).

### Key Features
- **Merchant & Team Management**: Includes tenant management, team invites, role-based access, and Super Admin impersonation.
- **Shopify Integration**: OAuth-based access with encrypted tokens, webhook processing for orders and fulfillments, historical data import, bi-directional write-back, and configurable "Robo-Tags" for automation.
- **Courier Management**: API credential management per courier, direct raw-to-stage status mapping (raw courier status → workflow stage), and optimized sync.
- **Order & Shipment Management**: Shopify order synchronization, status tracking, remarks, a 9-stage workflow, and batch booking.
- **COD Reconciliation**: Tracks payment settlements, manages `prepaidAmount`, `codRemaining`, `codPaymentStatus`, fetches payment details, and automates settlement marking via a Payment Ledger.
- **Onboarding Wizard**: Guides initial Shopify and courier setup.
- **Batch Import & API-Only Sync**: Asynchronous, resumable background jobs for large Shopify order imports and incremental synchronization.
- **Print & Logs System**: Generates native courier airway bills, custom loadsheet PDFs (landscape, with product details), and picklist PDFs. Loadsheet generation involves courier API calls to register dispatch before PDF creation.
- **CSV Export**: Client-side CSV export is available on major data pages.
- **Webhook Resilience**: Ensures immediate 200 responses, health check API, and per-merchant HMAC verification.
- **Zero-Drop Webhook Reliability (Task #108)**: All WhatsApp webhook events (both generic `/webhooks/whatsapp` and merchant-specific `/webhooks/whatsapp/:merchantId`) now follow a persist-first architecture: every message and status update is saved to `wa_raw_events` table BEFORE any processing, then handed off to `waWebhookProcessor` for async retry-safe processing. Supports all message types (text, image, audio, video, document, sticker, reaction, location, contacts, deleted). Startup recovery via `recoverPendingEvents()` picks up any events that survived a crash. Webhook health stats available at `GET /api/merchants/webhook-health` (merchant-scoped) and `GET /api/admin/webhook-health` (super-admin). New service files: `waWebhookProcessor.ts`, `waOrderConfirmation.ts`, `aiAutoReplyService.ts`, `agentChatNotificationService.ts`, `whatsappSendMessage.ts`.
- **Meta Ads Sales Launcher**: Supports SALES objective with three creative modes: Upload Image, Upload Video, and Existing Post. Offers CBO/ABO budget support, uses proper TypeScript interfaces for Meta payloads, and provides asynchronous launch with real-time progress. Includes modular services for payload building, validation, diagnostics, and launch orchestration. Features dynamic geo-targeting and a unified media library. Supports multi ad set (up to 10) and multi ad per set (up to 10) with per-ad-set targeting/budget and per-ad creative/copy. Backend handles multi-mode with campaign → ad sets → creatives/ads loop with indexed stage tracking.
- **Ads Profitability Calculator**: Tracks Facebook/Meta campaign profitability with auto-sync and financial metrics.
- **AI Marketing Intelligence**: AI-powered analytics with auto-generated insights and a conversational chat interface.
- **Universal AI Assistant**: A dedicated AI page offering alerts, chat, voice I/O, and multi-language support.
- **Status Mapping Import/Export**: Allows custom status mappings for couriers via JSON.
- **Product & Inventory Management**: Synchronizes Shopify product data (title, variants, SKU, price, cost, inventory).
- **Accounting & Finance Module**: Provides a double-entry accounting system with P&L, Balance Snapshot, and Cash Flow reports.
- **WhatsApp Order Notifications**: Automated WhatsApp messages via Meta Graph API on order status changes, driven by `wa_automations` rules with duplicate prevention and retry mechanisms. Supports WhatsApp Embedded Signup and manual credential entry.
- **Support Section**: Includes a dashboard for WA stats, templates (editor, automations, message logs), a chat agent inbox, connection management, and Robo Call (IVR testing).
- **Order Confirmation Automation System**: A decision-engine-driven flow for new orders, including WhatsApp availability detection, structured reattempt policies, cross-channel cancellation, booking lock, manual resolution, and activity logging.
- **RoboCall IVR System**: IVR call interface via BrandedSMS Pakistan, featuring persistent API credentials, balance checks, single/bulk calls, call history, DTMF response display, automated call time windows, and retry logic.
- **WhatsApp Chat UI**: A full WhatsApp Desktop-style rebuild with PIN-gated access, conversation list, search, filters, chat panel, message status, formatting, emoji picker/reactions, label management (database-backed custom labels via `wa_labels` table with CRUD API, Label Manager dialog, color picker, rename/delete cascading to conversations), agent assignment, conversation deletion, and AI handoff system with toggle button.
- **AI Human Handoff System**: AI auto-reply pauses automatically when: (1) a human agent sends a message, (2) AI classifies a message as `human_handoff`, `complaint`, `return`, or `replacement`. The `waConversations` table has `aiPaused` boolean and `aiPausedAt` timestamp. Chat header shows an "AI On"/"AI Off" toggle button. Webhook message saves include DB timeout retry logic (2s delay, single retry) to prevent message loss.
- **AI Classification System**: 6 classifications: `complaint`, `return`, `replacement`, `human_handoff`, `lead`, `general_query`. Complaint/return/replacement/handoff pause AI. Lead and general_query do not. Notifications sent for all except general_query. Auto-labeling via `CLASSIFICATION_TO_LABEL` map. Media messages get deterministic "General Queries" label.
- **Complaint Management System**: Full ticket system with `complaints` and `complaint_templates` tables. Auto-generated `TKT-XXXXX` ticket numbers (per-merchant unique, collision-retry). Status workflow: logged → in_progress → under_investigation → resolving → resolved. Status timeline with history tracking. WhatsApp customer notifications on status change with customizable templates. AI ticket lookup: when customer sends a TKT-XXXXX number in chat, AI retrieves and shares status. "File Complaint" button in chat header pre-fills from conversation context. Dedicated `/support/complaints` page with table view, status filter tabs, search, detail panel, and template management dialog. Auto-populates order details (products, delivery, tracking) when orderId provided.
- **Templates Tab**: Includes "Shopify Message Templates" page with Quick Start Presets, "Your Templates" list, and a rich template editor.
- **Automations Tab**: Rules page for creating WhatsApp message automations based on order workflow status changes.
- **Loadsheet System**: Features a Portal Loadsheet with scanning (USB barcode + camera QR) and a Warehouse PWA for mobile operations.
- **Marketing Website**: Public-facing pages with Framer Motion animations, including a landing page, pricing page with 3-tier plans, contact page, and legal pages.
- **Disconnect/Reconnect**: Both WhatsApp and RoboCall integrations support temporary disconnection and one-click reconnection, with backend flags to manage this.
- **Booking Remarks**: Customizable special instructions per merchant for courier booking.
- **Booking Modal Enhancements**: Full-screen modal with editable order numbers, product thumbnails, and city autocomplete.
- **All Orders View**: Unified view of all orders with context-aware actions and bulk operations.
- **Tag Management**: Bi-directional sync of tags with Shopify, with specific coloring for Robo-tags.
- **Pipeline Action Dropdown**: Consolidates order actions contextually.
- **Agent Chat PWA**: A standalone mobile-optimized PWA for support agents, featuring universal access, session management, localStorage caching, Web Push notifications, and rich media rendering.
- **WhatsApp Chat UX Polish (Task #106)**: Enhanced `client/src/pages/support/chat.tsx` with: (1) scroll-to-bottom FAB (ChevronDown button, appears >200px from bottom, data-testid="fab-scroll-bottom"); (2) auto-scroll only when near bottom (≤200px), so scrolled-up users aren't disrupted; (3) "↓ N new messages" sticky banner (data-testid="banner-new-messages") that appears and counts inbound messages received while scrolled up; (4) click quoted message preview → scrolls to + yellow-flash highlights original message (`data-msg-id` attribute, 1.5s highlight via `ring-2 ring-yellow-400`); (5) message right-click context menu with Reply, Copy text, and Info/timestamp (data-testid="message-context-menu"); (6) StatusTicks enhanced with Tooltip from shadcn showing exact sent/delivered/read timestamps on hover; (7) Web Audio API notification sound (oscillator-based chime) on inbound messages + mute toggle button in header (data-testid="button-sound-toggle", persisted to localStorage); (8) chat scroll area replaced from shadcn ScrollArea to native div with `overflow-y-auto` + direct `onScroll` handler for reliable scroll tracking.

### Database Reliability
- Utilizes a configured PostgreSQL connection pool (`max: 20`).
- Incorporates pool error handling to catch unexpected disconnections.
- Implements `withRetry()` utility for transient errors.
- Features startup recovery with delayed merchant syncs to prevent pool exhaustion.

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
    - RoboCall Pakistan API (robocall.pk)
    - Meta Marketing API v21.0 (ad creation, management, insights sync)