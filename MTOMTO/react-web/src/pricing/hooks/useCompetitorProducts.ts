// MTO Pricing — useCompetitorProducts hook
// Loads scraped competitor data from the competitor_products table.

import { useState, useEffect, useCallback } from 'react';
import type { CompetitorProduct, DataResult } from '../types';
import { isSupabaseConfigured } from '../../backend/supabaseClient';
import { fetchCompetitorProducts } from '../services/supabaseService';

export function useCompetitorProducts(
  region: string,
): DataResult<CompetitorProduct[]> & { refresh: () => void } {
  const [data, setData] = useState<CompetitorProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setData([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchCompetitorProducts(region);
      setData(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load competitor products');
    } finally {
      setLoading(false);
    }
  }, [region]);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, error, refresh: load };
}
