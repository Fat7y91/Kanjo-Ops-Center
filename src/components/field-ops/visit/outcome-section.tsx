"use client";

import {
  ADVANCED_OUTCOMES,
  COMMISSION_OUTCOMES,
  CONTRACT_STATE_META,
} from "@/lib/field-ops/types";
import type { ContractState, Merchant } from "@/lib/field-ops/types";

import type { OutcomeOption } from "./outcome-options";

type OutcomeSectionProps = {
  merchant: Merchant;
  visitCount: number;
  canUseAdvanced: boolean;
  outcomeOptions: OutcomeOption[];
  outcome: ContractState;
  agreedCommission: string;
  onOutcomeChange: (value: ContractState) => void;
  onCommissionChange: (value: string) => void;
};

export function OutcomeSection({
  merchant,
  visitCount,
  canUseAdvanced,
  outcomeOptions,
  outcome,
  agreedCommission,
  onOutcomeChange,
  onCommissionChange,
}: OutcomeSectionProps) {
  const needsCommission = COMMISSION_OUTCOMES.includes(outcome);

  return (
    <section className="visit-form-section">
      <div className="visit-form-head">
        <p className="eyebrow">نتيجة الزيارة</p>
        <span className="badge badge-gold">
          {visitCount === 0
            ? "أول زيارة — خيار الاتفاق النهائي مخفي"
            : `زيارة رقم ${visitCount + 1}`}
        </span>
      </div>

      <div className="outcome-grid">
        {outcomeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`outcome-option${outcome === option.value ? " outcome-option-active" : ""}`}
            onClick={() => onOutcomeChange(option.value)}
            aria-pressed={outcome === option.value}
          >
            <strong>{option.label}</strong>
            <span>{option.description}</span>
            {option.advanced ? (
              <em className="outcome-advanced-tag">يتطلب زيارة سابقة</em>
            ) : null}
          </button>
        ))}
      </div>

      <p className="inline-note">
        اعتماد توقيع العقد يتم حصرياً من كارت التاجر بواسطة مدير الحالات.
      </p>

      {ADVANCED_OUTCOMES.includes(outcome) && canUseAdvanced ? (
        <p className="visit-advanced-note">
          هذا الخيار يفترض وجود اتفاق سابق. تأكد من مطابقة الحالة الحالية (
          {CONTRACT_STATE_META[merchant.contractState].label}) قبل الحفظ.
        </p>
      ) : null}

      {needsCommission ? (
        <label className="field field-commission">
          <span>النسبة المتفق عليها (%)</span>
          <input
            type="number"
            min={1}
            max={100}
            step={0.5}
            inputMode="decimal"
            value={agreedCommission}
            onChange={(event) => onCommissionChange(event.target.value)}
            placeholder="مثال: 12"
            required
          />
          <span className="field-hint">
            إلزامية عند الاتفاق المبدئي أو النهائي. تُحفظ في كارت التاجر وتُقفل
            نهائياً عند اعتماد التوقيع.
          </span>
        </label>
      ) : null}
    </section>
  );
}
