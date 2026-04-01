/**
 * MTO Pricing Advisor Engine
 *
 * Pure functions — no React, no Supabase, no side effects.
 * Every function is unit-testable with plain numeric inputs.
 *
 * Pipeline:
 *   prices[] → buildMarketStats → position → pickAction → buildRecommendation
 */

import type {
  MarketStats,
  PricingAction,
  PricingRecommendation,
  ProductCategory,
  CompetitorWithDistance,
  BusinessRule,
  ReorderPriority,
} from '../types';
import { evaluateRules } from './businessRules';

// ── Constants ─────────────────────────────────────────────

/** Position thresholds (ourPrice / median) */
const THRESHOLD_TOO_EXPENSIVE  = 1.05;  // > 5% above median → lower
const THRESHOLD_OPTIMAL_HIGH   = 1.03;  // ≤ 3% above median → hold
const THRESHOLD_OPTIMAL_LOW    = 0.97;  // ≥ 3% below median → hold
const THRESHOLD_SLIGHT_LOW     = 0.90;  // < 10% below median → small raise

/** Market spread (max − min) above which the market is "wide/unstable" */
const WIDE_MARKET_SPREAD_RATIO = 0.60;  // spread > 60% of median → conservative

/** Default minimum margin (as a fraction of cost) we will never undercut */
const DEFAULT_MIN_MARGIN = 0.20;        // 20%

/** How far (km) before a competitor's weight starts to drop */
const PROXIMITY_HALF_DISTANCE_KM = 50; // weight = 0.5 at 50 km

// ── Geometry helpers ──────────────────────────────────────

/**
 * Parse a "lat,lng" string.  Returns null if the string is not that format.
 */
export function parseLatLng(location: string): [number, number] | null {
  if (!location) return null;
  const parts = location.split(',');
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng)) return null;
  return [lat, lng];
}

/**
 * Haversine distance in kilometres between two lat/lng pairs.
 */
export function haversineKm(
  [lat1, lon1]: [number, number],
  [lat2, lon2]: [number, number],
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Proximity weight: 1.0 when distanceKm = 0, decaying toward 0 exponentially.
 * At PROXIMITY_HALF_DISTANCE_KM it equals ~0.5.
 * Returns 1.0 when distanceKm is null (unknown distance = full weight).
 */
export function proximityWeight(distanceKm: number | null): number {
  if (distanceKm === null) return 1.0;
  return Math.exp((-Math.LN2 * distanceKm) / PROXIMITY_HALF_DISTANCE_KM);
}

/**
 * Freshness weight based on how old the competitor price data is.
 * Half-life of 14 days: 1.0 today → ~0.5 at 14 days → ~0.25 at 28 days.
 * Unknown age (null) gets a conservative 0.5 weight.
 */
export function freshnessWeight(capturedAt: string | null): number {
  if (!capturedAt) return 0.5;
  const ageMs = Date.now() - new Date(capturedAt).getTime();
  if (ageMs < 0) return 1.0; // future-dated records treated as fresh
  const ageDays = ageMs / 86_400_000;
  return Math.exp((-Math.LN2 * ageDays) / 14);
}

// ── Market stats ──────────────────────────────────────────

/**
 * Build market statistics from an array of competitor prices.
 * Optionally weight by proximity (competitors closer to us matter more).
 */
export function buildMarketStats(
  competitors: CompetitorWithDistance[],
): MarketStats {
  if (competitors.length === 0) {
    return { min: 0, median: 0, max: 0, spread: 0, sampleSize: 0, avgFreshnessScore: 0, oldestCaptureMs: 0 };
  }

  // Combined weight = proximity × freshness.
  // If all weights are 1 this degenerates to a plain sorted median.
  const weighted = competitors.map((c) => ({
    price: c.competitor_price,
    weight: proximityWeight(c.distanceKm) * freshnessWeight(c.capturedAt),
  }));

  // Weighted median: sort by price, then find the point where cumulative
  // weight reaches 50% of total weight.
  const sorted = [...weighted].sort((a, b) => a.price - b.price);
  const totalWeight = sorted.reduce((s, x) => s + x.weight, 0);
  let cumulative = 0;
  let median = sorted[0].price;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= totalWeight / 2) {
      median = item.price;
      break;
    }
  }

  const prices = competitors.map((c) => c.competitor_price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  const avgFreshnessScore =
    competitors.reduce((s, c) => s + freshnessWeight(c.capturedAt), 0) / competitors.length;

  const captureTimes = competitors
    .map((c) => (c.capturedAt ? new Date(c.capturedAt).getTime() : 0))
    .filter((t) => t > 0);
  const oldestCaptureMs = captureTimes.length > 0 ? Math.min(...captureTimes) : 0;

  return {
    min,
    median,
    max,
    spread: max - min,
    sampleSize: competitors.length,
    avgFreshnessScore: Math.round(avgFreshnessScore * 1000) / 1000,
    oldestCaptureMs,
  };
}

// ── Confidence ────────────────────────────────────────────

/**
 * Compute a 0–1 confidence score for the recommendation, plus short driver strings.
 * Higher confidence = the advisor is more certain the action is correct.
 */
export function computeConfidence(
  stats: MarketStats,
  position: number,
  action: PricingAction,
): { confidence: number; drivers: string[] } {
  const drivers: string[] = [];
  let score = 1.0;

  // Sample size: more competitors → more reliable
  if (stats.sampleSize === 0) {
    return { confidence: 0, drivers: ['No competitor data'] };
  } else if (stats.sampleSize === 1) {
    score -= 0.30;
    drivers.push('Only 1 competitor');
  } else if (stats.sampleSize < 4) {
    score -= 0.10;
    drivers.push(`${stats.sampleSize} competitors`);
  } else {
    drivers.push(`${stats.sampleSize} competitors`);
  }

  // Spread: wide market = noisy signal
  if (stats.median > 0) {
    const spreadRatio = stats.spread / stats.median;
    if (spreadRatio > 0.80) {
      score -= 0.25;
      drivers.push('Very wide market spread');
    } else if (spreadRatio > 0.40) {
      score -= 0.10;
      drivers.push('Wide market spread');
    }
  }

  // Freshness
  if (stats.avgFreshnessScore < 0.25) {
    score -= 0.25;
    drivers.push('Data >28 days old');
  } else if (stats.avgFreshnessScore < 0.50) {
    score -= 0.12;
    drivers.push('Data >14 days old');
  } else if (stats.avgFreshnessScore < 0.75) {
    score -= 0.05;
    drivers.push('Data ~1 week old');
  } else {
    drivers.push('Fresh data');
  }

  // Price far from median reduces confidence
  if (Math.abs(position - 1) > 0.30) {
    score -= 0.10;
    drivers.push('Price far from market');
  }

  // Hold actions carry lower risk → slightly higher confidence
  if (action === 'hold') score += 0.05;

  return {
    confidence: Math.round(Math.max(0, Math.min(1, score)) * 100) / 100,
    drivers,
  };
}

// ── Decision engine ───────────────────────────────────────

/**
 * Determine the recommended action given our price vs. market.
 */
export function pickAction(
  ourPrice: number,
  stats: MarketStats,
): PricingAction {
  if (stats.sampleSize === 0) return 'hold';

  const position = stats.median > 0 ? ourPrice / stats.median : 1;
  const wideMarket =
    stats.median > 0 && stats.spread / stats.median > WIDE_MARKET_SPREAD_RATIO;

  // Case 1: too expensive
  if (position > THRESHOLD_TOO_EXPENSIVE) return 'lower';

  // Case 2: we are the cheapest
  if (ourPrice <= stats.min && stats.sampleSize > 1) return 'raise';

  // Case 3: within optimal band → hold
  if (position >= THRESHOLD_OPTIMAL_LOW && position <= THRESHOLD_OPTIMAL_HIGH)
    return 'hold';

  // Case 4: wide/volatile market → conservative regardless of direction
  if (wideMarket) return 'hold_conservative';

  // Slightly above median (inside 1.03–1.05) — hold conservatively
  if (position > THRESHOLD_OPTIMAL_HIGH && position <= THRESHOLD_TOO_EXPENSIVE)
    return 'hold_conservative';

  // Slightly below median (0.90–0.97) — can nudge price up small amount
  if (position >= THRESHOLD_SLIGHT_LOW && position < THRESHOLD_OPTIMAL_LOW)
    return 'small_raise';

  // Well below median (< 0.90) — more aggressive raise
  if (position < THRESHOLD_SLIGHT_LOW) return 'raise';

  return 'hold';
}

/**
 * Compute a suggested price for the given action.
 * The cost floor ensures we never go below `cost × (1 + minMarginPct)`.
 */
export function computeSuggestedPrice(
  ourPrice: number,
  ourCost: number,
  action: PricingAction,
  stats: MarketStats,
  minMarginPct = DEFAULT_MIN_MARGIN,
): { price: number; marginGuarded: boolean } {
  const floor = Math.round(ourCost * (1 + minMarginPct) * 100) / 100;
  let raw = ourPrice;

  switch (action) {
    case 'lower':
      // Suggest 2% below median (just below market midpoint)
      raw = Math.round(stats.median * 0.98 * 100) / 100;
      break;
    case 'raise':
      // Lift to just above the minimum but stay under optimal band top
      raw = Math.round(Math.min(stats.min * 1.05, stats.median * 0.99) * 100) / 100;
      break;
    case 'small_raise':
      // Nudge 1.5% toward median
      raw = Math.round(ourPrice * 1.015 * 100) / 100;
      break;
    case 'hold_conservative':
    case 'hold':
    default:
      raw = ourPrice;
      break;
  }

  const guarded = raw < floor;
  return { price: Math.max(raw, floor), marginGuarded: guarded };
}

// ── Reason string ─────────────────────────────────────────

export function buildReason(
  action: PricingAction,
  position: number,
  ourPrice: number,
  suggestedPrice: number,
  stats: MarketStats,
  marginGuarded: boolean,
): string {
  const pctAbove = ((position - 1) * 100).toFixed(1);
  const diffPct = (((suggestedPrice - ourPrice) / ourPrice) * 100).toFixed(1);
  const cheapestByPct = stats.min > 0
    ? (((ourPrice - stats.min) / stats.min) * 100).toFixed(1)
    : '0.0';

  let base = '';
  switch (action) {
    case 'lower':
      base = `Currently ${pctAbove}% above median — suggest lowering by ${Math.abs(+diffPct).toFixed(1)}%`;
      break;
    case 'raise':
      base = ourPrice <= stats.min
        ? `Currently cheapest by ${cheapestByPct}% — suggest raising to stay competitive`
        : `Well below median (${Math.abs(+pctAbove).toFixed(1)}% under) — suggest raising`;
      break;
    case 'small_raise':
      base = `${Math.abs(+pctAbove).toFixed(1)}% below median — small raise of ${diffPct}% recommended`;
      break;
    case 'hold_conservative':
      base =
        stats.spread / stats.median > WIDE_MARKET_SPREAD_RATIO
          ? `Wide market spread ($${stats.spread.toFixed(2)}) — hold and monitor`
          : `Within ${pctAbove}% of median — conservative hold`;
      break;
    case 'hold':
    default:
      base = `Within optimal range (${pctAbove}% of median) — hold`;
      break;
  }

  return marginGuarded
    ? `${base} [margin floor applied — cost + ${(DEFAULT_MIN_MARGIN * 100).toFixed(0)}%]`
    : base;
}

// ── Main entry point ──────────────────────────────────────

export interface AdvisorInput {
  productId: string;
  productName: string;
  category: ProductCategory;
  ourPrice: number;         // final_price
  ourCost: number;          // unit_cost
  competitors: CompetitorWithDistance[];
  minMarginPct?: number;    // default 0.20
  /** Days of stock remaining from reorder suggestions; null = unknown */
  inventoryDays?: number | null;
  /** Reorder priority from MtoReorderSuggestion */
  reorderPriority?: ReorderPriority | null;
  /** Business rules to evaluate before finalising the suggestion */
  rules?: BusinessRule[];
}

export function runAdvisor(input: AdvisorInput): PricingRecommendation {
  const stats = buildMarketStats(input.competitors);
  const minMarginPct = input.minMarginPct ?? DEFAULT_MIN_MARGIN;

  let action = pickAction(input.ourPrice, stats);
  let inventoryOverride = false;

  // ── Inventory safety overrides ─────────────────────────
  const invDays = input.inventoryDays ?? null;
  const invPriority = input.reorderPriority ?? null;
  if (invDays !== null) {
    // Critically low stock — never lower price; protect margins to slow sales
    if (
      (invDays < 7 || invPriority === 'critical') &&
      (action === 'lower' || action === 'small_lower')
    ) {
      action = 'hold_conservative';
      inventoryOverride = true;
    }
    // Very high stock (>30 days) and currently holding — nudge price up to clear
    if (invDays > 30 && action === 'hold') {
      action = 'small_raise';
      inventoryOverride = true;
    }
  }

  let { price: suggestedPrice, marginGuarded } = computeSuggestedPrice(
    input.ourPrice,
    input.ourCost,
    action,
    stats,
    minMarginPct,
  );

  // ── Business rules override ────────────────────────────
  const ruleResult = evaluateRules(
    input.rules ?? [],
    input.productId,
    input.category,
    suggestedPrice,
    input.ourPrice,
  );
  let appliedRule: BusinessRule | null = null;
  if (ruleResult.vetoSuggestion) {
    suggestedPrice = input.ourPrice;
    action = 'hold';
    appliedRule = ruleResult.matchedRule;
  } else if (ruleResult.cappedPrice !== null) {
    suggestedPrice = ruleResult.cappedPrice;
    appliedRule = ruleResult.matchedRule;
  }

  const position = stats.median > 0 ? input.ourPrice / stats.median : 1;

  const { confidence, drivers } = computeConfidence(stats, position, action);
  if (inventoryOverride) drivers.push('Inventory signal applied');
  if (appliedRule) drivers.push(`Rule: ${appliedRule.reason || appliedRule.ruleType}`);

  // Average proximity weight across all competitors (informational)
  const avgWeight =
    input.competitors.length > 0
      ? input.competitors.reduce(
          (s, c) => s + proximityWeight(c.distanceKm),
          0,
        ) / input.competitors.length
      : 1.0;

  const reason = buildReason(
    action,
    position,
    input.ourPrice,
    suggestedPrice,
    stats,
    marginGuarded,
  );

  return {
    productId: input.productId,
    productName: input.productName,
    category: input.category,
    ourPrice: input.ourPrice,
    ourCost: input.ourCost,
    suggestedPrice,
    action,
    marketStats: stats,
    position,
    reason,
    marginGuarded,
    proximityWeight: Math.round(avgWeight * 100) / 100,
    confidence,
    drivers,
    appliedRule,
    inventoryOverride,
  };
}
