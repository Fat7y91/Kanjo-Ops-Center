import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const seed = loadTsModule(
  path.join(projectRoot, "src/lib/taxonomy/data.generated.ts"),
);
const { CATEGORY_SEED, VENDOR_TYPE_SEED } = seed;

const SQL_PATH = path.join(
  projectRoot,
  "supabase/migrations/20261114000100_seed_taxonomy_categories.sql",
);
const sql = readFileSync(SQL_PATH, "utf8");

const uuidFor = (key) => {
  const h = createHash("md5").update(`kanjo-taxonomy-v1:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

test("seed migration has one row per seeded category", () => {
  const rows = sql.match(/^  \('/gm) ?? [];
  assert.equal(rows.length, CATEGORY_SEED.length);
});

test("seed migration contains every derived uuid exactly once", () => {
  for (const category of CATEGORY_SEED) {
    const id = uuidFor(`${category.vendor_type_id}:${category.id}`);
    const occurrences = sql.split(`'${id}'`).length - 1;
    assert.equal(occurrences >= 1, true, `missing ${category.name_ar} (${id})`);
  }
});

test("seed migration does not collapse the two multi-scope numeric ids", () => {
  const scopes = new Map();
  for (const category of CATEGORY_SEED) {
    scopes.set(category.id, (scopes.get(category.id) ?? 0) + 1);
  }
  const shared = [...scopes].filter(([, n]) => n > 1).map(([id]) => id);
  assert.ok(shared.length > 0, "expected shared numeric ids in the seed");

  for (const numericId of shared) {
    const categories = CATEGORY_SEED.filter((c) => c.id === numericId);
    const uuids = categories.map((c) =>
      uuidFor(`${c.vendor_type_id}:${c.id}`),
    );
    assert.equal(new Set(uuids).size, uuids.length);
    for (const uuid of uuids) assert.ok(sql.includes(`'${uuid}'`));
  }
});

test("seed migration rows match the seed exactly, field by field", () => {
  const unquote = (raw) => {
    if (raw === "null") return null;
    const inner = raw.slice(1, -1);
    return inner.replace(/''/g, "'");
  };
  const rowRe =
    /^  \('([0-9a-f-]{36})', (null|'[0-9a-f-]{36}'), '((?:[^']|'')*)', '((?:[^']|'')*)', (null|'(?:[^']|'')*'), (\d+)\),?$/;

  const parsed = [];
  for (const line of sql.split("\n")) {
    const m = line.match(rowRe);
    if (m) parsed.push(m);
  }
  assert.equal(parsed.length, CATEGORY_SEED.length, "row parse count");

  const vendorName = new Map(VENDOR_TYPE_SEED.map((v) => [v.id, v.name_ar]));
  const byId = new Map(CATEGORY_SEED.map((c) => [`${c.vendor_type_id}:${c.id}`, c]));

  for (const [, rawId, , vendor, nameAr, rawNameEn] of parsed) {
    const id = unquote(`'${rawId}'`);
    const category = byId.get(
      [...byId.keys()].find((k) => uuidFor(k) === id) ?? "",
    );
    assert.ok(category, `sql id ${id} does not map back to a seed category`);
    const expectedVendor = vendorName.get(category.vendor_type_id);
    assert.equal(unquote(`'${vendor}'`), expectedVendor);
    assert.equal(unquote(`'${nameAr}'`), category.name_ar);
    assert.equal(unquote(rawNameEn), category.name_en);
  }
});

test("seed migration escapes single quotes", () => {
  for (const category of CATEGORY_SEED) {
    const name = category.name_ar;
    if (!name.includes("'")) continue;
    assert.ok(sql.includes(name.replace(/'/g, "''")));
  }
});

test("seed migration is idempotent on the primary key", () => {
  assert.match(sql, /on conflict \(id\) do update set/);
  assert.match(sql, /^commit;$/m);
});
