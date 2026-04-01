#!/usr/bin/env python3
"""
Treasure Valley Cannabis — product scraper with Supabase sync.

Strategy:
  1. Fetch sitemap.xml, collect all /product/ URLs
  2. Async-fetch every product page (concurrency=20, 2 retries)
  3. Extract JSON-LD <script type="application/ld+json"> — handles @graph
  4. Optionally write results to --output file.json
  5. Optionally upsert to Supabase competitor_products table (skip with --no-upload)

Quick start:
  cp tools/.env.example tools/.env      # fill in SUPABASE_URL + SUPABASE_ANON_KEY
  pip install -r tools/requirements.txt
  python tools/scraper_treasure_valley.py
  python tools/scraper_treasure_valley.py --limit 50 --output out/tv.json --no-upload
  python tools/scraper_treasure_valley.py --output out/tv.json

Env vars (tools/.env or shell):
  SUPABASE_URL        — https://xxxx.supabase.co
  SUPABASE_ANON_KEY   — your anon/public key  (or SERVICE_ROLE_KEY for server use)
"""

import argparse
import asyncio
import json
import os
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import aiohttp
import requests
from bs4 import BeautifulSoup

# ── Config ────────────────────────────────────────────────────────────────────

DISPENSARY_NAME = "Treasure Valley Cannabis"
DISPENSARY_URL  = "https://www.treasurevalleycannabis.com"
SITEMAP_URL     = "https://www.treasurevalleycannabis.com/sitemap.xml"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

CONCURRENCY  = 20
MAX_RETRIES  = 2
REQ_TIMEOUT  = 20   # seconds per request
SITEMAP_NS   = "http://www.sitemaps.org/schemas/sitemap/0.9"

# ── .env loader (no dotenv dep required) ─────────────────────────────────────

def _load_dotenv():
    """Load tools/.env or .env relative to this file if it exists."""
    here = Path(__file__).parent
    for candidate in [here / ".env", here.parent / ".env"]:
        if candidate.exists():
            with candidate.open() as fh:
                for line in fh:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, _, v = line.partition("=")
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if k and k not in os.environ:
                        os.environ[k] = v
            break

_load_dotenv()

# ── Sitemap ───────────────────────────────────────────────────────────────────

def _locs_from_xml(text: str) -> list[str]:
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return []
    locs = [e.text.strip() for e in root.findall(f".//{{{SITEMAP_NS}}}loc") if e.text]
    if not locs:
        locs = [e.text.strip() for e in root.findall(".//loc") if e.text]
    return locs


def fetch_product_urls(sitemap_url: str) -> list[str]:
    """Return all /product/ URLs from the sitemap (follows sitemap index)."""
    headers = {"User-Agent": USER_AGENT}
    r = requests.get(sitemap_url, headers=headers, timeout=15)
    r.raise_for_status()
    top_locs = _locs_from_xml(r.text)

    product_urls: list[str] = []
    visited: set[str] = set()

    def _is_product(url: str) -> bool:
        segments = [s for s in urlparse(url).path.split("/") if s]
        return "product" in segments

    def _expand(locs: list[str]):
        for loc in locs:
            if loc in visited:
                continue
            visited.add(loc)
            if loc.endswith(".xml"):
                try:
                    r2 = requests.get(loc, headers=headers, timeout=10)
                    r2.raise_for_status()
                    _expand(_locs_from_xml(r2.text))
                except Exception:
                    pass
            elif _is_product(loc):
                product_urls.append(loc)

    _expand(top_locs)

    # dedupe, preserve order
    seen: set[str] = set()
    out: list[str] = []
    for u in product_urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out

# ── JSON-LD extractor ─────────────────────────────────────────────────────────

def _extract_product_node(html: str) -> dict | None:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all("script", type="application/ld+json"):
        raw = tag.string or tag.get_text()
        try:
            data = json.loads(raw)
        except Exception:
            continue
        if isinstance(data, dict) and "@graph" in data:
            for node in data["@graph"]:
                if str(node.get("@type", "")).lower() == "product":
                    return node
        if isinstance(data, dict) and str(data.get("@type", "")).lower() == "product":
            return data
    return None


def _parse_node(node: dict, url: str) -> dict:
    name = (node.get("name") or "").split("|")[0].strip()

    offers = node.get("offers") or {}
    price: float | None = None
    availability = ""
    brand = ""

    if isinstance(offers, dict):
        raw_price = offers.get("price")
        try:
            price = round(float(str(raw_price).strip()), 2)
        except Exception:
            price = None
        avail = str(offers.get("availability") or "")
        availability = "InStock" if "InStock" in avail else "OutOfStock"
        br = offers.get("brand") or {}
        brand = br.get("name", "") if isinstance(br, dict) else str(br)

    # category hints from description or name
    category = ""
    desc = node.get("description") or ""
    for keyword, cat in [
        ("flower", "Flower"), ("pre-roll", "PreRolls"), ("preroll", "PreRolls"),
        ("edible", "Edibles"), ("gummy", "Edibles"), ("gummies", "Edibles"),
        ("concentrate", "Concentrates"), ("wax", "Concentrates"), ("shatter", "Concentrates"),
        ("vape", "Vapes"), ("cartridge", "Vapes"),
        ("tincture", "Tinctures"), ("topical", "Topicals"),
    ]:
        if keyword in name.lower() or keyword in desc.lower():
            category = cat
            break

    return {
        "dispensary_name": DISPENSARY_NAME,
        "dispensary_url":  DISPENSARY_URL,
        "product_url":     url,
        "name":            name,
        "brand":           brand,
        "category":        category,
        "price":           price,
        "availability":    availability,
        "scraped_at":      datetime.now(timezone.utc).isoformat(),
    }

# ── Async fetcher ─────────────────────────────────────────────────────────────

async def _fetch_one(
    session: aiohttp.ClientSession,
    url: str,
    sem: asyncio.Semaphore,
    idx: int,
    total: int,
) -> dict | None:
    headers = {"User-Agent": USER_AGENT}
    for attempt in range(1, MAX_RETRIES + 2):
        try:
            async with sem:
                async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=REQ_TIMEOUT)) as resp:
                    if resp.status == 404:
                        print(f"  [{idx}/{total}] 404 {url}")
                        return None
                    html = await resp.text()
            node = _extract_product_node(html)
            if not node:
                print(f"  [{idx}/{total}] no JSON-LD — {url}")
                return None
            row = _parse_node(node, url)
            print(f"  [{idx}/{total}] OK  {row['name']!r}  ${row['price']}  {row['availability']}")
            return row
        except asyncio.TimeoutError:
            if attempt > MAX_RETRIES:
                print(f"  [{idx}/{total}] timeout (gave up) — {url}")
                return None
            await asyncio.sleep(0.3 * attempt)
        except Exception as e:
            if attempt > MAX_RETRIES:
                print(f"  [{idx}/{total}] error — {url}: {e}")
                return None
            await asyncio.sleep(0.3 * attempt)
    return None


async def scrape_all(urls: list[str]) -> list[dict]:
    sem = asyncio.Semaphore(CONCURRENCY)
    connector = aiohttp.TCPConnector(ssl=False, limit=CONCURRENCY)
    total = len(urls)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [
            _fetch_one(session, url, sem, i + 1, total)
            for i, url in enumerate(urls)
        ]
        results = await asyncio.gather(*tasks)
    return [r for r in results if r]

# ── Supabase upsert ───────────────────────────────────────────────────────────

def _supabase_headers(key: str) -> dict:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }


def upload_to_supabase(rows: list[dict], batch_size: int = 100) -> int:
    url_base = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or ""
    anon_key = (
        os.environ.get("SUPABASE_ANON_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("VITE_SUPABASE_ANON_KEY")
        or ""
    )
    if not url_base or not anon_key:
        print(
            "\n[upload] ERROR: SUPABASE_URL and SUPABASE_ANON_KEY must be set.\n"
            "  Either export them in your shell or create tools/.env:\n"
            "    SUPABASE_URL=https://xxxx.supabase.co\n"
            "    SUPABASE_ANON_KEY=your-anon-key\n",
            file=sys.stderr,
        )
        return 0

    endpoint = f"{url_base.rstrip('/')}/rest/v1/competitor_products"
    headers  = _supabase_headers(anon_key)
    uploaded = 0

    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        resp = requests.post(endpoint, headers=headers, json=batch, timeout=30)
        if resp.status_code in (200, 201):
            uploaded += len(batch)
            print(f"  [upload] batch {start//batch_size + 1}: {len(batch)} rows upserted")
        else:
            print(
                f"  [upload] batch {start//batch_size + 1} FAILED: "
                f"{resp.status_code} — {resp.text[:200]}",
                file=sys.stderr,
            )

    return uploaded

# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Scrape Treasure Valley Cannabis and sync to Supabase."
    )
    parser.add_argument(
        "--sitemap",
        default=SITEMAP_URL,
        help=f"Sitemap URL to collect product links from (default: {SITEMAP_URL})",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Stop after N products (useful for testing)",
    )
    parser.add_argument(
        "--output",
        metavar="FILE",
        default=None,
        help="Write results to this JSON file (e.g. out/tv.json)",
    )
    parser.add_argument(
        "--no-upload",
        action="store_true",
        help="Skip Supabase upload (scrape only)",
    )
    args = parser.parse_args()

    # ── Step 1: collect product URLs ──────────────────────────────────────────
    print(f"Fetching sitemap: {args.sitemap}")
    t0 = time.time()
    urls = fetch_product_urls(args.sitemap)
    print(f"Found {len(urls)} product URLs  ({time.time()-t0:.1f}s)")

    if not urls:
        print("No product URLs found — check the sitemap URL or website structure.")
        sys.exit(1)

    if args.limit:
        urls = urls[: args.limit]
        print(f"Limiting to {args.limit} products")

    # ── Step 2: scrape ────────────────────────────────────────────────────────
    print(f"\nScraping {len(urls)} products (concurrency={CONCURRENCY})...")
    t1 = time.time()
    rows = asyncio.run(scrape_all(urls))
    elapsed = time.time() - t1
    print(f"\nScraped {len(rows)}/{len(urls)} products in {elapsed:.1f}s")

    if not rows:
        print("No products scraped.")
        sys.exit(0)

    # ── Step 3: write JSON ────────────────────────────────────────────────────
    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as fh:
            json.dump(rows, fh, indent=2, ensure_ascii=False)
        print(f"Wrote {len(rows)} rows → {out_path}")

    # ── Step 4: upload ────────────────────────────────────────────────────────
    if args.no_upload:
        print("--no-upload set, skipping Supabase sync.")
    else:
        print(f"\nUploading {len(rows)} rows to Supabase competitor_products...")
        n = upload_to_supabase(rows)
        print(f"Upload complete: {n} rows upserted.")


if __name__ == "__main__":
    main()
