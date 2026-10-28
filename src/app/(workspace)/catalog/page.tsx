import { CatalogClient } from "@/components/catalog/catalog-client";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { getServerSession } from "@/lib/auth/server-session";
import { catalogRevision, listProducts } from "@/lib/catalog/store";
import { isCatalogEligibleContract } from "@/lib/catalog/types";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { listCities, listMerchants } from "@/lib/field-ops/store";
import {
  listCategories,
  listVendorTypes,
  listVariants,
} from "@/lib/taxonomy/store";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  await requirePermission("view_catalog");
  const session = await getServerSession();

  const allowed = new Set(session ? effectiveCityIds(session) : []);
  const cityName = new Map(listCities().map((city) => [city.id, city.name]));

  // Only merchants whose contract is final or signed may receive products.
  const merchants = listMerchants()
    .filter(
      (merchant) =>
        allowed.has(merchant.cityId) &&
        isCatalogEligibleContract(merchant.contractState),
    )
    .map((merchant) => ({
      id: merchant.id,
      name: merchant.name,
      vendorTypeId: merchant.vendorTypeId,
      vendorType: merchant.vendorType,
      contractState: merchant.contractState,
      cityName: cityName.get(merchant.cityId) ?? merchant.cityId,
    }));

  return (
    <>
      <PageHeader
        eyebrow="حوكمة الكتالوج"
        title="كتالوج المنتجات"
        description="الأسعار وحالة النشر ومراجعة الجودة لمنتجات التجار. أدوات الإنشاء والحذف محكومة بالصلاحيات."
        actions={<span className="badge">{listProducts().length} منتج</span>}
      />

      <CatalogClient
        initialProducts={listProducts()}
        initialRevision={catalogRevision()}
        merchants={merchants}
        vendorTypes={listVendorTypes()}
        categories={listCategories()}
        variants={listVariants()}
      />
    </>
  );
}
