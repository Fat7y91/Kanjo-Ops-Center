"use client";

import { PermissionMatrix } from "@/components/admin/permission-matrix";
import { useEndpointData } from "@/components/data/use-endpoint-data";
import { ErrorPanel } from "@/components/ui/error-panel";
import { TableSkeleton } from "@/components/ui/skeletons";
import { permissionMatrixPayloadSchema } from "@/lib/rbac/payload";

import type { PermissionMatrixPayload } from "@/lib/rbac/payload";

/** Module-level so the hook's dependency list stays stable. */
const parsePayload = (input: unknown): PermissionMatrixPayload =>
  permissionMatrixPayloadSchema.parse(input);

/**
 * Permission matrix island.
 *
 * The page shell authorizes and renders the header; this island loads the
 * manageable roster, the assignable ladder and the team catalogue from
 * `/api/admin/users`. Keeping the read here means the Worker only authorizes
 * the request instead of assembling every operator, grant and team row during
 * SSR.
 */
export function PermissionMatrixLoader() {
  const { status, data, error, reload } = useEndpointData(
    "/api/admin/users",
    parsePayload,
  );

  if (status === "loading") {
    return (
      <div aria-busy="true">
        <TableSkeleton rows={6} columns={4} />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <ErrorPanel
        error={error}
        reset={reload}
        title="تعذر تحميل المستخدمين"
        description="لم تكتمل قراءة قائمة المشغّلين القابلين للإدارة. أعد المحاولة دون مغادرة الصفحة."
      />
    );
  }

  return (
    <PermissionMatrix
      initialUsers={data.users}
      initialRevision={data.revision}
      viewerId={data.viewerId}
      viewerLevel={data.viewer.clearanceLevel}
      viewerGlobalScope={data.viewer.globalScope}
      assignableLevels={data.assignableLevels}
      assignableCities={data.assignableCities}
      teams={data.teams}
    />
  );
}
