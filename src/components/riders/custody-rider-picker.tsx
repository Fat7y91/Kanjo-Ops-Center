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
  deliveryDate: string;
  handoverOfficer: string;
  onSelect: (riderId: string) => void;
  onDeliveryDate: (value: string) => void;
  onHandoverOfficer: (value: string) => void;
};

export function CustodyRiderPicker({
  options,
  selectedRiderId,
  selectedRider,
  deliveryDate,
  handoverOfficer,
  onSelect,
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
          hint="اختر مندوباً مسجلاً لإصدار إيصال عهدة إضافي."
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
          <span dir="ltr">{selectedRider.riderCode}</span>
          <span dir="ltr">{selectedRider.phone}</span>
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
    </section>
  );
}
