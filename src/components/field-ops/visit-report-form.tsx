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
import { isCommunicationKind, sanitizePhone } from "@/lib/field-ops/phone";
import {
  ADVANCED_OUTCOMES,
  type ContractState,
  type FollowUpKind,
  type Merchant,
  type RepOpinion,
} from "@/lib/field-ops/types";

import { validateVisitForm } from "./visit/validate-visit-form";

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
  const [followUpContactNumber, setFollowUpContactNumber] = useState("");
  const [error, setError] = useState("");

  const canUseAdvanced = visitCount > 0 || canManageState;

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
    setFollowUpContactNumber("");
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

  function changeFollowUpKind(kind: FollowUpKind) {
    setFollowUpKind(kind);
    // Auto-fill the dialable number from the visit contact so a communication
    // follow-up is immediately actionable. Only fills an empty field, so a rep
    // who already typed an override keeps it.
    if (isCommunicationKind(kind) && !followUpContactNumber.trim()) {
      const fallback = sanitizePhone(contactMobile);
      if (fallback) setFollowUpContactNumber(fallback);
    }
  }

  function patchOpinion(trait: string, patch: Partial<OpinionState>) {
    setOpinionState((current) => ({
      ...current,
      [trait]: { ...current[trait], ...patch },
    }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const result = validateVisitForm({
      outcome,
      notes,
      contactName,
      contactRole,
      contactMobile,
      opinionState,
      customEnabled,
      customLabel,
      customWeight,
      agreedCommission,
      followUpAt,
      followUpKind,
      followUpNote,
      followUpContactNumber,
      canUseAdvanced,
      hasTeam: Boolean(target.team),
    });

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onSubmit(result.payload);
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
          merchant={merchant}
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
          followUpContactNumber={followUpContactNumber}
          merchantTeam={merchant.team}
          onAtChange={setFollowUpAt}
          onKindChange={changeFollowUpKind}
          onNoteChange={setFollowUpNote}
          onContactNumberChange={setFollowUpContactNumber}
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
