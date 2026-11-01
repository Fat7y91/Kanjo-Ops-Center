"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import { shortDate } from "@/lib/accounts/format";

import type { CommissionRatesSnapshot } from "./use-commission-rates";
import {
  useCommissionRatesForm,
  type CityOption,
} from "./use-commission-rates-form";

type CommissionRatesViewProps = {
  cities: CityOption[];
  initialSnapshot: CommissionRatesSnapshot;
};

export function CommissionRatesView({
  cities,
  initialSnapshot,
}: CommissionRatesViewProps) {
  const form = useCommissionRatesForm(cities, initialSnapshot);

  const cityName = useMemo(
    () => new Map(cities.map((city) => [city.id, city.name])),
    [cities],
  );

  const isSelected = (cityId: string | null) =>
    (form.selectedCityId === form.GLOBAL_CITY && cityId === null) ||
    (form.selectedCityId !== form.GLOBAL_CITY && cityId === form.selectedCityId);

  return (
    <div className="commission-rates-layout">
      <section className="commission-rates-card">
        <header>
          <h3>
            {form.selectedCity
              ? `أسعار مدينة ${form.selectedCity.name}`
              : "الجدول الافتراضي العام"}
          </h3>
          <span
            className={`badge ${
              form.active?.source === "override" ? "badge-purple" : ""
            }`}
          >
            {form.active?.source === "override"
              ? "تجاوز خاص بالمدينة"
              : "الافتراضي العام"}
          </span>
        </header>

        <SelectMenu
          label="المدينة"
          hint="اختر مدينة لعرض جدولها أو تعديله، أو اترك «كل المدن» لتعديل الافتراضي العام."
          value={form.selectedCityId}
          onChange={form.selectCity}
          options={[
            { value: form.GLOBAL_CITY, label: "كل المدن (الافتراضي العام)" },
            ...cities.map((city) => ({
              value: city.id,
              label: city.name,
              hint: city.governorate,
            })),
          ]}
        />

        {form.loading ? (
          <p className="commission-rates-status">جارٍ تحميل الأسعار…</p>
        ) : null}
        {form.error ? (
          <p className="form-error" role="alert">
            {form.error}
          </p>
        ) : null}

        {!form.loading && !form.error ? (
          <>
            <p className="commission-rates-note">
              {form.active?.source === "override"
                ? "هذه المدينة لها جدول خاص؛ تعديله لا يمس الافتراضي العام ولا بقية المدن."
                : form.rate
                  ? "لا يوجد جدول خاص لهذه المدينة بعد؛ تُعرض قيم الافتراضي العام، والحفظ ينشئ تجاوزاً خاصاً بالمدينة."
                  : "لم يُسجَّل جدول أسعار بعد؛ أدخل القيم ثم احفظها."}
            </p>

            <div className="commission-fees-grid">
              <TextField
                label="رسوم تفعيل التاجر"
                hint="الرسم الأساسي لأول دخول تاجر جديد."
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                dir="ltr"
                required
                value={form.drafts.merchantActivationFee}
                onChange={(event) =>
                  form.patchFee("merchantActivationFee", event.target.value)
                }
                disabled={form.saving}
              />
              <TextField
                label="رسم الصورة / الصنف"
                hint="الرسم عن كل صورة أو صنف يُضاف."
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                dir="ltr"
                required
                value={form.drafts.photoItemFee}
                onChange={(event) =>
                  form.patchFee("photoItemFee", event.target.value)
                }
                disabled={form.saving}
              />
              <TextField
                label="الرسم الأساسي للتعاقد"
                hint="الرسم الأساسي لإغلاق العقد، قبل احتساب الهامش."
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                dir="ltr"
                required
                value={form.drafts.contractingBaseFee}
                onChange={(event) =>
                  form.patchFee("contractingBaseFee", event.target.value)
                }
                disabled={form.saving}
              />
            </div>

            {form.rate ? (
              <p className="commission-rates-meta">
                آخر تحديث: {shortDate(form.rate.updatedAt)}
                {form.active?.source === "global"
                  ? " · يُطبَّق على كل مدينة بلا جدول خاص"
                  : ""}
              </p>
            ) : null}

            <div className="form-actions">
              <Button
                variant="primary"
                disabled={form.saving || !form.dirty}
                onClick={() => void form.save()}
              >
                {form.saving ? "جارٍ الحفظ…" : "حفظ الأسعار"}
              </Button>
            </div>

            {form.saveError ? (
              <p className="form-error" role="alert">
                {form.saveError}
              </p>
            ) : null}
            {form.notice ? (
              <p className="accounts-notice" role="status">
                {form.notice}
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      <aside className="commission-rates-aside">
        <h3>الجداول النشطة</h3>
        <ul className="commission-rates-list">
          {form.rows.map((row) => (
            <li key={row.id}>
              <div
                className={`commission-rates-row${
                  isSelected(row.cityId) ? " is-selected" : ""
                }`}
              >
                <span>
                  {row.cityId
                    ? cityName.get(row.cityId) ?? row.cityId
                    : "كل المدن"}
                </span>
                <time dateTime={row.updatedAt}>{shortDate(row.updatedAt)}</time>
              </div>
            </li>
          ))}
        </ul>
        {form.rows.length === 0 ? (
          <p className="commission-rates-status">لا توجد جداول مسجّلة بعد.</p>
        ) : null}
      </aside>
    </div>
  );
}
