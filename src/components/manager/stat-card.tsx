const TONE_CLASSES = {
  positive: "text-manager-accent",
  neutral: "text-manager-text",
  warning: "text-manager-warn",
} as const;

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: keyof typeof TONE_CLASSES;
}) {
  return (
    <div className="rounded-2xl border border-manager-border bg-manager-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-manager-muted">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${TONE_CLASSES[tone]}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-manager-muted">{sub}</p>}
    </div>
  );
}
