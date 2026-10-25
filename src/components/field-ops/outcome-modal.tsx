"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import {
  CONTRACT_STATES,
  CONTRACT_STATE_META,
  type ContractState,
  type FieldTask,
  type Merchant,
} from "@/lib/field-ops/types";

type OutcomeModalProps = {
  open: boolean;
  merchant: Merchant | null;
  task: FieldTask | null;
  canManageState: boolean;
  canRequestEdit: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  onRequestEdit: (merchant: Merchant) => void;
};

export function OutcomeModal({
  open,
  merchant,
  task,
  canManageState,
  canRequestEdit,
  onClose,
  onDone,
  onRequestEdit,
}: OutcomeModalProps) {
  const [outcome, setOutcome] = useState<ContractState>("no_agreement");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !merchant) return;
    setOutcome(merchant.contractState);
    setNotes("");
    setError("");
    setSaving(false);
  }, [open, merchant]);

  if (!merchant) return null;

  const target = merchant;

  const signedLocked =
    merchant.contractState === "signed_contract" && !canManageState;
  const finalLocked =
    merchant.contractState === "final_contract" &&
    !merchant.editUnlocked &&
    !canManageState;
  const locked = signedLocked || finalLocked;

  const choices = CONTRACT_STATES.filter(
    (state) => canManageState || state !== "signed_contract",
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    setError("");
    setSaving(true);
    try {
      const response = await fetch(
        `/api/field-ops/merchants/${target.id}/reports`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outcome,
            notes,
            taskId: task?.id ?? null,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save the visit report.");
      }
      onDone(`Visit report saved for ${target.name}.`);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not save the visit report.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`Log visit outcome — ${merchant.name}`}
      eyebrow={task ? `Scheduled ${task.visitDate}` : "Field report"}
      description="Outcomes drive the merchant lifecycle. Locked states require manager approval before they can change."
      onClose={onClose}
    >
      {locked ? (
        <div className="lock-panel">
          <span className="badge badge-red">
            {signedLocked ? "Signed contract locked" : "Final contract locked"}
          </span>
          <p>
            {signedLocked
              ? "Signed contracts are strictly locked. Only a capability holder with merchant state management can change this record."
              : "This final contract is locked for representatives. Submit an edit request with a reason for manager approval."}
          </p>
          {!signedLocked && canRequestEdit ? (
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                onClose();
                onRequestEdit(merchant);
              }}
            >
              Request edit approval
            </button>
          ) : null}
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <div className="field">
            <span>Outcome</span>
            <div className="outcome-grid">
              {choices.map((state) => {
                const meta = CONTRACT_STATE_META[state];
                return (
                  <button
                    key={state}
                    type="button"
                    className={`outcome-option${
                      outcome === state ? " outcome-option-active" : ""
                    }`}
                    onClick={() => setOutcome(state)}
                  >
                    <strong>{meta.label}</strong>
                    <span>{meta.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="field">
            <span>Visit notes</span>
            <textarea
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="What did you observe? Who did you meet? What is the agreed next step?"
              minLength={10}
              required
            />
            <span className="field-hint">
              Minimum 10 characters. Notes are stored with the immutable report
              history.
            </span>
          </label>

          {merchant.editUnlocked ? (
            <p className="inline-note">
              An approved edit is active for this merchant. Saving will relock
              the record.
            </p>
          ) : null}

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="form-actions">
            <button
              type="button"
              className="button button-quiet"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save outcome"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
