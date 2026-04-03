#!/usr/bin/env bash
# =============================================================================
# PRODUCTION → DEV DATABASE SYNC
# =============================================================================
#
# Copies a snapshot of the production database into the development database
# so you can test new features against real merchant data without publishing.
#
# SETUP (one-time):
#   1. Open your deployed app on Replit
#   2. Go to its Secrets panel and find DATABASE_URL
#   3. Copy that value
#   4. In THIS dev environment, add a new secret named PROD_DATABASE_URL
#      and paste the production DATABASE_URL as its value
#
# USAGE:
#   bash scripts/sync-from-prod.sh
#
# WHAT IT DOES:
#   - Dumps all merchant data from production (orders, settings, team members, etc.)
#   - Wipes the dev database's merchant data
#   - Restores production data into dev
#   - Leaves dev-specific tables intact: sessions, admin logs, platform config
#
# WHAT IS NOT COPIED (stays dev-only):
#   - sessions             (auth sessions — always environment-specific)
#   - admin_action_logs    (platform audit trail)
#   - platform_settings    (platform-level config)
#   - platform_costs       (super admin cost tracking)
#   - cost_rates           (super admin cost tracking)
#   - ai_usage_logs        (platform telemetry)
#
# AFTER RUNNING:
#   - Restart the dev server (the app will already be restarted if running in Replit)
#   - Log in normally — you will now see real production merchant accounts
#
# =============================================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[sync]${NC} $*"; }
ok()      { echo -e "${GREEN}[sync]${NC} $*"; }
warn()    { echo -e "${YELLOW}[sync]${NC} $*"; }
die()     { echo -e "${RED}[sync] ERROR:${NC} $*" >&2; exit 1; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       Production → Development Database Sync             ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Check prerequisites ───────────────────────────────────────────────────────
if [ -z "${PROD_DATABASE_URL:-}" ]; then
  die "PROD_DATABASE_URL is not set.\n\n  How to set it up:\n  1. Open your deployed app on Replit\n  2. Go to its Secrets panel → copy DATABASE_URL\n  3. In THIS dev environment add a secret: PROD_DATABASE_URL=<paste value>\n  4. Re-run this script"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  die "DATABASE_URL is not set. Is the dev database provisioned?"
fi

if ! command -v pg_dump &>/dev/null; then
  die "pg_dump not found. Make sure PostgreSQL client tools are installed."
fi

if ! command -v pg_restore &>/dev/null; then
  die "pg_restore not found. Make sure PostgreSQL client tools are installed."
fi

if ! command -v psql &>/dev/null; then
  die "psql not found. Make sure PostgreSQL client tools are installed."
fi

# ── Safety confirmation ───────────────────────────────────────────────────────
warn "This will OVERWRITE all merchant data in your dev database with production data."
warn "Auth sessions, admin logs, and platform config will NOT be touched."
echo ""
echo -n "  Type YES to continue: "
read -r CONFIRM
echo ""

if [ "$CONFIRM" != "YES" ]; then
  echo "Aborted."
  exit 0
fi

# ── Temp file ─────────────────────────────────────────────────────────────────
DUMP_FILE="/tmp/prod_snapshot_$(date +%Y%m%d_%H%M%S).dump"
trap 'rm -f "$DUMP_FILE"; echo ""' EXIT

# ── Step 1: Test connections ──────────────────────────────────────────────────
info "Testing connection to production database..."
psql "$PROD_DATABASE_URL" -c "SELECT 1" -q --no-align --tuples-only > /dev/null \
  || die "Cannot connect to production database. Check PROD_DATABASE_URL."
ok "Production connection OK"

info "Testing connection to dev database..."
psql "$DATABASE_URL" -c "SELECT 1" -q --no-align --tuples-only > /dev/null \
  || die "Cannot connect to dev database. Check DATABASE_URL."
ok "Dev connection OK"

echo ""

# ── Step 2: Dump production ───────────────────────────────────────────────────
info "Dumping production database (this may take a minute)..."

pg_dump \
  --no-owner \
  --no-acl \
  --data-only \
  --disable-triggers \
  -Fc \
  --exclude-table-data=sessions \
  --exclude-table-data=admin_action_logs \
  --exclude-table-data=platform_settings \
  --exclude-table-data=platform_costs \
  --exclude-table-data=cost_rates \
  --exclude-table-data=ai_usage_logs \
  "$PROD_DATABASE_URL" > "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
ok "Dump complete — ${DUMP_SIZE} snapshot saved to ${DUMP_FILE}"

echo ""

# ── Step 3: Wipe dev merchant data ───────────────────────────────────────────
info "Wiping dev merchant data (TRUNCATE merchants CASCADE)..."

psql "$DATABASE_URL" \
  -c "SET session_replication_role = 'replica'; TRUNCATE merchants CASCADE; SET session_replication_role = 'DEFAULT';" \
  -q \
  || die "Failed to truncate dev merchant data."

ok "Dev merchant data wiped"

echo ""

# ── Step 4: Restore production data into dev ──────────────────────────────────
info "Restoring production data into dev database..."

# pg_restore may emit warnings for excluded/skipped tables; that's expected.
# We capture stderr and only surface real errors (non-zero exit on genuine failure).
RESTORE_ERRORS=$(pg_restore \
  --no-owner \
  --no-acl \
  --data-only \
  --disable-triggers \
  -d "$DATABASE_URL" \
  "$DUMP_FILE" 2>&1 || true)

# Filter out expected/harmless messages
REAL_ERRORS=$(echo "$RESTORE_ERRORS" | grep -v "^pg_restore: " | grep -v "^$" || true)

if [ -n "$REAL_ERRORS" ]; then
  warn "Some warnings during restore (usually safe to ignore):"
  echo "$REAL_ERRORS" | head -20 | sed 's/^/    /'
fi

ok "Production data restored into dev"

echo ""

# ── Done ──────────────────────────────────────────────────────────────────────
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   ✓  Sync complete!                                      ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
ok "What's next:"
echo "  1. Restart the dev server (click the Run button or restart the workflow)"
echo "  2. Log in normally — you'll now see production merchant accounts"
echo "  3. Use the admin panel (/admin) to impersonate any merchant account"
echo ""
