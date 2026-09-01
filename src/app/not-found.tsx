import Link from "next/link";

/**
 * Root not-found page (Next.js App Router convention) — an unstyled
 * default 404 page would break out of the app entirely; this keeps a
 * wrong/stale URL inside the same visual language and offers a way back.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-manager-bg px-6 text-center text-manager-text">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="max-w-prose text-sm text-manager-muted">
        That page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-manager-accent px-4 py-2 text-sm font-semibold text-manager-bg transition-opacity hover:opacity-90"
      >
        Back to Rev Catcher
      </Link>
    </div>
  );
}
