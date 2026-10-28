"use client";

import {
  REP_OPINIONS,
  REP_OPINION_META,
} from "@/lib/field-ops/types";

import type { OpinionState } from "./outcome-options";

type OpinionSectionProps = {
  opinionState: Record<string, OpinionState>;
  activeCount: number;
  customEnabled: boolean;
  customLabel: string;
  customWeight: number;
  onPatch: (trait: string, patch: Partial<OpinionState>) => void;
  onToggleCustom: (enabled: boolean) => void;
  onCustomLabelChange: (value: string) => void;
  onCustomWeightChange: (weight: number) => void;
};

export function OpinionSection({
  opinionState,
  activeCount,
  customEnabled,
  customLabel,
  customWeight,
  onPatch,
  onToggleCustom,
  onCustomLabelChange,
  onCustomWeightChange,
}: OpinionSectionProps) {
  return (
    <section className="visit-form-section">
      <div className="visit-form-head">
        <p className="eyebrow">رأي المندوب</p>
        <span className="badge">
          {activeCount + (customEnabled ? 1 : 0)} وسم مفعّل
        </span>
      </div>
      <p className="field-hint opinion-hint">
        فعّل ما ينطبق واضبط الوزن من 0% إلى 100%. الوزن يعبّر عن شدة الملاحظة،
        ويُجمع في كارت التاجر بأعلى قيمة مسجلة لكل وسم.
      </p>
      <div className="opinion-slider-grid">
        {REP_OPINIONS.map((trait) => {
          const state = opinionState[trait];
          const meta = REP_OPINION_META[trait];
          return (
            <div
              key={trait}
              className={`opinion-slider${state.enabled ? " is-active" : ""}`}
            >
              <div className="opinion-slider-head">
                <label className="opinion-slider-toggle">
                  <input
                    type="checkbox"
                    checked={state.enabled}
                    onChange={(event) =>
                      onPatch(trait, { enabled: event.target.checked })
                    }
                  />
                  <span className={`badge ${meta.tone}`}>{meta.label}</span>
                </label>
                <strong className="opinion-weight">{state.weight}%</strong>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={state.weight}
                disabled={!state.enabled}
                onChange={(event) =>
                  onPatch(trait, { weight: Number(event.target.value) })
                }
                aria-label={`وزن ${meta.label}`}
              />
            </div>
          );
        })}
      </div>

      <div
        className={`opinion-slider opinion-custom${customEnabled ? " is-active" : ""}`}
      >
        <div className="opinion-slider-head">
          <label className="opinion-slider-toggle">
            <input
              type="checkbox"
              checked={customEnabled}
              onChange={(event) => onToggleCustom(event.target.checked)}
            />
            <span className="badge badge-purple">أخرى / مخصص</span>
          </label>
          <strong className="opinion-weight">
            {customEnabled ? `${customWeight}%` : "غير مفعّل"}
          </strong>
        </div>
        <input
          type="text"
          value={customLabel}
          disabled={!customEnabled}
          onChange={(event) => onCustomLabelChange(event.target.value)}
          placeholder="صف الملاحظة بكلماتك، مثال: يطلب حصرية التوزيع"
          maxLength={60}
        />
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={customWeight}
          disabled={!customEnabled}
          onChange={(event) => onCustomWeightChange(Number(event.target.value))}
          aria-label="وزن الرأي المخصص"
        />
      </div>
    </section>
  );
}
