"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runProgressUpdate } from "@/app/manager/goals/[id]/actions";

export function UpdateProgressButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const outcome = await runProgressUpdate();
      if ("error" in outcome) {
        setError(outcome.error);
        return;
      }
      const { participantsUpdated, tiersAwarded, teamGoalsCompleted, challengesCompleted } = outcome.summary;
      if (participantsUpdated + tiersAwarded + teamGoalsCompleted + challengesCompleted === 0) {
        setMessage("No changes — no new data since the last update.");
      } else {
        setMessage(
          `${participantsUpdated} participants updated, ${tiersAwarded} tiers awarded, ${challengesCompleted} challenges completed.`,
        );
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-lg border border-manager-border px-3 py-1.5 text-xs font-medium text-manager-text transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {pending ? "Updating…" : "Update Progress"}
      </button>
      {message && <p className="text-xs text-manager-muted">{message}</p>}
      {error && <p className="text-xs text-manager-danger">{error}</p>}
    </div>
  );
}
