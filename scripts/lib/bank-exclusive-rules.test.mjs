/**
 * Guards the bank-exclusive operational rules and the coupon per-order cap.
 *
 * The PO's requirements are strict: daily operations must settle the EGP bank
 * account only, the SAR account must never be touched by a manual movement, and
 * a percentage coupon's discount must be clamped to its absolute per-order cap
 * before the funding split. These are enforced in SQL; this test pins the SQL
 * so a future edit cannot quietly drop a guard.
 *
 * Usage:
 *   node --test scripts/lib/bank-exclusive-rules.test.mjs
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = path.join(root, "supabase/migrations");

function migrationSql() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
    .join("\n");
}

const strip = (sql) =>
  sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

/** The most recent definition of a function wins across the migration set. */
function lastFunctionBody(sql, name) {
  const marker = `create or replace function app.${name}(`;
  let last = "";
  let index = sql.indexOf(marker);
  while (index !== -1) {
    const bodyStart = sql.indexOf("$$", index);
    const bodyEnd = sql.indexOf("$$", bodyStart + 2);
    if (bodyStart === -1 || bodyEnd === -1) break;
    last = sql.slice(bodyStart + 2, bodyEnd);
    index = sql.indexOf(marker, bodyEnd + 2);
  }
  return last;
}

test("post_settlement posts to the EGP bank account", () => {
  const body = lastFunctionBody(strip(migrationSql()), "post_settlement");
  assert.match(body, /system_account\('1000'\)/);
  assert.doesNotMatch(body, /system_account\('1000-SAR'\)/);
});

test("post_settlement rejects non-EGP party accounts", () => {
  const body = lastFunctionBody(strip(migrationSql()), "post_settlement");
  assert.match(body, /SETTLEMENT_EGP_ONLY/);
  assert.match(body, /acct\.currency\s*<>\s*'EGP'/);
});

test("post_bank_movement rejects non-EGP bank accounts", () => {
  const body = lastFunctionBody(strip(migrationSql()), "post_bank_movement");
  assert.match(body, /BANK_MOVEMENT_EGP_ONLY/);
  assert.match(body, /acct\.currency\s*<>\s*'EGP'/);
});

test("operation_freeze_amounts clamps to max_discount_minor before split", () => {
  const body = lastFunctionBody(strip(migrationSql()), "operation_freeze_amounts");
  assert.match(body, /max_discount_minor/);
  assert.match(body, /if\s+c_max\s+is\s+not\s+null\s+and\s+base_minor\s*>\s*c_max/);
  // The clamp must happen before the platform/vendor split is derived.
  const clampAt = body.indexOf("base_minor := c_max");
  const splitAt = body.indexOf("platform_share :=");
  assert.ok(clampAt !== -1 && splitAt !== -1 && clampAt < splitAt);
});

test("coupons table carries a max_discount_minor column", () => {
  assert.match(
    strip(migrationSql()),
    /add column if not exists max_discount_minor bigint/,
  );
});
