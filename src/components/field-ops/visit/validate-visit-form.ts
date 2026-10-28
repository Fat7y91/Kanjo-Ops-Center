import { isCommunicationKind } from "@/lib/field-ops/phone";
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
  followUpKind: FollowUpKind;
  followUpNote: string;
  followUpContactNumber: string;
  canUseAdvanced: boolean;
  hasTeam: boolean;
};

export type VisitFormResult =
  | { ok: true; payload: VisitFormPayload }
  | { ok: false; error: string };

export type VisitFormPayload = {
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
    return { ok: false, error: "ملاحظات الزيارة يجب ألا تقل عن 10 أحرف." };
  }
  if (ADVANCED_OUTCOMES.includes(outcome) && !canUseAdvanced) {
    return {
      ok: false,
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
    return { ok: false, error: "أدخل النسبة المتفق عليها بين 1% و100%." };
  }

  if (customEnabled) {
    if (!customLabel.trim()) {
      return {
        ok: false,
        error: "اكتب وصف الرأي المخصص أو ألغِ تفعيله.",
      };
    }
    if (customWeight <= 0) {
      return {
        ok: false,
        error: "وزن الرأي المخصص يجب أن يكون أكبر من صفر.",
      };
    }
  }

  if (followUpAt && new Date(followUpAt).getTime() < Date.now() - 60_000) {
    return { ok: false, error: "موعد المتابعة يجب أن يكون في المستقبل." };
  }
  if (followUpAt && !hasTeam) {
    return {
      ok: false,
      error: "لا يمكن جدولة مهمة متابعة قبل إسناد التاجر لفريق.",
    };
  }
  if (
    followUpAt &&
    isCommunicationKind(followUpKind) &&
    followUpContactNumber.replace(/\D/g, "").length < 8
  ) {
    return {
      ok: false,
      error: "أدخل رقم هاتف صالحاً لمهمة المتابعة (8 أرقام على الأقل).",
    };
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
      followUpAt,
      followUpKind,
      followUpNote: values.followUpNote,
      followUpContactNumber: isCommunicationKind(followUpKind)
        ? followUpContactNumber.replace(/[\s-()]/g, "")
        : "",
    },
  };
}
