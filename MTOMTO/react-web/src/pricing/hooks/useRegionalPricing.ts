// MTO Pricing — useRegionalPricing hook

import { useState, useEffect, useCallback } from 'react';
import type { MtoRegionalPricing, Region, DataResult } from '../types';
import { isSupabaseConfigured } from '../../backend/supabaseClient';
import { fetchRegionalPricing } from '../services/supabaseService';

export function useRegionalPricing(
  region: Region,
): DataResult<MtoRegionalPricing[]> & { refresh: () => void } {
  const [data, setData] = useState<MtoRegionalPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setData([]);
      setLoading(false);
      setError('Supabase not configured');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const pricing = await fetchRegionalPricing(region);
      setData(pricing);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load regional pricing');
    } finally {
      setLoading(false);
    }
  }, [region]);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, error, refresh: load };
}
