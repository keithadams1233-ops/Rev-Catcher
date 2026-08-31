"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, TrendingDown, Target, Users, Settings } from "lucide-react";

const ITEMS = [
  { href: "/manager", label: "Home", icon: Home },
  { href: "/manager/leaks", label: "Leaks", icon: TrendingDown },
  { href: "/manager/goals", label: "Goals", icon: Target },
  { href: "/manager/people", label: "People", icon: Users },
  { href: "/manager/settings", label: "Settings", icon: Settings },
];

export function ManagerBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-manager-border bg-manager-surface/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch justify-between">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/manager" ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? "text-manager-accent" : "text-manager-muted"
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
