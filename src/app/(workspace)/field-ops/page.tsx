import { ClientErrorBoundary } from "@/components/errors/client-error-boundary";
import { FieldOpsBoardIsland } from "@/components/field-ops/field-ops-board-island";
import { requireModuleAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Field operations shell.
 *
 * Building the board is the most expensive read in the workspace — six
 * collections, a city and merchant roll and the visit-report scan behind them —
 * so it no longer completes before the route can answer. The session still
 * decides which controls exist, and that is all this render needs.
 */
export default async function FieldOpsPage() {
  const session = await requireModuleAccess("/field-ops");
  const permissions = session.permissions;

  return (
    <ClientErrorBoundary
      title="تعذر عرض لوحة التنفيذ"
      description="لم يكتمل تجهيز مهام اليوم وحالات التجار. أعد المحاولة دون مغادرة الصفحة."
      connectionTitle="انقطع الاتصال أثناء تحميل لوحة التنفيذ"
    >
      <FieldOpsBoardIsland
        viewerTeam={session.user.team}
        flags={{
          canManageTasks: permissions.includes("assign_tasks"),
          canRequestTransfers: permissions.includes(
            "request_ownership_transfer",
          ),
          canApproveTransfers: permissions.includes(
            "approve_ownership_transfer",
          ),
          canApproveEdits: permissions.includes("approve_report_edits"),
          canManageState: permissions.includes("edit_contract"),
          canViewMerchants: permissions.includes("view_merchants"),
          canAssignTasks: permissions.includes("assign_tasks"),
        }}
      />
    </ClientErrorBoundary>
  );
}

