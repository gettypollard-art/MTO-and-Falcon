// MTO Pricing — Weedmaps external service (stubbed for Day 2)

import type { Region, ProductCategory } from '../types';

export interface WeedmapsListing {
  name: string;
  brand: string;
  category: ProductCategory;
  price: number;
  dispensaryName: string;
  region: Region;
}

interface WeedmapsRawItem {
  name?: unknown;
  product_name?: unknown;
  brand?: unknown;
  vendor_name?: unknown;
  category?: unknown;
  price?: unknown;
  list_price?: unknown;
  dispensary_name?: unknown;
}

const CLIENT_ID = String(import.meta.env.VITE_WEEDMAPS_CLIENT_ID ?? '').trim();
const CLIENT_SECRET = String(import.meta.env.VITE_WEEDMAPS_CLIENT_SECRET ?? '').trim();
const WM_BASE = 'https://api-g.weedmaps.com';

let cachedToken: { token: string; expiresAt: number } | null = null;

export function isWeedmapsConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

async function obtainToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  if (!isWeedmapsConfigured()) throw new Error('Weedmaps client id/secret not configured');

  const body = {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'taxonomy:read brands:read products:read menu_items menus:write',
  };

  const res = await fetch(`${WM_BASE}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Weedmaps token request failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const token = String(json.access_token ?? '');
  const expiresIn = Number(json.expires_in ?? 1209600);
  if (!token) throw new Error('Weedmaps returned no access_token');

  cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

/**
 * Generic Weedmaps GET wrapper using cached token.
 */
async function wmGet(path: string, query?: Record<string, string | number | undefined>) {
  const token = await obtainToken();
  const qs = query
    ? '?' + Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
    : '';
  const url = `${WM_BASE}${path}${qs}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Weedmaps API error ${res.status}: ${text}`);
  }
  return res.json();
}

function normalizeWeedmapsItem(item: WeedmapsRawItem, region: Region, fallbackCategory: ProductCategory): WeedmapsListing {
  return {
    name: String(item.name ?? item.product_name ?? 'Unknown'),
    brand: String(item.brand ?? item.vendor_name ?? ''),
    category: (item.category ?? fallbackCategory) as ProductCategory,
    price: Number(item.price ?? item.list_price ?? 0) || 0,
    dispensaryName: String(item.dispensary_name ?? item.vendor_name ?? ''),
    region,
  };
}

/**
 * Fetch listings from Weedmaps for a given region/category.
 * This implementation uses a conservative catalog endpoint path — adjust to the exact partner endpoint you need.
 */
export async function fetchWeedmapsListings(region: Region, category: ProductCategory): Promise<WeedmapsListing[]> {
  try {
    if (!isWeedmapsConfigured()) return [];

    // Example endpoint — may require adjustment depending on your Weedmaps partner API agreement.
    const data = await wmGet('/catalog/v1/products', { region, category });

    // Attempt to normalize common shapes
    const items: WeedmapsRawItem[] = Array.isArray((data as { items?: unknown }).items)
      ? ((data as { items: unknown[] }).items as WeedmapsRawItem[])
      : Array.isArray(data)
        ? (data as WeedmapsRawItem[])
        : [];
    return items.map((item) => normalizeWeedmapsItem(item, region, category));
  } catch (err) {
    // Graceful degradation
    console.error('Weedmaps fetch error', err);
    return [];
  }
}
