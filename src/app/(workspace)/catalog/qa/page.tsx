import { ImageQaBoard } from "@/components/catalog/image-qa-board";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { requirePermission } from "@/lib/auth/guard";
import { listCatalogRecords } from "@/lib/catalog/repository";
import { getPendingReviewProducts } from "@/lib/catalog/services/image-qa-service";
import { effectiveCityIds } from "@/lib/city-scope-query";

export const dynamic = "force-dynamic";

/**
 * Image Quality Assurance workspace (Tier 1 server container).
 *
 * The page authorizes the reviewer, asks the Tier 3 service for the scoped
 * pending queue, and hands display-ready data to the client board.
 */
export default async function CatalogQaPage() {
  const session = await requirePermission("review_catalog_images");

  const cityScope = effectiveCityIds(session);
  const pending = getPendingReviewProducts(listCatalogRecords(), cityScope);
  const withImage = pending.filter((product) => product.imageDataUrl).length;

  return (
    <>
      <PageHeader
        eyebrow="حوكمة الكتالوج"
        title="مراجعة جودة الصور"
        description="اعتمد صور المنتجات أو ارفع نسخة محسّنة قبل نشرها في الكتالوج. تظهر فقط منتجات التجار داخل نطاق مدنك."
        actions={
          <span className="badge badge-gold">
            {pending.length} بانتظار المراجعة
          </span>
        }
      />

      <section className="stat-grid">
        <StatCard
          label="بانتظار المراجعة"
          value={String(pending.length)}
          detail="منتجات تحتاج قراراً على الصورة"
          tone="gold"
        />
        <StatCard
          label="صور متاحة"
          value={String(withImage)}
          detail="يمكن تحميلها أو اعتمادها مباشرة"
        />
        <StatCard
          label="نطاق المدن"
          value={String(cityScope.length)}
          detail="مدن مرئية لهذا الحساب"
        />
      </section>

      <ImageQaBoard initialProducts={pending} />
    </>
  );
}
