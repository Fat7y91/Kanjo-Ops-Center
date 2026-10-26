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
const REFRESH_INTERVAL_MS = 5_000;

type SessionContextValue = {
  user: ActiveSession["user"] | null;
  permissions: ReadonlySet<Permission>;
  accessibleCities: string[];
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

  const permissions = useMemo(
    () => new Set<Permission>(session?.permissions ?? []),
    [session],
  );

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
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
      // Keep the last known capability set; the next poll will retry.
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(PERMISSION_CHANNEL);
      channel.onmessage = () => void refresh();
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      channel?.close();
    };
  }, [refresh]);

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
