import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const {
  contractGovernanceItems,
  canDeleteContract,
  isTerminalContractStatus,
  ORDER_DELETE_BLOCKED_HINT,
} = loadTsModule(path.join(projectRoot, "src/lib/contracts/governance.ts"));

const CAPS = {
  manageSigned: true,
  deleteContracts: true,
  editFinalized: true,
};

function actions(items) {
  return items.map((item) => item.action);
}

test("open contracts expose no governance actions", () => {
  for (const status of ["draft", "pending_signature"]) {
    assert.equal(isTerminalContractStatus(status), false);
    assert.deepEqual(
      contractGovernanceItems({ status, orderCount: 0, caps: CAPS }),
      [],
    );
  }
});

test("a signed contract offers amend, reopen, terminate and delete", () => {
  const items = contractGovernanceItems({
    status: "signed",
    orderCount: 0,
    caps: CAPS,
  });
  assert.deepEqual(actions(items), ["amend", "reopen", "terminate", "delete"]);
  assert.equal(items.every((item) => item.enabled), true);
});

test("orders block a permanent delete but keep amend and terminate", () => {
  const items = contractGovernanceItems({
    status: "signed",
    orderCount: 3,
    caps: CAPS,
  });
  const byAction = Object.fromEntries(items.map((item) => [item.action, item]));

  assert.equal(byAction.delete.enabled, false);
  assert.equal(byAction.delete.hint, ORDER_DELETE_BLOCKED_HINT);
  assert.equal(byAction.amend.enabled, true);
  assert.equal(byAction.terminate.enabled, true);
});

test("delete needs the delete capability even with zero orders", () => {
  assert.equal(
    canDeleteContract({ hasDeletePermission: false, orderCount: 0 }),
    false,
  );
  assert.equal(
    canDeleteContract({ hasDeletePermission: true, orderCount: 0 }),
    true,
  );
  assert.equal(
    canDeleteContract({ hasDeletePermission: true, orderCount: 1 }),
    false,
  );

  const items = contractGovernanceItems({
    status: "signed",
    orderCount: 0,
    caps: { manageSigned: true, deleteContracts: false, editFinalized: false },
  });
  assert.equal(actions(items).includes("delete"), false);
});

test("a cancelled contract can only be reopened or deleted", () => {
  const items = contractGovernanceItems({
    status: "cancelled",
    orderCount: 0,
    caps: CAPS,
  });
  assert.deepEqual(actions(items), ["reopen", "delete"]);
});

test("force-edit alone grants amend but not reopen", () => {
  const items = contractGovernanceItems({
    status: "signed",
    orderCount: 0,
    caps: { manageSigned: false, deleteContracts: false, editFinalized: true },
  });
  assert.deepEqual(actions(items), ["amend"]);
});

test("the migration grants the capability, relaxes the guard and syncs the rate", () => {
  const sql = fs.readFileSync(
    path.join(
      projectRoot,
      "supabase/migrations/20261219000000_contract_governance.sql",
    ),
    "utf8",
  );
  assert.match(sql, /manage_signed_contracts/);
  assert.match(sql, /clearance_level >= 4 or u\.phone = '\+201040491882'/);
  assert.match(sql, /create or replace function app\.contract_terminal_guard/);
  assert.match(sql, /create or replace function app\.contract_order_counts/);
  assert.match(sql, /'e4c91ae6-19db-41e1-92e7-a83776d9abbd'/);
  assert.match(sql, /'KJ-SGHUQ4'/);
});

test("the capability is catalogued so every UI guard can resolve it", () => {
  const { PERMISSION_KEYS } = loadTsModule(
    path.join(projectRoot, "src/lib/rbac/permissions.ts"),
  );
  assert.ok(PERMISSION_KEYS.includes("manage_signed_contracts"));
});
