import { DataEntryView } from "@/components/data-entry/data-entry-view";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { getServerSession } from "@/lib/auth/server-session";
import { listProducts } from "@/lib/catalog/store";
import { PRODUCT_STATE_META } from "@/lib/catalog/types";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { listCities, listMerchants } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function DataEntryPage() {
  await requirePermission("view_catalog");
  const session = await getServerSession();
  const allowed = new Set(session ? effectiveCityIds(session) : []);
  const cityName = new Map(listCities().map((city) => [city.id, city.name]));

  const merchants = listMerchants().filter((merchant) =>
    allowed.has(merchant.cityId),
  );
  const merchantIds = new Set(merchants.map((merchant) => merchant.id));
  const products = listProducts().filter((product) =>
    merchantIds.has(product.merchantId),
  );

  const merchantRows = merchants.map((merchant) => {
    const owned = products.filter(
      (product) => product.merchantId === merchant.id,
    );
    return {
      id: merchant.id,
      name: merchant.name,
      cityName: cityName.get(merchant.cityId) ?? merchant.cityId,
      vendorType: merchant.vendorType,
      productCount: owned.length,
      publishedCount: owned.filter((product) => product.state === "published")
        .length,
    };
  });

  const productRows = products.map((product) => {
    const meta = PRODUCT_STATE_META[product.state];
    return {
      id: product.id,
      merchantId: product.merchantId,
      name: product.name,
      sku: product.sku,
      price: product.price,
      stateLabel: meta.label,
      stateTone: meta.tone,
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="إدخال البيانات"
        title="التجار والمنتجات"
        description="اختر تاجراً لعرض منتجاته وأسعاره وحالة كل منتج."
        actions={<span className="badge badge-gold">{merchantRows.length} تاجر</span>}
      />

      <DataEntryView merchants={merchantRows} products={productRows} />
    </>
  );
}
