"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CatalogFilterTabs } from "@/components/catalog/catalog-filter-tabs";
import { LightboxModal } from "@/components/catalog/lightbox-modal";
import { ProductCard } from "@/components/catalog/product-card";
import { ProductDetailsModal } from "@/components/catalog/product-details-modal";
import { useImageQa } from "@/components/catalog/use-image-qa";
import {
  filterProducts,
  type CatalogFilter,
} from "@/lib/catalog/filters";
import type { CatalogProduct } from "@/lib/catalog/types";
import type {
  TaxonomyCategory,
  TaxonomyVariant,
} from "@/lib/taxonomy/types";

type CatalogGridProps = {
  products: CatalogProduct[];
  categories: TaxonomyCategory[];
  variants: TaxonomyVariant[];
  onProductsChange: (products: CatalogProduct[]) => void;
};

/**
 * Filterable product grid plus the details / lightbox / QA wiring.
 *
 * Split from `CatalogClient` so the page shell (toolbar, entry modal, governance
 * note) does not re-render when a reviewer opens a modal or changes a filter.
 */
export function CatalogGrid({
  products,
  categories,
  variants,
  onProductsChange,
}: CatalogGridProps) {
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [details, setDetails] = useState<CatalogProduct | null>(null);
  const [lightbox, setLightbox] = useState<CatalogProduct | null>(null);

  const visible = useMemo(
    () => filterProducts(products, filter),
    [products, filter],
  );

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.key, category.name_ar])),
    [categories],
  );

  const handleUpdated = useCallback(
    (updated: CatalogProduct) => {
      const next = products.map((product) =>
        product.id === updated.id ? updated : product,
      );
      onProductsChange(next);
      setDetails((current) =>
        current && current.id === updated.id ? updated : current,
      );
    },
    [products, onProductsChange],
  );

  const qa = useImageQa({ onUpdated: handleUpdated });

  useEffect(() => {
    if (!qa.message) return;
    const timer = window.setTimeout(qa.clearMessage, 4000);
    return () => window.clearTimeout(timer);
  }, [qa.message, qa.clearMessage]);

  return (
    <>
      <section className="toolbar-row cat-toolbar">
        <CatalogFilterTabs
          products={products}
          active={filter}
          onChange={setFilter}
        />
      </section>

      {qa.error ? (
        <p className="form-error" role="alert">
          {qa.error}
        </p>
      ) : null}

      <section className="card-grid">
        {visible.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            qaBusy={qa.busyId === product.id}
            onOpenDetails={setDetails}
            onOpenImage={setLightbox}
            onDownloadOriginal={qa.downloadOriginal}
            onApprove={(target) => void qa.approve(target)}
            onUploadEnhanced={(target, dataUrl) =>
              void qa.uploadEnhanced(target, dataUrl)
            }
          />
        ))}

        {visible.length === 0 ? (
          <p className="empty-state">
            {products.length === 0
              ? "لا توجد منتجات في الكتالوج بعد."
              : "لا توجد منتجات مطابقة لهذا الفلتر."}
          </p>
        ) : null}
      </section>

      <ProductDetailsModal
        product={details}
        variants={variants}
        categoryName={
          details?.categoryKey
            ? categoryNames.get(details.categoryKey) ?? details.categoryKey
            : ""
        }
        onClose={() => setDetails(null)}
        onOpenImage={() => {
          if (details?.imageDataUrl) setLightbox(details);
        }}
      />

      <LightboxModal
        src={lightbox?.imageDataUrl ?? null}
        alt={lightbox?.name ?? ""}
        onClose={() => setLightbox(null)}
      />

      {qa.message ? (
        <div className="toast" role="status">
          {qa.message}
        </div>
      ) : null}
    </>
  );
}
