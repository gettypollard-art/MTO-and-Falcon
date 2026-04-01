// MTO Competitive Pricing — Pure utility functions

import type {
  MarkupMultiplier,
  ProductCategory,
  Region,
  PricePreview,
  ReorderPriority,
  ExportRow,
  MtoProduct,
} from './types';
import { regionLabels, categoryLabels, markupMultipliers } from './types';

// ── Price calculation (canonical formula) ─────────────────

export function computePretax(cost: number, markup: MarkupMultiplier): number {
  return Math.round(cost * markup * 100) / 100;
}

export function computeFinal(pretax: number, taxRate = 0.20): number {
  return Math.round(pretax * (1 + taxRate) * 100) / 100;
}

export function computeFullPrice(cost: number, markup: MarkupMultiplier, taxRate = 0.20): PricePreview {
  const pretax = computePretax(cost, markup);
  const final_ = computeFinal(pretax, taxRate);
  return {
    unitCost: cost,
    markup,
    pretax,
    final: final_,
    tier: classifyTier(final_),
  };
}

// ── Tier classification ───────────────────────────────────

export function classifyTier(finalPrice: number): string {
  if (finalPrice <= 15) return 'Budget';
  if (finalPrice <= 30) return 'Mid';
  if (finalPrice <= 60) return 'Premium';
  return 'Ultra-Premium';
}

// ── USD formatting ────────────────────────────────────────

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUSD(value: number): string {
  return usdFormatter.format(value);
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

// ── Region helpers ────────────────────────────────────────

export function regionLabel(region: Region): string {
  return regionLabels[region] ?? region;
}

export function categoryLabel(category: ProductCategory): string {
  return categoryLabels[category] ?? category;
}

// ── Seasonal factor (simple month-based multiplier) ───────

export function seasonalFactor(month: number): number {
  // month 0-11 (JS Date.getMonth())
  // Higher demand in summer (Jun-Aug) and holidays (Nov-Dec)
  const factors: Record<number, number> = {
    0: 0.85, // Jan
    1: 0.80, // Feb
    2: 0.90, // Mar
    3: 0.95, // Apr
    4: 1.00, // May
    5: 1.10, // Jun
    6: 1.15, // Jul
    7: 1.10, // Aug
    8: 1.00, // Sep
    9: 0.95, // Oct
    10: 1.05, // Nov
    11: 1.10, // Dec
  };
  return factors[month] ?? 1.0;
}

// ── Reorder logic ─────────────────────────────────────────

export function computeReorderPriority(daysUntilStockout: number): ReorderPriority {
  if (daysUntilStockout <= 3) return 'critical';
  if (daysUntilStockout <= 7) return 'high';
  if (daysUntilStockout <= 14) return 'medium';
  return 'low';
}

export function computeSuggestedReorderQty(
  avgDailySales: number,
  leadTimeDays: number = 7,
  safetyStockDays: number = 5,
): number {
  return Math.ceil(avgDailySales * (leadTimeDays + safetyStockDays));
}

export function computeDaysUntilStockout(
  currentStock: number,
  avgDailySales: number,
): number {
  if (avgDailySales <= 0) return 999;
  return Math.floor(currentStock / avgDailySales);
}

// ── Markup helpers ────────────────────────────────────────

export function isValidMarkup(value: number): value is MarkupMultiplier {
  return markupMultipliers.includes(value as MarkupMultiplier);
}

export function nearestMarkup(value: number): MarkupMultiplier {
  let best: MarkupMultiplier = 2.0;
  let bestDist = Math.abs(value - best);
  for (const m of markupMultipliers) {
    const dist = Math.abs(value - m);
    if (dist < bestDist) {
      best = m;
      bestDist = dist;
    }
  }
  return best;
}

// ── CSV export helper ─────────────────────────────────────

export function productsToExportRows(
  products: MtoProduct[],
  storeName: string,
): ExportRow[] {
  return products.map((p) => ({
    productName: p.name,
    brand: p.brand,
    category: categoryLabel(p.category),
    sku: p.sku,
    unitCost: formatUSD(p.unit_cost),
    markup: `${p.markup_multiplier}x`,
    pretaxPrice: formatUSD(p.pretax_price),
    finalPrice: formatUSD(p.final_price),
    storeName,
  }));
}

export function exportRowsToCsv(rows: ExportRow[]): string {
  const headers = [
    'Product Name',
    'Brand',
    'Category',
    'SKU',
    'Unit Cost',
    'Markup',
    'Pre-Tax Price',
    'Final Price',
    'Store',
  ];
  const csvContent = [
    headers.join(','),
    ...rows.map((r) =>
      [
        csvEscape(r.productName),
        csvEscape(r.brand),
        csvEscape(r.category),
        csvEscape(r.sku),
        csvEscape(r.unitCost),
        csvEscape(r.markup),
        csvEscape(r.pretaxPrice),
        csvEscape(r.finalPrice),
        csvEscape(r.storeName),
      ].join(','),
    ),
  ];
  return csvContent.join('\n');
}

export function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function arrayToCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\n');
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Profit margin ─────────────────────────────────────────

export function computeProfitMargin(revenue: number, cost: number): number {
  if (revenue === 0) return 0;
  return Math.round(((revenue - cost) / revenue) * 10000) / 100;
}
