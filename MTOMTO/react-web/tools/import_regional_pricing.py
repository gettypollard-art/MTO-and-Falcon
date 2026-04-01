#!/usr/bin/env python3
"""
Import competitor pricing from scraper CSVs into Supabase `mto_regional_pricing`.

Handles two TV CSV formats:
  Format A (async/detail):  name, category, brand, price, availability, url, dispensary_name, scraped_at
  Format B (sitemap/light): name, brand, price, availability, url

Usage:
  python tools/import_regional_pricing.py \
      --csv out/tv_sitemap_products_full.csv \
      --region Portland_Metro \
      --competitor "Treasure Valley Cannabis"

Keys are loaded automatically from ../.env.local (VITE_ prefix handled).
Re-running is safe: existing records for the same competitor+region are cleared first.
"""

import os
import csv
import sys
import time
import argparse
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests as _requests
except ImportError:
    sys.exit('ERROR: Install requests:  pip install requests')


# ---------------------------------------------------------------------------
# Env loading — reads project-root .env.local so no manual export needed
# ---------------------------------------------------------------------------

def _load_env_file(path: Path):
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, val = line.partition('=')
        os.environ.setdefault(key.strip(), val.strip())


# Try both .env.local (project root) and tools/.env
_script_dir = Path(__file__).parent
_load_env_file(_script_dir.parent / '.env.local')
_load_env_file(_script_dir / '.env')

SUPABASE_URL = (
    os.environ.get('VITE_SUPABASE_URL') or
    os.environ.get('SUPABASE_URL') or ''
).rstrip('/')

SERVICE_KEY = (
    os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or
    os.environ.get('SUPABASE_ANON_KEY') or
    os.environ.get('VITE_SUPABASE_ANON_KEY') or ''
)

ALLOWED_REGIONS = {
    'Portland_Metro', 'Southern_Oregon', 'Central_Oregon',
    'Coastal_Oregon', 'Eastern_Oregon',
}

ALLOWED_CATEGORIES = {
    'Flower', 'PreRolls', 'Edibles', 'Concentrates', 'Vapes',
    'Topicals', 'Tinctures', 'CBD', 'Seeds', 'Paraphernalia',
}

BATCH_SIZE = 200   # rows per POST request


# ---------------------------------------------------------------------------
# Category inference
# ---------------------------------------------------------------------------

def infer_category(name: str, raw_cat: str = '') -> str:
    """
    Infer the mto category from the product name (most reliable for TV data)
    and the raw category field (strain/terpene info — mostly useless, but
    occasionally has keywords like 'Accessories').
    """
    n = name.lower()
    c = raw_cat.lower()

    # Vapes — check name first (most reliable)
    if any(x in n for x in [
        'vaporizer', 'all-in-one', 'all in one', 'dank tank', 'aio',
        'vape cartridge', 'vape cart', '1g vaporizers', '2g vaporizers',
    ]):
        return 'Vapes'
    if 'vap' in n and 'cartridge' in n:
        return 'Vapes'

    # Pre-rolls
    if any(x in n for x in [
        'pre-roll', 'pre roll', 'preroll', '1g pre-rolls', '2g pre-rolls',
        '5g pre-rolls', '6g pre-rolls', '7.2g pre-rolls',
    ]):
        return 'PreRolls'
    if 'pre roll' in n or 'preroll' in n:
        return 'PreRolls'

    # Edibles
    if any(x in n for x in [
        'gummi', 'gummy', 'gummies', 'edible', 'chocolate', 'candy',
        'soda', '35g edibles', '40g edibles', '20g edibles', '12g edibles',
        '26.33g edibles', 'pearls', 'cookie', 'brownie', 'drink',
    ]):
        return 'Edibles'

    # Concentrates
    if any(x in n for x in [
        'concentrate', 'dab jar', 'shatter', 'live resin', 'cured resin',
        'rosin', 'wax', 'budder', 'crumble', 'extract', 'distillate',
        'diamond', 'sugar wax', 'pull n snap', 'pull & snap',
        '1g concentrates', '2g concentrates',
    ]):
        return 'Concentrates'

    # Tinctures
    if any(x in n for x in ['tincture', '1g tinctures']):
        return 'Tinctures'

    # Topicals
    if any(x in n for x in ['topical', 'cream', 'lotion', 'balm', 'salve']):
        return 'Topicals'

    # Paraphernalia / accessories
    if any(x in n for x in ['accessori', 'glass', 'bong', 'pipe', 'grinder', 'wrap']):
        return 'Paraphernalia'
    if 'accessori' in c:
        return 'Paraphernalia'

    # CBD
    if 'cbd' in n and 'thc' not in n:
        return 'CBD'

    # Flower keywords (the name often contains the weight)
    if any(x in n for x in [
        '1oz flower', '1/2oz', '1/4oz', '1/8oz', '3.5g flower',
        '.5g flower', '1g flower', '28g', 'flower',
    ]):
        return 'Flower'

    return 'Flower'


# ---------------------------------------------------------------------------
# HTTP helpers (uses requests — SSL certs handled correctly on macOS)
# ---------------------------------------------------------------------------

def _headers() -> dict:
    return {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }


def _get(path: str, params: dict = None):
    return _requests.get(SUPABASE_URL + path, headers=_headers(), params=params)


def _post(path: str, body, prefer_repr=False):
    h = _headers()
    if prefer_repr:
        h['Prefer'] = 'return=representation'
    return _requests.post(SUPABASE_URL + path, headers=h, json=body)


def _delete(path: str, params: dict = None):
    return _requests.delete(SUPABASE_URL + path, headers=_headers(), params=params)


def check_connection() -> bool:
    """Verify Supabase is reachable and the schema exists."""
    if not SUPABASE_URL or not SERVICE_KEY:
        print('ERROR: Missing SUPABASE_URL or SERVICE_KEY. Check .env.local.')
        return False
    r = _get('/rest/v1/mto_regional_pricing', params={'limit': '1'})
    if r.status_code == 200:
        return True
    if r.status_code == 404:
        print('ERROR: Table mto_regional_pricing not found.')
        print('Run supabase/mto_pricing_schema.sql in the Supabase SQL Editor first.')
        return False
    print(f'ERROR: Supabase returned {r.status_code}: {r.text[:200]}')
    return False


# ---------------------------------------------------------------------------
# Clear existing records for this competitor+region (idempotency)
# ---------------------------------------------------------------------------

def clear_existing(region: str, competitor: str):
    r = _delete(
        '/rest/v1/mto_regional_pricing',
        params={'region': f'eq.{region}', 'competitor_name': f'eq.{competitor}'},
    )
    if r.status_code not in (200, 204):
        print(f'WARN: Could not clear existing records ({r.status_code}): {r.text[:100]}')


# ---------------------------------------------------------------------------
# CSV reading + mapping
# ---------------------------------------------------------------------------

def read_csv(path: str, competitor: str, region: str) -> list[dict]:
    rows = []
    with open(path, newline='', encoding='utf-8') as fh:
        reader = csv.DictReader(fh)
        cols = set(reader.fieldnames or [])

        has_dispensary = 'dispensary_name' in cols
        has_scraped_at = 'scraped_at' in cols
        has_category = 'category' in cols

        now_iso = datetime.now(timezone.utc).isoformat()

        for r in reader:
            name = (r.get('name') or '').strip()
            if not name:
                continue

            raw_price = (r.get('price') or '').strip()
            try:
                price = round(float(raw_price), 2)
            except Exception:
                continue  # skip rows with no valid price

            if price <= 0:
                continue

            availability = (r.get('availability') or 'InStock').strip()
            if availability not in ('InStock', ''):
                pass  # keep all — even OOS is useful market data

            raw_cat = r.get('category', '') if has_category else ''
            category = infer_category(name, raw_cat)

            comp_name = (r.get('dispensary_name') or competitor).strip() if has_dispensary else competitor
            captured = (r.get('scraped_at') or now_iso).strip() if has_scraped_at else now_iso

            rows.append({
                'product_name': name,
                'product_id': None,
                'region': region,
                'category': category,
                'competitor_name': comp_name,
                'competitor_price': price,
                'source': 'scraper',
                'captured_at': captured,
            })

    # Deduplicate exact-name duplicates per competitor+region.
    # Keep the most recent `captured_at` when duplicates are found.
    deduped: dict[tuple[str, str, str], dict] = {}
    for r in rows:
        name_key = (r.get('product_name') or '').lower()
        key = (r['competitor_name'].lower(), r['region'], name_key)
        # Use r['captured_at'] ISO to decide most recent.
        existing = deduped.get(key)
        if not existing:
            deduped[key] = r
            continue
        try:
            t_new = datetime.fromisoformat(r['captured_at'].replace('Z', '+00:00'))
        except Exception:
            t_new = datetime.now(timezone.utc)
        try:
            t_old = datetime.fromisoformat(existing['captured_at'].replace('Z', '+00:00'))
        except Exception:
            t_old = datetime.now(timezone.utc)
        if t_new >= t_old:
            deduped[key] = r

    return list(deduped.values())


# ---------------------------------------------------------------------------
# Batch insert
# ---------------------------------------------------------------------------

def insert_batch(batch: list[dict]) -> int:
    # Remove local-only keys (like product_name) before sending to Supabase
    body = []
    for row in batch:
        body.append({k: v for k, v in row.items() if k != 'product_name'})
    r = _post('/rest/v1/mto_regional_pricing', body)
    if r.status_code in (200, 201):
        return len(batch)
    print(f'  WARN insert batch: {r.status_code} {r.text[:120]}')
    return 0


def insert_all(rows: list[dict]) -> int:
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i: i + BATCH_SIZE]
        written = insert_batch(batch)
        total += written
        print(f'  Inserted {total}/{len(rows)} rows…', end='\r', flush=True)
        # tiny pause to be polite to the API
        if i + BATCH_SIZE < len(rows):
            time.sleep(0.15)
    return total


# ---------------------------------------------------------------------------
# Schema migration hint
# ---------------------------------------------------------------------------

def check_and_create_store(store_code: str, store_name: str, region: str):
    """Ensure the store exists; return store_id or None on error."""
    r = _get('/rest/v1/mto_stores', params={'code': f'eq.{store_code}', 'select': 'id'})
    if r.status_code == 200 and r.json():
        return r.json()[0]['id']
    payload = {'name': store_name, 'code': store_code, 'location': '', 'region': region}
    r2 = _post('/rest/v1/mto_stores', payload, prefer_repr=True)
    if r2.status_code in (200, 201):
        data = r2.json()
        return data[0]['id'] if data else None
    print(f'Could not create store: {r2.status_code} {r2.text[:120]}')
    return None


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description='Import scraper CSV into mto_regional_pricing (Supabase).'
    )
    parser.add_argument('--csv', required=True, help='Path to scraper output CSV')
    parser.add_argument(
        '--region', default='Portland_Metro',
        choices=sorted(ALLOWED_REGIONS),
        help='Which region to tag these prices with (default: Portland_Metro)',
    )
    parser.add_argument(
        '--competitor', default='Treasure Valley Cannabis',
        help='Fallback competitor_name when CSV lacks dispensary_name column',
    )
    parser.add_argument(
        '--no-clear', action='store_true',
        help='Skip clearing existing records (allows multi-source imports)',
    )
    args = parser.parse_args()

    # Validate
    if not os.path.exists(args.csv):
        sys.exit(f'ERROR: CSV not found: {args.csv}')

    print(f'\n── MTO Regional Pricing Import ──────────────────────')
    print(f'  CSV     : {args.csv}')
    print(f'  Region  : {args.region}')
    print(f'  Competitor: {args.competitor}')
    print(f'  Supabase: {SUPABASE_URL or "(not set)"}')
    print()

    if not check_connection():
        sys.exit(1)

    # Read CSV
    print('Reading CSV…')
    rows = read_csv(args.csv, args.competitor, args.region)
    print(f'  {len(rows)} valid rows (with price > 0)')

    if not rows:
        print('Nothing to import.')
        return

    # Show category breakdown
    by_cat: dict[str, int] = {}
    for r in rows:
        by_cat[r['category']] = by_cat.get(r['category'], 0) + 1
    print('  Category breakdown:')
    for cat, cnt in sorted(by_cat.items(), key=lambda x: -x[1]):
        print(f'    {cat:<18} {cnt}')

    # Clear existing
    if not args.no_clear:
        print(f'\nClearing existing records for "{args.competitor}" in {args.region}…')
        clear_existing(args.region, args.competitor)
        # Also clear any that were imported with the specific dispensary_name from the CSV
        unique_comps = {r['competitor_name'] for r in rows}
        for comp in unique_comps:
            if comp != args.competitor:
                clear_existing(args.region, comp)

    # Insert
    print(f'\nInserting {len(rows)} rows…')
    written = insert_all(rows)
    print(f'\n✓ Done — {written}/{len(rows)} rows imported into mto_regional_pricing.')


if __name__ == '__main__':
    main()
