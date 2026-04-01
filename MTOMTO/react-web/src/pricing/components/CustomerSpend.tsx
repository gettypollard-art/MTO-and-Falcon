// MTO Pricing — Customer Spend Tab

import { useMemo } from 'react';
import type { MtoProduct, MtoMonthlySales } from '../types';
import { formatUSD } from '../utils';
import { categoryLabels } from '../types';

interface Props {
  products: MtoProduct[];
  rawSales: MtoMonthlySales[];
}

interface SpendRow {
  category: string;
  productCount: number;
  avgFinalPrice: number;
  totalRevenue: number;
  unitsSold: number;
  revenueShare: number;
}

export function CustomerSpendTab({ products, rawSales }: Props) {
  const spendRows = useMemo<SpendRow[]>(() => {
    if (products.length === 0) return [];

    // Build product_id → category map
    const productCategoryMap = new Map(products.map((p) => [p.id, p.category]));

    // Aggregate real sales revenue + units by category
    const revByCat   = new Map<string, number>();
    const unitsByCat = new Map<string, number>();
    for (const s of rawSales) {
      const cat = productCategoryMap.get(s.product_id);
      if (!cat) continue;
      revByCat.set(cat,   (revByCat.get(cat)   ?? 0) + s.revenue);
      unitsByCat.set(cat, (unitsByCat.get(cat) ?? 0) + s.quantity_sold);
    }

    const totalRevenue = [...revByCat.values()].reduce((a, b) => a + b, 0);
    const categories   = [...new Set(products.map((p) => p.category))];

    return categories.map((cat) => {
      const catProducts = products.filter((p) => p.category === cat);
      const avgPrice    = catProducts.length > 0
        ? catProducts.reduce((s, p) => s + p.final_price, 0) / catProducts.length
        : 0;
      const catRevenue  = revByCat.get(cat)   ?? 0;
      const catUnits    = unitsByCat.get(cat) ?? 0;
      const share       = totalRevenue > 0 ? (catRevenue / totalRevenue) * 100 : 0;
      return {
        category:      categoryLabels[cat] ?? cat,
        productCount:  catProducts.length,
        avgFinalPrice: avgPrice,
        totalRevenue:  catRevenue,
        unitsSold:     catUnits,
        revenueShare:  share,
      };
    }).sort((a, b) => b.revenueShare - a.revenueShare);
  }, [products, rawSales]);

  const hasSalesData = rawSales.length > 0;
  const totalRevenue = spendRows.reduce((s, r) => s + r.totalRevenue, 0);
  const totalUnits   = spendRows.reduce((s, r) => s + r.unitsSold, 0);

  if (products.length === 0) {
    return (
      <div className="pricing-card">
        <h3>Customer Spend Analysis</h3>
        <p className="pricing-empty">Add products and track sales to see customer spending patterns by category.</p>
      </div>
    );
  }

  return (
    <div className="pricing-card">
      <h3>Customer Spend Analysis</h3>
      {!hasSalesData && (
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 0.6rem' }}>
          No sales data yet — add entries to <code>mto_monthly_sales</code> to see real revenue figures.
        </p>
      )}

      <div className="pricing-stats-row">
        <div className="pricing-stat-card">
          <div className="stat-label">Categories</div>
          <div className="stat-value">{spendRows.length}</div>
        </div>
        <div className="pricing-stat-card">
          <div className="stat-label">Total Products</div>
          <div className="stat-value">{products.length}</div>
        </div>
        {hasSalesData ? (
          <>
            <div className="pricing-stat-card">
              <div className="stat-label">Total Revenue</div>
              <div className="stat-value">{formatUSD(totalRevenue)}</div>
            </div>
            <div className="pricing-stat-card">
              <div className="stat-label">Total Units Sold</div>
              <div className="stat-value">{totalUnits.toLocaleString()}</div>
            </div>
          </>
        ) : (
          <div className="pricing-stat-card">
            <div className="stat-label">Avg Product Price</div>
            <div className="stat-value">
              {formatUSD(products.reduce((s, p) => s + p.final_price, 0) / products.length)}
            </div>
          </div>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="pricing-table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="cell-right">Products</th>
              <th className="cell-right">Avg Price</th>
              {hasSalesData && <th className="cell-right">Units Sold</th>}
              <th className="cell-right">{hasSalesData ? 'Revenue' : 'Est. Revenue'}</th>
              <th className="cell-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {spendRows.map((row) => (
              <tr key={row.category}>
                <td>{row.category}</td>
                <td className="cell-right">{row.productCount}</td>
                <td className="cell-right">{formatUSD(row.avgFinalPrice)}</td>
                {hasSalesData && <td className="cell-right">{row.unitsSold.toLocaleString()}</td>}
                <td className="cell-right">{formatUSD(row.totalRevenue)}</td>
                <td className="cell-right">
                  <span style={{ fontWeight: row.revenueShare > 30 ? 600 : 400 }}>
                    {row.revenueShare.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
