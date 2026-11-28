/**
 * Typed error for the journal drill-down.
 *
 * Mirrors the other domain errors so the API can map a not-found entry to a 404
 * without a bespoke catch in the route.
 */
export class JournalError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "JournalError";
    this.code = code;
    this.status = status;
  }
}
