export function ProgressBar({ percent, tone = "accent" }: { percent: number; tone?: "accent" | "pink" }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const barClass = tone === "accent" ? "bg-manager-accent" : "bg-manager-warn";

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full bg-manager-surface2"
    >
      <div className={`h-full rounded-full ${barClass} transition-all`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** Progress from baseline toward target, given a current value. */
export function progressPercent(baseline: number, current: number, target: number): number {
  const span = target - baseline;
  if (span === 0) return current >= target ? 100 : 0;
  return ((current - baseline) / span) * 100;
}
