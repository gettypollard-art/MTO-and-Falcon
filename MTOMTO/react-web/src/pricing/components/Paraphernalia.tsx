// MTO Pricing — Paraphernalia Tab

import { useMemo } from 'react';
import type { MtoProduct } from '../types';
import { formatUSD, classifyTier } from '../utils';

interface Props {
  products: MtoProduct[];
}

export function ParaphernaliaTab({ products }: Props) {
  const paraphernalia = useMemo(
    () => products.filter((p) => p.category === 'Paraphernalia'),
    [products],
  );

  if (paraphernalia.length === 0) {
    return (
      <div className="pricing-card">
        <h3>Paraphernalia</h3>
        <p className="pricing-empty">
          No paraphernalia products found. Add products with the &ldquo;Paraphernalia&rdquo; category in the Price Builder tab.
        </p>
      </div>
    );
  }

  const totalValue = paraphernalia.reduce((s, p) => s + p.final_price, 0);
  const avgPrice = totalValue / paraphernalia.length;

  return (
    <div className="pricing-card">
      <h3>Paraphernalia</h3>

      <div className="pricing-stats-row">
        <div className="pricing-stat-card">
          <div className="stat-label">Items</div>
          <div className="stat-value">{paraphernalia.length}</div>
        </div>
        <div className="pricing-stat-card">
          <div className="stat-label">Avg Price</div>
          <div className="stat-value">{formatUSD(avgPrice)}</div>
        </div>
        <div className="pricing-stat-card">
          <div className="stat-label">Total Menu Value</div>
          <div className="stat-value">{formatUSD(totalValue)}</div>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="pricing-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Brand</th>
              <th>SKU</th>
              <th className="cell-right">Cost</th>
              <th className="cell-right">Markup</th>
              <th className="cell-right">Final Price</th>
              <th>Tier</th>
            </tr>
          </thead>
          <tbody>
            {paraphernalia.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.brand || '—'}</td>
                <td>{p.sku || '—'}</td>
                <td className="cell-right">{formatUSD(p.unit_cost)}</td>
                <td className="cell-right">{p.markup_multiplier}×</td>
                <td className="cell-right">{formatUSD(p.final_price)}</td>
                <td><span className="pricing-badge pricing-badge-tier">{classifyTier(p.final_price)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
