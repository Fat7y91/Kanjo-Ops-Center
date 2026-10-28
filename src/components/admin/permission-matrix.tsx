"use client";

import { Suspense } from "react";

import { CreateUserModal, ScopeModal } from "@/components/admin/permission-modals";
import { UserCard } from "@/components/admin/user-card";
import { usePermissionMatrix } from "@/components/admin/use-permission-matrix";
import { PERMISSION_GROUPS } from "@/lib/rbac/permissions";
import { clearanceTone } from "@/lib/rbac/hierarchy";
import type { AppUser } from "@/lib/rbac/types";
import type {
  CityOption,
  LevelOption,
} from "@/components/admin/user-form-types";

type PermissionMatrixProps = {
  initialUsers: AppUser[];
  initialRevision: number;
  viewerId: string;
  viewerLevel: number;
  viewerGlobalScope: boolean;
  assignableLevels: LevelOption[];
  assignableCities: CityOption[];
};

/**
 * Permission matrix shell.
 *
 * The user list is memoized per row (`UserCard`) and the dialogs are split out,
 * so toggling one capability re-renders a single card instead of every operator.
 */
export function PermissionMatrix(props: PermissionMatrixProps) {
  const matrix = usePermissionMatrix(props);

  if (!matrix.hasPermission("manage_permissions")) {
    return (
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">تغيّر الوصول</p>
            <h2>تم سحب إدارة الصلاحيات</h2>
          </div>
        </div>
        <p className="panel-note">
          لم تعد جلساتك تحمل <code>manage_permissions</code>. أزالت بوابة
          القدرات المصفوفة.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">مصفوفة حيّة</p>
          <h2>المستخدمون والقدرات</h2>
        </div>
        <div className="matrix-meta">
          <span className="badge badge-green">إصدار {matrix.revision}</span>
          <button
            type="button"
            className="button button-primary button-small"
            onClick={matrix.openCreate}
            disabled={matrix.levelOptions.length === 0}
          >
            إضافة مشغّل
          </button>
        </div>
      </div>

      <p className="panel-note">
        لا تظهر هنا إلا المشغّلون الأدنى من رتبتك والواقعون داخل نطاق مدنك.
        تعديل الرتبة أو المدن أو الصلاحيات يمر عبر حاجز الخادم قبل الحفظ.
      </p>

      <div className="clearance-legend">
        <span>رتبتك الحالية</span>
        <span className={`badge ${clearanceTone(props.viewerLevel)}`}>
          {matrix.levelLabel(props.viewerLevel)} · L{props.viewerLevel}
        </span>
        <span className="badge">
          أقصى رتبة قابلة للإسناد · L{matrix.maxAssignable}
        </span>
        <span className="badge">
          {props.viewerGlobalScope ? "نطاق عالمي" : "نطاق مدن محدود"}
        </span>
      </div>

      {matrix.error && (
        <p className="form-error" role="alert">
          {matrix.error}
        </p>
      )}

      <Suspense
        fallback={
          <p className="panel-note">جارٍ تحميل المشغّلين القابلين للإدارة…</p>
        }
      >
        <div className="matrix-list overflow-hidden">
          {matrix.manageableUsers.length === 0 && (
            <p className="panel-note">
              لا يوجد مشغّلون أدنى من رتبتك داخل نطاقك الحالي.
            </p>
          )}
          {matrix.manageableUsers.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              levelOptions={matrix.levelOptions}
              levelLabel={matrix.levelLabel}
              cityName={matrix.cityName}
              pendingKey={matrix.pendingKey}
              canGrant={matrix.canGrant}
              groups={PERMISSION_GROUPS}
              onToggle={(userId, permission, enabled) =>
                void matrix.toggle(userId, permission, enabled)
              }
              onLevelChange={(target, level) =>
                void matrix.changeLevel(target, level)
              }
              onOpenScope={matrix.openScope}
              onRemove={(target) => void matrix.removeUser(target)}
            />
          ))}
        </div>
      </Suspense>

      <CreateUserModal
        open={matrix.createOpen}
        form={matrix.createForm}
        levels={matrix.levelOptions}
        cities={props.assignableCities}
        viewerGlobalScope={props.viewerGlobalScope}
        saving={matrix.savingCreate}
        onFormChange={matrix.setCreateForm}
        onClose={() => matrix.setCreateOpen(false)}
        onSubmit={(event) => void matrix.submitCreate(event)}
      />

      <ScopeModal
        target={matrix.scopeTarget}
        cities={props.assignableCities}
        selected={matrix.scopeCities}
        saving={matrix.savingScope}
        onSelectionChange={matrix.setScopeCities}
        onClose={() => matrix.setScopeTarget(null)}
        onSave={() => void matrix.saveScope()}
      />
    </section>
  );
}

