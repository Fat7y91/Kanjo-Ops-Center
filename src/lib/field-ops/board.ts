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
  tasks: Awaited<ReturnType<typeof tasksForViewer>>;
  cities: Awaited<ReturnType<typeof listCities>>;
  merchants: Awaited<ReturnType<typeof listMerchants>>;
  transferRequests: Awaited<ReturnType<typeof listTransferRequests>>;
  editRequests: Awaited<ReturnType<typeof listEditRequests>>;
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

  const [allTransfers, allEdits, allReports, allCities] = await Promise.all([
    listTransferRequests(),
    listEditRequests(),
    listVisitReports(),
    listCities(),
  ]);

  const transferRequests = allTransfers.filter(
    (request) =>
      canApproveTransfers || request.requestedBy === session.user.id,
  );
  const editRequests = allEdits.filter(
    (request) => canApproveEdits || request.requestedBy === session.user.id,
  );
  const reports = allReports.filter(
    (report) => canManageTasks || report.team === session.user.team,
  );

  const canSeeAllCities =
    session.globalScope || session.clearanceLevel >= 4;
  const scopedCityIds = canSeeAllCities
    ? new Set(allCities.map((city) => city.id))
    : new Set(session.accessibleCities);
  const cities = allCities.filter((city) => scopedCityIds.has(city.id));
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
    tasks: (
      await tasksForViewer({
        team: session.user.team,
        canManageTasks,
        date: today(),
      })
    ).filter((task) => scopedCityIds.has(task.cityId)),
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
