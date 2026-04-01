// MTO Pricing — useAdvisorRules
//
// Manages business rules stored in localStorage.
// Rules survive page reloads and are scoped to the browser profile.

import { useState, useCallback } from 'react';
import type { BusinessRule, RuleType, ProductCategory } from '../types';

const STORAGE_KEY = 'mto_advisor_rules_v1';

function loadRules(): BusinessRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BusinessRule[]) : [];
  } catch {
    return [];
  }
}

function persist(rules: BusinessRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // localStorage might be unavailable in some envs; fail silently
  }
}

export interface AddRuleOptions {
  productId?: string;
  category?: ProductCategory;
  reason?: string;
}

export function useAdvisorRules() {
  const [rules, setRules] = useState<BusinessRule[]>(() => loadRules());

  const addRule = useCallback(
    (ruleType: RuleType, value: number, opts: AddRuleOptions = {}) => {
      const newRule: BusinessRule = {
        id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ruleType,
        value,
        productId: opts.productId,
        category: opts.category,
        reason: opts.reason ?? '',
        active: true,
        createdAt: new Date().toISOString(),
      };
      setRules((prev) => {
        const next = [...prev, newRule];
        persist(next);
        return next;
      });
    },
    [],
  );

  const removeRule = useCallback((id: string) => {
    setRules((prev) => {
      const next = prev.filter((r) => r.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const toggleRule = useCallback((id: string) => {
    setRules((prev) => {
      const next = prev.map((r) =>
        r.id === id ? { ...r, active: !r.active } : r,
      );
      persist(next);
      return next;
    });
  }, []);

  const clearRules = useCallback(() => {
    setRules([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  return { rules, addRule, removeRule, toggleRule, clearRules };
}
