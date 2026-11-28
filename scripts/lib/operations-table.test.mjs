import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const table = loadTsModule(
  path.join(projectRoot, "src/lib/operations/table.ts"),
);

function row(overrides = {}) {
  return {
    id: "id-1",
    orderId: "149257",
    merchantName: "طاسة كبدة",
    courierName: "يوسف علي",
    couponCode: "",
    ...overrides,
  };
}

test("filterOperations matches order, merchant, courier and coupon text", () => {
  const rows = [
    row(),
    row({ id: "id-2", orderId: "160001", merchantName: "مطعم النيل" }),
    row({ id: "id-3", orderId: "160002", courierName: "ZEMBAWY" }),
    row({ id: "id-4", orderId: "160003", couponCode: "EID50" }),
  ];

  assert.equal(table.filterOperations(rows, "").length, 4);
  assert.deepEqual(
    table.filterOperations(rows, "nile").map((item) => item.id),
    [],
  );
  assert.deepEqual(
    table.filterOperations(rows, "ZEMBAWY").map((item) => item.id),
    ["id-3"],
  );
  assert.deepEqual(
    table.filterOperations(rows, " 149257 ").map((item) => item.id),
    ["id-1"],
  );
  assert.deepEqual(
    table.filterOperations(rows, "eid50").map((item) => item.id),
    ["id-4"],
  );
});

test("pageCount and clampPage keep the page inside the book", () => {
  assert.equal(table.pageCount(0, 50), 1);
  assert.equal(table.pageCount(179, 50), 4);
  assert.equal(table.pageCount(179, 100), 2);
  assert.equal(table.pageCount(179, "all"), 1);

  assert.equal(table.clampPage(9, 179, 50), 4);
  assert.equal(table.clampPage(0, 179, 50), 1);
  assert.equal(table.clampPage(-3, 179, 50), 1);
  assert.equal(table.clampPage(2, 179, "all"), 1);
});

test("paginate returns the requested slice and never caps the total", () => {
  const rows = Array.from({ length: 179 }, (_, index) => row({ id: String(index) }));

  assert.equal(table.paginate(rows, 1, 100).length, 100);
  assert.equal(table.paginate(rows, 2, 100).length, 79);
  assert.equal(table.paginate(rows, 2, 100)[0].id, "100");
  assert.equal(table.paginate(rows, 1, "all").length, 179);
  assert.equal(table.paginate(rows, 99, 50).length, 29);
});
