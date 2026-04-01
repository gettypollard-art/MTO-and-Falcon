#!/usr/bin/env python3
"""
Sitemap -> JSON-LD product scraper.

Steps:
  1. Fetch sitemap.xml (or sitemap_index) and collect URLs containing 'product'
  2. Visit each product URL with a plain HTTP GET (no browser), parse <script type="application/ld+json">
  3. Extract Product node (handle @graph), pull name, offers.price, offers.availability, offers.brand.name
  4. Write CSV with columns: name,brand,price,availability,url

Usage:
  python tools/jsonld_sitemap_scraper.py --sitemap https://example.com/sitemap.xml --csv out/products.csv --limit 100

Respectful defaults: 1s delay between requests, User-Agent header set.
"""
import argparse
import csv
import time
import requests
from bs4 import BeautifulSoup
import xml.etree.ElementTree as ET
import json
from urllib.parse import urlparse
from datetime import datetime

DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


def fetch_sitemap_urls(sitemap_url, timeout=10):
    headers = {"User-Agent": DEFAULT_UA}
    r = requests.get(sitemap_url, headers=headers, timeout=timeout)
    r.raise_for_status()
    text = r.text
    # try parse as XML
    try:
        root = ET.fromstring(text)
    except Exception:
        return []

    urls = []
    # sitemap index or single sitemap
    for loc in root.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc'):
        urls.append(loc.text.strip())

    # if no namespace matches, try without namespace
    if not urls:
        for loc in root.findall('.//loc'):
            if loc.text:
                urls.append(loc.text.strip())

    # If this is a sitemap index (links to other sitemaps), expand them
    product_urls = []
    for u in urls:
        def url_has_product_segment(candidate_url: str) -> bool:
            try:
                p = urlparse(candidate_url).path or ''
                segments = [s for s in p.split('/') if s]
                return 'product' in segments
            except Exception:
                return False

        if u.endswith('.xml'):
            try:
                r2 = requests.get(u, headers=headers, timeout=timeout)
                r2.raise_for_status()
                root2 = ET.fromstring(r2.text)
                for loc in root2.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc'):
                    if loc.text and url_has_product_segment(loc.text):
                        product_urls.append(loc.text.strip())
                for loc in root2.findall('.//loc'):
                    if loc.text and url_has_product_segment(loc.text):
                        product_urls.append(loc.text.strip())
            except Exception:
                # ignore and continue
                continue
        else:
            if url_has_product_segment(u):
                product_urls.append(u)

    # dedupe while preserving order
    seen = set()
    out = []
    for u in product_urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def extract_product_from_html(html_text):
    soup = BeautifulSoup(html_text, 'html.parser')
    scripts = soup.find_all('script', type='application/ld+json')
    for s in scripts:
        txt = s.string or s.get_text()
        try:
            parsed = json.loads(txt)
        except Exception:
            continue
        # If it's a graph, find Product node
        if isinstance(parsed, dict) and '@graph' in parsed:
            for node in parsed['@graph']:
                if node.get('@type') == 'Product' or node.get('@type') == 'product':
                    return node
        # If it's directly a Product
        if isinstance(parsed, dict) and parsed.get('@type') == 'Product':
            return parsed
    return None


def clean_name(raw_name):
    if not raw_name:
        return ''
    # split on pipe and take first part
    parts = raw_name.split('|')
    return parts[0].strip()


def scrape_from_sitemap(sitemap_url, out_csv, limit=None, delay=1.0):
    headers = {"User-Agent": DEFAULT_UA}
    product_urls = fetch_sitemap_urls(sitemap_url)
    if not product_urls:
        print('No product URLs found in sitemap.')
        return 0
    print(f'Found {len(product_urls)} product URLs in sitemap (filtered by /product/ segment).')
    if limit:
        product_urls = product_urls[:limit]

    rows = []
    for i, url in enumerate(product_urls, 1):
        try:
            print(f'[{i}/{len(product_urls)}] GET {url}')
            r = requests.get(url, headers=headers, timeout=15)
            r.raise_for_status()
            node = extract_product_from_html(r.text)
            if not node:
                print('  no product JSON-LD found')
                time.sleep(delay)
                continue
            name = clean_name(node.get('name') or '')
            offers = node.get('offers') or {}
            price = ''
            availability = ''
            brand = ''
            if isinstance(offers, dict):
                raw_price = offers.get('price') or ''
                # try parse numeric price and round to 2 decimals
                try:
                    pval = float(str(raw_price).strip())
                    # keep as two-decimal representation (CSV-friendly numeric-looking value)
                    price = f"{pval:.2f}"
                except Exception:
                    price = ''
                avail = offers.get('availability') or ''
                availability = 'InStock' if 'InStock' in str(avail) else 'OutOfStock'
                br = offers.get('brand') or {}
                if isinstance(br, dict):
                    brand = br.get('name') or ''
                else:
                    brand = str(br)

            scraped_at = datetime.utcnow().isoformat() + 'Z'
            rows.append({'name': name, 'brand': brand, 'price': price, 'availability': availability, 'url': url, 'scraped_at': scraped_at})
        except Exception as e:
            print(f'  error fetching/parsing {url}: {e}')
        time.sleep(delay)

    # write CSV
    keys = ['name', 'brand', 'price', 'availability', 'url', 'scraped_at']
    with open(out_csv, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f'Wrote {len(rows)} rows to {out_csv}')
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description='Sitemap JSON-LD product scraper')
    parser.add_argument('--sitemap', required=True, help='sitemap.xml or sitemap_index URL')
    parser.add_argument('--csv', required=False, default=None, help='output CSV path')
    parser.add_argument('--limit', type=int, default=None)
    parser.add_argument('--delay', type=float, default=1.0)
    parser.add_argument('--count-only', action='store_true', help='Only count filtered product URLs and exit')
    args = parser.parse_args()
    if getattr(args, 'count_only', False):
        # quick count-only run
        urls = fetch_sitemap_urls(args.sitemap)
        print(len(urls))
        return
    scrape_from_sitemap(args.sitemap, args.csv, limit=args.limit, delay=args.delay)


if __name__ == '__main__':
    main()
