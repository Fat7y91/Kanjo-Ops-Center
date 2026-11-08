/**
 * Typed error raised by every contract write path.
 *
 * Kept in its own module so the repository, the write-error mapper and the API
 * error handler can all reference the type without a circular import.
 */
export class ContractRepositoryError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ContractRepositoryError";
    this.code = code;
    this.status = status;
  }
}
