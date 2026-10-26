import { notFound } from "next/navigation";

import { MerchantProfileClient } from "@/components/field-ops/merchant-profile-client";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { canAccessCity } from "@/lib/city-scope-query";
import {
  getCityById,
  getMerchantById,
  listStateOverrides,
  listTasks,
  listVisitReports,
} from "@/lib/field-ops/store";
import { teamLabel } from "@/lib/field-ops/types";

export const dynamic = "force-dynamic";

type MerchantPageProps = {
  params: Promise<{ id: string }>;
};

export default async function MerchantProfilePage({
  params,
}: MerchantPageProps) {
  const session = await requirePermission("view_merchants");
  const { id } = await params;
  const merchant = getMerchantById(id);
  if (!merchant || !canAccessCity(session, merchant.cityId)) {
    notFound();
  }

  const city = getCityById(merchant.cityId);
  const permissions = session.permissions;

  return (
    <>
      <PageHeader
        eyebrow="ملف التاجر"
        title={merchant.name}
        description="السجل التجاري وحوكمة الحالات المقفلة والمستندات وسجل المراجعة لهذا التاجر."
        actions={<span className="badge">{teamLabel(merchant.team)}</span>}
      />
      <MerchantProfileClient
        merchant={merchant}
        cityName={city?.name ?? "مدينة غير محددة"}
        reports={listVisitReports(merchant.id)}
        overrides={listStateOverrides(merchant.id)}
        tasks={listTasks().filter((task) => task.merchantId === merchant.id)}
        viewerTeam={session.user.team}
        canEditMerchants={permissions.includes("edit_merchants")}
        canRequestTransfers={permissions.includes("request_transfers")}
        canManageState={permissions.includes("manage_merchant_state")}
        canViewFieldOps={permissions.includes("view_field_ops")}
        canViewFieldOpsPage={permissions.includes("view_field_ops")}
      />
    </>
  );
}
