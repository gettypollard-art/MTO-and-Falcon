#!/usr/bin/env python3
"""
Simple OLCC dispensary scraper.

Fetches Oregon OLCC public dispensary list, saves to CSV and SQLite.

Usage:
  python3 tools/olcc_scraper.py --csv out.csv --sqlite out.db

Requires: requests, beautifulsoup4
"""
import requests
import csv
import sqlite3
import argparse
from bs4 import BeautifulSoup

OLCC_URL = "https://www.oregon.gov/olcc/marijuana/pages/recreational-marijuana-retailers.aspx"


def get_olcc_dispensaries(timeout=15):
    r = requests.get(OLCC_URL, timeout=timeout)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    dispensaries = []
    table = soup.find("table")
    if not table:
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


def save_csv(records, path):
    keys = ["name", "city", "license"]
    with open(path, "w", newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for r in records:
            w.writerow(r)


def save_sqlite(records, path):
    conn = sqlite3.connect(path)
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS dispensaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            city TEXT,
            license TEXT
        )
        """
    )
    cur.execute("DELETE FROM dispensaries")
    for r in records:
        cur.execute("INSERT INTO dispensaries (name, city, license) VALUES (?, ?, ?)", (r['name'], r['city'], r['license']))
    conn.commit()
    conn.close()


def main():
    parser = argparse.ArgumentParser(description="OLCC dispensary scraper")
    parser.add_argument("--csv", help="write CSV to path")
    parser.add_argument("--sqlite", help="write SQLite DB to path")
    parser.add_argument("--timeout", type=int, default=15, help="request timeout seconds")
    args = parser.parse_args()

    print(f"Fetching OLCC page: {OLCC_URL}")
    recs = get_olcc_dispensaries(timeout=args.timeout)
    print(f"Found {len(recs)} dispensaries")

    if args.csv:
        save_csv(recs, args.csv)
        print(f"Saved CSV to {args.csv}")
    if args.sqlite:
        save_sqlite(recs, args.sqlite)
        print(f"Saved SQLite DB to {args.sqlite}")


if __name__ == "__main__":
    main()
