#!/usr/bin/env node
/**
 * Backfills `app.merchants.logo_url` from the V1 Firestore `merchants`
 * collection.
 *
 * V1 stored a public Firebase Storage object URL under `logoUrl` (some legacy
 * rows used `logo`). V2 never had a column for it, so the logos were dropped on
 * migration and every surface fell back to text. This copies the URL verbatim:
 * the Ops Center keeps using the original object, nothing is re-uploaded.
 *
 * Only merchants that exist in V2 are touched, and only rows whose `logo_url`
 * is still null are written, so a re-run never overwrites a logo that was set
 * manually in V2.
 *
 * Credentials (same resolution as the main ETL):
 *   FIREBASE_SERVICE_ACCOUNT      inline service-account JSON, or
 *   FIREBASE_SERVICE_ACCOUNT_KEY / GOOGLE_APPLICATION_CREDENTIALS path, or
 *   firebase-service-account.json in the project root.
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:
 *   node scripts/backfill-merchant-logos.mjs --dry-run
 *   node scripts/backfill-merchant-logos.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";
import { existsSync as envExists } from "node:fs";

const PROJECT_ID = "kanjo-desouk";
const DRY_RUN = process.argv.includes("--dry-run");

/** Minimal .env.local reader so the script runs without a dotenv dependency. */
function loadEnvLocal() {
  const file = resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvLocal();

function requireEnv(key) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required env: ${key}`);
  return value;
}

function resolveAdminApp() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline?.trim()) {
    return initializeApp(
      { credential: cert(JSON.parse(inline)), projectId: PROJECT_ID },
      "backfill-merchant-logos",
    );
  }
  const keyPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    (envExists(resolve(process.cwd(), "firebase-service-account.json"))
      ? "firebase-service-account.json"
      : "");
  if (keyPath) {
    const abs = resolve(process.cwd(), keyPath);
    if (!existsSync(abs)) {
      throw new Error(`Firebase service account file not found: ${abs}`);
    }
    const json = JSON.parse(readFileSync(abs, "utf8"));
    return initializeApp(
      { credential: cert(json), projectId: PROJECT_ID },
      "backfill-merchant-logos",
    );
  }
  return initializeApp(
    { credential: applicationDefault(), projectId: PROJECT_ID },
    "backfill-merchant-logos",
  );
}

/** V1 wrote `logoUrl`; a few legacy rows used `logo`. Trim, never synthesize. */
function logoOf(data) {
  const raw = String(data?.logoUrl ?? data?.logo ?? "").trim();
  if (!raw) return null;
  if (!/^(https?:\/\/|data:image\/)/i.test(raw)) return null;
  return raw;
}

async function main() {
  const firestore = getFirestore(resolveAdminApp());

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("Missing required env: SUPABASE_URL");
  const supabase = createClient(
    supabaseUrl,
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const snapshot = await firestore.collection("merchants").get();
  const logos = new Map();
  for (const doc of snapshot.docs) {
    const logo = logoOf(doc.data());
    if (logo) logos.set(doc.id, logo);
  }
  console.log(
    `V1: ${snapshot.size} merchants, ${logos.size} carry a logo URL.`,
  );

  const { data: rows, error } = await supabase
    .schema("app")
    .from("merchants")
    .select("id,logo_url");
  if (error) throw error;

  const byId = new Map((rows ?? []).map((row) => [row.id, row]));

  const updates = [];
  let alreadySet = 0;
  let missingInV2 = 0;
  for (const [id, logo] of logos) {
    const row = byId.get(id);
    if (!row) {
      missingInV2 += 1;
      continue;
    }
    if (row.logo_url) {
      alreadySet += 1;
      continue;
    }
    updates.push({ id, logo_url: logo });
  }

  console.log(
    `V2: ${rows?.length ?? 0} merchants. To update: ${updates.length}. ` +
      `Already set: ${alreadySet}. Not in V2: ${missingInV2}.`,
  );

  if (DRY_RUN) {
    for (const update of updates.slice(0, 5)) {
      console.log(`  would set ${update.id} -> ${update.logo_url}`);
    }
    console.log("Dry run: no writes.");
    return;
  }

  let written = 0;
  for (const update of updates) {
    const { error: writeError } = await supabase
      .schema("app")
      .from("merchants")
      .update({ logo_url: update.logo_url })
      .eq("id", update.id)
      .is("logo_url", null);
    if (writeError) {
      console.error(`  ${update.id}: ${writeError.message}`);
      continue;
    }
    written += 1;
  }

  console.log(`Done. Wrote ${written}/${updates.length} logo URLs.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
