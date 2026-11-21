import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const attributes = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/autopilot/pharmacy-attributes.ts"),
);
const match = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/autopilot/pharmacy-match.ts"),
);
const quality = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/autopilot/quality-gate.ts"),
);

function product(overrides) {
  return {
    id: overrides.id,
    name: overrides.name,
    barcode: overrides.barcode ?? "",
    categoryKey: overrides.categoryKey ?? "3-26",
    imageUrl: overrides.imageUrl ?? "https://cdn.example.com/p.jpg",
    description: overrides.description ?? "",
  };
}

test("extracts strength, form and pack across Arabic and English", () => {
  const english = attributes.extractPharmacyAttributes("Augmentin 1g 14 tablets");
  assert.deepEqual(english.strengths.map((s) => [s.kind, s.value]), [["mass", 1000]]);
  assert.deepEqual(english.forms, ["tablet"]);
  assert.equal(english.pack.count, 14);

  const arabic = attributes.extractPharmacyAttributes("أوجمنتين ٦٢٥ مجم ١٤ قرص");
  assert.deepEqual(arabic.strengths.map((s) => [s.kind, s.value]), [["mass", 625]]);
  assert.deepEqual(arabic.forms, ["tablet"]);
  assert.equal(arabic.pack.count, 14);
});

test("treats 0.5 g and 500 mg as the same strength but rejects 1 g vs 625 mg", () => {
  const halfGram = attributes.extractPharmacyAttributes("Amoxil 0.5 g");
  const fiveHundred = attributes.extractPharmacyAttributes("Amoxil 500 mg");
  assert.equal(attributes.attributeConflict(halfGram, fiveHundred), null);

  const oneGram = attributes.extractPharmacyAttributes("Augmentin 1 g");
  const sixTwentyFive = attributes.extractPharmacyAttributes("Augmentin 625 mg");
  assert.equal(attributes.attributeConflict(oneGram, sixTwentyFive).kind, "strength");
});

test("rejects a dosage-form conflict and a pack-size conflict", () => {
  const syrup = attributes.extractPharmacyAttributes("Paracetamol syrup 120 ml");
  const suppository = attributes.extractPharmacyAttributes("Paracetamol supp 120 ml");
  assert.equal(attributes.attributeConflict(syrup, suppository).kind, "form");

  const twenty = attributes.extractPharmacyAttributes("Panadol 500 mg 20 tablets");
  const thirty = attributes.extractPharmacyAttributes("Panadol 500 mg 30 tablets");
  assert.equal(attributes.attributeConflict(twenty, thirty).kind, "pack");
});

test("matches an exact barcode even across Arabic and English names", () => {
  const reference = [
    product({ id: "r1", name: "Augmentin 1g tablets", barcode: "6223000000017" }),
    product({ id: "r2", name: "Panadol 500mg", barcode: "6223000000024" }),
  ];

  const result = match.matchPharmacyItem(
    { name: "أوجمنتين 1 جم أقراص", barcode: "6223000000017" },
    reference,
  );

  assert.equal(result.reason, "barcode");
  assert.equal(result.match.id, "r1");
});

test("refuses a barcode hit when the strength guardrail conflicts", () => {
  const reference = [
    product({ id: "r1", name: "Augmentin 625 mg tablets", barcode: "6223000000017" }),
  ];

  const result = match.matchPharmacyItem(
    { name: "أوجمنتين 1 جم أقراص", barcode: "6223000000017" },
    reference,
  );

  assert.equal(result.match, null);
  assert.equal(result.reason, "conflict");
  assert.equal(result.conflict.kind, "strength");
});

test("matches a strong same-language name only when guardrails agree", () => {
  const reference = [
    product({ id: "r1", name: "باراسيتامول 500 مجم أقراص" }),
    product({ id: "r2", name: "باراسيتامول 500 مجم شراب" }),
  ];

  const result = match.matchPharmacyItem(
    { name: "باراسيتامول 500 مجم أقراص 20 قرص" },
    reference,
  );

  assert.equal(result.match.id, "r1");
  assert.equal(result.reason, "name");
});

test("returns candidates instead of guessing when two references tie", () => {
  const reference = [
    product({ id: "r1", name: "فيتامين سي 1000 مجم أقراص" }),
    product({ id: "r2", name: "فيتامين سي 1000 مجم أقراص" }),
  ];

  const result = match.matchPharmacyItem(
    { name: "فيتامين سي 1000 مجم أقراص" },
    reference,
  );

  assert.equal(result.match, null);
  assert.equal(result.reason, "ambiguous");
  assert.equal(result.candidates.length, 2);
});

test("confirmCandidate re-applies the guardrail to a model choice", () => {
  const reference = [
    product({ id: "r1", name: "Augmentin 625 mg tablets" }),
  ];
  const rejected = match.confirmCandidate(
    { name: "Augmentin 1 g tablets" },
    reference,
    "r1",
  );
  assert.equal(rejected.product, null);
  assert.equal(rejected.conflict.kind, "strength");

  const accepted = match.confirmCandidate(
    { name: "Augmentin 625 mg tablets" },
    reference,
    "r1",
  );
  assert.equal(accepted.product.id, "r1");
});

test("quality gate keeps a valid image but flags placeholder text", () => {
  const clean = quality.auditReferenceText({
    name: "باراسيتامول 500 مجم",
    description: "مسكن وخافض للحرارة يحتوي على الباراسيتامول.",
    categoryKey: "3-18",
    imageUrl: "https://cdn.example.com/p.jpg",
  });
  assert.equal(clean.needsReview, false);

  const dirty = quality.auditReferenceText({
    name: "-",
    description: "-",
    categoryKey: "",
    imageUrl: "",
  });
  assert.equal(dirty.nameValid, false);
  assert.equal(dirty.descriptionValid, false);
  assert.equal(dirty.categoryValid, false);
  assert.equal(dirty.imageValid, false);
  assert.equal(dirty.needsReview, true);
  assert.ok(dirty.reasons.length === 4);
});

test("cleans HTML out of a reused description and builds neutral copy", () => {
  assert.equal(
    quality.cleanProductDescription("<p>مسكن <b>قوي</b></p>"),
    "مسكن قوي",
  );
  assert.equal(
    quality.neutralDescription({ name: "أموكسيسيلين", company: "جلاكسو" }),
    "أموكسيسيلين — جلاكسو",
  );
});

test("parses real reference-style abbreviations (tabs, caps, drps, films)", () => {
  const asmakast = attributes.extractPharmacyAttributes("ASMAKAST 10MG 30TABS");
  assert.deepEqual(asmakast.strengths.map((s) => s.value), [10]);
  assert.deepEqual(asmakast.forms, ["tablet"]);
  assert.equal(asmakast.pack.count, 30);

  const omepak = attributes.extractPharmacyAttributes("OMEPAK 20MG 14CAPS");
  assert.deepEqual(omepak.forms, ["capsule"]);
  assert.equal(omepak.pack.count, 14);

  const optidex = attributes.extractPharmacyAttributes("OPTIDEX T 5ML EYE DRPS");
  assert.deepEqual(optidex.forms, ["drops"]);
  assert.equal(optidex.pack.volumeMl, 5);

  const ond = attributes.extractPharmacyAttributes("ONDALENZ 4MG 5FILMS");
  assert.deepEqual(ond.forms, ["film"]);
  assert.equal(ond.pack.count, 5);
});

test("retrieves an English reference from a translated Arabic query", () => {
  const reference = [
    product({ id: "r1", name: "AUGMENTIN 1GM 14TABS" }),
    product({ id: "r2", name: "AUGMENTIN 625MG 14TABS" }),
    product({ id: "r3", name: "PANADOL 500MG 20TABS" }),
  ];

  const ranked = match.rankReferenceCandidates(
    { name: "أوجمنتين 1 جم أقراص" },
    reference,
    "Augmentin 1g tablets",
  );

  assert.equal(ranked[0].product.id, "r1");
  assert.equal(ranked[0].conflict, null);
  assert.equal(
    ranked.find((candidate) => candidate.product.id === "r2").conflict.kind,
    "strength",
  );
});
