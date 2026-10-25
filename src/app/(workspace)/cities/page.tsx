import { CitiesClient } from "@/components/field-ops/cities-client";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { listCities } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";

export default async function CitiesPage() {
  const session = await requirePermission("view_cities");
  const canManage = session.permissions.includes("manage_cities");

  return (
    <>
      <PageHeader
        eyebrow="Market expansion"
        title="Cities and operational zoning"
        description="Define where Kanjo operates, capture competitive intelligence, and draw the geographic zones that field teams actually cover."
        actions={
          canManage ? (
            <span className="badge badge-purple">City management enabled</span>
          ) : null
        }
      />
      <CitiesClient
        initialCities={listCities()}
        canManage={canManage}
        viewerName={session.user.name}
      />
    </>
  );
}
