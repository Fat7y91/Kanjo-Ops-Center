import "server-only";

import {
  findRiderByNationalId,
  getRiderCustodyReceipt,
  issueCustody,
} from "./custody-repository";
import { RidersError } from "./errors";
import { getNextSequence, listLocations } from "./locations-repository";
import { isRidersDatabaseConfigured, listRiders } from "./repository";
import {
  issueCustodySchema,
  riderLookupSchema,
  sequenceQuerySchema,
} from "./schema";
import type {
  CustodyIssueResult,
  LocationCatalog,
  NextSequence,
  Rider,
  RiderCustodyReceipt,
  RiderLookup,
} from "./types";

function requireDatabase(): void {
  if (!isRidersDatabaseConfigured()) {
    throw new RidersError(
      "STORE_UNAVAILABLE",
      "قاعدة البيانات غير متصلة.",
      503,
    );
  }
}

export async function loadRidersBoard(): Promise<Rider[]> {
  requireDatabase();
  return listRiders();
}

export async function loadRiderCustodyReceipt(
  receiptId: string,
): Promise<RiderCustodyReceipt | null> {
  requireDatabase();
  return getRiderCustodyReceipt(receiptId);
}

export async function loadLocations(): Promise<LocationCatalog> {
  requireDatabase();
  return listLocations();
}

export async function loadNextSequence(
  rawQuery: unknown,
): Promise<NextSequence> {
  requireDatabase();
  const query = sequenceQuerySchema.parse(rawQuery);
  return getNextSequence(query.governorate, query.city);
}

export async function lookupRider(rawQuery: unknown): Promise<RiderLookup | null> {
  requireDatabase();
  const query = riderLookupSchema.parse(rawQuery);
  return findRiderByNationalId(query.nationalId);
}

export async function issueCustodyReceipt(
  rawInput: unknown,
  createdBy: string | null,
): Promise<CustodyIssueResult> {
  requireDatabase();
  const input = issueCustodySchema.parse(rawInput);
  return issueCustody(input, createdBy);
}
