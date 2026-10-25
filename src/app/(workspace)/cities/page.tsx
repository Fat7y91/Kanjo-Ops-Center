import { CitiesClient } from "@/components/field-ops/cities-client";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { listCities } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";

export default async function CitiesPage() {
  const session = await requirePermission("view_cities");
  const canManage =
    session.permissions.includes("create_city") ||
    session.permissions.includes("update_city_zone");

  return (
    <>
      <PageHeader
        eyebrow="التوسع الجغرافي"
        title="المدن والنطاقات التشغيلية"
        description="حدّد أين تعمل كانجو، والتقط ذكاء السوق، وارسم النطاقات الجغرافية التي تغطيها الفرق الميدانية فعلياً."
        actions={
          <span className="badge badge-purple">
            {canManage
              ? "إدارة المدن مُفعّلة"
              : "عرض المدن والتحليلات"}
          </span>
        }
      />
      <CitiesClient
        initialCities={listCities()}
        viewerName={session.user.name}
      />
    </>
  );
}
