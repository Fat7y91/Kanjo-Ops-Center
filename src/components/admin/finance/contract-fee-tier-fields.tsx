"use client";

import { TextField } from "@/components/ui/form-inputs";

import type { FeeDraft } from "./use-commission-rates-form";

type ContractFeeTierFieldsProps = {
  drafts: FeeDraft;
  disabled: boolean;
  onChange: (key: keyof FeeDraft, value: string) => void;
};

/**
 * The four achievement bands that price a closed contract. The labels carry
 * the boundary, so the reader never has to guess which band 100% falls into.
 */
const TIERS: readonly {
  key: keyof FeeDraft;
  label: string;
  hint: string;
}[] = [
  {
    key: "contractFeeTier1",
    label: "أقل من 80%",
    hint: "الرسم عند تحقيق أقل من 80% من المستهدف.",
  },
  {
    key: "contractFeeTier2",
    label: "من 80% إلى 90%",
    hint: "الرسم عند تحقيق 80% حتى أقل من 90%.",
  },
  {
    key: "contractFeeTier3",
    label: "من 90% إلى 100%",
    hint: "الرسم عند تحقيق 90% حتى أقل من 100%.",
  },
  {
    key: "contractFeeTier4",
    label: "فوق 100%",
    hint: "الرسم عند تحقيق 100% أو أكثر.",
  },
];

export function ContractFeeTierFields({
  drafts,
  disabled,
  onChange,
}: ContractFeeTierFieldsProps) {
  return (
    <fieldset className="commission-tier-fieldset">
      <legend>رسم التعاقد حسب نسبة تحقيق المستهدف</legend>
      <p className="commission-tier-note">
        يُختار الرسم تلقائياً حسب نسبة (المحقق ÷ المستهدف) × 100 لكل عقد مُغلق.
      </p>
      <div className="commission-fees-grid commission-fees-grid-tiers">
        {TIERS.map((tier) => (
          <TextField
            key={tier.key}
            label={tier.label}
            hint={tier.hint}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            dir="ltr"
            required
            value={drafts[tier.key]}
            onChange={(event) => onChange(tier.key, event.target.value)}
            disabled={disabled}
          />
        ))}
      </div>
    </fieldset>
  );
}
