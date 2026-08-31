"use client";

import { useState, useTransition } from "react";
import { runLeakDetection } from "@/app/manager/leaks/actions";

export function DetectLeaksButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const outcome = await runLeakDetection();
      if ("error" in outcome) {
        setError(outcome.error);
        return;
      }
      const { leaksCreated, leaksUpdated, leaksResolved } = outcome.summary;
      if (leaksCreated + leaksUpdated + leaksResolved === 0) {
        setMessage("No changes — nothing new to detect from current data.");
      } else {
        setMessage(`${leaksCreated} new, ${leaksUpdated} updated, ${leaksResolved} resolved.`);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-lg border border-manager-border px-3 py-2 text-xs font-medium text-manager-text transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {pending ? "Detecting…" : "Detect Leaks"}
      </button>
      {message && <p className="text-xs text-manager-muted">{message}</p>}
      {error && <p className="text-xs text-manager-danger">{error}</p>}
    </div>
  );
}
