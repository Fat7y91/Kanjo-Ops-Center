"use client";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import {
  TextAreaField,
  TextField,
} from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import { Tabs } from "@/components/ui/tabs";
import type {
  CustodyIssueResult,
  LocationCatalog,
  Rider,
} from "@/lib/riders/types";

import { CustodyItemsEditor } from "./custody-items-editor";
import { CustodyRiderFields } from "./custody-rider-fields";
import { CustodyRiderPicker } from "./custody-rider-picker";
import { CustodySummary } from "./custody-summary";
import { useIssueCustody } from "./use-issue-custody";

type IssueCustodyModalProps = {
  locations: LocationCatalog;
  riders: Rider[];
  initialRider: Rider | null;
  onClose: () => void;
  onIssued: (result: CustodyIssueResult) => void;
};

export function IssueCustodyModal({
  locations,
  riders,
  initialRider,
  onClose,
  onIssued,
}: IssueCustodyModalProps) {
  const state = useIssueCustody({
    locations,
    riders,
    initialRider,
    onIssued,
  });

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
  const canSubmit =
    !state.submitting &&
    !state.hasBlockingLookup &&
    Boolean(state.governorate) &&
    Boolean(state.city) &&
    Boolean(state.receiptSequence) &&
    (state.riderMode === "existing"
      ? state.existingRider !== null
      : Boolean(state.sequence));

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
          <h3>نوع المندوب</h3>
          <Tabs
            items={[
              { id: "new", label: "مندوب جديد", content: null },
              { id: "existing", label: "مندوب حالي", content: null },
            ]}
            selectedIndex={state.modeIndex}
            onChange={state.changeMode}
            showPanels={false}
          />
        </section>

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
              label="رقم تسلسل المندوب"
              type="number"
              min={1}
              max={9999}
              value={state.sequence ?? ""}
              onChange={(event) =>
                state.changeRiderSequence(
                  event.target.value
                    ? Math.max(1, Math.min(9999, Number(event.target.value)))
                    : null,
                )
              }
              readOnly={state.riderMode === "existing"}
              hint={
                state.nextLoading
                  ? "جارٍ حساب التسلسل…"
                  : "تسلسل مستقل عن سيريالات الأدوات."
              }
              dir="ltr"
            />
            <TextField
              label="رقم تسلسل الإيصال"
              type="number"
              min={1}
              max={9999}
              value={state.receiptSequence ?? ""}
              onChange={(event) =>
                state.changeReceiptSequence(
                  event.target.value
                    ? Math.max(1, Math.min(9999, Number(event.target.value)))
                    : null,
                )
              }
              hint="عدد مستقل لكل إيصال في هذه المدينة."
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

        {state.riderMode === "new" ? (
          <CustodyRiderFields
            fullName={state.fullName}
            nationalId={state.nationalId}
            phone={state.phone}
            workArea={state.workArea}
            deliveryDate={state.deliveryDate}
            handoverOfficer={state.handoverOfficer}
            locked={state.locked}
            lookup={state.lookup}
            lookupState={state.lookupState}
            hasBlockingLookup={state.hasBlockingLookup}
            onFullName={state.setFullName}
            onNationalId={state.changeNationalId}
            onPhone={state.setPhone}
            onWorkArea={state.setWorkArea}
            onDeliveryDate={state.setDeliveryDate}
            onHandoverOfficer={state.setHandoverOfficer}
            onCheck={() => void state.checkRider()}
          />
        ) : (
          <CustodyRiderPicker
            options={state.riderOptions}
            selectedRiderId={state.existingRiderId}
            selectedRider={state.existingRider}
            deliveryDate={state.deliveryDate}
            handoverOfficer={state.handoverOfficer}
            onSelect={state.selectExistingRider}
            onDeliveryDate={state.setDeliveryDate}
            onHandoverOfficer={state.setHandoverOfficer}
          />
        )}

        <section className="riders-form-section">
          <h3>بنود العهدة</h3>
          <CustodyItemsEditor
            items={state.items}
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
            disabled={!canSubmit}
          >
            {state.submitting ? "جارٍ الإصدار…" : "إصدار الإيصال"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
