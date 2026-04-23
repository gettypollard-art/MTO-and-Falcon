// MTO Pricing — useCompetitorStores hook
// Returns the list of distinct scraped competitor dispensary names for a region.

import { useState, useEffect } from 'react';
import { isSupabaseConfigured } from '../../backend/supabaseClient';
import { fetchCompetitorStoreNames } from '../services/supabaseService';

export function useCompetitorStores(region: string, refreshKey?: string | number): string[] {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isSupabaseConfigured()) {
        if (!cancelled) setNames([]);
        return;
      }
      try {
        const result = await fetchCompetitorStoreNames(region);
        if (!cancelled) setNames(result);
      } catch {
        if (!cancelled) setNames([]);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [region, refreshKey]);

  return names;
}
