import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { getOrganization, listLocations, listRewardCatalog } from "@/lib/data/manager";
import { formatCurrency } from "@/lib/format";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();

  if (!profile?.organization_id) {
    return (
      <p className="rounded-2xl border border-dashed border-manager-border p-6 text-center text-sm text-manager-muted">
        This account isn&apos;t linked to an organization yet.
      </p>
    );
  }

  const [org, locations, rewards] = await Promise.all([
    getOrganization(profile.organization_id),
    listLocations(profile.organization_id),
    listRewardCatalog(profile.organization_id),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-manager-text">Settings</h1>
      </div>

      <section className="rounded-2xl border border-manager-border bg-manager-surface p-4">
        <h2 className="text-sm font-semibold text-manager-text">Organization</h2>
        {org ? (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-manager-muted">Name</dt>
              <dd className="text-manager-text">{org.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-manager-muted">Timezone</dt>
              <dd className="text-manager-text">{org.timezone}</dd>
            </div>
            <div>
              <dt className="text-xs text-manager-muted">Subscription</dt>
              <dd className="capitalize text-manager-text">{org.subscriptionStatus}</dd>
            </div>
            <div>
              <dt className="text-xs text-manager-muted">Point value</dt>
              <dd className="text-manager-text">{org.defaultPointValue} points = $1</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-manager-muted">Organization not found.</p>
        )}
        <p className="mt-3 text-xs text-manager-muted">Editing these settings ships in a later phase.</p>
      </section>

      <section className="rounded-2xl border border-manager-border bg-manager-surface p-4">
        <h2 className="text-sm font-semibold text-manager-text">Locations</h2>
        <div className="mt-3 space-y-2">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className="flex items-center justify-between rounded-lg border border-manager-border bg-manager-surface2 px-3 py-2 text-sm"
            >
              <div>
                <p className="text-manager-text">{loc.name}</p>
                {loc.address && <p className="text-xs text-manager-muted">{loc.address}</p>}
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  loc.active
                    ? "border-manager-accent/50 text-manager-accent"
                    : "border-manager-border text-manager-muted"
                }`}
              >
                {loc.active ? "Active" : "Inactive"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-manager-border bg-manager-surface p-4">
        <h2 className="text-sm font-semibold text-manager-text">Reward catalog</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {rewards.map((r) => (
            <div key={r.id} className="rounded-lg border border-manager-border bg-manager-surface2 p-3 text-center">
              <p className="text-lg font-semibold text-manager-accent">{formatCurrency(r.dollarValue)}</p>
              <p className="text-xs text-manager-muted">{r.pointCost.toLocaleString()} pts</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-manager-muted">
          Editing the reward catalog and configuring category contribution margins ships alongside the leak
          detection engine.
        </p>
      </section>

      <section className="rounded-2xl border border-manager-border bg-manager-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-manager-text">Data Sources</h2>
          <Link
            href="/manager/settings/data-sources"
            className="rounded-lg bg-manager-accent px-3 py-1.5 text-xs font-semibold text-manager-bg"
          >
            Upload POS CSV
          </Link>
        </div>
        <p className="mt-2 text-sm text-manager-muted">
          Upload POS CSV exports, map columns to Rev Catcher&apos;s fields, and re-import updated data any time —
          already-imported transactions are skipped automatically.
        </p>
      </section>
    </div>
  );
}
