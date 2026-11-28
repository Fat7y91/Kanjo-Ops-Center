import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { resolveAgainstCatalogue } = loadTsModule(
  path.join(projectRoot, "src/lib/rbac/permission-catalogue.ts"),
);

test("keeps the keys the catalogue holds and reports the rest", () => {
  const result = resolveAgainstCatalogue(
    ["view_overview", "answer_notifications", "manage_performance_reviews"],
    ["view_overview", "manage_system_users"],
  );

  assert.deepEqual(result.granted, ["view_overview"]);
  assert.deepEqual(result.missing, [
    "answer_notifications",
    "manage_performance_reviews",
  ]);
});

test("grants nothing when the deployment seeded no matching capability", () => {
  const result = resolveAgainstCatalogue(["view_overview"], []);

  assert.deepEqual(result.granted, []);
  assert.deepEqual(result.missing, ["view_overview"]);
});

test("reports nothing when every key is catalogued", () => {
  const result = resolveAgainstCatalogue(
    ["view_overview", "view_audit_log"],
    ["view_overview", "view_audit_log", "manage_system_users"],
  );

  assert.deepEqual(result.granted, ["view_overview", "view_audit_log"]);
  assert.deepEqual(result.missing, []);
});

test("asks for an empty grant set without touching the catalogue", () => {
  const result = resolveAgainstCatalogue([], ["view_overview"]);

  assert.deepEqual(result.granted, []);
  assert.deepEqual(result.missing, []);
});

test("collapses duplicates so a key is never granted twice", () => {
  const result = resolveAgainstCatalogue(
    ["view_overview", "view_overview", "view_audit_log"],
    ["view_overview", "view_audit_log"],
  );

  assert.deepEqual(result.granted, ["view_overview", "view_audit_log"]);
  assert.deepEqual(result.missing, []);
});

test("resolves the whole application catalogue against itself", () => {
  const { PERMISSION_KEYS } = loadTsModule(
    path.join(projectRoot, "src/lib/rbac/permissions.ts"),
  );

  const result = resolveAgainstCatalogue(PERMISSION_KEYS, PERMISSION_KEYS);

  assert.equal(result.granted.length, PERMISSION_KEYS.length);
  assert.deepEqual(result.missing, []);
});
