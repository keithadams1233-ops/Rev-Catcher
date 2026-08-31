import type { LucideIcon } from "lucide-react";

const ACCENTS = {
  purple: "from-rewards-purple/25 to-rewards-purple/5 text-rewards-purple",
  pink: "from-rewards-pink/25 to-rewards-pink/5 text-rewards-pink",
  gold: "from-rewards-gold/25 to-rewards-gold/5 text-rewards-gold",
  green: "from-rewards-green/25 to-rewards-green/5 text-rewards-green",
} as const;

export function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  accent: keyof typeof ACCENTS;
}) {
  return (
    <div
      className={`rounded-2xl border border-rewards-border bg-gradient-to-br p-4 ${ACCENTS[accent]}`}
    >
      <Icon aria-hidden="true" size={18} />
      <p className="mt-2 text-xl font-bold text-rewards-text">{value}</p>
      <p className="text-xs font-medium text-rewards-muted">{label}</p>
      {sub && <p className="mt-1 text-[11px] text-rewards-muted">{sub}</p>}
    </div>
  );
}
