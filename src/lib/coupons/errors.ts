/**
 * Domain errors for the coupon module. Codes are stable identifiers so the
 * client can branch without parsing text.
 */
export class CouponsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "CouponsError";
    this.code = code;
    this.status = status;
  }
}
