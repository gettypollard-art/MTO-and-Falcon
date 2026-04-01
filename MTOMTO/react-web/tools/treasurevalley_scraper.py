#!/usr/bin/env python3
"""
Scraper for Treasure Valley Cannabis (or similar storefronts).

Usage:
  python3 tools/treasurevalley_scraper.py --start https://www.treasurevalleycannabis.com/collections/all --csv out/tv_products.csv --sqlite out/tv_products.db

This script crawls product listing links from the start URL, visits each product page,
extracts product details, and writes results to CSV and SQLite. It uses Playwright
to render pages and BeautifulSoup to parse HTML.
"""
import argparse
import csv
import sqlite3
import time
import re
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright


def init_db(path):
    conn = sqlite3.connect(path)
    conn.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scraped_at TEXT DEFAULT (datetime('now')),
        url TEXT UNIQUE,
        title TEXT,
        price TEXT,
        sku TEXT,
        category TEXT,
        description TEXT,
        tags TEXT,
        jsonld TEXT
    )
    """)
    conn.commit()
    return conn


def save_product(conn, item):
    conn.execute(
        """
        INSERT OR IGNORE INTO products (url, title, price, sku, category, description, tags, jsonld)
        VALUES (:url, :title, :price, :sku, :category, :description, :tags, :jsonld)
        """,
        item,
    )
    conn.commit()


def write_csv(path, rows):
    if not rows:
        return
    keys = ["url", "title", "price", "sku", "category", "description", "tags", "jsonld"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in keys})


def gather_product_links(start_url, page, max_links=2000):
    # BFS crawl to discover product pages — more robust for JS-heavy stores
    print(f"Crawling from {start_url} to discover product links...")
    parsed = urlparse(start_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    queue = [start_url]
    visited = set()
    product_links = []
    pages_visited = 0
    max_pages = 200
    while queue and len(product_links) < max_links and pages_visited < max_pages:
        cur = queue.pop(0)
        if cur in visited:
            continue
        visited.add(cur)
        try:
            page.goto(cur, timeout=30000, wait_until="networkidle")
            # scroll to load lazy content
            for _ in range(6):
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                time.sleep(0.6)
            html = page.content()
            soup = BeautifulSoup(html, "html.parser")
            pages_visited += 1
            for a in soup.find_all("a", href=True):
                href = a["href"]
                full = urljoin(cur, href).split("#")[0]
                if not full.startswith(base):
                    continue
                if full in visited:
                    continue
                # direct product link
                if '/product/' in full or '/products/' in full:
                    if full not in product_links:
                        product_links.append(full)
                else:
                    # enqueue for further crawling if likely a category/listing
                    if any(seg in full for seg in ('/collections/', '/shop/', '/products', '/category')):
                        queue.append(full)
        except Exception as e:
            # be resilient; skip failures
            print(f"  failed to visit {cur}: {e}")
            continue

    print(f"Found {len(product_links)} candidate product links after crawling {pages_visited} pages")
    for s in product_links[:20]:
        print(" ", s)
    return product_links[:max_links]


def parse_product_page(url, page):
    print(f"Visiting product: {url}")
    page.goto(url, timeout=30000, wait_until="networkidle")
    time.sleep(0.5)
    html = page.content()
    soup = BeautifulSoup(html, "html.parser")

    # Try to extract structured JSON-LD
    title = ""
    price = ""
    sku = ""
    category = ""
    description = ""
    tags = []
    jsonld_text = ""

    def extract_jsonld(soup):
        scripts = soup.find_all("script", type="application/ld+json")
        for s in scripts:
            try:
                import json
                txt = s.string or s.get_text()
                parsed = json.loads(txt)
                # If it's a graph, look for Product
                if isinstance(parsed, dict) and "@graph" in parsed:
                    for node in parsed.get("@graph", []):
                        if node.get("@type") == "Product":
                            return txt, node
                # If it's directly a Product
                if isinstance(parsed, dict) and parsed.get("@type") == "Product":
                    return txt, parsed
            except Exception:
                continue
        return None, None

    jsonld_text, jsonld_node = extract_jsonld(soup)
    if jsonld_node:
        # prefer JSON-LD fields
        title = jsonld_node.get("name") or title
        price = (jsonld_node.get("offers") or {}).get("price") if isinstance(jsonld_node.get("offers"), dict) else price
        description = jsonld_node.get("description") or description
        brand = (jsonld_node.get("offers") or {}).get("brand") if isinstance(jsonld_node.get("offers"), dict) else None
        if isinstance(brand, dict):
            sku = brand.get("name") or sku
        # image or other fields can be captured as needed

    # JSON-LD
    jld = soup.find("script", type="application/ld+json")
    if jld:
        try:
            import json

            jd = json.loads(jld.string)
            if isinstance(jd, dict):
                title = jd.get("name") or title
                offers = jd.get("offers") or {}
                if isinstance(offers, dict):
                    price = offers.get("price") or price
        except Exception:
            pass

    # CSS fallbacks
    if not title:
        h = soup.find(["h1", "h2"], class_=re.compile(r"product|title", re.I))
        if h:
            title = h.get_text(strip=True)
    if not price:
        p = soup.find(class_=re.compile(r"price|product-price", re.I))
        if p:
            price = p.get_text(strip=True)
    if not description:
        d = soup.find(class_=re.compile(r"description|prod-desc|product-description", re.I))
        if d:
            description = d.get_text(separator=" \n", strip=True)
    # SKU / tags
    sku_el = soup.find(text=re.compile(r"SKU|sku|upc", re.I))
    if sku_el:
        sku = sku_el.strip()

    # categories/tags
    tag_nodes = soup.find_all(class_=re.compile(r"tag|category|breadcrumb|collection-link", re.I))
    for tn in tag_nodes:
        text = tn.get_text(strip=True)
        if text:
            tags.append(text)

    return {
        "url": url,
        "title": title,
        "price": price,
        "sku": sku,
        "category": ",".join(tags[:3]),
        "description": description,
        "tags": ",".join(tags),
        "jsonld": (jsonld_text or "")
    }


def crawl(start_url, out_csv=None, out_sqlite=None, delay=1.5, limit=None):
    conn = None
    if out_sqlite:
        conn = init_db(out_sqlite)

    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        links = gather_product_links(start_url, page)
        if limit:
            links = links[:limit]
        for i, link in enumerate(links):
            try:
                item = parse_product_page(link, page)
                results.append(item)
                if conn:
                    save_product(conn, item)
            except Exception as e:
                print(f"Failed to parse {link}: {e}")
            time.sleep(delay)
        browser.close()

    if out_csv:
        write_csv(out_csv, results)
    if conn:
        conn.close()
    return results


def main():
    parser = argparse.ArgumentParser(description="Treasure Valley product scraper")
    parser.add_argument("--start", required=True, help="starting collection or all-products URL")
    parser.add_argument("--csv", help="output CSV path")
    parser.add_argument("--sqlite", help="output SQLite path")
    parser.add_argument("--delay", type=float, default=1.5)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    crawl(args.start, out_csv=args.csv, out_sqlite=args.sqlite, delay=args.delay, limit=args.limit)


if __name__ == "__main__":
    main()
