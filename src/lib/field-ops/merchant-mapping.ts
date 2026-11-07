import type {
  ContractState,
  Merchant,
  MerchantDocument,
  RepOpinion,
  VisitContact,
} from "./types";

/**
 * Column projection and row→domain mapping for `app.merchants`.
 *
 * Split out of the repository so the column list, the wire shape and the
 * snake_case→camelCase mapping live in one place. The repository keeps the I/O;
 * this module stays pure and is safe to unit-test.
 */

export const MERCHANT_COLUMNS = [
  "id",
  "name",
  "normalized_name",
  "vendor_type_id",
  "vendor_type",
  "team",
  "city_id",
  "target_commission",
  "monthly_value_minor",
  "strategic_notes",
  "logo_url",
  "cover_url",
  "contract_state",
  "commission_amount",
  "agreed_commission",
  "edit_unlocked",
  "documents",
  "contact",
  "opinions",
  "contact_updated_at",
  "last_visit_at",
  "created_at",
  "updated_at",
].join(",");

/**
 * Fallback projections for a deployment whose code shipped before one of the
 * optional image migrations was applied.
 *
 * Selecting an undefined column makes PostgREST reject the whole select, so a
 * directory that should merely lose its banners would render empty. Each tier
 * drops exactly one image column: dropping both at once would silently wipe
 * logos on a deployment that has `logo_url` but not yet `cover_url`.
 */
export const MERCHANT_COLUMNS_WITHOUT_COVER = MERCHANT_COLUMNS.replace(
  "cover_url,",
  "",
);
export const MERCHANT_COLUMNS_WITHOUT_IMAGES = MERCHANT_COLUMNS_WITHOUT_COVER.replace(
  "logo_url,",
  "",
);

/** PostgREST/Postgres "undefined column" code. */
export function isUndefinedColumn(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "42703"
  );
}

/**
 * Next projection to try after an undefined-column error, or `null` to stop.
 *
 * PostgREST names the offending column in the message, so we remove only that
 * one and keep the rest. Stopping (rather than looping) when the column cannot
 * be identified surfaces a genuine schema problem instead of hiding it behind
 * repeated retries.
 */
export function nextMerchantProjection(
  columns: string,
  error: unknown,
): string | null {
  if (!isUndefinedColumn(error)) return null;
  const message = String(
    (error as { message?: unknown }).message ?? "",
  );
  const drop = message.includes("logo_url")
    ? "logo_url,"
    : message.includes("cover_url")
      ? "cover_url,"
      : null;
  if (!drop || !columns.includes(drop)) return null;
  const next = columns.replace(drop, "");
  return next === columns ? null : next;
}

export type MerchantRow = {
  id: string;
  name: string;
  normalized_name: string;
  vendor_type_id: number | null;
  vendor_type: string;
  team: string | null;
  city_id: string;
  target_commission: number | string;
  monthly_value_minor: number | string;
  strategic_notes: string;
  logo_url?: string | null;
  cover_url?: string | null;
  contract_state: ContractState;
  commission_amount: number | string;
  agreed_commission: number | string | null;
  edit_unlocked: boolean;
  documents: MerchantDocument[] | null;
  contact: VisitContact | null;
  opinions: RepOpinion[] | null;
  contact_updated_at: string | null;
  last_visit_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * `monthly_value_minor` is stored in minor units, but the domain works in major
 * units. Converting at the boundary keeps every calculation in one scale.
 */
export function toMerchant(row: MerchantRow): Merchant {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    vendorTypeId: Number(row.vendor_type_id ?? 0),
    vendorType: row.vendor_type,
    team: row.team,
    cityId: row.city_id,
    logoUrl: row.logo_url ?? null,
    coverUrl: row.cover_url ?? null,
    targetCommission: Number(row.target_commission),
    monthlyValue: Number(row.monthly_value_minor) / 100,
    strategicNotes: row.strategic_notes,
    contractState: row.contract_state,
    commissionAmount: Number(row.commission_amount),
    agreedCommission:
      row.agreed_commission == null ? null : Number(row.agreed_commission),
    editUnlocked: row.edit_unlocked,
    documents: Array.isArray(row.documents) ? row.documents : [],
    contact: row.contact ?? null,
    opinions: Array.isArray(row.opinions) ? row.opinions : [],
    contactUpdatedAt: row.contact_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastVisitAt: row.last_visit_at,
  };
}
