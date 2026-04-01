// MTO Pricing — Dutchie external service (stubbed for Day 2)

import type { Region, ProductCategory } from '../types';

export interface DutchieListing {
  name: string;
  brand: string;
  category: ProductCategory;
  price: number;
  dispensaryName: string;
  region: Region;
}

const API_KEY = String(import.meta.env.VITE_DUTCHIE_API_KEY ?? '').trim();

export function isDutchieConfigured(): boolean {
  return Boolean(API_KEY);
}

export async function fetchDutchieListings(
  _region: Region,
  _category: ProductCategory,
): Promise<DutchieListing[]> {
  if (!API_KEY) {
    return [];
  }
  // TODO: Implement actual Dutchie API integration in Day 2
  return [];
}
