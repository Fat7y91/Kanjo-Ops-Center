"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CreateTaskModal } from "@/components/field-ops/create-task-modal";
import {
  VisitEngine,
  type VisitEngineTarget,
} from "@/components/field-ops/visit-engine";
import {
  DecisionModal,
  JustificationModal,
} from "@/components/field-ops/request-modals";
import { FollowUpActions } from "@/components/field-ops/follow-up-actions";
import type { FieldOpsBoard } from "@/lib/field-ops/board";
import { useVisitQueue } from "@/lib/field-ops/offline-queue";
import {
  CONTRACT_STATE_META,
  CONTRACT_STATES,
  FIELD_TEAMS,
  FOLLOW_UP_KIND_META,
  teamLabel,
  type EditRequest,
  type FieldTask,
  type Merchant,
  type MerchantSearchResult,
  type TransferRequest,
} from "@/lib/field-ops/types";

type FieldOpsClientProps = {
  initialBoard: FieldOpsBoard;
  viewerTeam: string;
  canManageTasks: boolean;
  canRequestTransfers: boolean;
  canApproveTransfers: boolean;
  canApproveEdits: boolean;
  canManageState: boolean;
  canViewMerchants: boolean;
  canAssignTasks: boolean;
};

type DecisionTarget = {
  kind: "transfer" | "edit";
  id: string;
  merchantName: string;
  text: string;
};

function formatAmount(value: number): string {
  return new Intl.NumberFormat("ar-EG-u-nu-latn", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
}

const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "تمت الموافقة",
  rejected: "مرفوض",
};

function requestStatusLabel(status: string): string {
  return REQUEST_STATUS_LABEL[status] ?? status;
}

function matchTypeLabel(value: string): string {
  return value
    .replace("merchant", "التاجر")
    .replace("city", "المدينة")
    .replace("notes", "الملاحظات")
    .replace("exact", "تطابق تام")
    .replace("prefix", "بداية الاسم")
    .replace("contains", "احتواء")
    .replace("token", "كلمة")
    .replace("dotless", "بدون نقاط")
    .replace("fuzzy", "تقريبي");
}

export function FieldOpsClient({
  initialBoard,
  viewerTeam,
  canManageTasks,
  canRequestTransfers,
  canApproveTransfers,
  canApproveEdits,
  canManageState,
  canViewMerchants,
  canAssignTasks,
}: FieldOpsClientProps) {
  const [board, setBoard] = useState(initialBoard);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MerchantSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [visitTarget, setVisitTarget] = useState<VisitEngineTarget | null>(
    null,
  );
  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({});
  const [transferTarget, setTransferTarget] = useState<Merchant | null>(null);
  const [editTarget, setEditTarget] = useState<Merchant | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<DecisionTarget | null>(
    null,
  );
  const [toast, setToast] = useState("");
  const {
    pending: pendingSync,
    online,
    syncing,
    flush,
  } = useVisitQueue();

  const merchantMap = useMemo(
    () => new Map(board.merchants.map((merchant) => [merchant.id, merchant])),
    [board.merchants],
  );
  const cityMap = useMemo(
    () => new Map(board.cities.map((city) => [city.id, city])),
    [board.cities],
  );

  const toastTimer = useRef<number | null>(null);

  const announce = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 4500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/field-ops/board", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { board?: FieldOpsBoard };
      if (payload.board) setBoard(payload.board);
    } catch {
      // Keep the last good board; the user can retry via any action.
    }
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setResults(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/field-ops/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!response.ok) throw new Error("search failed");
        const payload = (await response.json()) as {
          results?: MerchantSearchResult[];
        };
        setResults(payload.results ?? []);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 260);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const teamsInBoard = useMemo(() => {
    const teams = new Set<string>(FIELD_TEAMS);
    board.tasks.forEach((task) => teams.add(task.team));
    return Array.from(teams);
  }, [board.tasks]);

  const visibleTasks = useMemo(() => {
    if (!canManageTasks || teamFilter === "all") return board.tasks;
    return board.tasks.filter((task) => task.team === teamFilter);
  }, [board.tasks, canManageTasks, teamFilter]);

  const scheduled = visibleTasks.filter((task) => task.status === "scheduled");
  const completed = visibleTasks.filter((task) => task.status === "completed");

  const pendingTransfers = board.transferRequests.filter(
    (request) => request.status === "pending",
  );
  const reviewedTransfers = board.transferRequests.filter(
    (request) => request.status !== "pending",
  );
  const pendingEdits = board.editRequests.filter(
    (request) => request.status === "pending",
  );
  const reviewedEdits = board.editRequests.filter(
    (request) => request.status !== "pending",
  );

  async function openVisit(merchant: Merchant, task: FieldTask | null) {
    // Fetch the authoritative visit count so the conditional outcome gate is
    // correct even if this merchant was never on this rep's board before.
    let count = visitCounts[merchant.id];
    if (count === undefined) {
      try {
        const response = await fetch(
          `/api/field-ops/merchants/${merchant.id}/reports`,
          { cache: "no-store" },
        );
        if (response.ok) {
          const payload = (await response.json()) as { visitCount?: number };
          count = payload.visitCount ?? 0;
        }
      } catch {
        count = 0;
      }
    }
    setVisitCounts((current) => ({ ...current, [merchant.id]: count ?? 0 }));
    setVisitTarget({
      merchant,
      taskId: task?.id ?? null,
      visitCount: count ?? 0,
    });
  }

  function renderTask(task: FieldTask) {
    const merchant = merchantMap.get(task.merchantId) ?? null;
    const city = cityMap.get(task.cityId);
    const state = merchant?.contractState ?? "no_agreement";
    const meta = CONTRACT_STATE_META[state];
    const otherTeam = merchant ? Boolean(merchant.team) && merchant.team !== viewerTeam : false;
    // Prefer the dialable number captured on the follow-up itself; fall back
    // to the merchant's primary contact for older tasks created before the
    // number was required.
    const followUpNumber =
      task.followUpContactNumber ?? merchant?.contact?.mobile ?? null;

    return (
      <article key={task.id} className="task-card">
        <div className="task-card-top">
          <span className={`badge ${meta.tone}`}>{meta.label}</span>
          <span className="chip chip-team">{teamLabel(task.team)}</span>
          {task.followUpKind ? (
            <span className="badge badge-green">
              {FOLLOW_UP_KIND_META[task.followUpKind].label}
            </span>
          ) : null}
        </div>
        <h3>{task.merchantName}</h3>
        <p className="task-meta">
          {city?.name ?? "مدينة غير محددة"} · {formatDate(task.visitDate)} ·{" "}
          هدف {task.targetCommission}%
        </p>
        {task.instructions ? (
          <p className="task-instructions">
            <span>تعليمات المهمة</span>
            {task.instructions}
          </p>
        ) : null}
        {task.strategicNotes && task.strategicNotes !== task.instructions ? (
          <p className="task-notes">{task.strategicNotes}</p>
        ) : null}
        <div className="task-figures">
          <div>
            <span>القيمة الشهرية</span>
            <strong>{formatAmount(merchant?.monthlyValue ?? 0)}</strong>
          </div>
          <div>
            <span>العمولة</span>
            <strong>{formatAmount(merchant?.commissionAmount ?? 0)}</strong>
          </div>
        </div>
        <div className="row-actions">
          {merchant ? (
            <>
              <button
                type="button"
                className="button button-small button-primary"
                onClick={() => void openVisit(merchant, task)}
              >
                بدء الزيارة
              </button>
              <FollowUpActions
                kind={task.followUpKind}
                number={followUpNumber}
                merchantName={task.merchantName}
                whatsappMessage={`مرحباً ${task.merchantName}، بخصوص متابعة الاتفاق مع كانتو.`}
              />
              {canViewMerchants ? (
                <Link
                  href={`/merchants/${merchant.id}`}
                  className="button button-small button-quiet"
                  prefetch
                >
                  ملف التاجر
                </Link>
              ) : null}
              {otherTeam && canRequestTransfers ? (
                <button
                  type="button"
                  className="button button-small button-quiet"
                  onClick={() => setTransferTarget(merchant)}
                >
                  طلب نقل ملكية
                </button>
              ) : null}
            </>
          ) : (
            <span className="muted">سجل التاجر غير متاح.</span>
          )}
        </div>
      </article>
    );
  }

  function renderTransfer(request: TransferRequest) {
    const canDecide = canApproveTransfers && request.status === "pending";
    return (
      <article key={request.id} className="request-row">
        <div className="request-main">
          <div className="request-title">
            <strong>{request.merchantName}</strong>
            <span
              className={`badge ${
                request.status === "approved"
                  ? "badge-green"
                  : request.status === "rejected"
                    ? "badge-red"
                    : "badge-gold"
              }`}
            >
              {requestStatusLabel(request.status)}
            </span>
          </div>
          <p className="request-route">
            من {teamLabel(request.fromTeam)} إلى {teamLabel(request.toTeam)} · طلب
            بواسطة {request.requestedByName}
          </p>
          <p className="request-quote">{request.justification}</p>
          {request.reviewNote ? (
            <p className="request-review">المراجعة: {request.reviewNote}</p>
          ) : null}
        </div>
        {canDecide ? (
          <div className="request-actions">
            <button
              type="button"
              className="button button-small button-primary"
              onClick={() =>
                setDecisionTarget({
                  kind: "transfer",
                  id: request.id,
                  merchantName: request.merchantName,
                  text: request.justification,
                })
              }
            >
              مراجعة
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  function renderEdit(request: EditRequest) {
    const canDecide = canApproveEdits && request.status === "pending";
    return (
      <article key={request.id} className="request-row">
        <div className="request-main">
          <div className="request-title">
            <strong>{request.merchantName}</strong>
            <span
              className={`badge ${
                request.status === "approved"
                  ? "badge-green"
                  : request.status === "rejected"
                    ? "badge-red"
                    : "badge-gold"
              }`}
            >
              {requestStatusLabel(request.status)}
            </span>
          </div>
          <p className="request-route">
            اعتماد تعديل · {request.requestedByName}
          </p>
          <p className="request-quote">{request.reason}</p>
          {request.reviewNote ? (
            <p className="request-review">المراجعة: {request.reviewNote}</p>
          ) : null}
        </div>
        {canDecide ? (
          <div className="request-actions">
            <button
              type="button"
              className="button button-small button-primary"
              onClick={() =>
                setDecisionTarget({
                  kind: "edit",
                  id: request.id,
                  merchantName: request.merchantName,
                  text: request.reason,
                })
              }
            >
              مراجعة
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <>
      {!online ? (
        <div className="offline-banner" role="status">
          <span className="offline-dot" />
          <div>
            <strong>وضع عدم الاتصال</strong>
            <span>
              يمكنك بدء الزيارة وإدخال التقرير الآن. سيُحفظ محلياً على الجهاز
              ويُزامن تلقائياً عند عودة الشبكة.
            </span>
          </div>
        </div>
      ) : null}

      {pendingSync > 0 ? (
        <div className="sync-banner" role="status">
          <div>
            <strong>{pendingSync} زيارة بانتظار المزامنة</strong>
            <span>
              {syncing
                ? "جارٍ إرسال الزيارات المحفوظة محلياً…"
                : "ستُرسل تلقائياً بمجرد استقرار الاتصال."}
            </span>
          </div>
          <button
            type="button"
            className="button button-small button-quiet"
            onClick={() => void flush()}
            disabled={syncing || !online}
          >
            {syncing ? "جارٍ المزامنة…" : "مزامنة الآن"}
          </button>
        </div>
      ) : null}

      <section className="panel">
        <div className="field-ops-toolbar">
          <div className="search-shell search-shell-lg">
            <span>بحث ذكي</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="كافيار، عبر الشام، Kaffyar، صيدلية…"
              aria-label="البحث الذكي عن التجار"
            />
          </div>
          <div className="row-actions">
            {canAssignTasks ? (
              <button
                type="button"
                className="button button-primary"
                onClick={() => setCreateOpen(true)}
              >
                إسناد مهمة
              </button>
            ) : null}
          </div>
        </div>

        {results !== null ? (
          <div className="search-results">
            <div className="search-results-head">
              <span>
                {searching
                  ? "جارٍ البحث…"
                  : `${results.length} نتيجة`}
              </span>
              <button
                type="button"
                className="button button-small button-quiet"
                onClick={() => setQuery("")}
              >
                مسح
              </button>
            </div>
            {results.length === 0 && !searching ? (
              <p className="muted search-empty">
                لا يوجد تاجر مطابق لهذا الإملاء. جرّب حروفاً أقل أو الاسم
                العربي.
              </p>
            ) : (
              <ul className="search-list">
                {results.map((result) => {
                  const meta = CONTRACT_STATE_META[result.merchant.contractState];
                  return (
                    <li key={result.merchant.id}>
                      <div className="search-result-main">
                        <strong>{result.merchant.name}</strong>
                        <span className="search-result-meta">
                          {result.cityName} · {result.merchant.vendorType} ·{" "}
                          {matchTypeLabel(result.matchType)} · تطابق{" "}
                          {Math.round(result.score)}%
                        </span>
                      </div>
                      <span className="chip chip-team">
                        {teamLabel(result.merchant.team)}
                      </span>
                      <span className={`badge ${meta.tone}`}>{meta.label}</span>
                      <button
                        type="button"
                        className="button button-small button-primary"
                        onClick={() => {
                          setVisitCounts((current) => ({
                            ...current,
                            [result.merchant.id]:
                              result.visitCount ??
                              current[result.merchant.id] ??
                              0,
                          }));
                          setVisitTarget({
                            merchant: result.merchant,
                            taskId: null,
                            visitCount: result.visitCount ?? 0,
                          });
                        }}
                      >
                        بدء زيارة
                      </button>
                      {canViewMerchants ? (
                        <Link
                          href={`/merchants/${result.merchant.id}`}
                          className="button button-small button-quiet"
                          prefetch
                        >
                          فتح
                        </Link>
                      ) : null}
                      {result.merchant.team && !result.isOwnTeam && canRequestTransfers ? (
                        <button
                          type="button"
                          className="button button-small button-primary"
                          onClick={() => setTransferTarget(result.merchant)}
                        >
                          طلب نقل ملكية
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        <div className="board-toolbar">
          <div>
            <p className="eyebrow">
              {canManageTasks
                ? "لوحة التشغيل الكاملة"
                : `اليوم · ${teamLabel(viewerTeam)}`}
            </p>
            <h2>
              {canManageTasks
                ? "كل الفرق وكل الزيارات"
                : `مسارك ليوم ${formatDate(board.today)}`}
            </h2>
          </div>
          {canManageTasks ? (
            <div className="segmented">
              <button
                type="button"
                className={teamFilter === "all" ? "is-active" : ""}
                onClick={() => setTeamFilter("all")}
              >
                كل الفرق
              </button>
              {teamsInBoard.map((team) => (
                <button
                  key={team}
                  type="button"
                  className={teamFilter === team ? "is-active" : ""}
                  onClick={() => setTeamFilter(team)}
                >
                  {teamLabel(team)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="board grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="board-column">
            <div className="board-head">
              <h2>مجدولة</h2>
              <span className="badge">{scheduled.length}</span>
            </div>
            {scheduled.length === 0 ? (
              <p className="empty-state">لا توجد زيارات مجدولة في هذا العرض.</p>
            ) : (
              scheduled.map(renderTask)
            )}
          </div>
          <div className="board-column">
            <div className="board-head">
              <h2>مكتملة</h2>
              <span className="badge badge-green">{completed.length}</span>
            </div>
            {completed.length === 0 ? (
              <p className="empty-state">لا توجد زيارات مكتملة بعد.</p>
            ) : (
              completed.map(renderTask)
            )}
          </div>
        </div>
      </section>

      {canApproveTransfers || board.transferRequests.length > 0 ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">الملكية</p>
              <h2>
                {canApproveTransfers
                  ? "قائمة اعتماد النقل"
                  : "طلبات النقل الخاصة بك"}
              </h2>
            </div>
            <span className="badge badge-gold">
              {pendingTransfers.length} قيد المراجعة
            </span>
          </div>
          {pendingTransfers.length === 0 ? (
            <p className="empty-state">لا توجد طلبات نقل معلّقة.</p>
          ) : (
            <div className="request-list">
              {pendingTransfers.map(renderTransfer)}
            </div>
          )}
          {reviewedTransfers.length > 0 ? (
            <details className="history-block">
              <summary>
                طلبات النقل المراجعة ({reviewedTransfers.length})
              </summary>
              <div className="request-list">
                {reviewedTransfers.map(renderTransfer)}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {canApproveEdits || board.editRequests.length > 0 ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">التقارير المقفلة</p>
              <h2>
                {canApproveEdits
                  ? "قائمة اعتماد التعديلات"
                  : "طلبات التعديل الخاصة بك"}
              </h2>
            </div>
            <span className="badge badge-gold">
              {pendingEdits.length} قيد المراجعة
            </span>
          </div>
          {pendingEdits.length === 0 ? (
            <p className="empty-state">لا توجد طلبات تعديل معلّقة.</p>
          ) : (
            <div className="request-list">{pendingEdits.map(renderEdit)}</div>
          )}
          {reviewedEdits.length > 0 ? (
            <details className="history-block">
              <summary>
                طلبات التعديل المراجعة ({reviewedEdits.length})
              </summary>
              <div className="request-list">
                {reviewedEdits.map(renderEdit)}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">ضوابط دورة الحياة</p>
            <h2>كيف تبقى النتائج موثوقة</h2>
          </div>
        </div>
        <div className="rule-grid">
          {CONTRACT_STATES.map((state) => {
            const meta = CONTRACT_STATE_META[state];
            return (
              <div key={state} className="rule-card">
                <span className={`badge ${meta.tone}`}>{meta.label}</span>
                <p>{meta.description}</p>
                <span className="rule-access">
                  {meta.repEditable
                    ? "يمكن للمندوبين تغيير هذه النتيجة."
                    : "يتطلب اعتماد المدير للتغيير."}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <CreateTaskModal
        open={createOpen}
        defaultTeam={viewerTeam}
        onClose={() => setCreateOpen(false)}
        onDone={async (message) => {
          announce(message);
          await refresh();
        }}
      />

      <VisitEngine
        target={visitTarget}
        canManageState={canManageState}
        onClose={() => setVisitTarget(null)}
        onSaved={async (message) => {
          announce(message);
          await refresh();
          if (visitTarget) {
            setVisitCounts((current) => ({
              ...current,
              [visitTarget.merchant.id]: (current[visitTarget.merchant.id] ?? 0) + 1,
            }));
          }
        }}
      />

      <JustificationModal
        open={transferTarget !== null}
        endpoint={
          transferTarget
            ? `/api/field-ops/merchants/${transferTarget.id}/transfers`
            : ""
        }
        title={
          transferTarget ? `نقل ملكية ${transferTarget.name}` : "نقل الملكية"
        }
        eyebrow="ملكية عابرة للفرق"
        description="لا يتم نقل الملكية بصمت. يراجع المدير المبرر التجاري قبل انتقال الملكية."
        label="المبرر"
        placeholder="لماذا يجب أن ينتقل هذا التاجر إلى فريقك؟"
        submitLabel="إرسال طلب النقل"
        field="justification"
        successMessage="تم إرسال طلب النقل لاعتماد المدير."
        onClose={() => setTransferTarget(null)}
        onDone={async (message) => {
          announce(message);
          await refresh();
        }}
      />

      <JustificationModal
        open={editTarget !== null}
        endpoint={
          editTarget
            ? `/api/field-ops/merchants/${editTarget.id}/edit-requests`
            : ""
        }
        title={
          editTarget ? `فتح تعديل ${editTarget.name}` : "طلب تعديل"
        }
        eyebrow="قفل الاتفاق النهائي"
        description="الاتفاقات النهائية مقفلة للمندوبين. يجب أن يعتمد المدير السبب قبل تغيير النتيجة."
        label="سبب التعديل"
        placeholder="ما الخطأ، وما الذي يجب تغييره؟"
        submitLabel="طلب اعتماد التعديل"
        field="reason"
        successMessage="تم إرسال طلب التعديل لاعتماد المدير."
        onClose={() => setEditTarget(null)}
        onDone={async (message) => {
          announce(message);
          await refresh();
        }}
      />

      <DecisionModal
        open={decisionTarget !== null}
        kind={decisionTarget?.kind ?? "transfer"}
        requestId={decisionTarget?.id ?? ""}
        merchantName={decisionTarget?.merchantName ?? ""}
        requestText={decisionTarget?.text ?? ""}
        onClose={() => setDecisionTarget(null)}
        onDone={async (message) => {
          announce(message);
          await refresh();
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
