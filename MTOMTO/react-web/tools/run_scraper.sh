#!/usr/bin/env bash
set -euo pipefail

# Portable runner for the OLCC→Dutchie scraper.
# Usage (from repo root):
#   bash react-web/tools/run_scraper.sh --sqlite react-web/out/oregon_cannabis.db --csv react-web/out/oregon_prices.csv
# Or cd into react-web and run:
#   bash tools/run_scraper.sh --sqlite out/oregon_cannabis.db --csv out/oregon_prices.csv

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# default outputs
OUT_SQLITE="$ROOT_DIR/out/oregon_cannabis.db"
OUT_CSV="$ROOT_DIR/out/oregon_prices.csv"
DELAY=2

show_help(){
  cat <<EOF
Usage: $0 [--sqlite PATH] [--csv PATH] [--delay N]
Runs the OLCC→Dutchie scraper using an isolated Python venv.

Options:
  --sqlite PATH   Path to output sqlite DB (default: $OUT_SQLITE)
  --csv PATH      Path to output CSV (default: $OUT_CSV)
  --delay N       Seconds to sleep between requests (default: $DELAY)
  -h|--help       Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sqlite) OUT_SQLITE="$2"; shift 2 ;;
    --csv) OUT_CSV="$2"; shift 2 ;;
    --delay) DELAY="$2"; shift 2 ;;
    --olcc-url) OLCC_URL="$2"; shift 2 ;;
    -h|--help) show_help; exit 0 ;;
    *) echo "Unknown arg: $1"; show_help; exit 2 ;;
  esac
done

mkdir -p "$(dirname "$OUT_SQLITE")"
mkdir -p "$(dirname "$OUT_CSV")"

VENV_DIR="$SCRIPT_DIR/.venv"
PY_BIN="$VENV_DIR/bin/python"

if [[ ! -x "$PY_BIN" ]]; then
  echo "Creating venv in $VENV_DIR..."
  python3 -m venv "$VENV_DIR"
fi

echo "Activating venv..."
source "$VENV_DIR/bin/activate"

REQ="$SCRIPT_DIR/requirements.txt"
if [[ ! -f "$REQ" ]]; then
  echo "Missing requirements.txt at $REQ" >&2
  exit 1
fi

echo "Installing Python requirements... (this may take a moment)"
pip install --upgrade pip >/dev/null
pip install -r "$REQ"

echo "Installing Playwright browsers..."
python -m playwright install chromium >/dev/null

echo "Running scraper..."
if [[ -z "${OLCC_URL-}" ]]; then
  python "$SCRIPT_DIR/olcc_dutchie_scraper.py" --sqlite "$OUT_SQLITE" --csv "$OUT_CSV" --delay "$DELAY"
else
  python "$SCRIPT_DIR/olcc_dutchie_scraper.py" --sqlite "$OUT_SQLITE" --csv "$OUT_CSV" --delay "$DELAY" --olcc-url "$OLCC_URL"
fi

echo "Done. Outputs:"
echo "  sqlite -> $OUT_SQLITE"
echo "  csv    -> $OUT_CSV"
