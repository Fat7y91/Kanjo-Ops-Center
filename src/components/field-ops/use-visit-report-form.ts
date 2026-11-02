import { useEffect, useMemo, useState } from "react";

import {
  OUTCOME_LABELS,
  REP_OUTCOME_ORDER,
  toOpinionState,
  type OpinionState,
  type OutcomeOption,
} from "@/components/field-ops/visit/outcome-options";
import {
  validateVisitForm,
  type VisitFormField,
} from "@/components/field-ops/visit/validate-visit-form";
import { isCommunicationKind, sanitizePhone } from "@/lib/field-ops/phone";
import {
  ADVANCED_OUTCOMES,
  type ContractState,
  type FollowUpKind,
  type Merchant,
} from "@/lib/field-ops/types";

import type { VisitReportDraft } from "./visit-report-form";

/**
 * State machine and submit handler for the visit report form.
 *
 * Extracted from the render module so the modal body stays a presentation of
 * state, and so the reset-on-open rule and the inline-error rule live in one
 * testable place. The form is a controlled form, not React Hook Form: the app
 * carries no form library, and the validation rules are already pure functions
 * in `validate-visit-form.ts`.
 */
export function useVisitReportForm(options: {
  open: boolean;
  merchant: Merchant | null;
  visitCount: number;
  canManageState: boolean;
  onSubmit: (report: VisitReportDraft) => void;
}) {
  const { open, merchant, visitCount, canManageState, onSubmit } = options;

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
  const [errorField, setErrorField] = useState<VisitFormField | null>(null);

  /** Only the field that failed carries a message; the rest stay clean. */
  function fieldError(field: VisitFormField): string | undefined {
    return errorField === field ? error : undefined;
  }

  function clearError() {
    setError("");
    setErrorField(null);
  }

  const canUseAdvanced = visitCount > 0 || canManageState;

  // Reset whenever a new visit opens; the modal stays mounted, so React state
  // would otherwise leak the previous merchant's answers into a new report.
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
    setErrorField(null);
  }, [open, merchant, visitCount]);

  const outcomeOptions = useMemo<OutcomeOption[]>(() => {
    return REP_OUTCOME_ORDER.map((state) => ({
      value: state,
      label: OUTCOME_LABELS[state].label,
      description: OUTCOME_LABELS[state].description,
      advanced: ADVANCED_OUTCOMES.includes(state),
    })).filter((option) => !option.advanced || canUseAdvanced);
  }, [canUseAdvanced]);

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

  function changeContactNumber(value: string) {
    setFollowUpContactNumber(value);
    // Typing in the failing field is the rep acknowledging it; keeping the old
    // message on screen while the value changes reads as a stale error.
    if (errorField === "followUpContactNumber") clearError();
  }

  function patchOpinion(trait: string, patch: Partial<OpinionState>) {
    setOpinionState((current) => ({
      ...current,
      [trait]: { ...current[trait], ...patch },
    }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();

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
      hasTeam: Boolean(merchant?.team),
    });

    if (!result.ok) {
      setError(result.error);
      setErrorField(result.field);
      return;
    }

    onSubmit(result.payload);
  }

  const activeOpinions = Object.values(opinionState).filter(
    (state) => state.enabled,
  );

  return {
    outcome,
    setOutcome,
    notes,
    setNotes,
    contactName,
    setContactName,
    contactRole,
    setContactRole,
    contactMobile,
    setContactMobile,
    opinionState,
    customLabel,
    setCustomLabel,
    customWeight,
    setCustomWeight,
    customEnabled,
    setCustomEnabled,
    agreedCommission,
    setAgreedCommission,
    followUpAt,
    setFollowUpAt,
    followUpKind,
    followUpNote,
    setFollowUpNote,
    followUpContactNumber,
    changeFollowUpKind,
    changeContactNumber,
    outcomeOptions,
    activeOpinions,
    patchOpinion,
    fieldError,
    submit,
    canUseAdvanced,
  };
}
