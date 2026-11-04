"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import type { Permission } from "@/lib/rbac/permissions";
import type { ActiveSession } from "@/lib/rbac/types";

const PERMISSION_CHANNEL = "kanjo-v2-permissions";

/**
 * Minimum gap between *automatic* capability refreshes (window focus, tab
 * becoming visible). The provider used to revalidate every 5 s per tab, which
 * cost a full session + RBAC read twelve times a minute to detect a signal that
 * changes a few times a day. Explicit `refresh()` calls and cross-tab
 * permission-change broadcasts bypass this floor.
 */
const MIN_AUTO_REFRESH_MS = 5 * 60 * 1_000;

type SessionContextValue = {
  user: ActiveSession["user"] | null;
  permissions: ReadonlySet<Permission>;
  accessibleCities: string[];
  clearanceLevel: number;
  globalScope: boolean;
  revision: number;
  pending: boolean;
  hasPermission: (permission: Permission) => boolean;
  hasAny: (permissions: readonly Permission[]) => boolean;
  hasAll: (permissions: readonly Permission[]) => boolean;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  initialSession,
  children,
}: {
  initialSession: ActiveSession | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [session, setSession] = useState<ActiveSession | null>(initialSession);
  const [pending, setPending] = useState(false);

  const sessionRef = useRef<ActiveSession | null>(initialSession);
  const inFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);

  const permissions = useMemo(
    () =>
      new Set<Permission>(
        Array.isArray(session?.permissions) ? session.permissions : [],
      ),
    [session],
  );

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    lastRefreshAtRef.current = Date.now();
    setPending(true);

    try {
      const response = await fetch("/api/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) return;

      const payload = (await response.json()) as {
        session: ActiveSession | null;
      };
      const next = payload.session;
      // Validate before storing: a malformed payload must not poison render
      // through `new Set(session.permissions)` or a missing `user`.
      if (next && (!Array.isArray(next.permissions) || !next.user)) return;
      const previous = sessionRef.current;

      sessionRef.current = next;
      setSession(next);

      if (
        previous?.revision !== next?.revision ||
        previous?.user.id !== next?.user.id
      ) {
        router.refresh();
      }
    } catch {
      // Keep the last known capability set; the next refresh will retry.
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  }, [router]);

  const refreshIfStale = useCallback(() => {
    if (Date.now() - lastRefreshAtRef.current < MIN_AUTO_REFRESH_MS) return;
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => refreshIfStale();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(PERMISSION_CHANNEL);
        // A message here means another tab changed a grant, so it is a
        // deliberate signal rather than a heartbeat: it bypasses the floor.
        channel.onmessage = () => void refresh();
      } catch {
        // Some hardened browsers expose the constructor but forbid channels.
        // Cross-tab refresh is a convenience, never a requirement.
        channel = null;
      }
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      channel?.close();
    };
  }, [refresh, refreshIfStale]);

  const hasPermission = useCallback(
    (permission: Permission) => permissions.has(permission),
    [permissions],
  );

  const hasAny = useCallback(
    (required: readonly Permission[]) =>
      required.some((permission) => permissions.has(permission)),
    [permissions],
  );

  const hasAll = useCallback(
    (required: readonly Permission[]) =>
      required.every((permission) => permissions.has(permission)),
    [permissions],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      user: session?.user ?? null,
      permissions,
      accessibleCities: session?.accessibleCities ?? [],
      clearanceLevel: session?.clearanceLevel ?? 0,
      globalScope: session?.globalScope ?? false,
      revision: session?.revision ?? 0,
      pending,
      hasPermission,
      hasAny,
      hasAll,
      refresh,
    }),
    [
      session,
      permissions,
      pending,
      hasPermission,
      hasAny,
      hasAll,
      refresh,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside <SessionProvider>.");
  }
  return value;
}

export { PERMISSION_CHANNEL };
