// MTO Pricing — Reorder Intelligence Tab

import type { MtoReorderSuggestion, MtoProduct } from '../types';
import { formatUSD } from '../utils';

interface Props {
  suggestions: MtoReorderSuggestion[];
  products: MtoProduct[];
  loading: boolean;
  error: string | null;
}

function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case 'critical': return 'pricing-badge pricing-badge-critical';
    case 'high': return 'pricing-badge pricing-badge-high';
    case 'medium': return 'pricing-badge pricing-badge-medium';
    default: return 'pricing-badge pricing-badge-low';
  }
}

export function ReorderIntelligenceTab({ suggestions, products, loading, error }: Props) {
  const productMap = new Map(products.map((p) => [p.id, p]));

  if (loading) {
    return (
      <div className="pricing-card">
        <h3>Reorder Intelligence</h3>
        <div className="pricing-loading"><div className="pricing-spinner" /> Loading reorder data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pricing-card">
        <h3>Reorder Intelligence</h3>
        <p className="pricing-error">{error}</p>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="pricing-card">
        <h3>Reorder Intelligence</h3>
        <p className="pricing-empty">No reorder suggestions at this time. Suggestions are generated based on stock levels and sales velocity.</p>
      </div>
    );
  }

  const criticalCount = suggestions.filter((s) => s.priority === 'critical').length;
  const highCount = suggestions.filter((s) => s.priority === 'high').length;

  return (
    <div className="pricing-card">
      <h3>Reorder Intelligence</h3>

      <div className="pricing-stats-row">
        <div className="pricing-stat-card">
          <div className="stat-label">Total Suggestions</div>
          <div className="stat-value">{suggestions.length}</div>
        </div>
        <div className="pricing-stat-card">
          <div className="stat-label">Critical</div>
          <div className="stat-value">{criticalCount}</div>
        </div>
        <div className="pricing-stat-card">
          <div className="stat-label">High Priority</div>
          <div className="stat-value">{highCount}</div>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="pricing-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Priority</th>
              <th className="cell-right">Current Stock</th>
              <th className="cell-right">Avg Daily Sales</th>
              <th className="cell-right">Days Until Stockout</th>
              <th className="cell-right">Suggested Reorder</th>
              <th className="cell-right">Est. Cost</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((s) => {
              const product = productMap.get(s.product_id);
              const estCost = product ? s.suggested_reorder_qty * product.unit_cost : 0;
              return (
                <tr key={s.id}>
                  <td>{product?.name ?? 'Unknown'}</td>
                  <td>
                    <span className={priorityBadgeClass(s.priority)}>
                      {s.priority}
                    </span>
                  </td>
                  <td className="cell-right">{s.current_stock}</td>
                  <td className="cell-right">{s.avg_daily_sales.toFixed(1)}</td>
                  <td className={`cell-right ${s.days_until_stockout <= 3 ? 'cell-negative' : s.days_until_stockout <= 7 ? 'cell-negative' : ''}`}>
                    {s.days_until_stockout} days
                  </td>
                  <td className="cell-right">{s.suggested_reorder_qty} units</td>
                  <td className="cell-right">{formatUSD(estCost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
