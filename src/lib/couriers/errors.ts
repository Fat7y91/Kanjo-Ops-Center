/**
 * Domain errors for the couriers surface and the operations KPI report.
 * Codes are stable identifiers so the client can branch without parsing text.
 */
export class CouriersError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "CouriersError";
    this.code = code;
    this.status = status;
  }
}
