// MTO Pricing — Export + POS Sync Tab

import { useState } from 'react';
import type { MtoProduct, MtoStore } from '../types';
import { productsToExportRows, formatUSD } from '../utils';
import { downloadCsvFallback, isGoogleSheetsConfigured, exportToGoogleSheets } from '../services/googleSheetsService';

interface Props {
  products: MtoProduct[];
  store: MtoStore | null;
}

export function ExportPosSyncTab({ products, store }: Props) {
  const [sheetsId, setSheetsId] = useState('');
  const [sheetsStatus, setSheetsStatus] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle');

  const storeName = store?.name ?? 'Unknown Store';

  const handleCsvDownload = () => {
    if (products.length === 0) return;
    const rows = productsToExportRows(products, storeName);
    const fileName = `mto_pricing_${store?.code ?? 'export'}_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsvFallback(rows, fileName);
  };

  const handleSheetsExport = async () => {
    if (!sheetsId.trim() || products.length === 0) return;
    setSheetsStatus('exporting');
    try {
      const rows = productsToExportRows(products, storeName);
      const ok = await exportToGoogleSheets(sheetsId.trim(), rows);
      setSheetsStatus(ok ? 'done' : 'error');
    } catch {
      setSheetsStatus('error');
    }
  };

  const sheetsConfigured = isGoogleSheetsConfigured();

  const posConfigured = Boolean(
    String(import.meta.env.VITE_WEEDMAPS_API_KEY ?? '').trim() ||
    String(import.meta.env.VITE_DUTCHIE_API_KEY ?? '').trim()
  );

  return (
    <div className="pricing-card">
      <h3>Export &amp; POS Sync</h3>

      <div className="pricing-stats-row">
        <div className="pricing-stat-card">
          <div className="stat-label">Products to Export</div>
          <div className="stat-value">{products.length}</div>
        </div>
        <div className="pricing-stat-card">
          <div className="stat-label">Store</div>
          <div className="stat-value" style={{ fontSize: '1rem' }}>{storeName}</div>
        </div>
        <div className="pricing-stat-card">
          <div className="stat-label">Total Menu Value</div>
          <div className="stat-value">
            {formatUSD(products.reduce((s, p) => s + p.final_price, 0))}
          </div>
        </div>
      </div>

      {/* CSV Export */}
      <div style={{ marginBottom: '1rem' }}>
        <h4 style={{ margin: '0 0 0.4rem' }}>CSV Export</h4>
        <p style={{ color: 'var(--muted)', fontSize: '0.84rem', margin: '0 0 0.5rem' }}>
          Download all products as a CSV file for manual import or archiving.
        </p>
        <button
          className="pricing-btn-primary"
          onClick={handleCsvDownload}
          disabled={products.length === 0}
        >
          Download CSV ({products.length} products)
        </button>
      </div>

      {/* Google Sheets */}
      <div style={{ marginBottom: '1rem' }}>
        <h4 style={{ margin: '0 0 0.4rem' }}>Google Sheets</h4>
        {sheetsConfigured ? (
          <div className="pricing-form">
            <label>
              Spreadsheet ID
              <input
                value={sheetsId}
                onChange={(e) => setSheetsId(e.target.value)}
                placeholder="Enter Google Sheets spreadsheet ID"
              />
            </label>
            <div className="pricing-action-bar">
              <button
                className="pricing-btn-primary"
                onClick={handleSheetsExport}
                disabled={!sheetsId.trim() || products.length === 0 || sheetsStatus === 'exporting'}
              >
                {sheetsStatus === 'exporting' ? 'Exporting...' : 'Export to Sheets'}
              </button>
            </div>
            {sheetsStatus === 'done' ? <p className="cell-positive" style={{ margin: '0.3rem 0 0' }}>Export complete!</p> : null}
            {sheetsStatus === 'error' ? <p className="pricing-error">Export failed. Check the spreadsheet ID and try again.</p> : null}
          </div>
        ) : (
          <p className="pricing-empty">
            Google Sheets integration requires <strong>VITE_GOOGLE_SHEETS_API_KEY</strong>. Use CSV export as an alternative.
          </p>
        )}
      </div>

      {/* POS Sync */}
      <div>
        <h4 style={{ margin: '0 0 0.4rem' }}>POS Sync</h4>
        <p style={{ color: 'var(--muted)', fontSize: '0.84rem', margin: '0 0 0.4rem' }}>
          Push pricing directly to your POS (Dutchie, Weedmaps). Requires API write access keys from each platform.
        </p>
        {posConfigured ? (
          <p style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
            API key detected. Contact your POS provider to enable programmatic price updates, then
            set <strong>VITE_WEEDMAPS_API_KEY</strong> / <strong>VITE_DUTCHIE_API_KEY</strong> with write-scope tokens.
          </p>
        ) : (
          <p className="pricing-empty">
            Set <strong>VITE_WEEDMAPS_API_KEY</strong> and/or <strong>VITE_DUTCHIE_API_KEY</strong> (write-scope) to enable direct POS sync.
            Until then, use CSV export and import manually in your POS dashboard.
          </p>
        )}
      </div>
    </div>
  );
}
