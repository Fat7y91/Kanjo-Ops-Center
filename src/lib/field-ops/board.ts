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

import { loadMerchantStates } from "./state-source";

export type FieldOpsBoard = {
  today: string;
  tasks: ReturnType<typeof tasksForViewer>;
  cities: ReturnType<typeof listCities>;
  merchants: Awaited<ReturnType<typeof listMerchants>>;
  transferRequests: ReturnType<typeof listTransferRequests>;
  editRequests: ReturnType<typeof listEditRequests>;
  reports: Awaited<ReturnType<typeof listVisitReports>>;
};

export async function buildBoard(
  session: ActiveSession,
): Promise<FieldOpsBoard> {
  const canManageTasks = session.permissions.includes("assign_tasks");
  const canApproveTransfers =
    session.permissions.includes("approve_ownership_transfer");
  const canApproveEdits =
    session.permissions.includes("approve_report_edits");

  const transferRequests = listTransferRequests().filter(
    (request) =>
      canApproveTransfers || request.requestedBy === session.user.id,
  );
  const editRequests = listEditRequests().filter(
    (request) => canApproveEdits || request.requestedBy === session.user.id,
  );
  const reports = (await listVisitReports()).filter(
    (report) => canManageTasks || report.team === session.user.team,
  );

  const canSeeAllCities =
    session.globalScope || session.clearanceLevel >= 4;
  const scopedCityIds = canSeeAllCities
    ? new Set(listCities().map((city) => city.id))
    : new Set(session.accessibleCities);
  const cities = listCities().filter((city) => scopedCityIds.has(city.id));
  const scopedMerchants = (await listMerchants()).filter((merchant) =>
    scopedCityIds.has(merchant.cityId),
  );
  // The board hands merchants to the client, which renders the state badge from
  // the row. Resolving here keeps that badge identical to the directory and the
  // profile without a second client-side pass over the visit history.
  const states = await loadMerchantStates(scopedMerchants);
  const merchants = scopedMerchants.map((merchant) => ({
    ...merchant,
    contractState: states.get(merchant.id)?.state ?? merchant.contractState,
  }));

  return {
    today: today(),
    tasks: tasksForViewer({
      team: session.user.team,
      canManageTasks,
      date: today(),
    }).filter((task) => scopedCityIds.has(task.cityId)),
    cities,
    merchants,
    transferRequests,
    editRequests: editRequests.filter((request) => {
      const merchant = merchants.find(
        (candidate) => candidate.id === request.merchantId,
      );
      return Boolean(merchant);
    }),
    reports,
  };
}
