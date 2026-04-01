#!/usr/bin/env python3
"""
MTO — M Thrive Organics WeedMenu Scraper
Scrapes https://www.weedmenu.com/dispensaries/m-thrive-organics-llc/menu
and uploads to the competitor_products Supabase table.

Usage:
  python tools/scraper_mthrive.py                          # full run, upload
  python tools/scraper_mthrive.py --no-upload              # scrape only
  python tools/scraper_mthrive.py --output out/mthrive.json
  python tools/scraper_mthrive.py --limit 3                # first 3 pages only
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

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

# ── Constants ─────────────────────────────────────────────────────────────────

BASE_URL   = "https://www.weedmenu.com/dispensaries/m-thrive-organics-llc/menu"
STORE_NAME = "M Thrive Organics"
STORE_URL  = "https://www.weedmenu.com/dispensaries/m-thrive-organics-llc/menu"
REGION     = "Eastern_Oregon"   # The Dalles + Joseph, OR

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# WeedMenu "strain/type" → our ProductCategory
CATEGORY_MAP: dict[str, str] = {
    "indica":      "Flower",
    "sativa":      "Flower",
    "hybrid":      "Flower",
    "cbd":         "CBD",
    "concentrate": "Concentrates",
    "edible":      "Edibles",
    "drink":       "Edibles",
    "topicals":    "Topicals",
    "topical":     "Topicals",
    "tincture":    "Tinctures",
    "preroll":     "PreRolls",
    "pre-roll":    "PreRolls",
    "gear":        "Paraphernalia",
    "accessory":   "Paraphernalia",
}

def map_category(raw: str) -> str:
    return CATEGORY_MAP.get(raw.lower().strip(), raw.strip() or "Flower")


# ── Scraper ───────────────────────────────────────────────────────────────────

def get_total_pages(session: requests.Session) -> int:
    resp = session.get(BASE_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    # Pagination: <a> tags inside .pagination with numeric text
    page_nums = []
    for a in soup.select(".pagination a"):
        txt = a.text.strip()
        if txt.isdigit():
            page_nums.append(int(txt))
    return max(page_nums) if page_nums else 1


def scrape_page(session: requests.Session, page: int) -> list[dict]:
    url = f"{BASE_URL}?page={page}"
    resp = session.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    scraped_at = datetime.now(timezone.utc).isoformat()
    rows: list[dict] = []

    for article in soup.select("article[data-product]"):
        name_el   = article.select_one("h1.product-name")
        strain_el = article.select_one("p.product-strains span")
        brand_el  = article.select_one("p.product-brand")

        name   = (name_el.get("title") or name_el.text).strip() if name_el else ""
        if not name:
            continue
        strain = strain_el.text.strip() if strain_el else ""
        brand  = brand_el.text.strip()  if brand_el  else ""
        category = map_category(strain)

        # Each li.list-inline-item is one size/price option
        size_items = article.select("li.list-inline-item")
        for item in size_items:
            size_el  = item.select_one(".product-size")
            price_el = item.select_one(".product-price strong")
            if not size_el or not price_el:
                continue
            size_txt  = size_el.text.strip()
            price_txt = price_el.text.strip().lstrip("$").replace(",", "")
            try:
                price = float(price_txt)
            except ValueError:
                continue

            # product_url is unique per product+size combo
            product_url = (
                f"{STORE_URL}/product/{name.lower().replace(' ', '-')}"
                f"/{size_txt.lower().replace(' ', '-')}"
            )

            rows.append({
                "dispensary_name":   STORE_NAME,
                "dispensary_url":    STORE_URL,
                "dispensary_region": REGION,
                "product_url":       product_url,
                "name":              f"{name} ({size_txt})" if size_txt else name,
                "brand":             brand,
                "category":          category,
                "price":             price,
                "availability":      "InStock",
                "scraped_at":        scraped_at,
            })

        # If no size options found, emit a single row with no size qualifier
        if not size_items:
            rows.append({
                "dispensary_name":   STORE_NAME,
                "dispensary_url":    STORE_URL,
                "dispensary_region": REGION,
                "product_url":       f"{STORE_URL}/product/{name.lower().replace(' ', '-')}",
                "name":              name,
                "brand":             brand,
                "category":          category,
                "price":             None,
                "availability":      "InStock",
                "scraped_at":        scraped_at,
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

    endpoint = f"{url_base.rstrip('/')}/rest/v1/competitor_products?on_conflict=product_url"
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    table_cols = [
        "dispensary_name", "dispensary_url", "dispensary_region",
        "product_url", "name", "brand", "category",
        "price", "availability", "scraped_at",
    ]
    def to_row(r: dict) -> dict:
        return {k: r.get(k) for k in table_cols}

    uploaded = 0
    for start in range(0, len(rows), batch_size):
        batch = [to_row(r) for r in rows[start:start + batch_size]]
        resp = requests.post(endpoint, headers=headers, json=batch, timeout=30)
        if resp.status_code in (200, 201):
            uploaded += len(batch)
        else:
            print(f"  [upload] batch failed: {resp.status_code} — {resp.text[:200]}", file=sys.stderr)
    return uploaded


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Scrape M Thrive Organics from WeedMenu")
    parser.add_argument("--category",  default=None, help="Only upload rows matching this category (e.g. Flower)")
    parser.add_argument("--limit",     type=int, default=None, help="Max pages to scrape")
    parser.add_argument("--output",    default=None, metavar="FILE", help="Save to JSON file")
    parser.add_argument("--no-upload", action="store_true", help="Skip Supabase upload")
    args = parser.parse_args()

    session = requests.Session()

    print("Detecting page count...")
    try:
        total_pages = get_total_pages(session)
    except Exception as e:
        print(f"Failed to load menu: {e}")
        sys.exit(1)

    pages = list(range(1, total_pages + 1))
    if args.limit:
        pages = pages[:args.limit]

    print(f"Scraping {len(pages)} page(s) of {total_pages} from {STORE_NAME}...\n")

    all_rows: list[dict] = []
    for i, page in enumerate(pages, 1):
        print(f"  Page {page}/{total_pages}...", end=" ", flush=True)
        try:
            rows = scrape_page(session, page)
            print(f"{len(rows)} product/option rows")
            all_rows.extend(rows)
        except Exception as e:
            print(f"FAILED: {e}")
        if i < len(pages):
            time.sleep(0.5)   # polite pause

    if args.category:
        all_rows = [r for r in all_rows if r.get("category", "").lower() == args.category.lower()]
        print(f"\nFiltered to category '{args.category}': {len(all_rows)} rows")
    print(f"\nTotal: {len(all_rows)} rows from {len(pages)} pages")

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
