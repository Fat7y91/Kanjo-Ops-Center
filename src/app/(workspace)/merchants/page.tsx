import { ClientErrorBoundary } from "@/components/errors/client-error-boundary";
import { MerchantsIsland } from "@/components/merchants/merchants-island";
import { requireModuleAccess } from "@/lib/auth/guard";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { listCities } from "@/lib/field-ops/store";
import { listVendorTypes } from "@/lib/taxonomy/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type MerchantsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

/**
 * Merchant directory shell.
 *
 * The rows are fetched by the island from `/api/merchants`, which is the same
 * projection this page used to build during the render. What stays here is what
 * the request already knows before it can draw: the operator's city scope and
 * the taxonomy the add form opens with.
 */
export default async function MerchantsPage({
  searchParams,
}: MerchantsPageProps) {
  const session = await requireModuleAccess("/merchants");
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const allowedCities = new Set(await effectiveCityIds(session));
  const availableCities = (await listCities())
    .filter((city) => allowedCities.has(city.id))
    .map((city) => ({ id: city.id, name: city.name, stage: city.stage }));

  // A new merchant starts in the city being prepared, when the operator covers
  // one: that is where the network grows, and it saves the common correction.
  const defaultCityId =
    availableCities.find((city) => city.stage === "preparation")?.id ??
    availableCities[0]?.id;

  return (
    <ClientErrorBoundary
      title="تعذر عرض دليل التجار"
      description="لم تكتمل قراءة بيانات التجار. أعد المحاولة دون مغادرة الصفحة."
      connectionTitle="انقطع الاتصال أثناء تحميل دليل التجار"
    >
      <MerchantsIsland
        initialQuery={query}
        canCreate={session.permissions.includes("add_merchant")}
        canImport={session.permissions.includes("import_merchants")}
        cities={availableCities}
        taxonomy={{ vendorTypes: listVendorTypes() }}
        defaultCityId={defaultCityId}
      />
    </ClientErrorBoundary>
  );
}
