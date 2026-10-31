"use client";

import { useMemo, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { ChipToggle } from "@/components/ui/chip-toggle";
import {
  CheckboxField,
  TextField,
} from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import { PERMISSION_GROUPS, type Permission } from "@/lib/rbac/permissions";
import type { TeamOption } from "@/lib/rbac/teams";
import {
  isCourier,
  type CityOption,
  type CreateForm,
  type LevelOption,
} from "@/components/admin/user-form-types";

const CUSTOM_TEAM = "__custom__";

type CreateModalProps = {
  open: boolean;
  form: CreateForm;
  levels: LevelOption[];
  cities: CityOption[];
  teams: TeamOption[];
  viewerGlobalScope: boolean;
  saving: boolean;
  onFormChange: (next: CreateForm) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

/**
 * "Add user" dialog.
 *
 * Phone + password are the login identity (email is profile-only), the team is
 * required only for a field courier, and the capability grid mirrors the edit
 * matrix so a new user is provisioned with the exact grants they need instead
 * of an empty slate.
 */
export function CreateUserModal({
  open,
  form,
  levels,
  cities,
  teams,
  viewerGlobalScope,
  saving,
  onFormChange,
  onClose,
  onSubmit,
}: CreateModalProps) {
  const [customTeam, setCustomTeam] = useState(false);
  const needsTeam = isCourier(form.clearanceLevel);
  const held = useMemo(() => new Set(form.permissions), [form.permissions]);
  const teamValues = useMemo(
    () => new Set(teams.map((team) => team.value)),
    [teams],
  );
  const teamIsKnown = teamValues.has(form.team);

  function patch(next: Partial<CreateForm>) {
    onFormChange({ ...form, ...next });
  }

  function togglePermission(permission: Permission, enabled: boolean) {
    patch({
      permissions: enabled
        ? [...form.permissions, permission]
        : form.permissions.filter((key) => key !== permission),
    });
  }

  return (
    <Modal
      open={open}
      title="إضافة مستخدم جديد"
      eyebrow="إدارة الوصول"
      description="أنشئ حساب دخول برقم الهاتف، ثم امنح القدرات الدقيقة ونطاق المدن. لا يمكن إنشاء مستخدم برتبة تعادل رتبتك أو تتجاوزها."
      onClose={onClose}
      wide
    >
      <form className="form-stack" onSubmit={onSubmit}>
        <div className="form-grid">
          <TextField
            label="الاسم الكامل"
            value={form.name}
            onChange={(event) => patch({ name: event.target.value })}
            required
          />
          <TextField
            label="رقم الهاتف"
            hint="بصيغة دولية تبدأ بـ +، وهو اسم الدخول."
            value={form.phone}
            onChange={(event) => patch({ phone: event.target.value })}
            dir="ltr"
            inputMode="tel"
            placeholder="+201012345678"
            required
          />
          <TextField
            label="كلمة المرور المؤقتة"
            hint="8 أحرف على الأقل؛ يغيّرها المستخدم عند أول دخول."
            type="password"
            value={form.password}
            onChange={(event) => patch({ password: event.target.value })}
            autoComplete="new-password"
            required
          />
          <TextField
            label="البريد الإلكتروني"
            hint="اختياري، للتنبيهات فقط وليس للدخول."
            type="email"
            value={form.email}
            onChange={(event) => patch({ email: event.target.value })}
            dir="ltr"
          />
          <TextField
            label="المسمى الوظيفي"
            value={form.title}
            onChange={(event) => patch({ title: event.target.value })}
            required
          />
          <SelectMenu
            label="مستوى التصريح"
            value={form.clearanceLevel}
            onChange={(clearanceLevel) => patch({ clearanceLevel })}
            options={levels.map((option) => ({
              value: String(option.level),
              label: `${option.label} · L${option.level}`,
            }))}
          />
        </div>

        {needsTeam ? (
          <div className="form-grid">
            <SelectMenu
              label="الفريق"
              hint="إلزامي للمندوب الميداني."
              value={customTeam ? CUSTOM_TEAM : form.team || null}
              onChange={(value) => {
                if (value === CUSTOM_TEAM) {
                  setCustomTeam(true);
                  patch({ team: "" });
                  return;
                }
                setCustomTeam(false);
                patch({ team: value });
              }}
              options={[
                ...teams.map((team) => ({
                  value: team.value,
                  label: team.label,
                })),
                { value: CUSTOM_TEAM, label: "فريق جديد…" },
              ]}
            />
            {customTeam || (form.team !== "" && !teamIsKnown) ? (
              <TextField
                label="اسم الفريق الجديد"
                value={form.team}
                onChange={(event) => patch({ team: event.target.value })}
                required
              />
            ) : null}
          </div>
        ) : null}

        <div className="field">
          <div className="field-head">
            <span>نطاق المدن</span>
            <span className="field-hint">
              {viewerGlobalScope ? "يمكنك منح أي مدينة." : "مدنك المتاحة فقط."}
            </span>
          </div>
          <div className="scope-picker">
            {cities.map((city) => (
              <ChipToggle
                key={city.id}
                label={city.name}
                checked={form.cityIds.includes(city.id)}
                onChange={(checked) =>
                  patch({
                    cityIds: checked
                      ? [...form.cityIds, city.id]
                      : form.cityIds.filter((id) => id !== city.id),
                  })
                }
              />
            ))}
          </div>
        </div>

        <div className="field">
          <div className="field-head">
            <span>القدرات</span>
            <span className="field-hint">
              {form.permissions.length} صلاحية مختارة
            </span>
          </div>
          <div className="matrix-groups">
            {PERMISSION_GROUPS.map((group) => (
              <div
                key={group.name}
                className="matrix-group matrix-group-modal"
              >
                <h3>{group.name}</h3>
                <div className="matrix-perms">
                  {group.items.map((permission) => (
                    <CheckboxField
                      key={permission.key}
                      label={permission.label}
                      checked={held.has(permission.key as Permission)}
                      onChange={(checked) =>
                        togglePermission(
                          permission.key as Permission,
                          checked,
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="form-actions">
          <Button variant="quiet" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "جارٍ الإنشاء..." : "إنشاء المستخدم"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
