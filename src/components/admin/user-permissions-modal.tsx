"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/form-inputs";
import {
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  type Permission,
} from "@/lib/rbac/permissions";
import { cascadeRevoke } from "@/lib/rbac/permission-tree";
import type { AppUser } from "@/lib/rbac/types";

type UserPermissionsModalProps = {
  target: AppUser | null;
  /** Same self-grant rule as the server, so a checkbox cannot over-promise. */
  canGrant: (user: AppUser, permission: Permission) => boolean;
  /**
   * Replaces the user's whole capability set in one request. Resolves `true`
   * only when the server stored it, which is the signal to close the dialog.
   */
  onSave: (userId: string, permissions: Permission[]) => Promise<boolean>;
  onClose: () => void;
};

/**
 * Full capability grid for a single operator.
 *
 * Edits are buffered in local state: toggling a checkbox only updates the draft,
 * so assigning or revoking many capabilities costs no network round trip and
 * cannot race the server. The single Save button submits the final desired set
 * once, and the dialog closes only after that write succeeds.
 *
 * Parent capabilities (`view_overview`) group the `view_overview_*` sections.
 * Revoking the parent also drops its held sections in the draft, so no orphaned
 * section grant can be submitted; granting any section on its own stays allowed
 * because each also opens the overview module.
 */
export function UserPermissionsModal({
  target,
  canGrant,
  onSave,
  onClose,
}: UserPermissionsModalProps) {
  const targetId = target?.id ?? null;

  // Snapshot of what the server had when the dialog opened, and the buffered
  // edit. Both reset together when a different operator is opened. We key on
  // the id (not the permissions array) so a background roster refresh cannot
  // clobber edits the operator is still making.
  const [initial, setInitial] = useState<Set<Permission>>(
    () => new Set(target?.permissions ?? []),
  );
  const [draft, setDraft] = useState<Set<Permission>>(
    () => new Set(target?.permissions ?? []),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!targetId) return;
    const held = new Set(target?.permissions ?? []);
    setInitial(held);
    setDraft(new Set(held));
    setError("");
  }, [targetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const grantable = (permission: Permission) =>
    target ? canGrant(target, permission) : false;

  const dirty =
    draft.size !== initial.size ||
    [...draft].some((permission) => !initial.has(permission));

  function change(permission: Permission, checked: boolean) {
    setDraft((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(permission);
        return next;
      }
      next.delete(permission);
      for (const child of cascadeRevoke([...current], permission) ?? []) {
        next.delete(child);
      }
      return next;
    });
  }

  async function save() {
    if (!target || saving) return;
    if (!dirty) {
      onClose();
      return;
    }
    setSaving(true);
    setError("");
    const ok = await onSave(target.id, [...draft]);
    setSaving(false);
    if (ok) onClose();
    else setError("تعذر حفظ الصلاحيات. أعد المحاولة.");
  }

  return (
    <Modal
      open={target !== null}
      wide
      title={target ? `صلاحيات ${target.name}` : "الصلاحيات"}
      eyebrow="القدرات الدقيقة"
      description="فعّل ما يحتاجه المشغّل فقط؛ لا يمكنك منح صلاحية لا تملكها أنت."
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <div className="matrix-groups matrix-groups-dialog">
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.name} className="matrix-group matrix-group-modal">
            <h3>{group.name}</h3>
            <div className="matrix-perms">
              {group.items.map((permission) => {
                const key = permission.key as Permission;
                const granted = draft.has(key);
                return (
                  <CheckboxField
                    key={key}
                    label={permission.label}
                    checked={granted}
                    disabled={saving || (!granted && !grantable(key))}
                    onChange={(checked) => change(key, checked)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="form-actions matrix-dialog-actions">
        <span className="matrix-dialog-count">
          {draft.size} من {PERMISSION_KEYS.length} صلاحية ممنوحة
          {dirty ? " · تغييرات غير محفوظة" : ""}
        </span>
        <Button
          variant="primary"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? "جارٍ الحفظ…" : "حفظ"}
        </Button>
      </div>
    </Modal>
  );
}
