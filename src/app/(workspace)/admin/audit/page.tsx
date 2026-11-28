import { PageHeader } from "@/components/ui/page-header";
import { AuditLogView } from "@/app/(workspace)/admin/audit/components/audit-log-view";
import { requireModuleAccess } from "@/lib/auth/guard";
import { listAuditCollections, listAuditLogs } from "@/lib/audit/repository";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * The audit trail (the V2 "Black Box").
 *
 * Read-only: `app.audit_logs` refuses every UPDATE at the database level. The
 * page authorizes through the navigation catalogue, so an operator who can see
 * the module in the sidebar can also open it.
 */
export default async function AuditPage() {
  await requireModuleAccess("/admin/audit");

  const [logs, collections] = await Promise.all([
    listAuditLogs({ limit: 200 }),
    listAuditCollections(),
  ]);

  const unavailable = logs === null;
  const items = logs ?? [];

  return (
    <>
      <PageHeader
        eyebrow="الحوكمة"
        title="سجل التدقيق"
        description="الصندوق الأسود: كل تغيير على سجل محكوم يُسجَّل هنا مع الفاعل والوقت وقبل/بعد. السجل غير قابل للتعديل — أي تصحيح هو قيد جديد."
        actions={
          <span className="badge badge-gold">{items.length} قيد</span>
        }
      />

      <AuditLogView
        initialLogs={items}
        collections={collections}
        unavailable={unavailable}
      />
    </>
  );
}
