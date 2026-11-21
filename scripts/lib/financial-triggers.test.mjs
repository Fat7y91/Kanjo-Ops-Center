/**
 * Guards the financial engine triggers against being silently switched off.
 *
 * `ALTER TABLE ... DISABLE TRIGGER USER` turns off every user trigger on a
 * table, not one. A one-off cleanup script used it on `operation_logs`,
 * `journal_entries` and `journal_lines` and committed without re-enabling,
 * which left the live ledger inert: operations saved but posted no journal
 * entry and moved no balances. This test fails if that pattern reaches a
 * migration.
 *
 * Usage:
 *   node --test scripts/lib/financial-triggers.test.mjs
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = path.join(root, "supabase/migrations");

const FINANCIAL_TABLES = ["operation_logs", "journal_entries", "journal_lines"];

function readMigrations() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({
      name,
      sql: readFileSync(path.join(migrationsDir, name), "utf8"),
    }));
}

const statements = (sql) =>
  sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(";");

test("no migration disables ALL triggers on a financial table", () => {
  const offenders = [];
  for (const { name, sql } of readMigrations()) {
    for (const statement of statements(sql)) {
      const normalised = statement.replace(/\s+/g, " ").trim().toLowerCase();
      const disablesUser = normalised.includes("disable trigger user");
      const disablesAll = /\bdisable trigger all\b/.test(normalised);
      if (!disablesUser && !disablesAll) continue;
      const touchesFinancial = FINANCIAL_TABLES.some((table) =>
        normalised.includes(`app.${table}`),
      );
      if (touchesFinancial) offenders.push(`${name}: ${normalised}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `financial tables must never disable all user triggers (use a named trigger and re-enable it):\n${offenders.join("\n")}`,
  );
});

test("financial tables have one enable statement per table", () => {
  const sql = readMigrations()
    .filter(({ name }) => name.includes("reenable_financial_triggers"))
    .map(({ sql }) => sql)
    .join("\n");

  for (const table of FINANCIAL_TABLES) {
    const enabled = new RegExp(
      `alter table app\\.${table} enable trigger user`,
      "i",
    ).test(sql);
    assert.ok(enabled, `missing re-enable for app.${table}`);
  }
});

test("re-enable migration fails loudly when a trigger stays disabled", () => {
  const sql = readMigrations()
    .filter(({ name }) => name.includes("reenable_financial_triggers"))
    .map(({ sql }) => sql)
    .join("\n");

  assert.match(sql, /raise exception/i);
  assert.match(sql, /tgenabled\s*=\s*'D'/i);
});
