"use client";

import { useEffect } from "react";

/** Same reasoning as manager/error.tsx, in Rev Rewards' own visual language. */
export default function EmployeeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-2xl border border-rewards-border bg-rewards-surface p-6 text-center">
      <h1 className="text-lg font-semibold text-rewards-text">Something went wrong</h1>
      <p className="mt-2 text-sm text-rewards-muted">
        This screen hit an unexpected error. Your points and progress are safe — try again in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg bg-rewards-pink px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
