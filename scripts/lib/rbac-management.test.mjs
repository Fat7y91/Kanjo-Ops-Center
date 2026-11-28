import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const management = loadTsModule(
  path.join(projectRoot, "src/lib/rbac/management.ts"),
);

const FOUNDER_ID = "user-founder";

function session(overrides = {}) {
  return {
    user: {
      id: FOUNDER_ID,
      name: "Founder",
      email: "founder@kanjo.example",
      title: "مالك المنصة",
      team: "Executive",
    },
    permissions: ["manage_system_users", "view_overview"],
    accessibleCities: [],
    clearanceLevel: 4,
    globalScope: true,
    revision: 1,
    ...overrides,
  };
}

function user(overrides = {}) {
  return {
    id: "user-other",
    name: "Other",
    email: "other@kanjo.example",
    title: "Rep",
    team: "",
    permissions: [],
    accessibleCities: [],
    clearanceLevel: 1,
    globalScope: false,
    active: true,
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

const self = user({
  id: FOUNDER_ID,
  name: "Founder",
  email: "founder@kanjo.example",
  clearanceLevel: 4,
  globalScope: true,
  permissions: ["manage_system_users", "view_overview"],
});

function denies(fn, code) {
  try {
    fn();
  } catch (error) {
    assert.equal(error.name, "RbacDeniedError");
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`expected RbacDeniedError(${code})`);
}

test("assertCanManage allows editing your own account", () => {
  assert.doesNotThrow(() =>
    management.assertCanManage(session(), self, { allowSelf: true }),
  );
});

test("assertCanManage still blocks deleting your own account", () => {
  denies(() => management.assertCanManage(session(), self), "SELF_MANAGEMENT");
});

test("assertCanManage keeps peers invisible", () => {
  denies(
    () =>
      management.assertCanManage(
        session(),
        user({ id: "peer", clearanceLevel: 4 }),
        { allowSelf: true },
      ),
    "CLEARANCE_DENIED",
  );
});

test("assertCanPatch lets the L4 grant itself a newly seeded capability", () => {
  assert.doesNotThrow(() =>
    management.assertCanPatch(session(), self, {
      permissions: ["manage_system_users", "view_overview", "manage_vip_menu"],
    }),
  );
});

test("assertCanPatch refuses a self rank change", () => {
  denies(
    () => management.assertCanPatch(session(), self, { clearanceLevel: 3 }),
    "CLEARANCE_DENIED",
  );
});

test("assertCanPatch allows a self patch that repeats the current rank", () => {
  assert.doesNotThrow(() =>
    management.assertCanPatch(session(), self, {
      clearanceLevel: 4,
      permissions: [...self.permissions, "manage_vip_menu"],
    }),
  );
});

test("assertCanPatch refuses self-deactivation", () => {
  denies(
    () => management.assertCanPatch(session(), self, { active: false }),
    "SELF_MANAGEMENT",
  );
});

test("assertCanPatch refuses dropping your own governorship", () => {
  denies(
    () =>
      management.assertCanPatch(session(), self, {
        permissions: self.permissions.filter(
          (permission) => permission !== "manage_system_users",
        ),
      }),
    "SELF_MANAGEMENT",
  );
});

test("assertCanGrant treats a top-rank grant as always allowed", () => {
  assert.doesNotThrow(() =>
    management.assertCanGrant(session(), ["export_merchant_data"]),
  );
});

test("assertCanGrant lets the top rank hand out a capability it does not hold", () => {
  // `view_notifications` arrives with a migration that backfills the rank, but
  // until that backfill (or the seeding SQL) lands, the L4 holds no grant row
  // for it. The rule is about rank, so granting it to a lower account must not
  // be refused on that ground.
  assert.doesNotThrow(() =>
    management.assertCanGrant(session(), ["view_notifications"]),
  );
});

test("assertCanGrant keeps the subset rule for a lower admin", () => {
  const admin = session({
    clearanceLevel: 3,
    permissions: ["manage_system_users", "view_overview"],
  });
  denies(
    () => management.assertCanGrant(admin, ["export_merchant_data"]),
    "PERMISSION_ESCALATION",
  );
});

test("assertCanPatch lets the top rank patch a lower account beyond its own grants", () => {
  assert.doesNotThrow(() =>
    management.assertCanPatch(session(), user({ clearanceLevel: 3 }), {
      permissions: ["view_overview", "view_notifications", "view_audit_logs"],
    }),
  );
});

test("assertCanCreate lets the top rank provision a newly catalogued capability", () => {
  assert.doesNotThrow(() =>
    management.assertCanCreate(session(), {
      clearanceLevel: 3,
      accessibleCities: [],
      permissions: ["manage_system_users", "view_notifications"],
    }),
  );
});

test("assertCanCreate keeps the subset rule for a lower admin", () => {
  const admin = session({
    clearanceLevel: 3,
    permissions: ["manage_system_users", "view_overview"],
  });
  denies(
    () =>
      management.assertCanCreate(admin, {
        clearanceLevel: 2,
        accessibleCities: [],
        permissions: ["view_notifications"],
      }),
    "PERMISSION_ESCALATION",
  );
});
