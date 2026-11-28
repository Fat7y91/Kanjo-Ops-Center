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

/**
 * Failure while turning a resolved contract into PDF bytes.
 *
 * React-PDF raises bare `Error`/`TypeError`/promise rejections when a font or
 * embedded image cannot be decoded on the edge runtime. Those carry no HTTP
 * semantics, so the render path re-wraps them here to answer 500 with a
 * descriptive message while the original stack is kept in the server log.
 */
export class ContractRenderError extends Error {
  readonly code = "CONTRACT_RENDER_FAILED";
  readonly status = 500;

  constructor(message: string, readonly cause: unknown) {
    super(message);
    this.name = "ContractRenderError";
  }
}
