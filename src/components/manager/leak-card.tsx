import Link from "next/link";
import { formatCurrency, formatMetricValue, metricName } from "@/lib/format";
import { ConfidenceBadge } from "@/components/manager/confidence-badge";
import type { LeakListItem } from "@/lib/data/manager";

export function LeakCard({ leak }: { leak: LeakListItem }) {
  return (
    <div className="rounded-2xl border border-manager-border bg-manager-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/manager/leaks/${leak.id}`} className="hover:underline">
          <p className="text-sm font-semibold text-manager-text">{metricName(leak.metricCode)}</p>
          <p className="text-xs text-manager-muted">{leak.locationName}</p>
        </Link>
        <ConfidenceBadge score={leak.confidenceScore} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-manager-muted">Current</p>
          <p className="text-lg font-semibold text-manager-text">
            {formatMetricValue(leak.metricCode, leak.currentValue)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-manager-muted">Benchmark</p>
          <p className="text-lg font-semibold text-manager-text">
            {formatMetricValue(leak.metricCode, leak.benchmarkValue)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-manager-border pt-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-manager-muted">Est. revenue</p>
          <p className="text-base font-semibold text-manager-accent">
            {formatCurrency(leak.estimatedIncrementalRevenue)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-manager-muted">Est. profit</p>
          <p className="text-base font-semibold text-manager-accent">
            {formatCurrency(leak.estimatedContributionProfit)}
          </p>
        </div>
      </div>

      <Link
        href={
          leak.status === "challenge_created"
            ? `/manager/leaks/${leak.id}`
            : `/manager/goals/new?leakId=${leak.id}`
        }
        className="mt-4 block w-full rounded-lg bg-manager-accent px-3 py-2 text-center text-sm font-semibold text-manager-bg transition-opacity hover:opacity-90"
      >
        {leak.status === "challenge_created" ? "View challenge" : "Create Challenge"}
      </Link>
    </div>
  );
}
