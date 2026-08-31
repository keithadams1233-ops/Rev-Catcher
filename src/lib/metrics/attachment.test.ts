import { describe, it, expect } from "vitest";
import { calculateAttachmentRate } from "./attachment";
import { DEFAULT_ATTACHMENT_RULES } from "./category-rules";
import { txn, item } from "./test-helpers";

describe("calculateAttachmentRate — beverage_attachment", () => {
  const rule = DEFAULT_ATTACHMENT_RULES.beverage_attachment;

  it("matches the spec §9 worked example (10,000 eligible, 28% -> gap math elsewhere; here just the rate)", () => {
    // 10 eligible (food) transactions, 3 with a beverage attached -> 30%.
    const transactions = [
      ...Array.from({ length: 3 }, () =>
        txn({ items: [item({ category: "Food" }), item({ category: "Beverage" })] }),
      ),
      ...Array.from({ length: 7 }, () => txn({ items: [item({ category: "Food" })] })),
    ];

    const result = calculateAttachmentRate(transactions, rule);
    expect(result).toEqual({ numerator: 3, denominator: 10, value: 0.3 });
  });

  it("ignores transactions with no eligible (food) item at all", () => {
    const transactions = [
      txn({ items: [item({ category: "Beverage" })] }), // beverage-only order — never became "eligible"
      txn({ items: [item({ category: "Food" }), item({ category: "Beverage" })] }),
    ];

    const result = calculateAttachmentRate(transactions, rule);
    expect(result).toEqual({ numerator: 1, denominator: 1, value: 1 });
  });

  it("excludes voided and refunded transactions entirely", () => {
    const transactions = [
      txn({ voided: true, items: [item({ category: "Food" }), item({ category: "Beverage" })] }),
      txn({ refundAmount: 5, items: [item({ category: "Food" })] }),
      txn({ items: [item({ category: "Food" })] }),
    ];

    const result = calculateAttachmentRate(transactions, rule);
    expect(result).toEqual({ numerator: 0, denominator: 1, value: 0 });
  });

  it("doesn't count a beverage item that was itself voided off the order", () => {
    const transactions = [
      txn({ items: [item({ category: "Food" }), item({ category: "Beverage", voided: true })] }),
    ];

    const result = calculateAttachmentRate(transactions, rule);
    expect(result).toEqual({ numerator: 0, denominator: 1, value: 0 });
  });

  it("returns 0, not NaN, when there are no eligible transactions", () => {
    const result = calculateAttachmentRate([], rule);
    expect(result).toEqual({ numerator: 0, denominator: 0, value: 0 });
  });
});

describe("calculateAttachmentRate — dessert_attachment", () => {
  const rule = DEFAULT_ATTACHMENT_RULES.dessert_attachment;

  it("attaches on dessert/bakery categories, not beverages", () => {
    const transactions = [
      txn({ items: [item({ category: "Entree" }), item({ category: "Dessert" })] }),
      txn({ items: [item({ category: "Entree" }), item({ category: "Beverage" })] }),
    ];

    const result = calculateAttachmentRate(transactions, rule);
    expect(result).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
  });
});

describe("calculateAttachmentRate — addon_attachment", () => {
  const rule = DEFAULT_ATTACHMENT_RULES.addon_attachment;

  it("attaches on an add-on category or an 'extra'-style modifier", () => {
    const transactions = [
      txn({ items: [item({ category: "Sandwich" }), item({ category: "Side" })] }),
      txn({ items: [item({ category: "Bowl", modifierNames: ["Extra Guac"] })] }),
      txn({ items: [item({ category: "Bowl" })] }),
    ];

    const result = calculateAttachmentRate(transactions, rule);
    expect(result).toEqual({ numerator: 2, denominator: 3, value: 2 / 3 });
  });
});

describe("calculateAttachmentRate — premium_upgrade_rate", () => {
  const rule = DEFAULT_ATTACHMENT_RULES.premium_upgrade_rate;

  it("eligibility isn't conditioned on a food item — every clean transaction counts", () => {
    const transactions = [
      txn({ items: [item({ category: "Beverage", modifierNames: ["Upsize to Large"] })] }),
      txn({ items: [item({ category: "Beverage" })] }),
    ];

    const result = calculateAttachmentRate(transactions, rule);
    expect(result).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
  });

  it("detects a premium upgrade via item category as well as modifier", () => {
    const transactions = [txn({ items: [item({ category: "Premium Bowl" })] })];
    const result = calculateAttachmentRate(transactions, rule);
    expect(result.numerator).toBe(1);
  });
});
