"use client";

import { useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/form-inputs";
import {
  ORDER_DELETE_BLOCKED_HINT,
  type ContractGovernanceAction,
} from "@/lib/contracts/governance";
import type { Contract } from "@/lib/contracts/types";

type GovernanceDialogProps = {
  contract: Contract;
  action: ContractGovernanceAction;
  orderCount: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    action: ContractGovernanceAction;
    commissionRate?: number;
    note?: string;
  }) => void;
};

const TITLES: Record<ContractGovernanceAction, string> = {
  amend: "تعديل نسبة العمولة",
  reopen: "إعادة فتح العقد",
  terminate: "إنهاء العقد",
  delete: "حذف العقد نهائياً",
};

const CONFIRM_LABELS: Record<ContractGovernanceAction, string> = {
  amend: "حفظ النسبة",
  reopen: "إعادة الفتح",
  terminate: "تأكيد الإنهاء",
  delete: "تأكيد الحذف",
};

/**
 * Confirmation surface for a terminal-contract governance action.
 *
 * Amend collects the new headline rate; the other actions only take an optional
 * note. The dialog is mounted per selection (the view keys it), so the rate
 * starts at the contract's current value every time.
 */
export function ContractGovernanceDialog({
  contract,
  action,
  orderCount,
  busy,
  onClose,
  onSubmit,
}: GovernanceDialogProps) {
  const [rate, setRate] = useState(
    contract.commissionRate != null ? String(contract.commissionRate) : "",
  );
  const [note, setNote] = useState("");

  const isAmend = action === "amend";
  const deleteBlocked = action === "delete" && orderCount > 0;
  const parsedRate = Number(rate);
  const rateValid =
    rate.trim() !== "" &&
    Number.isFinite(parsedRate) &&
    parsedRate >= 0 &&
    parsedRate <= 100;

  function submit() {
    if (busy || deleteBlocked) return;
    if (isAmend) {
      if (!rateValid) return;
      onSubmit({
        action,
        commissionRate: parsedRate,
        note: note.trim() || undefined,
      });
      return;
    }
    onSubmit({ action, note: note.trim() || undefined });
  }

  return (
    <Modal
      open
      eyebrow="الحوكمة التجارية"
      title={TITLES[action]}
      description={`${contract.reference} — ${contract.merchantName || contract.merchantId}`}
      onClose={onClose}
      wide
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {isAmend ? (
          <TextField
            label="نسبة العمولة الجديدة (%)"
            type="number"
            min={0}
            max={100}
            step="0.01"
            inputMode="decimal"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            hint="تُطبّق على رأس العقد والبند الخامس والملحق، وتُزامن مع ملف التاجر."
            required
          />
        ) : null}

        {action === "terminate" ? (
          <p className="panel-note">
            سيُغلق العقد نهائياً وتعود حالة التاجر إلى «بدون اتفاق»، مع بقاء
            القيود المحاسبية المرحّلة كما هي.
          </p>
        ) : null}

        {action === "reopen" ? (
          <p className="panel-note">
            سيعود العقد إلى حالة المسودة للمراجعة، وتعود حالة التاجر إلى «اتفاق
            نهائي».
          </p>
        ) : null}

        {action === "delete" ? (
          <p className="form-error" role="alert">
            {deleteBlocked
              ? ORDER_DELETE_BLOCKED_HINT
              : "سيُحذف سجل العقد نهائياً مع بنوده. لا يمكن التراجع عن هذا الإجراء."}
          </p>
        ) : null}

        {!isAmend ? (
          <TextAreaField
            label="ملاحظة (اختياري)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            hint="تُسجّل في سجل التدقيق مع الإجراء."
          />
        ) : null}

        <div className="row-actions justify-end">
          <Button type="button" variant="quiet" size="sm" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            type="submit"
            size="sm"
            variant={action === "amend" ? "primary" : "danger"}
            disabled={
              busy || deleteBlocked || (isAmend && !rateValid)
            }
          >
            {busy ? "جارٍ التنفيذ…" : CONFIRM_LABELS[action]}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
