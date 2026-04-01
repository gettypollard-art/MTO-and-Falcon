// MTO Pricing — usePricingAdvisor hook
//
// Bridges engine ↔ existing data sources.
// Merges manual mto_regional_pricing + scraped competitor_products for richer recommendations.

import { useMemo } from 'react';
import type {
  MtoProduct,
  MtoRegionalPricing,
  MtoReorderSuggestion,
  CompetitorProduct,
  PricingRecommendation,
  CompetitorWithDistance,
  BusinessRule,
  ProductCategory,
} from '../types';
import { runAdvisor } from '../engine/pricingAdvisor';
import { parseLatLng, haversineKm } from '../engine/pricingAdvisor';

// Map raw scraped category strings → our ProductCategory enum
const SCRAPED_CAT_MAP: Record<string, ProductCategory> = {
  flower: 'Flower', flowers: 'Flower', indica: 'Flower', sativa: 'Flower', hybrid: 'Flower',
  'pre-roll': 'PreRolls', 'pre-rolls': 'PreRolls', preroll: 'PreRolls', prerolls: 'PreRolls',
  edible: 'Edibles', edibles: 'Edibles', drink: 'Edibles',
  concentrate: 'Concentrates', concentrates: 'Concentrates',
  vape: 'Vapes', vapes: 'Vapes', vaporizer: 'Vapes', cartridge: 'Vapes',
  topical: 'Topicals', topicals: 'Topicals',
  tincture: 'Tinctures', tinctures: 'Tinctures',
  cbd: 'CBD', seeds: 'Seeds',
  accessory: 'Paraphernalia', accessories: 'Paraphernalia',
  paraphernalia: 'Paraphernalia', gear: 'Paraphernalia',
};

function normScrapedCategory(raw: string): ProductCategory | null {
  return SCRAPED_CAT_MAP[raw.toLowerCase().trim()] ?? null;
}

interface UsePricingAdvisorOptions {
  products: MtoProduct[];
  regionalPricing: MtoRegionalPricing[];
  /** Scraped competitor_products rows — merged with regionalPricing for richer data */
  scrapedCompetitors?: CompetitorProduct[];
  /** Optional "lat,lng" string from the store's location field */
  storeLocation?: string;
  /** Minimum margin fraction, default 0.20 */
  minMarginPct?: number;
  /** Reorder suggestions for inventory-aware overrides */
  reorderSuggestions?: MtoReorderSuggestion[];
  /** Business rules to enforce */
  rules?: BusinessRule[];
}

export function usePricingAdvisor({
  products,
  regionalPricing,
  scrapedCompetitors = [],
  storeLocation,
  minMarginPct = 0.20,
  reorderSuggestions = [],
  rules = [],
}: UsePricingAdvisorOptions): PricingRecommendation[] {
  const storeCoords = useMemo(
    () => (storeLocation ? parseLatLng(storeLocation) : null),
    [storeLocation],
  );

  const reorderByProductId = useMemo(
    () => new Map(reorderSuggestions.map((r) => [r.product_id, r])),
    [reorderSuggestions],
  );

  return useMemo<PricingRecommendation[]>(() => {
    if (!products.length || (regionalPricing.length === 0 && scrapedCompetitors.length === 0)) return [];

    return products
      .filter((p) => p.is_active)
      .map((product) => {
        // ── Source 1: mto_regional_pricing (manual) ──
        const exactMatches = regionalPricing.filter((r) => r.product_id === product.id);
        const categoryMatches = regionalPricing.filter((r) => r.category === product.category);
        const manualSource = exactMatches.length > 0 ? exactMatches : categoryMatches;

        const manualCompetitors: CompetitorWithDistance[] = manualSource.map((r) => {
          let distanceKm: number | null = null;
          if (storeCoords) {
            const parts = r.competitor_name.split('|');
            if (parts.length === 2) {
              const coords = parseLatLng(parts[1].trim());
              if (coords) distanceKm = haversineKm(storeCoords, coords);
            }
          }
          return {
            competitor_name: r.competitor_name.split('|')[0].trim(),
            competitor_price: r.competitor_price,
            distanceKm,
            capturedAt: r.captured_at ?? null,
          };
        });

        // ── Source 2: competitor_products (scraped) ──
        const scrapedSource = scrapedCompetitors.filter((r) => {
          if (r.price == null) return false;
          return normScrapedCategory(r.category) === product.category;
        });

        const scrapedAsCompetitors: CompetitorWithDistance[] = scrapedSource.map((r) => ({
          competitor_name: r.dispensary_name,
          competitor_price: r.price as number,
          distanceKm: null,   // no geo data on scraped rows
          capturedAt: r.scraped_at ?? null,
        }));

        // Merge — deduplicate by name+price
        const seen = new Set<string>();
        const allCompetitors: CompetitorWithDistance[] = [];
        for (const c of [...manualCompetitors, ...scrapedAsCompetitors]) {
          const key = `${c.competitor_name}|${c.competitor_price}`;
          if (!seen.has(key)) { seen.add(key); allCompetitors.push(c); }
        }

        if (allCompetitors.length === 0) return null;

        const reorder = reorderByProductId.get(product.id);

        return runAdvisor({
          productId:       product.id,
          productName:     product.name,
          category:        product.category,
          ourPrice:        product.final_price,
          ourCost:         product.unit_cost,
          competitors:     allCompetitors,
          minMarginPct,
          inventoryDays:   reorder?.days_until_stockout ?? null,
          reorderPriority: reorder?.priority ?? null,
          rules,
        });
      })
      .filter((r): r is PricingRecommendation => r !== null)
      .sort((a, b) => {
        const priority: Record<string, number> = {
          lower: 0, raise: 1, small_raise: 2, hold_conservative: 3, hold: 4,
        };
        return (priority[a.action] ?? 5) - (priority[b.action] ?? 5);
      });
  }, [products, regionalPricing, scrapedCompetitors, storeCoords, minMarginPct, reorderByProductId, rules]);
}
