import { DEFAULT_ATTACHMENT_RULES } from "./category-rules";
import { calculateAttachmentRate } from "./attachment";
import { calculateAverageTicket } from "./average-ticket";
import { byEmployee, byLocation } from "./aggregate";
import type { DetectorMetricCode, EngineTransaction, MetricResult } from "./types";

export * from "./types";
export * from "./eligibility";
export * from "./category-rules";
export { calculateAttachmentRate } from "./attachment";
export { calculateAverageTicket } from "./average-ticket";
export { groupTransactionsBy, byEmployee, byLocation } from "./aggregate";

/** Dispatches to the right detector for any of the five metric codes. */
export function computeMetric(metricCode: DetectorMetricCode, transactions: EngineTransaction[]): MetricResult {
  if (metricCode === "average_ticket") return calculateAverageTicket(transactions);
  return calculateAttachmentRate(transactions, DEFAULT_ATTACHMENT_RULES[metricCode]);
}

/** Organization level needs no grouping — every transaction, one result. */
export function computeMetricForOrganization(
  metricCode: DetectorMetricCode,
  transactions: EngineTransaction[],
): MetricResult {
  return computeMetric(metricCode, transactions);
}

export function computeMetricByEmployee(
  metricCode: DetectorMetricCode,
  transactions: EngineTransaction[],
): Map<string, MetricResult> {
  return new Map([...byEmployee(transactions)].map(([id, txns]) => [id, computeMetric(metricCode, txns)]));
}

export function computeMetricByLocation(
  metricCode: DetectorMetricCode,
  transactions: EngineTransaction[],
): Map<string, MetricResult> {
  return new Map([...byLocation(transactions)].map(([id, txns]) => [id, computeMetric(metricCode, txns)]));
}
