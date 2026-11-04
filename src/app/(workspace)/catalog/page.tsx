import { CatalogDirectory } from "@/components/catalog/catalog-directory";
import { CatalogSummary } from "@/components/catalog/catalog-summary";
import { EntryLeaderboard } from "@/components/catalog/entry-leaderboard";
import { PageHeader } from "@/components/ui/page-header";
import { requireModuleAccess } from "@/lib/auth/guard";
import {
  buildEntryLeaderboard,
  buildMerchantCards,
  type CatalogMerchantSource,
} from "@/lib/catalog/merchants";
import { listProducts } from "@/lib/catalog/store";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { listMerchantV1Flags } from "@/lib/field-ops/merchant-profile-repository";
import { loadMerchantStates } from "@/lib/field-ops/state-source";
import { listCities, listMerchants } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function CatalogPage() {
  const session = await requireModuleAccess("/catalog");
  const allowed = new Set(effectiveCityIds(session));

  const merchants = (await listMerchants()).filter((merchant) =>
    allowed.has(merchant.cityId),
  );
  const merchantIds = new Set(merchants.map((merchant) => merchant.id));

  // City scope applies to the catalog too: a reviewer only sees products whose
  // merchant sits inside their effective cities.
  const products = (await listProducts()).filter((product) =>
    merchantIds.has(product.merchantId),
  );

  // The tile badge must agree with the merchant profile: the newest visit
  // outcome or manager override wins over the stored column.
  const states = await loadMerchantStates(merchants);
  const flags = await listMerchantV1Flags();
  const cityName = new Map(listCities().map((city) => [city.id, city.name]));

  const sources: CatalogMerchantSource[] = merchants.map((merchant) => ({
    id: merchant.id,
    name: merchant.name,
    cityName: cityName.get(merchant.cityId) ?? "—",
    vendorType: merchant.vendorType,
    contractState: states.get(merchant.id)?.state ?? merchant.contractState,
    vipMenu: flags.get(merchant.id)?.vipMenu ?? false,
    appPublished: flags.get(merchant.id)?.appPublished ?? false,
  }));

  const cards = buildMerchantCards(sources, products);
  const board = buildEntryLeaderboard(products);
  const pending = products.filter(
    (product) => product.state === "pending_review",
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="حوكمة الكتالوج"
        title="كتالوج التجار"
        description="لكل تاجر ملف منتجات مستقل: الأسعار وحالة النشر ومراجعة الجودة. ابدأ بالتاجر ثم أضف منتجاته."
        actions={<span className="badge">{cards.length} تاجر</span>}
      />

      <CatalogSummary
        merchants={cards.length}
        liveMerchants={cards.filter((card) => card.live).length}
        products={products.length}
        pending={pending}
      />

      <div className="cat-home">
        <div className="cat-home-main">
          <CatalogDirectory cards={cards} />
        </div>
        <aside className="cat-home-side">
          <EntryLeaderboard board={board} />
        </aside>
      </div>
    </>
  );
}
