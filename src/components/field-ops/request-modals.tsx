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
        throw new Error(payload.error ?? "تعذر حفظ الطلب.");
      }
      onDone(successMessage);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر حفظ الطلب.",
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
            إلزامي. {minLength} أحرف على الأقل. يرى المديرون النص كما هو مكتوب
            تماماً.
          </span>
        </label>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={saving || value.trim().length < minLength}
          >
            {saving ? "جارٍ الإرسال..." : submitLabel}
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
        throw new Error(payload.error ?? "تعذر حفظ القرار.");
      }
      onDone(
        `${kind === "transfer" ? "طلب النقل" : "طلب التعديل"} ${
          decision === "approve" ? "تمت الموافقة عليه" : "تم رفضه"
        } لـ ${merchantName}.`,
      );
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر حفظ القرار.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`مراجعة ${kind === "transfer" ? "طلب النقل" : "طلب التعديل"}`}
      eyebrow={merchantName}
      onClose={onClose}
    >
      <div className="request-quote">{requestText}</div>
      <label className="field">
        <span>ملاحظة القرار (اختياري)</span>
        <textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="سياق لسجل المراجعة."
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
          رفض
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={() => decide("approve")}
          disabled={saving}
        >
          {saving ? "جارٍ الحفظ..." : "موافقة"}
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
        throw new Error(payload.error ?? "تعذر تغيير الحالة.");
      }
      onDone(
        `انتقل ${merchantName} إلى ${CONTRACT_STATE_META[state].label}. تم تسجيل إدخال المراجعة.`,
      );
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر تغيير الحالة.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`تجاوز حالة العقد — ${merchantName}`}
      eyebrow="عمليات المدن"
      description="تُسجّل تجاوزات المدير مع المنفّذ والحالة السابقة وملاحظة إلزامية."
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <label className="field">
          <span>الحالة الجديدة</span>
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
          <span>ملاحظة المراجعة</span>
          <textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="لماذا هذا التجاوز مطلوب؟"
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
            إلغاء
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={saving}
          >
            {saving ? "جارٍ الحفظ..." : "تطبيق التجاوز"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
