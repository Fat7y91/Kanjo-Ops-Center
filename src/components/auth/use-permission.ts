"use client";

import { useSession } from "@/components/providers/session-provider";
import type { Permission } from "@/lib/rbac/permissions";

/**
 * The only supported client-side capability API.
 *
 *   const { hasPermission } = usePermission();
 *   if (hasPermission("view_contracts")) { ... }
 */
export function usePermission() {
  const {
    hasPermission,
    hasAny,
    hasAll,
    permissions,
    accessibleCities,
    clearanceLevel,
    globalScope,
    user,
    revision,
    pending,
    refresh,
  } = useSession();

  return {
    hasPermission,
    hasAny,
    hasAll,
    permissions,
    accessibleCities,
    clearanceLevel,
    globalScope,
    user,
    revision,
    pending,
    refresh,
  };
}

export function useCan(permission: Permission): boolean {
  const { hasPermission } = usePermission();
  return hasPermission(permission);
}
