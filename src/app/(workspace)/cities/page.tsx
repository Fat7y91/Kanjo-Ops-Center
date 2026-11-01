import { CitiesClient } from "@/components/field-ops/cities-client";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { scopedCities } from "@/lib/city-scope-query";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function CitiesPage() {
  const session = await requirePermission("view_active_cities");
  const canManage =
    session.permissions.includes("add_city") ||
    session.permissions.includes("manage_cities");

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
        initialCities={scopedCities(session)}
        viewerName={session.user.name}
      />
    </>
  );
}
