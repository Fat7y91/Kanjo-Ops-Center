import { cookies } from "next/headers";
import { cache } from "react";

import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/auth/session";
import type { ActiveSession } from "@/lib/rbac/types";
import { getSessionSnapshot } from "@/lib/rbac/users";

/**
 * Resolved once per request.
 *
 * A single page can ask for the session several times (the layout guard plus
 * each page guard, e.g. `requireMinClearance` then `requirePermission`). Each
 * call verifies the HMAC and resolves the operator, so without this memo the
 * same request repeated the whole auth chain two or three times — the CPU spike
 * that timed out the edge worker on the finance rates page.
 *
 * The resolution itself is one read: `getSessionSnapshot()` returns the profile
 * and the revision together, and the cookie is verified from the payload alone.
 */
export const getServerSession = cache(resolveSession);

/**
 * Verify the cookie and resolve the operator it names. `null` when the session
 * is absent, forged, or belongs to an operator who is no longer active.
 */
async function resolveSession(): Promise<ActiveSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const snapshot = await getSessionSnapshot(payload.sub);
  if (!snapshot || !snapshot.user.active) return null;

  const { user, revision } = snapshot;
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
    revision,
  };
}

export async function writeSessionCookie(userId: string): Promise<void> {
  const snapshot = await getSessionSnapshot(userId);
  if (!snapshot || !snapshot.user.active) {
    throw new Error("Cannot create a session for an inactive user.");
  }

  const token = await createSessionToken(
    snapshot.user.id,
    snapshot.user.permissions,
    snapshot.revision,
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions);
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
