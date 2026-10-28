"use client";

import type { MerchantCrmSummary } from "@/lib/field-ops/store";
import { opinionLabel, opinionTone } from "@/lib/field-ops/types";
import type { Merchant } from "@/lib/field-ops/types";

import { formatDateTime } from "@/lib/field-ops/format";

type VisitHistoryProps = {
  merchant: Merchant;
  summary: MerchantCrmSummary;
};

export function VisitHistory({ merchant, summary }: VisitHistoryProps) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">بيانات التواصل الحالية</p>
          <h2>جهة الاتصال المعتمدة</h2>
        </div>
        {summary.contactUpdatedAt ? (
          <span className="muted">
            آخر تحديث {formatDateTime(summary.contactUpdatedAt)}
          </span>
        ) : (
          <span className="badge badge-gold">لم تُسجَّل بعد</span>
        )}
      </div>
      {summary.contact ? (
        <div className="contact-card">
          <div className="contact-avatar" aria-hidden="true">
            {(summary.contact.name || "؟").slice(0, 1)}
          </div>
          <div className="contact-body">
            <strong>{summary.contact.name || "بدون اسم"}</strong>
            <span>{summary.contact.role || "بدون مسمى وظيفي"}</span>
            {summary.contact.mobile ? (
              <a
                href={`tel:${summary.contact.mobile}`}
                className="contact-mobile"
              >
                {summary.contact.mobile}
              </a>
            ) : (
              <span className="muted">لا يوجد رقم موبايل</span>
            )}
          </div>
        </div>
      ) : (
        <p className="empty-state">
          لا توجد بيانات تواصل بعد. ستُملأ تلقائياً من أول تقرير زيارة.
        </p>
      )}

      <div className="note-block">
        <span className="detail-label">ملاحظات استراتيجية</span>
        <p>{merchant.strategicNotes || "لا توجد ملاحظات مسجلة."}</p>
      </div>

      <div className="crm-opinions">
        <span className="detail-label">آراء المندوبين المجمّعة</span>
        {summary.opinions.length === 0 ? (
          <p className="muted">لم تُسجَّل آراء بعد.</p>
        ) : (
          <div className="opinion-weighted">
            {summary.opinions.map((opinion) => (
              <div
                key={`${opinion.trait}-${opinion.label ?? ""}`}
                className="opinion-weighted-row"
              >
                <div className="opinion-weighted-head">
                  <span className={`badge ${opinionTone(opinion)}`}>
                    {opinionLabel(opinion)}
                  </span>
                  <strong>{opinion.weight}%</strong>
                </div>
                <div
                  className="opinion-bar"
                  role="meter"
                  aria-valuenow={opinion.weight}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={opinionLabel(opinion)}
                >
                  <span
                    className="opinion-bar-fill"
                    style={{ width: `${opinion.weight}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
