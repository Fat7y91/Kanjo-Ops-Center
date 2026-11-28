import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const mapping = loadTsModule(
  path.join(projectRoot, "src/lib/field-ops/merchant-mapping.ts"),
);
const patchModule = loadTsModule(
  path.join(projectRoot, "src/lib/field-ops/merchant-patch.ts"),
);
const schemas = loadTsModule(
  path.join(projectRoot, "src/lib/schemas/field-ops.ts"),
);

const LEGAL_COLUMNS = [
  "legal_name",
  "commercial_register_no",
  "tax_card_no",
  "legal_representative_name",
  "legal_representative_title",
  "legal_representative_national_id",
  "legal_address",
];

test("merchant projection selects every legal identity column", () => {
  for (const column of LEGAL_COLUMNS) {
    assert.ok(
      mapping.MERCHANT_COLUMNS.includes(column),
      `${column} missing from projection`,
    );
  }
});

test("row mapping exposes the legal identity in camelCase", () => {
  const merchant = mapping.toMerchant({
    id: "m-1",
    name: "متجر",
    normalized_name: "متجر",
    vendor_type_id: 1,
    vendor_type: "متجر",
    team: null,
    city_id: "c-1",
    target_commission: 10,
    monthly_value_minor: 0,
    strategic_notes: "",
    phone: "",
    address: "عنوان",
    legal_name: "الاسم القانوني",
    commercial_register_no: "123",
    tax_card_no: "456",
    legal_representative_name: "المفوض",
    legal_representative_title: "مالك",
    legal_representative_national_id: "29603301501213",
    legal_address: "العنوان القانوني",
    contract_state: "no_agreement",
    commission_amount: 0,
    agreed_commission: null,
    edit_unlocked: false,
    documents: [],
    contact: null,
    opinions: [],
    contact_updated_at: null,
    last_visit_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });
  assert.equal(merchant.legalName, "الاسم القانوني");
  assert.equal(merchant.commercialRegisterNo, "123");
  assert.equal(merchant.taxCardNo, "456");
  assert.equal(merchant.legalRepresentativeName, "المفوض");
  assert.equal(merchant.legalRepresentativeTitle, "مالك");
  assert.equal(merchant.legalRepresentativeNationalId, "29603301501213");
  assert.equal(merchant.legalAddress, "العنوان القانوني");
});

test("a missing legal column is dropped without dropping the physical address", () => {
  // Regression: `legal_address` contains the substring `address`, so a naive
  // check would drop the wrong column and lose the physical address too.
  const next = mapping.nextMerchantProjection(mapping.MERCHANT_COLUMNS, {
    code: "42703",
    message: "column merchants.legal_address does not exist",
  });
  assert.ok(next, "should narrow the projection");
  assert.ok(!next.includes("legal_address"));
  assert.ok(next.includes("address,"), "physical address must survive");
});

test("merchant patch maps every legal field to its column", () => {
  const columns = patchModule.toPatchColumns({
    legalName: "اسم",
    commercialRegisterNo: "123",
    taxCardNo: "456",
    legalRepresentativeName: "مفوض",
    legalRepresentativeTitle: "مالك",
    legalRepresentativeNationalId: "29603301501213",
    legalAddress: "عنوان قانوني",
  });
  assert.deepEqual(columns, {
    legal_name: "اسم",
    commercial_register_no: "123",
    tax_card_no: "456",
    legal_representative_name: "مفوض",
    legal_representative_title: "مالك",
    legal_representative_national_id: "29603301501213",
    legal_address: "عنوان قانوني",
  });
});

test("create schema defaults legal fields to empty strings", () => {
  const input = schemas.merchantCreateSchema.parse({
    name: "متجر جديد",
    cityId: "c-1",
    vendorTypeId: 3,
  });
  assert.equal(input.legalName, "");
  assert.equal(input.commercialRegisterNo, "");
  assert.equal(input.taxCardNo, "");
  assert.equal(input.legalRepresentativeName, "");
  assert.equal(input.legalRepresentativeTitle, "");
  assert.equal(input.legalRepresentativeNationalId, "");
  assert.equal(input.legalAddress, "");
});

test("update schema accepts a legal-only patch", () => {
  const input = schemas.merchantUpdateSchema.parse({
    commercialRegisterNo: " 308234 ",
    taxCardNo: "783-410-859",
  });
  assert.equal(input.commercialRegisterNo, "308234");
  assert.equal(input.taxCardNo, "783-410-859");
});
