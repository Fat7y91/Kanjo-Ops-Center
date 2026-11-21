import "server-only";

import { CouponsError } from "./errors";
import {
  parseCouponRows,
  type CouponImportSummary,
} from "./csv";
import {
  deleteCoupon as deleteCouponRow,
  insertCoupon,
  isCouponsDatabaseConfigured,
  listCoupons,
  updateCoupon as updateCouponRow,
  upsertCouponRows,
} from "./repository";
import {
  couponCreateSchema,
  couponUpdateSchema,
  type Coupon,
} from "./types";

/**
 * Tier 3 rules for the coupon catalogue and bulk import.
 *
 * Pricing an order never reads a coupon's historical totals; it reads the
 * rules. This layer therefore owns only CRUD and the import workflow, and
 * delegates every money/value decision to the parsers and the database guard.
 */

function requireDatabase(): void {
  if (!isCouponsDatabaseConfigured()) {
    throw new CouponsError(
      "STORE_UNAVAILABLE",
      "قاعدة البيانات غير متصلة.",
      503,
    );
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireCouponId(id: string): string {
  if (!UUID_PATTERN.test(id)) {
    throw new CouponsError("NOT_FOUND", "الكوبون غير موجود.", 404);
  }
  return id;
}

/**
 * Turns a Postgres/PostgREST refusal into a domain error.
 *
 * The coupon table raises `COUPON_FREE_SHIPPING_PLATFORM:` from its guard
 * trigger and the unique index reports 23505 on a duplicate code, so a caller
 * gets the same readable message whether the refusal came from the app or the
 * database.
 */
function translate(error: unknown): never {
  if (error instanceof CouponsError) throw error;
  if (typeof error === "object" && error !== null) {
    const message =
      "message" in error && typeof error.message === "string"
        ? error.message
        : "";
    const code =
      "code" in error && typeof error.code === "string" ? error.code : "";
    const marker = message.match(/^([A-Z_]+):\s*([\s\S]*)$/);
    if (marker) {
      throw new CouponsError(marker[1], marker[2] || message, 409);
    }
    if (code === "23505") {
      throw new CouponsError(
        "DUPLICATE_CODE",
        "كود الكوبون مسجّل بالفعل.",
        409,
      );
    }
  }
  throw error;
}

export async function loadCouponsBoard(): Promise<Coupon[]> {
  requireDatabase();
  return listCoupons();
}

export async function createCoupon(rawInput: unknown): Promise<Coupon> {
  requireDatabase();
  const input = couponCreateSchema.parse(rawInput);
  try {
    return await insertCoupon(input);
  } catch (error) {
    translate(error);
  }
}

export async function updateCoupon(
  id: string,
  rawInput: unknown,
): Promise<Coupon> {
  requireDatabase();
  const input = couponUpdateSchema.parse(rawInput);
  try {
    return await updateCouponRow(requireCouponId(id), input);
  } catch (error) {
    translate(error);
  }
}

export async function deleteCoupon(id: string): Promise<void> {
  requireDatabase();
  await deleteCouponRow(requireCouponId(id));
}

export type { CouponImportSummary };

/**
 * Imports the rows of the approved coupon CSV export.
 *
 * Parsing and unit conversion happen in the parser (client preview and server
 * write share it), the write goes through the functional-index upsert, and the
 * database guard remains the final authority on funding rules. A file whose
 * rows all carry an issue writes nothing and reports why.
 */
export async function importCoupons(
  rawRows: Record<string, unknown>[],
): Promise<CouponImportSummary> {
  requireDatabase();

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw new CouponsError("EMPTY_FILE", "لم يتم إرسال أي صفوف للاستيراد.", 422);
  }

  const parsed = parseCouponRows(rawRows);
  let written = 0;
  if (parsed.rows.length > 0) {
    try {
      written = await upsertCouponRows(parsed.rows);
    } catch (error) {
      translate(error);
    }
  }

  return {
    parsed: rawRows.length,
    written,
    duplicates: parsed.duplicates,
    issues: parsed.issues,
  };
}
