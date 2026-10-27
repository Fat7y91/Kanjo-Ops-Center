"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  JustificationModal,
  StateModal,
} from "@/components/field-ops/request-modals";
import {
  VisitEngine,
  type VisitEngineTarget,
} from "@/components/field-ops/visit-engine";
import { formatDuration } from "@/lib/field-ops/geolocation";
import type {
  MerchantCrmSummary,
  MerchantTimelineEntry,
} from "@/lib/field-ops/store";
import {
  CONTRACT_STATE_META,
  REP_OPINION_META,
  teamLabel,
  type FieldTask,
  type FollowUpTask,
  type Merchant,
  type MerchantDocument,
  type StateOverride,
  type VisitReport,
} from "@/lib/field-ops/types";

type MerchantProfileClientProps = {
  merchant: Merchant;
  cityName: string;
  reports: VisitReport[];
  overrides: StateOverride[];
  tasks: FieldTask[];
  followUps: FollowUpTask[];
  timeline: MerchantTimelineEntry[];
  summary: MerchantCrmSummary;
  visitCount: number;
  viewerTeam: string;
  canEditMerchants: boolean;
  canRequestTransfers: boolean;
  canManageState: boolean;
  canViewFieldOps: boolean;
  canViewFieldOpsPage: boolean;
  canStartVisit: boolean;
};

const DOCUMENT_TYPES: Array<{ value: MerchantDocument["type"]; label: string }> =
  [
    { value: "contract", label: "عقد" },
    { value: "tax", label: "مستند ضريبي" },
    { value: "license", label: "ترخيص" },
    { value: "other", label: "أخرى" },
  ];

const TASK_STATUS_LABEL: Record<string, string> = {
  scheduled: "مجدولة",
  completed: "مكتملة",
};

const TIMELINE_LABEL: Record<MerchantTimelineEntry["kind"], string> = {
  visit: "زيارة",
  override: "تجاوز حالة",
  document: "مستند",
  follow_up: "متابعة",
};

const TIMELINE_TONE: Record<MerchantTimelineEntry["kind"], string> = {
  visit: "badge-purple",
  override: "badge-gold",
  document: "badge-blue",
  follow_up: "badge-green",
};

function formatAmount(value: number): string {
  return new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function MerchantProfileClient({
  merchant,
  cityName,
  reports,
  overrides,
  tasks,
  followUps,
  timeline,
  summary,
  visitCount,
  viewerTeam,
  canEditMerchants,
  canRequestTransfers,
  canManageState,
  canViewFieldOps,
  canViewFieldOpsPage,
  canStartVisit,
}: MerchantProfileClientProps) {
  const router = useRouter();
  const [transferOpen, setTransferOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState<MerchantDocument["type"]>("contract");
  const [docUrl, setDocUrl] = useState("");
  const [docError, setDocError] = useState("");
  const [docSaving, setDocSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [visitTarget, setVisitTarget] = useState<VisitEngineTarget | null>(null);

  const meta = CONTRACT_STATE_META[merchant.contractState];
  const otherTeam = Boolean(merchant.team) && merchant.team !== viewerTeam;
  const agreementReached =
    merchant.contractState === "final_contract" ||
    merchant.contractState === "signed_contract";
  const finalLocked =
    merchant.contractState === "final_contract" && !merchant.editUnlocked;

  function announce(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 4500);
  }

  function openVisit() {
    setVisitTarget({
      merchant,
      taskId: null,
      visitCount,
    });
  }

  async function addDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDocError("");
    setDocSaving(true);
    try {
      const response = await fetch(
        `/api/field-ops/merchants/${merchant.id}/documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: docName,
            type: docType,
            url: docUrl,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر حفظ المستند.");
      }
      setDocName("");
      setDocUrl("");
      announce("تم إرفاق المستند بملف التاجر.");
      router.refresh();
    } catch (error) {
      setDocError(
        error instanceof Error ? error.message : "تعذر حفظ المستند.",
      );
    } finally {
      setDocSaving(false);
    }
  }

  return (
    <>
      <section className="profile-hero panel">
        <div>
          <p className="eyebrow">{cityName}</p>
          <h2>{merchant.name}</h2>
          <div className="profile-badges">
            <span className={`badge ${meta.tone}`}>{meta.label}</span>
            <span className="badge">{merchant.vendorType}</span>
            <span className="chip chip-team">{teamLabel(merchant.team)}</span>
            <span className="badge badge-purple">{visitCount} زيارة</span>
            {merchant.editUnlocked ? (
              <span className="badge badge-purple">التعديل مفتوح</span>
            ) : null}
            {otherTeam ? (
              <span className="badge badge-gold">مملوك لفريق آخر</span>
            ) : null}
          </div>
        </div>
        <div className="profile-actions">
          {canStartVisit ? (
            <button
              type="button"
              className="button button-primary"
              onClick={openVisit}
            >
              بدء زيارة
            </button>
          ) : null}
          {canViewFieldOpsPage ? (
            <Link href="/field-ops" className="button button-quiet" prefetch>
              العودة إلى اللوحة
            </Link>
          ) : null}
          {canRequestTransfers && otherTeam ? (
            <button
              type="button"
              className="button button-quiet"
              onClick={() => setTransferOpen(true)}
            >
              طلب نقل ملكية
            </button>
          ) : null}
          {canManageState ? (
            <button
              type="button"
              className="button button-quiet"
              onClick={() => setStateOpen(true)}
            >
              تجاوز الحالة
            </button>
          ) : null}
        </div>
      </section>

      <section className="crm-metrics" aria-label="تحليلات التاجر المجمّعة">
        <article className="panel crm-metric">
          <span>إجمالي الزيارات</span>
          <strong>{summary.visitCount}</strong>
          <small>{summary.reps.length} مندوب مختلف</small>
        </article>
        <article className="panel crm-metric">
          <span>متوسط مدة الزيارة</span>
          <strong>{formatDuration(summary.averageDurationSeconds)}</strong>
          <small>
            إجمالي {formatDuration(summary.totalDurationSeconds)} وقت ميداني
          </small>
        </article>
        <article className="panel crm-metric">
          <span>آخر زيارة</span>
          <strong className="crm-metric-date">
            {summary.lastVisitAt ? formatDateTime(summary.lastVisitAt) : "لا يوجد"}
          </strong>
          <small>
            {summary.lastOutcome
              ? `النتيجة: ${CONTRACT_STATE_META[summary.lastOutcome].label}`
              : "بدون تقارير"}
          </small>
        </article>
        <article className="panel crm-metric">
          <span>المتابعة القادمة</span>
          <strong className="crm-metric-date">
            {summary.nextFollowUpAt
              ? formatDateTime(summary.nextFollowUpAt)
              : "لا توجد"}
          </strong>
          <small>{followUps.filter((task) => task.status === "scheduled").length} مهمة مفتوحة</small>
        </article>
      </section>

      <section className="profile-grid">
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
                  <a href={`tel:${summary.contact.mobile}`} className="contact-mobile">
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
              <div className="opinion-summary">
                {summary.opinions.map((opinion) => (
                  <span
                    key={opinion}
                    className={`badge ${REP_OPINION_META[opinion].tone}`}
                  >
                    {REP_OPINION_META[opinion].label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">الجوانب التجارية</p>
              <h2>اقتصاديات الاتفاق</h2>
            </div>
          </div>
          <div className="detail-grid detail-grid-wide">
            <div>
              <span className="detail-label">القيمة الشهرية</span>
              <strong>{formatAmount(merchant.monthlyValue)}</strong>
            </div>
            <div>
              <span className="detail-label">العمولة المستهدفة</span>
              <strong>{merchant.targetCommission}%</strong>
            </div>
            <div>
              <span className="detail-label">العمولة المكتسبة</span>
              <strong>{formatAmount(merchant.commissionAmount)}</strong>
            </div>
            <div>
              <span className="detail-label">الحالة الحالية</span>
              <strong>{meta.label}</strong>
            </div>
          </div>
          {finalLocked && canViewFieldOps && !otherTeam ? (
            <div className="lock-panel">
              <span className="badge badge-red">الاتفاق النهائي مقفل</span>
              <p>
                تغيير النتيجة يتطلب اعتماد المدير. أرسل طلب تعديل مع ذكر السبب.
              </p>
              <button
                type="button"
                className="button button-primary"
                onClick={() => setEditOpen(true)}
              >
                طلب اعتماد التعديل
              </button>
            </div>
          ) : null}
          {merchant.contractState === "signed_contract" ? (
            <p className="inline-note">
              العقود الموقّعة مقفلة تماماً. تم احتساب العمولة، وفقط صلاحية إدارة
              الحالات يمكنها تغيير هذا السجل.
            </p>
          ) : null}
        </div>
      </section>

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
                          <span>المدة {formatDuration(entry.report.durationSeconds)}</span>
                        ) : null}
                        {entry.report.commissionAmount > 0 ? (
                          <span>عمولة {formatAmount(entry.report.commissionAmount)}</span>
                        ) : null}
                      </div>
                      {(entry.report.opinions ?? []).length > 0 ? (
                        <div className="opinion-summary">
                          {(entry.report.opinions ?? []).map((opinion) => (
                            <span
                              key={opinion}
                              className={`badge ${REP_OPINION_META[opinion].tone}`}
                            >
                              {REP_OPINION_META[opinion].label}
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
                  <li key={`override-${entry.override.id}`} className="crm-timeline-item">
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
                  <li key={`document-${entry.document.id}`} className="crm-timeline-item">
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
                <li key={`followup-${entry.followUp.id}`} className="crm-timeline-item">
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
                      <span>
                        {entry.followUp.kind === "call" ? "مكالمة" : "زيارة"}
                      </span>
                      <span>{teamLabel(entry.followUp.team)}</span>
                      <span>{TASK_STATUS_LABEL[entry.followUp.status]}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="profile-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">مستندات التاجر</p>
              <h2>ملف الاتفاق</h2>
            </div>
            <span
              className={`badge ${agreementReached ? "badge-green" : "badge-gold"}`}
            >
              {agreementReached ? "مفتوح" : "مقفل"}
            </span>
          </div>

          {!agreementReached ? (
            <p className="empty-state">
              تُفتح المستندات فقط بعد اتفاق نهائي أو موقّع. يحافظ ذلك على تدفق
              الزيارات اليومية دون رفع مستندات.
            </p>
          ) : (
            <>
              {merchant.documents.length === 0 ? (
                <p className="empty-state">لا توجد مستندات مرفقة بعد.</p>
              ) : (
                <ul className="document-list">
                  {merchant.documents.map((document) => (
                    <li key={document.id}>
                      <div>
                        <strong>{document.name}</strong>
                        <span>
                          {
                            DOCUMENT_TYPES.find(
                              (option) => option.value === document.type,
                            )?.label
                          }{" "}
                          · {formatDateTime(document.uploadedAt)}
                        </span>
                      </div>
                      {document.url ? (
                        <a
                          href={document.url}
                          className="button button-small button-quiet"
                          target="_blank"
                          rel="noreferrer"
                        >
                          فتح
                        </a>
                      ) : (
                        <span className="badge">لا يوجد رابط</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {canEditMerchants ? (
                <form className="form-stack document-form" onSubmit={addDocument}>
                  <div className="form-grid">
                    <label className="field">
                      <span>اسم المستند</span>
                      <input
                        value={docName}
                        onChange={(event) => setDocName(event.target.value)}
                        placeholder="العقد الموقّع 2026"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>النوع</span>
                      <select
                        value={docType}
                        onChange={(event) =>
                          setDocType(
                            event.target.value as MerchantDocument["type"],
                          )
                        }
                      >
                        {DOCUMENT_TYPES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="field">
                    <span>رابط المستند</span>
                    <input
                      value={docUrl}
                      onChange={(event) => setDocUrl(event.target.value)}
                      placeholder="https://storage.example.com/contract.pdf"
                    />
                  </label>
                  {docError ? (
                    <p className="form-error" role="alert">
                      {docError}
                    </p>
                  ) : null}
                  <div className="form-actions">
                    <button
                      type="submit"
                      className="button button-primary"
                      disabled={docSaving}
                    >
                      {docSaving ? "جارٍ الإرفاق..." : "إرفاق المستند"}
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          )}
        </div>

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
                        {followUp.kind === "call" ? "مكالمة" : "زيارة"}
                      </span>
                      <span className="muted">{followUp.note}</span>
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
      </section>

      <VisitEngine
        target={visitTarget}
        canManageState={canManageState}
        onClose={() => setVisitTarget(null)}
        onSaved={(message) => {
          announce(message);
          // A server refresh while offline would hard-navigate to a browser
          // network error page. The queued visit renders from the local queue
          // banner instead, and the next online refresh picks up the server
          // state.
          if (typeof navigator === "undefined" || navigator.onLine) {
            router.refresh();
          }
        }}
      />

      <JustificationModal
        open={transferOpen}
        endpoint={`/api/field-ops/merchants/${merchant.id}/transfers`}
        title={`نقل ملكية ${merchant.name}`}
        eyebrow="ملكية عابرة للفرق"
        description="يراجع المدير هذا المبرر قبل انتقال الملكية."
        label="المبرر"
        placeholder="لماذا يجب أن ينتقل هذا التاجر إلى فريقك؟"
        submitLabel="إرسال طلب النقل"
        field="justification"
        successMessage="تم إرسال طلب النقل لاعتماد المدير."
        onClose={() => setTransferOpen(false)}
        onDone={(message) => {
          announce(message);
          router.refresh();
        }}
      />

      <JustificationModal
        open={editOpen}
        endpoint={`/api/field-ops/merchants/${merchant.id}/edit-requests`}
        title={`فتح تعديل ${merchant.name}`}
        eyebrow="قفل الاتفاق النهائي"
        description="يجب أن يعتمد المدير السبب قبل تغيير النتيجة."
        label="سبب التعديل"
        placeholder="ما الخطأ، وما الذي يجب تغييره؟"
        submitLabel="طلب اعتماد التعديل"
        field="reason"
        successMessage="تم إرسال طلب التعديل لاعتماد المدير."
        onClose={() => setEditOpen(false)}
        onDone={(message) => {
          announce(message);
          router.refresh();
        }}
      />

      <StateModal
        open={stateOpen}
        merchantName={merchant.name}
        current={merchant.contractState}
        endpoint={`/api/field-ops/merchants/${merchant.id}/state`}
        onClose={() => setStateOpen(false)}
        onDone={(message) => {
          announce(message);
          router.refresh();
        }}
      />

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
