"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary (Next.js App Router convention) — catches
 * anything a manager screen's Server Component throws (a failed Supabase
 * query, an unexpected null) so a pilot manager sees a recoverable,
 * on-brand message instead of Next's raw default error page.
 */
export default function ManagerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-2xl border border-manager-danger/40 bg-manager-surface p-6 text-center">
      <h1 className="text-lg font-semibold text-manager-text">Something went wrong</h1>
      <p className="mt-2 text-sm text-manager-muted">
        This screen hit an unexpected error. Your data is safe — try again, or come back in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg bg-manager-accent px-4 py-2 text-sm font-semibold text-manager-bg transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
