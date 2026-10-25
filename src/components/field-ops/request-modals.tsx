"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import {
  CONTRACT_STATES,
  CONTRACT_STATE_META,
  type ContractState,
} from "@/lib/field-ops/types";

type JustificationModalProps = {
  open: boolean;
  endpoint: string;
  title: string;
  eyebrow: string;
  description: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  field: "justification" | "reason";
  successMessage: string;
  minLength?: number;
  onClose: () => void;
  onDone: (message: string) => void;
};

export function JustificationModal({
  open,
  endpoint,
  title,
  eyebrow,
  description,
  label,
  placeholder,
  submitLabel,
  field,
  successMessage,
  minLength = 10,
  onClose,
  onDone,
}: JustificationModalProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue("");
    setError("");
    setSaving(false);
  }, [open, endpoint]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          field === "reason" ? { reason: value } : { justification: value },
        ),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "The request could not be saved.");
      }
      onDone(successMessage);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The request could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      eyebrow={eyebrow}
      description={description}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <label className="field">
          <span>{label}</span>
          <textarea
            rows={4}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            minLength={minLength}
            required
          />
          <span className="field-hint">
            Mandatory. Minimum {minLength} characters. Managers see this exactly
            as written.
          </span>
        </label>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={saving || value.trim().length < minLength}
          >
            {saving ? "Submitting..." : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

type DecisionModalProps = {
  open: boolean;
  kind: "transfer" | "edit";
  requestId: string;
  merchantName: string;
  requestText: string;
  onClose: () => void;
  onDone: (message: string) => void;
};

export function DecisionModal({
  open,
  kind,
  requestId,
  merchantName,
  requestText,
  onClose,
  onDone,
}: DecisionModalProps) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNote("");
    setError("");
    setSaving(false);
  }, [open, requestId]);

  async function decide(decision: "approve" | "reject") {
    setError("");
    setSaving(true);
    try {
      const endpoint =
        kind === "transfer"
          ? `/api/field-ops/transfers/${requestId}`
          : `/api/field-ops/edit-requests/${requestId}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "The decision could not be saved.");
      }
      onDone(
        `${kind === "transfer" ? "Transfer" : "Edit request"} ${
          decision === "approve" ? "approved" : "rejected"
        } for ${merchantName}.`,
      );
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The decision could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`Review ${kind === "transfer" ? "transfer" : "edit"} request`}
      eyebrow={merchantName}
      onClose={onClose}
    >
      <div className="request-quote">{requestText}</div>
      <label className="field">
        <span>Decision note (optional)</span>
        <textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Context for the audit trail."
        />
      </label>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="form-actions">
        <button
          type="button"
          className="button button-danger"
          onClick={() => decide("reject")}
          disabled={saving}
        >
          Reject
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={() => decide("approve")}
          disabled={saving}
        >
          {saving ? "Saving..." : "Approve"}
        </button>
      </div>
    </Modal>
  );
}

type StateModalProps = {
  open: boolean;
  merchantName: string;
  current: ContractState;
  onClose: () => void;
  onDone: (message: string) => void;
  endpoint: string;
};

export function StateModal({
  open,
  merchantName,
  current,
  onClose,
  onDone,
  endpoint,
}: StateModalProps) {
  const [state, setState] = useState<ContractState>(current);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setState(current);
    setNote("");
    setError("");
    setSaving(false);
  }, [open, current]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, note }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "The state could not be changed.");
      }
      onDone(
        `${merchantName} moved to ${CONTRACT_STATE_META[state].label}. Audit entry recorded.`,
      );
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The state could not be changed.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`Override contract state — ${merchantName}`}
      eyebrow="City operations"
      description="Manager overrides are audited with the actor, previous state, and mandatory note."
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <label className="field">
          <span>New state</span>
          <select
            value={state}
            onChange={(event) =>
              setState(event.target.value as ContractState)
            }
          >
            {CONTRACT_STATES.map((option) => (
              <option key={option} value={option}>
                {CONTRACT_STATE_META[option].label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Audit note</span>
          <textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why is this override required?"
            minLength={5}
            required
          />
        </label>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={saving}
          >
            {saving ? "Saving..." : "Apply override"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
