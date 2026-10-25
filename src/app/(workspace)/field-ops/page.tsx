import { FieldOpsClient } from "@/components/field-ops/field-ops-client";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { buildBoard } from "@/lib/field-ops/board";

export const dynamic = "force-dynamic";

export default async function FieldOpsPage() {
  const session = await requirePermission("view_field_ops");
  const board = buildBoard(session);
  const permissions = session.permissions;

  return (
    <>
      <PageHeader
        eyebrow="Field operations"
        title="Execution board"
        description="Today's visits, ownership, and approval flow. Every control resolves from a capability, never from a job title."
      />
      <FieldOpsClient
        initialBoard={board}
        viewerTeam={session.user.team}
        canManageTasks={permissions.includes("manage_tasks")}
        canRequestTransfers={permissions.includes("request_transfers")}
        canApproveTransfers={permissions.includes("approve_transfers")}
        canApproveEdits={permissions.includes("approve_edit_requests")}
        canManageState={permissions.includes("manage_merchant_state")}
        canViewMerchants={permissions.includes("view_merchants")}
      />
    </>
  );
}
