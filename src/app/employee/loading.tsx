/**
 * Route-level loading UI, same reasoning as manager/loading.tsx — every
 * Rev Rewards screen fetches real data before it can render.
 */
export default function EmployeeLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="grid grid-cols-3 gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl border border-rewards-border bg-rewards-surface" />
        ))}
      </div>
      <div className="h-16 animate-pulse rounded-2xl border border-rewards-border bg-rewards-surface" />
      <div className="h-32 animate-pulse rounded-2xl border border-rewards-border bg-rewards-surface" />
    </div>
  );
}
