"use client";

import { ClientErrorBoundary } from "@/components/errors/client-error-boundary";
import { ContractsView } from "@/components/contracts/contracts-view";
import { useEndpointData } from "@/components/data/use-endpoint-data";
import { ErrorPanel } from "@/components/ui/error-panel";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeletons";
import { usePermission } from "@/components/auth/use-permission";
import {
  contractsPayloadSchema,
  type ContractsPayload,
} from "@/lib/contracts/payload";

const parseContracts = (input: unknown): ContractsPayload =>
  contractsPayloadSchema.parse(input);

/**
 * Contract register island.
 *
 * The page resolves the session; rows, merchants and cities arrive from
 * `/api/contracts` already scoped to the viewer's cities. Each action re-reads
 * the register after a successful write, so the table always reflects the
 * database rather than the request payload.
 */
export function ContractsIsland() {
  const { status, data, error, reload } = useEndpointData(
    "/api/contracts",
    parseContracts,
  );
  const { hasPermission, hasAny } = usePermission();

  const canDraft = hasAny(["draft_contract", "create_contracts"]);
  const canEdit = hasAny(["edit_contract", "edit_contracts"]);
  const canSign = hasAny(["sign_contract", "sign_contracts"]);
  const canCancel = hasAny(["cancel_contract", "delete_contracts"]);
  const canForceEdit = hasPermission("edit_finalized_contracts");

  if (status === "loading") {
    return (
      <>
        <PageHeader
          eyebrow="الحوكمة التجارية"
          title="سجل العقود"
          description="جارٍ تحميل سجل العقود."
        />
        <TableSkeleton rows={6} columns={6} />
      </>
    );
  }

  if (status === "failed") {
    return (
      <ErrorPanel
        error={error}
        reset={reload}
        title="تعذر تحميل سجل العقود"
        description="لم تكتمل قراءة العقود. أعد المحاولة دون مغادرة الصفحة."
      />
    );
  }

  return (
    <ClientErrorBoundary
      title="تعذر عرض سجل العقود"
      description="لم تكتمل قراءة العقود. أعد المحاولة دون مغادرة الصفحة."
    >
      <ContractsView
        data={data}
        canDraft={canDraft}
        canEdit={canEdit}
        canSign={canSign}
        canCancel={canCancel}
        canForceEdit={canForceEdit}
        onReload={reload}
      />
    </ClientErrorBoundary>
  );
}
