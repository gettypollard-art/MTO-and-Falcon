// MTO Pricing — Price Builder Tab (live UI calculation, DB computes final)

import { useState, useMemo } from 'react';
import type { FormEvent } from 'react';
import type { MarkupMultiplier, ProductCategory, MtoProduct } from '../types';
import { markupMultipliers, productCategories, categoryLabels } from '../types';
import { computeFullPrice, formatUSD, classifyTier } from '../utils';
import { createProduct } from '../services/supabaseService';

const TAX_STORAGE_KEY = 'mto_tax_rate';

function loadTaxRate(): number {
  try {
    const stored = localStorage.getItem(TAX_STORAGE_KEY);
    if (stored) {
      const n = parseFloat(stored);
      if (!isNaN(n) && n >= 0 && n <= 1) return n;
    }
  } catch { /* ignore */ }
  return 0.20;
}

interface Props {
  storeId: string;
  products: MtoProduct[];
  onProductCreated: () => void;
}

export function PriceBuilderTab({ storeId, products, onProductCreated }: Props) {
  const [name, setName]         = useState('');
  const [brand, setBrand]       = useState('');
  const [category, setCategory] = useState<ProductCategory>('Flower');
  const [sku, setSku]           = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [markup, setMarkup]     = useState<MarkupMultiplier>(2.0);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Tax rate — stored in localStorage so it persists across sessions
  const [taxRate, setTaxRate]       = useState<number>(loadTaxRate);
  const [taxInput, setTaxInput]     = useState<string>(() => `${Math.round(loadTaxRate() * 100)}`);
  const [showTaxEdit, setShowTaxEdit] = useState(false);

  const applyTaxInput = () => {
    const pct = parseFloat(taxInput);
    if (!isNaN(pct) && pct >= 0 && pct <= 100) {
      const rate = pct / 100;
      setTaxRate(rate);
      try { localStorage.setItem(TAX_STORAGE_KEY, String(rate)); } catch { /* ignore */ }
    } else {
      setTaxInput(String(Math.round(taxRate * 100)));
    }
    setShowTaxEdit(false);
  };

  const costNum = Number(unitCost) || 0;
  const preview = useMemo(() => computeFullPrice(costNum, markup, taxRate), [costNum, markup, taxRate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || costNum <= 0 || !storeId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await createProduct({
        store_id: storeId,
        name: name.trim(),
        brand: brand.trim(),
        category,
        sku: sku.trim(),
        unit_cost: costNum,
        markup_multiplier: markup,
      });
      setName(''); setBrand(''); setSku(''); setUnitCost(''); setMarkup(2.0);
      onProductCreated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pricing-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
        <h3 style={{ margin: 0 }}>Price Builder</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--muted)' }}>
          Tax rate:
          {showTaxEdit ? (
            <>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={taxInput}
                onChange={(e) => setTaxInput(e.target.value)}
                onBlur={applyTaxInput}
                onKeyDown={(e) => { if (e.key === 'Enter') applyTaxInput(); if (e.key === 'Escape') setShowTaxEdit(false); }}
                style={{ width: 52, fontSize: '0.82rem', padding: '0.1rem 0.3rem' }}
                autoFocus
              />
              <span>%</span>
            </>
          ) : (
            <button
              className="btn btn-sm"
              style={{ fontSize: '0.82rem', padding: '0.1rem 0.4rem' }}
              onClick={() => { setTaxInput(String(Math.round(taxRate * 100))); setShowTaxEdit(true); }}
            >
              {Math.round(taxRate * 100)}%
            </button>
          )}
        </div>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '0.84rem', margin: '0 0 0.8rem' }}>
        Preview prices in real time. Stored prices are computed by the database trigger.
      </p>

      <form className="pricing-form" onSubmit={handleSubmit}>
        <div className="pricing-form-row">
          <label>
            Product Name
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Blue Dream 3.5g" />
          </label>
          <label>
            Brand
            <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Optional" />
          </label>
        </div>
        <div className="pricing-form-row">
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value as ProductCategory)}>
              {productCategories.map((c) => (
                <option key={c} value={c}>{categoryLabels[c]}</option>
              ))}
            </select>
          </label>
          <label>
            SKU
            <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" />
          </label>
        </div>
        <div className="pricing-form-row">
          <label>
            Unit Cost ($)
            <input
              type="number" step="0.01" min="0"
              value={unitCost} onChange={(e) => setUnitCost(e.target.value)}
              required placeholder="0.00"
            />
          </label>
          <label>
            Markup Multiplier
            <select value={markup} onChange={(e) => setMarkup(Number(e.target.value) as MarkupMultiplier)}>
              {markupMultipliers.map((m) => (
                <option key={m} value={m}>{m}×</option>
              ))}
            </select>
          </label>
        </div>

        {costNum > 0 ? (
          <div className="pricing-preview-grid">
            <div className="pricing-preview-tile">
              <div className="preview-label">Unit Cost</div>
              <div className="preview-value">{formatUSD(preview.unitCost)}</div>
            </div>
            <div className="pricing-preview-tile">
              <div className="preview-label">Markup</div>
              <div className="preview-value">{preview.markup}×</div>
            </div>
            <div className="pricing-preview-tile">
              <div className="preview-label">Pre-Tax</div>
              <div className="preview-value accent">{formatUSD(preview.pretax)}</div>
            </div>
            <div className="pricing-preview-tile">
              <div className="preview-label">Final (w/ {Math.round(taxRate * 100)}% tax)</div>
              <div className="preview-value accent">{formatUSD(preview.final)}</div>
            </div>
            <div className="pricing-preview-tile">
              <div className="preview-label">Tier</div>
              <div className="preview-value">
                <span className="pricing-badge pricing-badge-tier">{preview.tier}</span>
              </div>
            </div>
          </div>
        ) : null}

        {saveError ? <p className="pricing-error">{saveError}</p> : null}

        <div className="pricing-action-bar">
          <button type="submit" className="pricing-btn-primary" disabled={saving || !name.trim() || costNum <= 0}>
            {saving ? 'Saving...' : 'Add Product'}
          </button>
        </div>
      </form>

      {products.length > 0 ? (
        <>
          <h3 style={{ marginTop: '1.2rem' }}>Current Products ({products.length})</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="pricing-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Brand</th>
                  <th>Category</th>
                  <th className="cell-right">Cost</th>
                  <th className="cell-right">Markup</th>
                  <th className="cell-right">Pre-Tax</th>
                  <th className="cell-right">Final</th>
                  <th>Tier</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.brand || '—'}</td>
                    <td>{categoryLabels[p.category]}</td>
                    <td className="cell-right">{formatUSD(p.unit_cost)}</td>
                    <td className="cell-right">{p.markup_multiplier}×</td>
                    <td className="cell-right">{formatUSD(p.pretax_price)}</td>
                    <td className="cell-right">{formatUSD(p.final_price)}</td>
                    <td><span className="pricing-badge pricing-badge-tier">{classifyTier(p.final_price)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
