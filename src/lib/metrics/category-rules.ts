import type { EngineTransactionItem } from "./types";

/**
 * Default category/modifier classification for the four attachment-style
 * detectors (spec §7, Detectors 1-3 & 5). `average_ticket` (Detector 4)
 * isn't category-conditioned at all, so it has no rule here.
 *
 * The spec asks for these to be manager-configurable ("Manager must be
 * able to define which categories/items count as add-ons" — Detector 2).
 * These defaults are the out-of-the-box behavior; persisting a per-org
 * override is deliberately deferred rather than bolted on here, because
 * its natural home is the CSV column-mapping flow (Phase 5) — that's
 * where a manager's own category taxonomy first enters the system, so
 * that's where "map your categories to our metric categories" belongs.
 * Every function below already takes the rule as a parameter rather than
 * hardcoding it, so wiring in a persisted override later is a data-source
 * change, not an engine rewrite.
 */

export interface AttachmentRule {
  /** "all" = every clean transaction is eligible; string[] = only
   * transactions containing an item in one of these categories. */
  eligibleCategories: "all" | string[];
  targetCategories: string[];
  /** Case-insensitive substrings matched against modifier names — a
   * premium upgrade is as often a modifier ("Upsize to Large") as a
   * standalone item. */
  targetModifierKeywords: string[];
}

const FOOD_MAIN_CATEGORIES = [
  "food",
  "entree",
  "main",
  "sandwich",
  "burger",
  "bowl",
  "meal",
  "pizza",
  "taco",
  "wrap",
  "salad",
];

export const DEFAULT_ATTACHMENT_RULES = {
  beverage_attachment: {
    eligibleCategories: FOOD_MAIN_CATEGORIES,
    targetCategories: ["beverage", "drink", "soda", "coffee", "tea", "smoothie", "juice"],
    targetModifierKeywords: [],
  },
  dessert_attachment: {
    eligibleCategories: FOOD_MAIN_CATEGORIES,
    targetCategories: ["dessert", "bakery", "sweet", "ice cream", "cookie", "cake"],
    targetModifierKeywords: [],
  },
  addon_attachment: {
    eligibleCategories: FOOD_MAIN_CATEGORIES,
    targetCategories: ["addon", "add-on", "side", "topping", "extra"],
    targetModifierKeywords: ["add ", "extra ", "topping"],
  },
  premium_upgrade_rate: {
    eligibleCategories: "all",
    targetCategories: ["premium", "deluxe"],
    targetModifierKeywords: ["large", "upsize", "premium", "deluxe", "upgrade", "xl"],
  },
} as const satisfies Record<string, AttachmentRule>;

export type AttachmentMetricCode = keyof typeof DEFAULT_ATTACHMENT_RULES;

function matchesCategory(item: EngineTransactionItem, categories: readonly string[]): boolean {
  if (!item.category) return false;
  const category = item.category.toLowerCase();
  return categories.some((c) => category.includes(c.toLowerCase()));
}

function matchesModifierKeyword(item: EngineTransactionItem, keywords: readonly string[]): boolean {
  if (keywords.length === 0) return false;
  return item.modifierNames.some((modifier) => {
    const lower = modifier.toLowerCase();
    return keywords.some((k) => lower.includes(k.toLowerCase()));
  });
}

export function itemMakesTransactionEligible(item: EngineTransactionItem, rule: AttachmentRule): boolean {
  if (rule.eligibleCategories === "all") return true;
  return matchesCategory(item, rule.eligibleCategories);
}

export function itemIsTargetAttachment(item: EngineTransactionItem, rule: AttachmentRule): boolean {
  return matchesCategory(item, rule.targetCategories) || matchesModifierKeyword(item, rule.targetModifierKeywords);
}
