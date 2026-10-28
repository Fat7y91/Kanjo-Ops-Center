import { ExecutiveDashboard } from "@/components/bi/executive-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { buildBiDataset } from "@/lib/bi/dataset";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const session = await requirePermission("view_overview");
  const firstName = session.user.name.split(" ")[0];
  const dataset = buildBiDataset();

  return (
    <>
      <PageHeader
        eyebrow="مركز القيادة التنفيذي"
        title={`لوحة القيادة، ${firstName}`}
        description="كل مؤشر أدناه قابل للنقر: افتح أي بطاقة للوصول إلى السجلات التي بُنيت عليها الأرقام وتصديرها. الفلاتر الموحدة تحكم كل الأقسام معاً."
        actions={
          <span className="badge badge-gold">
            مستوى التصريح {session.clearanceLevel}
          </span>
        }
      />

      <ExecutiveDashboard dataset={dataset} />
    </>
  );
}
