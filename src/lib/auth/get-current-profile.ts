import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/types/database";

export type CurrentProfile = Tables<"profiles">;

/**
 * Loads the signed-in user's profile row (org, role, name) for use in
 * Server Components and route handlers. Returns null when no session
 * exists or the profile hasn't been created yet.
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile ?? null;
}

export function isManagerRole(role: CurrentProfile["role"]) {
  return role === "owner" || role === "admin" || role === "manager";
}
