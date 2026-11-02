import { cookies } from "next/headers";
import { cache } from "react";

import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/auth/session";
import type { ActiveSession } from "@/lib/rbac/types";
import { getRbacRevision, getUserById } from "@/lib/rbac/users";

/**
 * Resolved once per request.
 *
 * A single page can ask for the session several times (the layout guard plus
 * each page guard, e.g. `requireMinClearance` then `requirePermission`). Each
 * call verifies the HMAC, reads the operator and loads the RBAC revision, so
 * without this memo the same request repeated the whole auth chain two or
 * three times — the CPU spike that timed out the edge worker on the finance
 * rates page.
 */
export const getServerSession = cache(async (): Promise<ActiveSession | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const user = await getUserById(payload.sub);
  if (!user || !user.active) return null;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      title: user.title,
      team: user.team,
    },
    permissions: [...user.permissions],
    accessibleCities: [...user.accessibleCities],
    clearanceLevel: user.clearanceLevel,
    globalScope: user.globalScope,
    revision: await getRbacRevision(),
  };
});

export async function writeSessionCookie(userId: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user || !user.active) {
    throw new Error("Cannot create a session for an inactive user.");
  }

  const token = await createSessionToken(
    user.id,
    user.permissions,
    await getRbacRevision(),
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions);
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
