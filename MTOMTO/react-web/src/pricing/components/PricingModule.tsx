// MTO Pricing — Top-level Pricing Module with store selector and 9 tabs

import { useState, useMemo } from 'react';
import type { Region } from '../types';
import { useStores } from '../hooks/useStores';
import { useProducts } from '../hooks/useProducts';
import { useMonthlyStats, useRawMonthlySales } from '../hooks/useMonthlyStats';
import { useReorderSuggestions } from '../hooks/useReorderSuggestions';
import { useAdvisorRules } from '../hooks/useAdvisorRules';
import { CompetitivePricingTab } from './CompetitivePricing';
import { PriceBuilderTab } from './PriceBuilder';
import { InvoiceIntelligenceTab } from './InvoiceIntelligence';
import { MonthlyDashboardTab } from './MonthlyDashboard';
import { ReorderIntelligenceTab } from './ReorderIntelligence';
import { VendorForecastTab } from './VendorForecast';
import { CustomerSpendTab } from './CustomerSpend';
import { ParaphernaliaTab } from './Paraphernalia';
import { ExportPosSyncTab } from './ExportPosSync';
import { isSupabaseConfigured } from '../../backend/supabaseClient';
import '../PricingModule.css';

type PricingTab =
  | 'competitive'
  | 'builder'
  | 'invoice'
  | 'monthly'
  | 'reorder'
  | 'vendor'
  | 'customer'
  | 'paraphernalia'
  | 'export';

type NavGroup = { heading: string; items: Array<{ key: PricingTab; label: string; sub: string }> };

const navGroups: NavGroup[] = [
  {
    heading: 'Analytics',
    items: [
      { key: 'competitive', label: 'Competitive',   sub: 'Market price comparison' },
      { key: 'monthly',     label: 'Monthly',       sub: 'Revenue & profit trends' },
      { key: 'customer',    label: 'Customer Spend', sub: 'Spending by category' },
    ],
  },
  {
    heading: 'Pricing Tools',
    items: [
      { key: 'builder', label: 'Price Builder',       sub: 'Calculate markup & tax' },
      { key: 'invoice', label: 'Invoice Intelligence', sub: 'Parse invoices with AI' },
    ],
  },
  {
    heading: 'Inventory',
    items: [
      { key: 'reorder',      label: 'Reorder Alerts', sub: 'Low stock warnings' },
      { key: 'vendor',       label: 'Vendor Forecast', sub: 'Seasonal projections' },
      { key: 'paraphernalia', label: 'Paraphernalia', sub: 'Accessories pricing' },
    ],
  },
  {
    heading: 'Export',
    items: [
      { key: 'export', label: 'Export & POS Sync', sub: 'CSV, Sheets, Dutchie' },
    ],
  },
];

export function PricingModule() {
  const [activeTab, setActiveTab] = useState<PricingTab>('competitive');
  const stores = useStores();
  const [selectedStoreId, setSelectedStoreId] = useState('');

  // Auto-select first store when loaded
  const storeId = useMemo(() => {
    if (selectedStoreId) return selectedStoreId;
    if (stores.data.length > 0) return stores.data[0].id;
    return '';
  }, [selectedStoreId, stores.data]);

  const selectedStore = useMemo(
    () => stores.data.find((s) => s.id === storeId) ?? null,
    [stores.data, storeId],
  );

  const storeRegion: Region = selectedStore?.region ?? 'Portland_Metro';

  const products           = useProducts(storeId);
  const monthlyStats       = useMonthlyStats(storeId);
  const rawSales           = useRawMonthlySales(storeId);
  const reorderSuggestions = useReorderSuggestions(storeId);
  const advisorRules = useAdvisorRules();

  if (!isSupabaseConfigured()) {
    return (
      <div className="pricing-module">
        <div className="pricing-card">
          <h3>MTO Competitive Pricing</h3>
          <p className="pricing-error">
            Supabase is not configured. Add <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> to your .env file, then run the mto_pricing_schema.sql migration.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pricing-module">
      <div className="pricing-layout">

        {/* ── Sidebar nav ── */}
        <aside className="pricing-sidebar">
          <div className="pricing-sidebar-header">
            <div className="pricing-sidebar-title">Pricing</div>
            {stores.loading ? (
              <span className="pricing-store-loading">Loading…</span>
            ) : stores.error ? (
              <span className="pricing-store-error">{stores.error}</span>
            ) : (
              <select
                className="pricing-store-select"
                value={storeId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
              >
                {stores.data.length === 0 ? (
                  <option value="">No stores</option>
                ) : null}
                {stores.data.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
          <nav className="pricing-sidebar-nav">
            {navGroups.map((group) => (
              <div key={group.heading} className="pricing-nav-group">
                <div className="pricing-nav-group-heading">{group.heading}</div>
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    className={`pricing-nav-item ${activeTab === item.key ? 'pricing-nav-active' : ''}`}
                    onClick={() => setActiveTab(item.key)}
                  >
                    <span className="pricing-nav-label">{item.label}</span>
                    <span className="pricing-nav-sub">{item.sub}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {/* ── Content area ── */}
        <div className="pricing-content">

      {activeTab === 'competitive' ? (
      <CompetitivePricingTab
        defaultStoreId={storeId}
        storeRegion={storeRegion}
        storeLocation={selectedStore?.location}
        reorderSuggestions={reorderSuggestions.data}
        rules={advisorRules.rules}
        onAddRule={advisorRules.addRule}
        onRemoveRule={advisorRules.removeRule}
        onToggleRule={advisorRules.toggleRule}
      />
      ) : null}

      {activeTab === 'builder' ? (
        <PriceBuilderTab
          storeId={storeId}
          products={products.data}
          onProductCreated={products.refresh}
        />
      ) : null}

      {activeTab === 'invoice' ? (
        <InvoiceIntelligenceTab storeId={storeId} onItemsApplied={products.refresh} />
      ) : null}

      {activeTab === 'monthly' ? (
        <MonthlyDashboardTab
          stats={monthlyStats.data}
          loading={monthlyStats.loading}
          error={monthlyStats.error}
        />
      ) : null}

      {activeTab === 'reorder' ? (
        <ReorderIntelligenceTab
          suggestions={reorderSuggestions.data}
          products={products.data}
          loading={reorderSuggestions.loading}
          error={reorderSuggestions.error}
        />
      ) : null}

      {activeTab === 'vendor' ? (
        <VendorForecastTab products={products.data} rawSales={rawSales} />
      ) : null}

      {activeTab === 'customer' ? (
        <CustomerSpendTab products={products.data} rawSales={rawSales} />
      ) : null}

      {activeTab === 'paraphernalia' ? (
        <ParaphernaliaTab products={products.data} />
      ) : null}

      {activeTab === 'export' ? (
        <ExportPosSyncTab products={products.data} store={selectedStore} />
      ) : null}

        </div>{/* end pricing-content */}
      </div>{/* end pricing-layout */}
    </div>
  );
}
