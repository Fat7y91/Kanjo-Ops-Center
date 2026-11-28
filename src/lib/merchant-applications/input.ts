/**
 * Field normalisation for the public form payload.
 *
 * The landing page is a separate deployment, so its author picks the casing:
 * `storeName`, `store_name`, `store-name` and `store` all mean the same
 * question. Normalising here means the zod schema in
 * `src/lib/schemas/merchant-applications.ts` documents one canonical shape
 * instead of four, and unknown keys are dropped rather than forwarded into an
 * insert.
 *
 * Pure and import-free on purpose: it is unit-tested through
 * `scripts/lib/load-ts.mjs`.
 */

/** Canonical payload keys, in form order. */
export const APPLICATION_FIELDS = [
  "storeName",
  "contactPerson",
  "phoneNumber",
  "businessType",
] as const;

type ApplicationField = (typeof APPLICATION_FIELDS)[number];

/** The four answers, as read from the request body. */
export type ApplicationFields = Partial<Record<ApplicationField, string>>;

/**
 * Accepted spellings, keyed by their lowercase alphanumeric form so camelCase,
 * snake_case and kebab-case collapse to one entry.
 */
const ALIASES: Record<string, ApplicationField> = {
  storename: "storeName",
  store: "storeName",
  shopname: "storeName",
  contactperson: "contactPerson",
  contactname: "contactPerson",
  contact: "contactPerson",
  phonenumber: "phoneNumber",
  phone: "phoneNumber",
  mobile: "phoneNumber",
  mobilenumber: "phoneNumber",
  businesstype: "businessType",
  business: "businessType",
  activity: "businessType",
};

function canonical(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Reads the four answers out of an arbitrary JSON body.
 *
 * Missing, non-string and blank values are omitted, so zod reports the missing
 * field by its canonical name. Values are trimmed but never truncated: a value
 * that is too long is a rejection, not a silent edit to what the applicant
 * wrote.
 */
export function readApplicationFields(raw: unknown): ApplicationFields {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};

  const fields: ApplicationFields = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const field = ALIASES[canonical(key)];
    if (!field || fields[field] !== undefined) continue;
    if (typeof value !== "string") continue;

    const trimmed = value.trim();
    if (trimmed.length > 0) fields[field] = trimmed;
  }

  return fields;
}
