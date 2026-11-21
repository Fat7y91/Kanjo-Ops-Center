/**
 * Domain errors for the operations logger and clearinghouse.
 *
 * Codes mirror the SQL exception prefixes (`OPERATION_IMMUTABLE`,
 * `CLEARING_LEDGER_CLEARED`, ...) so a trigger refusal and an application
 * refusal read the same to a caller.
 */
export class OperationsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "OperationsError";
    this.code = code;
    this.status = status;
  }
}

export function fromDatabaseError(error: unknown): OperationsError | null {
  if (typeof error !== "object" || error === null) return null;

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";

  const marker = message.match(/^([A-Z_]+):\s*([\s\S]*)$/);
  if (marker) {
    return new OperationsError(marker[1], marker[2] || message, 409);
  }

  if (code === "42501") {
    return new OperationsError(
      "FORBIDDEN",
      "لا تملك صلاحية تنفيذ هذه العملية.",
      403,
    );
  }
  if (code === "23505") {
    return new OperationsError(
      "CONFLICT",
      "رقم الطلب مسجّل بالفعل.",
      409,
    );
  }
  return null;
}
