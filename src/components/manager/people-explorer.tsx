"use client";

import { useMemo, useState } from "react";
import type { EmployeeRosterItem, LocationSummary } from "@/lib/data/manager";

export function PeopleExplorer({
  employees,
  locations,
}: {
  employees: EmployeeRosterItem[];
  locations: LocationSummary[];
}) {
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      const matchesQuery =
        query.trim() === "" ||
        e.name.toLowerCase().includes(query.toLowerCase()) ||
        e.email.toLowerCase().includes(query.toLowerCase());
      const matchesLocation = locationFilter === "all" || e.locationNames.includes(locationFilter);
      return matchesQuery && matchesLocation;
    });
  }, [employees, query, locationFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-[200px] flex-1 rounded-lg border border-manager-border bg-manager-surface2 px-3 py-2 text-sm text-manager-text"
        />
        <select
          aria-label="Filter by location"
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="rounded-lg border border-manager-border bg-manager-surface2 px-3 py-2 text-sm text-manager-text"
        >
          <option value="all">All locations</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.name}>
              {loc.name}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-manager-muted">
        {filtered.length} {filtered.length === 1 ? "person" : "people"}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-manager-border p-6 text-center text-sm text-manager-muted">
          No one matches these filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-manager-border bg-manager-surface">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-manager-border text-xs uppercase tracking-wide text-manager-muted">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Location(s)</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-manager-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-manager-text">{e.name}</p>
                    <p className="text-xs text-manager-muted">{e.email}</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-manager-text">{e.role}</td>
                  <td className="px-4 py-3 text-manager-text">
                    {e.locationNames.length > 0 ? e.locationNames.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        e.active
                          ? "border-manager-accent/50 text-manager-accent"
                          : "border-manager-border text-manager-muted"
                      }`}
                    >
                      {e.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
