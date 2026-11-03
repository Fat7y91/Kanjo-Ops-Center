import { FieldOpsClient } from "@/components/field-ops/field-ops-client";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { buildBoard } from "@/lib/field-ops/board";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function FieldOpsPage() {
  const session = await requirePermission("view_all_teams_visits");
  const board = await buildBoard(session);
  const permissions = session.permissions;

  return (
    <>
      <PageHeader
        eyebrow="العمليات الميدانية"
        title="لوحة التنفيذ"
        description="زيارات اليوم والملكية ومسار الاعتماد. كل عنصر تحكم مستمد من صلاحية، وليس من مسمى وظيفي."
      />
      <FieldOpsClient
        initialBoard={board}
        viewerTeam={session.user.team}
        canManageTasks={permissions.includes("assign_tasks")}
        canRequestTransfers={permissions.includes("request_ownership_transfer")}
        canApproveTransfers={permissions.includes("approve_ownership_transfer")}
        canApproveEdits={permissions.includes("approve_report_edits")}
        canManageState={permissions.includes("edit_contract")}
        canViewMerchants={permissions.includes("view_merchants")}
        canAssignTasks={permissions.includes("assign_tasks")}
      />
    </>
  );
}
