"use client";

import { setDevView } from "@/app/dev-role-switch-actions";
import type { DevView } from "@/lib/dev/dev-view";

/**
 * Dev/demo-only switch between the Manager (Rev Catcher) and Employee
 * (Rev Rewards) experiences, independent of the signed-in user's actual
 * role. Never rendered when NODE_ENV is "production" (see page usages).
 */
export function DevRoleSwitcher({ active }: { active: DevView }) {
  return (
    <div
      role="group"
      aria-label="Demo role switcher"
      className="flex items-center gap-1 rounded-full border border-white/10 bg-black/30 p-1 text-xs font-medium"
    >
      <button
        type="button"
        onClick={() => setDevView("manager")}
        aria-pressed={active === "manager"}
        className={`rounded-full px-3 py-1.5 transition-colors ${
          active === "manager" ? "bg-white text-black" : "text-white/70 hover:text-white"
        }`}
      >
        Manager view
      </button>
      <button
        type="button"
        onClick={() => setDevView("employee")}
        aria-pressed={active === "employee"}
        className={`rounded-full px-3 py-1.5 transition-colors ${
          active === "employee" ? "bg-white text-black" : "text-white/70 hover:text-white"
        }`}
      >
        Employee view
      </button>
    </div>
  );
}
