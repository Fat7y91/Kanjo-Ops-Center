import { AddMerchantButton } from "@/components/merchants/add-merchant-button";
import {
  MerchantsDirectory,
  type MerchantRow,
} from "@/components/merchants/merchants-directory";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { listCities, listMerchants } from "@/lib/field-ops/store";
import { CONTRACT_STATE_META, teamLabel } from "@/lib/field-ops/types";
import { listVendorTypes } from "@/lib/taxonomy/store";

export const dynamic = "force-dynamic";

type MerchantsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

const currency = new Intl.NumberFormat("ar-EG", {
  style: "currency",
  currency: "EGP",
  maximumFractionDigits: 0,
});

export default async function MerchantsPage({
  searchParams,
}: MerchantsPageProps) {
  const session = await requirePermission("view_merchants");
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const allCities = listCities();
  const cityMap = new Map(allCities.map((city) => [city.id, city]));
  const allowedCities = new Set(effectiveCityIds(session));
  const scoped = listMerchants().filter((merchant) =>
    allowedCities.has(merchant.cityId),
  );
  const canCreate = session.permissions.includes("create_merchants");
  const availableCities = allCities
    .filter((city) => allowedCities.has(city.id))
    .map((city) => ({ id: city.id, name: city.name, stage: city.stage }));
  const defaultCityId =
    availableCities.find((city) => city.stage === "preparation")?.id ??
    availableCities[0]?.id;
  const taxonomy = { vendorTypes: listVendorTypes() };

  const rows: MerchantRow[] = scoped.map((merchant) => {
    const meta = CONTRACT_STATE_META[merchant.contractState];
    return {
      id: merchant.id,
      name: merchant.name,
      vendorType: merchant.vendorType,
      vendorTypeId: merchant.vendorTypeId,
      cityName: cityMap.get(merchant.cityId)?.name ?? "—",
      teamLabel: teamLabel(merchant.team),
      stateLabel: meta.label,
      stateTone: meta.tone,
      commissionLabel: currency.format(merchant.commissionAmount),
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="عمليات التجار"
        title="دليل التجار"
        description="الملكية وحالة دورة الحياة والبيانات التجارية لكل تاجر على الشبكة. افتح الملف لإدارة المستندات والنتائج وعمليات النقل."
        actions={
          <div className="row-actions">
            <span className="badge">{scoped.length} تاجر</span>
            {canCreate ? (
              <AddMerchantButton
                cities={availableCities}
                taxonomy={taxonomy}
                defaultCityId={defaultCityId}
              />
            ) : null}
          </div>
        }
      />

      <MerchantsDirectory rows={rows} initialQuery={query} />
    </>
  );
}
