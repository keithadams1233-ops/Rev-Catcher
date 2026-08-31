import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database";

/**
 * Server-side Supabase client (Server Components, Route Handlers, Server
 * Actions). Uses the anon key + the caller's session cookie, so every query
 * still runs through RLS as that user — this is NOT a service-role client.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component with no request context to
            // write to — safe to ignore because middleware refreshes the
            // session on every request.
          }
        },
      },
    },
  );
}

/**
 * Service-role client for trusted server-only code paths (CSV import
 * pipeline, metric engine, point/XP ledger writers). This key bypasses RLS
 * entirely — it must never be imported into any file that ships to the
 * client bundle, and every caller is responsible for its own authorization
 * checks (organization_id must come from a verified session/profile, never
 * from client input).
 */
export function createServiceRoleClient() {
  if (typeof window !== "undefined") {
    throw new Error("createServiceRoleClient must never be called from the browser");
  }

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // no-op: service-role client is not session-bound
        },
      },
    },
  );
}
