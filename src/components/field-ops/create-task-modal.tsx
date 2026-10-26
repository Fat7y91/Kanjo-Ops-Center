"use client";

import { useEffect, useState } from "react";

import { MerchantCombobox } from "@/components/field-ops/merchant-combobox";
import { Modal } from "@/components/field-ops/modal";
import {
  FIELD_TEAMS,
  teamLabel,
  type AssignableMerchant,
  type FieldTeam,
} from "@/lib/field-ops/types";

type CreateTaskModalProps = {
  open: boolean;
  defaultTeam: string;
  onClose: () => void;
  onDone: (message: string) => void;
};

type FormState = {
  team: FieldTeam;
  visitDate: string;
  instructions: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CreateTaskModal({
  open,
  defaultTeam,
  onClose,
  onDone,
}: CreateTaskModalProps) {
  const fallbackTeam: FieldTeam = FIELD_TEAMS.includes(
    defaultTeam as FieldTeam,
  )
    ? (defaultTeam as FieldTeam)
    : FIELD_TEAMS[0];

  const [merchant, setMerchant] = useState<AssignableMerchant | null>(null);
  const [form, setForm] = useState<FormState>({
    team: fallbackTeam,
    visitDate: todayIso(),
    instructions: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMerchant(null);
    setForm({
      team: fallbackTeam,
      visitDate: todayIso(),
      instructions: "",
    });
    setError("");
    setSaving(false);
  }, [open, fallbackTeam]);

  function selectMerchant(next: AssignableMerchant | null) {
    setMerchant(next);
    if (next?.team && FIELD_TEAMS.includes(next.team as FieldTeam)) {
      setForm((current) => ({ ...current, team: next.team as FieldTeam }));
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!merchant) {
      setError("اختر تاجراً موجوداً من القائمة أولاً.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/field-ops/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: merchant.id,
          team: form.team,
          visitDate: form.visitDate,
          instructions: form.instructions,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        merchant?: { name: string };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر إسناد المهمة.");
      }
      const name = payload.merchant?.name ?? merchant.name;
      onDone(
        `تم إسناد مهمة ${name} إلى ${teamLabel(form.team)} بتاريخ ${form.visitDate}.`,
      );
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر إسناد المهمة.",
      );
    } finally {
      setSaving(false);
    }
  }

  const cityInPreparation = merchant?.cityStage === "preparation";
  const disabled = saving || !merchant || cityInPreparation;

  return (
    <Modal
      open={open}
      title="إسناد مهمة ميدانية"
      eyebrow="مرحلة التعاقدات"
      description="اختر تاجراً مسجلاً في دليل التجار، ثم حدّد الفريق وتاريخ الزيارة والتعليمات. الإسناد لا ينشئ تاجراً جديداً."
      onClose={onClose}
      wide
    >
      <form className="form-stack" onSubmit={submit}>
        <div className="field">
          <div className="field-head">
            <span>التاجر</span>
            <span className="field-hint">
              من دليل التجار داخل نطاق مدنك
            </span>
          </div>
          <MerchantCombobox
            value={merchant?.id ?? ""}
            onChange={selectMerchant}
            disabled={saving}
          />
        </div>

        <div className="form-grid">
          <label className="field">
            <span>الفريق المكلّف</span>
            <select
              value={form.team}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  team: event.target.value as FieldTeam,
                }))
              }
              disabled={Boolean(merchant?.team) || saving}
              required
            >
              {FIELD_TEAMS.map((team) => (
                <option key={team} value={team}>
                  {teamLabel(team)}
                </option>
              ))}
            </select>
            {merchant?.team ? (
              <span className="field-hint">
                ملكية هذا التاجر مثبتة لفريق {teamLabel(merchant.team)}. لنقلها
                استخدم طلب نقل الملكية.
              </span>
            ) : null}
          </label>
          <label className="field">
            <span>تاريخ الزيارة</span>
            <input
              type="date"
              value={form.visitDate}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  visitDate: event.target.value,
                }))
              }
              disabled={saving}
              required
            />
          </label>
        </div>

        <label className="field">
          <span>تعليمات المهمة</span>
          <textarea
            rows={3}
            value={form.instructions}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                instructions: event.target.value,
              }))
            }
            placeholder="تعليمات خاصة بهذه الزيارة: الهدف، جهة الاتصال، المنتجات المطلوبة…"
            maxLength={2000}
            disabled={saving}
          />
          <span className="field-hint">
            اختيارية، وتظهر للمندوب داخل بطاقة المهمة.
          </span>
        </label>

        {merchant ? (
          <div className="inline-note">
            {merchant.cityName} · {merchant.vendorType} · عمولة مستهدفة{" "}
            {merchant.targetCommission}% ·{" "}
            {merchant.team
              ? `ملكية ${teamLabel(merchant.team)} محفوظة`
              : "تاجر غير مسند وسيتم ربطه بالفريق عند الحفظ"}
          </div>
        ) : (
          <p className="inline-note">
            لا يظهر تاجر جديد هنا. أضف التجار من وحدة «دليل التجار» ثم ارجع
            لإسناد المهام.
          </p>
        )}

        {cityInPreparation ? (
          <p className="form-error" role="alert">
            المدينة ما زالت في مرحلة الإعداد. حدّث مرحلتها إلى التعاقدات أولاً.
          </p>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={disabled}
          >
            {saving ? "جارٍ الإسناد..." : "إسناد المهمة"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
