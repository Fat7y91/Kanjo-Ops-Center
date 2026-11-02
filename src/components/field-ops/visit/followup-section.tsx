"use client";

import { FOLLOW_UP_KINDS, FOLLOW_UP_KIND_META } from "@/lib/field-ops/types";
import type { FollowUpKind } from "@/lib/field-ops/types";
import { sanitizePhone } from "@/lib/field-ops/phone";

type FollowupSectionProps = {
  followUpAt: string;
  followUpKind: FollowUpKind | null;
  followUpNote: string;
  followUpContactNumber: string;
  /** Merchant's team, used only to explain where the task will land. */
  merchantTeam: string | null;
  /** Inline error for the chosen type, surfaced by the validator. */
  kindError?: string;
  /** Inline error for the scheduled date, surfaced by the validator. */
  atError?: string;
  /** Inline error for this field, surfaced by the form's validator. */
  error?: string;
  onAtChange: (value: string) => void;
  onKindChange: (value: FollowUpKind | null) => void;
  onNoteChange: (value: string) => void;
  onContactNumberChange: (value: string) => void;
};

export function FollowupSection({
  followUpAt,
  followUpKind,
  followUpNote,
  followUpContactNumber,
  merchantTeam,
  kindError,
  atError,
  error,
  onAtChange,
  onKindChange,
  onNoteChange,
  onContactNumberChange,
}: FollowupSectionProps) {
  /*
   * A follow-up is opt-in. The dropdown defaults to "none", and only a chosen
   * type makes the number mandatory — an agreement no longer forces it, because
   * that requirement moved to the merchant's primary mobile at the top.
   */
  const enabled = followUpKind != null;
  const required = enabled;

  return (
    <section className="visit-form-section">
      <div className="visit-form-head">
        <p className="eyebrow">مهمة متابعة</p>
        <span className="badge badge-purple">
          {required ? "رقم الهاتف إلزامي" : "بدون متابعة"}
        </span>
      </div>
      <div className="visit-followup-grid">
        <label className={`field${kindError ? " field-invalid" : ""}`}>
          <span>نوع المتابعة</span>
          <select
            value={followUpKind ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              onKindChange(value === "" ? null : (value as FollowUpKind));
            }}
          >
            <option value="">بدون متابعة</option>
            {FOLLOW_UP_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {FOLLOW_UP_KIND_META[kind].label}
              </option>
            ))}
          </select>
          {kindError ? (
            <span className="field-error" role="alert">
              {kindError}
            </span>
          ) : null}
        </label>
        <label className={`field${atError ? " field-invalid" : ""}`}>
          <span>الموعد</span>
          <input
            type="datetime-local"
            value={followUpAt}
            onChange={(event) => onAtChange(event.target.value)}
            disabled={!enabled}
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
            disabled={!enabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "followup-contact-error" : undefined}
          />
          <span className="field-hint">
            {required
              ? "إلزامي عند اختيار نوع متابعة. يُملأ تلقائياً من جهة الاتصال ويمكن تعديله."
              : "اختر نوع متابعة أولاً لإضافة الرقم."}
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
            disabled={!enabled}
          />
        </label>
      </div>
      {enabled && followUpAt ? (
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
