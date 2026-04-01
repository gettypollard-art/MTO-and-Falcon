// MTO Pricing — useReorderSuggestions hook

import { useState, useEffect, useCallback } from 'react';
import type { MtoReorderSuggestion, DataResult } from '../types';
import { isSupabaseConfigured } from '../../backend/supabaseClient';
import { fetchReorderSuggestions } from '../services/supabaseService';

export function useReorderSuggestions(
  storeId: string,
): DataResult<MtoReorderSuggestion[]> & { refresh: () => void } {
  const [data, setData] = useState<MtoReorderSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId || !isSupabaseConfigured()) {
      setData([]);
      setLoading(false);
      if (!storeId) setError(null);
      else setError('Supabase not configured');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const suggestions = await fetchReorderSuggestions(storeId);
      setData(suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reorder suggestions');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, error, refresh: load };
}
