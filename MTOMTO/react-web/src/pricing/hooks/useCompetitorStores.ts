// MTO Pricing — useCompetitorStores hook
// Returns the list of distinct scraped competitor dispensary names for a region.

import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../../backend/supabaseClient';
import { fetchCompetitorStoreNames } from '../services/supabaseService';

export function useCompetitorStores(region: string): string[] {
  const [names, setNames] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) { setNames([]); return; }
    try {
      const result = await fetchCompetitorStoreNames(region);
      setNames(result);
    } catch {
      setNames([]);
    }
  }, [region]);

  useEffect(() => { void load(); }, [load]);

  return names;
}
