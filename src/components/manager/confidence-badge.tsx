import { confidenceLabel } from "@/lib/format";

const DOT_CLASSES = {
  High: "bg-manager-accent",
  Medium: "bg-manager-warn",
  Low: "bg-manager-danger",
} as const;

/**
 * Confidence is always shown as a labeled pill, never color alone — the
 * text ("High"/"Medium"/"Low") carries the meaning; the dot is a visual
 * accent on top of it (spec §24: don't rely exclusively on color).
 */
export function ConfidenceBadge({ score }: { score: number }) {
  const label = confidenceLabel(score);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-manager-border bg-manager-surface2 px-2.5 py-1 text-xs font-medium text-manager-text">
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[label]}`} />
      {label} confidence
    </span>
  );
}
