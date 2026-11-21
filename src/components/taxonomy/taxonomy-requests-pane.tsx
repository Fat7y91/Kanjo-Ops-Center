"use client";

import { useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { TaxonomyMarkAddedModal } from "@/components/taxonomy/taxonomy-mark-added-modal";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/form-inputs";
import {
  TAXONOMY_KIND_META,
  TAXONOMY_STATUS_META,
  type TaxonomyRequest,
  type TaxonomyVendorType,
} from "@/lib/taxonomy/types";

type TaxonomyRequestsPaneProps = {
  requests: TaxonomyRequest[];
  vendorTypeMap: Map<number, TaxonomyVendorType>;
  canDecide: boolean;
  onChanged: (message: string) => void;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Request review queue.
 *
 * Two decisions are possible: confirm a request was added after the central
 * sheet was synced, or reject it with a reason. Entries never get created here —
 * the dashboard sync is the only writer — so this pane only links and closes.
 */
export function TaxonomyRequestsPane({
  requests,
  vendorTypeMap,
  canDecide,
  onChanged,
}: TaxonomyRequestsPaneProps) {
  const [markTarget, setMarkTarget] = useState<TaxonomyRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TaxonomyRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const pending = requests.filter((request) => request.status === "pending");
  const decided = requests
    .filter((request) => request.status !== "pending")
    .sort((left, right) =>
      (right.decidedAt ?? "").localeCompare(left.decidedAt ?? ""),
    );

  async function reject() {
    if (!rejectTarget) return;
    if (rejectReason.trim().length < 5) {
      setRejectError("اذكر سبب الرفض (5 أحرف على الأقل).");
      return;
    }
    setRejectError("");
    setRejecting(true);
    try {
      const response = await fetch(
        `/api/taxonomy/requests/${rejectTarget.id}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rejectReason }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر رفض الطلب.");
      }
      onChanged(`تم رفض طلب «${rejectTarget.name_ar}».`);
      setRejectTarget(null);
      setRejectReason("");
    } catch (rejectFailure) {
      setRejectError(
        rejectFailure instanceof Error
          ? rejectFailure.message
          : "تعذر رفض الطلب.",
      );
    } finally {
      setRejecting(false);
    }
  }

  return (
    <div className="taxonomy-pane">
      <div className="panel-head compact">
        <div>
          <p className="eyebrow">قائمة الانتظار</p>
          <h2>طلبات بانتظار قرار</h2>
        </div>
      </div>

      {pending.length === 0 ? (
        <p className="empty-state">
          لا توجد طلبات معلّقة حالياً من مندوبي الميدان.
        </p>
      ) : (
        <div className="taxonomy-request-list">
          {pending.map((request) => (
            <article key={request.id} className="taxonomy-request-card">
              <div className="taxonomy-request-head">
                <div>
                  <span className="badge">
                    {TAXONOMY_KIND_META[request.kind].label}
                  </span>
                  <h3>{request.name_ar}</h3>
                  {request.name_en ? (
                    <p className="muted">{request.name_en}</p>
                  ) : null}
                </div>
                <span
                  className={`badge ${TAXONOMY_STATUS_META[request.status].tone}`}
                >
                  {TAXONOMY_STATUS_META[request.status].label}
                </span>
              </div>
              <dl className="taxonomy-meta">
                {request.kind === "category" &&
                request.vendorTypeId != null ? (
                  <div>
                    <dt>نوع التاجر</dt>
                    <dd>
                      {vendorTypeMap.get(request.vendorTypeId)?.name_ar ??
                        `نوع ${request.vendorTypeId}`}{" "}
                      (ID: {request.vendorTypeId})
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>مقدّم الطلب</dt>
                  <dd>{request.requestedByName}</dd>
                </div>
                <div>
                  <dt>التاريخ</dt>
                  <dd>{formatDate(request.requestedAt)}</dd>
                </div>
              </dl>
              <p className="taxonomy-justification">{request.justification}</p>
              <div className="form-actions">
                {canDecide ? (
                  <>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        setRejectTarget(request);
                        setRejectReason("");
                        setRejectError("");
                      }}
                    >
                      رفض
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setMarkTarget(request)}
                    >
                      تم الإضافة
                    </Button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {decided.length > 0 ? (
        <>
          <div className="panel-head compact taxonomy-decided-head">
            <div>
              <p className="eyebrow">السجل</p>
              <h3>طلبات تمت معالجتها</h3>
            </div>
          </div>
          <div className="table-wrap w-full overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>النوع</th>
                  <th>الحالة</th>
                  <th>Dashboard ID</th>
                  <th>بواسطة</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <strong>{request.name_ar}</strong>
                      {request.name_en ? (
                        <span className="muted merchant-category">
                          {request.name_en}
                        </span>
                      ) : null}
                    </td>
                    <td>{TAXONOMY_KIND_META[request.kind].label}</td>
                    <td>
                      <span
                        className={`badge ${TAXONOMY_STATUS_META[request.status].tone}`}
                      >
                        {TAXONOMY_STATUS_META[request.status].label}
                      </span>
                      {request.status === "rejected" &&
                      request.rejectionReason ? (
                        <span className="muted merchant-category">
                          {request.rejectionReason}
                        </span>
                      ) : null}
                    </td>
                    <td>{request.dashboardId ?? "—"}</td>
                    <td>{request.decidedByName ?? "—"}</td>
                    <td>{formatDate(request.decidedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <TaxonomyMarkAddedModal
        request={markTarget}
        vendorTypes={[...vendorTypeMap.values()]}
        onClose={() => setMarkTarget(null)}
        onDone={(message) => {
          setMarkTarget(null);
          onChanged(message);
        }}
      />

      <Modal
        open={rejectTarget != null}
        title="رفض طلب التصنيف"
        eyebrow="حوكمة التصنيفات"
        description="سيُبلّغ مقدّم الطلب بالسبب في سجل القرار."
        onClose={() => {
          if (rejecting) return;
          setRejectTarget(null);
        }}
      >
        {rejectTarget ? (
          <div className="form-stack">
            <div className="taxonomy-approve-summary">
              <span className="badge">
                {TAXONOMY_KIND_META[rejectTarget.kind].label}
              </span>
              <h3>{rejectTarget.name_ar}</h3>
            </div>
            <TextAreaField
              label="سبب الرفض"
              rows={4}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="مثال: يوجد تصنيف معتمد يغطي هذه الحالة."
              required
            />
            {rejectError ? (
              <p className="form-error" role="alert">
                {rejectError}
              </p>
            ) : null}
            <div className="form-actions">
              <Button
                variant="quiet"
                onClick={() => setRejectTarget(null)}
                disabled={rejecting}
              >
                إلغاء
              </Button>
              <Button
                variant="danger"
                onClick={() => void reject()}
                disabled={rejecting}
              >
                {rejecting ? "جارٍ الرفض..." : "تأكيد الرفض"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
