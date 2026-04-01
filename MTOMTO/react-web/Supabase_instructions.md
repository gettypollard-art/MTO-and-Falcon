# Supabase Setup Instructions

## competitor_products Table

This table stores all scraped competitor pricing data (Dutchie Oregon stores + M Thrive Organics).

### SQL File Location

```
/Users/apollo/Desktop/MTOMTO/react-web/supabase/competitor_products.sql
```

### Steps

1. Open your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New query**
4. Open the file above in any text editor, copy the entire contents, and paste it into the SQL Editor
5. Click **Run**

The script is safe to run even if you already ran an earlier version — it uses `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`, so nothing will be overwritten.

### What the SQL creates

- `competitor_products` table with columns:
  - `dispensary_name` — e.g. "Oregrown Portland"
  - `dispensary_region` — e.g. "Portland_Metro"
  - `dispensary_url` — link to the store's menu
  - `product_url` — unique key used for upserts
  - `name` — product name + size option
  - `brand` — brand name (when available)
  - `category` — e.g. "Flower", "Concentrate", "Edible"
  - `price` — retail price in USD
  - `availability` — "InStock" or "OutOfStock"
  - `scraped_at` — timestamp of last scrape
- Indexes on `dispensary_region`, `dispensary_name`, `category`, and `scraped_at`
- RLS policies allowing anon read/write (same pattern as the rest of the schema)
- Auto-update trigger on `updated_at`

### After running the SQL

Re-run the scrapers to populate the table:

```bash
# From /Users/apollo/Desktop/MTOMTO/react-web

# All Oregon Dutchie stores (~27 dispensaries, takes ~10 min)
python3 tools/scraper_dutchie.py

# M Thrive Organics — The Dalles & Joseph (fast, ~1 min)
python3 tools/scraper_mthrive.py
```

Once data is uploaded, the Competitive Pricing tab will automatically show scraped competitor prices alongside your store's prices.
