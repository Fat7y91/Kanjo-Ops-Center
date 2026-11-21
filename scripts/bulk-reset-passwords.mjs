/**
 * Bulk password reset through the Supabase Admin Auth API.
 *
 * Usage:
 *   BULK_RESET_PASSWORD='…' node --env-file=.env.local \
 *     scripts/bulk-reset-passwords.mjs --dry-run
 *   BULK_RESET_PASSWORD='…' node --env-file=.env.local \
 *     scripts/bulk-reset-passwords.mjs --apply
 *
 * The password is read from the environment so it is never committed. The
 * product owner's account is excluded by id and, when the profile is readable,
 * by the phone/email attached to that id. Every write goes through
 * `supabase.auth.admin.updateUserById`, so GoTrue owns the bcrypt hash; this
 * script never touches `auth.users` with SQL.
 */

import { createClient } from "@supabase/supabase-js";

const PO_USER_ID =
  process.env.PO_USER_ID?.trim() || "8b837bd0-b3b5-4c0b-9b94-abc8b4f5446b";
const PASSWORD = process.env.BULK_RESET_PASSWORD ?? "";
const APPLY = process.argv.includes("--apply");
const PER_PAGE = 1000;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function normalizePhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

async function listAuthUsers(client) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: PER_PAGE,
    });
    if (error) throw error;
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < PER_PAGE) break;
  }
  return users;
}

async function main() {
  if (!PASSWORD.trim()) {
    fail("BULK_RESET_PASSWORD is required.");
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Exclude the PO by id first; enrich the matcher with the profile phone and
  // email when the service-role read succeeds.
  const excludedEmails = new Set();
  const excludedPhones = new Set();
  const { data: poProfile, error: poError } = await client
    .schema("app")
    .from("users")
    .select("phone,email")
    .eq("id", PO_USER_ID)
    .maybeSingle();
  if (poError) {
    console.warn("PO profile lookup failed; excluding by id only.");
  } else if (poProfile) {
    if (poProfile.email) excludedEmails.add(normalizeEmail(poProfile.email));
    if (poProfile.phone) excludedPhones.add(normalizePhone(poProfile.phone));
  }

  const users = await listAuthUsers(client);
  const targets = users.filter((user) => {
    if (user.id === PO_USER_ID) return false;
    if (user.email && excludedEmails.has(normalizeEmail(user.email))) return false;
    if (user.phone && excludedPhones.has(normalizePhone(user.phone))) return false;
    return true;
  });
  const excluded = users.length - targets.length;

  console.log(
    `Auth users: ${users.length}; excluded: ${excluded}; targets: ${targets.length}.`,
  );

  if (excluded === 0) {
    console.warn("PO account was not found by id/email/phone; aborting.");
    process.exit(1);
  }

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to update the passwords.");
    return;
  }

  const startedAt = Date.now();
  const failures = [];
  for (const user of targets) {
    const { error } = await client.auth.admin.updateUserById(user.id, {
      password: PASSWORD,
    });
    if (error) failures.push({ id: user.id, message: error.message });
  }

  // Confirm the writes landed: GoTrue stamps `updated_at` on the auth user.
  const after = await listAuthUsers(client);
  const byId = new Map(after.map((user) => [user.id, user]));
  const stale = [];
  for (const user of targets) {
    const current = byId.get(user.id);
    const stamp = current?.updated_at ? Date.parse(current.updated_at) : 0;
    if (!current || stamp < startedAt - 5_000) stale.push(user.id);
  }

  const updated = targets.length - failures.length;
  console.log(`Updated: ${updated}; failed: ${failures.length}; stale: ${stale.length}.`);
  if (failures.length > 0) {
    console.error("Failures:", failures);
  }
  if (stale.length > 0) {
    console.warn("Accounts whose updated_at did not advance:", stale);
  }
  if (failures.length > 0 || stale.length > 0) process.exit(1);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
