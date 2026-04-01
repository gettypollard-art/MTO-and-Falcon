/**
 * MTO Pricing — Business Rules Engine
 *
 * Pure functions that evaluate a set of BusinessRule constraints against a
 * candidate suggestion.  Rules are evaluated in order; the first match wins.
 * All types pure — no React, no Supabase, no side effects.
 */

import type { BusinessRule, PricingAction, ProductCategory } from '../types';

export interface RuleEvaluation {
  /** If true the suggestion is vetoed entirely — keep current price */
  vetoSuggestion: boolean;
  /** When set, clamp the suggestion to exactly this price */
  cappedPrice: number | null;
  /** When set (freeze), override the action */
  overrideAction: PricingAction | null;
  /** The rule that produced this result; null when no rule matched */
  matchedRule: BusinessRule | null;
}

const NOOP: RuleEvaluation = {
  vetoSuggestion: false,
  cappedPrice: null,
  overrideAction: null,
  matchedRule: null,
};

function appliesToProduct(
  rule: BusinessRule,
  productId: string,
  category: ProductCategory,
): boolean {
  if (!rule.active) return false;
  // Product-level rules must match exactly
  if (rule.productId != null) return rule.productId === productId;
  // Category-level rules apply when category matches (or rule has no category/product scope)
  if (rule.category != null) return rule.category === category;
  // If neither productId nor category is set the rule is global
  return true;
}

/**
 * Evaluate all business rules against a candidate suggested price.
 * Returns the first matching constraint result.
 */
export function evaluateRules(
  rules: BusinessRule[],
  productId: string,
  category: ProductCategory,
  suggestedPrice: number,
  currentPrice: number,
): RuleEvaluation {
  for (const rule of rules) {
    if (!appliesToProduct(rule, productId, category)) continue;

    switch (rule.ruleType) {
      case 'freeze':
        return {
          vetoSuggestion: true,
          cappedPrice: currentPrice,
          overrideAction: 'hold',
          matchedRule: rule,
        };

      case 'min_price':
      case 'category_floor':
        if (suggestedPrice < rule.value) {
          return {
            vetoSuggestion: false,
            cappedPrice: Math.round(rule.value * 100) / 100,
            overrideAction: null,
            matchedRule: rule,
          };
        }
        break;

      case 'max_price':
      case 'category_ceiling':
        if (suggestedPrice > rule.value) {
          return {
            vetoSuggestion: false,
            cappedPrice: Math.round(rule.value * 100) / 100,
            overrideAction: null,
            matchedRule: rule,
          };
        }
        break;
    }
  }

  return { ...NOOP };
}

/** Human-readable label for a rule type */
export const RULE_TYPE_LABELS: Record<BusinessRule['ruleType'], string> = {
  min_price:        'Min Price (SKU)',
  max_price:        'Max Price (SKU)',
  freeze:           'Freeze (no change)',
  category_ceiling: 'Category Ceiling',
  category_floor:   'Category Floor',
};
