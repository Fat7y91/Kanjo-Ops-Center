"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CreateTaskModal } from "@/components/field-ops/create-task-modal";
import { OutcomeModal } from "@/components/field-ops/outcome-modal";
import { DecisionModal, JustificationModal } from "@/components/field-ops/request-modals";
import type { FieldOpsBoard } from "@/lib/field-ops/board";
import {
  CONTRACT_STATE_META,
  CONTRACT_STATES,
  FIELD_TEAMS,
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
};

type DecisionTarget = {
  kind: "transfer" | "edit";
  id: string;
  merchantName: string;
  text: string;
};

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
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
}: FieldOpsClientProps) {
  const [board, setBoard] = useState(initialBoard);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MerchantSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [outcomeTarget, setOutcomeTarget] = useState<{
    merchant: Merchant;
    task: FieldTask | null;
  } | null>(null);
  const [transferTarget, setTransferTarget] = useState<Merchant | null>(null);
  const [editTarget, setEditTarget] = useState<Merchant | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<DecisionTarget | null>(
    null,
  );
  const [toast, setToast] = useState("");

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

  function renderTask(task: FieldTask) {
    const merchant = merchantMap.get(task.merchantId) ?? null;
    const city = cityMap.get(task.cityId);
    const state = merchant?.contractState ?? "no_agreement";
    const meta = CONTRACT_STATE_META[state];
    const otherTeam = merchant ? merchant.team !== viewerTeam : false;

    return (
      <article key={task.id} className="task-card">
        <div className="task-card-top">
          <span className={`badge ${meta.tone}`}>{meta.label}</span>
          <span className="chip chip-team">{task.team}</span>
        </div>
        <h3>{task.merchantName}</h3>
        <p className="task-meta">
          {city?.name ?? "Unassigned city"} · {formatDate(task.visitDate)} ·{" "}
          {task.targetCommission}% target
        </p>
        {task.strategicNotes ? (
          <p className="task-notes">{task.strategicNotes}</p>
        ) : null}
        <div className="task-figures">
          <div>
            <span>Monthly value</span>
            <strong>{formatAmount(merchant?.monthlyValue ?? 0)}</strong>
          </div>
          <div>
            <span>Commission</span>
            <strong>{formatAmount(merchant?.commissionAmount ?? 0)}</strong>
          </div>
        </div>
        <div className="row-actions">
          {merchant ? (
            <>
              <button
                type="button"
                className="button button-small button-primary"
                onClick={() => setOutcomeTarget({ merchant, task })}
              >
                Log outcome
              </button>
              {canViewMerchants ? (
                <Link
                  href={`/merchants/${merchant.id}`}
                  className="button button-small button-quiet"
                >
                  Merchant profile
                </Link>
              ) : null}
              {otherTeam && canRequestTransfers ? (
                <button
                  type="button"
                  className="button button-small button-quiet"
                  onClick={() => setTransferTarget(merchant)}
                >
                  Request transfer
                </button>
              ) : null}
            </>
          ) : (
            <span className="muted">Merchant record unavailable.</span>
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
              {request.status}
            </span>
          </div>
          <p className="request-route">
            {request.fromTeam} → {request.toTeam} · requested by{" "}
            {request.requestedByName}
          </p>
          <p className="request-quote">{request.justification}</p>
          {request.reviewNote ? (
            <p className="request-review">Review: {request.reviewNote}</p>
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
              Review
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
              {request.status}
            </span>
          </div>
          <p className="request-route">
            Edit approval · {request.requestedByName}
          </p>
          <p className="request-quote">{request.reason}</p>
          {request.reviewNote ? (
            <p className="request-review">Review: {request.reviewNote}</p>
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
              Review
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <>
      <section className="panel">
        <div className="field-ops-toolbar">
          <div className="search-shell search-shell-lg">
            <span>Smart search</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="كافيار, عبر الشام, Kaffyar, pharmacy…"
              aria-label="Smart merchant search"
            />
          </div>
          {canManageTasks ? (
            <button
              type="button"
              className="button button-primary"
              onClick={() => setCreateOpen(true)}
            >
              Create task
            </button>
          ) : null}
        </div>

        {results !== null ? (
          <div className="search-results">
            <div className="search-results-head">
              <span>
                {searching
                  ? "Searching…"
                  : `${results.length} match${results.length === 1 ? "" : "es"}`}
              </span>
              <button
                type="button"
                className="button button-small button-quiet"
                onClick={() => setQuery("")}
              >
                Clear
              </button>
            </div>
            {results.length === 0 && !searching ? (
              <p className="muted search-empty">
                No merchant matched that spelling. Try fewer letters or the
                Arabic name.
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
                          {result.cityName} · {result.matchType} ·{" "}
                          {Math.round(result.score)}% match
                        </span>
                      </div>
                      <span className="chip chip-team">
                        {result.merchant.team}
                      </span>
                      <span className={`badge ${meta.tone}`}>{meta.label}</span>
                      {canViewMerchants ? (
                        <Link
                          href={`/merchants/${result.merchant.id}`}
                          className="button button-small button-quiet"
                        >
                          Open
                        </Link>
                      ) : null}
                      {!result.isOwnTeam && canRequestTransfers ? (
                        <button
                          type="button"
                          className="button button-small button-primary"
                          onClick={() => setTransferTarget(result.merchant)}
                        >
                          Request transfer
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
              {canManageTasks ? "Full operational board" : `Today · ${viewerTeam}`}
            </p>
            <h2>
              {canManageTasks
                ? "Every team, every visit"
                : `Your route for ${formatDate(board.today)}`}
            </h2>
          </div>
          {canManageTasks ? (
            <div className="segmented">
              <button
                type="button"
                className={teamFilter === "all" ? "is-active" : ""}
                onClick={() => setTeamFilter("all")}
              >
                All teams
              </button>
              {teamsInBoard.map((team) => (
                <button
                  key={team}
                  type="button"
                  className={teamFilter === team ? "is-active" : ""}
                  onClick={() => setTeamFilter(team)}
                >
                  {team}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="board">
          <div className="board-column">
            <div className="board-head">
              <h2>Scheduled</h2>
              <span className="badge">{scheduled.length}</span>
            </div>
            {scheduled.length === 0 ? (
              <p className="empty-state">
                No scheduled visits for this view.
              </p>
            ) : (
              scheduled.map(renderTask)
            )}
          </div>
          <div className="board-column">
            <div className="board-head">
              <h2>Completed</h2>
              <span className="badge badge-green">{completed.length}</span>
            </div>
            {completed.length === 0 ? (
              <p className="empty-state">No completed visits yet.</p>
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
              <p className="eyebrow">Ownership</p>
              <h2>
                {canApproveTransfers
                  ? "Transfer approval queue"
                  : "Your transfer requests"}
              </h2>
            </div>
            <span className="badge badge-gold">
              {pendingTransfers.length} pending
            </span>
          </div>
          {pendingTransfers.length === 0 ? (
            <p className="empty-state">No pending transfer requests.</p>
          ) : (
            <div className="request-list">
              {pendingTransfers.map(renderTransfer)}
            </div>
          )}
          {reviewedTransfers.length > 0 ? (
            <details className="history-block">
              <summary>Reviewed transfers ({reviewedTransfers.length})</summary>
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
              <p className="eyebrow">Locked reports</p>
              <h2>
                {canApproveEdits ? "Edit approval queue" : "Your edit requests"}
              </h2>
            </div>
            <span className="badge badge-gold">{pendingEdits.length} pending</span>
          </div>
          {pendingEdits.length === 0 ? (
            <p className="empty-state">No pending edit requests.</p>
          ) : (
            <div className="request-list">{pendingEdits.map(renderEdit)}</div>
          )}
          {reviewedEdits.length > 0 ? (
            <details className="history-block">
              <summary>Reviewed edits ({reviewedEdits.length})</summary>
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
            <p className="eyebrow">Lifecycle guardrails</p>
            <h2>How outcomes stay trustworthy</h2>
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
                    ? "Representatives can change this outcome."
                    : "Manager approval required to change."}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <CreateTaskModal
        open={createOpen}
        cities={board.cities}
        defaultTeam={viewerTeam}
        onClose={() => setCreateOpen(false)}
        onDone={async (message) => {
          announce(message);
          await refresh();
        }}
      />

      <OutcomeModal
        open={outcomeTarget !== null}
        merchant={outcomeTarget?.merchant ?? null}
        task={outcomeTarget?.task ?? null}
        canManageState={canManageState}
        canRequestEdit={true}
        onClose={() => setOutcomeTarget(null)}
        onRequestEdit={(merchant) => setEditTarget(merchant)}
        onDone={async (message) => {
          announce(message);
          await refresh();
        }}
      />

      <JustificationModal
        open={transferTarget !== null}
        endpoint={
          transferTarget
            ? `/api/field-ops/merchants/${transferTarget.id}/transfers`
            : ""
        }
        title={transferTarget ? `Transfer ${transferTarget.name}` : "Transfer"}
        eyebrow="Cross-team ownership"
        description="Transfers never happen silently. A manager reviews the business justification before ownership moves."
        label="Justification"
        placeholder="Why should this merchant move to your team?"
        submitLabel="Submit transfer request"
        field="justification"
        successMessage="Transfer request submitted for manager approval."
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
        title={editTarget ? `Unlock ${editTarget.name}` : "Edit request"}
        eyebrow="Final contract lock"
        description="Final contracts are locked for representatives. A manager must approve the reason before the outcome can change."
        label="Reason for edit"
        placeholder="What is wrong, and what should change?"
        submitLabel="Request edit approval"
        field="reason"
        successMessage="Edit request submitted for manager approval."
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
