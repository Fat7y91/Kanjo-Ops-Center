"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { usePermission } from "@/components/auth/use-permission";
import { PERMISSION_CHANNEL } from "@/components/providers/session-provider";
import { useUserMutations } from "@/components/admin/use-user-mutations";
import type {
  CityOption,
  LevelOption,
} from "@/components/admin/user-form-types";
import {
  canManageUser,
  clearanceLabel,
  mayGrantPermissions,
  type ClearanceActor,
} from "@/lib/rbac/hierarchy";
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
  // rank, so it is rendered as-is. The Hierarchy Security Rule makes every
  // assignable level strictly below the viewer's rank, so the dropdown can
  // never offer what `assertCanCreate` would reject.
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

  // The same hierarchy helpers the server guard uses, so the client cannot
  // disagree with `canManageUser` / `mayGrantPermissions` about who is
  // reachable. The actor is rebuilt from the live session, not the initial
  // props, so a revoke broadcast re-filters the roster immediately.
  const actor = useMemo<ClearanceActor>(
    () => ({
      id: viewerId,
      clearanceLevel: viewerLevel,
      permissions: [...permissions],
      accessibleCities,
      globalScope: viewerGlobalScope,
    }),
    [
      viewerId,
      viewerLevel,
      permissions,
      accessibleCities,
      viewerGlobalScope,
    ],
  );

  const withinViewer = useCallback(
    (user: AppUser) => canManageUser(actor, user),
    [actor],
  );

  const manageableUsers = useMemo(
    () => users.filter(withinViewer),
    [users, withinViewer],
  );

  const ensureChannel = useCallback((): BroadcastChannel | null => {
    if (typeof BroadcastChannel === "undefined") return null;
    if (!channelRef.current) {
      channelRef.current = new BroadcastChannel(PERMISSION_CHANNEL);
    }
    return channelRef.current;
  }, []);

  /**
   * Announces a write: peers listening on the permission channel re-read their
   * session, this tab re-reads the session, and the RSC payload is refreshed so
   * the server-rendered roster matches. Every mutation ends here.
   */
  const broadcastChange = useCallback(() => {
    ensureChannel()?.postMessage({ type: "permissions-changed" });
    void refresh();
    router.refresh();
  }, [ensureChannel, refresh, router]);

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
      broadcastChange();
    },
    [broadcastChange, withinViewer],
  );

  const dropUser = useCallback((userId: string) => {
    setUsers((current) => current.filter((item) => item.id !== userId));
  }, []);

  const { patchUser, toggle, revokeMany, changeLevel, removeUser } =
    useUserMutations({
      upsertUser,
      dropUser,
      broadcastChange,
      setPendingKey,
      setError,
    });

  const hasPermission = useCallback(
    (permission: Permission) => permissions.has(permission),
    [permissions],
  );

  /**
   * Whether the viewer may hand `permission` to `user`.
   *
   * Same `mayGrantPermissions` rule the PATCH guard applies: the top rank may
   * grant any catalogued capability (including one seeded after its own
   * backfill, and including to a lower account), every other rank stays inside
   * the subset it holds. The checkbox therefore cannot over-promise.
   */
  const canGrant = useCallback(
    (user: AppUser, permission: Permission): boolean =>
      withinViewer(user) && mayGrantPermissions(actor, [permission]),
    [actor, withinViewer],
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
    canGrant,
    withinViewer,
    toggle,
    revokeMany,
    changeLevel,
    removeUser,
    patchUser,
    /**
     * Pulls the authoritative roster after a create.
     *
     * Provisioning mints an auth account server-side, so the client cannot
     * assume the new row matches what it posted (grants, scope and id are
     * assigned there). A refresh re-reads the RSC payload instead of guessing.
     */
    reloadUsers: broadcastChange,
  };
}
