"use client";

import Link from "next/link";

import { TextField } from "@/components/ui/form-inputs";
import { ComboField } from "@/components/ui/select-menus";
import { riderStatusLabel } from "@/lib/riders/format";
import type { Rider } from "@/lib/riders/types";

type RiderOption = {
  value: string;
  label: string;
  hint?: string;
};

type CustodyRiderPickerProps = {
  options: RiderOption[];
  selectedRiderId: string | null;
  selectedRider: Rider | null;
  needsIdentity: boolean;
  nationalId: string;
  phone: string;
  workArea: string;
  deliveryDate: string;
  handoverOfficer: string;
  onSelect: (riderId: string) => void;
  onNationalId: (value: string) => void;
  onPhone: (value: string) => void;
  onWorkArea: (value: string) => void;
  onDeliveryDate: (value: string) => void;
  onHandoverOfficer: (value: string) => void;
};

export function CustodyRiderPicker({
  options,
  selectedRiderId,
  selectedRider,
  needsIdentity,
  nationalId,
  phone,
  workArea,
  deliveryDate,
  handoverOfficer,
  onSelect,
  onNationalId,
  onPhone,
  onWorkArea,
  onDeliveryDate,
  onHandoverOfficer,
}: CustodyRiderPickerProps) {
  return (
    <section className="riders-form-section">
      <h3>بيانات المندوب</h3>
      <div className="riders-form-grid">
        <ComboField
          label="المندوب الحالي"
          value={selectedRiderId}
          options={options}
          onChange={onSelect}
          placeholder="ابحث بالاسم أو الكود أو الهاتف"
          hint="اختر من مناديب التشغيل المسجلين لإصدار إيصال عهدة."
        />
        <TextField
          label="تاريخ التسليم"
          type="date"
          value={deliveryDate}
          onChange={(event) => onDeliveryDate(event.target.value)}
          required
        />
        <TextField
          label="مسؤول التسليم"
          value={handoverOfficer}
          onChange={(event) => onHandoverOfficer(event.target.value)}
          maxLength={80}
          required
        />
      </div>

      {selectedRider ? (
        <div className="rider-lookup-note">
          <strong>{selectedRider.fullName}</strong>
          <span dir="ltr">
            {selectedRider.riderCode || "بدون كود عهدة"}
          </span>
          <span dir="ltr">{selectedRider.phone || "بدون هاتف"}</span>
          <span>{selectedRider.workArea || "بدون منطقة عمل"}</span>
          <span>{riderStatusLabel(selectedRider.status)}</span>
          {selectedRider.latestCustody ? (
            <Link
              href={`/riders/custody/${selectedRider.latestCustody.id}/print`}
              target="_blank"
              className="riders-link"
            >
              عرض آخر إيصال
            </Link>
          ) : null}
        </div>
      ) : (
        <p className="rider-lookup-note">
          اختر مندوباً مسجلاً من القائمة لإصدار إيصال إضافي.
        </p>
      )}

      {selectedRider && needsIdentity ? (
        <>
          <p className="rider-lookup-note">
            هذا المندوب موجود في دليل التشغيل لكنه لم يُسجل له كود عهدة بعد.
            أكمل بيانات الهوية، وسيُحفظ الكود في سجل المناديب عند إصدار
            الإيصال.
          </p>
          <div className="riders-form-grid">
            <TextField
              label="الرقم القومي"
              value={nationalId}
              onChange={(event) => onNationalId(event.target.value)}
              placeholder="14 رقماً"
              inputMode="numeric"
              maxLength={14}
              dir="ltr"
              required
            />
            <TextField
              label="الهاتف"
              value={phone}
              onChange={(event) => onPhone(event.target.value)}
              placeholder="01012345678"
              inputMode="tel"
              dir="ltr"
              required
            />
            <TextField
              label="منطقة العمل"
              value={workArea}
              onChange={(event) => onWorkArea(event.target.value)}
              placeholder="المدينة أو نطاق التوصيل"
              maxLength={80}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}
