/**
 * Formatting helpers shared by every screen that displays money, rates, or
 * confidence — kept in one place so "$7,800" vs "$7,800.00" and "28%" vs
 * "28.0%" don't drift screen to screen.
 */

const currencyWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const currencyPrecise = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "$7,800" — for large/whole-dollar amounts (revenue, profit, reward pools). */
export function formatCurrency(value: number): string {
  return currencyWhole.format(value);
}

/** "$13.33" — for per-transaction dollar amounts (average ticket). */
export function formatCurrencyPrecise(value: number): string {
  return currencyPrecise.format(value);
}

/**
 * Rates are stored as a 0–1 fraction. `decimals` controls precision;
 * trailing zeros after the decimal point are dropped ("28.0%" -> "28%").
 */
export function formatPercent(value: number, decimals = 1): string {
  const pct = value * 100;
  const fixed = pct.toFixed(decimals);
  const trimmed = decimals > 0 ? fixed.replace(/\.0+$/, "") : fixed;
  return `${trimmed}%`;
}

export function formatMultiplier(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}x`;
}

export type ConfidenceLabel = "High" | "Medium" | "Low";

/** confidence_score is stored 0–1; bucketed into the label managers see. */
export function confidenceLabel(score: number): ConfidenceLabel {
  if (score >= 0.7) return "High";
  if (score >= 0.4) return "Medium";
  return "Low";
}

/** Whether a metric's stored value is a dollar amount rather than a rate. */
export function isDollarMetric(metricCode: string): boolean {
  return metricCode === "average_ticket";
}

/** Formats a metric's current/benchmark value using the right unit. */
export function formatMetricValue(metricCode: string, value: number): string {
  return isDollarMetric(metricCode) ? formatCurrencyPrecise(value) : formatPercent(value);
}

const METRIC_NAMES: Record<string, string> = {
  beverage_attachment: "Beverage Attachment",
  addon_attachment: "Add-On Attachment",
  premium_upgrade_rate: "Premium Upgrade Rate",
  average_ticket: "Average Ticket",
  loyalty_enrollment: "Loyalty Enrollment",
  dessert_attachment: "Dessert Attachment",
};

export function metricName(metricCode: string): string {
  return METRIC_NAMES[metricCode] ?? metricCode;
}
