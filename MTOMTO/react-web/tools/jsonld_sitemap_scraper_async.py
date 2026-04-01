#!/usr/bin/env python3
"""
Async sitemap -> JSON-LD product scraper using aiohttp.

Features:
 - Concurrency limited to 15 (semaphore)
 - 0.1s sleep between requests (no 1s sleep)
 - Max 2 retries per URL
 - Streams rows to CSV as they complete (append mode)
 - Rounds prices to 2 decimals and outputs numeric-looking values
 - Adds `dispensary_name` and `scraped_at` columns
 - Category detection order: `category` -> `additionalType` -> `description` -> parse from name

Usage:
  python tools/jsonld_sitemap_scraper_async.py --sitemap <sitemap.xml> --csv out/products.csv --limit 200
"""
import argparse
import asyncio
import aiohttp
import async_timeout
import csv
import os
import time
import json
from urllib.parse import urlparse
from bs4 import BeautifulSoup
from datetime import datetime

DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


def fetch_sitemap_urls_sync(sitemap_url, timeout=10):
    # lightweight synchronous sitemap fetch to build URL list
    import requests
    import xml.etree.ElementTree as ET
    headers = {"User-Agent": DEFAULT_UA}
    r = requests.get(sitemap_url, headers=headers, timeout=timeout)
    r.raise_for_status()
    text = r.text
    try:
        root = ET.fromstring(text)
    except Exception:
        return []
    urls = []
    for loc in root.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc'):
        if loc.text:
            urls.append(loc.text.strip())
    if not urls:
        for loc in root.findall('.//loc'):
            if loc.text:
                urls.append(loc.text.strip())

    product_urls = []
    def url_has_product_segment(candidate_url: str) -> bool:
        try:
            p = urlparse(candidate_url).path or ''
            segments = [s for s in p.split('/') if s]
            return 'product' in segments
        except Exception:
            return False

    import requests
    for u in urls:
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
                continue
        else:
            if url_has_product_segment(u):
                product_urls.append(u)

    # dedupe preserving order
    seen = set(); out = []
    for u in product_urls:
        if u not in seen:
            seen.add(u); out.append(u)
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
        if isinstance(parsed, dict) and '@graph' in parsed:
            for node in parsed['@graph']:
                t = node.get('@type') or node.get('@type'.lower())
                if str(t).lower() == 'product':
                    return node
        if isinstance(parsed, dict) and parsed.get('@type') == 'Product':
            return parsed
    return None


def clean_name(raw_name):
    if not raw_name:
        return ''
    parts = raw_name.split('|')
    return parts[0].strip()


def detect_category(node, name):
    # 1) category field
    if isinstance(node, dict):
        c = node.get('category')
        if c:
            return str(c).strip()
        c = node.get('additionalType')
        if c:
            return str(c).strip()
        desc = node.get('description')
        if desc:
            # description may be strain type; use it if nothing better
            return str(desc).strip()
    # fallback: parse from name (last phrase before end or pipe)
    if name:
        # remove pipe content (already cleaned earlier but safe)
        base = name.split('|')[0].strip()
        # try last comma-separated or last word groups
        if ',' in base:
            candidate = base.split(',')[-1].strip()
            if candidate:
                return candidate
        parts = base.split()
        if len(parts) <= 3:
            return base
        # assume category is last 1-3 tokens
        return ' '.join(parts[-3:]).strip()
    return ''


async def fetch_and_process(session, url, sem, writer, max_retries=2, dispensary_name='Treasure Valley Cannabis'):
    attempt = 0
    headers = {"User-Agent": DEFAULT_UA}
    while attempt <= max_retries:
        attempt += 1
        try:
            async with sem:
                async with async_timeout.timeout(20):
                    async with session.get(url, headers=headers) as resp:
                        status = resp.status
                        print(f"FETCH {url} -> {status}")
                        if status == 404:
                            print(f"NOT FOUND: {url}")
                            return None
                        text = await resp.text()
            node = extract_product_from_html(text)
            if not node:
                print(f"NO JSON-LD Product found at {url}")
                return None
            name = clean_name(node.get('name') or '')
            # offers
            offers = node.get('offers') or {}
            price = ''
            if isinstance(offers, dict):
                raw_price = offers.get('price') or ''
                try:
                    pval = float(str(raw_price).strip())
                    price = f"{pval:.2f}"
                except Exception:
                    price = ''
                avail = offers.get('availability') or ''
                availability = 'InStock' if 'InStock' in str(avail) else 'OutOfStock'
                br = offers.get('brand') or {}
                if isinstance(br, dict):
                    brand = br.get('name') or ''
                else:
                    brand = str(br) if br else ''
            else:
                price = ''
                availability = ''
                brand = ''
            category = detect_category(node, name)
            scraped_at = datetime.utcnow().isoformat() + 'Z'
            row = {
                'name': name,
                'category': category,
                'brand': brand,
                'price': price,
                'availability': availability,
                'url': url,
                'dispensary_name': dispensary_name,
                'scraped_at': scraped_at,
            }
            # write row immediately
            try:
                writer.writerow(row)
                print(f"WROTE ROW for {url}: {name} | {price}")
            except Exception as e:
                print(f"WRITE ERROR for {url}: {e}")
                raise
            return row
        except asyncio.TimeoutError:
            if attempt > max_retries:
                return None
            await asyncio.sleep(0.1)
            continue
        except Exception as e:
            print(f"EXCEPTION for {url}: {repr(e)}")
            if attempt > max_retries:
                return None
            await asyncio.sleep(0.1)
            continue


async def run_scrape(sitemap_url, out_csv, limit=None, concurrency=15):
    urls = fetch_sitemap_urls_sync(sitemap_url)
    if not urls:
        print('No product URLs found.')
        return 0
    print(f'Found {len(urls)} filtered product URLs.')
    if limit:
        urls = urls[:limit]

    # ensure output dir exists
    os.makedirs(os.path.dirname(out_csv), exist_ok=True)
    header = ['name','category','brand','price','availability','url','dispensary_name','scraped_at']
    # if file exists, overwrite for fresh run
    if os.path.exists(out_csv):
        os.remove(out_csv)

    # open CSV and create writer
    f = open(out_csv, 'w', newline='', encoding='utf-8')
    writer = csv.DictWriter(f, fieldnames=header)
    writer.writeheader()

    sem = asyncio.Semaphore(concurrency)
    timeout = aiohttp.ClientTimeout(total=30)
    # disable SSL verification to avoid local cert bundle issues
    connector = aiohttp.TCPConnector(limit=concurrency, ssl=False)
    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
        tasks = []
        for u in urls:
            tasks.append(fetch_and_process(session, u, sem, writer))
            # small spacing between scheduling to be polite
            await asyncio.sleep(0.01)

        # gather with concurrency; as writer is used by coroutines, it's safe since writer.writerow is I/O to file
        results = await asyncio.gather(*tasks)

    f.flush(); f.close()
    written = sum(1 for r in results if r)
    print(f'Wrote {written} rows to {out_csv}')
    return written


def main():
    parser = argparse.ArgumentParser(description='Async sitemap JSON-LD product scraper')
    parser.add_argument('--sitemap', required=True)
    parser.add_argument('--csv', required=True)
    parser.add_argument('--store-code', required=False, help='optional store code to tag CSV/import')
    parser.add_argument('--auto-import', action='store_true', help='if set and SUPABASE env vars present, run importer after scrape')
    parser.add_argument('--limit', type=int, default=None)
    parser.add_argument('--concurrency', type=int, default=15)
    args = parser.parse_args()
    start = time.time()
    written = asyncio.run(run_scrape(args.sitemap, args.csv, limit=args.limit, concurrency=args.concurrency))
    elapsed = time.time() - start
    print(f'Done: {written} rows in {elapsed:.1f}s')

    # optional auto-import
    if args.auto_import:
        import os, subprocess
        supa_url = os.environ.get('SUPABASE_URL') or os.environ.get('VITE_SUPABASE_URL')
        supa_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
        if supa_url and supa_key and args.store_code:
            runner = os.path.join(os.path.dirname(__file__), '.venv', 'bin', 'python3')
            if not os.path.exists(runner):
                runner = 'python3'
            cmd = [runner, os.path.join(os.path.dirname(__file__), 'import_csv_to_supabase.py'), '--csv', args.csv, '--store-code', args.store_code]
            if os.environ.get('SUPABASE_URL') is None and os.environ.get('VITE_SUPABASE_URL'):
                # pass through env if only VITE var set
                os.environ['SUPABASE_URL'] = os.environ.get('VITE_SUPABASE_URL')
            print('Auto-importing CSV to Supabase...')
            try:
                subprocess.run(cmd, check=True)
                print('Auto-import completed.')
            except subprocess.CalledProcessError as e:
                print('Auto-import failed:', e)
        else:
            print('Auto-import skipped: SUPABASE_URL/SERVICE_ROLE or --store-code missing')


if __name__ == '__main__':
    main()
