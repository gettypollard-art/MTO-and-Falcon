#!/usr/bin/env python3
"""Fetch a product page and print any application/ld+json blocks for debugging."""
import sys
import requests
import json
from bs4 import BeautifulSoup


def fetch_and_print(url, timeout=15):
    print(f"Fetching: {url}")
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    scripts = soup.find_all("script", type="application/ld+json")
    if not scripts:
        print("No application/ld+json script tags found.")
        return
    for i, s in enumerate(scripts, 1):
        text = s.string or s.get_text()
        print(f"--- JSON-LD block #{i} ---")
        try:
            parsed = json.loads(text)
            print(json.dumps(parsed, indent=2, ensure_ascii=False))
        except Exception:
            # print raw if not parseable
            print(text[:1000])


def main():
    if len(sys.argv) < 2:
        print("Usage: debug_product_jsonld.py <product_url>")
        sys.exit(2)
    url = sys.argv[1]
    fetch_and_print(url)


if __name__ == '__main__':
    main()
