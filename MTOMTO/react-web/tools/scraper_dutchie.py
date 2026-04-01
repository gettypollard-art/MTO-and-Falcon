#!/usr/bin/env python3
"""
MTO Dutchie Multi-Store Scraper
Scrapes ~28 Oregon dispensaries across all regions via Playwright stealth.

Usage:
  python tools/scraper_dutchie.py                          # full run, upload to Supabase
  python tools/scraper_dutchie.py --output out/dutchie.json
  python tools/scraper_dutchie.py --no-upload --output out/dutchie.json
  python tools/scraper_dutchie.py --store oregrown         # single store by slug
  python tools/scraper_dutchie.py --limit 5               # first 5 stores only
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

# ── .env loader ───────────────────────────────────────────────────────────────

def _load_dotenv():
    here = Path(__file__).parent
    for candidate in [here / ".env", here.parent / ".env"]:
        if candidate.exists():
            with candidate.open() as fh:
                for line in fh:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, _, v = line.partition("=")
                    k = k.strip(); v = v.strip().strip('"').strip("'")
                    if k and k not in os.environ:
                        os.environ[k] = v
            break

_load_dotenv()

# ── Store list ────────────────────────────────────────────────────────────────
# Format: (name, city, region, dutchie_slug, url_type)
#   url_type: "dispensary" → dutchie.com/dispensary/SLUG  (default)
#             "stores"     → dutchie.com/stores/SLUG
# Regions: Portland_Metro | Southern_Oregon | Central_Oregon | Coastal_Oregon | Eastern_Oregon

STORES = [
    # Portland Metro
    ("Oregrown Portland",        "Portland",     "Portland_Metro",  "oregrown-portland",              "dispensary"),
    ("Mr. Nice Guy Portland",    "Portland",     "Portland_Metro",  "mr-nice-guy-portland",           "dispensary"),
    ("Cookies Halsey",           "Portland",     "Portland_Metro",  "cookies-halsey",                 "dispensary"),
    ("Preserve Oregon",          "Portland",     "Portland_Metro",  "preserve-oregon",                "dispensary"),
    ("Nectar Portland Division", "Portland",     "Portland_Metro",  "nectar-portland-division",       "dispensary"),
    ("Happy Leaf Portland",      "Portland",     "Portland_Metro",  "happy-leaf1",                    "dispensary"),

    # Willamette Valley — Salem / Corvallis
    ("Salem Organics",           "Salem",        "Portland_Metro",  "salem-organics",                 "dispensary"),
    ("West Salem Cannabis",      "Salem",        "Portland_Metro",  "west-salem-cannabis1",           "dispensary"),
    ("Top Crop Corvallis",       "Corvallis",    "Portland_Metro",  "top-crop-corvallis",             "dispensary"),
    ("OG Collective Corvallis",  "Corvallis",    "Portland_Metro",  "og-collective-corvallis",        "dispensary"),

    # Eugene
    ("Eugene OG",                "Eugene",       "Portland_Metro",  "eugeneog",                       "dispensary"),
    ("Going Green Eugene",       "Eugene",       "Portland_Metro",  "going-green-eugene",             "dispensary"),
    ("Jamaica Joel's",           "Eugene",       "Portland_Metro",  "jamaica-joels",                  "dispensary"),

    # Central Oregon — Bend
    ("Oregrown Bend",            "Bend",         "Central_Oregon",  "oregrown",                       "dispensary"),
    ("The Herb Center Bend",     "Bend",         "Central_Oregon",  "the-herb-center",                "dispensary"),
    ("Cannabend",                "Bend",         "Central_Oregon",  "cannabend",                      "dispensary"),
    ("Substance Bend",           "Bend",         "Central_Oregon",  "substance-empire",               "dispensary"),

    # Southern Oregon
    ("Nectar Grants Pass",       "Grants Pass",  "Southern_Oregon", "nectar-grants-pass",             "dispensary"),
    ("Oregon Farmacy Medford",   "Medford",      "Southern_Oregon", "oregon-farmacy",                 "stores"),
    ("Oregon Grown Cannabis",    "Medford",      "Southern_Oregon", "oregon-grown-cannabis1",         "dispensary"),
    ("Smiles Cannabis Roseburg", "Roseburg",     "Southern_Oregon", "smiles-cannabis",                "dispensary"),

    # Oregon Coast
    ("The Medication Station",   "Newport",      "Coastal_Oregon",  "the-medication-station-newport", "dispensary"),
    ("T.E.R.P. Collective",      "Lincoln City", "Coastal_Oregon",  "terp-collective",                "dispensary"),
    ("Smooth Roots Astoria",     "Astoria",      "Coastal_Oregon",  "smooth-roots-astoria",           "dispensary"),
    ("Pioneer Cannabis Co.",     "Coos Bay",     "Coastal_Oregon",  "pioneer-cannabis-co-coos-bay",   "dispensary"),

    # Eastern Oregon
    ("Nectar Ontario",           "Ontario",      "Eastern_Oregon",  "nectar-ontario-1st-st",          "dispensary"),
    ("Top Crop Ontario",         "Ontario",      "Eastern_Oregon",  "top-crop1",                      "dispensary"),
]

# ── Scraper ───────────────────────────────────────────────────────────────────

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def scrape_store(slug: str, name: str, city: str, region: str, stealth: Stealth, url_type: str = "dispensary") -> list[dict]:
    url = f"https://dutchie.com/{url_type}/{slug}"
    products: list[dict] = []
    captured_ids: set = set()

    def on_response(resp):
        if "dutchie.com" in resp.url and "FilteredProducts" in resp.url:
            try:
                items = resp.json().get("data", {}).get("filteredProducts", {}).get("products", [])
                for item in items:
                    pid = item.get("_id") or item.get("id")
                    if pid and pid not in captured_ids:
                        captured_ids.add(pid)
                        products.append(item)
            except Exception:
                pass

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--disable-blink-features=AutomationControlled"])
        ctx = browser.new_context(user_agent=UA, viewport={"width": 1280, "height": 800})
        ctx.on("response", on_response)
        pg = ctx.new_page()
        stealth.apply_stealth_sync(pg)
        try:
            pg.goto(url, timeout=60000, wait_until="domcontentloaded")
            pg.wait_for_timeout(10000)
            # scroll to trigger any lazy-loaded categories
            pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            pg.wait_for_timeout(5000)
        except Exception as e:
            print(f"    page error: {e}")
        finally:
            browser.close()

    rows = []
    scraped_at = datetime.now(timezone.utc).isoformat()
    for item in products:
        item_name  = (item.get("Name") or "").strip()
        if not item_name:
            continue
        brand      = (item.get("brandName") or "").strip()
        category   = (item.get("type") or "").strip()
        options    = item.get("Options") or []
        prices     = item.get("recPrices") or item.get("Prices") or []
        status     = item.get("Status") or ""
        availability = "InStock" if str(status).lower() in ("active", "instock", "in stock") else "OutOfStock"

        if options and prices:
            for opt, price in zip(options, prices):
                opt_slug = str(opt).replace(" ", "_").replace("/", "-") if opt else ""
                rows.append({
                    "dispensary_name": name,
                    "dispensary_city": city,
                    "dispensary_region": region,
                    "dispensary_url":  f"https://dutchie.com/{url_type}/{slug}",
                    "product_url":     f"https://dutchie.com/{url_type}/{slug}/products/{item.get('_id','')}/{opt_slug}",
                    "name":            item_name,
                    "brand":           brand,
                    "category":        category,
                    "option":          opt,
                    "price":           price,
                    "availability":    availability,
                    "scraped_at":      scraped_at,
                })
        else:
            all_prices = prices if isinstance(prices, list) else []
            price = all_prices[0] if all_prices else None
            rows.append({
                "dispensary_name": name,
                "dispensary_city": city,
                "dispensary_region": region,
                "dispensary_url":  f"https://dutchie.com/dispensary/{slug}",
                "product_url":     f"https://dutchie.com/dispensary/{slug}/products/{item.get('_id','')}",
                "name":            item_name,
                "brand":           brand,
                "category":        category,
                "option":          "",
                "price":           price,
                "availability":    availability,
                "scraped_at":      scraped_at,
            })
    return rows


# ── Supabase upload ───────────────────────────────────────────────────────────

def upload_to_supabase(rows: list[dict], batch_size: int = 200) -> int:
    url_base = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or ""
    anon_key = (os.environ.get("SUPABASE_ANON_KEY")
                or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
                or os.environ.get("VITE_SUPABASE_ANON_KEY") or "")
    if not url_base or not anon_key:
        print("  [upload] ERROR: SUPABASE_URL and SUPABASE_ANON_KEY not set.", file=sys.stderr)
        return 0

    # competitor_products unique key is product_url — use upsert
    endpoint = f"{url_base.rstrip('/')}/rest/v1/competitor_products?on_conflict=product_url"
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    # map to table columns (drop extra fields)
    table_cols = ["dispensary_name","dispensary_url","dispensary_region","product_url","name","brand","category","price","availability","scraped_at"]
    def to_row(r):
        return {k: r.get(k) for k in table_cols}

    uploaded = 0
    for start in range(0, len(rows), batch_size):
        batch = [to_row(r) for r in rows[start:start+batch_size]]
        resp = requests.post(endpoint, headers=headers, json=batch, timeout=30)
        if resp.status_code in (200, 201):
            uploaded += len(batch)
        else:
            print(f"  [upload] batch failed: {resp.status_code} — {resp.text[:200]}", file=sys.stderr)
    return uploaded


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Scrape Dutchie Oregon dispensaries")
    parser.add_argument("--store",     default=None, help="Single store slug to scrape")
    parser.add_argument("--region",    default=None, help="Only scrape stores in this region (e.g. Portland_Metro)")
    parser.add_argument("--category",  default=None, help="Only upload rows matching this category (e.g. Flower)")
    parser.add_argument("--limit",     type=int, default=None, help="Max number of stores to scrape")
    parser.add_argument("--output",    default=None, metavar="FILE", help="Save results to JSON file")
    parser.add_argument("--no-upload", action="store_true", help="Skip Supabase upload")
    args = parser.parse_args()

    stores = STORES
    if args.store:
        stores = [s for s in STORES if s[3] == args.store]
        if not stores:
            print(f"Store slug '{args.store}' not found. Available: {[s[3] for s in STORES]}")
            sys.exit(1)
    if args.region:
        stores = [s for s in stores if s[2] == args.region]
        if not stores:
            print(f"No stores found for region '{args.region}'.")
            sys.exit(1)
    if args.limit:
        stores = stores[:args.limit]

    stealth = Stealth()
    all_rows: list[dict] = []
    t_start = time.time()

    print(f"Scraping {len(stores)} stores...\n")
    for i, (name, city, region, slug, url_type) in enumerate(stores, 1):
        print(f"[{i}/{len(stores)}] {name} ({city}) — dutchie.com/{url_type}/{slug}")
        t0 = time.time()
        try:
            rows = scrape_store(slug, name, city, region, stealth, url_type)
            elapsed = time.time() - t0
            print(f"  → {len(rows)} product/option rows  ({elapsed:.1f}s)")
            all_rows.extend(rows)
        except Exception as e:
            print(f"  → FAILED: {e}")
        # small pause between stores to be respectful
        if i < len(stores):
            time.sleep(2)

    total_elapsed = time.time() - t_start
    if args.category:
        all_rows = [r for r in all_rows if r.get("category", "").lower() == args.category.lower()]
        print(f"\nFiltered to category '{args.category}': {len(all_rows)} rows")
    print(f"\nDone. {len(all_rows)} total rows from {len(stores)} stores in {total_elapsed:.0f}s")

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("w", encoding="utf-8") as fh:
            json.dump(all_rows, fh, indent=2, ensure_ascii=False)
        print(f"Saved → {out}")

    if args.no_upload:
        print("--no-upload set, skipping Supabase.")
    else:
        print(f"\nUploading {len(all_rows)} rows to Supabase...")
        n = upload_to_supabase(all_rows)
        print(f"Uploaded {n} rows.")


if __name__ == "__main__":
    main()
