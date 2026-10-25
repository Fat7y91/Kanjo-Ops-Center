"use client";

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import {
  FIELD_TEAMS,
  teamLabel,
  type City,
  type FieldTeam,
  type Merchant,
} from "@/lib/field-ops/types";

type CreateTaskModalProps = {
  open: boolean;
  cities: City[];
  merchants: Merchant[];
  defaultTeam: string;
  onClose: () => void;
  onDone: (message: string) => void;
};

type FormState = {
  cityId: string;
  merchantId: string;
  team: FieldTeam;
  visitDate: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function activeCities(cities: City[]): City[] {
  const active = cities.filter((city) => city.stage !== "preparation");
  return active.length > 0 ? active : cities;
}

function merchantsForCity(merchants: Merchant[], cityId: string): Merchant[] {
  return merchants
    .filter((merchant) => merchant.cityId === cityId)
    .sort((left, right) => {
      const leftAssigned = left.team ? 1 : 0;
      const rightAssigned = right.team ? 1 : 0;
      if (leftAssigned !== rightAssigned) return leftAssigned - rightAssigned;
      return left.name.localeCompare(right.name, "ar");
    });
}

export function CreateTaskModal({
  open,
  cities,
  merchants,
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
    cityId: "",
    merchantId: "",
    team: fallbackTeam,
    visitDate: todayIso(),
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selectableCities = useMemo(() => activeCities(cities), [cities]);
  const cityMerchants = useMemo(
    () => merchantsForCity(merchants, form.cityId),
    [merchants, form.cityId],
  );
  const selectedMerchant = cityMerchants.find(
    (merchant) => merchant.id === form.merchantId,
  );
  const selectedCity = cities.find((city) => city.id === form.cityId);
  const cityInPreparation = selectedCity?.stage === "preparation";

  useEffect(() => {
    if (!open) return;
    const cityId = selectableCities[0]?.id ?? cities[0]?.id ?? "";
    const firstMerchant = merchantsForCity(merchants, cityId)[0];
    setForm({
      cityId,
      merchantId: firstMerchant?.id ?? "",
      team: (firstMerchant?.team as FieldTeam | null) ?? fallbackTeam,
      visitDate: todayIso(),
    });
    setError("");
    setSaving(false);
  }, [open, cities, merchants, selectableCities, fallbackTeam]);

  function selectCity(cityId: string) {
    const firstMerchant = merchantsForCity(merchants, cityId)[0];
    setForm((current) => ({
      ...current,
      cityId,
      merchantId: firstMerchant?.id ?? "",
      team: (firstMerchant?.team as FieldTeam | null) ?? fallbackTeam,
    }));
  }

  function selectMerchant(merchantId: string) {
    const merchant = cityMerchants.find((candidate) => candidate.id === merchantId);
    setForm((current) => ({
      ...current,
      merchantId,
      team: (merchant?.team as FieldTeam | null) ?? current.team,
    }));
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
          merchantId: form.merchantId,
          team: form.team,
          visitDate: form.visitDate,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        merchant?: { name: string };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر إسناد المهمة.");
      }
      const name = payload.merchant?.name ?? selectedMerchant?.name ?? "";
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

  const disabled =
    saving ||
    cityInPreparation ||
    !form.merchantId ||
    cityMerchants.length === 0;

  return (
    <Modal
      open={open}
      title="إسناد مهمة ميدانية"
      eyebrow="مرحلة التعاقدات"
      description="اختر تاجراً من قائمة الاستهداف، ثم حدّد الفريق وتاريخ الزيارة. الإسناد هو ما ينشئ المهمة الميدانية."
      onClose={onClose}
      wide
    >
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            <span>المدينة</span>
            <select
              value={form.cityId}
              onChange={(event) => selectCity(event.target.value)}
              required
            >
              {selectableCities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name} · {city.stage === "preparation" ? "إعداد" : "جاهزة"}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>التاجر المستهدف</span>
            <select
              value={form.merchantId}
              onChange={(event) => selectMerchant(event.target.value)}
              required
              disabled={cityMerchants.length === 0}
            >
              {cityMerchants.length === 0 ? (
                <option value="">لا يوجد تجار في هذه المدينة</option>
              ) : (
                cityMerchants.map((merchant) => (
                  <option key={merchant.id} value={merchant.id}>
                    {merchant.name} — {merchant.category}
                    {merchant.team ? " (مسند)" : " (متاح)"}
                  </option>
                ))
              )}
            </select>
          </label>
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
              disabled={Boolean(selectedMerchant?.team)}
              required
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
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  visitDate: event.target.value,
                }))
              }
              required
            />
          </label>
        </div>

        {selectedMerchant ? (
          <div className="inline-note">
            {selectedMerchant.category} · عمولة مستهدفة{" "}
            {selectedMerchant.targetCommission}% ·{" "}
            {selectedMerchant.team
              ? `ملكية ${teamLabel(selectedMerchant.team)} محفوظة`
              : "تاجر غير مسند وسيتم ربطه بالفريق عند الحفظ"}
          </div>
        ) : null}

        {cityInPreparation ? (
          <p className="form-error" role="alert">
            المدينة ما زالت في مرحلة الإعداد. حدّث مرحلتها إلى التعاقدات أولاً.
          </p>
        ) : null}

        {cityMerchants.length === 0 && !cityInPreparation ? (
          <p className="inline-note">
            لا يوجد تجار مستهدفون في هذه المدينة بعد. أضف تاجراً من زر «إضافة
            تاجر مستهدف» أولاً.
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
