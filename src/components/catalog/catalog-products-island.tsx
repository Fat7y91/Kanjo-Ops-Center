"use client";

import type { ComponentProps } from "react";

import { CatalogClient } from "@/components/catalog/catalog-client";
import { useEndpointData } from "@/components/data/use-endpoint-data";
import { ErrorPanel } from "@/components/ui/error-panel";
import { TableSkeleton } from "@/components/ui/skeletons";
import {
  catalogProductsPayloadSchema,
  type CatalogProductsPayload,
} from "@/lib/catalog/payload";

/** Module-level so the hook's dependency list stays stable. */
const parseProducts = (input: unknown): CatalogProductsPayload =>
  catalogProductsPayloadSchema.parse(input);

type CatalogClientProps = ComponentProps<typeof CatalogClient>;

type CatalogProductsIslandProps = {
  merchantId: string;
  /** Empty when the contract is not eligible to carry products yet. */
  merchants: CatalogClientProps["merchants"];
  vendorTypes: CatalogClientProps["vendorTypes"];
  categories: CatalogClientProps["categories"];
  variants: CatalogClientProps["variants"];
};

/**
 * Merchant catalog island.
 *
 * The taxonomy — vendor types, categories, variants — is small, static and
 * already resolved by the page, so it ships with the shell and the form opens
 * instantly. The products themselves are the varying part and come from
 * `/api/catalog/products?merchantId=…`, which is the same scoped read the client
 * uses after a sync.
 */
export function CatalogProductsIsland({
  merchantId,
  merchants,
  vendorTypes,
  categories,
  variants,
}: CatalogProductsIslandProps) {
  const { status, data, error, reload } = useEndpointData(
    `/api/catalog/products?merchantId=${encodeURIComponent(merchantId)}`,
    parseProducts,
  );

  if (status === "loading") {
    return (
      <div aria-busy="true">
        <TableSkeleton rows={6} columns={6} />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <ErrorPanel
        error={error}
        reset={reload}
        title="تعذر تحميل كتالوج التاجر"
        description="لم تكتمل قراءة منتجات هذا التاجر. أعد المحاولة دون مغادرة الصفحة."
      />
    );
  }

  return (
    <CatalogClient
      initialProducts={data.products}
      merchants={merchants}
      vendorTypes={vendorTypes}
      categories={categories}
      variants={variants}
      defaultMerchantId={merchantId}
    />
  );
}
