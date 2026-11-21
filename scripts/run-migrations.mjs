#!/usr/bin/env node
/**
 * Applies SQL migrations from `supabase/migrations/` in filename order.
 *
 * The Supabase service-role key cannot run DDL through PostgREST, so this uses a
 * direct Postgres connection (`pg`) instead. Every migration file is applied
 * inside a single transaction together with its ledger row, so a file either
 * lands completely or not at all. Applied versions are recorded in
 * `app.schema_migrations`, making subsequent runs idempotent: only files whose
 * version is absent from the ledger are executed.
 *
 * The migration files wrap themselves in `begin; … commit;`. Those outer
 * keywords are stripped here because this runner owns the transaction: nesting
 * them would commit the partial file before the ledger row is written.
 *
 * Usage:
 *   node scripts/run-migrations.mjs            # apply pending migrations
 *   node scripts/run-migrations.mjs --dry-run  # list what would run
 *   node scripts/run-migrations.mjs --verbose  # echo each applied file
 *
 * Reads DATABASE_URL from the environment, falling back to `.env.local` / `.env`.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase/migrations");
const LEDGER_SCHEMA = "app";
const LEDGER_TABLE = "schema_migrations";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

/** `20261117000000_contracts_v2.sql` → `{ version, name }`. */
export function parseMigration(file) {
  const match = /^(\d+)_(.+)\.sql$/.exec(file);
  if (!match) return null;
  return { version: match[1], name: match[2], file };
}

/**
 * Removes the file's outer `begin;` / `commit;` so the runner's transaction is
 * the only one. Only the first `begin` and the last `commit` are touched; any
 * inner savepoints are preserved. Trailing semicolons are normalised to one.
 */
export function stripOuterTransaction(sql) {
  const withoutOpen = sql.replace(/^\s*begin\s*;/i, "");
  const withoutClose = withoutOpen.replace(/commit\s*;\s*$/i, "");
  return withoutClose.trim().replace(/;?\s*$/, ";");
}

/** Stable SHA-256 of the file text, so an edited applied file is detectable. */
export function checksumOf(text) {
  return createHash("sha256").update(text).digest("hex");
}

function readMigrations() {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .map(parseMigration)
    .filter(Boolean)
    .sort((a, b) => a.version.localeCompare(b.version) || a.name.localeCompare(b.name));
  return files;
}

async function ensureLedger(client) {
  await client.query(`create schema if not exists ${LEDGER_SCHEMA}`);
  await client.query(`
    create table if not exists ${LEDGER_SCHEMA}.${LEDGER_TABLE} (
      version     text        primary key,
      name        text        not null,
      checksum    text        not null,
      applied_at  timestamptz not null default now()
    )
  `);
}

async function readApplied(client) {
  const { rows } = await client.query(
    `select version, name, checksum from ${LEDGER_SCHEMA}.${LEDGER_TABLE}`,
  );
  return new Map(rows.map((row) => [row.version, row]));
}

async function main() {
  loadEnv();

  const dryRun = process.argv.includes("--dry-run");
  const verbose = process.argv.includes("--verbose");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "DATABASE_URL is not set. Add the direct Postgres connection string to\n" +
        ".env.local (Settings → Database → Connection string) and retry.",
    );
    process.exit(1);
  }

  let pg;
  try {
    ({ default: pg } = await import("pg"));
  } catch {
    console.error("The 'pg' package is not installed. Run: npm install -D pg");
    process.exit(1);
  }

  const migrations = readMigrations();
  if (migrations.length === 0) {
    console.log("No migration files found in supabase/migrations/.");
    return;
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  let appliedCount = 0;
  let skippedCount = 0;

  try {
    await ensureLedger(client);
    const applied = await readApplied(client);

    const pending = migrations.filter((migration) => !applied.has(migration.version));
    skippedCount = migrations.length - pending.length;

    console.log(`Target database: ${describeTarget(connectionString)}`);
    console.log(
      `Migrations: ${migrations.length} total, ${pending.length} pending, ${skippedCount} already applied.`,
    );

    if (pending.length === 0) {
      console.log("\nNothing to do — schema is up to date.");
      return;
    }

    if (dryRun) {
      console.log("\nPending (dry run, nothing executed):");
      for (const migration of pending) {
        console.log(`  ${migration.version}  ${migration.name}`);
      }
      return;
    }

    for (const migration of pending) {
      const sqlPath = join(migrationsDir, migration.file);
      const rawSql = readFileSync(sqlPath, "utf8");
      const body = stripOuterTransaction(rawSql);
      const checksum = checksumOf(rawSql);

      process.stdout.write(`Applying ${migration.version}  ${migration.name} … `);
      await client.query("begin");
      try {
        await client.query(body);
        await client.query(
          `insert into ${LEDGER_SCHEMA}.${LEDGER_TABLE} (version, name, checksum)
           values ($1, $2, $3)
           on conflict (version) do nothing`,
          [migration.version, migration.name, checksum],
        );
        await client.query("commit");
        appliedCount += 1;
        console.log("ok");
        if (verbose) console.log(`  ${body.split("\n").length} lines applied`);
      } catch (error) {
        await client.query("rollback").catch(() => {});
        console.log("failed");
        throw new Error(
          `Migration ${migration.file} failed and was rolled back: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    console.log(`\nDone. Applied ${appliedCount} migration(s), skipped ${skippedCount}.`);
  } finally {
    await client.end();
  }
}

/** Host/database only — never echo the password embedded in the URL. */
function describeTarget(connectionString) {
  try {
    const url = new URL(connectionString);
    const database = url.pathname.replace(/^\//, "") || "postgres";
    return `${url.hostname}:${url.port || 5432}/${database}`;
  } catch {
    return "DATABASE_URL";
  }
}

/** True when invoked as a program (`node scripts/run-migrations.mjs`). */
function isEntryPoint() {
  return process.argv[1] != null &&
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

if (isEntryPoint()) {
  main().catch((error) => {
    console.error(
      "\nMIGRATION RUN FAILED:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}
