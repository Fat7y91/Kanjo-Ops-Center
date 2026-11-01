/**
 * PostgREST error triage shared by every Supabase repository.
 *
 * Kept beside the database client because the codes describe the PostgREST
 * schema cache rather than any single domain: a deployment whose code runs
 * ahead of its migrations must degrade gracefully instead of throwing inside
 * a Server Component or API route (which surfaced as HTTP 500s).
 */

/**
 * True when PostgREST reports that a column, table or function is absent.
 *
 * `42703` is an undefined column, `42P01` an undefined table, `PGRST202` /
 * `PGRST204` mean the schema cache has not picked up a newly added object
 * yet, and `PGRST205` is PostgREST's "table not found in the schema cache".
 * All are deployment-ordering problems, not data corruption, so reads degrade
 * instead of throwing.
 */
export function isMissingSchemaObject(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return (
    code === "42703" ||
    code === "42P01" ||
    code === "PGRST202" ||
    code === "PGRST204" ||
    code === "PGRST205"
  );
}

/** True for a Postgres unique-violation (`23505`), e.g. a partial unique index. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}
