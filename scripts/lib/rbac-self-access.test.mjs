import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const hierarchy = loadTsModule(path.join(projectRoot, "src/lib/rbac/hierarchy.ts"));

const FOUNDER_ID = "user-founder";

function actor(overrides = {}) {
  return {
    id: FOUNDER_ID,
    clearanceLevel: 4,
    permissions: ["manage_system_users", "view_overview"],
    accessibleCities: [],
    globalScope: true,
    ...overrides,
  };
}

function target(overrides = {}) {
  return {
    id: "user-other",
    clearanceLevel: 1,
    accessibleCities: [],
    ...overrides,
  };
}

test("isSelf compares the actor id to the target id", () => {
  assert.equal(hierarchy.isSelf(actor(), target()), false);
  assert.equal(hierarchy.isSelf(actor(), target({ id: FOUNDER_ID })), true);
});

test("the top rank sees its own account in the manageable roster", () => {
  const self = target({ id: FOUNDER_ID, clearanceLevel: 4 });
  const users = [self, target()];
  assert.deepEqual(
    hierarchy.filterManageableUsers(actor(), users).map((user) => user.id),
    [FOUNDER_ID, "user-other"],
  );
});

test("self-access does not expose peer superiors", () => {
  const peer = target({ id: "peer-l4", clearanceLevel: 4 });
  assert.equal(hierarchy.canManageUser(actor(), peer), false);
});

test("a lower rank still cannot see its own row without the capability", () => {
  const rep = actor({
    id: "rep",
    clearanceLevel: 1,
    permissions: ["write_report"],
    globalScope: false,
  });
  const self = target({ id: "rep", clearanceLevel: 1 });
  assert.equal(hierarchy.canManageUser(rep, self), false);
});

test("an L4 self-grant accepts any seeded capability", () => {
  assert.equal(
    hierarchy.maySelfGrant(actor(), ["export_merchant_data", "manage_vip_menu"]),
    true,
  );
});

test("a lower rank cannot self-grant a capability it does not hold", () => {
  const admin = actor({
    id: "admin-l3",
    clearanceLevel: 3,
    permissions: ["manage_system_users", "view_overview"],
  });
  assert.equal(
    hierarchy.maySelfGrant(admin, ["export_merchant_data"]),
    false,
  );
  assert.equal(hierarchy.maySelfGrant(admin, ["view_overview"]), true);
});

test("the top rank may grant a capability it does not hold yet", () => {
  // Rank, not the grantor's own rows, bounds the grant: otherwise a capability
  // seeded after the actor's last backfill could never be handed out.
  assert.equal(
    hierarchy.mayGrantPermissions(actor(), ["view_notifications"]),
    true,
  );
  assert.equal(
    hierarchy.mayGrantPermissions(actor(), [
      "view_notifications",
      "view_audit_logs",
    ]),
    true,
  );
});

test("a lower rank may only grant what it already holds", () => {
  const admin = actor({
    id: "admin-l3",
    clearanceLevel: 3,
    permissions: ["manage_system_users", "view_overview"],
  });
  assert.equal(
    hierarchy.mayGrantPermissions(admin, ["view_notifications"]),
    false,
  );
  assert.equal(hierarchy.mayGrantPermissions(admin, ["view_overview"]), true);
});

test("governing a city manager never includes the actor", () => {
  assert.equal(hierarchy.canGovernUser(actor(), target({ id: FOUNDER_ID })), false);
});
