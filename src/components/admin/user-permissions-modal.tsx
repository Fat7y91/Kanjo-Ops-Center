"use client";

import { useMemo } from "react";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/form-inputs";
import {
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  type Permission,
} from "@/lib/rbac/permissions";
import type { AppUser } from "@/lib/rbac/types";

type UserPermissionsModalProps = {
  target: AppUser | null;
  pendingKey: string | null;
  /** Same self-grant rule as the server, so a checkbox cannot over-promise. */
  canGrant: (user: AppUser, permission: Permission) => boolean;
  onToggle: (userId: string, permission: Permission, enabled: boolean) => void;
  onClose: () => void;
};

/**
 * Full capability grid for a single operator.
 *
 * Every toggle commits immediately through the same PATCH route the matrix used
 * inline, so the dialog stays open while the card behind it re-renders with the
 * new grant count.
 */
export function UserPermissionsModal({
  target,
  pendingKey,
  canGrant,
  onToggle,
  onClose,
}: UserPermissionsModalProps) {
  const held = useMemo(
    () => new Set(target?.permissions ?? []),
    [target?.permissions],
  );
  const busy = pendingKey !== null;
  const grantable = (permission: Permission) =>
    target ? canGrant(target, permission) : false;

  return (
    <Modal
      open={target !== null}
      wide
      title={target ? `صلاحيات ${target.name}` : "الصلاحيات"}
      eyebrow="القدرات الدقيقة"
      description="فعّل ما يحتاجه المشغّل فقط؛ لا يمكنك منح صلاحية لا تملكها أنت."
      onClose={onClose}
    >
      <div className="matrix-groups matrix-groups-dialog">
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.name} className="matrix-group matrix-group-modal">
            <h3>{group.name}</h3>
            <div className="matrix-perms">
              {group.items.map((permission) => {
                const key = permission.key as Permission;
                const granted = held.has(key);
                const keyId = `${target?.id}:${key}`;
                return (
                  <CheckboxField
                    key={key}
                    label={
                      pendingKey === keyId ? (
                        <span>
                          {permission.label}
                          <em className="sync-mark">جارٍ الحفظ</em>
                        </span>
                      ) : (
                        permission.label
                      )
                    }
                    checked={granted}
                    disabled={busy || (!granted && !grantable(key))}
                    onChange={(checked) =>
                      target ? onToggle(target.id, key, checked) : undefined
                    }
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="form-actions matrix-dialog-actions">
        <span className="matrix-dialog-count">
          {held.size} من {PERMISSION_KEYS.length} صلاحية ممنوحة
        </span>
        <Button variant="primary" onClick={onClose}>
          تم
        </Button>
      </div>
    </Modal>
  );
}
