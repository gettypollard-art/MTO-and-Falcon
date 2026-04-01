-- Create table for imported product data
-- Columns: name text, brand text, price numeric(10,2), availability text, url text, scraped_at timestamptz default now()

CREATE TABLE IF NOT EXISTS public.mto_products (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  brand text,
  price numeric(10,2),
  availability text,
  url text UNIQUE,
  scraped_at timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS mto_products_price_idx ON public.mto_products(price);
CREATE INDEX IF NOT EXISTS mto_products_availability_idx ON public.mto_products(availability);
CREATE INDEX IF NOT EXISTS mto_products_name_idx ON public.mto_products USING gin (to_tsvector('english', name));
