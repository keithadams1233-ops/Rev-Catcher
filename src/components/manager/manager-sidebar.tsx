"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, TrendingDown, Target, Users, Settings } from "lucide-react";

const ITEMS = [
  { href: "/manager", label: "Home", icon: Home },
  { href: "/manager/leaks", label: "Revenue Leaks", icon: TrendingDown },
  { href: "/manager/goals", label: "Goals & Challenges", icon: Target },
  { href: "/manager/people", label: "People", icon: Users },
  { href: "/manager/settings", label: "Settings", icon: Settings },
];

export function ManagerSidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-manager-border bg-manager-surface p-4 md:flex"
    >
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-manager-accent text-sm font-bold text-manager-bg">
          RC
        </div>
        <span className="text-sm font-semibold text-manager-text">Rev Catcher</span>
      </div>
      <ul className="flex flex-1 flex-col gap-1">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/manager" ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-manager-surface2 text-manager-accent"
                    : "text-manager-muted hover:bg-manager-surface2 hover:text-manager-text"
                }`}
              >
                <Icon aria-hidden="true" size={18} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
