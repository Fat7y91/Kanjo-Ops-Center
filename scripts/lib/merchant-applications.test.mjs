import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const input = loadTsModule(
  path.join(projectRoot, "src/lib/merchant-applications/input.ts"),
);
const types = loadTsModule(
  path.join(projectRoot, "src/lib/merchant-applications/types.ts"),
);

test("readApplicationFields accepts camelCase, snake_case and kebab-case", () => {
  assert.deepEqual(
    input.readApplicationFields({
      storeName: "أبو شام",
      contact_person: "سامر",
      "phone-number": "01012345678",
      businessType: "مطعم",
    }),
    {
      storeName: "أبو شام",
      contactPerson: "سامر",
      phoneNumber: "01012345678",
      businessType: "مطعم",
    },
  );
});

test("readApplicationFields trims values and drops blanks", () => {
  assert.deepEqual(
    input.readApplicationFields({ store: "  متجر  ", phone: "   ", contact: null }),
    { storeName: "متجر" },
  );
});

test("readApplicationFields ignores unknown keys and keeps the first spelling", () => {
  assert.deepEqual(
    input.readApplicationFields({
      store_name: "الأول",
      storeName: "الثاني",
      admin: true,
      status: "approved",
    }),
    { storeName: "الأول" },
  );
});

test("readApplicationFields tolerates a body that is not an object", () => {
  assert.deepEqual(input.readApplicationFields(null), {});
  assert.deepEqual(input.readApplicationFields([1, 2, 3]), {});
  assert.deepEqual(input.readApplicationFields("store=x"), {});
});

test("the canonical field order matches the public form", () => {
  assert.deepEqual([...input.APPLICATION_FIELDS], [
    "storeName",
    "contactPerson",
    "phoneNumber",
    "businessType",
  ]);
});

test("status metadata falls back for a status outside the lifecycle", () => {
  assert.equal(types.applicationStatusMeta("pending").label, "بانتظار المراجعة");
  assert.equal(types.applicationStatusMeta("approved").tone, "badge-green");
  assert.deepEqual(types.applicationStatusMeta("archived"), {
    label: "archived",
    tone: "",
  });
  assert.equal(types.isApplicationStatus("rejected"), true);
  assert.equal(types.isApplicationStatus("closed"), false);
});
