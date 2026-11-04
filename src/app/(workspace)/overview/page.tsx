import { ExecutiveDashboard } from "@/components/bi/executive-dashboard";
import { ClientErrorBoundary } from "@/components/errors/client-error-boundary";
import { PageHeader } from "@/components/ui/page-header";
import { requireModuleAccess } from "@/lib/auth/guard";
import { buildBiDataset } from "@/lib/bi/dataset";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function OverviewPage() {
  // Derived from the navigation catalogue so the page and the sidebar share
  // one access rule; each section then unmounts itself when its own capability
  // is missing.
  const session = await requireModuleAccess("/overview");
  const firstName = session.user.name.split(" ")[0];
  const dataset = await buildBiDataset();

  return (
    <ClientErrorBoundary
      title="تعذر عرض لوحة القيادة"
      description="لم تكتمل قراءة بيانات الشبكة والمالية والتسويق. أعد المحاولة دون مغادرة الصفحة."
      connectionTitle="انقطع الاتصال أثناء تحميل لوحة القيادة"
    >
      <ExecutiveDashboard
        dataset={dataset}
        header={
          <PageHeader
            eyebrow="مركز القيادة التنفيذي"
            title={`لوحة القيادة، ${firstName}`}
            description="حالة الشبكة والتفاوض والمالية والتسويق في لقطة واحدة."
          />
        }
      />
    </ClientErrorBoundary>
  );
}
