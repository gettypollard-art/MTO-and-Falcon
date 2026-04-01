#!/usr/bin/env python3
"""
Full OLCC → Dutchie scraper using Playwright + BeautifulSoup.

Install:
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r react-web/tools/requirements.txt
  playwright install chromium

Run:
  python3 react-web/tools/olcc_dutchie_scraper.py --sqlite out/oregon_cannabis.db --csv out/oregon_prices.csv
"""
import requests
import csv
import sqlite3
import time
import re
import argparse
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
from urllib.parse import urljoin

# Oregon OLCC public dispensary list (free, no key)
DEFAULT_OLCC_URL = "https://www.oregon.gov/olcc/marijuana/pages/recreational-marijuana-retailers.aspx"


def get_olcc_dispensaries(olcc_url: str = DEFAULT_OLCC_URL, timeout=15):
    """Fetch OLCC dispensary list from the provided URL.

    The OLCC site can change paths; if you get a 404, visit the OLCC website
    and pass the current retailers page URL via `--olcc-url`.
    """
    try:
        r = requests.get(olcc_url, timeout=timeout)
        r.raise_for_status()
    except requests.exceptions.HTTPError as e:
        print(f"HTTP error fetching OLCC URL ({olcc_url}): {e}")
        # attempt to discover a retailers page from the OLCC homepage
        try:
            homepage = 'https://www.oregon.gov/olcc/'
            print(f"Attempting to discover retailers page from {homepage}...")
            h = requests.get(homepage, timeout=timeout)
            h.raise_for_status()
            hsoup = BeautifulSoup(h.text, 'html.parser')
            candidates = []
            for a in hsoup.select('a'):
                href = a.get('href') or ''
                text = (a.get_text(strip=True) or '').lower()
                if not href:
                    continue
                if any(k in href.lower() for k in ('retail', 'retailer', 'dispensary', 'recreat')) or any(k in text for k in ('retail', 'retailer', 'dispensary', 'recreat')):
                    full = urljoin(homepage, href)
                    if full not in candidates:
                        candidates.append(full)
            if candidates:
                print(f"Found {len(candidates)} candidate pages; trying the first: {candidates[0]}")
                r = requests.get(candidates[0], timeout=timeout)
                r.raise_for_status()
            else:
                print("No candidate retailers links found on OLCC homepage.")
                print("Check the OLCC retailers page URL — it may have moved. Try the --olcc-url flag.")
                raise
        except Exception:
            print("Check the OLCC retailers page URL — it may have moved. Try the --olcc-url flag.")
            raise
    except requests.exceptions.RequestException as e:
        print(f"Network error fetching OLCC URL ({olcc_url}): {e}")
        raise

    soup = BeautifulSoup(r.text, "html.parser")
    dispensaries = []
    table = soup.find("table")
    if not table:
        # No table found; OLCC may have changed layout
        print(f"No table found on OLCC page ({olcc_url}). The page layout may have changed.")
        return dispensaries
    rows = table.select("tr")
    for row in rows[1:]:  # skip header
        cols = [c.get_text(strip=True) for c in row.select("td")]
        if len(cols) >= 3:
            dispensaries.append({
                "name": cols[0],
                "city": cols[1],
                "license": cols[2]
            })
    return dispensaries


def name_to_slug(name):
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"\s+", "-", slug.strip())
    return slug


def build_dutchie_url(name):
    slug = name_to_slug(name)
    return f"https://dutchie.com/dispensary/{slug}/menu"


def scrape_dutchie_menu(url, dispensary_name):
    products = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        try:
            page.goto(url, timeout=20000, wait_until="networkidle")
            page.wait_for_selector("[data-testid='product-card']", timeout=10000)

            soup = BeautifulSoup(page.content(), "html.parser")

            for card in soup.select("[data-testid='product-card']"):
                name_el = card.select_one("[data-testid='product-name']")
                price_el = card.select_one("[data-testid='product-price']")
                brand_el = card.select_one("[data-testid='product-brand']")
                thc_el = card.select_one("[data-testid='product-thc']")
                weight_el = card.select_one("[data-testid='product-weight']")
                category_el = card.select_one("[data-testid='product-category']")

                products.append({
                    "dispensary": dispensary_name,
                    "product": name_el.get_text(strip=True) if name_el else "",
                    "brand": brand_el.get_text(strip=True) if brand_el else "",
                    "price": price_el.get_text(strip=True) if price_el else "",
                    "thc": thc_el.get_text(strip=True) if thc_el else "",
                    "weight": weight_el.get_text(strip=True) if weight_el else "",
                    "category": category_el.get_text(strip=True) if category_el else "",
                })
        except Exception as e:
            print(f"  Failed: {e}")
        finally:
            browser.close()
    return products


def init_db(db_path="oregon_cannabis.db"):
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS prices (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            scraped_at TEXT DEFAULT (datetime('now')),
            dispensary TEXT,
            product    TEXT,
            brand      TEXT,
            price      TEXT,
            thc        TEXT,
            weight     TEXT,
            category   TEXT
        )
    """)
    conn.commit()
    return conn


def save_products(conn, products):
    if not products:
        return
    conn.executemany("""
        INSERT INTO prices (dispensary, product, brand, price, thc, weight, category)
        VALUES (:dispensary, :product, :brand, :price, :thc, :weight, :category)
    """, products)
    conn.commit()


def run_scraper(db_path="oregon_cannabis.db", csv_path=None, delay=2, olcc_url: str = DEFAULT_OLCC_URL):
    conn = init_db(db_path)
    dispensaries = get_olcc_dispensaries(olcc_url)
    print(f"Found {len(dispensaries)} licensed Oregon dispensaries")

    all_products = []
    for i, d in enumerate(dispensaries):
        url = build_dutchie_url(d["name"])
        print(f"[{i+1}/{len(dispensaries)}] Scraping {d['name']} ({d['city']})... {url}")

        products = scrape_dutchie_menu(url, d["name"])
        if products:
            save_products(conn, products)
            all_products.extend(products)
            print(f"  Got {len(products)} products")
        else:
            print(f"  No Dutchie menu found (may use different platform)")

        time.sleep(delay)  # be polite — avoid getting blocked

    if csv_path:
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["dispensary", "product", "brand", "price", "thc", "weight", "category"])
            writer.writeheader()
            writer.writerows(all_products)
        print(f"Saved CSV to {csv_path}")

    print(f"\nDone! Saved {len(all_products)} products to CSV and {db_path}")
    conn.close()


def main():
    parser = argparse.ArgumentParser(description="OLCC → Dutchie scraper")
    parser.add_argument("--csv", help="write CSV to path")
    parser.add_argument("--sqlite", help="write SQLite DB to path", default="oregon_cannabis.db")
    parser.add_argument("--olcc-url", help="override OLCC retailers page URL", default=DEFAULT_OLCC_URL)
    parser.add_argument("--delay", type=float, default=2.0, help="delay seconds between requests")
    args = parser.parse_args()

    run_scraper(db_path=args.sqlite, csv_path=args.csv, delay=args.delay, olcc_url=args.olcc_url)


if __name__ == "__main__":
    main()
