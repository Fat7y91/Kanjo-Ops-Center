"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { usePermission } from "@/components/auth/use-permission";
import { PERMISSION_CHANNEL } from "@/components/providers/session-provider";
import type {
  CityOption,
  LevelOption,
} from "@/components/admin/user-form-types";
import { clearanceLabel, governsLevel } from "@/lib/rbac/hierarchy";
import type { Permission } from "@/lib/rbac/permissions";
import type { AppUser } from "@/lib/rbac/types";

type Args = {
  initialUsers: AppUser[];
  initialRevision: number;
  viewerId: string;
  viewerLevel: number;
  viewerGlobalScope: boolean;
  assignableLevels: LevelOption[];
  assignableCities: CityOption[];
};

/**
 * User list state + per-user remote mutations.
 *
 * All callbacks are identity-stable so the memoized `UserCard` rows only
 * re-render when their own user object changes.
 */
export function useUserCapabilities({
  initialUsers,
  initialRevision,
  viewerId,
  viewerLevel,
  viewerGlobalScope,
  assignableLevels,
  assignableCities,
}: Args) {
  const router = useRouter();
  const { permissions, accessibleCities, refresh } = usePermission();
  const [users, setUsers] = useState<AppUser[]>(initialUsers);
  const [revision, setRevision] = useState(initialRevision);
  const [seenRevision, setSeenRevision] = useState(initialRevision);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // A fresh RSC payload (router.refresh after a mutation) supersedes local
  // state, but only when the server revision actually advanced.
  useEffect(() => {
    if (initialRevision <= seenRevision) return;
    setUsers(initialUsers);
    setRevision(initialRevision);
    setSeenRevision(initialRevision);
  }, [initialRevision, initialUsers, seenRevision]);

  // The server has already resolved the assignable ladder from the actor's own
  // rank, so it is rendered as-is. Re-filtering here with `< viewerLevel` would
  // hide the executive's own tier and reintroduce the mismatch between what the
  // dropdown offers and what `assertCanCreate` accepts.
  const levelOptions = useMemo(
    () =>
      [...assignableLevels].sort((left, right) => right.level - left.level),
    [assignableLevels],
  );

  const levelLabel = useMemo(() => {
    const map = new Map(
      assignableLevels.map((level) => [level.level, level.label]),
    );
    return (level: number) => map.get(level) ?? clearanceLabel(level);
  }, [assignableLevels]);

  const cityName = useMemo(() => {
    const map = new Map(assignableCities.map((city) => [city.id, city.name]));
    return (cityId: string) => map.get(cityId) ?? cityId;
  }, [assignableCities]);

  const manageableUsers = useMemo(
    () => users.filter((user) => user.id !== viewerId),
    [users, viewerId],
  );


  // Mirrors `canGovernUser` on the server so a peer minted by an executive is
  // not dropped from the roster when a live permission event re-filters it.
  const withinViewer = useCallback(
    (user: AppUser): boolean => {
      if (
        !governsLevel(
          { clearanceLevel: viewerLevel, globalScope: viewerGlobalScope },
          user,
        )
      ) {
        return false;
      }
      if (viewerGlobalScope) return true;
      if (user.accessibleCities.length === 0) return true;
      return user.accessibleCities.some((cityId) =>
        accessibleCities.includes(cityId),
      );
    },
    [viewerLevel, viewerGlobalScope, accessibleCities],
  );

  const ensureChannel = useCallback((): BroadcastChannel | null => {
    if (typeof BroadcastChannel === "undefined") return null;
    if (!channelRef.current) {
      channelRef.current = new BroadcastChannel(PERMISSION_CHANNEL);
    }
    return channelRef.current;
  }, []);

  const upsertUser = useCallback(
    (user: AppUser, nextRevision?: number) => {
      setUsers((current) => {
        const next = current.map((candidate) =>
          candidate.id === user.id ? user : candidate,
        );
        return next.filter(
          (candidate) => candidate.id !== user.id || withinViewer(candidate),
        );
      });
      if (typeof nextRevision === "number") {
        setRevision(nextRevision);
        setSeenRevision(nextRevision);
      }
      ensureChannel()?.postMessage({ type: "permissions-changed" });
      void refresh();
      router.refresh();
    },
    [ensureChannel, refresh, router, withinViewer],
  );

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
    [upsertUser],
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
        setUsers((current) => current.filter((item) => item.id !== user.id));
        ensureChannel()?.postMessage({ type: "permissions-changed" });
        void refresh();
        router.refresh();
      } catch {
        setError("تعذر حذف المشغّل.");
      } finally {
        setPendingKey(null);
      }
    },
    [ensureChannel, refresh, router],
  );

  /**
   * Pulls the authoritative roster after a create.
   *
   * Provisioning mints an auth account server-side, so the client cannot assume
   * the new row matches what it posted (grants, scope and id are assigned
   * there). A refresh re-reads the RSC payload instead of guessing.
   */
  const reloadUsers = useCallback(() => {
    ensureChannel()?.postMessage({ type: "permissions-changed" });
    void refresh();
    router.refresh();
  }, [ensureChannel, refresh, router]);

  const hasPermission = useCallback(
    (permission: Permission) => permissions.has(permission),
    [permissions],
  );

  return {
    users,
    revision,
    hasPermission,
    pendingKey,
    error,
    setError,
    levelOptions,
    levelLabel,
    cityName,
    manageableUsers,
    canGrant: hasPermission,
    withinViewer,
    toggle,
    changeLevel,
    removeUser,
    patchUser,
    reloadUsers,
  };
}
