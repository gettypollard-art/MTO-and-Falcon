// MTO Pricing — Pricing Advisor panel (v2)
// Features: confidence badges, freshness indicator, action filters,
// category filter, what-if price simulator modal, export CSV,
// inline suggested-price edit, inventory override badge, business-rule badge.

import { useState, useMemo, useCallback } from 'react';
import type { PricingRecommendation, PricingAction, ProductCategory } from '../types';
import { formatUSD, formatPercent } from '../utils';
import { categoryLabels, productCategories } from '../types';
import { pickAction, computeSuggestedPrice } from '../engine/pricingAdvisor';

interface Props {
  recommendations: PricingRecommendation[];
}

const currentTimeMs = (): number => new Date().getTime();

// ── Action display config ─────────────────────────────────

const ACTION_META: Record<PricingAction, { label: string; color: string; bg: string }> = {
  lower:             { label: '↓ Lower',        color: '#c0392b', bg: '#fdecea' },
  raise:             { label: '↑ Raise',         color: '#1a7a3c', bg: '#e6f4ea' },
  small_raise:       { label: '↑ Small Raise',   color: '#276fbf', bg: '#e8f0fb' },
  hold_conservative: { label: '◆ Hold (Watch)',  color: '#7d5a00', bg: '#fff8e1' },
  hold:              { label: '● Hold',           color: '#555',    bg: '#f4f4f4' },
  small_lower:       { label: '↓ Small Lower',   color: '#a93226', bg: '#fdf2f0' },
};

function ActionBadge({ action }: { action: PricingAction }) {
  const meta = ACTION_META[action] ?? ACTION_META.hold;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600, color: meta.color, background: meta.bg, whiteSpace: 'nowrap' }}>
      {meta.label}
    </span>
  );
}

// ── Confidence badge ──────────────────────────────────────

function ConfidenceBadge({ confidence, drivers }: { confidence: number; drivers: string[] }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 75 ? '#1a7a3c' : pct >= 50 ? '#7d5a00' : '#c0392b';
  const bg    = pct >= 75 ? '#e6f4ea' : pct >= 50 ? '#fff8e1' : '#fdecea';
  const title = `Confidence drivers:\n${drivers.join('\n')}`;
  return (
    <span title={title} style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 10, fontSize: '0.70rem', fontWeight: 700, color, background: bg, cursor: 'help' }}>
      {pct}%
    </span>
  );
}

// ── Position bar ──────────────────────────────────────────

function PositionBar({ position }: { position: number }) {
  const pct = Math.min(Math.max((position - 0.5) / 1.0, 0), 1);
  const isAbove = position > 1.0;
  const barWidthPct = Math.abs(pct - 0.5) * 100;
  const barLeft = pct < 0.5 ? pct * 100 : 50;
  return (
    <div title={`${(position * 100 - 100).toFixed(1)}% vs median`} style={{ position: 'relative', height: 8, width: 80, background: '#e8e8e8', borderRadius: 4 }}>
      <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: '#aaa' }} />
      <div style={{ position: 'absolute', left: `${barLeft}%`, width: `${barWidthPct}%`, top: 1, height: 6, borderRadius: 3, background: isAbove ? '#c0392b' : '#1a7a3c' }} />
    </div>
  );
}

// ── Freshness indicator ───────────────────────────────────

function FreshnessBadge({ freshnessScore, oldestCaptureMs }: { freshnessScore: number; oldestCaptureMs: number }) {
  if (freshnessScore === 0 && oldestCaptureMs === 0) return <span style={{ color: 'var(--muted)', fontSize: '0.70rem' }}>—</span>;
  const pct = Math.round(freshnessScore * 100);
  const color = pct >= 75 ? '#1a7a3c' : pct >= 40 ? '#7d5a00' : '#c0392b';
  const ageDays = oldestCaptureMs > 0 ? Math.floor((currentTimeMs() - oldestCaptureMs) / 86_400_000) : null;
  const label = ageDays != null ? `${ageDays}d ago` : `${pct}%`;
  return (
    <span title={`Data freshness ${pct}%${ageDays != null ? ` — oldest record ${ageDays} days ago` : ''}`} style={{ fontSize: '0.70rem', color, cursor: 'help' }}>
      {label}
    </span>
  );
}

// ── Inventory badge ───────────────────────────────────────

function InventoryBadge() {
  return (
    <span title="Action adjusted for inventory levels" style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: '0.65rem', fontWeight: 600, color: '#276fbf', background: '#e8f0fb', marginLeft: 4 }}>
      INV
    </span>
  );
}

// ── Rule badge ────────────────────────────────────────────

function RuleBadge({ reason }: { reason: string }) {
  return (
    <span title={`Business rule applied: ${reason}`} style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: '0.65rem', fontWeight: 600, color: '#7d5a00', background: '#fff8e1', marginLeft: 4 }}>
      RULE
    </span>
  );
}

// ── What-if modal ─────────────────────────────────────────

interface WhatIfModalProps {
  rec: PricingRecommendation;
  onClose: () => void;
}

function WhatIfModal({ rec, onClose }: WhatIfModalProps) {
  const minSlider = Math.round(rec.ourPrice * 0.5 * 100) / 100;
  const maxSlider = Math.round(rec.ourPrice * 1.5 * 100) / 100;
  const [whatIfPrice, setWhatIfPrice] = useState(rec.ourPrice);

  const whatIfResult = useMemo(() => {
    const action = pickAction(whatIfPrice, rec.marketStats);
    const { price: suggested, marginGuarded } = computeSuggestedPrice(
      whatIfPrice, rec.ourCost, action, rec.marketStats,
    );
    const position = rec.marketStats.median > 0 ? whatIfPrice / rec.marketStats.median : 1;
    const margin = rec.ourCost > 0 ? ((whatIfPrice - rec.ourCost) / whatIfPrice) * 100 : null;
    return { action, suggested, marginGuarded, position, margin };
  }, [whatIfPrice, rec]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: 'var(--card-bg, #fff)', borderRadius: 10, padding: '1.6rem', maxWidth: 520, width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h4 style={{ margin: 0 }}>What-If Simulator — {rec.productName}</h4>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.2rem', fontSize: '0.82rem' }}>
          <tbody>
            {[
              ['Market Median', formatUSD(rec.marketStats.median)],
              ['Market Min',    formatUSD(rec.marketStats.min)],
              ['Market Max',    formatUSD(rec.marketStats.max)],
              ['Our Cost',      formatUSD(rec.ourCost)],
            ].map(([lbl, val]) => (
              <tr key={lbl}><td style={{ padding: '4px 0', color: 'var(--muted)' }}>{lbl}</td><td style={{ textAlign: 'right' }}>{val}</td></tr>
            ))}
          </tbody>
        </table>

        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
          Hypothetical price: {formatUSD(whatIfPrice)}
        </label>
        <input
          type="range" min={minSlider} max={maxSlider} step={0.01} value={whatIfPrice}
          onChange={(e) => setWhatIfPrice(parseFloat(e.target.value))}
          style={{ width: '100%', marginBottom: '1.2rem' }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.8rem', textAlign: 'center' }}>
          {[
            { label: 'Action',   value: <ActionBadge action={whatIfResult.action} /> },
            { label: 'Position', value: `${((whatIfResult.position - 1) * 100).toFixed(1)}% vs median` },
            { label: 'Margin',   value: whatIfResult.margin != null ? `${whatIfResult.margin.toFixed(1)}%` : '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'var(--table-alt, #f9f9f9)', borderRadius: 6, padding: '0.6rem' }}>
              <div style={{ fontSize: '0.70rem', color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>

        <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.4 }}>
          Drag the slider to preview how a price change would affect action and margin.
          Business rules and cost floor are <em>not</em> applied in this preview.
        </p>
      </div>
    </div>
  );
}

// ── Inline price editor ───────────────────────────────────

interface InlineEditProps {
  rec: PricingRecommendation;
  onDone: () => void;
}

function InlineEdit({ rec, onDone }: InlineEditProps) {
  const [val, setVal] = useState(rec.suggestedPrice.toFixed(2));
  const parsed = parseFloat(val);
  const valid = !isNaN(parsed) && parsed > 0;
  const margin = valid && rec.ourCost > 0 ? ((parsed - rec.ourCost) / parsed * 100).toFixed(1) : null;
  const position = valid && rec.marketStats.median > 0 ? parsed / rec.marketStats.median : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <span style={{ alignSelf: 'center', fontSize: '0.82rem', color: 'var(--muted)' }}>$</span>
        <input
          type="number" step="0.01" min="0" value={val} autoFocus
          onChange={(e) => setVal(e.target.value)}
          onBlur={onDone}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') onDone(); }}
          style={{ width: 72, fontSize: '0.82rem', padding: '2px 4px', border: `1px solid ${valid ? '#276fbf' : '#c0392b'}`, borderRadius: 3 }}
        />
      </div>
      {valid && (
        <div style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>
          {margin != null && `Margin: ${margin}%`}
          {position != null && (
            <span style={{ marginLeft: 6, color: position > 1.05 ? '#c0392b' : position < 0.95 ? '#1a7a3c' : '#555' }}>
              {position > 1 ? '+' : ''}{((position - 1) * 100).toFixed(1)}% vs median
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Export to CSV ─────────────────────────────────────────

function exportCSV(rows: PricingRecommendation[]) {
  const headers = [
    'Product', 'Category', 'Action', 'Confidence', 'Our Price', 'Suggested Price',
    'Delta %', 'Market Min', 'Market Median', 'Market Max', 'Position vs Median',
    'Data Freshness', 'Margin Guarded', 'Inventory Override', 'Applied Rule', 'Reason',
  ];
  const esc = (v: string | number | boolean) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    headers.map(esc).join(','),
    ...rows.map((r) => [
      r.productName,
      categoryLabels[r.category] ?? r.category,
      r.action,
      Math.round(r.confidence * 100) + '%',
      r.ourPrice,
      r.suggestedPrice,
      r.ourPrice > 0 ? (((r.suggestedPrice - r.ourPrice) / r.ourPrice) * 100).toFixed(2) + '%' : '',
      r.marketStats.min,
      r.marketStats.median,
      r.marketStats.max,
      ((r.position - 1) * 100).toFixed(2) + '%',
      Math.round(r.marketStats.avgFreshnessScore * 100) + '%',
      r.marginGuarded,
      r.inventoryOverride,
      r.appliedRule ? (r.appliedRule.reason || r.appliedRule.ruleType) : '',
      r.reason,
    ].map(esc).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pricing-advisor-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────

export function PricingAdvisor({ recommendations }: Props) {
  const [filterActions, setFilterActions] = useState<Set<PricingAction>>(new Set());
  const [filterCategory, setFilterCategory] = useState<ProductCategory | ''>('');
  const [minConfidence, setMinConfidence] = useState(0);
  const [hideHolds, setHideHolds] = useState(false);
  const [whatIfRec, setWhatIfRec] = useState<PricingRecommendation | null>(null);
  const [inlineEditing, setInlineEditing] = useState<string | null>(null);

  const toggleActionFilter = useCallback((action: PricingAction) => {
    setFilterActions((prev) => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action); else next.add(action);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    return recommendations.filter((r) => {
      if (filterActions.size > 0 && !filterActions.has(r.action)) return false;
      if (filterCategory && r.category !== filterCategory) return false;
      if (r.confidence < minConfidence) return false;
      if (hideHolds && (r.action === 'hold' || r.action === 'hold_conservative')) return false;
      return true;
    });
  }, [recommendations, filterActions, filterCategory, minConfidence, hideHolds]);

  if (recommendations.length === 0) {
    return (
      <div className="pricing-card" style={{ marginTop: '1.2rem' }}>
        <h3 style={{ margin: '0 0 0.5rem' }}>Pricing Advisor</h3>
        <p className="pricing-empty">
          No recommendations yet — add competitor pricing data for your region and products.
        </p>
      </div>
    );
  }

  const actionCounts = recommendations.reduce<Record<string, number>>(
    (acc, r) => { acc[r.action] = (acc[r.action] ?? 0) + 1; return acc; },
    {},
  );
  const needAction = (actionCounts.lower ?? 0) + (actionCounts.raise ?? 0) + (actionCounts.small_raise ?? 0);
  const holding = (actionCounts.hold ?? 0) + (actionCounts.hold_conservative ?? 0);
  const avgConf = recommendations.reduce((s, r) => s + r.confidence, 0) / recommendations.length;

  return (
    <>
      {whatIfRec && <WhatIfModal rec={whatIfRec} onClose={() => setWhatIfRec(null)} />}

      <div className="pricing-card" style={{ marginTop: '1.2rem' }}>
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Pricing Advisor</h3>
            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.78rem', flexWrap: 'wrap' }}>
              {needAction > 0 && <span style={{ color: '#c0392b', fontWeight: 600 }}>{needAction} need action</span>}
              <span style={{ color: 'var(--muted)' }}>{holding} holding</span>
              <span style={{ color: 'var(--muted)' }}>avg confidence <b>{Math.round(avgConf * 100)}%</b></span>
            </div>
          </div>
          <button className="btn btn-sm pricing-btn-primary" onClick={() => exportCSV(filtered)} title="Export filtered rows to CSV">
            ↓ Export CSV
          </button>
        </div>

        {/* ── Filter bar ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.8rem', padding: '0.5rem 0.8rem', background: 'var(--table-alt, #f5f5f5)', borderRadius: 6 }}>
          {(Object.keys(ACTION_META) as PricingAction[]).map((action) => {
            const cnt = actionCounts[action] ?? 0;
            if (cnt === 0) return null;
            const active = filterActions.has(action);
            const meta = ACTION_META[action];
            return (
              <button key={action} onClick={() => toggleActionFilter(action)} style={{ border: `1.5px solid ${active ? meta.color : 'transparent'}`, background: active ? meta.bg : 'var(--card-bg, #fff)', color: meta.color, borderRadius: 4, padding: '2px 8px', fontSize: '0.70rem', fontWeight: 600, cursor: 'pointer' }}>
                {meta.label} ({cnt})
              </button>
            );
          })}
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as ProductCategory | '')} style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: 4 }}>
            <option value="">All Categories</option>
            {productCategories.map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--muted)' }}>
            Min confidence
            <input type="range" min={0} max={1} step={0.05} value={minConfidence} onChange={(e) => setMinConfidence(parseFloat(e.target.value))} style={{ width: 60 }} />
            {Math.round(minConfidence * 100)}%
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={hideHolds} onChange={(e) => setHideHolds(e.target.checked)} />
            Hide holds
          </label>
          {(filterActions.size > 0 || filterCategory || minConfidence > 0 || hideHolds) && (
            <button onClick={() => { setFilterActions(new Set()); setFilterCategory(''); setMinConfidence(0); setHideHolds(false); }} style={{ fontSize: '0.70rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Clear filters
            </button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: '0.70rem', color: 'var(--muted)' }}>{filtered.length}/{recommendations.length} shown</span>
        </div>

        {/* ── Table ── */}
        {filtered.length === 0 ? (
          <p className="pricing-empty">No recommendations match the current filters.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="pricing-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Action</th>
                  <th title="Confidence — hover for drivers">Conf.</th>
                  <th className="cell-right">Our Price</th>
                  <th className="cell-right">Suggested</th>
                  <th className="cell-right">Δ</th>
                  <th className="cell-right">Median</th>
                  <th className="cell-right">Min</th>
                  <th className="cell-right">Max</th>
                  <th>Position</th>
                  <th title="How recently competitor data was scraped">Age</th>
                  <th>Reason</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rec) => {
                  const delta = rec.suggestedPrice - rec.ourPrice;
                  const deltaPct = rec.ourPrice > 0 ? (delta / rec.ourPrice) * 100 : 0;
                  const priceChanged = Math.abs(delta) >= 0.01;
                  const isEditing = inlineEditing === rec.productId;

                  return (
                    <tr key={rec.productId}>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.productName}</td>
                      <td>
                        <ActionBadge action={rec.action} />
                        {rec.inventoryOverride && <InventoryBadge />}
                        {rec.appliedRule && <RuleBadge reason={rec.appliedRule.reason || rec.appliedRule.ruleType} />}
                      </td>
                      <td><ConfidenceBadge confidence={rec.confidence} drivers={rec.drivers} /></td>
                      <td className="cell-right">{formatUSD(rec.ourPrice)}</td>
                      <td className="cell-right" style={{ fontWeight: priceChanged ? 700 : 400, color: delta < 0 ? '#c0392b' : delta > 0 ? '#1a7a3c' : 'inherit' }}>
                        {isEditing ? (
                          <InlineEdit rec={rec} onDone={() => setInlineEditing(null)} />
                        ) : (
                          <span title="Click to edit" style={{ cursor: 'text', borderBottom: '1px dashed var(--muted)' }} onClick={() => setInlineEditing(rec.productId)}>
                            {formatUSD(rec.suggestedPrice)}
                            {rec.marginGuarded && <span title="Raised to cost floor" style={{ marginLeft: 4, fontSize: '0.65rem', color: '#7d5a00' }}>⚑</span>}
                          </span>
                        )}
                      </td>
                      <td className="cell-right" style={{ color: deltaPct < 0 ? '#c0392b' : deltaPct > 0 ? '#1a7a3c' : 'var(--muted)', fontSize: '0.8rem' }}>
                        {priceChanged ? formatPercent(deltaPct) : '—'}
                      </td>
                      <td className="cell-right">{formatUSD(rec.marketStats.median)}</td>
                      <td className="cell-right" style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{formatUSD(rec.marketStats.min)}</td>
                      <td className="cell-right" style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{formatUSD(rec.marketStats.max)}</td>
                      <td style={{ verticalAlign: 'middle' }}><PositionBar position={rec.position} /></td>
                      <td><FreshnessBadge freshnessScore={rec.marketStats.avgFreshnessScore} oldestCaptureMs={rec.marketStats.oldestCaptureMs} /></td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--muted)', maxWidth: 260, whiteSpace: 'normal' }}>{rec.reason}</td>
                      <td>
                        <button title="Open what-if simulator" onClick={() => setWhatIfRec(rec)} style={{ fontSize: '0.70rem', padding: '2px 6px', border: '1px solid var(--border, #ddd)', borderRadius: 3, background: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                          ∿
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Legend ── */}
        <div style={{ marginTop: '0.8rem', fontSize: '0.70rem', color: 'var(--muted)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <span><b>⚑</b> = margin floor</span>
          <span><b>INV</b> = inventory override</span>
          <span><b>RULE</b> = business rule enforced</span>
          <span><b>∿</b> = what-if simulator</span>
          <span>Suggested price is editable (click it)</span>
          <span>Position bar: green = below median, red = above</span>
        </div>
      </div>
    </>
  );
}
