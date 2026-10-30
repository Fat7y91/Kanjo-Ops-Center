import { cookies } from "next/headers";

import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/auth/session";
import type { ActiveSession } from "@/lib/rbac/types";
import { getRbacRevision, getUserById } from "@/lib/rbac/users";

export async function getServerSession(): Promise<ActiveSession | null> {
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
}

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
