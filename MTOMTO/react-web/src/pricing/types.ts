// MTO Competitive Pricing — Type definitions
// All types match the mto_pricing_schema.sql tables exactly.

// ── Enums as union types (erasableSyntaxOnly) ─────────────

export type Region =
  | 'All'
  | 'Portland_Metro'
  | 'Southern_Oregon'
  | 'Central_Oregon'
  | 'Coastal_Oregon'
  | 'Eastern_Oregon';

export const regions: Region[] = [
  'All',
  'Portland_Metro',
  'Southern_Oregon',
  'Central_Oregon',
  'Coastal_Oregon',
  'Eastern_Oregon',
];

export const regionLabels: Record<Region, string> = {
  All: 'All Regions',
  Portland_Metro: 'Portland Metro',
  Southern_Oregon: 'Southern Oregon',
  Central_Oregon: 'Central Oregon',
  Coastal_Oregon: 'Coastal Oregon',
  Eastern_Oregon: 'Eastern Oregon',
};

export type ProductCategory =
  | 'Flower'
  | 'PreRolls'
  | 'Edibles'
  | 'Concentrates'
  | 'Vapes'
  | 'Topicals'
  | 'Tinctures'
  | 'CBD'
  | 'Seeds'
  | 'Paraphernalia';

export const productCategories: ProductCategory[] = [
  'Flower',
  'PreRolls',
  'Edibles',
  'Concentrates',
  'Vapes',
  'Topicals',
  'Tinctures',
  'CBD',
  'Seeds',
  'Paraphernalia',
];

export const categoryLabels: Record<ProductCategory, string> = {
  Flower: 'Flower',
  PreRolls: 'Pre-Rolls',
  Edibles: 'Edibles',
  Concentrates: 'Concentrates',
  Vapes: 'Vapes',
  Topicals: 'Topicals',
  Tinctures: 'Tinctures',
  CBD: 'CBD',
  Seeds: 'Seeds',
  Paraphernalia: 'Paraphernalia',
};

export type MarkupMultiplier = 1.0 | 1.5 | 2.0 | 2.5 | 3.0;

export const markupMultipliers: MarkupMultiplier[] = [1.0, 1.5, 2.0, 2.5, 3.0];

export type InvoiceStatus = 'pending' | 'parsing' | 'parsed' | 'error';

export type ReorderPriority = 'low' | 'medium' | 'high' | 'critical';

// ── Entity types (match DB rows) ─────────────────────────

export interface MtoStore {
  id: string;
  name: string;
  code: string;
  location: string;
  region: Region;
  is_active: boolean;
  created_at: string;
}

export interface MtoProduct {
  id: string;
  store_id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  sku: string;
  unit_cost: number;
  markup_multiplier: MarkupMultiplier;
  pretax_price: number;
  final_price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MtoRegionalPricing {
  id: string;
  product_id: string | null;
  region: Region;
  category: ProductCategory;
  competitor_name: string;
  competitor_price: number;
  source: string;
  captured_at: string;
  created_at: string;
}

export interface MtoInvoice {
  id: string;
  store_id: string;
  vendor_name: string;
  invoice_number: string;
  invoice_date: string | null;
  total_amount: number;
  file_path: string;
  parsed_at: string | null;
  status: InvoiceStatus;
  created_at: string;
}

export interface MtoInvoiceItem {
  id: string;
  invoice_id: string;
  product_name: string;
  category: ProductCategory;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  suggested_markup: MarkupMultiplier;
  suggested_pretax: number;
  suggested_final: number;
  matched_product_id: string | null;
  created_at: string;
}

export interface MtoMonthlySales {
  id: string;
  store_id: string;
  product_id: string;
  month: string;
  quantity_sold: number;
  revenue: number;
  cost_of_goods: number;
  profit_margin: number;
  created_at: string;
}

export interface MtoReorderSuggestion {
  id: string;
  store_id: string;
  product_id: string;
  current_stock: number;
  avg_daily_sales: number;
  days_until_stockout: number;
  suggested_reorder_qty: number;
  priority: ReorderPriority;
  created_at: string;
}

export interface CompetitorProduct {
  id: string;
  dispensary_name: string;
  dispensary_url: string;
  dispensary_region: string;
  product_url: string;
  name: string;
  brand: string;
  category: string;
  price: number | null;
  availability: string;
  scraped_at: string;
  created_at: string;
  updated_at: string;
}

// ── UI types ──────────────────────────────────────────────

export interface ComparisonRow {
  productId: string;
  productName: string;
  category: ProductCategory;
  ourPrice: number;
  competitorName: string;
  competitorPrice: number;
  priceDifference: number;
  priceDifferencePercent: number;
  region: Region;
}

export interface ExportRow {
  productName: string;
  brand: string;
  category: string;
  sku: string;
  unitCost: string;
  markup: string;
  pretaxPrice: string;
  finalPrice: string;
  storeName: string;
}

export interface PricePreview {
  unitCost: number;
  markup: MarkupMultiplier;
  pretax: number;
  final: number;
  tier: string;
}

export interface MonthlyStatsRow {
  month: string;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  avgMargin: number;
  unitsSold: number;
}

export interface InvoiceParsedItem {
  product_name: string;
  category: ProductCategory;
  quantity: number;
  unit_cost: number;
  total_cost: number;
}

export interface PricingTabKey {
  key: string;
  label: string;
}

// ── Hook return types ─────────────────────────────────────

export interface DataResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

// ── Pricing Advisor: Business Rules ──────────────────────

/** Type of constraint a business rule enforces */
export type RuleType =
  | 'min_price'        // suggested price must be ≥ value
  | 'max_price'        // suggested price must be ≤ value
  | 'freeze'           // no price change allowed — force hold
  | 'category_ceiling' // all products in category capped at value
  | 'category_floor';  // all products in category floored at value

export interface BusinessRule {
  id: string;
  ruleType: RuleType;
  value: number;
  /** When set, rule only applies to this specific product */
  productId?: string;
  /** When set (without productId), rule applies to all products in category */
  category?: ProductCategory;
  reason: string;
  active: boolean;
  createdAt: string;
}

// ── Pricing Advisor ───────────────────────────────────────

export interface MarketStats {
  min: number;
  median: number;
  max: number;
  spread: number;
  sampleSize: number;
  /** 0–1; 1.0 = all data captured today, decays ~50% every 14 days */
  avgFreshnessScore: number;
  /** Epoch ms of the oldest competitor record; 0 when timestamps unavailable */
  oldestCaptureMs: number;
}

export type PricingAction =
  | 'hold'
  | 'lower'
  | 'raise'
  | 'hold_conservative'
  | 'small_raise'
  | 'small_lower';

export interface PricingRecommendation {
  productId: string;
  productName: string;
  category: ProductCategory;
  ourPrice: number;
  ourCost: number;
  suggestedPrice: number;
  action: PricingAction;
  marketStats: MarketStats;
  position: number;             // ourPrice / median  (1.10 = 10% above market)
  reason: string;               // human-readable sentence
  marginGuarded: boolean;       // true when cost floor bumped the suggestion up
  proximityWeight: number;      // 1.0 when no distance data; <1.0 for far competitors
  confidence: number;           // 0–1; reliability of this recommendation
  drivers: string[];            // short strings explaining confidence factors
  appliedRule: BusinessRule | null; // non-null when a business rule overrode the suggestion
  inventoryOverride: boolean;   // true when inventory signal changed the action
}

// Competitor row enriched with optional distance and freshness data
export interface CompetitorWithDistance {
  competitor_name: string;
  competitor_price: number;
  /** Straight-line km from our store; null when unknown */
  distanceKm: number | null;
  /** ISO datetime of when this price was scraped; null when unknown */
  capturedAt: string | null;
}
