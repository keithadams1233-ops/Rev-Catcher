import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signIn } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center bg-manager-bg px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-manager-accent text-lg font-bold text-manager-bg">
            RC
          </div>
          <h1 className="text-2xl font-semibold text-manager-text">Rev Catcher</h1>
          <p className="mt-1 text-sm text-manager-muted">
            Sign in to find revenue leaks and run challenges.
          </p>
        </div>

        <form action={signIn} className="space-y-4 rounded-2xl border border-manager-border bg-manager-surface p-6">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-manager-danger/40 bg-manager-danger/10 px-3 py-2 text-sm text-manager-danger"
            >
              {error}
            </p>
          )}

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-manager-text">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-manager-border bg-manager-surface2 px-3 py-2.5 text-manager-text outline-none focus:border-manager-accent"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-manager-text">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-manager-border bg-manager-surface2 px-3 py-2.5 text-manager-text outline-none focus:border-manager-accent"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-manager-accent px-4 py-2.5 font-semibold text-manager-bg transition-opacity hover:opacity-90"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-manager-muted">
          Pilot accounts are provisioned by your Rev Catcher administrator.
        </p>
      </div>
    </main>
  );
}
