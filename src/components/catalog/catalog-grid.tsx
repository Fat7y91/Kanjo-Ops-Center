"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CatalogFilterTabs } from "@/components/catalog/catalog-filter-tabs";
import { LightboxModal } from "@/components/catalog/lightbox-modal";
import { ProductCard } from "@/components/catalog/product-card";
import { ProductDetailsModal } from "@/components/catalog/product-details-modal";
import { ProductEditModal } from "@/components/catalog/product-edit-modal";
import { useImageQa } from "@/components/catalog/use-image-qa";
import { TextField } from "@/components/ui/form-inputs";
import { useDebouncedValue } from "@/components/ui/use-debounced-value";
import {
  filterProducts,
  filterProductsBySearch,
  type CatalogFilter,
} from "@/lib/catalog/filters";
import type { CatalogProduct } from "@/lib/catalog/types";
import type {
  TaxonomyCategory,
  TaxonomyVariant,
  TaxonomyVendorType,
} from "@/lib/taxonomy/types";

type CatalogGridProps = {
  products: CatalogProduct[];
  categories: TaxonomyCategory[];
  variants: TaxonomyVariant[];
  vendorTypes: TaxonomyVendorType[];
  onProductsChange: (products: CatalogProduct[]) => void;
  /** A product the mirror dialog asked to repair, opened once then cleared. */
  editRequestId?: string | null;
  onEditRequestHandled?: () => void;
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
  vendorTypes,
  onProductsChange,
  editRequestId,
  onEditRequestHandled,
}: CatalogGridProps) {
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [query, setQuery] = useState("");
  const [details, setDetails] = useState<CatalogProduct | null>(null);
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [lightbox, setLightbox] = useState<CatalogProduct | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const debouncedQuery = useDebouncedValue(query);

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.key, category.name_ar])),
    [categories],
  );

  const visible = useMemo(() => {
    const searched = filterProductsBySearch(
      products,
      debouncedQuery,
      categoryNames,
    );
    return filterProducts(searched, filter);
  }, [products, filter, debouncedQuery, categoryNames]);

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
    if (!editRequestId) return;
    const target = products.find((product) => product.id === editRequestId);
    if (target) setEditing(target);
    onEditRequestHandled?.();
  }, [editRequestId, products, onEditRequestHandled]);

  const handleDelete = useCallback(
    async (product: CatalogProduct) => {
      if (!window.confirm("هل أنت متأكد من حذف هذا المنتج؟")) return;
      setDeleteError("");
      try {
        const response = await fetch(`/api/catalog/products/${product.id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload.error ?? "تعذر حذف المنتج.");
        }
        onProductsChange(
          products.filter((candidate) => candidate.id !== product.id),
        );
        setDetails((current) =>
          current && current.id === product.id ? null : current,
        );
        setEditing((current) =>
          current && current.id === product.id ? null : current,
        );
        setLightbox((current) =>
          current && current.id === product.id ? null : current,
        );
        setDeleteMessage(`تم حذف «${product.name}».`);
      } catch (error) {
        setDeleteError(
          error instanceof Error ? error.message : "تعذر حذف المنتج.",
        );
      }
    },
    [products, onProductsChange],
  );

  useEffect(() => {
    if (!deleteMessage) return;
    const timer = window.setTimeout(() => setDeleteMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [deleteMessage]);

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
        <TextField
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث باسم المنتج أو التصنيف…"
          aria-label="بحث المنتجات"
          className="cat-product-search"
        />
      </section>

      {qa.error ? (
        <p className="form-error" role="alert">
          {qa.error}
        </p>
      ) : null}

      {deleteError ? (
        <p className="form-error" role="alert">
          {deleteError}
        </p>
      ) : null}

      <section className="card-grid">
        {visible.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            qaBusy={qa.busyId === product.id}
            onOpenDetails={setDetails}
            onEdit={setEditing}
            onDelete={(target) => void handleDelete(target)}
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
              : debouncedQuery.trim()
                ? "لا توجد منتجات مطابقة لهذا البحث."
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
        onEdit={() => {
          setEditing(details);
          setDetails(null);
        }}
        onDelete={() => {
          if (details) void handleDelete(details);
        }}
        onOpenImage={() => {
          if (details?.imageDataUrl) setLightbox(details);
        }}
      />

      <ProductEditModal
        product={editing}
        vendorTypes={vendorTypes}
        categories={categories}
        variants={variants}
        onClose={() => setEditing(null)}
        onSaved={handleUpdated}
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

      {deleteMessage ? (
        <div className="toast" role="status">
          {deleteMessage}
        </div>
      ) : null}
    </>
  );
}
