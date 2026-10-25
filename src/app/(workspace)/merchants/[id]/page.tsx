import { notFound } from "next/navigation";

import { MerchantProfileClient } from "@/components/field-ops/merchant-profile-client";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import {
  getCityById,
  getMerchantById,
  listStateOverrides,
  listTasks,
  listVisitReports,
} from "@/lib/field-ops/store";

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
  if (!merchant) notFound();

  const city = getCityById(merchant.cityId);
  const permissions = session.permissions;

  return (
    <>
      <PageHeader
        eyebrow="Merchant profile"
        title={merchant.name}
        description="Commercial history, locked-state governance, documents, and the audit trail for this merchant."
        actions={
          <span className="badge">{merchant.team}</span>
        }
      />
      <MerchantProfileClient
        merchant={merchant}
        cityName={city?.name ?? "Unassigned city"}
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
