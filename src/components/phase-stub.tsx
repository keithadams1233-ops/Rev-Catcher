const ACCENTS = {
  manager: "border-manager-border bg-manager-surface text-manager-text",
  rewards: "border-rewards-border bg-rewards-surface text-rewards-text",
} as const;

/**
 * Placeholder for screens that are scoped to a later build phase. Says
 * plainly what isn't built yet instead of faking a finished screen — see
 * spec §28 ("never leave fake TODO implementations ... without clearly
 * stating them").
 */
export function PhaseStub({
  title,
  description,
  accent,
}: {
  title: string;
  description: string;
  accent: keyof typeof ACCENTS;
}) {
  return (
    <div className={`rounded-2xl border p-6 ${ACCENTS[accent]}`}>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-prose text-sm opacity-70">{description}</p>
      <p className="mt-4 inline-block rounded-full border border-current px-3 py-1 text-xs font-medium opacity-60">
        Not yet built — coming in a later phase
      </p>
    </div>
  );
}
