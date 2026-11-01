"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_COMMISSION_RATES,
  type CityCommissionRate,
} from "@/lib/commissions/types";

import {
  useCommissionRates,
  type CommissionRatesSnapshot,
} from "./use-commission-rates";

const GLOBAL_CITY = "";

export type CityOption = {
  id: string;
  name: string;
  governorate: string;
};

export type FeeDraft = {
  merchantActivationFee: string;
  photoItemFee: string;
  contractFeeTier1: string;
  contractFeeTier2: string;
  contractFeeTier3: string;
  contractFeeTier4: string;
};

function draftFromRate(rate: CityCommissionRate | null): FeeDraft {
  const base = rate ?? DEFAULT_COMMISSION_RATES;
  return {
    merchantActivationFee: String(base.merchantActivationFee),
    photoItemFee: String(base.photoItemFee),
    contractFeeTier1: String(base.contractFeeTier1),
    contractFeeTier2: String(base.contractFeeTier2),
    contractFeeTier3: String(base.contractFeeTier3),
    contractFeeTier4: String(base.contractFeeTier4),
  };
}

/**
 * View state and handlers for the commission rates settings surface:
 * city selection, the fee draft, and saving through the API route. The form
 * syncs with whatever schedule was just resolved, so switching cities can
 * never leave another city's figures in the fields.
 */
export function useCommissionRatesForm(
  cities: CityOption[],
  initialSnapshot: CommissionRatesSnapshot,
) {
  const [selectedCityId, setSelectedCityId] = useState<string>(GLOBAL_CITY);
  const { snapshot, loading, error, reload } = useCommissionRates(
    selectedCityId === GLOBAL_CITY ? null : selectedCityId,
    initialSnapshot,
  );
  const [drafts, setDrafts] = useState<FeeDraft>(() =>
    draftFromRate(initialSnapshot.active?.rate ?? null),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");

  const active = snapshot?.active ?? null;
  const rate = active?.rate ?? null;
  const selectedCity =
    selectedCityId === GLOBAL_CITY
      ? null
      : cities.find((city) => city.id === selectedCityId) ?? null;
  const rows = snapshot?.rows ?? initialSnapshot.rows;

  useEffect(() => {
    setDrafts(draftFromRate(rate));
    setDirty(false);
    setSaveError("");
  }, [rate?.id, active?.source]);

  function selectCity(next: string) {
    setSelectedCityId(next);
    setNotice("");
    setSaveError("");
  }

  function patchFee(key: keyof FeeDraft, value: string) {
    setDrafts((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setNotice("");
    setSaveError("");
  }

  async function save() {
    const fees = {
      merchantActivationFee: Number(drafts.merchantActivationFee),
      photoItemFee: Number(drafts.photoItemFee),
      contractFeeTier1: Number(drafts.contractFeeTier1),
      contractFeeTier2: Number(drafts.contractFeeTier2),
      contractFeeTier3: Number(drafts.contractFeeTier3),
      contractFeeTier4: Number(drafts.contractFeeTier4),
    };
    const valid = Object.values(fees).every(
      (value) => Number.isFinite(value) && value >= 0,
    );
    if (!valid) {
      setSaveError("أدخل أرقاماً صحيحة غير سالبة لكل الرسوم.");
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/admin/commission-rates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cityId: selectedCityId === GLOBAL_CITY ? null : selectedCityId,
          ...fees,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "تعذر حفظ الأسعار.");

      setDirty(false);
      setNotice(
        selectedCity
          ? "تم حفظ جدول أسعار المدينة."
          : "تم تحديث الجدول الافتراضي لكل المدن.",
      );
      await reload();
    } catch (saveFailure) {
      setSaveError(
        saveFailure instanceof Error
          ? saveFailure.message
          : "تعذر حفظ الأسعار.",
      );
    } finally {
      setSaving(false);
    }
  }

  return {
    GLOBAL_CITY,
    selectedCityId,
    selectedCity,
    rows,
    active,
    rate,
    drafts,
    dirty,
    saving,
    notice,
    saveError,
    loading,
    error,
    selectCity,
    patchFee,
    save,
  };
}
