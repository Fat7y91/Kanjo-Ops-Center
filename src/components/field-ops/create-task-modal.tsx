"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import {
  FIELD_TEAMS,
  teamLabel,
  type City,
  type FieldTeam,
} from "@/lib/field-ops/types";

type CreateTaskModalProps = {
  open: boolean;
  cities: City[];
  defaultTeam: string;
  onClose: () => void;
  onDone: (message: string) => void;
};

type FormState = {
  merchantName: string;
  cityId: string;
  team: FieldTeam;
  visitDate: string;
  targetCommission: string;
  estimatedMonthlyValue: string;
  strategicNotes: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CreateTaskModal({
  open,
  cities,
  defaultTeam,
  onClose,
  onDone,
}: CreateTaskModalProps) {
  const fallbackTeam: FieldTeam = FIELD_TEAMS.includes(
    defaultTeam as FieldTeam,
  )
    ? (defaultTeam as FieldTeam)
    : FIELD_TEAMS[0];

  const [form, setForm] = useState<FormState>({
    merchantName: "",
    cityId: cities[0]?.id ?? "",
    team: fallbackTeam,
    visitDate: todayIso(),
    targetCommission: "8",
    estimatedMonthlyValue: "100000",
    strategicNotes: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      merchantName: "",
      cityId: cities[0]?.id ?? "",
      team: fallbackTeam,
      visitDate: todayIso(),
      targetCommission: "8",
      estimatedMonthlyValue: "100000",
      strategicNotes: "",
    });
    setError("");
    setSaving(false);
  }, [open, cities, fallbackTeam]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/field-ops/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          targetCommission: Number(form.targetCommission),
          estimatedMonthlyValue: Number(form.estimatedMonthlyValue),
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        merchantCreated?: boolean;
        merchant?: { name: string };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر إنشاء المهمة.");
      }
      const name = payload.merchant?.name ?? form.merchantName;
      onDone(
        payload.merchantCreated
          ? `تم إنشاء المهمة وتهيئة ${name} كتاجر.`
          : `تم إنشاء المهمة لـ ${name}.`,
      );
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر إنشاء المهمة.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="إنشاء مهمة ميدانية"
      eyebrow="عمليات المدن"
      description="إنشاء المهمة يهيئ التاجر تلقائياً إذا لم يكن موجوداً. فقط حاملو صلاحية إدارة المهام يمكنهم ذلك."
      onClose={onClose}
      wide
    >
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            <span>اسم التاجر</span>
            <input
              value={form.merchantName}
              onChange={(event) =>
                update("merchantName", event.target.value)
              }
              placeholder="كافيار أو Kaffyar Market"
              required
            />
          </label>
          <label className="field">
            <span>المدينة</span>
            <select
              value={form.cityId}
              onChange={(event) => update("cityId", event.target.value)}
              required
            >
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>الفريق المكلّف</span>
            <select
              value={form.team}
              onChange={(event) =>
                update("team", event.target.value as FieldTeam)
              }
            >
              {FIELD_TEAMS.map((team) => (
                <option key={team} value={team}>
                  {teamLabel(team)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>تاريخ الزيارة</span>
            <input
              type="date"
              value={form.visitDate}
              onChange={(event) => update("visitDate", event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>العمولة المستهدفة (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={form.targetCommission}
              onChange={(event) =>
                update("targetCommission", event.target.value)
              }
              required
            />
          </label>
          <label className="field">
            <span>القيمة الشهرية التقديرية</span>
            <input
              type="number"
              min={0}
              step="1000"
              value={form.estimatedMonthlyValue}
              onChange={(event) =>
                update("estimatedMonthlyValue", event.target.value)
              }
              required
            />
          </label>
        </div>

        <label className="field">
          <span>ملاحظات استراتيجية</span>
          <textarea
            rows={3}
            value={form.strategicNotes}
            onChange={(event) => update("strategicNotes", event.target.value)}
            placeholder="جهات الاتصال الرئيسية، الضغط التنافسي، موقف التفاوض."
          />
        </label>

        <p className="inline-note">
          يرى المندوبون مهام فريقهم فقط لليوم الحالي، بينما يرى المديرون اللوحة
          الكاملة.
        </p>

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
            disabled={saving}
          >
            {saving ? "جارٍ الإنشاء..." : "إنشاء المهمة"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
