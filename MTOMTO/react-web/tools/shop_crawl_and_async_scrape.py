#!/usr/bin/env python3
"""
Crawl /shop/page/1/.. to collect product URLs, then run an async JSON-LD extractor

Steps:
 1. Crawl pages starting at provided start URL (expects pagination like /shop/page/1/)
 2. Collect hrefs containing '/product/' into deduped list
 3. Run async extractor with concurrency=15, ssl disabled, 2 retries, 0.1s spacing
 4. First run test with --test-limit N (200), report timing and 5 sample rows
 5. Then run full run and write CSV

Usage:
  python tools/shop_crawl_and_async_scrape.py --start https://www.treasurevalleycannabis.com/shop/page/1/ --test-limit 200 --csv-test out/tv_shop_async_200.csv --csv-full out/tv_shop_async_full.csv
"""
import argparse
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import time
import asyncio
import aiohttp
import async_timeout
import csv
import os
import json
from datetime import datetime

DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


def crawl_shop(start_url, max_empty_pages=3, timeout=10):
    page = 1
    product_urls = []
    seen = set()
    empty_count = 0
    base = start_url.rstrip('/')
    while True:
        url = start_url.replace('/page/1/', f'/page/{page}/') if '/page/1/' in start_url else start_url.rstrip('/') + f'/page/{page}/'
        try:
            r = requests.get(url, headers={'User-Agent': DEFAULT_UA}, timeout=timeout)
        except Exception:
            break
        if r.status_code != 200:
            break
        soup = BeautifulSoup(r.text, 'html.parser')
        anchors = soup.find_all('a', href=True)
        added = 0
        for a in anchors:
            href = a['href']
            if '/product/' in href:
                full = urljoin(r.url, href.split('?')[0])
                # normalize
                p = urlparse(full)
                norm = p.scheme + '://' + p.netloc + p.path
                if norm not in seen:
                    seen.add(norm)
                    product_urls.append(norm)
                    added += 1
        if added == 0:
            empty_count += 1
            if empty_count >= max_empty_pages:
                break
        else:
            empty_count = 0
        page += 1
    return product_urls


def fetch_sitemap_urls_sync(sitemap_url, timeout=10):
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
                if str(node.get('@type', '')).lower() == 'product':
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
    if isinstance(node, dict):
        c = node.get('category') or node.get('additionalType')
        if c:
            return str(c).strip()
        desc = node.get('description')
        if desc:
            return str(desc).strip()
    if name:
        base = name.split('|')[0].strip()
        if ',' in base:
            candidate = base.split(',')[-1].strip()
            if candidate:
                return candidate
        parts = base.split()
        if len(parts) <= 3:
            return base
        return ' '.join(parts[-3:]).strip()
    return ''


async def fetch_and_write(session, url, sem, writer, write_lock, max_retries=2, dispensary_name='Treasure Valley Cannabis'):
    attempt = 0
    headers = {"User-Agent": DEFAULT_UA}
    while attempt <= max_retries:
        attempt += 1
        try:
            async with sem:
                async with async_timeout.timeout(20):
                    async with session.get(url, headers=headers) as resp:
                        print(f"FETCH {url} -> {resp.status}")
                        if resp.status == 404:
                            print(f"NOT FOUND: {url}")
                            return None
                        text = await resp.text()
            node = extract_product_from_html(text)
            if not node:
                print(f"NO JSON-LD Product found at {url}")
                return None
            name = clean_name(node.get('name') or '')
            offers = node.get('offers') or {}
            price = ''
            availability = ''
            brand = ''
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
            # write row under lock to avoid races
            try:
                async with write_lock:
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


async def run_async_scrape(urls, out_csv, concurrency=15):
    os.makedirs(os.path.dirname(out_csv), exist_ok=True)
    header = ['name','category','brand','price','availability','url','dispensary_name','scraped_at']
    if os.path.exists(out_csv):
        os.remove(out_csv)
    f = open(out_csv, 'w', newline='', encoding='utf-8')
    writer = csv.DictWriter(f, fieldnames=header)
    writer.writeheader()

    sem = asyncio.Semaphore(concurrency)
    write_lock = asyncio.Lock()
    timeout = aiohttp.ClientTimeout(total=30)
    connector = aiohttp.TCPConnector(limit=concurrency, ssl=False)
    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
        tasks = []
        for u in urls:
            tasks.append(fetch_and_write(session, u, sem, writer, write_lock))
            await asyncio.sleep(0.01)
        results = await asyncio.gather(*tasks)

    f.flush(); f.close()
    written = sum(1 for r in results if r)
    return written, results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', required=False, help='start page url e.g. https://.../shop/page/1/')
    parser.add_argument('--sitemap', required=False, help='sitemap.xml URL to collect product URLs')
    parser.add_argument('--test-limit', type=int, default=200)
    parser.add_argument('--csv-test', required=True)
    parser.add_argument('--csv-full', required=True)
    args = parser.parse_args()

    print('Collecting product URLs...')
    if args.sitemap:
        urls = fetch_sitemap_urls_sync(args.sitemap)
    elif args.start:
        print('Crawling shop pages to collect product URLs...')
        urls = crawl_shop(args.start)
    else:
        print('Either --start or --sitemap must be provided')
        return
    print(f'Found {len(urls)} product URLs')

    # run 200 test
    test_urls = urls[:args.test_limit]
    print(f'Running async 200-url test (concurrency=15)')
    t0 = time.time()
    written, results = asyncio.run(run_async_scrape(test_urls, args.csv_test, concurrency=15))
    t1 = time.time()
    elapsed = t1 - t0
    print(f'Test done: wrote {written} rows in {elapsed:.1f}s')
    # show 5 sample rows
    samples = [r for r in results if r][:5]
    for s in samples:
        print(s['name'], '|', s['category'], '|', s['brand'], '|', s['price'], '|', s['dispensary_name'])

    # full run
    print('Running full async scrape...')
    t0 = time.time()
    full_written, full_results = asyncio.run(run_async_scrape(urls, args.csv_full, concurrency=15))
    t1 = time.time()
    elapsed_full = t1 - t0
    print(f'Full done: wrote {full_written} rows in {elapsed_full:.1f}s')
    # print 5 samples from full
    full_samples = [r for r in full_results if r][:5]
    for s in full_samples:
        print(s['name'], '|', s['category'], '|', s['brand'], '|', s['price'], '|', s['dispensary_name'])


if __name__ == '__main__':
    main()
