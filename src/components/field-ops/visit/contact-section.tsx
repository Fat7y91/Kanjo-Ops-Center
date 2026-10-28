"use client";

import { formatCoordinates, formatDuration } from "@/lib/field-ops/geolocation";
import type { VisitDraft } from "@/components/field-ops/visit-mode";

type ContactSectionProps = {
  draft: VisitDraft | null;
  visitCount: number;
  contactName: string;
  contactRole: string;
  contactMobile: string;
  onNameChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onMobileChange: (value: string) => void;
};

export function ContactSection({
  draft,
  visitCount,
  contactName,
  contactRole,
  contactMobile,
  onNameChange,
  onRoleChange,
  onMobileChange,
}: ContactSectionProps) {
  return (
    <>
      {draft ? (
        <section className="visit-summary-strip" aria-label="ملخص الزيارة">
          <div>
            <span>المدة</span>
            <strong>{formatDuration(draft.durationSeconds)}</strong>
          </div>
          <div>
            <span>موقع البداية</span>
            <strong className="visit-coords">
              {formatCoordinates(draft.startLocation)}
            </strong>
          </div>
          <div>
            <span>موقع النهاية</span>
            <strong className="visit-coords">
              {formatCoordinates(draft.endLocation)}
            </strong>
          </div>
          <div>
            <span>عدد الزيارات السابقة</span>
            <strong>{visitCount}</strong>
          </div>
        </section>
      ) : null}

      <section className="visit-form-section">
        <div className="visit-form-head">
          <p className="eyebrow">بيانات التواصل</p>
          <span className="badge">تُحدَّث في كارت التاجر تلقائياً</span>
        </div>
        <div className="visit-contact-grid">
          <label className="field">
            <span>اسم مسؤول التواصل</span>
            <input
              type="text"
              value={contactName}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="من قابلته في الزيارة؟"
            />
          </label>
          <label className="field">
            <span>المسمى الوظيفي</span>
            <input
              type="text"
              value={contactRole}
              onChange={(event) => onRoleChange(event.target.value)}
              placeholder="المالك، مدير الفرع، مسؤول المشتريات…"
            />
          </label>
          <label className="field">
            <span>رقم الموبايل</span>
            <input
              type="tel"
              value={contactMobile}
              onChange={(event) => onMobileChange(event.target.value)}
              placeholder="01xxxxxxxxx"
              inputMode="tel"
            />
          </label>
        </div>
      </section>
    </>
  );
}
