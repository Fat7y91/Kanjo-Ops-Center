"use client";

import type { AppUser } from "@/lib/rbac/types";
import { Modal } from "@/components/field-ops/modal";
import type {
  CityOption,
  CreateForm,
  LevelOption,
} from "@/components/admin/user-form-types";

type CreateModalProps = {
  open: boolean;
  form: CreateForm;
  levels: LevelOption[];
  cities: CityOption[];
  viewerGlobalScope: boolean;
  saving: boolean;
  onFormChange: (next: CreateForm) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

/** "Add operator" dialog. Kept separate so the matrix shell stays readable. */
export function CreateUserModal({
  open,
  form,
  levels,
  cities,
  viewerGlobalScope,
  saving,
  onFormChange,
  onClose,
  onSubmit,
}: CreateModalProps) {
  function patch(next: Partial<CreateForm>) {
    onFormChange({ ...form, ...next });
  }

  return (
    <Modal
      open={open}
      title="إضافة مشغّل جديد"
      eyebrow="حوكمة الرتب"
      description="لا يمكن إنشاء مشغّل برتبة تعادل رتبتك أو تتجاوزها، ولا خارج نطاق مدنك."
      onClose={onClose}
      wide
    >
      <form className="form-stack" onSubmit={onSubmit}>
        <div className="form-grid">
          <label className="field">
            <span>الاسم الكامل</span>
            <input
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>البريد الإلكتروني</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => patch({ email: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>المسمى الوظيفي</span>
            <input
              value={form.title}
              onChange={(event) => patch({ title: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>الفريق</span>
            <input
              value={form.team}
              onChange={(event) => patch({ team: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>مستوى التصريح</span>
            <select
              value={form.clearanceLevel}
              onChange={(event) =>
                patch({ clearanceLevel: event.target.value })
              }
            >
              {levels.map((level) => (
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
              {viewerGlobalScope ? "يمكنك منح أي مدينة." : "مدنك المتاحة فقط."}
            </span>
          </div>
          <div className="scope-picker">
            {cities.map((city) => {
              const checked = form.cityIds.includes(city.id);
              return (
                <label
                  key={city.id}
                  className={`scope-option${checked ? " is-selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      patch({
                        cityIds: event.target.checked
                          ? [...form.cityIds, city.id]
                          : form.cityIds.filter((id) => id !== city.id),
                      })
                    }
                  />
                  <span>{city.name}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? "جارٍ الإنشاء..." : "إنشاء المشغّل"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

type ScopeModalProps = {
  target: AppUser | null;
  cities: CityOption[];
  selected: string[];
  saving: boolean;
  onSelectionChange: (next: string[]) => void;
  onClose: () => void;
  onSave: () => void;
};

/** City-scope dialog for one operator. */
export function ScopeModal({
  target,
  cities,
  selected,
  saving,
  onSelectionChange,
  onClose,
  onSave,
}: ScopeModalProps) {
  return (
    <Modal
      open={target !== null}
      title="نطاق مدن المشغّل"
      eyebrow="العزل الأفقي"
      description={
        target
          ? `حدّد المدن التي يصل إليها ${target.name}. لا يمكنك منح مدن خارج نطاقك.`
          : ""
      }
      onClose={onClose}
    >
      <div className="form-stack">
        <div className="scope-picker">
          {cities.map((city) => {
            const checked = selected.includes(city.id);
            return (
              <label
                key={city.id}
                className={`scope-option${checked ? " is-selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    onSelectionChange(
                      event.target.checked
                        ? [...selected, city.id]
                        : selected.filter((id) => id !== city.id),
                    )
                  }
                />
                <span>{city.name}</span>
              </label>
            );
          })}
        </div>
        <div className="form-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "جارٍ الحفظ..." : "حفظ النطاق"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
