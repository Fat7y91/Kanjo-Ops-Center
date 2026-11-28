/**
 * Fails when the capability catalogue drifts from its two sources.
 *
 * Checks, offline:
 *   - `src/lib/rbac/data/permissions.ts` has no duplicate keys;
 *   - every key inserted by a migration exists in the data file;
 *   - every key in the data file is inserted by some migration.
 *
 * With `--database`, additionally compares against a live database so a
 * `select`-based insert from a source the parser cannot see is still caught.
 * The database URL is read from `DATABASE_URL` or `SUPABASE_DB_URL`.
 *
 * Usage:
 *   node scripts/check-permission-drift.mjs [--database]
 *
 * Exit code is 1 on any drift, 0 when the catalogue is aligned.
 */

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  difference,
  findDuplicates,
  loadCatalogue,
  readMigrationPermissionKeys,
} from "./lib/permission-catalogue.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = path.join(root, "src/lib/rbac/data/permissions.ts");
const migrationsDir = path.join(root, "supabase/migrations");

const problems = [];

function report(title, keys) {
  if (keys.length === 0) return;
  problems.push(`${title}:\n${keys.map((key) => `  - ${key}`).join("\n")}`);
}

const permissions = loadCatalogue(dataFile);
const dataKeys = permissions.map((permission) => permission.key);
const dataKeySet = new Set(dataKeys);
const migrationKeys = readMigrationPermissionKeys(migrationsDir);

report("Duplicate keys in permissions.ts", findDuplicates(dataKeys));
report(
  "Inserted by a migration but missing from permissions.ts",
  difference(migrationKeys, dataKeySet),
);
report(
  "Listed in permissions.ts but never inserted by a migration",
  difference(dataKeySet, migrationKeys),
);

if (process.argv.includes("--database")) {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    problems.push("--database requested but DATABASE_URL is not set.");
  } else {
    let pg;
    try {
      ({ default: pg } = await import("pg"));
    } catch {
      problems.push(
        "--database requested but the 'pg' package is not installed. Run npm i -D pg.",
      );
    }
    if (pg) {
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      try {
        const { rows } = await client.query("select key from app.permissions");
        const live = new Set(rows.map((row) => row.key));
        report(
          "Present in app.permissions but missing from permissions.ts",
          difference(live, dataKeySet),
        );
        report(
          "Listed in permissions.ts but absent from app.permissions",
          difference(dataKeySet, live),
        );
      } finally {
        await client.end();
      }
    }
  }
}

if (problems.length > 0) {
  console.error("Permission catalogue drift detected.\n");
  for (const problem of problems) console.error(`${problem}\n`);
  console.error(
    "Regenerate src/lib/rbac/data/permissions.ts from app.permissions and retry.",
  );
  process.exit(1);
}

console.log(
  `Permission catalogue aligned: ${dataKeys.length} keys across ${
    new Set(permissions.map((permission) => permission.group)).size
  } groups.`,
);
