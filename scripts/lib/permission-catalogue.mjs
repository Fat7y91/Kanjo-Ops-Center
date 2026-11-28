/**
 * Capability-catalogue drift helpers.
 *
 * `app.permissions` is the record of every capability, and
 * `src/lib/rbac/data/permissions.ts` is generated from it. Nothing in the type
 * system enforces that: a migration that inserts a key without regenerating the
 * data file leaves the `Permission` union blind to it, and a UI guard that
 * references the new key is then omitted from every surface. This module holds
 * the pure parsing logic so the drift check can run offline, without a database,
 * in the normal test pipeline.
 *
 * Two independent sources are compared:
 *
 *   1. `src/lib/rbac/data/permissions.ts` — parsed with the TypeScript compiler
 *      (a devDependency) so no extra runtime or bundler is required.
 *   2. The SQL migrations — every literal key inserted into `app.permissions`
 *      or into the `l4_catalogue` staging table that feeds it.
 *
 * A `select`-based insert from some other source cannot be parsed statically;
 * `scripts/check-permission-drift.mjs --database` covers that by reading the
 * live table when a connection is available.
 */

import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

const KEY_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Splits a SQL `values` body into its tuples, respecting single-quoted strings
 * (including the `''` escape) and nested parentheses in expressions.
 */
export function splitTuples(body) {
  const tuples = [];
  let depth = 0;
  let inString = false;
  let current = "";

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];

    if (inString) {
      current += char;
      if (char === "'") {
        if (body[i + 1] === "'") {
          current += body[i + 1];
          i += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }

    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }
    if (char === "(") {
      depth += 1;
      if (depth === 1) {
        current = "";
        continue;
      }
    }
    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        tuples.push(current);
        current = "";
        continue;
      }
    }
    if (depth > 0) current += char;
  }

  return tuples;
}

/**
 * Every capability key a SQL file inserts.
 *
 * Reads two statement shapes:
 *   - `insert into app.permissions (...) values (...)`
 *   - `insert into l4_catalogue (...) values (...)` — a staging table whose rows
 *     are then copied into `app.permissions` by a `select`.
 *
 * The leading string of each tuple is the key, because every insert lists `key`
 * first. Non-key strings (Arabic labels) never match `KEY_RE`.
 */
export function parseSqlPermissionKeys(sql) {
  const keys = new Set();
  const statement =
    /insert\s+into\s+(?:app\.permissions|l4_catalogue)\s*\([^)]*\)\s*values/gi;

  let match;
  while ((match = statement.exec(sql)) !== null) {
    const rest = sql.slice(match.index + match[0].length);
    const stop = rest.search(/on\s+conflict|;/i);
    const body = stop >= 0 ? rest.slice(0, stop) : rest;

    for (const tuple of splitTuples(body)) {
      const key = tuple.match(/^\s*'([^']+)'\s*,/);
      if (key && KEY_RE.test(key[1])) keys.add(key[1]);
    }
  }

  return keys;
}

/** Union of the keys inserted by every migration, in filename order. */
export function readMigrationPermissionKeys(migrationsDir) {
  const keys = new Set();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    for (const key of parseSqlPermissionKeys(sql)) keys.add(key);
  }

  return keys;
}

/**
 * Loads `PERMISSIONS` from the generated TypeScript data file.
 *
 * Transpiles to CommonJS and evaluates it, so the catalogues are read exactly as
 * the app reads them (no regex over source, no risk of a quote style change
 * silently producing an empty list).
 */
export function loadCatalogue(file) {
  const source = fs.readFileSync(file, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: file,
  });

  const module = { exports: {} };
  const evaluate = new Function("exports", "module", outputText);
  evaluate(module.exports, module);

  const permissions = module.exports.PERMISSIONS;
  if (!Array.isArray(permissions)) {
    throw new Error(`No PERMISSIONS array exported by ${file}`);
  }
  return permissions;
}

/** Duplicate keys in a list, each reported once. */
export function findDuplicates(keys) {
  const seen = new Set();
  const duplicates = new Set();
  for (const key of keys) {
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates].sort();
}

/** Keys present in `left` but missing from `right`. */
export function difference(left, right) {
  return [...left].filter((key) => !right.has(key)).sort();
}
