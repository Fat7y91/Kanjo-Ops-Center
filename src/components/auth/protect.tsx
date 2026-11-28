"use client";

import type { ReactNode } from "react";

import { usePermission } from "@/components/auth/use-permission";
import type { Permission } from "@/lib/rbac/permissions";

type ProtectProps = {
  require: Permission | readonly Permission[];
  mode?: "all" | "any";
  fallback?: ReactNode;
  children: ReactNode;
};

/**
 * Universal capability gate. There is no role/title branch here by design.
 */
export function Protect({
  require: required,
  mode = "all",
  fallback = null,
  children,
}: ProtectProps) {
  const { hasPermission, hasAny, hasAll } = usePermission();

  const allowed =
    typeof required === "string"
      ? hasPermission(required)
      : mode === "any"
        ? hasAny(required)
        : hasAll(required);

  return <>{allowed ? children : fallback}</>;
}
