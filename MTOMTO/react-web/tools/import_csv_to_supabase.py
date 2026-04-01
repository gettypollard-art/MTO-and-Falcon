#!/usr/bin/env python3
"""
Import CSV rows into Supabase `mto_products` for a given store code.

Usage:
  export SUPABASE_URL='https://xyz.supabase.co'
  export SUPABASE_SERVICE_ROLE_KEY='service_role_key_here'
  python tools/import_csv_to_supabase.py --csv out/tv_async_200.csv --store-code tv

The script will:
 - Resolve `store_id` by `code` (create store if missing)
 - For each CSV row, try to find an existing product by store_id + name
 - If found, PATCH (update) the product; otherwise INSERT

Requires: Python 3.8+, `requests` (in tools venv)
"""
import os
import csv
import argparse
import requests
from urllib.parse import urljoin

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('VITE_SUPABASE_URL')
SERVICE_ROLE = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

HEADERS = None

ALLOWED_CATEGORIES = {
    'Flower', 'PreRolls', 'Edibles', 'Concentrates', 'Vapes',
    'Topicals', 'Tinctures', 'CBD', 'Seeds', 'Paraphernalia'
}


def build_headers():
    global HEADERS
    if not SUPABASE_URL or not SERVICE_ROLE:
        raise SystemExit('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
    HEADERS = {
        'apikey': SERVICE_ROLE,
        'Authorization': f'Bearer {SERVICE_ROLE}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }


def resolve_store_id(store_code: str, store_name: str = None):
    # try to find store by code
    url = urljoin(SUPABASE_URL, '/rest/v1/mto_stores')
    params = {'code': f'eq.{store_code}'}
    r = requests.get(url, headers=HEADERS, params={'code': f'eq.{store_code}', 'select': 'id,name,code'})
    if r.status_code == 200:
        data = r.json()
        if data:
            return data[0]['id']
    # not found -> create
    payload = {'code': store_code, 'name': store_name or store_code, 'location': '', 'region': 'Portland_Metro'}
    r2 = requests.post(url, headers=HEADERS, json=payload)
    if r2.status_code in (200, 201):
        return r2.json()[0]['id']
    raise SystemExit(f'Failed to resolve/create store: {r.status_code} {r.text}')


def find_product(store_id: str, name: str):
    url = urljoin(SUPABASE_URL, '/rest/v1/mto_products')
    params = {'select': 'id', 'store_id': f'eq.{store_id}', 'name': f'eq.{name}'}
    r = requests.get(url, headers=HEADERS, params=params)
    if r.status_code == 200:
        data = r.json()
        if data:
            return data[0]['id']
        return None
    raise RuntimeError(f'Error querying product: {r.status_code} {r.text}')


def insert_product(row: dict):
    url = urljoin(SUPABASE_URL, '/rest/v1/mto_products')
    r = requests.post(url, headers=HEADERS, json=row)
    if r.status_code in (200, 201):
        return r.json()[0]
    raise RuntimeError(f'Insert failed: {r.status_code} {r.text}')


def update_product(prod_id: str, updates: dict):
    url = urljoin(SUPABASE_URL, '/rest/v1/mto_products')
    r = requests.patch(url, headers=HEADERS, params={'id': f'eq.{prod_id}'}, json=updates)
    if r.status_code in (200, 204):
        try:
            return r.json()[0]
        except Exception:
            return None
    raise RuntimeError(f'Update failed: {r.status_code} {r.text}')


def normalize_category(cat: str) -> str:
    if not cat:
        return 'Flower'
    c = cat.strip()
    if c in ALLOWED_CATEGORIES:
        return c
    # simple heuristics
    lc = c.lower()
    if 'vape' in lc or 'vap' in lc:
        return 'Vapes'
    if 'pre' in lc or 'roll' in lc:
        return 'PreRolls'
    if 'edib' in lc or 'gummi' in lc:
        return 'Edibles'
    if 'concen' in lc or 'dab' in lc:
        return 'Concentrates'
    return 'Flower'


def process_csv(csv_path: str, store_id: str, default_markup: float = 2.0):
    written = 0
    with open(csv_path, newline='', encoding='utf-8') as fh:
        reader = csv.DictReader(fh)
        for r in reader:
            name = (r.get('name') or '').strip()
            if not name:
                continue
            brand = (r.get('brand') or '').strip()
            raw_price = (r.get('price') or '').strip()
            try:
                unit_cost = round(float(raw_price), 2) if raw_price != '' else 0.0
            except Exception:
                unit_cost = 0.0
            category = normalize_category(r.get('category') or '')
            payload = {
                'store_id': store_id,
                'name': name,
                'brand': brand,
                'category': category,
                'sku': '',
                'unit_cost': unit_cost,
                'markup_multiplier': default_markup,
                'is_active': True,
            }
            # check existing
            prod_id = None
            try:
                prod_id = find_product(store_id, name)
            except Exception as e:
                print('ERROR finding product', name, e)
            if prod_id:
                try:
                    update_product(prod_id, payload)
                    written += 1
                except Exception as e:
                    print('Update error for', name, e)
            else:
                try:
                    insert_product(payload)
                    written += 1
                except Exception as e:
                    print('Insert error for', name, e)
    return written


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv', required=True)
    parser.add_argument('--store-code', required=True, help='store code (mto_stores.code) to associate rows with')
    parser.add_argument('--store-name', required=False, help='optional human name when creating store')
    args = parser.parse_args()

    global SUPABASE_URL, SERVICE_ROLE
    # prefer explicit vars with these names
    SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('VITE_SUPABASE_URL')
    SERVICE_ROLE = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not SUPABASE_URL or not SERVICE_ROLE:
        print('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment')
        return
    build_headers()
    store_id = resolve_store_id(args.store_code, args.store_name)
    print('Using store_id', store_id)
    written = process_csv(args.csv, store_id)
    print(f'Imported {written} rows from {args.csv} into store {args.store_code}')


if __name__ == '__main__':
    main()
