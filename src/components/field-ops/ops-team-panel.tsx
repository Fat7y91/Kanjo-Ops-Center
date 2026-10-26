"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Protect } from "@/components/auth/protect";
import { usePermission } from "@/components/auth/use-permission";
import { Modal } from "@/components/field-ops/modal";
import type { AppUser } from "@/lib/rbac/types";

type OpsTeamPanelProps = {
  cityId: string;
  initialManagers: AppUser[];
  assignable: AppUser[];
  cityName: string;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("");
}

export function OpsTeamPanel({
  cityId,
  initialManagers,
  assignable,
  cityName,
}: OpsTeamPanelProps) {
  const { refresh } = usePermission();
  const [managers, setManagers] = useState(initialManagers);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | null>(null);

  const assignedIds = useMemo(
    () => new Set(managers.map((manager) => manager.id)),
    [managers],
  );

  const filteredAssignable = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return assignable;
    return assignable.filter((user) =>
      [user.name, user.email, user.title, user.team]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [assignable, query]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  function announce(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 4500);
  }

  function openModal() {
    setSelected([]);
    setQuery("");
    setError("");
    setOpen(true);
  }

  function toggle(userId: string) {
    setSelected((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  async function assign() {
    setError("");
    if (selected.length === 0) {
      setError("اختر مديراً واحداً على الأقل.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        `/api/field-ops/cities/${cityId}/managers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: selected }),
        },
      );
      const payload = (await response.json()) as {
        managers?: AppUser[];
        error?: string;
      };
      if (!response.ok || !payload.managers) {
        throw new Error(payload.error ?? "تعذر إسناد مديري التشغيل.");
      }
      setManagers(payload.managers);
      setOpen(false);
      announce(`تم إسناد ${selected.length} مدير تشغيل إلى ${cityName}.`);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "تعذر إسناد مديري التشغيل.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function revoke(user: AppUser) {
    setPendingId(user.id);
    setError("");
    try {
      const response = await fetch(
        `/api/field-ops/cities/${cityId}/managers/${user.id}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as {
        managers?: AppUser[];
        error?: string;
      };
      if (!response.ok || !payload.managers) {
        throw new Error(payload.error ?? "تعذر إلغاء الإسناد.");
      }
      setManagers(payload.managers);
      announce(`تم سحب إسناد ${user.name} من ${cityName}.`);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر إلغاء الإسناد.",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">فريق التشغيل</p>
            <h2>مديرو عمليات المدينة</h2>
            <p className="panel-note">
              يُمنح كل مدير مُسند صلاحية الوصول إلى نطاق {cityName} في مبدّل
              المدن تلقائياً.
            </p>
          </div>
          <Protect require="assign_city_managers">
            <button
              type="button"
              className="button button-primary"
              onClick={openModal}
            >
              إضافة مدير
            </button>
          </Protect>
        </div>

        {managers.length === 0 ? (
          <div className="manager-empty">
            <span className="manager-empty-icon" aria-hidden="true">
              +
            </span>
            <div>
              <strong>لا يوجد مدير تشغيل مسند بعد.</strong>
              <p>
                عيّن مديراً لبدء مرحلة الإعداد وتمكينه من متابعة التجار
                والمهام داخل هذه المدينة.
              </p>
            </div>
          </div>
        ) : (
          <div className="manager-grid">
            {managers.map((manager) => (
              <article className="manager-card" key={manager.id}>
                <span className="manager-avatar" aria-hidden="true">
                  {initials(manager.name)}
                </span>
                <div className="manager-copy">
                  <strong>{manager.name}</strong>
                  <span>{manager.title}</span>
                  <a href={`mailto:${manager.email}`}>{manager.email}</a>
                  <span className="badge badge-green manager-scope-badge">
                    نطاق {cityName} مُفعّل
                  </span>
                </div>
                <Protect require="assign_city_managers">
                  <button
                    type="button"
                    className="button button-small button-danger"
                    disabled={pendingId === manager.id}
                    onClick={() => void revoke(manager)}
                  >
                    {pendingId === manager.id ? "جارٍ السحب..." : "سحب الإسناد"}
                  </button>
                </Protect>
              </article>
            ))}
          </div>
        )}

        {error && !open ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <Modal
        open={open}
        title="إسناد مديري التشغيل"
        eyebrow="فريق التشغيل"
        description={`ابحث واختر المشغّلين الذين سيديرون ${cityName}. سيُضاف النطاق إلى مدنهم المتاحة فوراً.`}
        onClose={() => setOpen(false)}
        wide
      >
        <div className="manager-picker">
          <label className="field">
            <span>بحث عن مشغّل</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="الاسم، البريد الإلكتروني، الفريق..."
            />
          </label>

          <div className="manager-select-list" role="group" aria-label="المشغّلون المتاحون">
            {filteredAssignable.length === 0 ? (
              <p className="field-hint">لا يوجد مشغّل مطابق للبحث.</p>
            ) : (
              filteredAssignable.map((user) => {
                const alreadyAssigned = assignedIds.has(user.id);
                const checked = selected.includes(user.id);
                return (
                  <label
                    key={user.id}
                    className={`manager-option${
                      alreadyAssigned ? " is-assigned" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={alreadyAssigned || checked}
                      disabled={alreadyAssigned}
                      onChange={() => toggle(user.id)}
                    />
                    <span className="manager-avatar" aria-hidden="true">
                      {initials(user.name)}
                    </span>
                    <span className="manager-copy">
                      <strong>{user.name}</strong>
                      <span>
                        {user.title} · {user.team}
                      </span>
                      <span>{user.email}</span>
                    </span>
                    {alreadyAssigned ? (
                      <span className="badge badge-green">مُسند</span>
                    ) : user.permissions.includes("view_cities") ? (
                      <span className="badge">وصول للمدن</span>
                    ) : null}
                  </label>
                );
              })
            )}
          </div>

          <p className="field-hint">
            {selected.length > 0
              ? `سيتم إسناد ${selected.length} مدير: ${selected
                  .map(
                    (id) =>
                      assignable.find((user) => user.id === id)?.name ?? id,
                  )
                  .join("، ")}`
              : "حدد مديراً واحداً أو أكثر ثم أكّد الإسناد."}
          </p>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="form-actions">
            <button
              type="button"
              className="button button-quiet"
              onClick={() => setOpen(false)}
            >
              إلغاء
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => void assign()}
              disabled={saving || selected.length === 0}
            >
              {saving ? "جارٍ الإسناد..." : "تأكيد الإسناد"}
            </button>
          </div>
        </div>
      </Modal>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
