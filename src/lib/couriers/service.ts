import "server-only";

import { CouriersError } from "./errors";
import {
  deleteCourier as deleteCourierRow,
  insertCourier,
  isCouriersDatabaseConfigured,
  listCouriers,
  updateCourier as updateCourierRow,
} from "./repository";
import {
  courierCreateSchema,
  courierUpdateSchema,
  type Courier,
} from "./types";

/**
 * Tier 3 rules for the delivery roster.
 *
 * A courier is a pure back-office record. There is nothing to provision and
 * nothing to roll back: creating a partner is a single insert, which keeps the
 * flow free of the half-created-account failure modes the auth coupling had.
 */

function requireDatabase(): void {
  if (!isCouriersDatabaseConfigured()) {
    throw new CouriersError(
      "STORE_UNAVAILABLE",
      "قاعدة البيانات غير متصلة.",
      503,
    );
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed path id is a bad request, never a database round-trip. */
function requireCourierId(id: string): string {
  if (!UUID_PATTERN.test(id)) {
    throw new CouriersError("NOT_FOUND", "المندوب غير موجود.", 404);
  }
  return id;
}

export async function loadCouriersBoard(): Promise<Courier[]> {
  requireDatabase();
  return listCouriers();
}

export async function createCourier(rawInput: unknown): Promise<Courier> {
  requireDatabase();
  const input = courierCreateSchema.parse(rawInput);
  return insertCourier(input);
}

export async function updateCourier(
  id: string,
  rawInput: unknown,
): Promise<Courier> {
  requireDatabase();
  const input = courierUpdateSchema.parse(rawInput);
  return updateCourierRow(requireCourierId(id), input);
}

export async function deleteCourier(id: string): Promise<void> {
  requireDatabase();
  await deleteCourierRow(requireCourierId(id));
}
