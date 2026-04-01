// MTO Pricing — Business Rules Manager
// Lets operators define min/max prices, freezes, and category ceilings/floors.
// Rules persist to localStorage via useAdvisorRules.

import { useState } from 'react';
import type { BusinessRule, RuleType, ProductCategory } from '../types';
import { categoryLabels, productCategories } from '../types';
import { formatUSD } from '../utils';
import { RULE_TYPE_LABELS } from '../engine/businessRules';
import type { AddRuleOptions } from '../hooks/useAdvisorRules';

interface Props {
  rules: BusinessRule[];
  onAdd: (ruleType: RuleType, value: number, opts?: AddRuleOptions) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
}

const RULE_SCOPES: RuleType[] = ['min_price', 'max_price', 'freeze'];
const CATEGORY_SCOPES: RuleType[] = ['category_ceiling', 'category_floor'];

export function AdvisorRules({ rules, onAdd, onRemove, onToggle }: Props) {
  const [open, setOpen] = useState(false);
  const [ruleType, setRuleType] = useState<RuleType>('min_price');
  const [value, setValue] = useState('');
  const [scope, setScope] = useState<'product' | 'category' | 'global'>('global');
  const [productId, setProductId] = useState('');
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const isCategoryRule = CATEGORY_SCOPES.includes(ruleType);
  const isFreezeRule = ruleType === 'freeze';

  function handleAdd() {
    setFormError(null);

    if (!isFreezeRule) {
      const parsed = parseFloat(value);
      if (isNaN(parsed) || parsed <= 0) {
        setFormError('Enter a valid price value > 0');
        return;
      }
    }

    if (isCategoryRule && !category) {
      setFormError('Select a category for this rule type');
      return;
    }

    if (scope === 'product' && !productId.trim()) {
      setFormError('Enter a product ID');
      return;
    }

    const opts: AddRuleOptions = { reason: reason.trim() };
    if (scope === 'product') opts.productId = productId.trim();
    if (isCategoryRule || scope === 'category') opts.category = category as ProductCategory || undefined;

    onAdd(ruleType, isFreezeRule ? 0 : parseFloat(value), opts);

    // Reset form
    setValue('');
    setReason('');
    setProductId('');
    setCategory('');
    setFormError(null);
  }

  const activeCount = rules.filter((r) => r.active).length;

  return (
    <div className="pricing-card" style={{ marginTop: '1.2rem' }}>
      {/* ── Header ── */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <h3 style={{ margin: 0 }}>Business Rules</h3>
          {rules.length > 0 && (
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              {activeCount} active · {rules.length} total
            </span>
          )}
        </div>
        <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{open ? '▲ collapse' : '▼ expand'}</span>
      </div>

      {!open && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
          {rules.length === 0
            ? 'No rules defined — expand to add price floors, ceilings, or freezes.'
            : `${activeCount} rule${activeCount !== 1 ? 's' : ''} enforced on advisor recommendations.`}
        </p>
      )}

      {open && (
        <>
          {/* ── Add rule form ── */}
          <div style={{ marginTop: '1rem', padding: '0.9rem', background: 'var(--table-alt, #f5f5f5)', borderRadius: 6 }}>
            <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.6rem' }}>Add New Rule</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-start' }}>
              {/* Rule type */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.75rem' }}>
                Type
                <select value={ruleType} onChange={(e) => { setRuleType(e.target.value as RuleType); setCategory(''); }} style={{ fontSize: '0.78rem' }}>
                  {(Object.keys(RULE_TYPE_LABELS) as RuleType[]).map((t) => (
                    <option key={t} value={t}>{RULE_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </label>

              {/* Value (hidden for freeze) */}
              {!isFreezeRule && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.75rem' }}>
                  Price ($)
                  <input
                    type="number" min="0" step="0.01" value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="e.g. 25.00"
                    style={{ width: 90, fontSize: '0.78rem' }}
                  />
                </label>
              )}

              {/* Category selector for category-scoped rules */}
              {isCategoryRule && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.75rem' }}>
                  Category
                  <select value={category} onChange={(e) => setCategory(e.target.value as ProductCategory | '')} style={{ fontSize: '0.78rem' }}>
                    <option value="">— choose —</option>
                    {productCategories.map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}
                  </select>
                </label>
              )}

              {/* Scope selector for SKU-level rules */}
              {RULE_SCOPES.includes(ruleType) && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.75rem' }}>
                  Scope
                  <select value={scope} onChange={(e) => setScope(e.target.value as 'product' | 'category' | 'global')} style={{ fontSize: '0.78rem' }}>
                    <option value="global">All products</option>
                    <option value="category">Category</option>
                    <option value="product">Specific product ID</option>
                  </select>
                </label>
              )}

              {scope === 'product' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.75rem' }}>
                  Product ID
                  <input type="text" value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="UUID" style={{ width: 140, fontSize: '0.78rem' }} />
                </label>
              )}

              {scope === 'category' && !isCategoryRule && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.75rem' }}>
                  Category
                  <select value={category} onChange={(e) => setCategory(e.target.value as ProductCategory | '')} style={{ fontSize: '0.78rem' }}>
                    <option value="">All</option>
                    {productCategories.map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}
                  </select>
                </label>
              )}

              {/* Reason */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.75rem', flex: '1 1 150px' }}>
                Reason (optional)
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. MAP agreement" style={{ fontSize: '0.78rem' }} />
              </label>

              <button
                className="btn btn-sm pricing-btn-primary"
                style={{ alignSelf: 'flex-end' }}
                onClick={handleAdd}
              >
                + Add Rule
              </button>
            </div>
            {formError && <p style={{ color: '#c0392b', fontSize: '0.75rem', margin: '0.4rem 0 0' }}>{formError}</p>}
          </div>

          {/* ── Rules list ── */}
          {rules.length === 0 ? (
            <p className="pricing-empty" style={{ marginTop: '0.8rem' }}>No rules yet.</p>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: '0.8rem' }}>
              <table className="pricing-table">
                <thead>
                  <tr>
                    <th>Active</th>
                    <th>Type</th>
                    <th className="cell-right">Value</th>
                    <th>Scope</th>
                    <th>Reason</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id} style={{ opacity: rule.active ? 1 : 0.5 }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={rule.active}
                          onChange={() => onToggle(rule.id)}
                        />
                      </td>
                      <td style={{ fontSize: '0.78rem' }}>{RULE_TYPE_LABELS[rule.ruleType]}</td>
                      <td className="cell-right" style={{ fontSize: '0.78rem' }}>
                        {rule.ruleType === 'freeze' ? '—' : formatUSD(rule.value)}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        {rule.productId
                          ? `Product: ${rule.productId.slice(0, 8)}…`
                          : rule.category
                            ? `${categoryLabels[rule.category] ?? rule.category}`
                            : 'All products'}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--muted)', maxWidth: 200, whiteSpace: 'normal' }}>
                        {rule.reason || '—'}
                      </td>
                      <td style={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {new Date(rule.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          onClick={() => onRemove(rule.id)}
                          title="Delete rule"
                          style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: '0.85rem', padding: '2px 4px' }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
