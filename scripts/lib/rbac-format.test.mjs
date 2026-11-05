import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { describeSkippedPermissions } = loadTsModule(
  path.join(projectRoot, "src/lib/rbac/format.ts"),
);

test("names a skipped capability by its catalogue label", () => {
  const message = describeSkippedPermissions(["view_overview"]);

  assert.equal(message, "تم حفظ بقية التغييرات. لم تُمنح: عرض النظرة العامة.");
});

test("joins several skipped capabilities into one sentence", () => {
  const message = describeSkippedPermissions([
    "view_overview",
    "view_finance",
  ]);

  assert.equal(
    message,
    "تم حفظ بقية التغييرات. لم تُمنح: عرض النظرة العامة، عرض الملخص المالي.",
  );
});

test("falls back to the raw key when it is not catalogued", () => {
  const message = describeSkippedPermissions(["not_a_real_key"]);

  assert.equal(
    message,
    "تم حفظ بقية التغييرات. لم تُمنح: not_a_real_key.",
  );
});

test("says nothing when every requested capability was stored", () => {
  assert.equal(describeSkippedPermissions([]), null);
});
