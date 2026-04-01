// MTO Pricing — Vendor Forecast Tab

import { useMemo } from 'react';
import type { MtoProduct, MtoMonthlySales } from '../types';
import { formatUSD, seasonalFactor } from '../utils';
import { categoryLabels } from '../types';

interface Props {
  products: MtoProduct[];
  rawSales: MtoMonthlySales[];
}

interface ForecastRow {
  category: string;
  productCount: number;
  avgUnitCost: number;
  estMonthlyUnits: number;
  estMonthlyCost: number;
  nextMonthFactor: number;
  projectedNextCost: number;
}

export function VendorForecastTab({ products, rawSales }: Props) {
  const now          = new Date();
  const currentMonth = now.getMonth();
  const nextMonth    = (currentMonth + 1) % 12;

  const forecast = useMemo<ForecastRow[]>(() => {
    const categories = [...new Set(products.map((p) => p.category))];
    if (categories.length === 0) return [];

    // Build a map: product_id → category (for joining sales to categories)
    const productCategoryMap = new Map(products.map((p) => [p.id, p.category]));

    // Total units sold per category from actual sales data
    const unitsByCat = new Map<string, number>();
    const monthSet   = new Set<string>();
    for (const s of rawSales) {
      monthSet.add(s.month);
      const cat = productCategoryMap.get(s.product_id);
      if (cat) unitsByCat.set(cat, (unitsByCat.get(cat) ?? 0) + s.quantity_sold);
    }
    const numMonths = Math.max(monthSet.size, 1);

    return categories.map((cat) => {
      const catProducts = products.filter((p) => p.category === cat);
      const avgUnitCost = catProducts.length > 0
        ? catProducts.reduce((s, p) => s + p.unit_cost, 0) / catProducts.length
        : 0;

      // Average monthly units from real sales, or fall back to 1 unit/product/month
      const totalUnits = unitsByCat.get(cat) ?? 0;
      const estMonthlyUnits = totalUnits > 0
        ? totalUnits / numMonths
        : catProducts.length;

      const estMonthlyCost    = avgUnitCost * estMonthlyUnits;
      const nFactor           = seasonalFactor(nextMonth);
      const projectedNextCost = Math.round(estMonthlyCost * nFactor * 100) / 100;

      return {
        category:          categoryLabels[cat] ?? cat,
        productCount:      catProducts.length,
        avgUnitCost,
        estMonthlyUnits:   Math.round(estMonthlyUnits * 10) / 10,
        estMonthlyCost,
        nextMonthFactor:   nFactor,
        projectedNextCost,
      };
    }).sort((a, b) => b.projectedNextCost - a.projectedNextCost);
  }, [products, rawSales, nextMonth]);

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  if (products.length === 0) {
    return (
      <div className="pricing-card">
        <h3>Vendor Forecast</h3>
        <p className="pricing-empty">Add products to see vendor cost forecasts based on seasonal demand factors.</p>
      </div>
    );
  }

  const dataSource = rawSales.length > 0 ? 'actual sales data' : 'product count estimate (no sales data yet)';

  return (
    <div className="pricing-card">
      <h3>Vendor Forecast</h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.84rem', margin: '0 0 0.8rem' }}>
        Projected vendor spend for <strong>{monthNames[nextMonth]}</strong> — based on {dataSource} × seasonal factor.
      </p>

      <div className="pricing-stats-row">
        <div className="pricing-stat-card">
          <div className="stat-label">{monthNames[currentMonth]} Seasonal</div>
          <div className="stat-value">{seasonalFactor(currentMonth).toFixed(2)}×</div>
        </div>
        <div className="pricing-stat-card">
          <div className="stat-label">{monthNames[nextMonth]} Seasonal</div>
          <div className="stat-value">{seasonalFactor(nextMonth).toFixed(2)}×</div>
        </div>
        <div className="pricing-stat-card">
          <div className="stat-label">Total Projected</div>
          <div className="stat-value">{formatUSD(forecast.reduce((s, r) => s + r.projectedNextCost, 0))}</div>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="pricing-table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="cell-right">Products</th>
              <th className="cell-right">Avg Unit Cost</th>
              <th className="cell-right">Est. Units/Mo</th>
              <th className="cell-right">Avg Monthly Cost</th>
              <th className="cell-right">{monthNames[nextMonth]} Factor</th>
              <th className="cell-right">Projected Cost</th>
            </tr>
          </thead>
          <tbody>
            {forecast.map((row) => (
              <tr key={row.category}>
                <td>{row.category}</td>
                <td className="cell-right">{row.productCount}</td>
                <td className="cell-right">{formatUSD(row.avgUnitCost)}</td>
                <td className="cell-right">{row.estMonthlyUnits}</td>
                <td className="cell-right">{formatUSD(row.estMonthlyCost)}</td>
                <td className="cell-right">{row.nextMonthFactor.toFixed(2)}×</td>
                <td className="cell-right">{formatUSD(row.projectedNextCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
