import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const tree = loadTsModule(
  path.join(projectRoot, "src/lib/rbac/permission-tree.ts"),
);
const permissions = loadTsModule(
  path.join(projectRoot, "src/lib/rbac/permissions.ts"),
);

const OVERVIEW_CHILDREN = [
  "view_overview_contracts",
  "view_overview_negotiation",
  "view_overview_finance",
  "view_overview_catalog",
  "view_overview_compliance",
  "view_overview_marketing",
];

test("the overview master is the parent of every overview section", () => {
  for (const child of OVERVIEW_CHILDREN) {
    assert.equal(tree.parentPermission(child), "view_overview");
  }
});

test("a root capability has no parent", () => {
  assert.equal(tree.parentPermission("view_overview"), null);
  assert.equal(tree.parentPermission("view_finance"), null);
});

test("every child key exists in the capability catalogue", () => {
  const known = new Set(permissions.PERMISSION_KEYS);
  for (const child of tree.childPermissions("view_overview")) {
    assert.equal(known.has(child), true, `${child} is not in the catalogue`);
  }
});

test("revoking the master returns every held section", () => {
  const held = ["view_overview", ...OVERVIEW_CHILDREN, "view_merchants"];
  assert.deepEqual(tree.cascadeRevoke(held, "view_overview"), OVERVIEW_CHILDREN);
});

test("only the held sections cascade", () => {
  const held = ["view_overview", "view_overview_finance"];
  assert.deepEqual(tree.cascadeRevoke(held, "view_overview"), [
    "view_overview_finance",
  ]);
});

test("a root capability never cascades", () => {
  assert.equal(tree.cascadeRevoke(["view_merchants"], "view_merchants"), null);
  assert.equal(tree.cascadeRevoke([], "view_overview"), null);
});
