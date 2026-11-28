"use client";

import { useState } from "react";

import { ContractForm } from "@/components/contracts/contract-form";
import { ContractGovernanceDialog } from "@/components/contracts/contract-governance-dialog";
import { ContractsToolbar } from "@/components/contracts/contract-toolbar";
import { ContractTable } from "@/components/contracts/contract-table";
import { useContractFilters } from "@/components/contracts/use-contract-filters";
import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { count } from "@/lib/bi/format";
import type { ContractGovernanceAction } from "@/lib/contracts/governance";
import type { ContractsPayload } from "@/lib/contracts/payload";
import type { Contract } from "@/lib/contracts/types";

type ContractsViewProps = {
  data: ContractsPayload;
  canDraft: boolean;
  canEdit: boolean;
  canSign: boolean;
  canCancel: boolean;
  canForceEdit: boolean;
  canManageSigned: boolean;
  canDelete: boolean;
  onReload: () => void;
};

type Dialog =
  | { kind: "closed" }
  | { kind: "draft" }
  | { kind: "edit"; contract: Contract };

type GovernanceTarget = {
  contract: Contract;
  action: ContractGovernanceAction;
};

const GOVERNANCE_NOTICE: Record<ContractGovernanceAction, string> = {
  amend: "تم تعديل نسبة العمولة ومزامنة ملف التاجر.",
  reopen: "تمت إعادة فتح العقد.",
  terminate: "تم إنهاء العقد.",
  delete: "تم حذف العقد نهائياً.",
};

/**
 * Contract register UI.
 *
 * Every mutation the page exposes is wired to `PATCH/POST /api/contracts`, and
 * the capability that guards each button is the same key the server checks.
 * There is no optimistic row: the response is the stored contract, so the table
 * can never show a state the database rejected.
 */
export function ContractsView({
  data,
  canDraft,
  canEdit,
  canSign,
  canCancel,
  canForceEdit,
  canManageSigned,
  canDelete,
  onReload,
}: ContractsViewProps) {
  const [dialog, setDialog] = useState<Dialog>({ kind: "closed" });
  const [governance, setGovernance] = useState<GovernanceTarget | null>(null);
  const [governanceBusy, setGovernanceBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const filters = useContractFilters(data.contracts, data.cities);

  function done(message: string) {
    setNotice(message);
    setError("");
    setDialog({ kind: "closed" });
    onReload();
  }

  async function act(contract: Contract, action: "send" | "sign" | "cancel") {
    setBusyId(contract.id);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "تعذر تنفيذ الإجراء.");
      done(
        action === "sign"
          ? "تم توقيع العقد وتحديث حالة التاجر."
          : action === "cancel"
            ? "تم إلغاء العقد."
            : "تم إرسال العقد للتوقيع.",
      );
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "تعذر تنفيذ الإجراء.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function runGovernance(input: {
    action: ContractGovernanceAction;
    commissionRate?: number;
    note?: string;
  }) {
    if (!governance) return;
    setGovernanceBusy(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(
        `/api/contracts/${governance.contract.id}/governance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر تنفيذ الإجراء.");
      }
      setGovernance(null);
      setNotice(GOVERNANCE_NOTICE[input.action]);
      onReload();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "تعذر تنفيذ الإجراء.",
      );
    } finally {
      setGovernanceBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="الحوكمة التجارية"
        title="سجل العقود"
        description="الصياغة والتعديل والتوقيع المعتمد صلاحيات منفصلة. لا تُستنتج صلاحية التوقيع من المسمى الوظيفي أبداً."
        actions={
          <div className="row-actions">
            <span className="badge badge-gold">
              {count(data.contracts.length)} عقد
            </span>
            {canDraft ? (
              <Button size="sm" onClick={() => setDialog({ kind: "draft" })}>
                صياغة عقد
              </Button>
            ) : null}
          </div>
        }
      />

      {notice ? (
        <p className="accounts-notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <ContractsToolbar
        query={filters.query}
        onQueryChange={filters.setQuery}
        cityId={filters.cityId}
        onCityChange={filters.setCityId}
        cities={data.cities}
        shown={filters.filtered.length}
        total={filters.total}
      />

      <ContractTable
        contracts={filters.filtered}
        cityNameById={filters.cityNameById}
        busyId={busyId}
        canEdit={canEdit}
        canSend={canDraft || canEdit}
        canSign={canSign}
        canCancel={canCancel}
        canForceEdit={canForceEdit}
        canManageSigned={canManageSigned}
        canDelete={canDelete}
        orderCounts={data.orderCounts}
        onEdit={(contract) => setDialog({ kind: "edit", contract })}
        onAction={(contract, action) => void act(contract, action)}
        onGovernance={(contract, action) =>
          setGovernance({ contract, action })
        }
      />

      {governance ? (
        <ContractGovernanceDialog
          key={`${governance.contract.id}-${governance.action}`}
          contract={governance.contract}
          action={governance.action}
          orderCount={data.orderCounts[governance.contract.id] ?? 0}
          busy={governanceBusy}
          onClose={() => setGovernance(null)}
          onSubmit={(input) => void runGovernance(input)}
        />
      ) : null}

      <Modal
        open={dialog.kind !== "closed"}
        eyebrow="سجل العقود"
        title={dialog.kind === "edit" ? "تعديل العقد" : "صياغة عقد"}
        description={
          dialog.kind === "edit"
            ? `تعديل ${dialog.contract.reference}`
            : "اختر التاجر وأدخل قيمة العقد."
        }
        onClose={() => setDialog({ kind: "closed" })}
        wide
      >
        <ContractForm
          contract={dialog.kind === "edit" ? dialog.contract : undefined}
          merchants={data.merchants}
          onDone={done}
        />
      </Modal>
    </>
  );
}
