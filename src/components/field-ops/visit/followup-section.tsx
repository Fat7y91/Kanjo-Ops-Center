"use client";

import {
  FOLLOW_UP_KINDS,
  FOLLOW_UP_KIND_META,
  COMMISSION_OUTCOMES,
} from "@/lib/field-ops/types";
import type { ContractState, FollowUpKind } from "@/lib/field-ops/types";
import { sanitizePhone } from "@/lib/field-ops/phone";

type FollowupSectionProps = {
  followUpAt: string;
  followUpKind: FollowUpKind;
  followUpNote: string;
  followUpContactNumber: string;
  /** The chosen visit outcome, so the number can be marked mandatory. */
  outcome: ContractState;
  /** Merchant's team, used only to explain where the task will land. */
  merchantTeam: string | null;
  /** Inline error for the scheduled date, surfaced by the validator. */
  atError?: string;
  /** Inline error for this field, surfaced by the form's validator. */
  error?: string;
  onAtChange: (value: string) => void;
  onKindChange: (value: FollowUpKind) => void;
  onNoteChange: (value: string) => void;
  onContactNumberChange: (value: string) => void;
};

export function FollowupSection({
  followUpAt,
  followUpKind,
  followUpNote,
  followUpContactNumber,
  outcome,
  merchantTeam,
  atError,
  error,
  onAtChange,
  onKindChange,
  onNoteChange,
  onContactNumberChange,
}: FollowupSectionProps) {
  /*
   * The number is mandatory whenever the report schedules a follow-up or
   * records an agreement. It used to be rendered only for call/WhatsApp, which
   * is why a rep choosing a plain "visit" follow-up never saw the input and
   * still failed server validation. The field is now always present; only the
   * `required` marker and the hint change with context.
   */
  const required =
    Boolean(followUpAt) || COMMISSION_OUTCOMES.includes(outcome);

  return (
    <section className="visit-form-section">
      <div className="visit-form-head">
        <p className="eyebrow">مهمة متابعة</p>
        <span className="badge badge-purple">
          {required ? "رقم الهاتف إلزامي" : "اختياري"}
        </span>
      </div>
      <div className="visit-followup-grid">
        <label className="field">
          <span>نوع المتابعة</span>
          <select
            value={followUpKind}
            onChange={(event) =>
              onKindChange(event.target.value as FollowUpKind)
            }
          >
            {FOLLOW_UP_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {FOLLOW_UP_KIND_META[kind].label}
              </option>
            ))}
          </select>
        </label>
        <label className={`field${atError ? " field-invalid" : ""}`}>
          <span>الموعد</span>
          <input
            type="datetime-local"
            value={followUpAt}
            onChange={(event) => onAtChange(event.target.value)}
            aria-invalid={atError ? true : undefined}
          />
          {atError ? (
            <span className="field-error" role="alert">
              {atError}
            </span>
          ) : null}
        </label>
        <label className={`field${error ? " field-invalid" : ""}`}>
          <span>
            رقم هاتف المتابعة
            {required ? <em className="field-required">مطلوب</em> : null}
          </span>
          <input
            type="tel"
            value={followUpContactNumber}
            onChange={(event) => onContactNumberChange(event.target.value)}
            placeholder="01xxxxxxxxx"
            inputMode="tel"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "followup-contact-error" : undefined}
          />
          <span className="field-hint">
            {required
              ? "إلزامي عند تسجيل متابعة أو اتفاق. يُملأ تلقائياً من جهة الاتصال ويمكن تعديله."
              : "يُملأ تلقائياً من جهة الاتصال ويمكن تعديله."}
          </span>
          {error ? (
            <span className="field-error" id="followup-contact-error" role="alert">
              {error}
            </span>
          ) : null}
        </label>
        <label className="field visit-followup-note">
          <span>ملاحظة المتابعة</span>
          <input
            type="text"
            value={followUpNote}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="ما المطلوب في المتابعة؟"
            maxLength={200}
          />
        </label>
      </div>
      {followUpAt ? (
        <p className="inline-note">
          ستُنشأ مهمة مجدولة لفريق {merchantTeam ?? "غير مسند"} وتظهر في لوحة
          العمليات الميدانية.
          {!sanitizePhone(followUpContactNumber)
            ? " أضف رقم هاتف المتابعة لتظهر أزرار الاتصال والواتساب المباشرة."
            : ""}
        </p>
      ) : null}
    </section>
  );
}
