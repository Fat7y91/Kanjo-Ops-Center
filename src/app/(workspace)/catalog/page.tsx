import { CatalogClient } from "@/components/catalog/catalog-client";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { catalogRevision, listProducts } from "@/lib/catalog/store";
import { listMerchants } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  await requirePermission("view_catalog");

  const merchants = listMerchants().map((merchant) => ({
    id: merchant.id,
    name: merchant.name,
  }));

  return (
    <>
      <PageHeader
        eyebrow="حوكمة الكتالوج"
        title="كتالوج المنتجات"
        description="الأسعار وحالة النشر ومراجعة الجودة لمنتجات التجار. أدوات الإنشاء والحذف محكومة بالصلاحيات."
        actions={
          <span className="badge">{listProducts().length} منتج</span>
        }
      />

      <CatalogClient
        initialProducts={listProducts()}
        initialRevision={catalogRevision()}
        merchants={merchants}
      />
    </>
  );
}
