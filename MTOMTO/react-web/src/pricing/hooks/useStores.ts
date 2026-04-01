// MTO Pricing — useStores hook

import { useState, useEffect, useCallback } from 'react';
import type { MtoStore, DataResult } from '../types';
import { isSupabaseConfigured } from '../../backend/supabaseClient';
import { fetchStores } from '../services/supabaseService';

export function useStores(): DataResult<MtoStore[]> & { refresh: () => void } {
  const [data, setData] = useState<MtoStore[]>([]);
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
      const stores = await fetchStores();
      setData(stores);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, error, refresh: load };
}
