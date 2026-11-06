import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { merchantInitials } = loadTsModule(
  path.join(projectRoot, "src/lib/merchants/format.ts"),
);

test("takes the first letter of the first word", () => {
  assert.equal(merchantInitials("212 Perfume"), "2");
  assert.equal(merchantInitials("KFC Egypt"), "K");
});

test("handles Arabic merchant names", () => {
  assert.equal(merchantInitials("مطعم البركة"), "م");
  assert.equal(merchantInitials("سماعة سلكية Celebrat"), "س");
});

test("ignores surrounding and repeated whitespace", () => {
  assert.equal(merchantInitials("   كافيه   النخيل  "), "ك");
});

test("falls back to ? for an empty name", () => {
  assert.equal(merchantInitials(""), "?");
  assert.equal(merchantInitials("   "), "?");
});
