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
} from "@/lib/field-ops/store";
import { getMerchantV1Profile } from "@/lib/field-ops/merchant-profile-repository";
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
  const reports = await listVisitReports(merchant.id);
  const v1Profile = await getMerchantV1Profile(merchant.id);

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
        reports={reports}
        v1Profile={v1Profile}
        overrides={listStateOverrides(merchant.id)}
        tasks={listTasks().filter((task) => task.merchantId === merchant.id)}
        followUps={listFollowUpTasks(merchant.id)}
        timeline={await merchantTimeline(merchant.id, reports)}
        summary={await merchantCrmSummary(merchant.id, reports)}
        visitCount={reports.length}
        viewerTeam={session.user.team}
        canEditMerchants={permissions.includes("view_merchant_profile")}
        canRequestTransfers={permissions.includes("request_ownership_transfer")}
        canManageState={permissions.includes("edit_contract")}
        canViewFieldOps={permissions.includes("view_all_teams_visits")}
        canViewFieldOpsPage={permissions.includes("view_all_teams_visits")}
        canStartVisit={permissions.includes("view_all_teams_visits")}
        canEditMerchantSocials={permissions.includes("edit_merchant_socials")}
        canToggleAppPublish={permissions.includes("toggle_app_publish")}
        canManageVipMenu={permissions.includes("manage_vip_menu")}
        canExportMerchantData={permissions.includes("export_merchant_data")}
      />
    </>
  );
}
