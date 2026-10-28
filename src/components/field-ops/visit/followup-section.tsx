"use client";

import {
  FOLLOW_UP_KINDS,
  FOLLOW_UP_KIND_META,
} from "@/lib/field-ops/types";
import type { FollowUpKind } from "@/lib/field-ops/types";
import { isCommunicationKind, sanitizePhone } from "@/lib/field-ops/phone";

type FollowupSectionProps = {
  followUpAt: string;
  followUpKind: FollowUpKind;
  followUpNote: string;
  followUpContactNumber: string;
  /** Merchant's primary mobile, used as the auto-fill default. */
  merchantTeam: string | null;
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
  merchantTeam,
  onAtChange,
  onKindChange,
  onNoteChange,
  onContactNumberChange,
}: FollowupSectionProps) {
  const needsNumber = isCommunicationKind(followUpKind);

  return (
    <section className="visit-form-section">
      <div className="visit-form-head">
        <p className="eyebrow">مهمة متابعة</p>
        <span className="badge badge-purple">اختياري</span>
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
        <label className="field">
          <span>الموعد</span>
          <input
            type="datetime-local"
            value={followUpAt}
            onChange={(event) => onAtChange(event.target.value)}
          />
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
        {needsNumber ? (
          <label className="field">
            <span>رقم هاتف المتابعة</span>
            <input
              type="tel"
              value={followUpContactNumber}
              onChange={(event) => onContactNumberChange(event.target.value)}
              placeholder="01xxxxxxxxx"
              inputMode="tel"
              required={Boolean(followUpAt)}
            />
            <span className="field-hint">
              إلزامي للمكالمة والواتساب. يُملأ تلقائياً من جهة الاتصال ويمكن
              تعديله.
            </span>
          </label>
        ) : null}
      </div>
      {followUpAt ? (
        <p className="inline-note">
          ستُنشأ مهمة مجدولة لفريق {merchantTeam ?? "غير مسند"} وتظهر في لوحة
          العمليات الميدانية.
          {needsNumber && !sanitizePhone(followUpContactNumber)
            ? " أضف رقم هاتف المتابعة لتظهر أزرار الاتصال والواتساب المباشرة."
            : ""}
        </p>
      ) : null}
    </section>
  );
}
