import { notFound } from "next/navigation";

import { CityDetailsClient } from "@/components/field-ops/city-details-client";
import { PageHeader } from "@/components/ui/page-header";
import { canAccessCity } from "@/lib/city-scope-query";
import { requirePermission } from "@/lib/auth/guard";
import {
  getCityById,
  listAssignableManagers,
  listCityManagers,
} from "@/lib/field-ops/store";
import {
  filterGovernableUsers,
  toClearanceActor,
} from "@/lib/rbac/hierarchy";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type CityDetailsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CityDetailsPage({
  params,
}: CityDetailsPageProps) {
  const session = await requirePermission("view_cities");
  const { id } = await params;
  const city = getCityById(id);
  if (!city || !canAccessCity(session, city.id)) notFound();

  const actor = toClearanceActor(session);

  return (
    <>
      <PageHeader
        eyebrow="تفاصيل المدينة"
        title={city.name}
        description="إدارة فريق التشغيل، نطاق الوصول، وذكاء السوق لهذه المدينة."
      />
      <CityDetailsClient
        city={city}
        managers={await listCityManagers(city.id)}
        assignable={filterGovernableUsers(actor, await listAssignableManagers())}
        canEdit={session.permissions.includes("update_city_zone")}
      />
    </>
  );
}
