/**
 * Phase 1 foundation seed.
 *
 * Creates just enough demo data to prove the stack end-to-end: one
 * organization, two locations, a manager account, and an employee account
 * assigned to a location — enough to log in, get redirected into the right
 * experience, and confirm RLS keeps things scoped to the org.
 *
 * The full realistic demo dataset (14 locations, 267 employees, 90 days of
 * transactions, 17 detected leaks, an active challenge, etc. — spec §20)
 * is built once the metric engine, leak detector, and challenge engine
 * exist (Phases 4-7) — seeding it now would just be fake data with nothing
 * real computing it.
 *
 * Usage:
 *   npm run seed
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local — this script talks
 * directly to Supabase with the service-role key and must only ever be run
 * from a trusted machine/CI, never shipped to the client.
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local — see .env.example.",
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ORG_NAME = "ABC Restaurant Holdings";
const DEMO_PASSWORD = "RevCatcher123!";

const DEMO_USERS = [
  {
    email: "manager@revcatcher.demo",
    role: "owner" as const,
    first_name: "Morgan",
    last_name: "Diaz",
  },
  {
    email: "sarah@revcatcher.demo",
    role: "employee" as const,
    first_name: "Sarah",
    last_name: "Jones",
  },
];

async function main() {
  console.log(`Seeding "${ORG_NAME}"...`);

  const organizationId = await ensureOrganization();
  const locationIds = await ensureLocations(organizationId);

  for (const demoUser of DEMO_USERS) {
    const userId = await ensureAuthUser(demoUser, organizationId);
    if (demoUser.role === "employee") {
      await ensureEmployeeLocation(userId, locationIds[0]);
    }
  }

  console.log("\nSeed complete. Demo accounts (password for both: %s):", DEMO_PASSWORD);
  for (const u of DEMO_USERS) {
    console.log(`  ${u.role.padEnd(8)} ${u.email}`);
  }
}

async function ensureOrganization(): Promise<string> {
  const { data: existing, error: selectError } = await admin
    .from("organizations")
    .select("id")
    .eq("name", ORG_NAME)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) {
    console.log(`  organization already exists (${existing.id})`);
    return existing.id;
  }

  const { data, error } = await admin
    .from("organizations")
    .insert({ name: ORG_NAME, timezone: "America/New_York" })
    .select("id")
    .single();

  if (error) throw error;
  console.log(`  created organization ${data.id}`);
  return data.id;
}

async function ensureLocations(organizationId: string): Promise<string[]> {
  const names = ["Store #101", "Store #102"];
  const ids: string[] = [];

  for (const name of names) {
    const { data: existing, error: selectError } = await admin
      .from("locations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("name", name)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing) {
      ids.push(existing.id);
      continue;
    }

    const { data, error } = await admin
      .from("locations")
      .insert({ organization_id: organizationId, name, timezone: "America/New_York" })
      .select("id")
      .single();

    if (error) throw error;
    console.log(`  created location "${name}" (${data.id})`);
    ids.push(data.id);
  }

  return ids;
}

async function ensureAuthUser(
  user: (typeof DEMO_USERS)[number],
  organizationId: string,
): Promise<string> {
  const { data: existingProfile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();

  if (profileError) throw profileError;
  if (existingProfile) {
    console.log(`  ${user.role} account already exists (${user.email})`);
    return existingProfile.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: {
      organization_id: organizationId,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
    },
  });

  if (error) throw error;
  console.log(`  created ${user.role} account ${user.email} (${data.user.id})`);
  return data.user.id;
}

async function ensureEmployeeLocation(employeeId: string, locationId: string) {
  const { data: existing, error: selectError } = await admin
    .from("employee_locations")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("location_id", locationId)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return;

  const { error } = await admin
    .from("employee_locations")
    .insert({ employee_id: employeeId, location_id: locationId, primary_location: true });

  if (error) throw error;
  console.log(`  assigned employee ${employeeId} to location ${locationId}`);
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
