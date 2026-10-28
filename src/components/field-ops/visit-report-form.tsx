"use client";

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { ContactSection } from "@/components/field-ops/visit/contact-section";
import { FollowupSection } from "@/components/field-ops/visit/followup-section";
import { OpinionSection } from "@/components/field-ops/visit/opinion-section";
import { OutcomeSection } from "@/components/field-ops/visit/outcome-section";
import {
  OUTCOME_LABELS,
  REP_OUTCOME_ORDER,
  toOpinionState,
  type OpinionState,
  type OutcomeOption,
} from "@/components/field-ops/visit/outcome-options";
import type { VisitDraft } from "@/components/field-ops/visit-mode";
import {
  ADVANCED_OUTCOMES,
  COMMISSION_OUTCOMES,
  type ContractState,
  type FollowUpKind,
  type Merchant,
  type RepOpinion,
} from "@/lib/field-ops/types";

export type VisitReportDraft = {
  outcome: ContractState;
  notes: string;
  contact: { name: string; role: string; mobile: string };
  opinions: RepOpinion[];
  agreedCommission: number | null;
  followUpAt: string;
  followUpKind: FollowUpKind;
  followUpNote: string;
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
  const [outcome, setOutcome] = useState<ContractState>("no_agreement");
  const [notes, setNotes] = useState("");
  const [contactName, setContactName] = useState(merchant?.contact?.name ?? "");
  const [contactRole, setContactRole] = useState(merchant?.contact?.role ?? "");
  const [contactMobile, setContactMobile] = useState(
    merchant?.contact?.mobile ?? "",
  );
  const [opinionState, setOpinionState] = useState<Record<string, OpinionState>>(
    () => toOpinionState(merchant?.opinions),
  );
  const [customLabel, setCustomLabel] = useState("");
  const [customWeight, setCustomWeight] = useState(50);
  const [customEnabled, setCustomEnabled] = useState(false);
  const [agreedCommission, setAgreedCommission] = useState<string>(
    merchant?.agreedCommission != null ? String(merchant.agreedCommission) : "",
  );
  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpKind, setFollowUpKind] = useState<FollowUpKind>("visit");
  const [followUpNote, setFollowUpNote] = useState("");
  const [error, setError] = useState("");

  const canUseAdvanced = visitCount > 0 || canManageState;
  const needsCommission = COMMISSION_OUTCOMES.includes(outcome);

  // Reset the form whenever a new visit opens; the modal stays mounted so
  // React state would otherwise leak the previous merchant's answers.
  useEffect(() => {
    if (!open || !merchant) return;
    setOutcome(
      ADVANCED_OUTCOMES.includes(merchant.contractState) && visitCount === 0
        ? "no_agreement"
        : REP_OUTCOME_ORDER.includes(merchant.contractState)
          ? merchant.contractState
          : "no_agreement",
    );
    setNotes("");
    setContactName(merchant.contact?.name ?? "");
    setContactRole(merchant.contact?.role ?? "");
    setContactMobile(merchant.contact?.mobile ?? "");
    setOpinionState(toOpinionState(merchant.opinions));
    const existingCustom = (merchant.opinions ?? []).find(
      (opinion) => opinion.trait === "custom",
    );
    setCustomLabel(existingCustom?.label ?? "");
    setCustomWeight(existingCustom?.weight || 50);
    setCustomEnabled(Boolean(existingCustom));
    setAgreedCommission(
      merchant.agreedCommission != null ? String(merchant.agreedCommission) : "",
    );
    setFollowUpAt("");
    setFollowUpKind("visit");
    setFollowUpNote("");
    setError("");
  }, [open, merchant, visitCount]);

  const outcomeOptions = useMemo<OutcomeOption[]>(() => {
    return REP_OUTCOME_ORDER.map((state) => ({
      value: state,
      label: OUTCOME_LABELS[state].label,
      description: OUTCOME_LABELS[state].description,
      advanced: ADVANCED_OUTCOMES.includes(state),
    })).filter((option) => !option.advanced || canUseAdvanced);
  }, [canUseAdvanced]);

  if (!merchant) return null;
  const target = merchant;
  const activeOpinions = Object.values(opinionState).filter(
    (state) => state.enabled,
  );

  function patchOpinion(trait: string, patch: Partial<OpinionState>) {
    setOpinionState((current) => ({
      ...current,
      [trait]: { ...current[trait], ...patch },
    }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (notes.trim().length < 10) {
      setError("ملاحظات الزيارة يجب ألا تقل عن 10 أحرف.");
      return;
    }
    if (ADVANCED_OUTCOMES.includes(outcome) && !canUseAdvanced) {
      setError(
        "«اتفاق نهائي» متاح فقط للتجار الذين لديهم زيارة سابقة مسجلة في سجلهم.",
      );
      return;
    }

    const commission = Number(agreedCommission);
    if (
      needsCommission &&
      (!agreedCommission.trim() ||
        !Number.isFinite(commission) ||
        commission <= 0 ||
        commission > 100)
    ) {
      setError("أدخل النسبة المتفق عليها بين 1% و100%.");
      return;
    }

    if (customEnabled) {
      if (!customLabel.trim()) {
        setError("اكتب وصف الرأي المخصص أو ألغِ تفعيله.");
        return;
      }
      if (customWeight <= 0) {
        setError("وزن الرأي المخصص يجب أن يكون أكبر من صفر.");
        return;
      }
    }

    if (followUpAt && new Date(followUpAt).getTime() < Date.now() - 60_000) {
      setError("موعد المتابعة يجب أن يكون في المستقبل.");
      return;
    }
    if (followUpAt && !target.team) {
      setError("لا يمكن جدولة مهمة متابعة قبل إسناد التاجر لفريق.");
      return;
    }

    const opinions: RepOpinion[] = activeOpinions
      .filter((state) => state.weight > 0)
      .map((state) => ({
        trait: state.trait,
        weight: state.weight,
        label: state.label,
      }));
    if (customEnabled && customLabel.trim() && customWeight > 0) {
      opinions.push({
        trait: "custom",
        label: customLabel.trim(),
        weight: customWeight,
      });
    }

    onSubmit({
      outcome,
      notes,
      contact: {
        name: contactName,
        role: contactRole,
        mobile: contactMobile,
      },
      opinions,
      agreedCommission: needsCommission ? commission : null,
      followUpAt,
      followUpKind,
      followUpNote,
    });
  }

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
      <form className="form-stack visit-report-form" onSubmit={submit}>
        <ContactSection
          draft={draft}
          visitCount={visitCount}
          contactName={contactName}
          contactRole={contactRole}
          contactMobile={contactMobile}
          onNameChange={setContactName}
          onRoleChange={setContactRole}
          onMobileChange={setContactMobile}
        />

        <OutcomeSection
          merchant={target}
          visitCount={visitCount}
          canUseAdvanced={canUseAdvanced}
          outcomeOptions={outcomeOptions}
          outcome={outcome}
          agreedCommission={agreedCommission}
          onOutcomeChange={setOutcome}
          onCommissionChange={setAgreedCommission}
        />

        <label className="field">
          <span>التقرير النوعي الكامل</span>
          <textarea
            rows={5}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="ماذا لاحظت؟ بمن قابلت؟ ما الاتفاق الذي تم؟ ما الخطوة التالية؟"
            minLength={10}
            required
          />
          <span className="field-hint">
            10 أحرف على الأقل. يُحفظ التقرير في السجل الزمني لكارت التاجر.
          </span>
        </label>

        <OpinionSection
          opinionState={opinionState}
          activeCount={activeOpinions.length}
          customEnabled={customEnabled}
          customLabel={customLabel}
          customWeight={customWeight}
          onPatch={patchOpinion}
          onToggleCustom={setCustomEnabled}
          onCustomLabelChange={setCustomLabel}
          onCustomWeightChange={setCustomWeight}
        />

        <FollowupSection
          followUpAt={followUpAt}
          followUpKind={followUpKind}
          followUpNote={followUpNote}
          contactMobile={contactMobile}
          merchantTeam={merchant.team}
          onAtChange={setFollowUpAt}
          onKindChange={setFollowUpKind}
          onNoteChange={setFollowUpNote}
        />

        {error ? (
          <p className="form-error" role="alert">
            {error}
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
