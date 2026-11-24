"use client";

import { TextField } from "@/components/ui/form-inputs";

/**
 * Legal identity fields shared by the merchant create and edit forms.
 *
 * These values are printed on the contract as the second party, so they are
 * grouped under one heading rather than mixed into the contact block. The
 * component is controlled: the parent owns the form state and receives partial
 * patches, which keeps both modals free of duplicated field markup.
 */

export type MerchantLegalFieldsValue = {
  legalName: string;
  commercialRegisterNo: string;
  taxCardNo: string;
  legalRepresentativeName: string;
  legalRepresentativeTitle: string;
  legalRepresentativeNationalId: string;
  legalAddress: string;
};

export const EMPTY_MERCHANT_LEGAL_FIELDS: MerchantLegalFieldsValue = {
  legalName: "",
  commercialRegisterNo: "",
  taxCardNo: "",
  legalRepresentativeName: "",
  legalRepresentativeTitle: "",
  legalRepresentativeNationalId: "",
  legalAddress: "",
};

type MerchantLegalFieldsProps = {
  value: MerchantLegalFieldsValue;
  onChange: (patch: Partial<MerchantLegalFieldsValue>) => void;
  disabled?: boolean;
};

export function MerchantLegalFields({
  value,
  onChange,
  disabled,
}: MerchantLegalFieldsProps) {
  return (
    <section className="form-stack">
      <p className="text-[0.82rem] font-bold text-[color:var(--ink)]">
        البيانات القانونية للتعاقد
      </p>

      <div className="form-grid">
        <TextField
          label="الاسم القانوني للمنشأة"
          value={value.legalName}
          onChange={(event) => onChange({ legalName: event.target.value })}
          placeholder="الاسم كما يظهر في السجل التجاري"
          maxLength={160}
          disabled={disabled}
        />
        <TextField
          label="رقم السجل التجاري"
          value={value.commercialRegisterNo}
          onChange={(event) =>
            onChange({ commercialRegisterNo: event.target.value })
          }
          dir="ltr"
          maxLength={60}
          disabled={disabled}
        />
        <TextField
          label="رقم البطاقة الضريبية"
          value={value.taxCardNo}
          onChange={(event) => onChange({ taxCardNo: event.target.value })}
          dir="ltr"
          maxLength={60}
          disabled={disabled}
        />
        <TextField
          label="اسم المفوض / صاحب النشاط"
          value={value.legalRepresentativeName}
          onChange={(event) =>
            onChange({ legalRepresentativeName: event.target.value })
          }
          maxLength={160}
          disabled={disabled}
        />
        <TextField
          label="صفة المفوض"
          value={value.legalRepresentativeTitle}
          onChange={(event) =>
            onChange({ legalRepresentativeTitle: event.target.value })
          }
          placeholder="مالك / مدير مفوض"
          maxLength={120}
          disabled={disabled}
        />
        <TextField
          label="الرقم القومي للمفوض"
          value={value.legalRepresentativeNationalId}
          onChange={(event) =>
            onChange({ legalRepresentativeNationalId: event.target.value })
          }
          dir="ltr"
          maxLength={30}
          disabled={disabled}
        />
      </div>

      <TextField
        label="العنوان القانوني"
        value={value.legalAddress}
        onChange={(event) => onChange({ legalAddress: event.target.value })}
        placeholder="العنوان المسجل في السجل التجاري"
        maxLength={240}
        disabled={disabled}
      />
    </section>
  );
}
