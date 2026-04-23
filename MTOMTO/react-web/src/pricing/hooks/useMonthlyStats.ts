// MTO Pricing — useMonthlyStats hook

import { useState, useEffect, useCallback } from 'react';
import type { MtoMonthlySales, MonthlyStatsRow, DataResult } from '../types';
import { isSupabaseConfigured } from '../../backend/supabaseClient';
import { fetchMonthlySales } from '../services/supabaseService';
import { computeProfitMargin } from '../utils';

function aggregateByMonth(sales: MtoMonthlySales[]): MonthlyStatsRow[] {
  const byMonth = new Map<string, { revenue: number; cost: number; units: number }>();
  for (const s of sales) {
    const existing = byMonth.get(s.month) ?? { revenue: 0, cost: 0, units: 0 };
    existing.revenue += s.revenue;
    existing.cost += s.cost_of_goods;
    existing.units += s.quantity_sold;
    byMonth.set(s.month, existing);
  }
  return Array.from(byMonth.entries())
    .map(([month, v]) => ({
      month,
      totalRevenue: v.revenue,
      totalCost: v.cost,
      totalProfit: v.revenue - v.cost,
      avgMargin: computeProfitMargin(v.revenue, v.cost),
      unitsSold: v.units,
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

/** Raw per-product-per-month rows — used by CustomerSpend for category-level revenue */
export function useRawMonthlySales(storeId: string): MtoMonthlySales[] {
  const [data, setData] = useState<MtoMonthlySales[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!storeId || !isSupabaseConfigured()) {
        if (!cancelled) setData([]);
        return;
      }
      try {
        const sales = await fetchMonthlySales(storeId);
        if (!cancelled) setData(sales);
      } catch {
        if (!cancelled) setData([]);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [storeId]);
  return data;
}

export function useMonthlyStats(
  storeId: string,
): DataResult<MonthlyStatsRow[]> & { refresh: () => void } {
  const [data, setData] = useState<MonthlyStatsRow[]>([]);
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
      const sales = await fetchMonthlySales(storeId);
      setData(aggregateByMonth(sales));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monthly stats');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!storeId || !isSupabaseConfigured()) {
        if (!cancelled) {
          setData([]);
          setLoading(false);
          if (!storeId) setError(null);
          else setError('Supabase not configured');
        }
        return;
      }
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
      try {
        const sales = await fetchMonthlySales(storeId);
        if (!cancelled) setData(aggregateByMonth(sales));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load monthly stats');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  return { data, loading, error, refresh: load };
}
