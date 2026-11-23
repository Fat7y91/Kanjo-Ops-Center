import { PageHeader } from "@/components/ui/page-header";
import { requireModuleAccess } from "@/lib/auth/guard";
import { loadTaxonomySnapshotFromDatabase } from "@/lib/taxonomy/db-taxonomy";
import { listTaxonomyRequests } from "@/lib/taxonomy/store";
import { TaxonomyCenter } from "./taxonomy-center";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function CatalogTaxonomyPage() {
  const session = await requireModuleAccess("/catalog/taxonomy");
  const snapshot = await loadTaxonomySnapshotFromDatabase();
  const requests = listTaxonomyRequests();
  const pending = requests.filter((request) => request.status === "pending").length;

  return (
    <>
      <PageHeader
        eyebrow="حوكمة الكتالوج"
        title="تصنيفات الكتالوج"
        description="مصدر الحقيقة الوحيد لأنواع التجار والتصنيفات والمتغيرات. كل سجل مرتبط بمعرّف رقمي رسمي من لوحة المستهلك، والإضافة تتم فقط عبر طلب مراجعة واعتماد."
        actions={
          <div className="row-actions">
            <span className="badge">{snapshot.vendorTypes.length} نوع</span>
            <span className="badge">{snapshot.categories.length} تصنيف</span>
            <span className={`badge ${pending > 0 ? "badge-gold" : "badge-green"}`}>
              {pending} طلب قيد المراجعة
            </span>
          </div>
        }
      />

      <TaxonomyCenter
        initialSnapshot={snapshot}
        initialRequests={requests}
        initialRevision={snapshot.revision}
        viewerName={session.user.name}
      />
    </>
  );
}
