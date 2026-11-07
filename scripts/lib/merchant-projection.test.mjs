import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const mapping = loadTsModule(
  path.join(projectRoot, "src/lib/field-ops/merchant-mapping.ts"),
);

const {
  MERCHANT_COLUMNS,
  MERCHANT_COLUMNS_WITHOUT_COVER,
  MERCHANT_COLUMNS_WITHOUT_IMAGES,
  nextMerchantProjection,
} = mapping;

const undefinedColumn = (column) => ({
  code: "42703",
  message: `column merchants.${column} does not exist`,
});

test("column projection includes both image columns", () => {
  assert.ok(MERCHANT_COLUMNS.includes("logo_url"));
  assert.ok(MERCHANT_COLUMNS.includes("cover_url"));
});

test("dropping cover keeps logo", () => {
  assert.ok(MERCHANT_COLUMNS_WITHOUT_COVER.includes("logo_url"));
  assert.ok(!MERCHANT_COLUMNS_WITHOUT_COVER.includes("cover_url"));
});

test("dropping both removes both image columns", () => {
  assert.ok(!MERCHANT_COLUMNS_WITHOUT_IMAGES.includes("logo_url"));
  assert.ok(!MERCHANT_COLUMNS_WITHOUT_IMAGES.includes("cover_url"));
});

test("a missing cover_url drops only cover_url, keeping logos", () => {
  // Regression: an earlier fallback removed both image columns at once, so a
  // deployment without cover_url (but with logo_url) silently lost every logo.
  const next = nextMerchantProjection(
    MERCHANT_COLUMNS,
    undefinedColumn("cover_url"),
  );
  assert.ok(next, "should return a narrower projection");
  assert.ok(next.includes("logo_url"), "logo_url must survive");
  assert.ok(!next.includes("cover_url"), "cover_url must be dropped");
});

test("a missing logo_url drops only logo_url", () => {
  const next = nextMerchantProjection(
    MERCHANT_COLUMNS,
    undefinedColumn("logo_url"),
  );
  assert.ok(next.includes("cover_url"));
  assert.ok(!next.includes("logo_url"));
});

test("stops when both image columns are already gone", () => {
  assert.equal(
    nextMerchantProjection(
      MERCHANT_COLUMNS_WITHOUT_IMAGES,
      undefinedColumn("cover_url"),
    ),
    null,
  );
});

test("ignores a non-undefined-column error", () => {
  assert.equal(
    nextMerchantProjection(MERCHANT_COLUMNS, { code: "23505" }),
    null,
  );
});

test("ignores an error that does not name a known image column", () => {
  assert.equal(
    nextMerchantProjection(MERCHANT_COLUMNS, undefinedColumn("something_else")),
    null,
  );
});
