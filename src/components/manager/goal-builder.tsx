"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { LeakDetail } from "@/lib/data/manager";
import {
  CHALLENGE_DURATION_OPTIONS,
  DEFAULT_CHALLENGE_DURATION_DAYS,
  DEFAULT_REWARD_BUDGET_PCT,
  REWARD_BUDGET_PRESETS,
  recommendTarget,
  recommendTiers,
  rewardBudgetFromPct,
  rewardRatio,
  isRewardRatioHealthy,
  scaleOpportunityToTarget,
  type RecommendedTier,
} from "@/lib/challenges/recommendations";
import { formatCurrency, formatMetricValue, formatMultiplier, isDollarMetric, metricName } from "@/lib/format";
import { launchChallenge } from "@/app/manager/goals/new/actions";

type RewardPreset = "10" | "15" | "20" | "custom";

export function GoalBuilder({ leak, employeeCount }: { leak: LeakDetail; employeeCount: number }) {
  const router = useRouter();
  const dollar = isDollarMetric(leak.metricCode);

  const [title, setTitle] = useState(`${metricName(leak.metricCode)} Challenge`);
  const [description, setDescription] = useState(leak.metricDescription ?? "");
  const [targetValue, setTargetValue] = useState(() =>
    recommendTarget(leak.currentValue, leak.benchmarkValue, dollar),
  );
  const [durationDays, setDurationDays] = useState<number>(DEFAULT_CHALLENGE_DURATION_DAYS);
  const [rewardPreset, setRewardPreset] = useState<RewardPreset>(
    String(DEFAULT_REWARD_BUDGET_PCT * 100) as RewardPreset,
  );
  const [customBudget, setCustomBudget] = useState<number>(0);
  const [tiers, setTiers] = useState<RecommendedTier[]>(() =>
    recommendTiers(leak.currentValue, targetValue, leak.benchmarkValue, dollar),
  );
  const [teamGoalEnabled, setTeamGoalEnabled] = useState(true);
  const [teamGoalTarget, setTeamGoalTarget] = useState(() =>
    recommendTarget(targetValue, leak.benchmarkValue, dollar),
  );
  const [teamGoalPoints, setTeamGoalPoints] = useState(750);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projected = useMemo(
    () =>
      scaleOpportunityToTarget(
        leak.estimatedIncrementalRevenue,
        leak.estimatedContributionProfit,
        leak.currentValue,
        leak.benchmarkValue,
        targetValue,
      ),
    [leak, targetValue],
  );

  const rewardBudget =
    rewardPreset === "custom" ? customBudget : rewardBudgetFromPct(projected.profit, Number(rewardPreset) / 100);
  const ratio = rewardRatio(projected.profit, rewardBudget);
  const healthyRatio = isRewardRatioHealthy(ratio);

  function resetTiers() {
    setTiers(recommendTiers(leak.currentValue, targetValue, leak.benchmarkValue, dollar));
  }

  function updateTier(index: number, patch: Partial<RecommendedTier>) {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  async function handleLaunch() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await launchChallenge({
        leakId: leak.id,
        title,
        description,
        targetValue,
        durationDays,
        rewardBudget,
        tiers: tiers.map((t) => ({ name: t.name, thresholdValue: t.thresholdValue, pointsAwarded: t.pointsAwarded })),
        teamGoal: teamGoalEnabled
          ? { targetValue: teamGoalTarget, pointsAwardedPerEmployee: teamGoalPoints }
          : null,
      });

      if ("error" in result) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      router.push(`/manager/goals/${result.challengeId}`);
    } catch {
      setError("Something went wrong launching this challenge. Try again.");
      setSubmitting(false);
    }
  }

  const fmt = (v: number) => formatMetricValue(leak.metricCode, v);

  return (
    <div className="space-y-6 pb-8">
      {/* Step 1 — Review leak */}
      <Section step={1} title="Review the leak">
        <div className="rounded-xl border border-manager-border bg-manager-surface2 p-3">
          <p className="text-sm font-semibold text-manager-text">
            {metricName(leak.metricCode)} — {leak.locationName}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-manager-muted">Current</p>
              <p className="font-semibold text-manager-text">{fmt(leak.currentValue)}</p>
            </div>
            <div>
              <p className="text-manager-muted">Benchmark</p>
              <p className="font-semibold text-manager-text">{fmt(leak.benchmarkValue)}</p>
            </div>
            <div>
              <p className="text-manager-muted">Full opportunity</p>
              <p className="font-semibold text-manager-accent">
                {formatCurrency(leak.estimatedContributionProfit)}
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* Step 2 — Set target */}
      <Section step={2} title="Set the target">
        <label className="block text-xs text-manager-muted" htmlFor="target">
          Recommended: {fmt(recommendTarget(leak.currentValue, leak.benchmarkValue, dollar))}
        </label>
        <input
          id="target"
          type="number"
          step={dollar ? 0.01 : 0.001}
          value={targetValue}
          onChange={(e) => setTargetValue(Number(e.target.value))}
          className="mt-1 w-40 rounded-lg border border-manager-border bg-manager-surface2 px-3 py-2 text-sm text-manager-text"
        />
        <p className="mt-2 text-xs text-manager-muted">
          Projected at this target: {formatCurrency(projected.revenue)} revenue /{" "}
          {formatCurrency(projected.profit)} contribution profit.
        </p>
      </Section>

      {/* Step 3 — Duration */}
      <Section step={3} title="Choose duration">
        <div className="flex gap-2">
          {CHALLENGE_DURATION_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setDurationDays(days)}
              aria-pressed={durationDays === days}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                durationDays === days
                  ? "border-manager-accent bg-manager-accent/10 text-manager-accent"
                  : "border-manager-border text-manager-muted"
              }`}
            >
              {days} days
            </button>
          ))}
        </div>
      </Section>

      {/* Step 4 — Reward budget */}
      <Section step={4} title="Choose reward budget">
        <div className="flex flex-wrap gap-2">
          {REWARD_BUDGET_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => setRewardPreset(String(pct * 100) as RewardPreset)}
              aria-pressed={rewardPreset === String(pct * 100)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                rewardPreset === String(pct * 100)
                  ? "border-manager-accent bg-manager-accent/10 text-manager-accent"
                  : "border-manager-border text-manager-muted"
              }`}
            >
              {pct * 100}%
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRewardPreset("custom")}
            aria-pressed={rewardPreset === "custom"}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${
              rewardPreset === "custom"
                ? "border-manager-accent bg-manager-accent/10 text-manager-accent"
                : "border-manager-border text-manager-muted"
            }`}
          >
            Custom
          </button>
        </div>

        {rewardPreset === "custom" && (
          <input
            type="number"
            value={customBudget}
            onChange={(e) => setCustomBudget(Number(e.target.value))}
            className="mt-2 w-32 rounded-lg border border-manager-border bg-manager-surface2 px-3 py-2 text-sm text-manager-text"
            aria-label="Custom reward budget in dollars"
          />
        )}

        <div className="mt-3 rounded-xl border border-manager-border bg-manager-surface2 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-manager-muted">Projected contribution profit</span>
            <span className="font-semibold text-manager-text">{formatCurrency(projected.profit)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-manager-muted">Reward pool</span>
            <span className="font-semibold text-manager-text">{formatCurrency(rewardBudget)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-manager-muted">Profit / reward ratio</span>
            <span className={`font-semibold ${healthyRatio ? "text-manager-accent" : "text-manager-warn"}`}>
              {formatMultiplier(ratio)}
            </span>
          </div>
          {!healthyRatio && (
            <p className="mt-2 text-xs text-manager-warn">
              Projected return is under 3x — consider a smaller reward budget or a more ambitious target.
            </p>
          )}
        </div>
      </Section>

      {/* Step 5 — Reward tiers */}
      <Section step={5} title="Configure reward tiers">
        <div className="space-y-2">
          {tiers.map((tier, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={tier.name}
                onChange={(e) => updateTier(i, { name: e.target.value })}
                className="w-24 rounded-lg border border-manager-border bg-manager-surface2 px-2 py-1.5 text-sm text-manager-text"
                aria-label={`Tier ${i + 1} name`}
              />
              <input
                type="number"
                step={dollar ? 0.01 : 0.001}
                value={tier.thresholdValue}
                onChange={(e) => updateTier(i, { thresholdValue: Number(e.target.value) })}
                className="w-24 rounded-lg border border-manager-border bg-manager-surface2 px-2 py-1.5 text-sm text-manager-text"
                aria-label={`Tier ${i + 1} threshold`}
              />
              <span className="text-xs text-manager-muted">at</span>
              <input
                type="number"
                value={tier.pointsAwarded}
                onChange={(e) => updateTier(i, { pointsAwarded: Number(e.target.value) })}
                className="w-24 rounded-lg border border-manager-border bg-manager-surface2 px-2 py-1.5 text-sm text-manager-text"
                aria-label={`Tier ${i + 1} points`}
              />
              <span className="text-xs text-manager-muted">points</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={resetTiers}
          className="mt-2 text-xs font-medium text-manager-accent hover:underline"
        >
          Reset to recommended
        </button>
      </Section>

      {/* Step 6 — Team goal */}
      <Section step={6} title="Optional team goal">
        <label className="flex items-center gap-2 text-sm text-manager-text">
          <input
            type="checkbox"
            checked={teamGoalEnabled}
            onChange={(e) => setTeamGoalEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          The whole location earns a bonus if the team hits a stretch goal
        </label>

        {teamGoalEnabled && (
          <div className="mt-2 flex items-center gap-3">
            <div>
              <label className="block text-xs text-manager-muted" htmlFor="teamGoalTarget">
                Team target
              </label>
              <input
                id="teamGoalTarget"
                type="number"
                step={dollar ? 0.01 : 0.001}
                value={teamGoalTarget}
                onChange={(e) => setTeamGoalTarget(Number(e.target.value))}
                className="w-28 rounded-lg border border-manager-border bg-manager-surface2 px-2 py-1.5 text-sm text-manager-text"
              />
            </div>
            <div>
              <label className="block text-xs text-manager-muted" htmlFor="teamGoalPoints">
                Points per employee
              </label>
              <input
                id="teamGoalPoints"
                type="number"
                value={teamGoalPoints}
                onChange={(e) => setTeamGoalPoints(Number(e.target.value))}
                className="w-28 rounded-lg border border-manager-border bg-manager-surface2 px-2 py-1.5 text-sm text-manager-text"
              />
            </div>
          </div>
        )}
      </Section>

      {/* Step 7 — Preview + details */}
      <Section step={7} title="Preview">
        <div>
          <label className="block text-xs text-manager-muted" htmlFor="title">
            Challenge title
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-manager-border bg-manager-surface2 px-3 py-2 text-sm text-manager-text"
          />
        </div>
        <div className="mt-2">
          <label className="block text-xs text-manager-muted" htmlFor="description">
            Plain-language description (what employees see)
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-manager-border bg-manager-surface2 px-3 py-2 text-sm text-manager-text"
          />
        </div>

        <div className="mt-3 rounded-xl border border-rewards-border bg-rewards-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-rewards-muted">
            Employee preview — Rev Rewards
          </p>
          <p className="mt-1 text-base font-semibold text-rewards-text">{title || "Untitled challenge"}</p>
          <p className="mt-1 text-xs text-rewards-muted">
            Current {fmt(leak.currentValue)} · Goal {fmt(targetValue)} · {durationDays} days
          </p>
          <p className="mt-1 text-xs text-rewards-pink">
            Potential reward: up to {tiers.reduce((s, t) => s + t.pointsAwarded, 0).toLocaleString()} points
          </p>
        </div>

        <p className="mt-2 text-xs text-manager-muted">
          {employeeCount} {employeeCount === 1 ? "employee" : "employees"} at {leak.locationName} will be
          enrolled when you launch.
        </p>
      </Section>

      {/* Step 8 — Launch */}
      {error && (
        <p role="alert" className="rounded-lg border border-manager-danger/40 bg-manager-danger/10 px-3 py-2 text-sm text-manager-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleLaunch}
        disabled={submitting || employeeCount === 0}
        className="w-full rounded-lg bg-manager-accent px-4 py-3 text-sm font-semibold text-manager-bg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Launching…" : "Launch Challenge"}
      </button>
      {employeeCount === 0 && (
        <p className="text-center text-xs text-manager-warn">
          No employees are assigned to this location yet — add employees before launching.
        </p>
      )}
    </div>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-manager-border bg-manager-surface p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-manager-muted">
        Step {step} · {title}
      </p>
      {children}
    </section>
  );
}
