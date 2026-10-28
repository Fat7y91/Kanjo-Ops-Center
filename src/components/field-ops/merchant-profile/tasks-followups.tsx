"use client";

import type { MerchantCrmSummary } from "@/lib/field-ops/store";
import {
  CONTRACT_STATE_META,
  FOLLOW_UP_KIND_META,
  teamLabel,
} from "@/lib/field-ops/types";
import type {
  FieldTask,
  FollowUpTask,
  Merchant,
  StateOverride,
  VisitReport,
} from "@/lib/field-ops/types";
import { whatsappLink } from "@/lib/field-ops/whatsapp";

import { formatDateTime } from "@/lib/field-ops/format";
import { TASK_STATUS_LABEL } from "@/lib/field-ops/profile-meta";

type TasksFollowupsProps = {
  merchant: Merchant;
  summary: MerchantCrmSummary;
  tasks: FieldTask[];
  followUps: FollowUpTask[];
  overrides: StateOverride[];
  reports: VisitReport[];
};

export function TasksFollowups({
  merchant,
  summary,
  tasks,
  followUps,
  overrides,
  reports,
}: TasksFollowupsProps) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">العمليات</p>
          <h2>المهام والمراجعة</h2>
        </div>
      </div>
      <div className="stack-list">
        <div>
          <span className="detail-label">المهام المجدولة</span>
          {tasks.length === 0 ? (
            <p className="muted">لا توجد مهام مجدولة لهذا التاجر.</p>
          ) : (
            <ul className="plain-list">
              {tasks.map((task) => (
                <li key={task.id}>
                  <span>{task.visitDate}</span>
                  <span
                    className={`badge ${task.status === "completed" ? "badge-green" : ""}`}
                  >
                    {TASK_STATUS_LABEL[task.status] ?? task.status}
                  </span>
                  <span className="muted">{teamLabel(task.team)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <span className="detail-label">مهام المتابعة</span>
          {followUps.length === 0 ? (
            <p className="muted">لا توجد مهام متابعة مجدولة.</p>
          ) : (
            <ul className="plain-list">
              {followUps.map((followUp) => (
                <li key={followUp.id}>
                  <span>{formatDateTime(followUp.dueAt)}</span>
                  <span className="badge">
                    {FOLLOW_UP_KIND_META[followUp.kind].label}
                  </span>
                  <span className="muted">{followUp.note}</span>
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
                      aria-label={`تواصل واتساب مع ${merchant.name}`}
                    >
                      واتساب
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <span className="detail-label">تجاوزات الحالة</span>
          {overrides.length === 0 ? (
            <p className="muted">لا توجد تجاوزات مسجلة من المدير.</p>
          ) : (
            <ul className="plain-list">
              {overrides.map((override) => (
                <li key={override.id}>
                  <span>
                    من {CONTRACT_STATE_META[override.fromState].label} إلى{" "}
                    {CONTRACT_STATE_META[override.toState].label}
                  </span>
                  <span className="muted">{override.actorName}</span>
                  <span className="muted">
                    {formatDateTime(override.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <span className="detail-label">عدد التقارير الخام</span>
          <p className="muted">{reports.length} تقرير زيارة مسجّل.</p>
        </div>
      </div>
    </div>
  );
}
