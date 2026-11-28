"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import type { RiderLookup } from "@/lib/riders/types";

type CustodyRiderFieldsProps = {
  fullName: string;
  nationalId: string;
  phone: string;
  workArea: string;
  deliveryDate: string;
  handoverOfficer: string;
  locked: boolean;
  lookup: RiderLookup | null;
  lookupState: "idle" | "loading" | "new" | "found";
  hasBlockingLookup: boolean;
  onFullName: (value: string) => void;
  onNationalId: (value: string) => void;
  onPhone: (value: string) => void;
  onWorkArea: (value: string) => void;
  onDeliveryDate: (value: string) => void;
  onHandoverOfficer: (value: string) => void;
  onCheck: () => void;
};

export function CustodyRiderFields({
  fullName,
  nationalId,
  phone,
  workArea,
  deliveryDate,
  handoverOfficer,
  locked,
  lookup,
  lookupState,
  hasBlockingLookup,
  onFullName,
  onNationalId,
  onPhone,
  onWorkArea,
  onDeliveryDate,
  onHandoverOfficer,
  onCheck,
}: CustodyRiderFieldsProps) {
  return (
    <section className="riders-form-section">
      <h3>بيانات المندوب</h3>
      <div className="riders-form-grid">
        <TextField
          label="الاسم الكامل"
          value={fullName}
          onChange={(event) => onFullName(event.target.value)}
          placeholder="اسم مندوب التوصيل"
          required
          maxLength={80}
        />
        <div className="rider-lookup-field">
          <TextField
            label="الرقم القومي"
            value={nationalId}
            onChange={(event) => onNationalId(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onCheck();
              }
            }}
            placeholder="14 رقماً"
            hint="اضغط تحقق بعد إدخال الرقم بالكامل."
            inputMode="numeric"
            maxLength={14}
            dir="ltr"
            disabled={locked}
            required
          />
          <Button
            variant="quiet"
            size="sm"
            onClick={onCheck}
            disabled={lookupState === "loading" || locked}
          >
            {lookupState === "loading" ? "جارٍ التحقق…" : "تحقق"}
          </Button>
        </div>
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

      {lookup ? (
        <div
          className={`rider-lookup-note${
            hasBlockingLookup ? " is-blocked" : ""
          }`}
        >
          <strong>{lookup.fullName}</strong>
          <span dir="ltr">{lookup.riderCode}</span>
          {lookup.hasCustody && lookup.custodyId ? (
            <Link
              href={`/riders/custody/${lookup.custodyId}/print`}
              target="_blank"
              className="riders-link"
            >
              طباعة الإيصال الحالي
            </Link>
          ) : null}
        </div>
      ) : lookupState === "new" ? (
        <p className="rider-lookup-note">مندوب جديد، سيُسجل عند الإصدار.</p>
      ) : null}
    </section>
  );
}
