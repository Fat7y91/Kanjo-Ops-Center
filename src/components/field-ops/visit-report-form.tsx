"use client";

import { Modal } from "@/components/field-ops/modal";
import { ContactSection } from "@/components/field-ops/visit/contact-section";
import { FollowupSection } from "@/components/field-ops/visit/followup-section";
import { OpinionSection } from "@/components/field-ops/visit/opinion-section";
import { OutcomeSection } from "@/components/field-ops/visit/outcome-section";
import type { VisitDraft } from "@/components/field-ops/visit-mode";
import {
  type ContractState,
  type FollowUpKind,
  type Merchant,
  type RepOpinion,
} from "@/lib/field-ops/types";

import { useVisitReportForm } from "./use-visit-report-form";

export type VisitReportDraft = {
  outcome: ContractState;
  notes: string;
  contact: { name: string; role: string; mobile: string };
  opinions: RepOpinion[];
  agreedCommission: number | null;
  followUpAt: string;
  followUpKind: FollowUpKind;
  followUpNote: string;
  followUpContactNumber: string;
};

type VisitReportFormProps = {
  open: boolean;
  merchant: Merchant | null;
  draft: VisitDraft | null;
  visitCount: number;
  canManageState: boolean;
  offline: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (report: VisitReportDraft) => void;
};

export function VisitReportForm({
  open,
  merchant,
  draft,
  visitCount,
  canManageState,
  offline,
  saving,
  onClose,
  onSubmit,
}: VisitReportFormProps) {
  const form = useVisitReportForm({
    open,
    merchant,
    visitCount,
    canManageState,
    onSubmit,
  });

  if (!merchant) return null;
  return (
    <Modal
      open={open}
      title={`تقرير الزيارة — ${merchant.name}`}
      eyebrow="إدخال بيانات الزيارة"
      description={
        offline
          ? "لا يوجد اتصال الآن. سيُحفظ التقرير محلياً ويُزامن تلقائياً عند عودة الشبكة."
          : "سيُحفظ التقرير مباشرة ويُحدّث كارت التاجر بالكامل."
      }
      onClose={onClose}
      wide
    >
      <form className="form-stack visit-report-form" onSubmit={form.submit}>
        <ContactSection
          draft={draft}
          visitCount={visitCount}
          contactName={form.contactName}
          contactRole={form.contactRole}
          contactMobile={form.contactMobile}
          onNameChange={form.setContactName}
          onRoleChange={form.setContactRole}
          onMobileChange={form.setContactMobile}
        />

        <OutcomeSection
          merchant={merchant}
          visitCount={visitCount}
          canUseAdvanced={form.canUseAdvanced}
          outcomeOptions={form.outcomeOptions}
          outcome={form.outcome}
          agreedCommission={form.agreedCommission}
          onOutcomeChange={form.setOutcome}
          onCommissionChange={form.setAgreedCommission}
        />

        <label className="field">
          <span>التقرير النوعي الكامل</span>
          <textarea
            rows={5}
            value={form.notes}
            onChange={(event) => form.setNotes(event.target.value)}
            placeholder="ماذا لاحظت؟ بمن قابلت؟ ما الاتفاق الذي تم؟ ما الخطوة التالية؟"
            minLength={10}
            required
          />
          <span className="field-hint">
            10 أحرف على الأقل. يُحفظ التقرير في السجل الزمني لكارت التاجر.
          </span>
        </label>

        <OpinionSection
          opinionState={form.opinionState}
          activeCount={form.activeOpinions.length}
          customEnabled={form.customEnabled}
          customLabel={form.customLabel}
          customWeight={form.customWeight}
          onPatch={form.patchOpinion}
          onToggleCustom={form.setCustomEnabled}
          onCustomLabelChange={form.setCustomLabel}
          onCustomWeightChange={form.setCustomWeight}
        />

        <FollowupSection
          followUpAt={form.followUpAt}
          followUpKind={form.followUpKind}
          followUpNote={form.followUpNote}
          followUpContactNumber={form.followUpContactNumber}
          merchantTeam={merchant.team}
          onAtChange={form.setFollowUpAt}
          onKindChange={form.changeFollowUpKind}
          onNoteChange={form.setFollowUpNote}
          onContactNumberChange={form.setFollowUpContactNumber}
        />

        {form.error ? (
          <p className="form-error" role="alert">
            {form.error}
          </p>
        ) : null}

        <div className="form-actions">
          <button
            type="button"
            className="button button-quiet"
            onClick={onClose}
            disabled={saving}
          >
            إلغاء
          </button>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving
              ? "جارٍ الحفظ…"
              : offline
                ? "حفظ محلياً ومزامنة لاحقاً"
                : "حفظ التقرير"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
