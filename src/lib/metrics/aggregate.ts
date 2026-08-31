import type { EngineTransaction } from "./types";

/**
 * Grouping helper for rollups (spec §7: "Calculate: employee level,
 * location level, organization level"). The org level needs no grouping
 * at all — it's just every transaction passed straight to a detector.
 */
export function groupTransactionsBy(
  transactions: EngineTransaction[],
  keyFn: (t: EngineTransaction) => string | null,
): Map<string, EngineTransaction[]> {
  const groups = new Map<string, EngineTransaction[]>();
  for (const txn of transactions) {
    const key = keyFn(txn);
    if (key === null) continue;
    const group = groups.get(key);
    if (group) {
      group.push(txn);
    } else {
      groups.set(key, [txn]);
    }
  }
  return groups;
}

export function byEmployee(transactions: EngineTransaction[]): Map<string, EngineTransaction[]> {
  return groupTransactionsBy(transactions, (t) => t.employeeId);
}

export function byLocation(transactions: EngineTransaction[]): Map<string, EngineTransaction[]> {
  return groupTransactionsBy(transactions, (t) => t.locationId);
}
