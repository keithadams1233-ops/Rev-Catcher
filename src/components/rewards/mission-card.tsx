import { CheckCircle2, Zap, Coins } from "lucide-react";
import { RewardsProgressBar } from "@/components/rewards/progress-bar";
import { formatPercent } from "@/lib/format";
import type { EmployeeMission } from "@/lib/data/employee";

/** Missions track either a raw count ("3 of 5") or a rate ("42%"). */
function isRateTarget(mission: EmployeeMission) {
  return mission.targetValue > 0 && mission.targetValue <= 1;
}

export function MissionCard({ mission }: { mission: EmployeeMission }) {
  const rate = isRateTarget(mission);
  const percent = mission.targetValue > 0 ? (mission.currentValue / mission.targetValue) * 100 : 0;
  const progressLabel = rate
    ? `${formatPercent(mission.currentValue)} / ${formatPercent(mission.targetValue)}`
    : `${mission.currentValue} / ${mission.targetValue}`;

  return (
    <div
      className={`rounded-2xl border p-4 ${
        mission.completed
          ? "border-rewards-green/40 bg-rewards-green/10"
          : "border-rewards-border bg-rewards-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-rewards-text">{mission.title}</p>
          {mission.description && <p className="mt-0.5 text-xs text-rewards-muted">{mission.description}</p>}
        </div>
        {mission.completed ? (
          <CheckCircle2 aria-label="Completed" className="shrink-0 text-rewards-green" size={20} />
        ) : (
          <span
            className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              mission.rewardType === "xp"
                ? "border-rewards-purple/40 text-rewards-purple"
                : "border-rewards-gold/40 text-rewards-gold"
            }`}
          >
            {mission.rewardType === "xp" ? <Zap size={12} /> : <Coins size={12} />}+
            {mission.rewardAmount.toLocaleString()} {mission.rewardType === "xp" ? "XP" : "pts"}
          </span>
        )}
      </div>

      {!mission.completed && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-rewards-muted">
            <span>{progressLabel}</span>
          </div>
          <RewardsProgressBar percent={percent} gradient="from-rewards-blue to-rewards-purple" />
        </div>
      )}
    </div>
  );
}
