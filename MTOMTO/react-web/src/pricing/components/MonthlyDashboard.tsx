// MTO Pricing — Monthly Dashboard Tab

import type { MonthlyStatsRow } from '../types';
import { formatUSD, formatPercent } from '../utils';

interface Props {
  stats: MonthlyStatsRow[];
  loading: boolean;
  error: string | null;
}

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

function trend(current: number, previous: number): { arrow: string; pct: string; cls: string } | null {
  if (previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return {
    arrow: pct >= 0 ? '↑' : '↓',
    pct: `${Math.abs(pct).toFixed(1)}%`,
    cls: pct >= 0 ? 'cell-positive' : 'cell-negative',
  };
}

export function MonthlyDashboardTab({ stats, loading, error }: Props) {
  if (loading) {
    return (
      <div className="pricing-card">
        <h3>Monthly Dashboard</h3>
        <div className="pricing-loading"><div className="pricing-spinner" /> Loading monthly data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pricing-card">
        <h3>Monthly Dashboard</h3>
        <p className="pricing-error">{error}</p>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="pricing-card">
        <h3>Monthly Dashboard</h3>
        <p className="pricing-empty">No sales data recorded yet. Data will appear here as monthly sales are tracked.</p>
      </div>
    );
  }

  const latest       = stats[0];
  const totalRevenue = stats.reduce((s, r) => s + r.totalRevenue, 0);
  const totalProfit  = stats.reduce((s, r) => s + r.totalProfit, 0);
  const totalUnits   = stats.reduce((s, r) => s + r.unitsSold, 0);

  return (
    <div className="pricing-card">
      <h3>Monthly Dashboard</h3>

      <div className="pricing-stats-row">
        <div className="pricing-stat-card">
          <div className="stat-label">Latest Month</div>
          <div className="stat-value">{formatMonth(latest.month)}</div>
        </div>
        <div className="pricing-stat-card">
          <div className="stat-label">All-Time Revenue</div>
          <div className="stat-value">{formatUSD(totalRevenue)}</div>
        </div>
        <div className="pricing-stat-card">
          <div className="stat-label">All-Time Profit</div>
          <div className="stat-value">{formatUSD(totalProfit)}</div>
        </div>
        <div className="pricing-stat-card">
          <div className="stat-label">All-Time Units</div>
          <div className="stat-value">{totalUnits.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="pricing-table">
          <thead>
            <tr>
              <th>Month</th>
              <th className="cell-right">Revenue</th>
              <th className="cell-right">vs Prior</th>
              <th className="cell-right">Cost</th>
              <th className="cell-right">Profit</th>
              <th className="cell-right">Margin</th>
              <th className="cell-right">Units</th>
              <th className="cell-right">vs Prior</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row, i) => {
              const prev       = stats[i + 1] ?? null;
              const revTrend   = prev ? trend(row.totalRevenue, prev.totalRevenue) : null;
              const unitsTrend = prev ? trend(row.unitsSold, prev.unitsSold) : null;
              return (
                <tr key={row.month}>
                  <td>{formatMonth(row.month)}</td>
                  <td className="cell-right">{formatUSD(row.totalRevenue)}</td>
                  <td className={`cell-right ${revTrend?.cls ?? ''}`} style={{ fontSize: '0.8rem' }}>
                    {revTrend ? `${revTrend.arrow} ${revTrend.pct}` : '—'}
                  </td>
                  <td className="cell-right">{formatUSD(row.totalCost)}</td>
                  <td className={`cell-right ${row.totalProfit >= 0 ? 'cell-positive' : 'cell-negative'}`}>
                    {formatUSD(row.totalProfit)}
                  </td>
                  <td className={`cell-right ${row.avgMargin >= 30 ? 'cell-positive' : row.avgMargin < 15 ? 'cell-negative' : ''}`}>
                    {formatPercent(row.avgMargin).replace('+', '')}
                  </td>
                  <td className="cell-right">{row.unitsSold.toLocaleString()}</td>
                  <td className={`cell-right ${unitsTrend?.cls ?? ''}`} style={{ fontSize: '0.8rem' }}>
                    {unitsTrend ? `${unitsTrend.arrow} ${unitsTrend.pct}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
