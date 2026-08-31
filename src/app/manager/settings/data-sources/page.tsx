import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { listPosImports, getSavedColumnMapping } from "@/lib/data/manager";
import { EMPTY_MAPPING, type ColumnMapping } from "@/lib/csv-import";
import { ImportWizard } from "@/components/manager/import-wizard";
import { StatusBadge } from "@/components/manager/status-badge";
import { PhaseStub } from "@/components/phase-stub";

export default async function DataSourcesPage() {
  const profile = await getCurrentProfile();

  if (!profile?.organization_id) {
    return (
      <PhaseStub
        title="No organization assigned"
        description="This account isn't linked to an organization yet."
        accent="manager"
      />
    );
  }

  const [imports, savedMapping] = await Promise.all([
    listPosImports(profile.organization_id),
    getSavedColumnMapping(profile.organization_id),
  ]);

  const mapping: ColumnMapping | null = savedMapping
    ? ({ ...EMPTY_MAPPING, ...savedMapping } as ColumnMapping)
    : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/manager/settings" className="text-xs font-medium text-manager-muted hover:text-manager-text">
          ← Settings
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-manager-text">Data Sources</h1>
        <p className="text-sm text-manager-muted">
          Upload a POS export CSV — one row per line item, grouped into transactions by transaction ID. Re-upload
          any time; already-imported transactions are skipped automatically.
        </p>
      </div>

      <ImportWizard savedMapping={mapping} />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-manager-muted">Import history</h2>
        {imports.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-manager-border p-6 text-center text-sm text-manager-muted">
            No imports yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-manager-border bg-manager-surface">
            {imports.map((i, idx) => (
              <div
                key={i.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${
                  idx > 0 ? "border-t border-manager-border" : ""
                }`}
              >
                <div>
                  <p className="text-sm text-manager-text">{i.filename}</p>
                  <p className="text-xs text-manager-muted">
                    {new Date(i.importedAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {i.dateStart && i.dateEnd && ` · ${i.dateStart} – ${i.dateEnd}`}
                    {" · "}
                    {i.rowCount.toLocaleString()} rows
                    {i.errorCount > 0 && `, ${i.errorCount.toLocaleString()} rejected`}
                  </p>
                </div>
                <StatusBadge status={i.status} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
