import { OverviewDashboard } from "@/components/bi/overview-dashboard";
import { ClientErrorBoundary } from "@/components/errors/client-error-boundary";
import { PageHeader } from "@/components/ui/page-header";
import { requireModuleAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Command center shell.
 *
 * The render resolves the session and nothing else: the dataset is fetched by
 * the island from `/api/bi/overview`, so what this route returns is the same
 * shell for every operator — cheap to render, and the expensive join no longer
 * has to finish before the first byte goes out.
 */
export default async function OverviewPage() {
  // Derived from the navigation catalogue so the page and the sidebar share
  // one access rule; each section then unmounts itself when its own capability
  // is missing.
  const session = await requireModuleAccess("/overview");
  const firstName = session.user.name.split(" ")[0];

  return (
    <ClientErrorBoundary
      title="تعذر عرض لوحة القيادة"
      description="لم تكتمل قراءة بيانات الشبكة والمالية والتسويق. أعد المحاولة دون مغادرة الصفحة."
      connectionTitle="انقطع الاتصال أثناء تحميل لوحة القيادة"
    >
      <OverviewDashboard
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

