"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  JustificationModal,
  StateModal,
} from "@/components/field-ops/request-modals";
import {
  CONTRACT_STATE_META,
  teamLabel,
  type FieldTask,
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
  viewerTeam: string;
  canEditMerchants: boolean;
  canRequestTransfers: boolean;
  canManageState: boolean;
  canViewFieldOps: boolean;
  canViewFieldOpsPage: boolean;
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
  viewerTeam,
  canEditMerchants,
  canRequestTransfers,
  canManageState,
  canViewFieldOps,
  canViewFieldOpsPage,
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
            {merchant.editUnlocked ? (
              <span className="badge badge-purple">التعديل مفتوح</span>
            ) : null}
            {otherTeam ? (
              <span className="badge badge-gold">مملوك لفريق آخر</span>
            ) : null}
          </div>
        </div>
        <div className="profile-actions">
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
              className="button button-primary"
              onClick={() => setStateOpen(true)}
            >
              تجاوز الحالة
            </button>
          ) : null}
        </div>
      </section>

      <section className="profile-grid">
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
              <span className="detail-label">آخر زيارة</span>
              <strong>
                {merchant.lastVisitAt
                  ? formatDateTime(merchant.lastVisitAt)
                  : "لا يوجد"}
              </strong>
            </div>
          </div>
          <div className="note-block">
            <span className="detail-label">ملاحظات استراتيجية</span>
            <p>{merchant.strategicNotes || "لا توجد ملاحظات مسجلة."}</p>
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

        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">سجل الزيارات</p>
              <h2>الخط الزمني للتقارير</h2>
            </div>
            <span className="badge">{reports.length} تقرير</span>
          </div>
          {reports.length === 0 ? (
            <p className="empty-state">لا توجد تقارير زيارات بعد.</p>
          ) : (
            <div className="timeline">
              {reports.map((report) => {
                const reportMeta = CONTRACT_STATE_META[report.outcome];
                return (
                  <article key={report.id} className="timeline-item">
                    <div className="timeline-head">
                      <span className={`badge ${reportMeta.tone}`}>
                        {reportMeta.label}
                      </span>
                      <span className="muted">
                        {formatDateTime(report.createdAt)}
                      </span>
                    </div>
                    <p>{report.notes}</p>
                    <span className="timeline-meta">
                      {report.repName} · {teamLabel(report.team)}
                      {report.commissionAmount > 0
                        ? ` · عمولة ${formatAmount(report.commissionAmount)}`
                        : ""}
                    </span>
                  </article>
                );
              })}
            </div>
          )}
        </div>
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
          </div>
        </div>
      </section>

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
