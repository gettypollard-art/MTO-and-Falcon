// MTO Pricing — Top-level Pricing Module (competitive view focused)

import { useMemo } from 'react';
import { useStores } from '../hooks/useStores';
import { useReorderSuggestions } from '../hooks/useReorderSuggestions';
import { useAdvisorRules } from '../hooks/useAdvisorRules';
import { CompetitivePricingTab } from './CompetitivePricing';
import { isSupabaseConfigured } from '../../backend/supabaseClient';
import '../PricingModule.css';

export function PricingModule() {
  const stores = useStores();

  // Auto-select first store when loaded.
  const storeId = useMemo(() => {
    if (stores.data.length > 0) return stores.data[0].id;
    return '';
  }, [stores.data]);

  const selectedStore = useMemo(
    () => stores.data.find((s) => s.id === storeId) ?? null,
    [stores.data, storeId],
  );

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
      <CompetitivePricingTab
        defaultStoreId={storeId}
        storeLocation={selectedStore?.location}
        reorderSuggestions={reorderSuggestions.data}
        rules={advisorRules.rules}
        onAddRule={advisorRules.addRule}
        onRemoveRule={advisorRules.removeRule}
        onToggleRule={advisorRules.toggleRule}
      />
    </div>
  );
}
