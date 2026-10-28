"use client";

import { memo, useMemo } from "react";
import Link from "next/link";

import { PERMISSION_KEYS, type Permission } from "@/lib/rbac/permissions";
import { clearanceTone } from "@/lib/rbac/hierarchy";
import type { AppUser } from "@/lib/rbac/types";

type LevelOption = { level: number; label: string };

type UserCardProps = {
  user: AppUser;
  levelOptions: LevelOption[];
  levelLabel: (level: number) => string;
  cityName: (cityId: string) => string;
  pendingKey: string | null;
  canGrant: (permission: Permission) => boolean;
  groups: readonly {
    name: string;
    items: readonly { key: string; label: string }[];
  }[];
  onToggle: (userId: string, permission: Permission, enabled: boolean) => void;
  onLevelChange: (user: AppUser, level: number) => void;
  onOpenScope: (user: AppUser) => void;
  onRemove: (user: AppUser) => void;
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2);
}

/**
 * One user's capability grid.
 *
 * Memoized on the user object plus the identity-stable callbacks from the
 * matrix hook: editing one user's permissions re-renders only that card instead
 * of every row in the list.
 */
function UserCardBase({
  user,
  levelOptions,
  levelLabel,
  cityName,
  pendingKey,
  canGrant,
  groups,
  onToggle,
  onLevelChange,
  onOpenScope,
  onRemove,
}: UserCardProps) {
  const held = useMemo(() => new Set(user.permissions), [user.permissions]);
  const scope = useMemo(
    () =>
      user.accessibleCities.length === 0
        ? "بدون نطاق مدن"
        : user.accessibleCities.map((cityId) => cityName(cityId)).join(" · "),
    [user.accessibleCities, cityName],
  );
  const busy = pendingKey !== null;

  return (
    <article className="matrix-user">
      <header className="matrix-user-head">
        <span className="account-avatar account-avatar-small">
          {initials(user.name)}
        </span>
        <div className="matrix-user-copy">
          <div className="matrix-user-name">
            <Link
              className="matrix-user-link"
              href={`/admin/users/${user.id}`}
            >
              {user.name}
            </Link>
            <span className={`badge ${clearanceTone(user.clearanceLevel)}`}>
              {levelLabel(user.clearanceLevel)} · L{user.clearanceLevel}
            </span>
          </div>
          <span>{user.title}</span>
          <span className="account-email">{user.email}</span>
          <span className="matrix-scope">{scope}</span>
        </div>
        <div className="matrix-user-actions">
          <select
            className="matrix-level-select"
            value={user.clearanceLevel}
            disabled={busy}
            onChange={(event) =>
              onLevelChange(user, Number(event.target.value))
            }
            aria-label={`رتبة ${user.name}`}
          >
            {levelOptions.map((level) => (
              <option key={level.level} value={level.level}>
                {level.label} · L{level.level}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button button-quiet button-small"
            onClick={() => onOpenScope(user)}
            disabled={busy}
          >
            النطاق
          </button>
          <button
            type="button"
            className="button button-danger button-small"
            onClick={() => onRemove(user)}
            disabled={busy}
          >
            حذف
          </button>
          <span className="badge">
            {held.size} / {PERMISSION_KEYS.length}
          </span>
        </div>
      </header>

      <div className="matrix-groups grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
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
                      disabled={busy || (!held.has(key) && !canGrant(key))}
                      title={
                        canGrant(key)
                          ? undefined
                          : "لا يمكنك منح صلاحية لا تملكها."
                      }
                      onChange={(event) =>
                        onToggle(user.id, key, event.target.checked)
                      }
                    />
                    <span>
                      {permission.label}
                      {pendingKey === keyId && (
                        <em className="sync-mark">جارٍ الحفظ</em>
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
}

export const UserCard = memo(UserCardBase);
