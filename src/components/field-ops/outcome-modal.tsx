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
        throw new Error(payload.error ?? "تعذر حفظ تقرير الزيارة.");
      }
      onDone(`تم حفظ تقرير الزيارة لـ ${target.name}.`);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر حفظ تقرير الزيارة.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`تسجيل نتيجة الزيارة — ${merchant.name}`}
      eyebrow={task ? `مجدولة في ${task.visitDate}` : "تقرير ميداني"}
      description="النتائج تحرك دورة حياة التاجر. الحالات المقفلة تتطلب اعتماد المدير قبل التغيير."
      onClose={onClose}
    >
      {locked ? (
        <div className="lock-panel">
          <span className="badge badge-red">
            {signedLocked ? "العقد الموقّع مقفل" : "الاتفاق النهائي مقفل"}
          </span>
          <p>
            {signedLocked
              ? "العقود الموقّعة مقفلة تماماً. فقط حامل صلاحية إدارة حالات التجار يمكنه تغيير هذا السجل."
              : "هذا الاتفاق النهائي مقفل للمندوبين. أرسل طلب تعديل مع السبب لاعتماد المدير."}
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
              طلب اعتماد التعديل
            </button>
          ) : null}
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <div className="field">
            <span>النتيجة</span>
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
            <span>ملاحظات الزيارة</span>
            <textarea
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="ماذا لاحظت؟ بمن قابلت؟ ما هي الخطوة التالية المتفق عليها؟"
              minLength={10}
              required
            />
            <span className="field-hint">
              10 أحرف على الأقل. تُحفظ الملاحظات مع سجل التقارير غير القابل
              للتغيير.
            </span>
          </label>

          {merchant.editUnlocked ? (
            <p className="inline-note">
              يوجد تعديل معتمد ساري لهذا التاجر. الحفظ سيعيد قفل السجل.
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
              إلغاء
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={saving}
            >
              {saving ? "جارٍ الحفظ..." : "حفظ النتيجة"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
