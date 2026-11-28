/**
 * Domain errors for the profile, payout and capital surfaces.
 *
 * The API layer maps each one to its status so a rejected write keeps its own
 * message instead of collapsing into the generic 500. Codes mirror the SQL
 * exception names (`PAYOUT_SELF_REVIEW`, `CAPITAL_DEPOSIT_SELF_REVIEW`, ...) so
 * a trigger failure and an application failure read the same to a caller.
 */
export class ProfileError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ProfileError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Translates a Postgres / PostgREST error into a domain error.
 *
 * The SQL triggers raise with a machine code in the message
 * (`CAPITAL_DEPOSIT_CURRENCY_MISMATCH: ...`), so the prefix is what the caller
 * needs; the human sentence stays in the database where it belongs.
 */
export function fromDatabaseError(error: unknown): ProfileError | null {
  if (typeof error !== "object" || error === null) return null;

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";

  const marker = message.match(/^([A-Z_]+):\s*([\s\S]*)$/);
  if (marker) {
    return new ProfileError(marker[1], marker[2] || message, 409);
  }

  // A capability or rank refusal from RLS arrives as a permission error.
  if (code === "42501") {
    return new ProfileError(
      "FORBIDDEN",
      "لا تملك صلاحية تنفيذ هذه العملية.",
      403,
    );
  }
  if (code === "23505") {
    return new ProfileError(
      "CONFLICT",
      "توجد بيانات متعارضة تمنع الحفظ.",
      409,
    );
  }
  return null;
}
