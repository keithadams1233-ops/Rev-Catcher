import { Zap, Flame, Trophy, Medal, Crown, Users, Star, Sparkle, Award, type LucideIcon } from "lucide-react";
import type { EarnedBadge } from "@/lib/data/employee";

const ICONS: Record<string, LucideIcon> = {
  zap: Zap,
  flame: Flame,
  trophy: Trophy,
  medal: Medal,
  crown: Crown,
  users: Users,
  star: Star,
  stars: Sparkle,
};

export function BadgePill({ badge }: { badge: EarnedBadge }) {
  const Icon = (badge.icon && ICONS[badge.icon]) || Award;

  return (
    <div
      title={badge.description ?? badge.name}
      className="flex min-w-[72px] flex-col items-center gap-1.5 rounded-2xl border border-rewards-border bg-rewards-surface2 px-3 py-2.5"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-rewards-gold/30 to-rewards-pink/20 text-rewards-gold">
        <Icon aria-hidden="true" size={18} />
      </div>
      <p className="text-center text-[10px] font-medium leading-tight text-rewards-text">{badge.name}</p>
    </div>
  );
}
