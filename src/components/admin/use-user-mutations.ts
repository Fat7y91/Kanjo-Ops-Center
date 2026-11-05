"use client";

import { useCallback } from "react";

import type { Permission } from "@/lib/rbac/permissions";
import type { AppUser } from "@/lib/rbac/types";

type Args = {
  /** Replaces one roster row and re-reads the session + RSC payload. */
  upsertUser: (user: AppUser, nextRevision?: number) => void;
  /** Drops one roster row locally, without touching the server. */
  dropUser: (userId: string) => void;
  /** Broadcast + session refresh + RSC refresh, in that order. */
  broadcastChange: () => void;
  setPendingKey: (key: string | null) => void;
  setError: (message: string | null) => void;
};

/**
 * Remote mutations for the admin roster.
 *
 * Split from `use-user-capabilities.ts` (which owns the roster state and the
 * derived permission checks) so each hook keeps one responsibility: this one
 * only speaks to `/api/admin/users`, and reports success as a boolean so the
 * caller can decide whether to run a follow-up write.
 */
export function useUserMutations({
  upsertUser,
  dropUser,
  broadcastChange,
  setPendingKey,
  setError,
}: Args) {
  const patchUser = useCallback(
    async (
      key: string,
      userId: string,
      body: Record<string, unknown>,
    ): Promise<boolean> => {
      setPendingKey(key);
      setError(null);
      try {
        const response = await fetch(`/api/admin/users/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json()) as {
          user?: AppUser;
          revision?: number;
          error?: string;
        };
        if (!response.ok || !payload.user) {
          setError(payload.error ?? "تم رفض تحديث المشغّل.");
          return false;
        }
        upsertUser(payload.user, payload.revision);
        return true;
      } catch {
        setError("تعذر وصول التحديث إلى الخادم.");
        return false;
      } finally {
        setPendingKey(null);
      }
    },
    [setError, setPendingKey, upsertUser],
  );

  const toggle = useCallback(
    async (userId: string, permission: Permission, enabled: boolean) => {
      await patchUser(`${userId}:${permission}`, userId, {
        permission,
        enabled,
      });
    },
    [patchUser],
  );

  /**
   * Revokes several keys through the single-key PATCH path.
   *
   * A cascade (the overview master dropping its section grants) needs the
   * multi-key form, but the per-key route is the safest contract: it only
   * validates additions, so it works even when the target already holds a
   * capability the actor does not.
   */
  const revokeMany = useCallback(
    async (userId: string, permissions: readonly Permission[]) => {
      for (const permission of permissions) {
        await patchUser(`${userId}:${permission}`, userId, {
          permission,
          enabled: false,
        });
      }
    },
    [patchUser],
  );

  const changeLevel = useCallback(
    async (user: AppUser, level: number) => {
      await patchUser(`level:${user.id}`, user.id, { clearanceLevel: level });
    },
    [patchUser],
  );

  const removeUser = useCallback(
    async (user: AppUser) => {
      if (
        typeof window !== "undefined" &&
        !window.confirm(`حذف المشغّل ${user.name} نهائياً؟`)
      ) {
        return;
      }
      setPendingKey(`delete:${user.id}`);
      setError(null);
      try {
        const response = await fetch(`/api/admin/users/${user.id}`, {
          method: "DELETE",
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(payload.error ?? "تعذر حذف المشغّل.");
          return;
        }
        dropUser(user.id);
        broadcastChange();
      } catch {
        setError("تعذر حذف المشغّل.");
      } finally {
        setPendingKey(null);
      }
    },
    [broadcastChange, dropUser, setError, setPendingKey],
  );

  return { patchUser, toggle, revokeMany, changeLevel, removeUser };
}
