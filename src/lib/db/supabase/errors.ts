/**
 * PostgREST error triage shared by every Supabase repository.
 *
 * Kept beside the database client because the codes describe the PostgREST
 * schema cache rather than any single domain: a deployment whose code runs
 * ahead of its migrations must degrade gracefully instead of throwing inside
 * a Server Component or API route (which surfaced as HTTP 500s).
 */

/**
 * True when a read was cancelled by its own deadline.
 *
 * Edge requests that wait on a slow database get killed by the platform with a
 * CPU/wall-clock error the runtime cannot report as a 500. Callers use this to
 * distinguish "the database is busy" from a real defect, so the UI can offer a
 * retry instead of a generic failure.
 */
export function isQueryTimeout(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  const message = (error as { message?: unknown }).message;
  if (name === "AbortError" || name === "TimeoutError") return true;
  return typeof message === "string" && /AbortError|TimeoutError|timed out|aborted/i.test(message);
}

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

/**
 * True for a Postgres invalid-text-representation error (`22P02`).
 *
 * Reached when a caller passes a malformed path parameter (e.g. a contract
 * reference instead of a uuid) straight into a `uuid` column. It is a bad
 * request, not a server defect, so reads treat it as "not found" and the API
 * answers 404 instead of surfacing a raw 500.
 */
export function isInvalidTextRepresentation(error: unknown): boolean {
  return errorField(error, "code") === "22P02";
}

function errorField(error: unknown, key: "code" | "message" | "details"): string {
  if (typeof error !== "object" || error === null) return "";
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

/** True for a Postgres foreign-key violation (`23503`). */
export function isForeignKeyViolation(error: unknown): boolean {
  return errorField(error, "code") === "23503";
}

/** True for a Postgres check-constraint violation (`23514`). */
export function isCheckViolation(error: unknown): boolean {
  return errorField(error, "code") === "23514";
}

/**
 * True for a Postgres `55000` raised deliberately by a domain guard trigger.
 *
 * The contract register uses this for its terminal-state guard: the trigger
 * raises `CONTRACT_TERMINAL` when a signed or cancelled row is touched. It is a
 * concurrency outcome (another request already closed the row), not a server
 * defect, so callers map it to a conflict instead of a 500.
 */
export function isGuardViolation(error: unknown): boolean {
  if (errorField(error, "code") !== "55000") return false;
  return /CONTRACT_TERMINAL/i.test(
    `${errorField(error, "message")} ${errorField(error, "details")}`,
  );
}
