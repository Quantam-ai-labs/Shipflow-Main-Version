#!/usr/bin/env bash
# =============================================================================
# PRODUCTION → DEV DATABASE SYNC  (single merchant)
# =============================================================================
#
# Copies one merchant's data from production into the dev database so you can
# test features against real orders, settings, couriers, and team members —
# without publishing or touching any production data.
#
# SETUP (one-time):
#   1. Open your deployed (production) app on Replit
#   2. Go to its Secrets panel → find DATABASE_URL → copy the value
#   3. In THIS dev environment, add a new Secret:
#        Key:   PROD_DATABASE_URL
#        Value: <paste the production DATABASE_URL here>
#
# USAGE:
#   bash scripts/sync-from-prod.sh               # syncs lala-import (default)
#   bash scripts/sync-from-prod.sh lala-import   # same, explicit slug
#
# NON-INTERACTIVE (pipe YES to skip the confirmation prompt):
#   printf 'YES\n' | bash scripts/sync-from-prod.sh
#
# WHAT GETS COPIED:
#   All orders, settings, team members, couriers, shipments, WhatsApp data,
#   accounting, Meta Ads data, etc. for the specified merchant.
#
# WHAT IS NOT COPIED (stays dev-only / platform-only):
#   sessions, admin_action_logs, platform_settings, platform_costs,
#   cost_rates, ai_usage_logs
#
# AFTER RUNNING:
#   Restart the dev server → log in → use /admin to switch to the merchant.
#
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info() { echo -e "${CYAN}[sync]${NC} $*"; }
ok()   { echo -e "${GREEN}[sync]${NC} $*"; }
warn() { echo -e "${YELLOW}[sync]${NC} $*"; }
die()  { echo -e "${RED}[sync] ERROR:${NC} $*" >&2; exit 1; }

MERCHANT_SLUG="${1:-lala-import}"

# Basic slug validation — prevent SQL injection
if [[ "$MERCHANT_SLUG" =~ [^a-zA-Z0-9_-] ]]; then
  die "Invalid merchant slug '${MERCHANT_SLUG}'. Use only letters, numbers, hyphens, and underscores."
fi

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║    Production → Development Sync                         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Prerequisites ─────────────────────────────────────────────────────────────
if [ -z "${PROD_DATABASE_URL:-}" ]; then
  die "PROD_DATABASE_URL is not set.\n\n  How to fix:\n  1. Open your deployed app on Replit → Secrets panel\n  2. Copy the DATABASE_URL value\n  3. In THIS dev environment, add Secret: PROD_DATABASE_URL=<paste>\n  4. Re-run this script"
fi
[ -z "${DATABASE_URL:-}" ] && die "DATABASE_URL is not set. Is the dev database provisioned?"
command -v psql &>/dev/null    || die "psql not found."

# ── Test connections ──────────────────────────────────────────────────────────
info "Testing connections..."
psql "$PROD_DATABASE_URL" -c "SELECT 1" -q --no-align --tuples-only >/dev/null \
  || die "Cannot connect to production. Check PROD_DATABASE_URL."
psql "$DATABASE_URL"      -c "SELECT 1" -q --no-align --tuples-only >/dev/null \
  || die "Cannot connect to dev database. Check DATABASE_URL."
ok "Both databases reachable"

# ── Find merchant in production ───────────────────────────────────────────────
info "Looking up '${MERCHANT_SLUG}' in production..."
MID=$(psql "$PROD_DATABASE_URL" -t -A \
  -c "SELECT id FROM merchants WHERE slug = '${MERCHANT_SLUG}'" 2>/dev/null || true)
[ -z "$MID" ] && die "Merchant slug '${MERCHANT_SLUG}' not found in production."
MNAME=$(psql "$PROD_DATABASE_URL" -t -A \
  -c "SELECT name FROM merchants WHERE id = '${MID}'" 2>/dev/null || true)
ok "Found: ${MNAME}  (id: ${MID})"

# ── Confirmation ──────────────────────────────────────────────────────────────
echo ""
warn "This will DELETE and re-copy all data for '${MNAME}' in dev."
warn "All other merchants in dev will NOT be touched."
echo ""
echo -n "  Type YES to continue: "
read -r CONFIRM
echo ""
[ "$CONFIRM" != "YES" ] && { echo "Aborted."; exit 0; }

# ── copy_table ────────────────────────────────────────────────────────────────
# Streams rows from prod to dev using psql COPY TO STDOUT / FROM STDIN.
# A failed copy (e.g. table not yet in dev) prints a warning and continues.
COPIED=0; SKIPPED=0

copy_table() {
  local TABLE="$1"
  local QUERY="$2"
  local CNT
  CNT=$(psql "$PROD_DATABASE_URL" -t -A \
    -c "SELECT COUNT(*) FROM (${QUERY}) _c" 2>/dev/null || echo "?")
  printf "  %-45s %6s rows  " "$TABLE" "$CNT"
  if psql "$PROD_DATABASE_URL" -c "COPY (${QUERY}) TO STDOUT" 2>/dev/null \
     | psql "$DATABASE_URL"    -c "COPY ${TABLE} FROM STDIN" 2>/dev/null; then
    echo "OK"
    COPIED=$((COPIED + 1))
  else
    echo "[skipped — not in dev schema yet]"
    SKIPPED=$((SKIPPED + 1))
  fi
}

# ── Step 1: Delete existing merchant from dev (CASCADE cleans all children) ───
info "Removing existing '${MERCHANT_SLUG}' data from dev..."
psql "$DATABASE_URL" -c "DELETE FROM merchants WHERE id = '${MID}';" -q \
  || die "Failed to delete merchant from dev."
ok "Cleared"
echo ""

# ── Step 2: Copy all tables (parents before children for FK safety) ───────────
info "Copying ${MNAME} data from production..."
echo ""

M="merchant_id = '${MID}'"

# ── Root ──────────────────────────────────────────────────────────────────────
copy_table merchants \
  "SELECT * FROM merchants WHERE id = '${MID}'"

# ── Level 1 — direct merchant_id, no inter-merchant FK deps ──────────────────
copy_table team_members               "SELECT * FROM team_members WHERE ${M}"
copy_table team_invites               "SELECT * FROM team_invites WHERE ${M}"
copy_table shopify_stores             "SELECT * FROM shopify_stores WHERE ${M}"
copy_table courier_accounts           "SELECT * FROM courier_accounts WHERE ${M}"
copy_table whatsapp_templates         "SELECT * FROM whatsapp_templates WHERE ${M}"
copy_table wa_meta_templates          "SELECT * FROM wa_meta_templates WHERE ${M}"
copy_table wa_automations             "SELECT * FROM wa_automations WHERE ${M}"
copy_table wa_labels                  "SELECT * FROM wa_labels WHERE ${M}"
copy_table push_subscriptions         "SELECT * FROM push_subscriptions WHERE ${M}"
copy_table courier_status_mappings    "SELECT * FROM courier_status_mappings WHERE ${M}"
copy_table unmapped_courier_statuses  "SELECT * FROM unmapped_courier_statuses WHERE ${M}"
copy_table courier_keyword_mappings   "SELECT * FROM courier_keyword_mappings WHERE ${M}"
copy_table expense_types              "SELECT * FROM expense_types WHERE ${M}"
copy_table accounting_products        "SELECT * FROM accounting_products WHERE ${M}"
copy_table products                   "SELECT * FROM products WHERE ${M}"
copy_table parties                    "SELECT * FROM parties WHERE ${M}"
copy_table cash_accounts              "SELECT * FROM cash_accounts WHERE ${M}"
copy_table ad_accounts                "SELECT * FROM ad_accounts WHERE ${M}"
copy_table meta_column_presets        "SELECT * FROM meta_column_presets WHERE ${M}"
copy_table ad_media_library           "SELECT * FROM ad_media_library WHERE ${M}"
copy_table custom_audiences           "SELECT * FROM custom_audiences WHERE ${M}"
copy_table ad_automation_rules        "SELECT * FROM ad_automation_rules WHERE ${M}"
copy_table accounting_settings        "SELECT * FROM accounting_settings WHERE ${M}"
copy_table agent_chat_sessions        "SELECT * FROM agent_chat_sessions WHERE ${M}"
copy_table whatsapp_responses         "SELECT * FROM whatsapp_responses WHERE ${M}"
copy_table ai_insight_cache           "SELECT * FROM ai_insight_cache WHERE ${M}"
copy_table marketing_sync_logs        "SELECT * FROM marketing_sync_logs WHERE ${M}"
copy_table meta_sync_runs             "SELECT * FROM meta_sync_runs WHERE ${M}"
copy_table robocall_logs              "SELECT * FROM robocall_logs WHERE ${M}"
copy_table notifications              "SELECT * FROM notifications WHERE ${M}"
copy_table meta_api_logs              "SELECT * FROM meta_api_logs WHERE ${M}"
copy_table sync_logs                  "SELECT * FROM sync_logs WHERE ${M}"
copy_table booking_jobs               "SELECT * FROM booking_jobs WHERE ${M}"
copy_table shopify_webhook_events     "SELECT * FROM shopify_webhook_events WHERE ${M}"
copy_table shopify_import_jobs        "SELECT * FROM shopify_import_jobs WHERE ${M}"
copy_table complaint_templates        "SELECT * FROM complaint_templates WHERE ${M}"

# ── Level 2 — direct merchant_id + depends on level-1 tables ─────────────────
copy_table orders                     "SELECT * FROM orders WHERE ${M}"
copy_table wa_conversations           "SELECT * FROM wa_conversations WHERE ${M}"
copy_table shipments                  "SELECT * FROM shipments WHERE ${M}"
copy_table shipment_batches           "SELECT * FROM shipment_batches WHERE ${M}"
copy_table cancellation_jobs          "SELECT * FROM cancellation_jobs WHERE ${M}"
copy_table stock_receipts             "SELECT * FROM stock_receipts WHERE ${M}"
copy_table sales                      "SELECT * FROM sales WHERE ${M}"
copy_table transactions               "SELECT * FROM transactions WHERE ${M}"
copy_table opening_balance_batches    "SELECT * FROM opening_balance_batches WHERE ${M}"
copy_table ad_campaigns               "SELECT * FROM ad_campaigns WHERE ${M}"
copy_table ad_sets                    "SELECT * FROM ad_sets WHERE ${M}"
copy_table ad_creatives               "SELECT * FROM ad_creatives WHERE ${M}"
copy_table ad_insights                "SELECT * FROM ad_insights WHERE ${M}"
copy_table ad_launch_jobs             "SELECT * FROM ad_launch_jobs WHERE ${M}"
copy_table expenses                   "SELECT * FROM expenses WHERE ${M}"
copy_table stock_ledger               "SELECT * FROM stock_ledger WHERE ${M}"
copy_table courier_dues               "SELECT * FROM courier_dues WHERE ${M}"
copy_table party_balances             "SELECT * FROM party_balances WHERE ${M}"
copy_table cash_movements             "SELECT * FROM cash_movements WHERE ${M}"
copy_table expense_payments           "SELECT * FROM expense_payments WHERE ${M}"
copy_table cod_reconciliation         "SELECT * FROM cod_reconciliation WHERE ${M}"
copy_table courier_settlements        "SELECT * FROM courier_settlements WHERE ${M}"
copy_table ledger_entries             "SELECT * FROM ledger_entries WHERE ${M}"
copy_table accounting_audit_log       "SELECT * FROM accounting_audit_log WHERE ${M}"
copy_table order_payments             "SELECT * FROM order_payments WHERE ${M}"
copy_table order_confirmation_log     "SELECT * FROM order_confirmation_log WHERE ${M}"
copy_table shipment_print_records     "SELECT * FROM shipment_print_records WHERE ${M}"
copy_table robocall_queue             "SELECT * FROM robocall_queue WHERE ${M}"
copy_table campaign_journey_events    "SELECT * FROM campaign_journey_events WHERE ${M}"
copy_table ad_profitability_entries   "SELECT * FROM ad_profitability_entries WHERE ${M}"
copy_table complaints                 "SELECT * FROM complaints WHERE ${M}"
copy_table wa_raw_events              "SELECT * FROM wa_raw_events WHERE ${M}"

# ── Level 3 — refs level-2 / child tables (use JOIN where no merchant_id) ─────
copy_table workflow_audit_log \
  "SELECT * FROM workflow_audit_log WHERE ${M}"
copy_table order_change_log \
  "SELECT * FROM order_change_log WHERE ${M}"
copy_table ad_launch_items \
  "SELECT * FROM ad_launch_items WHERE ${M}"

# Child tables: no direct merchant_id column — filter via parent JOIN
copy_table wa_messages \
  "SELECT m.* FROM wa_messages m JOIN wa_conversations c ON m.conversation_id = c.id WHERE c.merchant_id = '${MID}'"
copy_table shipment_events \
  "SELECT e.* FROM shipment_events e JOIN shipments s ON e.shipment_id = s.id WHERE s.merchant_id = '${MID}'"
copy_table shipment_batch_items \
  "SELECT i.* FROM shipment_batch_items i JOIN shipment_batches b ON i.batch_id = b.id WHERE b.merchant_id = '${MID}'"
copy_table cancellation_job_items \
  "SELECT i.* FROM cancellation_job_items i JOIN cancellation_jobs j ON i.job_id = j.id WHERE j.merchant_id = '${MID}'"
copy_table stock_receipt_items \
  "SELECT i.* FROM stock_receipt_items i JOIN stock_receipts r ON i.stock_receipt_id = r.id WHERE r.merchant_id = '${MID}'"
copy_table sale_items \
  "SELECT i.* FROM sale_items i JOIN sales s ON i.sale_id = s.id WHERE s.merchant_id = '${MID}'"
copy_table sale_payments \
  "SELECT p.* FROM sale_payments p JOIN sales s ON p.sale_id = s.id WHERE s.merchant_id = '${MID}'"
copy_table ledger_lines \
  "SELECT l.* FROM ledger_lines l JOIN transactions t ON l.transaction_id = t.id WHERE t.merchant_id = '${MID}'"
copy_table opening_balance_lines \
  "SELECT l.* FROM opening_balance_lines l JOIN opening_balance_batches b ON l.batch_id = b.id WHERE b.merchant_id = '${MID}'"
copy_table remarks \
  "SELECT r.* FROM remarks r JOIN orders o ON r.order_id = o.id WHERE o.merchant_id = '${MID}'"
copy_table wa_failed_events \
  "SELECT * FROM wa_failed_events WHERE merchant_id = '${MID}'"

echo ""

# ── Sanity check ──────────────────────────────────────────────────────────────
info "Sanity check..."
ORDER_COUNT=$(psql "$DATABASE_URL" -t -A \
  -c "SELECT COUNT(*) FROM orders WHERE merchant_id = '${MID}'" 2>/dev/null || echo "0")
if [ "${ORDER_COUNT}" -eq 0 ]; then
  warn "0 orders found for ${MNAME} in dev after sync."
  warn "The merchant may have no orders, or something went wrong — re-run the script."
fi
ok "Orders in dev for ${MNAME}: ${ORDER_COUNT}"

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   ✓  Sync complete!                                      ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
ok "Merchant : ${MNAME}"
ok "Tables   : ${COPIED} copied, ${SKIPPED} skipped"
ok "Orders   : ${ORDER_COUNT}"
echo ""
ok "What's next:"
echo "  1. Restart the dev server (click Run or restart the workflow)"
echo "  2. Log in → use /admin to impersonate the ${MNAME} account"
echo ""
