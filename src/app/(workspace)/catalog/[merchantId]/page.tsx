import Link from "next/link";
import { notFound } from "next/navigation";

import { CatalogClient } from "@/components/catalog/catalog-client";
import type { CatalogMerchantOption } from "@/components/catalog/merchant-picker";
import { PageHeader } from "@/components/ui/page-header";
import { requireModuleAccess } from "@/lib/auth/guard";
import { isCatalogEligibleContract } from "@/lib/catalog/types";
import { listProducts } from "@/lib/catalog/store";
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

  const products = (await listProducts()).filter(
    (product) => product.merchantId === merchant.id,
  );

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

      {isCatalogEligibleContract(contractState) ? null : (
        <p className="inline-note cat-eligibility-note">
          لا يمكن إضافة منتجات قبل اعتماد اتفاق نهائي أو توقيع العقد. الحالة
          الحالية: {meta.label}.
        </p>
      )}

      <CatalogClient
        initialProducts={products}
        merchants={
          isCatalogEligibleContract(contractState) ? merchantOptions : []
        }
        vendorTypes={listVendorTypes()}
        categories={listCategories()}
        variants={listVariants()}
        defaultMerchantId={merchant.id}
      />
    </>
  );
}
