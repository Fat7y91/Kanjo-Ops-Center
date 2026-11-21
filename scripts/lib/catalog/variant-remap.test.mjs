import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "../load-ts.mjs";

const remap = loadTsModule(
  path.join(projectRoot, "scripts/lib/catalog/variant-remap.ts"),
);

const options = [
  [1, 1, "صغير"], [1, 2, "وسط"], [1, 3, "كبير"], [1, 6, "شرقي"],
  [1, 48, "سنجل"], [1, 51, "اكس لارج"], [1, 70, "تريبل"], [1, 71, "عادي"],
  [2, 7, "عادي"], [2, 8, "حار"], [2, 77, "بيف"], [2, 82, "كبده"],
  [3, 9, "عيش سوري"], [3, 45, "فرنساوي"], [3, 47, "سادة"],
  [5, 13, "سادة"], [6, 25, "ربع كيلو"], [6, 26, "نص كيلو"],
  [7, 38, "100 ملل"], [8, 59, "12 قطعة"], [9, 52, "شرقي"],
  [9, 54, "عادي"], [10, 108, "مقلي"], [13, 127, "ميرندا"],
  [14, 129, "128GB"], [15, 132, "ازرق"],
].map(([variantId, optionId, nameAr]) => ({
  variantId,
  optionId,
  nameAr,
  nameEn: "",
}));

const dictionary = { options, groupNames: new Map() };

const context = {
  productName: "فطيرة",
  vendorTypeId: 6,
  categoryName: "فطائر",
};

function row(label, variantId = null, optionIds = []) {
  return { label, variantId, optionIds };
}

function mapOne(label, current = null, ctx = context) {
  const result = remap.remapAttributes(
    [row(label, current?.variantId ?? null, current?.optionIds ?? [])],
    dictionary,
    ctx,
  );
  return result;
}

test("decomposes a compound label into crust and size", () => {
  const result = mapOne("شرقي صغير");
  const byGroup = new Map(result.selections.map((s) => [s.variantId, s.optionIds]));
  assert.deepEqual(byGroup.get(9), [52]);
  assert.deepEqual(byGroup.get(1), [1]);
});

test("maps size aliases and fractions to atomic options", () => {
  assert.deepEqual(mapOne("M").selections, [{ variantId: 1, optionIds: [2] }]);
  assert.deepEqual(mapOne("1/2").selections, [{ variantId: 6, optionIds: [26] }]);
  assert.deepEqual(mapOne("1/2 كيلو").selections, [{ variantId: 6, optionIds: [26] }]);
  assert.deepEqual(mapOne("500 جرام").selections, [{ variantId: 6, optionIds: [26] }]);
});

test("keeps genuine regular labels but never maps a real label to the dummy pair", () => {
  const regular = mapOne("عادي");
  assert.deepEqual(regular.selections, [{ variantId: 2, optionIds: [7] }]);

  const drink = mapOne("ميرندا", { variantId: 2, optionIds: [7] });
  assert.deepEqual(drink.selections, [{ variantId: 13, optionIds: [127] }]);
  assert.ok(drink.selections.every((selection) => !selection.optionIds.includes(7) || selection.variantId !== 2));
});

test("uses preparation, storage, count and color dictionaries", () => {
  assert.deepEqual(mapOne("مقلي").selections, [{ variantId: 10, optionIds: [108] }]);
  assert.deepEqual(mapOne("128").selections, [{ variantId: 14, optionIds: [129] }]);
  assert.deepEqual(mapOne("12 قطعه").selections, [{ variantId: 8, optionIds: [59] }]);
  assert.deepEqual(mapOne("ازرق").selections, [{ variantId: 15, optionIds: [132] }]);
});

test("resolves ambiguous plain labels by product context", () => {
  const bakery = mapOne("ساده");
  assert.deepEqual(bakery.selections, [{ variantId: 3, optionIds: [47] }]);
  const cafe = mapOne("ساده", null, {
    productName: "قهوة",
    vendorTypeId: 2,
    categoryName: "قهوة",
  });
  assert.deepEqual(cafe.selections, [{ variantId: 5, optionIds: [13] }]);
});

test("aggregates repeated variation rows into one selection per group", () => {
  const result = remap.remapAttributes(
    [row("صغير", 1, [1]), row("وسط", 1, [2]), row("شرقي", 9, [52])],
    dictionary,
    context,
  );
  assert.deepEqual(result.selections, [
    { variantId: 1, optionIds: [1, 2] },
    { variantId: 9, optionIds: [52] },
  ]);
});
