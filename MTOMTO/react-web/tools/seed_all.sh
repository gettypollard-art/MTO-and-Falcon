#!/usr/bin/env bash
# seed_all.sh — One-shot data import for MTO Pricing
#
# Runs from the tools/ directory (or the project root).
# Loads .env.local automatically — no manual key export needed.
#
# Steps:
#   1. Load .env.local   (keys)
#   2. Check Supabase connection
#   3. Import products (→ mto_products) via import_csv_to_supabase.py
#   4. Import competitor pricing (→ mto_regional_pricing) from async CSV
#   5. Import competitor pricing from full sitemap CSV
#
# Usage:
#   cd react-web
#   bash tools/seed_all.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env.local"
VENV="$SCRIPT_DIR/.venv/bin/python3"

# ── Load env ───────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  echo "Loading $ENV_FILE…"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "WARNING: $ENV_FILE not found. Ensure SUPABASE_URL and SERVICE_KEY are exported."
fi

# Map VITE_ prefix names for Python scripts that expect bare names
export SUPABASE_URL="${SUPABASE_URL:-$VITE_SUPABASE_URL}"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$VITE_SUPABASE_ANON_KEY}"
# SERVICE_ROLE key stays as-is (already exported from .env.local)

echo ""
echo "══════════════════════════════════════════════════════"
echo "  MTO Full Data Seed"
echo "══════════════════════════════════════════════════════"
echo "  URL : $SUPABASE_URL"
echo ""

PYTHON="$VENV"
if [ ! -f "$PYTHON" ]; then
  PYTHON="python3"
fi

OUT="$PROJECT_DIR/out"

# ── Step 3: Seed your own products (mto_products) ──────────
# Uses tv_async_200.csv as the product catalog with store-code tv.
# The scraper CSV price is used as unit_cost; the DB trigger computes
# pretax_price = cost × markup  and  final_price = pretax × 1.20.
echo "── Step 1: Import products → mto_products ────────────"
"$PYTHON" "$SCRIPT_DIR/import_csv_to_supabase.py" \
  --csv "$OUT/tv_async_200.csv" \
  --store-code tv \
  --store-name "Treasure Valley Cannabis"
echo ""

# ── Step 4 & 5: Competitor pricing (mto_regional_pricing) ──
# 4a. 200-row async CSV (has timestamps → freshness weighting works)
echo "── Step 2a: Import competitor pricing (async 200) ────"
"$PYTHON" "$SCRIPT_DIR/import_regional_pricing.py" \
  --csv "$OUT/tv_async_200.csv" \
  --region Portland_Metro \
  --competitor "Treasure Valley Cannabis" \
  --no-clear
echo ""

# 4b. Full sitemap CSV (13 K rows — full catalog)
echo "── Step 2b: Import competitor pricing (sitemap full) ─"
"$PYTHON" "$SCRIPT_DIR/import_regional_pricing.py" \
  --csv "$OUT/tv_sitemap_products_full.csv" \
  --region Portland_Metro \
  --competitor "Treasure Valley Cannabis | Sitemap"
echo ""

echo "══════════════════════════════════════════════════════"
echo "  All done. Start the app with:  cd react-web && npm run dev"
echo "══════════════════════════════════════════════════════"
