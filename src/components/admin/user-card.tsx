"use client";

import { memo } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menus";
import { PERMISSION_KEYS } from "@/lib/rbac/permissions";
import { clearanceTone } from "@/lib/rbac/hierarchy";
import type { AppUser } from "@/lib/rbac/types";

type LevelOption = { level: number; label: string };

type UserCardProps = {
  user: AppUser;
  /** Own row: grants stay open, rank change and deletion stay forbidden. */
  isSelf: boolean;
  levelOptions: LevelOption[];
  levelLabel: (level: number) => string;
  cityName: (cityId: string) => string;
  pendingKey: string | null;
  onLevelChange: (user: AppUser, level: number) => void;
  onOpenPermissions: (user: AppUser) => void;
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
 * One operator as a compact roster card.
 *
 * The 97-capability grid lives in `UserPermissionsModal`, so the list stays
 * scannable and a card only re-renders when its own user object changes.
 */
function UserCardBase({
  user,
  isSelf,
  levelOptions,
  levelLabel,
  cityName,
  pendingKey,
  onLevelChange,
  onOpenPermissions,
  onOpenScope,
  onRemove,
}: UserCardProps) {
  const held = user.permissions.length;
  const total = PERMISSION_KEYS.length;
  const percent = total === 0 ? 0 : Math.round((held / total) * 100);
  const scope =
    user.accessibleCities.length === 0
      ? "بدون نطاق مدن"
      : user.accessibleCities.map((cityId) => cityName(cityId)).join(" · ");
  const busy = pendingKey !== null;
  const saving =
    pendingKey === `permissions:${user.id}` ||
    pendingKey?.startsWith(`level:${user.id}`) ||
    pendingKey?.startsWith(`scope:${user.id}`) ||
    false;

  return (
    <article className="matrix-card">
      <header className="matrix-card-head">
        <span className="account-avatar account-avatar-small">
          {initials(user.name)}
        </span>
        <div className="matrix-card-copy">
          <Link className="matrix-user-link" href={`/admin/users/${user.id}`}>
            {user.name}
          </Link>
          <span className="matrix-card-role">{user.title}</span>
        </div>
        {isSelf && <span className="badge badge-gold">حسابك</span>}
        <span className={`badge ${clearanceTone(user.clearanceLevel)}`}>
          L{user.clearanceLevel}
        </span>
      </header>

      <dl className="matrix-card-facts">
        <div>
          <dt>الرتبة</dt>
          <dd>{levelLabel(user.clearanceLevel)}</dd>
        </div>
        <div>
          <dt>الدخول</dt>
          <dd className="account-email" dir="ltr">
            {user.email}
          </dd>
        </div>
        <div>
          <dt>النطاق</dt>
          <dd className="matrix-scope">{scope}</dd>
        </div>
      </dl>

      <div className="matrix-card-grants">
        <span>
          <strong>{held}</strong> / {total} صلاحية
        </span>
        <span className="matrix-card-bar" aria-hidden="true">
          <span style={{ width: `${percent}%` }} />
        </span>
      </div>

      <footer className="matrix-card-actions">
        <Button
          size="sm"
          variant="primary"
          onClick={() => onOpenPermissions(user)}
          disabled={busy}
        >
          الصلاحيات
        </Button>
        {isSelf ? (
          <span className="matrix-card-self" title="لا يمكنك تغيير رتبتك">
            رتبتك ثابتة
          </span>
        ) : (
          <SelectMenu
            value={user.clearanceLevel}
            onChange={(level) => onLevelChange(user, level)}
            options={levelOptions.map((option) => ({
              value: option.level,
              label: option.label,
            }))}
            disabled={busy}
            ariaLabel={`رتبة ${user.name}`}
            className="matrix-level-select"
          />
        )}
        <Button
          size="sm"
          variant="quiet"
          onClick={() => onOpenScope(user)}
          disabled={busy}
        >
          النطاق
        </Button>
        {!isSelf && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => onRemove(user)}
            disabled={busy}
          >
            حذف
          </Button>
        )}
      </footer>

      {saving && <p className="matrix-card-sync">جارٍ الحفظ…</p>}
    </article>
  );
}

export const UserCard = memo(UserCardBase);
