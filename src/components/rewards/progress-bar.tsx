export function RewardsProgressBar({
  percent,
  gradient = "from-rewards-purple via-rewards-pink to-rewards-blue",
}: {
  percent: number;
  gradient?: string;
}) {
  const clamped = Math.min(Math.max(percent, 0), 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2.5 w-full overflow-hidden rounded-full bg-rewards-surface2"
    >
      <div
        className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-500`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
