"use client";

import Link from "next/link";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import {
  TextAreaField,
  TextField,
} from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import type {
  CustodyIssueResult,
  LocationCatalog,
  Rider,
} from "@/lib/riders/types";

import { CustodyItemsEditor } from "./custody-items-editor";
import { CustodySummary } from "./custody-summary";
import { useIssueCustody } from "./use-issue-custody";

type IssueCustodyModalProps = {
  locations: LocationCatalog;
  initialRider: Rider | null;
  onClose: () => void;
  onIssued: (result: CustodyIssueResult) => void;
};

export function IssueCustodyModal({
  locations,
  initialRider,
  onClose,
  onIssued,
}: IssueCustodyModalProps) {
  const state = useIssueCustody({ locations, initialRider, onIssued });

  const governorateOptions = locations.governorates.map((item) => ({
    value: item.name,
    label: item.name,
    hint: `${item.alphaCode} · ${item.numericCode}`,
  }));
  const cityOptions = state.cityOptions.map((item) => ({
    value: item.name,
    label: item.name,
    hint: `${item.alphaCode} · ${item.numericCode}`,
  }));

  return (
    <Modal
      open
      wide
      eyebrow="مناديب التوصيل والعهد"
      title="إصدار إيصال عهدة"
      description="سجّل بيانات المندوب والبنود المسلّمة ثم اطبع الإيصال."
      onClose={onClose}
    >
      <form
        className="riders-form"
        onSubmit={(event) => {
          event.preventDefault();
          void state.submit();
        }}
      >
        <section className="riders-form-section">
          <h3>الموقع والتسلسل</h3>
          {locations.governorates.length === 0 ? (
            <p className="form-error">
              لم يتم تحميل بيانات المحافظات. أعد تحميل الصفحة أو راجع إعداد
              المواقع.
            </p>
          ) : null}
          <div className="riders-form-grid">
            <SelectMenu
              label="المحافظة"
              value={state.governorate}
              options={governorateOptions}
              onChange={state.changeGovernorate}
              disabled={state.locked}
              placeholder="اختر المحافظة"
            />
            <SelectMenu
              label="المدينة"
              value={state.city}
              options={cityOptions}
              onChange={state.changeCity}
              disabled={state.locked || !state.governorate}
              placeholder="اختر المدينة"
            />
            <TextField
              label="رقم التسلسل"
              value={state.sequence ?? ""}
              readOnly
              hint={
                state.nextLoading
                  ? "جارٍ حساب التسلسل…"
                  : "يُحدد من آخر تسلسل مسجل."
              }
              dir="ltr"
            />
          </div>

          <div className="rider-code-preview">
            <div>
              <span>كود المندوب</span>
              <strong dir="ltr">{state.riderCode || "—"}</strong>
            </div>
            <div>
              <span>رقم العهدة</span>
              <strong dir="ltr">{state.custodyNumber || "—"}</strong>
            </div>
          </div>
        </section>

        <section className="riders-form-section">
          <h3>بيانات المندوب</h3>
          <div className="riders-form-grid">
            <TextField
              label="الاسم الكامل"
              value={state.fullName}
              onChange={(event) => state.setFullName(event.target.value)}
              placeholder="اسم مندوب التوصيل"
              required
              maxLength={80}
            />
            <div className="rider-lookup-field">
              <TextField
                label="الرقم القومي"
                value={state.nationalId}
                onChange={(event) => state.changeNationalId(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void state.checkRider();
                  }
                }}
                placeholder="14 رقماً"
                hint="اضغط تحقق بعد إدخال الرقم بالكامل."
                inputMode="numeric"
                maxLength={14}
                dir="ltr"
                disabled={state.locked}
                required
              />
              <Button
                variant="quiet"
                size="sm"
                onClick={() => void state.checkRider()}
                disabled={state.lookupState === "loading" || state.locked}
              >
                {state.lookupState === "loading" ? "جارٍ التحقق…" : "تحقق"}
              </Button>
            </div>
            <TextField
              label="الهاتف"
              value={state.phone}
              onChange={(event) => state.setPhone(event.target.value)}
              placeholder="01012345678"
              inputMode="tel"
              dir="ltr"
              required
            />
            <TextField
              label="منطقة العمل"
              value={state.workArea}
              onChange={(event) => state.setWorkArea(event.target.value)}
              placeholder="المدينة أو نطاق التوصيل"
              maxLength={80}
            />
            <TextField
              label="تاريخ التسليم"
              type="date"
              value={state.deliveryDate}
              onChange={(event) => state.setDeliveryDate(event.target.value)}
              required
            />
            <TextField
              label="مسؤول التسليم"
              value={state.handoverOfficer}
              onChange={(event) => state.setHandoverOfficer(event.target.value)}
              maxLength={80}
              required
            />
          </div>

          {state.lookup ? (
            <div
              className={`rider-lookup-note${
                state.hasBlockingLookup ? " is-blocked" : ""
              }`}
            >
              <strong>{state.lookup.fullName}</strong>
              <span dir="ltr">{state.lookup.riderCode}</span>
              {state.lookup.hasCustody && state.lookup.custodyId ? (
                <Link
                  href={`/riders/custody/${state.lookup.custodyId}/print`}
                  target="_blank"
                  className="riders-link"
                >
                  طباعة الإيصال الحالي
                </Link>
              ) : null}
            </div>
          ) : state.lookupState === "new" ? (
            <p className="rider-lookup-note">مندوب جديد، سيُسجل عند الإصدار.</p>
          ) : null}
        </section>

        <section className="riders-form-section">
          <h3>بنود العهدة</h3>
          <CustodyItemsEditor
            items={state.items}
            serials={state.serials}
            onUpdate={state.updateItem}
          />
        </section>

        <section className="riders-form-section">
          <h3>العهدة النقدية والإجمالي</h3>
          <div className="riders-form-grid">
            <TextField
              label="العهدة النقدية"
              type="number"
              min={0}
              step="0.01"
              value={state.cashCustody}
              onChange={(event) =>
                state.setCashCustody(
                  Math.max(0, Number(event.target.value) || 0),
                )
              }
              dir="ltr"
            />
            <TextAreaField
              label="ملاحظات"
              value={state.notes}
              onChange={(event) => state.setNotes(event.target.value)}
              placeholder="ملاحظات تظهر على الإيصال"
              maxLength={500}
              fieldClassName="riders-notes"
            />
          </div>
          <CustodySummary
            items={state.normalizedItems}
            cashCustody={state.cashCustody}
            total={state.total}
            words={state.words}
            itemCount={state.itemCount}
          />
        </section>

        {state.formError ? <p className="form-error">{state.formError}</p> : null}

        <div className="riders-form-actions">
          <Button variant="ghost" onClick={onClose} disabled={state.submitting}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={
              state.submitting ||
              state.hasBlockingLookup ||
              !state.sequence ||
              !state.governorate ||
              !state.city
            }
          >
            {state.submitting ? "جارٍ الإصدار…" : "إصدار الإيصال"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
