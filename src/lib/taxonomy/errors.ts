/**
 * Taxonomy domain error.
 *
 * Carries an HTTP status and a stable machine code so the API layer can map a
 * rejected catalog or request action without inspecting message text.
 */
export class TaxonomyError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "TaxonomyError";
    this.code = code;
    this.status = status;
  }
}
