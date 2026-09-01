"use client";

import { useState, useTransition } from "react";
import { cancelRedemption } from "@/app/manager/people/actions";

export function CancelRedemptionButton({ redemptionId }: { redemptionId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!window.confirm("Cancel this redemption and return the points?")) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelRedemption(redemptionId);
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
        {pending ? "Cancelling…" : "Cancel & refund"}
      </button>
      {error && <p className="mt-1 text-xs text-manager-danger">{error}</p>}
    </div>
  );
}
