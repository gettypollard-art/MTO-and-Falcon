// MTO Pricing — Supabase service (all CRUD queries, typed returns)

import { getSupabaseClient } from '../../backend/supabaseClient';
import type {
  MtoStore,
  MtoProduct,
  MtoRegionalPricing,
  MtoInvoice,
  MtoInvoiceItem,
  MtoMonthlySales,
  MtoReorderSuggestion,
  CompetitorProduct,
  ProductCategory,
  MarkupMultiplier,
  Region,
  InvoiceStatus,
} from '../types';

function client() {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase is not configured. Check your .env file.');
  return sb;
}

// ── Stores ────────────────────────────────────────────────

export async function fetchStores(): Promise<MtoStore[]> {
  const { data, error } = await client()
    .from('mto_stores')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as MtoStore[];
}

export async function upsertStore(store: Partial<MtoStore> & { name: string; code: string }): Promise<MtoStore> {
  const { data, error } = await client()
    .from('mto_stores')
    .upsert(store, { onConflict: 'code' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MtoStore;
}

// ── Products ──────────────────────────────────────────────

export async function fetchProducts(storeId: string): Promise<MtoProduct[]> {
  const { data, error } = await client()
    .from('mto_products')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as MtoProduct[];
}

export async function createProduct(product: {
  store_id: string;
  name: string;
  brand?: string;
  category: ProductCategory;
  sku?: string;
  unit_cost: number;
  markup_multiplier: MarkupMultiplier;
}): Promise<MtoProduct> {
  const { data, error } = await client()
    .from('mto_products')
    .insert(product)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MtoProduct;
}

export async function updateProduct(
  id: string,
  updates: Partial<Pick<MtoProduct, 'name' | 'brand' | 'category' | 'sku' | 'unit_cost' | 'markup_multiplier' | 'is_active'>>,
): Promise<MtoProduct> {
  const { data, error } = await client()
    .from('mto_products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MtoProduct;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await client()
    .from('mto_products')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Regional Pricing ──────────────────────────────────────

export async function fetchRegionalPricing(region: Region): Promise<MtoRegionalPricing[]> {
  const q = client().from('mto_regional_pricing').select('*').order('captured_at', { ascending: false });
  if (region !== 'All') q.eq('region', region);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as MtoRegionalPricing[];
}

export async function fetchRegionalPricingByCategory(
  region: Region,
  category: ProductCategory,
): Promise<MtoRegionalPricing[]> {
  const q = client().from('mto_regional_pricing').select('*').order('captured_at', { ascending: false });
  if (region !== 'All') q.eq('region', region);
  q.eq('category', category);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as MtoRegionalPricing[];
}

export async function createRegionalPricing(entry: {
  product_id?: string | null;
  region: Region;
  category: ProductCategory;
  competitor_name: string;
  competitor_price: number;
  source?: string;
}): Promise<MtoRegionalPricing> {
  const { data, error } = await client()
    .from('mto_regional_pricing')
    .insert(entry)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MtoRegionalPricing;
}

// ── Invoices ──────────────────────────────────────────────

export async function fetchInvoices(storeId: string): Promise<MtoInvoice[]> {
  const { data, error } = await client()
    .from('mto_invoices')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MtoInvoice[];
}

export async function createInvoice(invoice: {
  store_id: string;
  vendor_name: string;
  invoice_number?: string;
  invoice_date?: string | null;
  total_amount?: number;
  file_path?: string;
  status?: InvoiceStatus;
}): Promise<MtoInvoice> {
  const { data, error } = await client()
    .from('mto_invoices')
    .insert(invoice)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MtoInvoice;
}

export async function updateInvoiceStatus(
  id: string,
  status: InvoiceStatus,
  parsedAt?: string,
): Promise<void> {
  const updates: Record<string, unknown> = { status };
  if (parsedAt) updates.parsed_at = parsedAt;
  const { error } = await client()
    .from('mto_invoices')
    .update(updates)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Invoice Items ─────────────────────────────────────────

export async function fetchInvoiceItems(invoiceId: string): Promise<MtoInvoiceItem[]> {
  const { data, error } = await client()
    .from('mto_invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as MtoInvoiceItem[];
}

export async function insertInvoiceItems(
  items: Array<{
    invoice_id: string;
    product_name: string;
    category: ProductCategory;
    quantity: number;
    unit_cost: number;
    total_cost: number;
    suggested_markup: MarkupMultiplier;
    suggested_pretax: number;
    suggested_final: number;
    matched_product_id?: string | null;
  }>,
): Promise<MtoInvoiceItem[]> {
  if (items.length === 0) return [];
  const { data, error } = await client()
    .from('mto_invoice_items')
    .insert(items)
    .select();
  if (error) throw new Error(error.message);
  return (data ?? []) as MtoInvoiceItem[];
}

// ── Monthly Sales ─────────────────────────────────────────

export async function fetchMonthlySales(storeId: string): Promise<MtoMonthlySales[]> {
  const { data, error } = await client()
    .from('mto_monthly_sales')
    .select('*')
    .eq('store_id', storeId)
    .order('month', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MtoMonthlySales[];
}

// ── Reorder Suggestions ──────────────────────────────────

export async function fetchReorderSuggestions(storeId: string): Promise<MtoReorderSuggestion[]> {
  const { data, error } = await client()
    .from('mto_reorder_suggestions')
    .select('*')
    .eq('store_id', storeId)
    .order('priority');
  if (error) throw new Error(error.message);
  return (data ?? []) as MtoReorderSuggestion[];
}

// ── Competitor Products (scraped) ─────────────────────────

export async function fetchCompetitorProducts(region?: string): Promise<CompetitorProduct[]> {
  let q = client()
    .from('competitor_products')
    .select('*')
    .eq('availability', 'InStock')
    .order('scraped_at', { ascending: false })
    .range(0, 9999);
  if (region && region !== 'All') {
    q = q.eq('dispensary_region', region);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as CompetitorProduct[];
}

export async function fetchLastScrapedAt(region?: string): Promise<string | null> {
  let q = client()
    .from('competitor_products')
    .select('scraped_at')
    .order('scraped_at', { ascending: false })
    .limit(1);
  if (region && region !== 'All') q = q.eq('dispensary_region', region);
  const { data, error } = await q;
  if (error || !data?.length) return null;
  return (data[0] as { scraped_at: string }).scraped_at;
}

export async function fetchCompetitorStoreNames(region?: string): Promise<string[]> {
  let q = client()
    .from('competitor_products')
    .select('dispensary_name')
    .order('dispensary_name')
    .range(0, 9999);
  if (region && region !== 'All') {
    q = q.eq('dispensary_region', region);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const names = (data ?? []) as { dispensary_name: string }[];
  return [...new Set(names.map((r) => r.dispensary_name))];
}

// ── File Upload (Supabase Storage) ────────────────────────

export async function uploadInvoiceFile(
  file: File,
  storeId: string,
): Promise<string> {
  const fileName = `${storeId}/${Date.now()}_${file.name}`;
  const { error } = await client()
    .storage
    .from('mto-invoices')
    .upload(fileName, file);
  if (error) throw new Error(error.message);
  return fileName;
}
