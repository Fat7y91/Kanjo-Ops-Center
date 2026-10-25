"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { JustificationModal, StateModal } from "@/components/field-ops/request-modals";
import {
  CONTRACT_STATE_META,
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
    { value: "contract", label: "Contract" },
    { value: "tax", label: "Tax document" },
    { value: "license", label: "License" },
    { value: "other", label: "Other" },
  ];

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
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
  const otherTeam = merchant.team !== viewerTeam;
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
        throw new Error(payload.error ?? "The document could not be saved.");
      }
      setDocName("");
      setDocUrl("");
      announce("Document attached to the merchant profile.");
      router.refresh();
    } catch (error) {
      setDocError(
        error instanceof Error
          ? error.message
          : "The document could not be saved.",
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
            <span className="chip chip-team">{merchant.team}</span>
            {merchant.editUnlocked ? (
              <span className="badge badge-purple">Edit unlocked</span>
            ) : null}
            {otherTeam ? (
              <span className="badge badge-gold">Owned by another team</span>
            ) : null}
          </div>
        </div>
        <div className="profile-actions">
          {canViewFieldOpsPage ? (
            <Link href="/field-ops" className="button button-quiet">
              Back to board
            </Link>
          ) : null}
          {canRequestTransfers && otherTeam ? (
            <button
              type="button"
              className="button button-quiet"
              onClick={() => setTransferOpen(true)}
            >
              Request transfer
            </button>
          ) : null}
          {canManageState ? (
            <button
              type="button"
              className="button button-primary"
              onClick={() => setStateOpen(true)}
            >
              Override state
            </button>
          ) : null}
        </div>
      </section>

      <section className="profile-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Commercials</p>
              <h2>Deal economics</h2>
            </div>
          </div>
          <div className="detail-grid detail-grid-wide">
            <div>
              <span className="detail-label">Monthly value</span>
              <strong>{formatAmount(merchant.monthlyValue)}</strong>
            </div>
            <div>
              <span className="detail-label">Target commission</span>
              <strong>{merchant.targetCommission}%</strong>
            </div>
            <div>
              <span className="detail-label">Earned commission</span>
              <strong>{formatAmount(merchant.commissionAmount)}</strong>
            </div>
            <div>
              <span className="detail-label">Last visit</span>
              <strong>
                {merchant.lastVisitAt
                  ? formatDateTime(merchant.lastVisitAt)
                  : "Never"}
              </strong>
            </div>
          </div>
          <div className="note-block">
            <span className="detail-label">Strategic notes</span>
            <p>{merchant.strategicNotes || "No notes recorded."}</p>
          </div>
          {finalLocked && canViewFieldOps && !otherTeam ? (
            <div className="lock-panel">
              <span className="badge badge-red">Final contract locked</span>
              <p>
                Outcome changes require manager approval. Submit an edit request
                with a reason.
              </p>
              <button
                type="button"
                className="button button-primary"
                onClick={() => setEditOpen(true)}
              >
                Request edit approval
              </button>
            </div>
          ) : null}
          {merchant.contractState === "signed_contract" ? (
            <p className="inline-note">
              Signed contracts are strictly locked. Commission has been
              calculated and only a state-management capability can change this
              record.
            </p>
          ) : null}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Visit history</p>
              <h2>Report timeline</h2>
            </div>
            <span className="badge">{reports.length} reports</span>
          </div>
          {reports.length === 0 ? (
            <p className="empty-state">No visit reports yet.</p>
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
                      {report.repName} · {report.team}
                      {report.commissionAmount > 0
                        ? ` · ${formatAmount(report.commissionAmount)} commission`
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
              <p className="eyebrow">Merchant documents</p>
              <h2>Agreement file</h2>
            </div>
            <span
              className={`badge ${agreementReached ? "badge-green" : "badge-gold"}`}
            >
              {agreementReached ? "Unlocked" : "Locked"}
            </span>
          </div>

          {!agreementReached ? (
            <p className="empty-state">
              Documents unlock only after a final or signed agreement. This keeps
              the daily visit flow free of document uploads.
            </p>
          ) : (
            <>
              {merchant.documents.length === 0 ? (
                <p className="empty-state">No documents attached yet.</p>
              ) : (
                <ul className="document-list">
                  {merchant.documents.map((document) => (
                    <li key={document.id}>
                      <div>
                        <strong>{document.name}</strong>
                        <span>
                          {document.type} · {formatDateTime(document.uploadedAt)}
                        </span>
                      </div>
                      {document.url ? (
                        <a
                          href={document.url}
                          className="button button-small button-quiet"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="badge">No link</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {canEditMerchants ? (
                <form className="form-stack document-form" onSubmit={addDocument}>
                  <div className="form-grid">
                    <label className="field">
                      <span>Document name</span>
                      <input
                        value={docName}
                        onChange={(event) => setDocName(event.target.value)}
                        placeholder="Signed contract 2026"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Type</span>
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
                    <span>Document URL</span>
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
                      {docSaving ? "Attaching..." : "Attach document"}
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
              <p className="eyebrow">Operations</p>
              <h2>Tasks and audit</h2>
            </div>
          </div>
          <div className="stack-list">
            <div>
              <span className="detail-label">Scheduled tasks</span>
              {tasks.length === 0 ? (
                <p className="muted">No tasks scheduled for this merchant.</p>
              ) : (
                <ul className="plain-list">
                  {tasks.map((task) => (
                    <li key={task.id}>
                      <span>{task.visitDate}</span>
                      <span className={`badge ${task.status === "completed" ? "badge-green" : ""}`}>
                        {task.status}
                      </span>
                      <span className="muted">{task.team}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <span className="detail-label">State overrides</span>
              {overrides.length === 0 ? (
                <p className="muted">No manager overrides recorded.</p>
              ) : (
                <ul className="plain-list">
                  {overrides.map((override) => (
                    <li key={override.id}>
                      <span>
                        {CONTRACT_STATE_META[override.fromState].label} →{" "}
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
        title={`Transfer ${merchant.name}`}
        eyebrow="Cross-team ownership"
        description="A manager reviews this justification before ownership moves."
        label="Justification"
        placeholder="Why should this merchant move to your team?"
        submitLabel="Submit transfer request"
        field="justification"
        successMessage="Transfer request submitted for manager approval."
        onClose={() => setTransferOpen(false)}
        onDone={(message) => {
          announce(message);
          router.refresh();
        }}
      />

      <JustificationModal
        open={editOpen}
        endpoint={`/api/field-ops/merchants/${merchant.id}/edit-requests`}
        title={`Unlock ${merchant.name}`}
        eyebrow="Final contract lock"
        description="A manager must approve the reason before the outcome can change."
        label="Reason for edit"
        placeholder="What is wrong, and what should change?"
        submitLabel="Request edit approval"
        field="reason"
        successMessage="Edit request submitted for manager approval."
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
