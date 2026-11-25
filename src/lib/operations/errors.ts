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
    // Adjustment guards are input rules, not a state conflict.
    const status = marker[1].startsWith("ADJUSTMENT_") ? 422 : 409;
    return new OperationsError(marker[1], marker[2] || message, status);
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
  if (code === "23502") {
    return new OperationsError(
      "VALIDATION",
      "بعض بيانات القيد المطلوبة غير مكتملة.",
      422,
    );
  }
  if (code === "22P02") {
    return new OperationsError(
      "INVALID_INPUT",
      "صيغة أحد الحقول غير صالحة.",
      422,
    );
  }
  if (code === "23503") {
    return new OperationsError(
      "MISSING_REFERENCE",
      "الحساب أو الطرف المرتبط بالقيد غير موجود.",
      422,
    );
  }
  if (code === "23514") {
    return new OperationsError(
      "VALIDATION",
      "القيد لا يستوفي شروط التسجيل.",
      422,
    );
  }
  if (code === "42883" || code === "42P01" || code === "PGRST202") {
    return new OperationsError(
      "FEATURE_UNAVAILABLE",
      "خدمة التسويات غير مهيأة على الخادم بعد. حاول لاحقاً.",
      503,
    );
  }
  return null;
}
