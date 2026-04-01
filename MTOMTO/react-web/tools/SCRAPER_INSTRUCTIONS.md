# Custom Web Scraper Instructions
### Treasure Valley Cannabis → Supabase

---

## Step 1 — Run the database migration

1. Go to your **Supabase project** → open the **SQL Editor**
2. Open the file `supabase/competitor_products.sql` in this project
3. Copy the entire contents and paste it into the SQL Editor
4. Click **Run**

That creates the `competitor_products` table where all scraped products will be stored.

---

## Step 2 — Add your Supabase credentials

1. In the `tools/` folder, find the file `.env.example`
2. Make a copy of it and name the copy `.env` (in the same `tools/` folder)
3. Open `tools/.env` and fill in your two values:

```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

> You can find both of these in your Supabase project under **Settings → API**.

---

## Step 3 — Install Python dependencies

Open a terminal, navigate to the project, and run:

```bash
pip install -r tools/requirements.txt
```

If you have multiple Python versions, use `pip3` instead of `pip`.

---

## Step 4 — Run the scraper

### Option A — Button in the web app (recommended)

Start the local scraper server in a terminal and leave it running:

```bash
python tools/scraper_server.py
```

You'll see:
```
MTO Scraper Server running at http://localhost:5001
```

Now open the web app, go to **Pricing → Competitive**, and click the **Scrape Competitor** button. The button shows a spinner while it runs, then "X products synced" when done.

> Keep `scraper_server.py` running any time you want to use the button.

---

### Option B — Run from the terminal directly

**Test run first (20 products, no upload):**
```bash
python tools/scraper_treasure_valley.py --limit 20 --output out/test.json --no-upload
```
This saves a sample to `out/test.json` so you can check the data looks right before uploading anything.

**Full run (scrapes everything and uploads to Supabase):**
```bash
python tools/scraper_treasure_valley.py --output out/tv_products.json
```

---

## What the flags do (terminal mode)

| Flag | What it does |
|------|-------------|
| `--limit 50` | Only scrape the first 50 products (good for testing) |
| `--output out/file.json` | Also save results to a local JSON file |
| `--no-upload` | Scrape only — don't send anything to Supabase |

---

## Where to see the results

- **Web app:** Pricing → Competitive tab (after scraping, data appears in the table)
- **Locally:** open `out/tv_products.json` in any text editor or browser
- **Supabase:** go to your project → **Table Editor** → `competitor_products`

---

## Troubleshooting

**Button says "Server Offline"** — The scraper server isn't running. Open a terminal and run `python tools/scraper_server.py`.

**"No product URLs found"** — The website structure may have changed. Check that `https://www.treasurevalleycannabis.com/sitemap.xml` is accessible in a browser.

**"SUPABASE_URL and SUPABASE_ANON_KEY must be set"** — Make sure you created `tools/.env` (not just `.env.example`) and filled in both values.

**"pip not found"** — Try `pip3` instead, or install Python from python.org.
