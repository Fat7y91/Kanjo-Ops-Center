"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { usePermission } from "@/components/auth/use-permission";
import { Modal } from "@/components/field-ops/modal";
import { PERMISSION_CHANNEL } from "@/components/providers/session-provider";
import {
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  type Permission,
} from "@/lib/rbac/permissions";
import { clearanceLabel, clearanceTone } from "@/lib/rbac/hierarchy";
import type { AppUser } from "@/lib/rbac/types";

type LevelOption = { level: number; label: string };
type CityOption = { id: string; name: string };

type PermissionMatrixProps = {
  initialUsers: AppUser[];
  initialRevision: number;
  viewerId: string;
  viewerLevel: number;
  viewerGlobalScope: boolean;
  assignableLevels: LevelOption[];
  assignableCities: CityOption[];
};

type CreateForm = {
  name: string;
  email: string;
  title: string;
  team: string;
  clearanceLevel: string;
  cityIds: string[];
};

function emptyForm(levels: LevelOption[], cities: CityOption[]): CreateForm {
  return {
    name: "",
    email: "",
    title: "",
    team: "Fox Team",
    clearanceLevel: String(levels[levels.length - 1]?.level ?? 1),
    cityIds: cities.length === 1 ? [cities[0].id] : [],
  };
}

export function PermissionMatrix({
  initialUsers,
  initialRevision,
  viewerId,
  viewerLevel,
  viewerGlobalScope,
  assignableLevels,
  assignableCities,
}: PermissionMatrixProps) {
  const router = useRouter();
  const { hasPermission, permissions, accessibleCities, refresh } =
    usePermission();
  const [users, setUsers] = useState<AppUser[]>(initialUsers);
  const [revision, setRevision] = useState(initialRevision);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seenRevision, setSeenRevision] = useState(initialRevision);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(() =>
    emptyForm(assignableLevels, assignableCities),
  );
  const [savingCreate, setSavingCreate] = useState(false);
  const [scopeTarget, setScopeTarget] = useState<AppUser | null>(null);
  const [scopeCities, setScopeCities] = useState<string[]>([]);
  const [savingScope, setSavingScope] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (initialRevision <= seenRevision) return;
    setUsers(initialUsers);
    setRevision(initialRevision);
    setSeenRevision(initialRevision);
  }, [initialRevision, initialUsers, seenRevision]);

  const levelOptions = useMemo(
    () =>
      assignableLevels
        .filter((level) => level.level < viewerLevel)
        .sort((left, right) => right.level - left.level),
    [assignableLevels, viewerLevel],
  );

  const levelLabel = useMemo(() => {
    const map = new Map(assignableLevels.map((level) => [level.level, level.label]));
    return (level: number) => map.get(level) ?? clearanceLabel(level);
  }, [assignableLevels]);

  const cityName = useMemo(() => {
    const map = new Map(assignableCities.map((city) => [city.id, city.name]));
    return (cityId: string) => map.get(cityId) ?? cityId;
  }, [assignableCities]);

  const manageableUsers = useMemo(
    () => users.filter((user) => user.id !== viewerId),
    [users, viewerId],
  );

  const maxAssignable = Math.max(0, viewerLevel - 1);

  if (!hasPermission("manage_permissions")) {
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

  const canGrant = (permission: Permission) => permissions.has(permission);

  function ensureChannel(): BroadcastChannel | null {
    if (typeof BroadcastChannel === "undefined") return null;
    if (!channelRef.current) {
      channelRef.current = new BroadcastChannel(PERMISSION_CHANNEL);
    }
    return channelRef.current;
  }

  function withinViewer(user: AppUser): boolean {
    if (viewerLevel <= user.clearanceLevel) return false;
    if (viewerGlobalScope) return true;
    if (user.accessibleCities.length === 0) return true;
    return user.accessibleCities.some((cityId) =>
      accessibleCities.includes(cityId),
    );
  }

  function applyUser(user: AppUser, nextRevision?: number) {
    setUsers((current) => {
      const next = current.map((candidate) =>
        candidate.id === user.id ? user : candidate,
      );
      return next.filter(
        (candidate) =>
          candidate.id !== user.id || withinViewer(candidate),
      );
    });
    if (typeof nextRevision === "number") {
      setRevision(nextRevision);
      setSeenRevision(nextRevision);
    }
    ensureChannel()?.postMessage({ type: "permissions-changed" });
    void refresh();
    router.refresh();
  }

  async function patchUser(
    key: string,
    userId: string,
    body: Record<string, unknown>,
    success?: string,
  ) {
    setPendingKey(key);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        user?: AppUser;
        revision?: number;
        error?: string;
      };
      if (!response.ok || !payload.user) {
        setError(payload.error ?? "تم رفض تحديث المشغّل.");
        return false;
      }
      applyUser(payload.user, payload.revision);
      if (success) setError(null);
      return true;
    } catch {
      setError("تعذر وصول التحديث إلى الخادم.");
      return false;
    } finally {
      setPendingKey(null);
    }
  }

  async function toggle(
    userId: string,
    permission: Permission,
    enabled: boolean,
  ) {
    const requestKey = `${userId}:${permission}`;
    await patchUser(requestKey, userId, { permission, enabled });
  }

  async function changeLevel(user: AppUser, level: number) {
    await patchUser(`level:${user.id}`, user.id, { clearanceLevel: level });
  }

  async function removeUser(user: AppUser) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`حذف المشغّل ${user.name} نهائياً؟`)
    ) {
      return;
    }
    setPendingKey(`delete:${user.id}`);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "تعذر حذف المشغّل.");
        return;
      }
      setUsers((current) => current.filter((item) => item.id !== user.id));
      ensureChannel()?.postMessage({ type: "permissions-changed" });
      void refresh();
      router.refresh();
    } catch {
      setError("تعذر حذف المشغّل.");
    } finally {
      setPendingKey(null);
    }
  }

  function openScope(user: AppUser) {
    setScopeTarget(user);
    setScopeCities(
      user.accessibleCities.filter((cityId) =>
        assignableCities.some((city) => city.id === cityId),
      ),
    );
    setError(null);
  }

  async function saveScope() {
    if (!scopeTarget) return;
    setSavingScope(true);
    const ok = await patchUser(
      `scope:${scopeTarget.id}`,
      scopeTarget.id,
      { accessibleCities: scopeCities },
    );
    setSavingScope(false);
    if (ok) setScopeTarget(null);
  }

  async function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCreate(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name,
          email: createForm.email,
          title: createForm.title,
          team: createForm.team,
          clearanceLevel: Number(createForm.clearanceLevel),
          accessibleCities: createForm.cityIds,
          permissions: [],
        }),
      });
      const payload = (await response.json()) as {
        user?: AppUser;
        revision?: number;
        error?: string;
      };
      if (!response.ok || !payload.user) {
        setError(payload.error ?? "تعذر إنشاء المشغّل.");
        return;
      }
      const created = payload.user as AppUser;
      setUsers((current) =>
        withinViewer(created) ? [...current, created] : current,
      );
      if (typeof payload.revision === "number") {
        setRevision(payload.revision);
        setSeenRevision(payload.revision);
      }
      setCreateOpen(false);
      setCreateForm(emptyForm(assignableLevels, assignableCities));
      ensureChannel()?.postMessage({ type: "permissions-changed" });
      void refresh();
      router.refresh();
    } catch {
      setError("تعذر إنشاء المشغّل.");
    } finally {
      setSavingCreate(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">مصفوفة حيّة</p>
          <h2>المستخدمون والقدرات</h2>
        </div>
        <div className="matrix-meta">
          <span className="badge badge-green">إصدار {revision}</span>
          <button
            type="button"
            className="button button-primary button-small"
            onClick={() => {
              setCreateForm(emptyForm(assignableLevels, assignableCities));
              setError(null);
              setCreateOpen(true);
            }}
            disabled={levelOptions.length === 0}
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
        <span className={`badge ${clearanceTone(viewerLevel)}`}>
          {levelLabel(viewerLevel)} · L{viewerLevel}
        </span>
        <span className="badge">
          أقصى رتبة قابلة للإسناد · L{maxAssignable}
        </span>
        <span className="badge">
          {viewerGlobalScope ? "نطاق عالمي" : "نطاق مدن محدود"}
        </span>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="matrix-list overflow-hidden">
        {manageableUsers.length === 0 && (
          <p className="panel-note">
            لا يوجد مشغّلون أدنى من رتبتك داخل نطاقك الحالي.
          </p>
        )}
        {manageableUsers.map((user) => {
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
                    <span className={`badge ${clearanceTone(user.clearanceLevel)}`}>
                      {levelLabel(user.clearanceLevel)} · L{user.clearanceLevel}
                    </span>
                  </div>
                  <span>{user.title}</span>
                  <span className="account-email">{user.email}</span>
                  <span className="matrix-scope">
                    {user.accessibleCities.length === 0
                      ? "بدون نطاق مدن"
                      : user.accessibleCities
                          .map((cityId) => cityName(cityId))
                          .join(" · ")}
                  </span>
                </div>
                <div className="matrix-user-actions">
                  <select
                    className="matrix-level-select"
                    value={user.clearanceLevel}
                    disabled={pendingKey !== null}
                    onChange={(event) =>
                      void changeLevel(user, Number(event.target.value))
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
                    onClick={() => openScope(user)}
                    disabled={pendingKey !== null}
                  >
                    النطاق
                  </button>
                  <button
                    type="button"
                    className="button button-danger button-small"
                    onClick={() => void removeUser(user)}
                    disabled={pendingKey !== null}
                  >
                    حذف
                  </button>
                  <span className="badge">
                    {held.size} / {PERMISSION_KEYS.length}
                  </span>
                </div>
              </header>

              <div className="matrix-groups grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
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
                              disabled={
                                pendingKey !== null ||
                                (!held.has(key) && !canGrant(key))
                              }
                              title={
                                canGrant(key)
                                  ? undefined
                                  : "لا يمكنك منح صلاحية لا تملكها."
                              }
                              onChange={(event) =>
                                void toggle(user.id, key, event.target.checked)
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
        })}
      </div>

      <Modal
        open={createOpen}
        title="إضافة مشغّل جديد"
        eyebrow="حوكمة الرتب"
        description="لا يمكن إنشاء مشغّل برتبة تعادل رتبتك أو تتجاوزها، ولا خارج نطاق مدنك."
        onClose={() => setCreateOpen(false)}
        wide
      >
        <form className="form-stack" onSubmit={submitCreate}>
          <div className="form-grid">
            <label className="field">
              <span>الاسم الكامل</span>
              <input
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label className="field">
              <span>البريد الإلكتروني</span>
              <input
                type="email"
                value={createForm.email}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label className="field">
              <span>المسمى الوظيفي</span>
              <input
                value={createForm.title}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label className="field">
              <span>الفريق</span>
              <input
                value={createForm.team}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    team: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label className="field">
              <span>مستوى التصريح</span>
              <select
                value={createForm.clearanceLevel}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    clearanceLevel: event.target.value,
                  }))
                }
              >
                {levelOptions.map((level) => (
                  <option key={level.level} value={level.level}>
                    {level.label} · L{level.level}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field">
            <div className="field-head">
              <span>نطاق المدن</span>
              <span className="field-hint">
                {viewerGlobalScope
                  ? "يمكنك منح أي مدينة."
                  : "مدنك المتاحة فقط."}
              </span>
            </div>
            <div className="scope-picker">
              {assignableCities.map((city) => {
                const checked = createForm.cityIds.includes(city.id);
                return (
                  <label
                    key={city.id}
                    className={`scope-option${checked ? " is-selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          cityIds: event.target.checked
                            ? [...current.cityIds, city.id]
                            : current.cityIds.filter(
                                (cityId) => cityId !== city.id,
                              ),
                        }))
                      }
                    />
                    <span>{city.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="button button-quiet"
              onClick={() => setCreateOpen(false)}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={savingCreate}
            >
              {savingCreate ? "جارٍ الإنشاء..." : "إنشاء المشغّل"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={scopeTarget !== null}
        title="نطاق مدن المشغّل"
        eyebrow="العزل الأفقي"
        description={
          scopeTarget
            ? `حدّد المدن التي يصل إليها ${scopeTarget.name}. لا يمكنك منح مدن خارج نطاقك.`
            : ""
        }
        onClose={() => setScopeTarget(null)}
      >
        <div className="form-stack">
          <div className="scope-picker">
            {assignableCities.map((city) => {
              const checked = scopeCities.includes(city.id);
              return (
                <label
                  key={city.id}
                  className={`scope-option${checked ? " is-selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      setScopeCities((current) =>
                        event.target.checked
                          ? [...current, city.id]
                          : current.filter((cityId) => cityId !== city.id),
                      )
                    }
                  />
                  <span>{city.name}</span>
                </label>
              );
            })}
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="button button-quiet"
              onClick={() => setScopeTarget(null)}
            >
              إلغاء
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => void saveScope()}
              disabled={savingScope}
            >
              {savingScope ? "جارٍ الحفظ..." : "حفظ النطاق"}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
