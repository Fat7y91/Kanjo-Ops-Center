"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { usePermission } from "@/components/auth/use-permission";
import {
  PERMISSION_CHANNEL,
} from "@/components/providers/session-provider";
import {
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  type Permission,
} from "@/lib/rbac/permissions";
import type { AppUser } from "@/lib/rbac/types";

type PermissionMatrixProps = {
  initialUsers: AppUser[];
  initialRevision: number;
  viewerId: string;
};

export function PermissionMatrix({
  initialUsers,
  initialRevision,
  viewerId,
}: PermissionMatrixProps) {
  const router = useRouter();
  const { hasPermission, refresh } = usePermission();
  const [users, setUsers] = useState<AppUser[]>(initialUsers);
  const [revision, setRevision] = useState(initialRevision);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    channelRef.current = new BroadcastChannel(PERMISSION_CHANNEL);
    return () => channelRef.current?.close();
  }, []);

  if (!hasPermission("manage_permissions")) {
    return (
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Access changed</p>
            <h2>Permission management revoked</h2>
          </div>
        </div>
        <p className="panel-note">
          Your session no longer holds <code>manage_permissions</code>. The
          matrix has been removed by the capability gate.
        </p>
      </section>
    );
  }

  async function toggle(
    userId: string,
    permission: Permission,
    enabled: boolean,
  ) {
    const requestKey = `${userId}:${permission}`;
    setPendingKey(requestKey);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission, enabled }),
      });

      const payload = (await response.json()) as {
        user?: AppUser;
        revision?: number;
        error?: string;
      };

      if (!response.ok || !payload.user) {
        setError(payload.error ?? "The permission update was rejected.");
        return;
      }

      setUsers((current) =>
        current.map((user) =>
          user.id === payload.user?.id ? payload.user : user,
        ),
      );
      if (typeof payload.revision === "number") {
        setRevision(payload.revision);
      }

      channelRef.current?.postMessage({ type: "permissions-changed" });
      await refresh();
      router.refresh();
    } catch {
      setError("The permission update could not reach the server.");
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Live matrix</p>
          <h2>Users and capabilities</h2>
        </div>
        <div className="matrix-meta">
          <span className="badge badge-green">Revision {revision}</span>
          <span className="badge">Auto-sync 5s</span>
        </div>
      </div>

      <p className="panel-note">
        Every checkbox writes one capability to the server. No role is assigned
        or read. At least one active operator must retain{" "}
        <code>manage_permissions</code>.
      </p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="matrix-list">
        {users.map((user) => {
          const held = new Set(user.permissions);
          return (
            <article key={user.id} className="matrix-user">
              <header className="matrix-user-head">
                <span className="account-avatar account-avatar-small">
                  {user.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <div className="matrix-user-copy">
                  <div className="matrix-user-name">
                    <strong>{user.name}</strong>
                    {user.id === viewerId && (
                      <span className="badge badge-gold">You</span>
                    )}
                  </div>
                  <span>{user.title}</span>
                  <span className="account-email">{user.email}</span>
                </div>
                <span className="badge">
                  {held.size} / {PERMISSION_KEYS.length}
                </span>
              </header>

              <div className="matrix-groups">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.name} className="matrix-group">
                    <h3>{group.name}</h3>
                    <div className="matrix-perms">
                      {group.items.map((permission) => {
                        const key = permission.key as Permission;
                        const keyId = `${user.id}:${key}`;
                        return (
                          <label key={key} className="matrix-check">
                            <input
                              type="checkbox"
                              checked={held.has(key)}
                              disabled={pendingKey !== null}
                              onChange={(event) =>
                                void toggle(user.id, key, event.target.checked)
                              }
                            />
                            <span>
                              {permission.label}
                              {pendingKey === keyId && (
                                <em className="sync-mark">saving</em>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
