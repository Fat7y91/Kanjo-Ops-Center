"use client";

import { memo, useMemo } from "react";
import Link from "next/link";

import { clearanceTone } from "@/lib/rbac/hierarchy";
import { PERMISSION_KEYS } from "@/lib/rbac/permissions";
import type { AppUser } from "@/lib/rbac/types";

type Group = {
  name: string;
  items: readonly { key: string; label: string }[];
};

type UserDetailProps = {
  user: AppUser;
  groups: Group[];
};

/**
 * Read-only capability summary for a single operator.
 *
 * Heavy derivation (held-set + per-group counts) is memoized so the detail page
 * stays cheap to render while the RSC payload streams.
 */
function UserDetailBase({ user, groups }: UserDetailProps) {
  const held = useMemo(() => new Set(user.permissions), [user.permissions]);
  const counts = useMemo(
    () =>
      groups.map((group) => ({
        name: group.name,
        held: group.items.filter((item) => held.has(item.key as never)).length,
        total: group.items.length,
      })),
    [groups, held],
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">القدرات</p>
          <h2>مصفوفة الصلاحيات</h2>
        </div>
        <div className="matrix-meta">
          <span className="badge">
            {held.size} / {PERMISSION_KEYS.length}
          </span>
          <Link className="button button-quiet button-small" href="/admin/permissions">
            رجوع للمصفوفة
          </Link>
        </div>
      </div>

      <div className="matrix-user-copy matrix-user-summary">
        <div className="matrix-user-name">
          <strong>{user.name}</strong>
          <span className={`badge ${clearanceTone(user.clearanceLevel)}`}>
            {user.title}
          </span>
        </div>
        <span className="account-email">{user.email}</span>
        <span>{user.team}</span>
      </div>

      <div className="matrix-groups grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {groups.map((group, index) => (
          <div key={group.name} className="matrix-group">
            <h3>
              {group.name}
              <span className="badge">
                {counts[index].held} / {counts[index].total}
              </span>
            </h3>
            <div className="matrix-perms">
              {group.items.map((permission) => (
                <label key={permission.key} className="matrix-check">
                  <input
                    type="checkbox"
                    checked={held.has(permission.key as never)}
                    readOnly
                    disabled
                  />
                  <span>{permission.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export const UserDetail = memo(UserDetailBase);
