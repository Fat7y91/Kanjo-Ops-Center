import type { ContractState, RepOpinion, RepOpinionTrait } from "@/lib/field-ops/types";
import { REP_OPINIONS } from "@/lib/field-ops/types";

export type OutcomeOption = {
  value: ContractState;
  label: string;
  description: string;
  advanced: boolean;
};

/**
 * Reps can only choose the three non-signature outcomes. `signed_contract` is
 * deliberately absent: signing is an admin governance action on the CRM card.
 */
export const REP_OUTCOME_ORDER: ContractState[] = [
  "no_agreement",
  "provisional",
  "final_contract",
];

export const OUTCOME_LABELS: Record<
  ContractState,
  { label: string; description: string }
> = {
  no_agreement: {
    label: "بدون تعاقد",
    description: "الزيارة انتهت دون اتفاق. يستمر التاجر في المسار الطبيعي.",
  },
  provisional: {
    label: "اتفاق مبدئي",
    description: "قبول مبدئي للعمولة، مع حاجة لجولة نهائية.",
  },
  final_contract: {
    label: "اتفاق نهائي",
    description: "بنود نهائية متفق عليها. اعتماد التوقيع يتم من كارت التاجر.",
  },
  signed_contract: {
    label: "توقيع العقد",
    description: "اعتماد إداري فقط من كارت التاجر.",
  },
};

export const DEFAULT_WEIGHTS: Record<RepOpinionTrait, number> = {
  cooperative: 60,
  difficult: 40,
  commission_conservative: 50,
  marketing_interested: 50,
  price_sensitive: 50,
  expansion_ready: 50,
};

export type OpinionState = {
  trait: string;
  label?: string;
  weight: number;
  enabled: boolean;
};

export function toOpinionState(
  opinions: RepOpinion[] | undefined,
): Record<string, OpinionState> {
  const next: Record<string, OpinionState> = {};
  for (const trait of REP_OPINIONS) {
    next[trait] = {
      trait,
      weight: DEFAULT_WEIGHTS[trait],
      enabled: false,
    };
  }
  for (const opinion of opinions ?? []) {
    const existing = next[opinion.trait];
    next[opinion.trait] = {
      trait: opinion.trait,
      label: opinion.label,
      weight: opinion.weight > 0 ? opinion.weight : existing?.weight ?? 50,
      enabled: true,
    };
  }
  return next;
}
