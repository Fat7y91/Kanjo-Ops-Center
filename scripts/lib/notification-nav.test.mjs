import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const modules = loadTsModule(
  path.join(projectRoot, "src/lib/rbac/modules.ts"),
);

const INBOX = "/notifications";

function inbox() {
  const module = modules.moduleForPath(INBOX);
  assert.ok(module, "the inbox module must exist in the catalogue");
  return module;
}

test("the inbox is routable but never a sidebar item", () => {
  assert.equal(modules.moduleInSidebar(inbox()), false);
  assert.deepEqual(modules.permissionsForPath(INBOX), ["view_notifications"]);
});

test("the inbox opens for a holder of view_notifications", () => {
  assert.equal(modules.moduleAllows(inbox(), ["view_notifications"], 1), true);
});

test("the inbox opens for the executive tier without the grant", () => {
  assert.equal(modules.moduleAllows(inbox(), [], 3), true);
  assert.equal(modules.moduleAllows(inbox(), [], 4), true);
  assert.equal(modules.moduleAllows(inbox(), [], 2), false);
});

test("a granted capability is honoured below the bypass rank", () => {
  const module = { ...inbox(), clearanceBypass: 3 };
  assert.equal(module.clearanceBypass, 3);
  assert.equal(modules.moduleAllows(module, ["view_notifications"], 0), true);
});

test("a hidden module is never the landing page", () => {
  const landing = modules.firstPermittedPath(["view_notifications"], 4);
  assert.notEqual(landing, INBOX);
});
