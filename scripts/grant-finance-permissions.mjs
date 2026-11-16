/**
 * Grants the finance capabilities introduced for the expense-category and
 * Saudi-bank workflows to named operators.
 *
 * Usage:
 *   node --env-file=.env.local scripts/grant-finance-permissions.mjs --dry-run
 *   node --env-file=.env.local scripts/grant-finance-permissions.mjs --apply
 *
 * Idempotent: an existing grant is left exactly as it is, so re-running after a
 * deployment only fills the gaps. Operators are matched by phone, never by
 * display name, because names are editable from the admin screen.
 */

import { createClient } from "@supabase/supabase-js";

const PO_USER_ID =
  process.env.PO_USER_ID?.trim() || "8b837bd0-b3b5-4c0b-9b94-abc8b4f5446b";
const APPLY = process.argv.includes("--apply");

const GRANTS = [
  {
    phone: "+201040491882",
    label: "Dr.Ahmed Fathi",
    permissions: ["manage_expense_categories", "operate_sar_bank"],
  },
  {
    phone: "+201157794814",
    label: "Ahmed Hassan",
    permissions: [
      "manage_expense_categories",
      "operate_sar_bank",
      "add_bank_account",
      "view_bank_balances",
      "view_bank_transactions",
      "record_bank_transaction",
      "record_deposits",
      "manage_expenses",
      "post_fx_transfer",
    ],
  },
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let inserted = 0;
  let existing = 0;

  for (const target of GRANTS) {
    const { data: user, error: userError } = await client
      .schema("app")
      .from("users")
      .select("id,full_name,phone,auth_revision")
      .eq("phone", target.phone)
      .maybeSingle();
    if (userError) throw userError;
    if (!user) {
      console.warn(`skip ${target.label}: no user with phone ${target.phone}`);
      continue;
    }

    const { data: current, error: currentError } = await client
      .schema("app")
      .from("user_permissions")
      .select("permission_key")
      .eq("user_id", user.id);
    if (currentError) throw currentError;
    const held = new Set((current ?? []).map((row) => row.permission_key));

    const missing = target.permissions.filter((key) => !held.has(key));
    existing += target.permissions.length - missing.length;
    if (missing.length === 0) {
      console.log(`${user.full_name}: already complete`);
      continue;
    }

    console.log(
      `${APPLY ? "grant" : "would grant"} ${user.full_name}: ${missing.join(", ")}`,
    );

    if (APPLY) {
      const { error: writeError } = await client
        .schema("app")
        .from("user_permissions")
        .upsert(
          missing.map((permission_key) => ({
            user_id: user.id,
            permission_key,
            granted_by: PO_USER_ID,
          })),
          { onConflict: "user_id,permission_key", ignoreDuplicates: true },
        );
      if (writeError) throw writeError;

      const { error: revisionError } = await client
        .schema("app")
        .from("users")
        .update({ auth_revision: (user.auth_revision ?? 1) + 1 })
        .eq("id", user.id);
      if (revisionError) {
        console.warn(`  auth revision bump skipped: ${revisionError.message}`);
      }
    }

    inserted += missing.length;
  }

  console.log(
    `${APPLY ? "Applied" : "Dry run"}: ${inserted} grant(s), ${existing} already held.`,
  );
}

main().catch((error) => fail(error.message ?? String(error)));
