"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Rocket, Trophy, Wallet, Gift } from "lucide-react";

const ITEMS = [
  { href: "/employee", label: "Home", icon: Home },
  { href: "/employee/missions", label: "Missions", icon: Rocket },
  { href: "/employee/ranks", label: "Ranks", icon: Trophy },
  { href: "/employee/points", label: "Points", icon: Wallet },
  { href: "/employee/rewards", label: "Rewards", icon: Gift },
];

export function RewardsBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-rewards-border bg-rewards-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch justify-between">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/employee" ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? "text-rewards-pink" : "text-rewards-muted"
                }`}
              >
                <Icon aria-hidden="true" size={20} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
