import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const hydration = loadTsModule(
  path.join(projectRoot, "src/lib/contracts/terms-hydration.ts"),
);
const draft = loadTsModule(
  path.join(projectRoot, "src/lib/contracts/draft-editor.ts"),
);

const { hydrateContractTerms, contractTermsAreUnset } = hydration;
const { EMPTY_CONTRACT_TERMS, DEFAULT_CONTRACT_PREAMBLE } = draft;

const merchant = {
  name: "سفير السعادة",
  businessType: "مطعم",
  contactName: "أحمد",
  contactPhone: "01000000000",
  address: "شارع الجمهورية",
  legalName: "سفير السعادة للتجارة",
  commercialRegisterNo: "308234",
  taxCardNo: "783-410-859",
  legalRepresentativeName: "أحمد فتحي",
  legalRepresentativeTitle: "مالك",
  legalRepresentativeNationalId: "29603301501213",
  legalAddress: "درب الجرن، طنطا",
};

const input = {
  merchant,
  baseCommission: 12,
  exceptions: [{ category: "مشروبات", rate: 8 }],
  clauses: [
    { title: "موضوع العقد وطبيعة العلاقة", body: "نص البند الأول" },
    { title: "رسوم تقديم الخدمات والتشغيل", body: "نص البند الثاني" },
  ],
};

test("an entirely empty terms payload is fully hydrated", () => {
  const terms = hydrateContractTerms(null, input);
  assert.equal(terms.clauses.length, 2);
  assert.equal(terms.baseCommission, 12);
  assert.equal(terms.preamble, DEFAULT_CONTRACT_PREAMBLE);
  assert.match(terms.copiesNote, /نسختين أصليتين/);
  assert.equal(terms.firstPartyRows.length, 4);
  assert.equal(terms.secondPartyRows.length, 8);
  assert.equal(terms.commissionLines.length, 1);
  assert.equal(terms.commissionLines[0].category, "مشروبات");
  assert.equal(terms.commissionLines[0].rate, 8);
});

test("a stored-but-empty payload is treated as unset", () => {
  assert.equal(contractTermsAreUnset(EMPTY_CONTRACT_TERMS), true);
  const terms = hydrateContractTerms(EMPTY_CONTRACT_TERMS, input);
  assert.equal(terms.clauses.length, 2);
  assert.equal(terms.preamble, DEFAULT_CONTRACT_PREAMBLE);
});

test("second-party rows bind the merchant legal identity", () => {
  const terms = hydrateContractTerms(null, input);
  const byLabel = Object.fromEntries(
    terms.secondPartyRows.map((row) => [row.label, row.value]),
  );
  assert.equal(byLabel["اسم المنشأة / المحل"], merchant.legalName);
  assert.equal(byLabel["رقم السجل التجاري"], merchant.commercialRegisterNo);
  assert.equal(byLabel["رقم التسجيل الضريبي"], merchant.taxCardNo);
  assert.equal(
    byLabel["اسم المفوض / صاحب النشاط"],
    merchant.legalRepresentativeName,
  );
  assert.equal(byLabel["العنوان"], merchant.legalAddress);
});

test("explicitly cleared sections are preserved on re-open", () => {
  const stored = {
    baseCommission: 5,
    preamble: "",
    copiesNote: "",
    firstPartyRows: [],
    secondPartyRows: [],
    summaryNote: "",
    clauses: [{ title: "بند محفوظ", body: "نص", enabled: true }],
    commissionLines: [{ category: "خاص", rate: 3 }],
  };
  const terms = hydrateContractTerms(stored, input);
  assert.equal(terms.baseCommission, 5);
  assert.equal(terms.preamble, "");
  assert.equal(terms.copiesNote, "");
  assert.deepEqual(terms.firstPartyRows, []);
  assert.deepEqual(terms.secondPartyRows, []);
  assert.equal(terms.clauses.length, 1);
  assert.equal(terms.clauses[0].title, "بند محفوظ");
  assert.deepEqual(terms.commissionLines, [{ category: "خاص", rate: 3 }]);
});

test("only null sections are hydrated; explicit values win", () => {
  const stored = {
    baseCommission: 9,
    preamble: null,
    copiesNote: "",
    firstPartyRows: null,
    secondPartyRows: [{ id: "sp-x", label: "يدوي", value: "قيمة" }],
    summaryNote: "ملخص",
    clauses: [{ title: "قائم", body: "نص", enabled: true }],
    commissionLines: [],
  };
  const terms = hydrateContractTerms(stored, input);
  assert.equal(terms.preamble, DEFAULT_CONTRACT_PREAMBLE);
  assert.equal(terms.copiesNote, "");
  assert.equal(terms.firstPartyRows.length, 4);
  assert.deepEqual(terms.secondPartyRows, [
    { id: "sp-x", label: "يدوي", value: "قيمة" },
  ]);
  assert.equal(terms.summaryNote, "ملخص");
  assert.equal(terms.clauses.length, 1);
  assert.deepEqual(terms.commissionLines, []);
});
