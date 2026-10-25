import {
  listCities,
  listEditRequests,
  listMerchants,
  listTransferRequests,
  listVisitReports,
  tasksForViewer,
  today,
} from "@/lib/field-ops/store";
import type { ActiveSession } from "@/lib/rbac/types";

export type FieldOpsBoard = {
  today: string;
  tasks: ReturnType<typeof tasksForViewer>;
  cities: ReturnType<typeof listCities>;
  merchants: ReturnType<typeof listMerchants>;
  transferRequests: ReturnType<typeof listTransferRequests>;
  editRequests: ReturnType<typeof listEditRequests>;
  reports: ReturnType<typeof listVisitReports>;
};

export function buildBoard(session: ActiveSession): FieldOpsBoard {
  const canManageTasks = session.permissions.includes("manage_tasks");
  const canApproveTransfers =
    session.permissions.includes("approve_transfers");
  const canApproveEdits =
    session.permissions.includes("approve_edit_requests");

  const transferRequests = listTransferRequests().filter(
    (request) =>
      canApproveTransfers || request.requestedBy === session.user.id,
  );
  const editRequests = listEditRequests().filter(
    (request) => canApproveEdits || request.requestedBy === session.user.id,
  );
  const reports = listVisitReports().filter(
    (report) => canManageTasks || report.team === session.user.team,
  );

  return {
    today: today(),
    tasks: tasksForViewer({
      team: session.user.team,
      canManageTasks,
      date: today(),
    }),
    cities: listCities(),
    merchants: listMerchants(),
    transferRequests,
    editRequests,
    reports,
  };
}
