-- Competitor Products — scraped from competitor dispensary websites
-- Run in Supabase SQL Editor

create extension if not exists pgcrypto;

-- ============================================================
-- competitor_products
-- ============================================================
create table if not exists public.competitor_products (
  id                  uuid primary key default gen_random_uuid(),
  dispensary_name     text not null,
  dispensary_url      text not null default '',
  dispensary_region   text not null default '',
  product_url         text not null,
  name                text not null,
  brand               text not null default '',
  category            text not null default '',
  price               numeric(10,2),
  availability        text not null default '',
  scraped_at          timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- one row per product URL (upsert key)
  constraint competitor_products_url_uq unique (product_url)
);

-- If table already exists, add the column (safe to re-run)
alter table public.competitor_products
  add column if not exists dispensary_region text not null default '';

create index if not exists competitor_products_dispensary_idx  on public.competitor_products (dispensary_name);
create index if not exists competitor_products_region_idx      on public.competitor_products (dispensary_region);
create index if not exists competitor_products_category_idx    on public.competitor_products (category);
create index if not exists competitor_products_availability_idx on public.competitor_products (availability);
create index if not exists competitor_products_scraped_at_idx  on public.competitor_products (scraped_at desc);

-- Auto-bump updated_at on every upsert
create or replace function public.competitor_products_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_competitor_products_updated_at on public.competitor_products;
create trigger trg_competitor_products_updated_at
before insert or update on public.competitor_products
for each row execute function public.competitor_products_set_updated_at();

-- RLS (open for anon — same pattern as rest of schema)
alter table public.competitor_products enable row level security;

create policy competitor_products_anon_select on public.competitor_products
  for select to anon using (true);
create policy competitor_products_anon_insert on public.competitor_products
  for insert to anon with check (true);
create policy competitor_products_anon_update on public.competitor_products
  for update to anon using (true) with check (true);
create policy competitor_products_anon_delete on public.competitor_products
  for delete to anon using (true);

create policy competitor_products_auth_select on public.competitor_products
  for select to authenticated using (true);
create policy competitor_products_auth_insert on public.competitor_products
  for insert to authenticated with check (true);
create policy competitor_products_auth_update on public.competitor_products
  for update to authenticated using (true) with check (true);
create policy competitor_products_auth_delete on public.competitor_products
  for delete to authenticated using (true);
