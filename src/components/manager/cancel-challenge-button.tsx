"use client";

import { useState, useTransition } from "react";
import { cancelChallenge } from "@/app/manager/goals/[id]/actions";

export function CancelChallengeButton({ challengeId }: { challengeId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!window.confirm("Cancel this challenge? Employees will no longer see it as active.")) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelChallenge(challengeId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-lg border border-manager-danger/50 px-3 py-1.5 text-xs font-medium text-manager-danger transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {pending ? "Cancelling…" : "Cancel challenge"}
      </button>
      {error && <p className="mt-1 text-xs text-manager-danger">{error}</p>}
    </div>
  );
}
