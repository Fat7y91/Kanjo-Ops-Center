"use client";

import { useEndpointData } from "@/components/data/use-endpoint-data";
import { FieldOpsClient } from "@/components/field-ops/field-ops-client";
import { ErrorPanel } from "@/components/ui/error-panel";
import { PageHeader } from "@/components/ui/page-header";
import { BoardSkeleton, StatGridSkeleton } from "@/components/ui/skeletons";
import { boardPayloadSchema, type BoardPayload } from "@/lib/field-ops/payload";

/** Module-level so the hook's dependency list stays stable. */
const parseBoard = (input: unknown): BoardPayload => boardPayloadSchema.parse(input);

/**
 * Capabilities the board renders controls from.
 *
 * Passed in already resolved: the session is a server fact, and an island that
 * recomputed capability checks from a client copy of the permission list would
 * be a second implementation of the authorization rule.
 */
export type FieldOpsFlags = {
  canManageTasks: boolean;
  canRequestTransfers: boolean;
  canApproveTransfers: boolean;
  canApproveEdits: boolean;
  canManageState: boolean;
  canViewMerchants: boolean;
  canAssignTasks: boolean;
};

/**
 * Field operations island.
 *
 * The board is the heaviest read in the workspace — today's tasks, city and
 * merchant rolls, transfer and edit queues, visit reports — so it no longer runs
 * during the shell render. The header and the operator's own team paint first,
 * then `/api/field-ops/board` fills the columns.
 */
export function FieldOpsBoardIsland({
  viewerTeam,
  flags,
}: {
  viewerTeam: string;
  flags: FieldOpsFlags;
}) {
  const { status, data, error, reload } = useEndpointData(
    "/api/field-ops/board",
    parseBoard,
  );

  return (
    <>
      <PageHeader
        eyebrow="العمليات الميدانية"
        title="لوحة التنفيذ"
        description="زيارات اليوم والملكية ومسار الاعتماد. كل عنصر تحكم مستمد من صلاحية، وليس من مسمى وظيفي."
      />

      {status === "loading" ? (
        <div aria-busy="true">
          <StatGridSkeleton count={3} />
          <BoardSkeleton columns={3} />
        </div>
      ) : null}

      {status === "failed" ? (
        <ErrorPanel
          error={error}
          reset={reload}
          title="تعذر تحميل لوحة التنفيذ"
          description="لم يكتمل تجهيز مهام اليوم وحالات التجار. أعد المحاولة دون مغادرة الصفحة."
        />
      ) : null}

      {status === "ready" ? (
        <FieldOpsClient
          initialBoard={data.board}
          viewerTeam={viewerTeam}
          {...flags}
        />
      ) : null}
    </>
  );
}
