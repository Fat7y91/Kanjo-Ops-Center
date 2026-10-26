"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { TaxonomyRequestButton } from "@/components/taxonomy/taxonomy-request-button";
import {
  TAXONOMY_KIND_META,
  TAXONOMY_STATUS_META,
  type TaxonomyCategory,
  type TaxonomyKind,
  type TaxonomyRequest,
  type TaxonomyVendorType,
  type TaxonomyVariant,
} from "@/lib/taxonomy/types";

type Snapshot = {
  vendorTypes: TaxonomyVendorType[];
  categories: TaxonomyCategory[];
  variants: TaxonomyVariant[];
};

type TaxonomyCenterProps = {
  initialSnapshot: Snapshot;
  initialRequests: TaxonomyRequest[];
  initialRevision: number;
  viewerName: string;
};

type TabKey = "requests" | "vendor_types" | "categories" | "variants";

const TABS: { key: TabKey; label: string }[] = [
  { key: "requests", label: "طلبات الإضافة" },
  { key: "vendor_types", label: "أنواع التجار" },
  { key: "categories", label: "التصنيفات" },
  { key: "variants", label: "المتغيرات" },
];

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function TaxonomyCenter({
  initialSnapshot,
  initialRequests,
  initialRevision,
  viewerName,
}: TaxonomyCenterProps) {
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot);
  const [requests, setRequests] = useState<TaxonomyRequest[]>(initialRequests);
  const [revision, setRevision] = useState(initialRevision);
  const [tab, setTab] = useState<TabKey>("requests");
  const [vendorFilter, setVendorFilter] = useState<number | "all">("all");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [toast, setToast] = useState("");

  const [approveTarget, setApproveTarget] = useState<TaxonomyRequest | null>(null);
  const [approveId, setApproveId] = useState("");
  const [approveError, setApproveError] = useState("");
  const [approving, setApproving] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<TaxonomyRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [snapshotResponse, requestsResponse] = await Promise.all([
        fetch("/api/taxonomy", { cache: "no-store" }),
        fetch("/api/taxonomy/requests", { cache: "no-store" }),
      ]);
      if (!snapshotResponse.ok || !requestsResponse.ok) return;
      const snapshotPayload = (await snapshotResponse.json()) as Snapshot & {
        revision: number;
      };
      const requestsPayload = (await requestsResponse.json()) as {
        requests: TaxonomyRequest[];
        revision: number;
      };
      setSnapshot({
        vendorTypes: snapshotPayload.vendorTypes ?? [],
        categories: snapshotPayload.categories ?? [],
        variants: snapshotPayload.variants ?? [],
      });
      setRequests(requestsPayload.requests ?? []);
      setRevision(requestsPayload.revision ?? snapshotPayload.revision ?? 0);
    } catch {
      /* keep last known state */
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const pending = useMemo(
    () => requests.filter((request) => request.status === "pending"),
    [requests],
  );
  const decided = useMemo(
    () =>
      requests
        .filter((request) => request.status !== "pending")
        .sort((left, right) =>
          (right.decidedAt ?? "").localeCompare(left.decidedAt ?? ""),
        ),
    [requests],
  );

  const vendorTypeMap = useMemo(
    () => new Map(snapshot.vendorTypes.map((vendor) => [vendor.id, vendor])),
    [snapshot.vendorTypes],
  );

  const filteredCategories = useMemo(() => {
    const query = categoryQuery.trim();
    return snapshot.categories
      .filter((category) =>
        vendorFilter === "all" ? true : category.vendorTypeId === vendorFilter,
      )
      .filter((category) =>
        query.length === 0
          ? true
          : category.name_ar.includes(query) ||
            category.name_en.toLowerCase().includes(query.toLowerCase()) ||
            String(category.id) === query,
      )
      .sort(
        (left, right) =>
          left.vendorTypeId - right.vendorTypeId ||
          left.sortOrder - right.sortOrder,
      );
  }, [snapshot.categories, vendorFilter, categoryQuery]);

  const requestTaxonomy: TaxonomyVendorType[] = snapshot.vendorTypes;

  const announce = useCallback(
    (message: string) => {
      setToast(message);
      void refresh();
    },
    [refresh],
  );

  async function approve() {
    if (!approveTarget) return;
    const dashboardId = Number(approveId);
    if (!Number.isInteger(dashboardId) || dashboardId <= 0) {
      setApproveError("أدخل معرّف لوحة المستهلك الرقمي الرسمي.");
      return;
    }
    setApproveError("");
    setApproving(true);
    try {
      const response = await fetch(
        `/api/taxonomy/requests/${approveTarget.id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dashboardId }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر اعتماد الطلب.");
      }
      setToast(
        `تم اعتماد «${approveTarget.name_ar}» وربطه بمعرّف لوحة المستهلك ${dashboardId}.`,
      );
      setApproveTarget(null);
      setApproveId("");
      await refresh();
    } catch (approveFailure) {
      setApproveError(
        approveFailure instanceof Error
          ? approveFailure.message
          : "تعذر اعتماد الطلب.",
      );
    } finally {
      setApproving(false);
    }
  }

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
      setToast(`تم رفض طلب «${rejectTarget.name_ar}».`);
      setRejectTarget(null);
      setRejectReason("");
      await refresh();
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
    <>
      <section className="taxonomy-guardrail">
        <div>
          <p className="eyebrow">قاعدة الحوكمة</p>
          <h2>مساران: إضافة مباشرة للمسؤولين وطلب مراجعة للميدان</h2>
          <p>
            من يملك <code>manage_taxonomy</code> ينشئ السجل مباشرةً ويُدخل معرّف
            لوحة المستهلك في خطوة واحدة دون طابور طلبات. أما مندوبو الميدان
            ومديرو المدن فيرسلون طلب إضافة يصل إلى قائمة الانتظار أدناه.
          </p>
        </div>
        <div className="taxonomy-guardrail-stats">
          <span className="badge badge-gold">{pending.length} قيد المراجعة</span>
          <span className="badge badge-green">
            {requests.filter((request) => request.status === "approved").length}{" "}
            معتمد
          </span>
          <span className="badge badge-red">
            {requests.filter((request) => request.status === "rejected").length}{" "}
            مرفوض
          </span>
        </div>
      </section>

      <section className="panel">
        <div className="taxonomy-tabs" role="tablist">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={tab === entry.key}
              className={`taxonomy-tab${tab === entry.key ? " is-active" : ""}`}
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
              {entry.key === "requests" && pending.length > 0 ? (
                <span className="taxonomy-tab-count">{pending.length}</span>
              ) : null}
            </button>
          ))}
          <span className="taxonomy-revision">rev {revision}</span>
        </div>

        {tab === "requests" ? (
          <div className="taxonomy-pane">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">قائمة الانتظار</p>
                <h2>طلبات بانتظار قرار</h2>
              </div>
              <div className="row-actions">
                <TaxonomyRequestButton
                  kind="vendor_type"
                  vendorTypes={requestTaxonomy}
                  onRequested={announce}
                />
                <TaxonomyRequestButton
                  kind="category"
                  vendorTypes={requestTaxonomy}
                  onRequested={announce}
                />
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
                        <span className="badge">{TAXONOMY_KIND_META[request.kind].label}</span>
                        <h3>{request.name_ar}</h3>
                        {request.name_en ? (
                          <p className="muted">{request.name_en}</p>
                        ) : null}
                      </div>
                      <span className={`badge ${TAXONOMY_STATUS_META[request.status].tone}`}>
                        {TAXONOMY_STATUS_META[request.status].label}
                      </span>
                    </div>
                    <dl className="taxonomy-meta">
                      {request.kind === "category" && request.vendorTypeId != null ? (
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
                      <button
                        type="button"
                        className="button button-danger"
                        onClick={() => {
                          setRejectTarget(request);
                          setRejectReason("");
                          setRejectError("");
                        }}
                      >
                        رفض
                      </button>
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => {
                          setApproveTarget(request);
                          setApproveId("");
                          setApproveError("");
                        }}
                      >
                        اعتماد وربط المعرّف
                      </button>
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
                            <span className={`badge ${TAXONOMY_STATUS_META[request.status].tone}`}>
                              {TAXONOMY_STATUS_META[request.status].label}
                            </span>
                            {request.status === "rejected" && request.rejectionReason ? (
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
          </div>
        ) : null}

        {tab === "vendor_types" ? (
          <div className="taxonomy-pane">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">المصدر المركزي</p>
                <h2>أنواع التجار المعتمدة</h2>
              </div>
              <TaxonomyRequestButton
                kind="vendor_type"
                vendorTypes={requestTaxonomy}
                onRequested={announce}
              />
            </div>
            <div className="table-wrap w-full overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Dashboard ID</th>
                    <th>الاسم العربي</th>
                    <th>الاسم الإنجليزي</th>
                    <th>المصدر</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.vendorTypes
                    .slice()
                    .sort((left, right) => left.id - right.id)
                    .map((vendor) => (
                      <tr key={vendor.id}>
                        <td>
                          <span className="taxonomy-id">{vendor.id}</span>
                        </td>
                        <td>
                          <strong>{vendor.name_ar}</strong>
                        </td>
                        <td className="muted">{vendor.name_en || "—"}</td>
                        <td>
                          <span className="badge">
                            {vendor.source === "dashboard" ? "لوحة المستهلك" : "طلب معتمد"}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${vendor.active ? "badge-green" : "badge-red"}`}>
                            {vendor.active ? "نشط" : "موقوف"}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "categories" ? (
          <div className="taxonomy-pane">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">شجرة التصنيفات</p>
                <h2>التصنيفات داخل نطاق نوع التاجر</h2>
              </div>
              <TaxonomyRequestButton
                kind="category"
                vendorTypes={requestTaxonomy}
                onRequested={announce}
              />
            </div>
            <div className="table-toolbar">
              <label className="field field-inline">
                <span>نوع التاجر</span>
                <select
                  value={vendorFilter}
                  onChange={(event) =>
                    setVendorFilter(
                      event.target.value === "all"
                        ? "all"
                        : Number(event.target.value),
                    )
                  }
                >
                  <option value="all">كل الأنواع</option>
                  {snapshot.vendorTypes
                    .slice()
                    .sort((left, right) => left.id - right.id)
                    .map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name_ar} (ID: {vendor.id})
                      </option>
                    ))}
                </select>
              </label>
              <div className="search-shell">
                <span>بحث</span>
                <input
                  type="search"
                  value={categoryQuery}
                  onChange={(event) => setCategoryQuery(event.target.value)}
                  placeholder="اسم التصنيف أو معرّفه"
                  aria-label="البحث في التصنيفات"
                />
              </div>
            </div>
            <div className="table-wrap w-full overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Dashboard ID</th>
                    <th>التصنيف</th>
                    <th>نوع التاجر</th>
                    <th>الأصل</th>
                    <th>الترتيب</th>
                    <th>المصدر</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.map((category) => (
                    <tr key={category.key}>
                      <td>
                        <span className="taxonomy-id">{category.id}</span>
                      </td>
                      <td>
                        <strong>{category.name_ar}</strong>
                        {category.name_en ? (
                          <span className="muted merchant-category">
                            {category.name_en}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {vendorTypeMap.get(category.vendorTypeId)?.name_ar ??
                          `نوع ${category.vendorTypeId}`}
                      </td>
                      <td className="muted">
                        {category.parentId != null ? category.parentId : "جذر"}
                      </td>
                      <td>{category.sortOrder}</td>
                      <td>
                        <span className="badge">
                          {category.source === "dashboard" ? "لوحة المستهلك" : "طلب معتمد"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredCategories.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <p className="empty-state">لا توجد تصنيفات مطابقة.</p>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "variants" ? (
          <div className="taxonomy-pane">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">خصائص المنتجات</p>
                <h2>مجموعات المتغيرات وخياراتها</h2>
              </div>
              <TaxonomyRequestButton
                kind="variant"
                vendorTypes={requestTaxonomy}
                onRequested={announce}
              />
            </div>
            <div className="taxonomy-variant-grid">
              {snapshot.variants
                .slice()
                .sort((left, right) => left.variant_id - right.variant_id)
                .map((variant) => (
                  <article key={variant.variant_id} className="taxonomy-variant-card">
                    <div className="taxonomy-request-head">
                      <div>
                        <span className="taxonomy-id">{variant.variant_id}</span>
                        <h3>{variant.name_ar}</h3>
                        {variant.name_en ? (
                          <p className="muted">{variant.name_en}</p>
                        ) : null}
                      </div>
                      <span className="badge">{variant.options.length} خيار</span>
                    </div>
                    <ul className="taxonomy-option-list">
                      {variant.options.map((option) => (
                        <li key={`${variant.variant_id}-${option.option_id}`}>
                          <span className="taxonomy-id taxonomy-id-small">
                            {option.option_id}
                          </span>
                          <span>{option.option_name_ar}</span>
                          {option.aliases.length > 0 ? (
                            <span className="muted">
                              ({option.aliases.join("، ")})
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
            </div>
          </div>
        ) : null}
      </section>

      <Modal
        open={approveTarget != null}
        title="اعتماد وربط معرّف لوحة المستهلك"
        eyebrow="حوكمة التصنيفات"
        description="أنشئ السجل أولاً على لوحة المستهلك، ثم أدخل معرّفه الرقمي الرسمي هنا. لا يُنشأ معرّف محلي."
        onClose={() => {
          if (approving) return;
          setApproveTarget(null);
        }}
      >
        {approveTarget ? (
          <div className="form-stack">
            <div className="taxonomy-approve-summary">
              <span className="badge">{TAXONOMY_KIND_META[approveTarget.kind].label}</span>
              <h3>{approveTarget.name_ar}</h3>
              {approveTarget.kind === "category" && approveTarget.vendorTypeId != null ? (
                <p className="muted">
                  يتبع نوع:{" "}
                  {vendorTypeMap.get(approveTarget.vendorTypeId)?.name_ar ??
                    approveTarget.vendorTypeId}
                </p>
              ) : null}
              <p className="taxonomy-justification">{approveTarget.justification}</p>
              <p className="muted">المراجع: {viewerName}</p>
            </div>
            <label className="field">
              <span>Dashboard ID الرسمي</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={approveId}
                onChange={(event) => setApproveId(event.target.value)}
                placeholder="مثال: 16"
                required
                autoFocus
              />
              <span className="field-hint">
                رقم صحيح موجب أنشأته لوحة المستهلك لهذا السجل. لن يمكن تعديله بعد
                الربط.
              </span>
            </label>
            {approveError ? (
              <p className="form-error" role="alert">
                {approveError}
              </p>
            ) : null}
            <div className="form-actions">
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setApproveTarget(null)}
                disabled={approving}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => void approve()}
                disabled={approving || approveId.trim().length === 0}
              >
                {approving ? "جارٍ الاعتماد..." : "اعتماد وربط"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

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
              <span className="badge">{TAXONOMY_KIND_META[rejectTarget.kind].label}</span>
              <h3>{rejectTarget.name_ar}</h3>
            </div>
            <label className="field">
              <span>سبب الرفض</span>
              <textarea
                rows={4}
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="مثال: يوجد تصنيف معتمد يغطي هذه الحالة."
                required
              />
            </label>
            {rejectError ? (
              <p className="form-error" role="alert">
                {rejectError}
              </p>
            ) : null}
            <div className="form-actions">
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setRejectTarget(null)}
                disabled={rejecting}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={() => void reject()}
                disabled={rejecting}
              >
                {rejecting ? "جارٍ الرفض..." : "تأكيد الرفض"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
