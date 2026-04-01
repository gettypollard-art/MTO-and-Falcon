-- MTO Competitive Pricing Module Schema
-- Run this in Supabase SQL Editor after the base schema.

create extension if not exists pgcrypto;

-- ============================================================
-- mto_stores
-- ============================================================
create table if not exists public.mto_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  location text not null default '',
  region text not null default 'Portland_Metro'
    check (region in ('Portland_Metro', 'Southern_Oregon', 'Central_Oregon', 'Coastal_Oregon', 'Eastern_Oregon')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists mto_stores_code_idx on public.mto_stores (code);
create index if not exists mto_stores_region_idx on public.mto_stores (region);

alter table public.mto_stores enable row level security;

create policy mto_stores_authenticated_select on public.mto_stores
  for select to authenticated using (true);
create policy mto_stores_authenticated_insert on public.mto_stores
  for insert to authenticated with check (true);
create policy mto_stores_authenticated_update on public.mto_stores
  for update to authenticated using (true) with check (true);
create policy mto_stores_authenticated_delete on public.mto_stores
  for delete to authenticated using (true);

-- Allow anon for prototype
create policy mto_stores_anon_select on public.mto_stores
  for select to anon using (true);
create policy mto_stores_anon_insert on public.mto_stores
  for insert to anon with check (true);
create policy mto_stores_anon_update on public.mto_stores
  for update to anon using (true) with check (true);
create policy mto_stores_anon_delete on public.mto_stores
  for delete to anon using (true);

-- Seed stores
insert into public.mto_stores (name, code, location, region) values
  ('Joseph', 'jo', 'J-O Location', 'Portland_Metro'),
  ('Dowells', 'td', 'TD Location', 'Portland_Metro')
on conflict (code) do nothing;

-- ============================================================
-- mto_products
-- ============================================================
create table if not exists public.mto_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.mto_stores(id) on delete cascade,
  name text not null,
  brand text not null default '',
  category text not null default 'Flower'
    check (category in (
      'Flower', 'PreRolls', 'Edibles', 'Concentrates', 'Vapes',
      'Topicals', 'Tinctures', 'CBD', 'Seeds', 'Paraphernalia'
    )),
  sku text not null default '',
  unit_cost numeric(10,2) not null default 0,
  markup_multiplier numeric(3,1) not null default 2.0
    check (markup_multiplier in (1.0, 1.5, 2.0, 2.5, 3.0)),
  pretax_price numeric(10,2) not null default 0,
  final_price numeric(10,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mto_products_store_idx on public.mto_products (store_id);
create index if not exists mto_products_category_idx on public.mto_products (category);
create index if not exists mto_products_sku_idx on public.mto_products (sku);

alter table public.mto_products enable row level security;

create policy mto_products_authenticated_select on public.mto_products
  for select to authenticated using (true);
create policy mto_products_authenticated_insert on public.mto_products
  for insert to authenticated with check (true);
create policy mto_products_authenticated_update on public.mto_products
  for update to authenticated using (true) with check (true);
create policy mto_products_authenticated_delete on public.mto_products
  for delete to authenticated using (true);

create policy mto_products_anon_select on public.mto_products
  for select to anon using (true);
create policy mto_products_anon_insert on public.mto_products
  for insert to anon with check (true);
create policy mto_products_anon_update on public.mto_products
  for update to anon using (true) with check (true);
create policy mto_products_anon_delete on public.mto_products
  for delete to anon using (true);

-- Trigger: compute pretax_price and final_price on insert/update
create or replace function public.mto_compute_product_prices()
returns trigger
language plpgsql
as $$
begin
  new.pretax_price := round(new.unit_cost * new.markup_multiplier, 2);
  new.final_price := round(new.pretax_price * 1.20, 2);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_mto_compute_product_prices on public.mto_products;
create trigger trg_mto_compute_product_prices
before insert or update on public.mto_products
for each row
execute function public.mto_compute_product_prices();

-- ============================================================
-- mto_regional_pricing
-- ============================================================
create table if not exists public.mto_regional_pricing (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.mto_products(id) on delete set null,
  region text not null
    check (region in ('Portland_Metro', 'Southern_Oregon', 'Central_Oregon', 'Coastal_Oregon', 'Eastern_Oregon')),
  category text not null default 'Flower'
    check (category in (
      'Flower', 'PreRolls', 'Edibles', 'Concentrates', 'Vapes',
      'Topicals', 'Tinctures', 'CBD', 'Seeds', 'Paraphernalia'
    )),
  competitor_name text not null default '',
  competitor_price numeric(10,2) not null default 0,
  source text not null default 'manual',
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists mto_regional_pricing_product_idx on public.mto_regional_pricing (product_id);
create index if not exists mto_regional_pricing_region_idx on public.mto_regional_pricing (region);
create index if not exists mto_regional_pricing_category_idx on public.mto_regional_pricing (category);

alter table public.mto_regional_pricing enable row level security;

create policy mto_regional_pricing_authenticated_select on public.mto_regional_pricing
  for select to authenticated using (true);
create policy mto_regional_pricing_authenticated_insert on public.mto_regional_pricing
  for insert to authenticated with check (true);
create policy mto_regional_pricing_authenticated_update on public.mto_regional_pricing
  for update to authenticated using (true) with check (true);
create policy mto_regional_pricing_authenticated_delete on public.mto_regional_pricing
  for delete to authenticated using (true);

create policy mto_regional_pricing_anon_select on public.mto_regional_pricing
  for select to anon using (true);
create policy mto_regional_pricing_anon_insert on public.mto_regional_pricing
  for insert to anon with check (true);
create policy mto_regional_pricing_anon_update on public.mto_regional_pricing
  for update to anon using (true) with check (true);
create policy mto_regional_pricing_anon_delete on public.mto_regional_pricing
  for delete to anon using (true);

-- ============================================================
-- mto_invoices
-- ============================================================
create table if not exists public.mto_invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.mto_stores(id) on delete cascade,
  vendor_name text not null default '',
  invoice_number text not null default '',
  invoice_date date,
  total_amount numeric(12,2) not null default 0,
  file_path text not null default '',
  parsed_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'parsing', 'parsed', 'error')),
  created_at timestamptz not null default now()
);

create index if not exists mto_invoices_store_idx on public.mto_invoices (store_id);
create index if not exists mto_invoices_status_idx on public.mto_invoices (status);

alter table public.mto_invoices enable row level security;

create policy mto_invoices_authenticated_select on public.mto_invoices
  for select to authenticated using (true);
create policy mto_invoices_authenticated_insert on public.mto_invoices
  for insert to authenticated with check (true);
create policy mto_invoices_authenticated_update on public.mto_invoices
  for update to authenticated using (true) with check (true);
create policy mto_invoices_authenticated_delete on public.mto_invoices
  for delete to authenticated using (true);

create policy mto_invoices_anon_select on public.mto_invoices
  for select to anon using (true);
create policy mto_invoices_anon_insert on public.mto_invoices
  for insert to anon with check (true);
create policy mto_invoices_anon_update on public.mto_invoices
  for update to anon using (true) with check (true);
create policy mto_invoices_anon_delete on public.mto_invoices
  for delete to anon using (true);

-- ============================================================
-- mto_invoice_items
-- ============================================================
create table if not exists public.mto_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.mto_invoices(id) on delete cascade,
  product_name text not null default '',
  category text not null default 'Flower'
    check (category in (
      'Flower', 'PreRolls', 'Edibles', 'Concentrates', 'Vapes',
      'Topicals', 'Tinctures', 'CBD', 'Seeds', 'Paraphernalia'
    )),
  quantity integer not null default 0,
  unit_cost numeric(10,2) not null default 0,
  total_cost numeric(12,2) not null default 0,
  suggested_markup numeric(3,1) not null default 2.0,
  suggested_pretax numeric(10,2) not null default 0,
  suggested_final numeric(10,2) not null default 0,
  matched_product_id uuid references public.mto_products(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mto_invoice_items_invoice_idx on public.mto_invoice_items (invoice_id);
create index if not exists mto_invoice_items_matched_idx on public.mto_invoice_items (matched_product_id);

alter table public.mto_invoice_items enable row level security;

create policy mto_invoice_items_authenticated_select on public.mto_invoice_items
  for select to authenticated using (true);
create policy mto_invoice_items_authenticated_insert on public.mto_invoice_items
  for insert to authenticated with check (true);
create policy mto_invoice_items_authenticated_update on public.mto_invoice_items
  for update to authenticated using (true) with check (true);
create policy mto_invoice_items_authenticated_delete on public.mto_invoice_items
  for delete to authenticated using (true);

create policy mto_invoice_items_anon_select on public.mto_invoice_items
  for select to anon using (true);
create policy mto_invoice_items_anon_insert on public.mto_invoice_items
  for insert to anon with check (true);
create policy mto_invoice_items_anon_update on public.mto_invoice_items
  for update to anon using (true) with check (true);
create policy mto_invoice_items_anon_delete on public.mto_invoice_items
  for delete to anon using (true);

-- ============================================================
-- mto_monthly_sales
-- ============================================================
create table if not exists public.mto_monthly_sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.mto_stores(id) on delete cascade,
  product_id uuid not null references public.mto_products(id) on delete cascade,
  month date not null,
  quantity_sold integer not null default 0,
  revenue numeric(12,2) not null default 0,
  cost_of_goods numeric(12,2) not null default 0,
  profit_margin numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists mto_monthly_sales_store_idx on public.mto_monthly_sales (store_id);
create index if not exists mto_monthly_sales_product_idx on public.mto_monthly_sales (product_id);
create index if not exists mto_monthly_sales_month_idx on public.mto_monthly_sales (month desc);

alter table public.mto_monthly_sales enable row level security;

create policy mto_monthly_sales_authenticated_select on public.mto_monthly_sales
  for select to authenticated using (true);
create policy mto_monthly_sales_authenticated_insert on public.mto_monthly_sales
  for insert to authenticated with check (true);
create policy mto_monthly_sales_authenticated_update on public.mto_monthly_sales
  for update to authenticated using (true) with check (true);
create policy mto_monthly_sales_authenticated_delete on public.mto_monthly_sales
  for delete to authenticated using (true);

create policy mto_monthly_sales_anon_select on public.mto_monthly_sales
  for select to anon using (true);
create policy mto_monthly_sales_anon_insert on public.mto_monthly_sales
  for insert to anon with check (true);
create policy mto_monthly_sales_anon_update on public.mto_monthly_sales
  for update to anon using (true) with check (true);
create policy mto_monthly_sales_anon_delete on public.mto_monthly_sales
  for delete to anon using (true);

-- ============================================================
-- mto_reorder_suggestions
-- ============================================================
create table if not exists public.mto_reorder_suggestions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.mto_stores(id) on delete cascade,
  product_id uuid not null references public.mto_products(id) on delete cascade,
  current_stock integer not null default 0,
  avg_daily_sales numeric(8,2) not null default 0,
  days_until_stockout integer not null default 0,
  suggested_reorder_qty integer not null default 0,
  priority text not null default 'low'
    check (priority in ('low', 'medium', 'high', 'critical')),
  created_at timestamptz not null default now()
);

create index if not exists mto_reorder_store_idx on public.mto_reorder_suggestions (store_id);
create index if not exists mto_reorder_product_idx on public.mto_reorder_suggestions (product_id);
create index if not exists mto_reorder_priority_idx on public.mto_reorder_suggestions (priority);

alter table public.mto_reorder_suggestions enable row level security;

create policy mto_reorder_authenticated_select on public.mto_reorder_suggestions
  for select to authenticated using (true);
create policy mto_reorder_authenticated_insert on public.mto_reorder_suggestions
  for insert to authenticated with check (true);
create policy mto_reorder_authenticated_update on public.mto_reorder_suggestions
  for update to authenticated using (true) with check (true);
create policy mto_reorder_authenticated_delete on public.mto_reorder_suggestions
  for delete to authenticated using (true);

create policy mto_reorder_anon_select on public.mto_reorder_suggestions
  for select to anon using (true);
create policy mto_reorder_anon_insert on public.mto_reorder_suggestions
  for insert to anon with check (true);
create policy mto_reorder_anon_update on public.mto_reorder_suggestions
  for update to anon using (true) with check (true);
create policy mto_reorder_anon_delete on public.mto_reorder_suggestions
  for delete to anon using (true);
