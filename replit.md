# 1SOL.AI - Logistics Operations Platform

## Overview
1SOL.AI is a production-grade, multi-tenant logistics operations platform for Shopify merchants in Pakistan. It streamlines e-commerce logistics with an all-in-one dashboard for Shopify order synchronization, multi-courier shipment tracking (Leopards, PostEx, TCS), COD reconciliation, and team collaboration. The platform aims to enhance operational efficiency and profitability through a scalable SaaS model, robust role-based access control, and merchant isolation, focusing on improving the e-commerce logistics landscape in Pakistan.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: React 18 with TypeScript, Wouter, TanStack React Query, shadcn/ui (Radix UI), Tailwind CSS, and Vite.
- **Backend**: Node.js with Express.js, TypeScript (ESM), and RESTful JSON APIs with Zod validation.
- **Database**: PostgreSQL with Drizzle ORM and Drizzle Kit for migrations.
- **Authentication**: Two-factor authentication for merchants/teams (email+password then email OTP) and OTP-only for admin, using Resend for OTP delivery with rate-limiting.

### Multi-Tenancy & Access Control
- Data isolation per merchant using `merchantId` scoping.
- Role-based access control with roles like Manager, Customer Support, Accountant, and Logistics Manager. Merchant owners have full, unchangeable access, and page-level permissions are enforced.

### UI/UX Decisions
- Dates are formatted `dd-MM-yyyy`.
- Collapsible sidebar for settings.
- Shopify-like layout for order details.
- **Design System**: Inter font, clean neutral palette, muted blue primary color for CTAs, `0.375rem` border radius, flat design (no shadows, no glassmorphism), consistent visual language across all pages.
- **Specific UI Elements**: Icons use `text-muted-foreground`, badges use `variant="secondary"` or `variant="outline"`, chart colors use CSS chart tokens (`--chart-1` to `--chart-5`).

### Key Features
- **Merchant & Team Management**: Tenant management, team invites, role-based access, and Super Admin impersonation capabilities.
- **Shopify Integration**: OAuth-based access, encrypted tokens, webhook processing for orders and fulfillments, historical data import, bi-directional write-back, and configurable "Robo-Tags" for automation.
- **Courier Management**: API credential management per courier, universal status normalization, optimized sync, and display of logged weight.
- **Order & Shipment Management**: Shopify order sync, status tracking, remarks, 9-stage workflow, and batch booking.
- **COD Reconciliation**: Tracks payment settlements, `prepaidAmount`, `codRemaining`, `codPaymentStatus`, payment detail fetching, and automatic settlement marking via a Payment Ledger.
- **Onboarding Wizard**: Guides initial Shopify and courier setup.
- **Batch Import & API-Only Sync**: Asynchronous, resumable background jobs for large Shopify order imports and incremental sync.
- **Print & Logs System**: Generates native courier airway bills, batch loadsheets, and picklist PDFs.
- **CSV Export**: Client-side CSV export available on major data pages.
- **Webhook Resilience**: Immediate 200 responses, health check API, per-merchant HMAC verification.
- **Meta Ads OAuth & Ad Launcher**: One-click Facebook OAuth connect (platform-level App ID/Secret via env vars using Whautomate app 889033150817848 in Live mode, CSRF-safe state tokens), ad account/page/IG account selection, token refresh. 4-step Ad Launcher wizard with "Use Existing Post" support (4 tabs: Facebook promotable posts, Instagram media, Partner/branded content, Media Library — uses `object_story_id` for FB posts, `source_instagram_media_id` for IG), Bulk Ad Launcher with N creatives × M copy variants combination matrix, Media Library (URL + file upload to Meta), Campaign management with status toggle. Legal pages (privacy policy, terms of service, data deletion) at public routes.
- **Ads Profitability Calculator**: Tracks Facebook/Meta campaign profitability with auto-sync and financial metrics.
- **AI Marketing Intelligence**: AI-powered analytics with auto-generated insights and a conversational chat interface.
- **Universal AI Assistant**: Dedicated AI page with alerts, chat, voice I/O, and multi-language support.
- **Status Mapping Import/Export**: Custom status mappings and keyword rules for couriers via JSON.
- **Product & Inventory Management**: Syncs Shopify product data (title, variants, SKU, price, cost, inventory).
- **Accounting & Finance Module**: Double-entry accounting system with P&L, Balance Snapshot, and Cash Flow reports.
- **WhatsApp Order Notifications**: Automated WhatsApp messages via Meta Graph API on order status changes, driven by `wa_automations` rules. Features robust duplicate prevention and retry mechanisms. WhatsApp Embedded Signup allows one-click connection via Facebook Login SDK popup (with optional `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` env var for full embedded signup experience, or falls back to standard FB Login with WhatsApp scopes). Manual credential entry available as collapsible fallback.
- **Support Section**: Nav section with Dashboard (WA stats), Templates (editor, automations, message logs), Chat (WhatsApp-style agent inbox), Connection, and Robo Call (IVR testing).
- **Order Confirmation Automation System**: Decision-engine-driven confirmation flow for new orders with WhatsApp availability detection (non-WA numbers bypass directly to RoboCall), structured reattempt policy (3 WA attempts at 0h/4h/12h with escalating templates, 3 RoboCall attempts with 45-min gaps), cross-channel cancellation (WA response cancels pending robocalls and vice versa), conflict detection, booking lock, manual resolution, and activity logging. Configurable via Settings UI (template names, attempt counts, delays, retry gaps). Unified "Order Timeline" on order detail page merges confirmation events, status changes, and change log entries into a single chronological view.
- **RoboCall IVR System**: IVR call interface via BrandedSMS Pakistan, with persistent API credentials, balance check, single/bulk calls, persistent call history, DTMF response display, automated call time windows, and retry logic with exhaustion handling (moves to HOLD after max attempts).
- **WhatsApp Chat UI**: Full WhatsApp Desktop-style rebuild with PIN-gated access, conversation list, search, filters, chat panel, message status, formatting, emoji picker/reactions, label management, agent assignment, and conversation deletion.
- **Templates Tab**: "Shopify Message Templates" page with Quick Start Presets, "Your Templates" list, and a rich template editor.
- **Automations Tab**: Rules page for creating WhatsApp message automations based on order workflow status changes.
- **Loadsheet System**: Portal Loadsheet with scanning (USB barcode + camera QR) and Warehouse PWA for mobile operations (PIN auth, AWB PDF pre-generation). Scanner extracts CN from composite barcode data (CN+amount+orderId) and normalizes courier names for comparison.
- **Disconnect/Reconnect**: Both WhatsApp and RoboCall integrations support temporary disconnection (pauses sending without deleting credentials) and one-click reconnection. Backend gates in whatsapp/index.ts, confirmationTimer.ts, robocallQueue.ts, and webhookHandler.ts check `waDisconnected`/`robocallDisconnected` flags.
- **Booking Remarks**: Customizable special instructions per merchant for courier booking.
- **Booking Modal Enhancements**: Full-screen modal with editable order numbers, product thumbnails, and city autocomplete.
- **All Orders View**: Unified view of all orders with context-aware actions and bulk operations.
- **Tag Management**: Bi-directional sync of tags with Shopify, with specific coloring for Robo-tags.
- **Pipeline Action Dropdown**: Consolidates order actions contextually.
- **Agent Chat PWA**: Standalone mobile-optimized PWA for support agents, featuring universal access (email+OTP login), session management, localStorage caching, Web Push notifications, visibility-aware polling, service worker for caching, and rich media rendering.

### Database Reliability
- **Connection Pool**: Configured PostgreSQL pool (`max: 20`).
- **Pool Error Handling**: Catches unexpected disconnections.
- **Retry Logic**: `withRetry()` utility for transient errors.
- **Startup Recovery**: Delayed merchant syncs to prevent pool exhaustion.

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

## Meta Ads Integration

### OAuth Connect
- Facebook OAuth 2.0 flow via `/api/meta/oauth/url` (generates auth URL) and `/api/meta/oauth/callback` (exchanges code for long-lived token)
- Permissions: `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`
- Token exchange: short-lived → long-lived, auto-fetches ad accounts & pages
- Settings: `/settings?tab=marketing` shows "One-Click Connect" card with OAuth button

### Ad Launcher
- **Service**: `server/services/metaAdLauncher.ts` — write functions: `createCampaign`, `createAdSet` (daily/lifetime budget, bid strategy, scheduling), `createAdCreative` (single image, video, carousel formats), `createAd`, `uploadImageToMeta`, `launchAd`, `bulkLaunchAds`
- **Routes**: `POST /api/meta/launch` (single), `POST /api/meta/bulk-launch` (bulk), `GET /api/meta/launch-jobs`, `GET /api/meta/targeting-search` (interest search), `POST /api/meta/bulk-launch/:jobId/retry-failed` (retry failed items), media library CRUD at `/api/meta/media-library`
- **Frontend Pages**: `/meta/launcher` (4-step wizard with interests targeting, scheduling, video/carousel/image formats, placement controls, budget type toggle, bid strategy, ad preview), `/meta/bulk-launch` (spreadsheet-style with retry failed button), `/meta/media-library` (image management)
- **Schema**: `ad_launch_jobs` (tracks launch status), `ad_launch_items` (individual ad items), `ad_media_library` (stored creatives)
- **Sidebar**: "Meta Ads" group between Growth and Support with Launcher, Bulk Launch, Media Library items
- All ads created in PAUSED state by default for safety