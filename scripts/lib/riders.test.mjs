import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const codes = loadTsModule(path.join(projectRoot, "src/lib/riders/codes.ts"));
const tafqeet = loadTsModule(path.join(projectRoot, "src/lib/riders/tafqeet.ts"));
const totals = loadTsModule(path.join(projectRoot, "src/lib/riders/totals.ts"));
const schema = loadTsModule(path.join(projectRoot, "src/lib/riders/schema.ts"));
const format = loadTsModule(path.join(projectRoot, "src/lib/riders/format.ts"));
const defaults = loadTsModule(path.join(projectRoot, "src/lib/riders/defaults.ts"));

const PARTS = {
  govAlpha: "KFS",
  cityAlpha: "DQ",
  govNum: "10",
  cityNum: "01",
};

test("rider and custody codes follow the deterministic pattern", () => {
  assert.equal(codes.paddedSequence(5), "0005");
  assert.equal(codes.buildRiderCode(PARTS, 5), "10010005");
  assert.equal(codes.buildCustodyNumber(PARTS, 5), "KFS-DQ-0005");
  assert.equal(codes.buildRiderCode(PARTS, 42), "10010042");
  assert.equal(codes.buildCustodyNumber(PARTS, 42), "KFS-DQ-0042");
});

test("sequence starts at the city floor or one past the highest rider", () => {
  assert.equal(codes.nextSequence(null, 5), 5);
  assert.equal(codes.nextSequence(4, 5), 5);
  assert.equal(codes.nextSequence(5, 5), 6);
  assert.equal(codes.nextSequence(0, 1), 1);
  assert.equal(codes.nextSequence(17, 1), 18);
});

test("serial numbers exist only for positive quantities", () => {
  assert.equal(codes.buildItemSerial("HB", PARTS, 5, 1), "KFS-DQ-HB-0005");
  assert.equal(codes.buildItemSerial("TSH", PARTS, 5, 2), "KFS-DQ-TSH-0005");
  assert.equal(codes.buildItemSerial("HP", PARTS, 5, 0), null);
  assert.equal(codes.buildItemSerial("OTHER", PARTS, 5, 1, "BX"), "KFS-DQ-BX-0005");
  assert.equal(codes.buildItemSerial("OTHER", PARTS, 5, 1, null), null);
});

test("asset serials are decoupled from the rider sequence", () => {
  assert.equal(codes.buildItemSerial("HP", PARTS, 1, 1), "KFS-DQ-HP-0001");
  assert.equal(codes.buildItemSerial("HB", PARTS, 3, 1), "KFS-DQ-HB-0003");
  assert.equal(
    codes.buildItemSerial("TSH", PARTS, 1500, 1),
    "KFS-DQ-TSH-1500",
  );
  assert.notEqual(
    codes.buildItemSerial("HP", PARTS, 1, 1),
    codes.buildItemSerial("HP", PARTS, 3, 1),
  );
});

test("normalizeItems keeps submitted serials and clears zero quantities", () => {
  const drafts = defaults.buildDefaultItems().map((item) =>
    item.key === "HB"
      ? { ...item, quantity: 1, serial: "KFS-DQ-HB-0003" }
      : item.key === "HP"
        ? { ...item, quantity: 0, serial: "KFS-DQ-HP-0009" }
        : item,
  );
  const items = totals.normalizeItems(drafts);
  assert.equal(items.find((item) => item.key === "HB").serial, "KFS-DQ-HB-0003");
  assert.equal(items.find((item) => item.key === "HP").serial, null);
});

test("the default custody totals 6,500 EGP and reads in Arabic words", () => {
  const items = totals.normalizeItems(defaults.buildDefaultItems());
  assert.equal(totals.itemsTotal(items), 4500);
  assert.equal(totals.custodyTotal(items, defaults.DEFAULT_CASH_CUSTODY), 6500);
  assert.equal(
    tafqeet.tafqeetEGP(6500),
    "ستة آلاف وخمسمائة جنيه لا غير",
  );
});

test("Arabic tafqeet handles the documented examples", () => {
  assert.equal(tafqeet.tafqeetEGP(0), "صفر جنيه لا غير");
  assert.equal(tafqeet.tafqeetEGP(2000), "ألفان جنيه لا غير");
  assert.equal(
    tafqeet.tafqeetEGP(4500),
    "أربعة آلاف وخمسمائة جنيه لا غير",
  );
  assert.equal(
    tafqeet.tafqeetEGP(7250),
    "سبعة آلاف ومائتان وخمسون جنيه لا غير",
  );
  assert.equal(tafqeet.intToArabicWords(100), "مائة");
  assert.equal(tafqeet.intToArabicWords(101), "مائة وواحد");
  assert.equal(tafqeet.intToArabicWords(110), "مائة وعشرة");
  assert.equal(tafqeet.intToArabicWords(200), "مائتان");
  assert.equal(tafqeet.intToArabicWords(11000), "أحد عشر ألف");
  assert.equal(tafqeet.intToArabicWords(200000), "مائتا ألف");
  assert.equal(
    tafqeet.intToArabicWords(3_500_000),
    "ثلاثة ملايين وخمسمائة ألف",
  );
});

test("line totals round to piastres without drift", () => {
  assert.equal(totals.lineTotal(3, 420), 1260);
  assert.equal(totals.lineTotal(1, 160.005), 160.01);
  assert.equal(totals.roundMoney(0.1 + 0.2), 0.3);
});

test("issue schema accepts a valid receipt and rejects bad identities", () => {
  const payload = {
    governorate: "كفر الشيخ",
    city: "دسوق",
    sequence: 5,
    fullName: "محمد أحمد علي",
    nationalId: "12345678901234",
    phone: "01012345678",
    workArea: "دسوق",
    deliveryDate: "2026-11-21",
    handoverOfficer: "م/ محمود الجمل",
    items: defaults.buildDefaultItems(),
    cashCustody: 2000,
    totalAmount: 6500,
    notes: "",
  };

  const parsed = schema.issueCustodySchema.parse(payload);
  assert.equal(parsed.riderMode, "new");
  assert.equal(parsed.items.length, 5);
  assert.equal(parsed.cashCustody, 2000);

  const existing = schema.issueCustodySchema.parse({
    riderMode: "existing",
    riderId: "8b837bd0-b3b5-4c0b-9b94-abc8b4f5446b",
    governorate: "كفر الشيخ",
    city: "دسوق",
    receiptSequence: 9,
    deliveryDate: "2026-11-21",
    handoverOfficer: "م/ محمود الجمل",
    items: defaults.buildDefaultItems(),
    cashCustody: 0,
    totalAmount: 4500,
  });
  assert.equal(existing.riderId, "8b837bd0-b3b5-4c0b-9b94-abc8b4f5446b");
  assert.equal(existing.receiptSequence, 9);

  const existingWithIdentity = schema.issueCustodySchema.parse({
    riderMode: "existing",
    riderId: "fcf92126-254e-403b-919d-bd6bc4557c43",
    governorate: "كفر الشيخ",
    city: "دسوق",
    sequence: 7,
    receiptSequence: 10,
    fullName: "مندوب تشغيلي",
    nationalId: "12345678901234",
    phone: "01012345678",
    workArea: "دسوق",
    deliveryDate: "2026-11-21",
    handoverOfficer: "م/ محمود الجمل",
    items: defaults.buildDefaultItems(),
    cashCustody: 0,
    totalAmount: 4500,
  });
  assert.equal(existingWithIdentity.sequence, 7);
  assert.equal(existingWithIdentity.nationalId, "12345678901234");

  assert.throws(
    () =>
      schema.issueCustodySchema.parse({
        riderMode: "existing",
        riderId: "fcf92126-254e-403b-919d-bd6bc4557c43",
        governorate: "كفر الشيخ",
        city: "دسوق",
        nationalId: "123",
        deliveryDate: "2026-11-21",
        handoverOfficer: "م/ محمود الجمل",
        items: defaults.buildDefaultItems(),
        cashCustody: 0,
        totalAmount: 4500,
      }),
    /الرقم القومي/,
  );

  assert.throws(
    () =>
      schema.issueCustodySchema.parse({
        ...payload,
        riderMode: "existing",
        riderId: null,
        sequence: null,
      }),
    /اختر مندوباً/,
  );

  assert.throws(
    () => schema.issueCustodySchema.parse({ ...payload, nationalId: "123" }),
    /الرقم القومي/,
  );
  assert.throws(
    () =>
      schema.issueCustodySchema.parse({
        ...payload,
        items: [payload.items[0], payload.items[0]],
      }),
    /تكرار/,
  );
  assert.throws(
    () =>
      schema.issueCustodySchema.parse({
        ...payload,
        items: payload.items.map((item) => ({ ...item, quantity: 0 })),
        cashCustody: 0,
      }),
    /بنداً واحداً/,
  );
});

test("directory formatting never exposes the full national id", () => {
  assert.equal(format.maskNationalId("12345678901234"), "1234********34");
  assert.equal(format.riderStatusLabel("active"), "نشط");
  assert.equal(format.riderStatusLabel("suspended"), "موقوف");
  assert.equal(format.riderStatusLabel("offboarded"), "منتهي");
  assert.equal(format.riderInitials("محمد أحمد علي"), "مع");
});
