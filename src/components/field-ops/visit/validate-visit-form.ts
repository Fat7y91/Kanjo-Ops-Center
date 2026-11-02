import {
  ADVANCED_OUTCOMES,
  COMMISSION_OUTCOMES,
} from "@/lib/field-ops/types";
import type {
  ContractState,
  FollowUpKind,
  RepOpinion,
} from "@/lib/field-ops/types";

import type { OpinionState } from "./outcome-options";

export type VisitFormValues = {
  outcome: ContractState;
  notes: string;
  contactName: string;
  contactRole: string;
  contactMobile: string;
  opinionState: Record<string, OpinionState>;
  customEnabled: boolean;
  customLabel: string;
  customWeight: number;
  agreedCommission: string;
  followUpAt: string;
  followUpKind: FollowUpKind | null;
  followUpNote: string;
  followUpContactNumber: string;
  canUseAdvanced: boolean;
  hasTeam: boolean;
};

/** Field key a validation failure belongs to, so the form can show it inline. */
export type VisitFormField =
  | "outcome"
  | "notes"
  | "contactMobile"
  | "followUpKind"
  | "agreedCommission"
  | "customLabel"
  | "customWeight"
  | "followUpAt"
  | "followUpContactNumber";

export type VisitFormResult =
  | { ok: true; payload: VisitFormPayload }
  | { ok: false; error: string; field: VisitFormField };

export type VisitFormPayload = {
  outcome: ContractState;
  notes: string;
  contact: { name: string; role: string; mobile: string };
  opinions: RepOpinion[];
  agreedCommission: number | null;
  followUpAt: string;
  followUpKind: FollowUpKind | null;
  followUpNote: string;
  followUpContactNumber: string;
};

/**
 * Pure validation for the visit report form. Kept out of the component so the
 * conditional state-machine rules are unit-testable and the JSX stays small.
 */
export function validateVisitForm(values: VisitFormValues): VisitFormResult {
  const {
    outcome,
    notes,
    customEnabled,
    customLabel,
    customWeight,
    agreedCommission,
    followUpAt,
    followUpKind,
    followUpContactNumber,
    canUseAdvanced,
    hasTeam,
  } = values;

  if (notes.trim().length < 10) {
    return {
      ok: false,
      field: "notes",
      error: "ملاحظات الزيارة يجب ألا تقل عن 10 أحرف.",
    };
  }
  if (ADVANCED_OUTCOMES.includes(outcome) && !canUseAdvanced) {
    return {
      ok: false,
      field: "outcome",
      error:
        "«اتفاق نهائي» متاح فقط للتجار الذين لديهم زيارة سابقة مسجلة في سجلهم.",
    };
  }

  const needsCommission = COMMISSION_OUTCOMES.includes(outcome);
  const commission = Number(agreedCommission);
  if (
    needsCommission &&
    (!agreedCommission.trim() ||
      !Number.isFinite(commission) ||
      commission <= 0 ||
      commission > 100)
  ) {
    return {
      ok: false,
      field: "agreedCommission",
      error: "أدخل النسبة المتفق عليها بين 1% و100%.",
    };
  }

  if (customEnabled) {
    if (!customLabel.trim()) {
      return {
        ok: false,
        field: "customLabel",
        error: "اكتب وصف الرأي المخصص أو ألغِ تفعيله.",
      };
    }
    if (customWeight <= 0) {
      return {
        ok: false,
        field: "customWeight",
        error: "وزن الرأي المخصص يجب أن يكون أكبر من صفر.",
      };
    }
  }

  /*
   * An agreement is signed against the merchant's primary mobile at the top of
   * the form, so that is the number the record needs — not the follow-up
   * field. Mirrors `visitReportSchema`.
   */
  if (COMMISSION_OUTCOMES.includes(outcome)) {
    const mobileDigits = values.contactMobile.replace(/\D/g, "");
    if (mobileDigits.length === 0) {
      return {
        ok: false,
        field: "contactMobile",
        error: "رقم موبايل التاجر مطلوب عند تسجيل اتفاق.",
      };
    }
    if (mobileDigits.length < 8) {
      return {
        ok: false,
        field: "contactMobile",
        error: "رقم الموبايل يجب أن يحتوي 8 أرقام على الأقل.",
      };
    }
  }

  /*
   * Picking a type is the rep's explicit opt-in, so it demands a schedule and
   * a dialable number. No type means no follow-up and nothing to fill in. The
   * server keys off the schedule instead, so a cached legacy payload that
   * carries a default type without a date still syncs.
   */
  const wantsFollowUp = followUpKind != null;
  if (wantsFollowUp && !followUpAt) {
    return {
      ok: false,
      field: "followUpAt",
      error: "حدد موعد المتابعة أو اختر «بدون متابعة».",
    };
  }
  if (wantsFollowUp) {
    if (new Date(followUpAt).getTime() < Date.now() - 60_000) {
      return {
        ok: false,
        field: "followUpAt",
        error: "موعد المتابعة يجب أن يكون في المستقبل.",
      };
    }
    if (!hasTeam) {
      return {
        ok: false,
        field: "followUpAt",
        error: "لا يمكن جدولة مهمة متابعة قبل إسناد التاجر لفريق.",
      };
    }
    const digits = followUpContactNumber.replace(/\D/g, "");
    if (digits.length === 0) {
      return {
        ok: false,
        field: "followUpContactNumber",
        error: "رقم هاتف المتابعة مطلوب عند اختيار نوع متابعة.",
      };
    }
    if (digits.length < 8) {
      return {
        ok: false,
        field: "followUpContactNumber",
        error: "رقم هاتف المتابعة يجب أن يحتوي 8 أرقام على الأقل.",
      };
    }
  }

  const opinions: RepOpinion[] = Object.values(values.opinionState)
    .filter((state) => state.enabled && state.weight > 0)
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

  return {
    ok: true,
    payload: {
      outcome,
      notes,
      contact: {
        name: values.contactName,
        role: values.contactRole,
        mobile: values.contactMobile,
      },
      opinions,
      agreedCommission: needsCommission ? commission : null,
      followUpAt: wantsFollowUp ? followUpAt : "",
      followUpKind: wantsFollowUp ? followUpKind : null,
      followUpNote: wantsFollowUp ? values.followUpNote : "",
      followUpContactNumber: wantsFollowUp
        ? followUpContactNumber.replace(/[\s-()]/g, "")
        : "",
    },
  };
}
