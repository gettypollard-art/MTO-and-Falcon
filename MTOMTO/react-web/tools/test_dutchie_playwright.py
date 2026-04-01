#!/usr/bin/env python3
"""
Test: scrape a Dutchie menu using Playwright.
Loads the dispensary's menu page in a headless browser,
intercepts the GraphQL response, and prints products.

Usage:
  python tools/test_dutchie_playwright.py
"""
import json
from playwright.sync_api import sync_playwright

MENU_URL   = "https://happyleafportland.com/menu/dutchie/"
DISPENSARY = "Happy Leaf Portland"

captured = []

def handle_response(response):
    if "dutchie.com" in response.url and response.status == 200:
        try:
            body = response.json()
            # look for product data anywhere in the response
            text = json.dumps(body)
            if "filteredProducts" in text or '"name"' in text:
                captured.append(body)
                print(f"  [intercept] captured response from {response.url[:80]}")
        except Exception:
            pass

def main():
    print(f"Loading {MENU_URL} in headless browser...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        # intercept ALL responses across every frame/page in the context
        context.on("response", handle_response)

        page = context.new_page()
        page.goto(MENU_URL, timeout=60000, wait_until="networkidle")

        # wait for iframe content to load
        page.wait_for_timeout(5000)

        # scroll inside any iframes to trigger lazy loading
        for frame in page.frames:
            try:
                frame.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            except Exception:
                pass
        page.wait_for_timeout(3000)

        browser.close()

    if not captured:
        print("No Dutchie API responses captured.")
        print("The menu might load inside an iframe — check the URL.")
        return

    print(f"\nCaptured {len(captured)} API response(s)\n")

    # find products in captured data
    products = []
    for blob in captured:
        # traverse to find product arrays
        text = json.dumps(blob)
        # try common paths
        try:
            items = blob["data"]["filteredProducts"]["products"]
            products.extend(items)
        except (KeyError, TypeError):
            pass

    if not products:
        print("Raw captured data (first 2000 chars):")
        print(json.dumps(captured[0], indent=2)[:2000])
        return

    print(f"Found {len(products)} products. Sample:\n")
    for p in products[:10]:
        name  = p.get("name", "")
        brand = (p.get("brand") or {}).get("name", "")
        cat   = p.get("category", "")
        variants = p.get("variants") or []
        price = variants[0].get("priceRec") if variants else None
        print(f"  {name}  |  {brand}  |  {cat}  |  ${price}")

if __name__ == "__main__":
    main()
