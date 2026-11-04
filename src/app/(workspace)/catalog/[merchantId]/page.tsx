import Link from "next/link";
import { notFound } from "next/navigation";

import { CatalogProductsIsland } from "@/components/catalog/catalog-products-island";
import type { CatalogMerchantOption } from "@/components/catalog/merchant-picker";
import { ClientErrorBoundary } from "@/components/errors/client-error-boundary";
import { PageHeader } from "@/components/ui/page-header";
import { requireModuleAccess } from "@/lib/auth/guard";
import { isCatalogEligibleContract } from "@/lib/catalog/types";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { loadMerchantStates } from "@/lib/field-ops/state-source";
import { getCityById, getMerchantById } from "@/lib/field-ops/store";
import { CONTRACT_STATE_META } from "@/lib/field-ops/types";
import {
  listCategories,
  listVendorTypes,
  listVariants,
} from "@/lib/taxonomy/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type MerchantCatalogPageProps = {
  params: Promise<{ merchantId: string }>;
};

/**
 * Merchant catalog shell.
 *
 * The header is a fact about the merchant — name, vendor type, city, resolved
 * contract state — resolved here because an unknown or out-of-scope id must
 * answer 404 before any client code runs. The product list is the part that
 * varies with the catalog, so the island fetches it, and the taxonomy ships with
 * the shell so the entry form opens without waiting.
 */
export default async function MerchantCatalogPage({
  params,
}: MerchantCatalogPageProps) {
  const session = await requireModuleAccess("/catalog");
  const { merchantId } = await params;
  const merchant = await getMerchantById(merchantId);
  if (!merchant || !effectiveCityIds(session).includes(merchant.cityId)) {
    notFound();
  }

  const states = await loadMerchantStates([merchant]);
  const contractState =
    states.get(merchant.id)?.state ?? merchant.contractState;
  const meta = CONTRACT_STATE_META[contractState];
  const city = getCityById(merchant.cityId);
  const eligible = isCatalogEligibleContract(contractState);

  // The picker stays in the form, so the merchant must be listed even when its
  // contract is not eligible yet — the submit guard explains the block.
  const merchantOptions: CatalogMerchantOption[] = [
    {
      id: merchant.id,
      name: merchant.name,
      vendorTypeId: merchant.vendorTypeId,
      vendorType: merchant.vendorType,
      contractState,
      cityName: city?.name ?? "—",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="كتالوج التاجر"
        title={merchant.name}
        description={`${merchant.vendorType} · ${city?.name ?? "مدينة غير محددة"}`}
        actions={
          <div className="row-actions">
            <span className={`badge ${meta.tone}`}>{meta.label}</span>
            <Link href={`/merchants/${merchant.id}`} className="button button-quiet">
              ملف التاجر
            </Link>
            <Link href="/catalog" className="button button-quiet">
              كل التجار
            </Link>
          </div>
        }
      />

      {eligible ? null : (
        <p className="inline-note cat-eligibility-note">
          لا يمكن إضافة منتجات قبل اعتماد اتفاق نهائي أو توقيع العقد. الحالة
          الحالية: {meta.label}.
        </p>
      )}

      <ClientErrorBoundary
        title="تعذر عرض كتالوج التاجر"
        description="لم تكتمل قراءة منتجات هذا التاجر. أعد المحاولة دون مغادرة الصفحة."
        connectionTitle="انقطع الاتصال أثناء تحميل كتالوج التاجر"
      >
        <CatalogProductsIsland
          merchantId={merchant.id}
          merchants={eligible ? merchantOptions : []}
          vendorTypes={listVendorTypes()}
          categories={listCategories()}
          variants={listVariants()}
        />
      </ClientErrorBoundary>
    </>
  );
}
