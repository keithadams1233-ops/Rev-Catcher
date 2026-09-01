/**
 * Route-level loading UI (Next.js App Router convention) — shown while a
 * manager screen's Server Component is fetching. Every manager screen
 * does at least one real Supabase query before it can render anything, so
 * without this a slow connection (real risk for a pilot restaurant's
 * wifi) shows a blank page with zero feedback during navigation.
 */
export default function ManagerLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="h-20 animate-pulse rounded-2xl border border-manager-border bg-manager-surface" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl border border-manager-border bg-manager-surface" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl border border-manager-border bg-manager-surface" />
    </div>
  );
}
