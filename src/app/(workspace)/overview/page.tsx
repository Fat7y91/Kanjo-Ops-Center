import { ExecutiveDashboard } from "@/components/bi/executive-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { buildBiDataset } from "@/lib/bi/dataset";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function OverviewPage() {
  const session = await requirePermission("view_overview");
  const firstName = session.user.name.split(" ")[0];
  const dataset = await buildBiDataset();

  return (
    <>
      <PageHeader
        eyebrow="مركز القيادة التنفيذي"
        title={`لوحة القيادة، ${firstName}`}
        description="حالة الشبكة والتفاوض والمالية والتسويق في لقطة واحدة."
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
