"use client";

import { useMemo, useState } from "react";
import { LeakCard } from "@/components/manager/leak-card";
import { metricName } from "@/lib/format";
import type { LeakListItem, LocationSummary } from "@/lib/data/manager";

type SortKey = "profit" | "revenue";

export function LeaksExplorer({
  leaks,
  locations,
  metricCodes,
}: {
  leaks: LeakListItem[];
  locations: LocationSummary[];
  metricCodes: string[];
}) {
  const [locationId, setLocationId] = useState<string>("all");
  const [metricCode, setMetricCode] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("profit");

  const filtered = useMemo(() => {
    let result = leaks;
    if (locationId !== "all") result = result.filter((l) => l.locationId === locationId);
    if (metricCode !== "all") result = result.filter((l) => l.metricCode === metricCode);

    return [...result].sort((a, b) =>
      sortKey === "profit"
        ? b.estimatedContributionProfit - a.estimatedContributionProfit
        : b.estimatedIncrementalRevenue - a.estimatedIncrementalRevenue,
    );
  }, [leaks, locationId, metricCode, sortKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Filter by location"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="rounded-lg border border-manager-border bg-manager-surface2 px-3 py-2 text-sm text-manager-text"
        >
          <option value="all">All locations</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by metric"
          value={metricCode}
          onChange={(e) => setMetricCode(e.target.value)}
          className="rounded-lg border border-manager-border bg-manager-surface2 px-3 py-2 text-sm text-manager-text"
        >
          <option value="all">All metrics</option>
          {metricCodes.map((code) => (
            <option key={code} value={code}>
              {metricName(code)}
            </option>
          ))}
        </select>

        <select
          aria-label="Sort by"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="ml-auto rounded-lg border border-manager-border bg-manager-surface2 px-3 py-2 text-sm text-manager-text"
        >
          <option value="profit">Sort: Contribution profit</option>
          <option value="revenue">Sort: Revenue opportunity</option>
        </select>
      </div>

      <p className="text-xs text-manager-muted">
        {filtered.length} {filtered.length === 1 ? "leak" : "leaks"}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-manager-border p-6 text-center text-sm text-manager-muted">
          No revenue leaks match these filters.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((leak) => (
            <LeakCard key={leak.id} leak={leak} />
          ))}
        </div>
      )}
    </div>
  );
}
