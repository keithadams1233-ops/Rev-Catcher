"use client";

import { useState, useTransition } from "react";
import { redeemReward } from "@/app/employee/rewards/actions";

export function RedeemButton({ rewardId, canAfford }: { rewardId: string; canAfford: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setResult("idle");
    setMessage(null);
    startTransition(async () => {
      const outcome = await redeemReward(rewardId);
      if ("error" in outcome) {
        setResult("error");
        setMessage(outcome.error);
      } else {
        setResult("success");
      }
    });
  }

  if (result === "success") {
    return <p className="text-center text-xs font-semibold text-rewards-green">Redeemed! Pending fulfillment.</p>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={!canAfford || pending}
        className="w-full rounded-lg bg-gradient-to-r from-rewards-purple to-rewards-pink px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Redeeming…" : canAfford ? "Redeem" : "Not enough points"}
      </button>
      {result === "error" && message && <p className="mt-1 text-center text-xs text-rewards-pink">{message}</p>}
    </div>
  );
}
