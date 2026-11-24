import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { clearMerchantCatalog } = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/clear-catalog.ts"),
);

/**
 * The bulk clear is the one catalog action that removes many rows at once.
 *
 * These tests pin the safety rule: the DELETE must be scoped by `merchant_id`
 * inside the query builder, so clearing Merchant A can never touch Merchant B,
 * and a blank id must fail instead of matching every row.
 */

function makeClient(rows) {
  const calls = [];
  const client = {
    schema(schemaName) {
      assert.equal(schemaName, "app");
      return {
        from(table) {
          assert.equal(table, "catalog_products");
          return {
            delete(options) {
              const filter = {};
              calls.push({ options, filter });
              const chain = {
                eq(column, value) {
                  filter.column = column;
                  filter.value = value;
                  return chain;
                },
                then(resolve, reject) {
                  try {
                    const before = rows.length;
                    for (let i = rows.length - 1; i >= 0; i -= 1) {
                      const row = rows[i];
                      if (filter.column && row[filter.column] === filter.value) {
                        rows.splice(i, 1);
                      }
                    }
                    resolve({ count: before - rows.length, error: null });
                  } catch (error) {
                    reject(error);
                  }
                },
              };
              return chain;
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

test("clearing one merchant deletes only that merchant's products", async () => {
  const rows = [
    { id: "p1", merchant_id: "KJ-A" },
    { id: "p2", merchant_id: "KJ-A" },
    { id: "p3", merchant_id: "KJ-B" },
  ];
  const { client, calls } = makeClient(rows);

  const deletedCount = await clearMerchantCatalog("KJ-A", { client });

  assert.equal(deletedCount, 2);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["p3"],
    "Merchant B rows must survive a Merchant A clear",
  );
  assert.equal(calls[0].filter.column, "merchant_id");
  assert.equal(calls[0].filter.value, "KJ-A");
  assert.equal(calls[0].options.count, "exact");
});

test("clearing an empty merchant reports zero and touches nothing", async () => {
  const rows = [{ id: "p1", merchant_id: "KJ-B" }];
  const { client } = makeClient(rows);

  const deletedCount = await clearMerchantCatalog("KJ-EMPTY", { client });

  assert.equal(deletedCount, 0);
  assert.equal(rows.length, 1);
});

test("a blank merchant id is rejected before any delete", async () => {
  const rows = [{ id: "p1", merchant_id: "KJ-A" }];
  const { client } = makeClient(rows);

  await assert.rejects(
    () => clearMerchantCatalog("   ", { client }),
    /INVALID_MERCHANT_ID/,
  );
  assert.equal(rows.length, 1, "nothing must be deleted for a blank id");
});

test("an over-long merchant id is rejected before any delete", async () => {
  const rows = [{ id: "p1", merchant_id: "KJ-A" }];
  const { client } = makeClient(rows);

  await assert.rejects(
    () => clearMerchantCatalog("x".repeat(65), { client }),
    /INVALID_MERCHANT_ID/,
  );
  assert.equal(rows.length, 1);
});
