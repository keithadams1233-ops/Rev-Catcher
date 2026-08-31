const STATUS_STYLES: Record<string, string> = {
  draft: "border-manager-border text-manager-muted",
  scheduled: "border-manager-warn/50 text-manager-warn",
  active: "border-manager-accent/50 text-manager-accent",
  completed: "border-manager-accent/50 text-manager-accent",
  cancelled: "border-manager-danger/50 text-manager-danger",
  open: "border-manager-warn/50 text-manager-warn",
  challenge_created: "border-manager-accent/50 text-manager-accent",
  dismissed: "border-manager-border text-manager-muted",
  resolved: "border-manager-accent/50 text-manager-accent",
  uploaded: "border-manager-border text-manager-muted",
  processing: "border-manager-warn/50 text-manager-warn",
  failed: "border-manager-danger/50 text-manager-danger",
};

const STATUS_LABELS: Record<string, string> = {
  challenge_created: "Challenge created",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "border-manager-border text-manager-muted";
  const label = STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${style}`}>
      {label}
    </span>
  );
}
