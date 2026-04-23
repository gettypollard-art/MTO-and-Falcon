// MTO Pricing — Competitive Pricing Tab

import { useState, useMemo, useEffect, useRef } from 'react';
import type { MtoReorderSuggestion, Region, ProductCategory, ComparisonRow, BusinessRule, RuleType } from '../types';
import { regions, regionLabels, productCategories, categoryLabels } from '../types';
import { formatUSD, formatPercent, arrayToCsv, downloadCsv } from '../utils';
import { useStores } from '../hooks/useStores';
import { useProducts } from '../hooks/useProducts';
import { useRegionalPricing } from '../hooks/useRegionalPricing';
import { useCompetitorProducts } from '../hooks/useCompetitorProducts';
import { useCompetitorStores } from '../hooks/useCompetitorStores';
import { usePricingAdvisor } from '../hooks/usePricingAdvisor';
import { PricingAdvisor } from './PricingAdvisor';
import { AdvisorRules } from './AdvisorRules';
import type { AddRuleOptions } from '../hooks/useAdvisorRules';
import { isSupabaseConfigured } from '../../backend/supabaseClient';
import { fetchLastScrapedAt } from '../services/supabaseService';

// Map Dutchie/WeedMenu category strings → our ProductCategory enum
const CATEGORY_MAP: Record<string, ProductCategory> = {
  flower:        'Flower',
  flowers:       'Flower',
  indica:        'Flower',
  sativa:        'Flower',
  hybrid:        'Flower',
  'pre-roll':    'PreRolls',
  'pre-rolls':   'PreRolls',
  preroll:       'PreRolls',
  prerolls:      'PreRolls',
  edible:        'Edibles',
  edibles:       'Edibles',
  drink:         'Edibles',
  concentrate:   'Concentrates',
  concentrates:  'Concentrates',
  vape:          'Vapes',
  vapes:         'Vapes',
  vaporizer:     'Vapes',
  vaporizers:    'Vapes',
  cartridge:     'Vapes',
  cartridges:    'Vapes',
  topical:       'Topicals',
  topicals:      'Topicals',
  tincture:      'Tinctures',
  tinctures:     'Tinctures',
  cbd:           'CBD',
  seeds:         'Seeds',
  accessory:     'Paraphernalia',
  accessories:   'Paraphernalia',
  paraphernalia: 'Paraphernalia',
  gear:          'Paraphernalia',
};

function normCategory(raw: string): ProductCategory | null {
  return CATEGORY_MAP[raw.toLowerCase().trim()] ?? null;
}

// ── Scraper hook ──────────────────────────────────────────────────────────────

const SCRAPER_URL = 'http://localhost:5001';

type ScrapeStatus = 'idle' | 'running' | 'done' | 'error' | 'unreachable';

interface ScraperState {
  status: ScrapeStatus;
  started_at: string | null;
  finished_at: string | null;
  products_found: number | null;
  error: string | null;
}

function useScraper() {
  const [state, setState] = useState<ScraperState>({
    status: 'idle', started_at: null, finished_at: null, products_found: null, error: null,
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const poll = () => {
    fetch(`${SCRAPER_URL}/scrape/status`)
      .then((r) => r.json())
      .then((data) => { setState(data); if (data.status !== 'running') stopPoll(); })
      .catch(() => { setState((s) => ({ ...s, status: 'unreachable' })); stopPoll(); });
  };

  const startScrape = (region?: string, category?: string) => {
    setState({ status: 'running', started_at: null, finished_at: null, products_found: null, error: null });
    fetch(`${SCRAPER_URL}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region: region || null, category: category || null }),
    })
      .then((r) => {
        if (r.status === 409) { /* already running — just poll */ }
        else if (!r.ok) { setState((s) => ({ ...s, status: 'error', error: `Server responded ${r.status}` })); return; }
        stopPoll();
        pollRef.current = setInterval(poll, 2000);
      })
      .catch(() => setState((s) => ({ ...s, status: 'unreachable', error: null })));
  };

  useEffect(() => () => stopPoll(), []);
  return { state, startScrape };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  defaultStoreId: string;
  storeLocation?: string;
  reorderSuggestions?: MtoReorderSuggestion[];
  rules: BusinessRule[];
  onAddRule: (ruleType: RuleType, value: number, opts?: AddRuleOptions) => void;
  onRemoveRule: (id: string) => void;
  onToggleRule: (id: string) => void;
}

export function CompetitivePricingTab({
  defaultStoreId, storeLocation, reorderSuggestions,
  rules, onAddRule, onRemoveRule, onToggleRule,
}: Props) {
  const ourStores = useStores();

  // ── Options ──
  const [ourStoreId, setOurStoreId]         = useState<string>(defaultStoreId);
  const [selectedRegion, setSelectedRegion] = useState<Region>('All');
  const [filterCategory, setFilterCategory] = useState<ProductCategory | ''>('');
  const [filterCompetitor, setFilterCompetitor] = useState<string>('');

  const resolvedOurStoreId = ourStoreId || defaultStoreId;
  const ourStore   = ourStores.data.find((s) => s.id === resolvedOurStoreId) ?? null;
  const ourProducts = useProducts(resolvedOurStoreId);

  const { state: scraper, startScrape } = useScraper();

  const regional         = useRegionalPricing(selectedRegion);
  const scraped          = useCompetitorProducts(selectedRegion);
  const competitorStores = useCompetitorStores(
    selectedRegion,
    `${scraper.status}|${scraper.finished_at ?? ''}|${scraped.data.length}`,
  );

  // Last-scraped freshness
  const [lastScraped, setLastScraped] = useState<string | null>(null);
  const [lastScrapedAgeDays, setLastScrapedAgeDays] = useState<number | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      queueMicrotask(() => {
        setLastScraped(null);
        setLastScrapedAgeDays(null);
      });
      return;
    }
    fetchLastScrapedAt(selectedRegion !== 'All' ? selectedRegion : undefined)
      .then((value) => {
        setLastScraped(value);
        if (!value) {
          setLastScrapedAgeDays(null);
          return;
        }
        const parsed = new Date(value).getTime();
        if (Number.isNaN(parsed)) {
          setLastScrapedAgeDays(null);
          return;
        }
        const days = Math.floor((new Date().getTime() - parsed) / 86_400_000);
        setLastScrapedAgeDays(Math.max(0, days));
      })
      .catch(() => {
        setLastScraped(null);
        setLastScrapedAgeDays(null);
      });
  }, [selectedRegion, scraped.data.length]);

  // When scrape completes, refresh both store lists and competitor rows.
  useEffect(() => {
    if (scraper.status !== 'done') return;
    void scraped.refresh();
    void ourStores.refresh();
  }, [scraper.status, scraper.finished_at, scraped, ourStores]);

  const competitorStoreOptions = useMemo(() => {
    const fromRegional = regional.data
      .map((row) => String(row.competitor_name ?? '').trim())
      .filter((name) => name.length > 0);
    const fromScraped = competitorStores;
    const unique = new Map<string, string>();
    for (const name of [...fromRegional, ...fromScraped]) {
      const key = name.toLocaleLowerCase();
      if (!unique.has(key)) unique.set(key, name);
    }
    return Array.from(unique.values()).sort((a, b) => a.localeCompare(b));
  }, [regional.data, competitorStores]);

  const recommendations = usePricingAdvisor({
    products:           ourProducts.data,
    regionalPricing:    regional.data,
    scrapedCompetitors: scraped.data,
    storeLocation:      ourStore?.location ?? storeLocation,
    reorderSuggestions,
    rules,
  });

  const comparisons = useMemo<ComparisonRow[]>(() => {
    if (!ourProducts.data.length) return [];

    const rows: ComparisonRow[] = [];
    const seen = new Set<string>();

    for (const product of ourProducts.data) {
      if (filterCategory && product.category !== filterCategory) continue;

      // ── Source 1: mto_regional_pricing (manual) ──
      if (regional.data.length > 0) {
        let matches = regional.data.filter((r) => r.product_id === product.id);
        if (matches.length === 0) matches = regional.data.filter((r) => r.category === product.category);
        if (filterCompetitor) matches = matches.filter((r) => r.competitor_name === filterCompetitor);
        for (const match of matches) {
          const key = `${product.id}|${match.competitor_name}|${match.competitor_price}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const diff = product.final_price - match.competitor_price;
          rows.push({
            productId: product.id, productName: product.name, category: product.category,
            ourPrice: product.final_price, competitorName: match.competitor_name || 'Unknown',
            competitorPrice: match.competitor_price, priceDifference: diff,
            priceDifferencePercent: match.competitor_price > 0 ? (diff / match.competitor_price) * 100 : 0,
            region: selectedRegion,
          });
        }
      }

      // ── Source 2: competitor_products (scraped) ──
      if (scraped.data.length > 0) {
        let scrapedMatches = scraped.data.filter((r) => {
          if (r.price == null) return false;
          return normCategory(r.category) === product.category;
        });
        if (filterCompetitor) scrapedMatches = scrapedMatches.filter((r) => r.dispensary_name === filterCompetitor);
        for (const match of scrapedMatches) {
          if (match.price == null) continue;
          const key = `${product.id}|${match.dispensary_name}|${match.price}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const diff = product.final_price - match.price;
          rows.push({
            productId: product.id, productName: product.name, category: product.category,
            ourPrice: product.final_price, competitorName: match.dispensary_name,
            competitorPrice: match.price, priceDifference: diff,
            priceDifferencePercent: match.price > 0 ? (diff / match.price) * 100 : 0,
            region: selectedRegion,
          });
        }
      }
    }
    return rows.sort((a, b) => a.priceDifferencePercent - b.priceDifferencePercent);
  }, [ourProducts.data, regional.data, scraped.data, selectedRegion, filterCategory, filterCompetitor]);

  const scrapeLabel = {
    idle:        'Scrape Competitors',
    running:     'Scraping…',
    done:        'Scrape Again',
    error:       'Retry Scrape',
    unreachable: 'Server Offline',
  }[scraper.status];

  return (
    <>
    <div className="pricing-card">

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>Competitive Pricing</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {scraper.status === 'done' && scraper.products_found != null && (
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
              {scraper.products_found.toLocaleString()} rows synced
            </span>
          )}
          {scraper.status === 'error' && (
            <span style={{ fontSize: '0.78rem', color: 'var(--warning)' }}>
              {scraper.error ?? 'Scrape failed'}
            </span>
          )}
          {scraper.status === 'unreachable' && (
            <span style={{ fontSize: '0.78rem', color: 'var(--warning)' }}>
              Run: <code style={{ fontSize: '0.75rem' }}>python tools/scraper_server.py</code>
            </span>
          )}
          <button
            className={`btn btn-sm pricing-btn-primary${scraper.status === 'running' || scraper.status === 'unreachable' ? ' pricing-btn-disabled' : ''}`}
            onClick={() => startScrape(
              selectedRegion !== 'All' ? selectedRegion : undefined,
              filterCategory || undefined,
            )}
            disabled={scraper.status === 'running' || scraper.status === 'unreachable'}
          >
            {scraper.status === 'running' && (
              <span className="pricing-spinner" style={{ width: 12, height: 12, display: 'inline-block', marginRight: '0.35rem', verticalAlign: 'middle' }} />
            )}
            {scrapeLabel}
          </button>
        </div>
      </div>

      {/* ── Filter row 1: Our Store | Region | Category ── */}
      <div style={{ marginBottom: '0.35rem', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--muted)' }}>
        OPTIONS
      </div>
      <div className="pricing-form-row" style={{ marginBottom: '0.5rem' }}>
        <label>
          Our Store
          <select value={resolvedOurStoreId} onChange={(e) => setOurStoreId(e.target.value)}>
            {ourStores.data.length === 0
              ? <option value="">Loading…</option>
              : ourStores.data.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))
            }
          </select>
        </label>
        <label>
          Competitor Store
          <select value={filterCompetitor} onChange={(e) => setFilterCompetitor(e.target.value)}>
            <option value="">All Competitors ({competitorStoreOptions.length})</option>
            {competitorStoreOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Region
          <select
            value={selectedRegion}
            onChange={(e) => {
              setSelectedRegion(e.target.value as Region);
              setFilterCompetitor('');
            }}
          >
            {regions.map((r) => (
              <option key={r} value={r}>{regionLabels[r]}</option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as ProductCategory | '')}>
            <option value="">All Categories</option>
            {productCategories.map((c) => (
              <option key={c} value={c}>{categoryLabels[c]}</option>
            ))}
          </select>
        </label>
      </div>

      {/* ── Scrape scope + freshness hint ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.6rem' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: 0 }}>
          {scraper.status === 'idle' || scraper.status === 'done' ? (
            <>
              Scrape will target:{' '}
              <strong>{selectedRegion !== 'All' ? regionLabels[selectedRegion] : 'All Regions'}</strong>
              {filterCategory ? <> · <strong>{categoryLabels[filterCategory]}</strong></> : ' · All Categories'}
            </>
          ) : null}
          {scraped.data.length > 0 && (
            <> &nbsp;·&nbsp; {scraped.data.length.toLocaleString()} competitor products</>
          )}
          {lastScraped && lastScrapedAgeDays !== null && (() => {
            const days = lastScrapedAgeDays;
            const label = days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
            const stale = days > 7;
            return (
              <> &nbsp;·&nbsp; <span style={{ color: stale ? 'var(--warning)' : 'inherit' }}>Last scraped: {label}</span></>
            );
          })()}
        </p>
        {comparisons.length > 0 && (
          <button
            className="btn btn-sm"
            style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}
            onClick={() => {
              const headers = ['Product', 'Category', 'Our Price', 'Competitor', 'Their Price', 'Difference', '%'];
              const rows = comparisons.map((r) => [
                r.productName,
                categoryLabels[r.category],
                formatUSD(r.ourPrice),
                r.competitorName,
                formatUSD(r.competitorPrice),
                `${r.priceDifference > 0 ? '+' : ''}${formatUSD(Math.abs(r.priceDifference))} ${r.priceDifference > 0 ? 'higher' : 'lower'}`,
                formatPercent(r.priceDifferencePercent),
              ]);
              downloadCsv(
                arrayToCsv(headers, rows),
                `competitor_pricing_${selectedRegion}_${new Date().toISOString().slice(0, 10)}.csv`,
              );
            }}
          >
            Export CSV
          </button>
        )}
      </div>

      {/* ── Table ── */}
      {(ourProducts.loading || regional.loading || scraped.loading) ? (
        <div className="pricing-loading"><div className="pricing-spinner" /> Loading...</div>
      ) : comparisons.length === 0 ? (
        <p className="pricing-empty">
          {ourProducts.data.length === 0
            ? 'No products for this store yet. Add products in Price Builder first.'
            : `No competitor data to compare${filterCompetitor ? ` for ${filterCompetitor}` : ''}. Try scraping competitors or adjusting filters.`}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="pricing-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th className="cell-right">Our Price</th>
                <th>Competitor</th>
                <th className="cell-right">Their Price</th>
                <th className="cell-right">Difference</th>
                <th className="cell-right">%</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((row, i) => (
                <tr key={`${row.productId}-${row.competitorName}-${i}`}>
                  <td>{row.productName}</td>
                  <td>{categoryLabels[row.category]}</td>
                  <td className="cell-right">{formatUSD(row.ourPrice)}</td>
                  <td>{row.competitorName}</td>
                  <td className="cell-right">{formatUSD(row.competitorPrice)}</td>
                  <td className={`cell-right ${row.priceDifference > 0 ? 'cell-negative' : 'cell-positive'}`}>
                    {formatUSD(Math.abs(row.priceDifference))}
                    {row.priceDifference > 0 ? ' higher' : ' lower'}
                  </td>
                  <td className={`cell-right ${row.priceDifference > 0 ? 'cell-negative' : 'cell-positive'}`}>
                    {formatPercent(row.priceDifferencePercent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    <PricingAdvisor recommendations={recommendations} />
    <AdvisorRules rules={rules} onAdd={onAddRule} onRemove={onRemoveRule} onToggle={onToggleRule} />
    </>
  );
}
