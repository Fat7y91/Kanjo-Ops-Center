/**
 * Provisioning errors.
 *
 * Kept apart from the service so the write helpers and the team resolver can
 * signal a provisioning failure without importing the orchestrator (which would
 * create a cycle).
 */
export class ProvisioningError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ProvisioningError";
    this.code = code;
    this.status = status;
  }
}
