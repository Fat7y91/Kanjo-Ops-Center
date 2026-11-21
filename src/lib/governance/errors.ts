/**
 * Domain errors for the audit, notification, archive and lead surfaces.
 *
 * Codes mirror the SQL exception prefixes (`AUDIT_LOG_IMMUTABLE`, ...) so a
 * trigger refusal and an application refusal read the same to a caller.
 */
export class GovernanceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "GovernanceError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Translates a Postgres / PostgREST error into a domain error.
 *
 * The SQL triggers raise with a machine code in the message, so the prefix is
 * what the caller needs; the human sentence stays in the database.
 */
export function fromDatabaseError(error: unknown): GovernanceError | null {
  if (typeof error !== "object" || error === null) return null;

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";

  const marker = message.match(/^([A-Z_]+):\s*([\s\S]*)$/);
  if (marker) {
    return new GovernanceError(marker[1], marker[2] || message, 409);
  }

  if (code === "42501") {
    return new GovernanceError(
      "FORBIDDEN",
      "لا تملك صلاحية تنفيذ هذه العملية.",
      403,
    );
  }
  if (code === "23505") {
    return new GovernanceError(
      "CONFLICT",
      "توجد بيانات متعارضة تمنع الحفظ.",
      409,
    );
  }
  return null;
}
