import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  difference,
  findDuplicates,
  loadCatalogue,
  parseSqlPermissionKeys,
  readMigrationPermissionKeys,
  splitTuples,
} from "./permission-catalogue.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const dataFile = path.join(root, "src/lib/rbac/data/permissions.ts");
const migrationsDir = path.join(root, "supabase/migrations");

test("splitTuples keeps string commas and escaped quotes", () => {
  const tuples = splitTuples("('a', 'x, y'), ('b', 'it''s')");
  assert.equal(tuples.length, 2);
  assert.equal(tuples[0], "'a', 'x, y'");
  assert.equal(tuples[1], "'b', 'it''s'");
});

test("parseSqlPermissionKeys reads literal inserts", () => {
  const sql = `
    insert into app.permissions (key, label) values
      ('alpha', 'أ'),
      ('beta_two', 'ب')
    on conflict (key) do nothing;
  `;
  assert.deepEqual([...parseSqlPermissionKeys(sql)].sort(), [
    "alpha",
    "beta_two",
  ]);
});

test("parseSqlPermissionKeys reads the l4 staging table", () => {
  const sql = `
    insert into l4_catalogue (key, label) values
      ('gamma', 'ج');
    insert into app.permissions (key, label)
      select key, label from l4_catalogue;
  `;
  assert.deepEqual([...parseSqlPermissionKeys(sql)], ["gamma"]);
});

test("parseSqlPermissionKeys ignores labels that look like keys", () => {
  const sql = "insert into app.permissions (key, label) values ('real_key', 'not_a_key');";
  assert.deepEqual([...parseSqlPermissionKeys(sql)], ["real_key"]);
});

test("generated catalogue has no duplicate keys", () => {
  const keys = loadCatalogue(dataFile).map((permission) => permission.key);
  assert.deepEqual(findDuplicates(keys), []);
});

test("catalogue matches the keys inserted by the migrations", () => {
  const dataKeys = loadCatalogue(dataFile).map((permission) => permission.key);
  const dataKeySet = new Set(dataKeys);
  const migrationKeys = readMigrationPermissionKeys(migrationsDir);

  assert.deepEqual(
    difference(migrationKeys, dataKeySet),
    [],
    "migrations insert keys missing from permissions.ts",
  );
  assert.deepEqual(
    difference(dataKeySet, migrationKeys),
    [],
    "permissions.ts lists keys no migration inserts",
  );
});
