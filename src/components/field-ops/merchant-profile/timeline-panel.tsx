"use client";

import { formatDuration } from "@/lib/field-ops/geolocation";
import type { MerchantCrmSummary } from "@/lib/field-ops/store";
import type { MerchantTimelineEntry } from "@/lib/field-ops/store";
import {
  CONTRACT_STATE_META,
  FOLLOW_UP_KIND_META,
  teamLabel,
  opinionLabel,
  opinionTone,
} from "@/lib/field-ops/types";
import type { Merchant } from "@/lib/field-ops/types";
import { whatsappLink } from "@/lib/field-ops/whatsapp";

import { formatAmount, formatDateTime } from "@/lib/field-ops/format";
import {
  TASK_STATUS_LABEL,
  TIMELINE_LABEL,
  TIMELINE_TONE,
} from "@/lib/field-ops/profile-meta";

type TimelinePanelProps = {
  merchant: Merchant;
  timeline: MerchantTimelineEntry[];
  summary: MerchantCrmSummary;
};

export function TimelinePanel({
  merchant,
  timeline,
  summary,
}: TimelinePanelProps) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">السجل الموحّد</p>
          <h2>الخط الزمني الكامل للتاجر</h2>
        </div>
        <span className="badge">{timeline.length} حدث</span>
      </div>
      {timeline.length === 0 ? (
        <p className="empty-state">
          لا توجد أحداث بعد. ابدأ زيارة لتظهر أولى نقاط الخط الزمني.
        </p>
      ) : (
        <ol className="crm-timeline">
          {timeline.map((entry) => {
            if (entry.kind === "visit") {
              const reportMeta = CONTRACT_STATE_META[entry.report.outcome];
              return (
                <li key={`visit-${entry.report.id}`} className="crm-timeline-item">
                  <span className="crm-timeline-dot" data-kind="visit" />
                  <div className="crm-timeline-body">
                    <div className="crm-timeline-head">
                      <span className={`badge ${reportMeta.tone}`}>
                        {reportMeta.label}
                      </span>
                      <span className="badge badge-purple">زيارة</span>
                      <span className="muted">{formatDateTime(entry.at)}</span>
                    </div>
                    <p>{entry.report.notes}</p>
                    <div className="crm-timeline-meta">
                      <span>{entry.report.repName}</span>
                      <span>{teamLabel(entry.report.team)}</span>
                      {entry.report.durationSeconds != null ? (
                        <span>
                          المدة {formatDuration(entry.report.durationSeconds)}
                        </span>
                      ) : null}
                      {entry.report.commissionAmount > 0 ? (
                        <span>
                          عمولة {formatAmount(entry.report.commissionAmount)}
                        </span>
                      ) : null}
                      {entry.report.agreedCommission != null ? (
                        <span>
                          النسبة المتفق عليها {entry.report.agreedCommission}%
                        </span>
                      ) : null}
                    </div>
                    {(entry.report.opinions ?? []).length > 0 ? (
                      <div className="opinion-summary">
                        {(entry.report.opinions ?? []).map((opinion) => (
                          <span
                            key={`${opinion.trait}-${opinion.label ?? ""}`}
                            className={`badge ${opinionTone(opinion)}`}
                          >
                            {opinionLabel(opinion)} · {opinion.weight}%
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {entry.report.contact?.name ? (
                      <span className="crm-contact-note">
                        جهة الاتصال: {entry.report.contact.name}
                        {entry.report.contact.role
                          ? ` · ${entry.report.contact.role}`
                          : ""}
                        {entry.report.contact.mobile
                          ? ` · ${entry.report.contact.mobile}`
                          : ""}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            }

            if (entry.kind === "override") {
              return (
                <li
                  key={`override-${entry.override.id}`}
                  className="crm-timeline-item"
                >
                  <span className="crm-timeline-dot" data-kind="override" />
                  <div className="crm-timeline-body">
                    <div className="crm-timeline-head">
                      <span className={`badge ${TIMELINE_TONE.override}`}>
                        {TIMELINE_LABEL.override}
                      </span>
                      <span className="muted">{formatDateTime(entry.at)}</span>
                    </div>
                    <p>
                      من {CONTRACT_STATE_META[entry.override.fromState].label} إلى{" "}
                      {CONTRACT_STATE_META[entry.override.toState].label} —{" "}
                      {entry.override.note}
                    </p>
                    <div className="crm-timeline-meta">
                      <span>{entry.override.actorName}</span>
                    </div>
                  </div>
                </li>
              );
            }

            if (entry.kind === "document") {
              return (
                <li
                  key={`document-${entry.document.id}`}
                  className="crm-timeline-item"
                >
                  <span className="crm-timeline-dot" data-kind="document" />
                  <div className="crm-timeline-body">
                    <div className="crm-timeline-head">
                      <span className={`badge ${TIMELINE_TONE.document}`}>
                        {TIMELINE_LABEL.document}
                      </span>
                      <span className="muted">{formatDateTime(entry.at)}</span>
                    </div>
                    <p>{entry.document.name}</p>
                  </div>
                </li>
              );
            }

            return (
              <li
                key={`followup-${entry.followUp.id}`}
                className="crm-timeline-item"
              >
                <span className="crm-timeline-dot" data-kind="follow_up" />
                <div className="crm-timeline-body">
                  <div className="crm-timeline-head">
                    <span className={`badge ${TIMELINE_TONE.follow_up}`}>
                      {TIMELINE_LABEL.follow_up}
                    </span>
                    <span className="muted">
                      موعد {formatDateTime(entry.followUp.dueAt)}
                    </span>
                  </div>
                  <p>{entry.followUp.note}</p>
                  <div className="crm-timeline-meta">
                    <span>{FOLLOW_UP_KIND_META[entry.followUp.kind].label}</span>
                    <span>{teamLabel(entry.followUp.team)}</span>
                    <span>{TASK_STATUS_LABEL[entry.followUp.status]}</span>
                  </div>
                  {whatsappLink(
                    summary.contact?.mobile,
                    `مرحباً ${merchant.name}، بخصوص متابعة الاتفاق.`,
                  ) ? (
                    <a
                      href={
                        whatsappLink(
                          summary.contact?.mobile,
                          `مرحباً ${merchant.name}، بخصوص متابعة الاتفاق.`,
                        ) as string
                      }
                      className="button button-small button-whatsapp"
                      target="_blank"
                      rel="noreferrer"
                    >
                      تواصل واتساب
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
