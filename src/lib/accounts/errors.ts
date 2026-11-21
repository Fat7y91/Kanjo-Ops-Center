/**
 * Typed treasury error shared by the store and its Tier 4 repository.
 *
 * Lives in its own module so the repository can raise the same codes the API
 * maps, without importing the store back into the repository.
 */
export class AccountsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AccountsError";
    this.code = code;
    this.status = status;
  }
}
