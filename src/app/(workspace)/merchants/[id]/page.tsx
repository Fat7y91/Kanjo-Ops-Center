import { notFound } from "next/navigation";

import { MerchantProfileClient } from "@/components/field-ops/merchant-profile-client";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { effectiveCityIds } from "@/lib/city-scope-query";
import {
  getCityById,
  getMerchantById,
  listFollowUpTasks,
  listStateOverrides,
  listTasks,
  listVisitReports,
  merchantCrmSummary,
  merchantTimeline,
  visitCountFor,
} from "@/lib/field-ops/store";
import { teamLabel } from "@/lib/field-ops/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type MerchantPageProps = {
  params: Promise<{ id: string }>;
};

export default async function MerchantProfilePage({
  params,
}: MerchantPageProps) {
  const session = await requirePermission("view_merchants");
  const { id } = await params;
  const merchant = getMerchantById(id);
  // Merchant profiles follow the merchant directory's scope: any city the
  // viewer can operate in, not just cities they have the `view_active_cities`
  // dashboard permission for.
  if (!merchant || !effectiveCityIds(session).includes(merchant.cityId)) {
    notFound();
  }

  const city = getCityById(merchant.cityId);
  const permissions = session.permissions;

  return (
    <>
      <PageHeader
        eyebrow="كارت التاجر"
        title={merchant.name}
        description="السجل التجاري الموحّد: كل زيارة، كل رأي مندوب، بيانات التواصل الحالية، والتحليلات المجمّعة — بعيداً عن ضجيج المهام اليومية."
        actions={<span className="badge">{teamLabel(merchant.team)}</span>}
      />
      <MerchantProfileClient
        merchant={merchant}
        cityName={city?.name ?? "مدينة غير محددة"}
        reports={listVisitReports(merchant.id)}
        overrides={listStateOverrides(merchant.id)}
        tasks={listTasks().filter((task) => task.merchantId === merchant.id)}
        followUps={listFollowUpTasks(merchant.id)}
        timeline={merchantTimeline(merchant.id)}
        summary={merchantCrmSummary(merchant.id)}
        visitCount={visitCountFor(merchant.id)}
        viewerTeam={session.user.team}
        canEditMerchants={permissions.includes("view_merchant_profile")}
        canRequestTransfers={permissions.includes("request_ownership_transfer")}
        canManageState={permissions.includes("edit_contract")}
        canViewFieldOps={permissions.includes("view_all_teams_visits")}
        canViewFieldOpsPage={permissions.includes("view_all_teams_visits")}
        canStartVisit={permissions.includes("view_all_teams_visits")}
      />
    </>
  );
}
