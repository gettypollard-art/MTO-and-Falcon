// MTO Pricing — useProducts hook

import { useState, useEffect, useCallback } from 'react';
import type { MtoProduct, DataResult } from '../types';
import { isSupabaseConfigured } from '../../backend/supabaseClient';
import { fetchProducts } from '../services/supabaseService';

export function useProducts(storeId: string): DataResult<MtoProduct[]> & { refresh: () => void } {
  const [data, setData] = useState<MtoProduct[]>([]);
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
      const products = await fetchProducts(storeId);
      setData(products);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, error, refresh: load };
}
