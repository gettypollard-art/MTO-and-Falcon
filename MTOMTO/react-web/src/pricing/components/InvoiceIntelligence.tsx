// MTO Pricing — Invoice Intelligence Tab (upload + parse + apply)

import { useState, useRef } from 'react';
import type { FormEvent } from 'react';
import { categoryLabels } from '../types';
import { formatUSD } from '../utils';
import { useInvoiceParser } from '../hooks/useInvoiceParser';

interface Props {
  storeId: string;
  onItemsApplied: () => void;
}

export function InvoiceIntelligenceTab({ storeId, onItemsApplied }: Props) {
  const [vendorName, setVendorName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parser = useInvoiceParser();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !vendorName.trim() || !storeId) return;
    await parser.parseInvoice(selectedFile, storeId, vendorName.trim());
    if (!parser.error) onItemsApplied();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
  };

  const handleZoneClick = () => {
    fileInputRef.current?.click();
  };

  const handleReset = () => {
    parser.reset();
    setVendorName('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!parser.configured) {
    return (
      <div className="pricing-card">
        <h3>Invoice Intelligence</h3>
        <p className="pricing-empty">
          Invoice parsing requires the Claude API. Set <strong>VITE_ANTHROPIC_API_KEY</strong> in your .env file to enable this feature.
        </p>
      </div>
    );
  }

  return (
    <div className="pricing-card">
      <h3>Invoice Intelligence</h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.84rem', margin: '0 0 0.8rem' }}>
        Upload a vendor invoice (text/CSV) and we&rsquo;ll extract line items with suggested pricing.
      </p>

      {parser.data.length === 0 ? (
        <form className="pricing-form" onSubmit={handleSubmit}>
          <label>
            Vendor Name
            <input
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              required
              placeholder="e.g. Pacific Leaf Distribution"
            />
          </label>

          <div className="pricing-upload-zone" onClick={handleZoneClick}>
            <input
              type="file"
              ref={fileInputRef}
              accept=".txt,.csv,.tsv,.pdf"
              onChange={handleFileChange}
            />
            {selectedFile ? (
              <p><strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024).toFixed(1)} KB)</p>
            ) : (
              <p>Click to select an invoice file (.txt, .csv, .tsv)</p>
            )}
          </div>

          {parser.error ? <p className="pricing-error">{parser.error}</p> : null}

          <div className="pricing-action-bar">
            <button
              type="submit"
              className="pricing-btn-primary"
              disabled={parser.loading || !selectedFile || !vendorName.trim()}
            >
              {parser.loading ? 'Parsing Invoice...' : 'Parse Invoice'}
            </button>
          </div>

          {parser.loading ? (
            <div className="pricing-loading"><div className="pricing-spinner" /> Parsing with AI — this may take a moment...</div>
          ) : null}
        </form>
      ) : (
        <>
          <div className="pricing-stats-row">
            <div className="pricing-stat-card">
              <div className="stat-label">Items Parsed</div>
              <div className="stat-value">{parser.data.length}</div>
            </div>
            <div className="pricing-stat-card">
              <div className="stat-label">Total Cost</div>
              <div className="stat-value">
                {formatUSD(parser.data.reduce((sum, item) => sum + item.total_cost, 0))}
              </div>
            </div>
            <div className="pricing-stat-card">
              <div className="stat-label">Est. Revenue</div>
              <div className="stat-value">
                {formatUSD(parser.data.reduce((sum, item) => sum + item.suggested_final * item.quantity, 0))}
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="pricing-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th className="cell-right">Qty</th>
                  <th className="cell-right">Unit Cost</th>
                  <th className="cell-right">Total Cost</th>
                  <th className="cell-right">Sugg. Markup</th>
                  <th className="cell-right">Sugg. Pre-Tax</th>
                  <th className="cell-right">Sugg. Final</th>
                </tr>
              </thead>
              <tbody>
                {parser.data.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_name}</td>
                    <td>{categoryLabels[item.category]}</td>
                    <td className="cell-right">{item.quantity}</td>
                    <td className="cell-right">{formatUSD(item.unit_cost)}</td>
                    <td className="cell-right">{formatUSD(item.total_cost)}</td>
                    <td className="cell-right">{item.suggested_markup}×</td>
                    <td className="cell-right">{formatUSD(item.suggested_pretax)}</td>
                    <td className="cell-right">{formatUSD(item.suggested_final)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pricing-action-bar">
            <button onClick={handleReset}>Parse Another Invoice</button>
          </div>
        </>
      )}
    </div>
  );
}
