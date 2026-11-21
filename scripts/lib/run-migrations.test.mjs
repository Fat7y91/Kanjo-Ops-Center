import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const moduleUrl = pathToFileURL(
  path.join(root, "scripts/run-migrations.mjs"),
).href;

const { parseMigration, stripOuterTransaction, checksumOf } = await import(
  moduleUrl
);

test("parseMigration reads the numeric version and name", () => {
  assert.deepEqual(parseMigration("20261117000000_contracts_v2.sql"), {
    version: "20261117000000",
    name: "contracts_v2",
    file: "20261117000000_contracts_v2.sql",
  });
});

test("parseMigration ignores files without a numeric prefix", () => {
  assert.equal(parseMigration("README.md"), null);
  assert.equal(parseMigration("contracts.sql"), null);
});

test("stripOuterTransaction removes only the leading begin and trailing commit", () => {
  const sql = "begin;\n  select 1;\ncommit;\n";
  assert.equal(stripOuterTransaction(sql), "select 1;");
});

test("stripOuterTransaction preserves inner savepoints", () => {
  const sql =
    "begin;\nsavepoint s1;\nupdate t set a = 1;\nrollback to savepoint s1;\ncommit;";
  const body = stripOuterTransaction(sql);
  assert.match(body, /savepoint s1/);
  assert.match(body, /rollback to savepoint s1/);
  assert.doesNotMatch(body, /^begin/i);
  assert.doesNotMatch(body, /commit\s*;?\s*$/i);
});

test("stripOuterTransaction is case-insensitive and tolerant of whitespace", () => {
  const sql = "  BEGIN ;\nselect 2;\n  COMMIT ;  ";
  assert.equal(stripOuterTransaction(sql), "select 2;");
});

test("stripOuterTransaction normalises a missing trailing semicolon", () => {
  assert.equal(stripOuterTransaction("begin; select 3"), "select 3;");
});

test("checksumOf is stable and content-sensitive", () => {
  const a = checksumOf("select 1;");
  const b = checksumOf("select 1;");
  const c = checksumOf("select 2;");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});
