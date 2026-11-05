import { PageHeader } from "@/components/ui/page-header";
import { requireModuleAccess } from "@/lib/auth/guard";
import { listArchivedReports } from "@/lib/archived-reports/repository";
import { ArchivedReportsView } from "./components/archived-reports-view";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Archived visit reports.
 *
 * A report leaves the live timeline into this archive with its reason and
 * author preserved. Restoring removes the archive row only; the canonical
 * `app.visit_reports` row was never deleted.
 */
export default async function ArchivedReportsPage() {
  const session = await requireModuleAccess("/field-ops/archived");
  const canManage = session.permissions.includes("manage_archived_reports");
  const reports = await listArchivedReports();

  const unavailable = reports === null;
  const list = reports ?? [];

  return (
    <>
      <PageHeader
        eyebrow="العمليات الميدانية"
        title="التقارير المؤرشفة"
        description="تقارير الزيارات التي أُزيلت من مسار المهمة، مع سبب الأرشفة ومن أرشفها. الاستعادة تعيد التقرير إلى المسار."
        actions={
          <span className="badge badge-gold">{list.length} تقرير</span>
        }
      />

      <ArchivedReportsView
        initialReports={list}
        canManage={canManage}
        unavailable={unavailable}
      />
    </>
  );
}
