"use server";

import { resolveLoginRequest, type LoginOutcome } from "@/lib/auth/login";
import { clearSessionCookie } from "@/lib/auth/server-session";

/**
 * @deprecated Login and logout are Route Handlers now:
 * `POST /api/auth/login` and `POST /api/auth/logout`.
 *
 * These Server Action wrappers are kept only so stale imports do not break the
 * build. They intentionally never call `redirect()`: on `next-on-pages` an Edge
 * Server Action redirect throws `Invariant: Missing initURL` (HTTP 500).
 * Callers must use the returned path to navigate themselves.
 */
export async function loginAction(formData: FormData): Promise<LoginOutcome> {
  return resolveLoginRequest(formData);
}

export async function logoutAction(): Promise<{ redirectTo: string }> {
  await clearSessionCookie();
  return { redirectTo: "/login" };
}
