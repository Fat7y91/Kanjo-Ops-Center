import { CitiesClient } from "@/components/field-ops/cities-client";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { listCities } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";

export default async function CitiesPage() {
  const session = await requirePermission("manage_cities");

  return (
    <>
      <PageHeader
        eyebrow="التوسع الجغرافي"
        title="المدن والنطاقات التشغيلية"
        description="حدّد أين تعمل كانجو، والتقط ذكاء السوق، وارسم النطاقات الجغرافية التي تغطيها الفرق الميدانية فعلياً."
        actions={
          <span className="badge badge-purple">إدارة المدن مُفعّلة</span>
        }
      />
      <CitiesClient
        initialCities={listCities()}
        canManage={session.permissions.includes("manage_cities")}
        viewerName={session.user.name}
      />
    </>
  );
}
