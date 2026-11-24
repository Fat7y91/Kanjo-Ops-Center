"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Protect } from "@/components/auth/protect";
import { usePermission } from "@/components/auth/use-permission";
import { AutopilotModal } from "@/components/catalog/autopilot-modal";
import { CatalogGrid } from "@/components/catalog/catalog-grid";
import { ClearCatalogModal } from "@/components/catalog/clear-catalog-modal";
import { MirrorImagesModal } from "@/components/catalog/mirror-images-modal";
import { ProductEntry } from "@/components/catalog/product-entry";
import { useCatalogExport } from "@/components/catalog/use-catalog-export";
import { Button } from "@/components/ui/button";
import type { CatalogMerchantOption } from "@/components/catalog/merchant-picker";
import type { CatalogProduct } from "@/lib/catalog/types";
import type {
  TaxonomyCategory,
  TaxonomyVariant,
  TaxonomyVendorType,
} from "@/lib/taxonomy/types";

type CatalogClientProps = {
  initialProducts: CatalogProduct[];
  merchants: CatalogMerchantOption[];
  vendorTypes: TaxonomyVendorType[];
  categories: TaxonomyCategory[];
  variants: TaxonomyVariant[];
  /** Set on a merchant page: entry stays pinned to that merchant. */
  defaultMerchantId?: string;
};

/**
 * Product workspace for one merchant.
 *
 * The catalog home lists merchants, so this container is mounted on the
 * merchant route where the product rows actually belong. It owns the product
 * list, the entry modal and the post-sync reload.
 */
export function CatalogClient({
  initialProducts,
  merchants,
  vendorTypes,
  categories,
  variants,
  defaultMerchantId,
}: CatalogClientProps) {
  const [products, setProducts] = useState<CatalogProduct[]>(initialProducts);
  const [open, setOpen] = useState(false);
  const [autopilotOpen, setAutopilotOpen] = useState(false);
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [editRequestId, setEditRequestId] = useState<string | null>(null);
  const excel = useCatalogExport();
  const router = useRouter();
  const { hasPermission, clearanceLevel } = usePermission();
  const canClearCatalog =
    hasPermission("delete_catalog") || clearanceLevel >= 4;
  const activeMerchant = merchants.find(
    (merchant) => merchant.id === defaultMerchantId,
  );
  const merchantName = activeMerchant?.name ?? "catalog";

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleCleared = useCallback(
    (deletedCount: number) => {
      setProducts([]);
      setClearOpen(false);
      setToast(`تم حذف ${deletedCount} منتجاً بنجاح`);
      router.refresh();
    },
    [router],
  );

  const handleMirrored = useCallback((productId: string, url: string) => {
    setProducts((current) =>
      current.map((product) =>
        product.id === productId
          ? { ...product, imageDataUrl: url }
          : product,
      ),
    );
  }, []);

  const reload = useCallback(async () => {
    try {
      const query = defaultMerchantId
        ? `?merchantId=${encodeURIComponent(defaultMerchantId)}`
        : "";
      const response = await fetch(`/api/catalog/products${query}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        products?: CatalogProduct[];
      };
      if (payload.products) setProducts(payload.products);
    } catch {
      // Offline: the draft queue banner already communicates local state.
    }
  }, [defaultMerchantId]);

  const handleSynced = useCallback(() => {
    void reload();
  }, [reload]);

  return (
    <>
      <section className="toolbar-row">
        <div className="row-actions">
          <Protect
            require={["add_catalog", "edit_catalog"]}
            mode="any"
            fallback={<span className="badge">عرض فقط</span>}
          >
            <Button
              variant="primary"
              onClick={() => setOpen(true)}
              disabled={merchants.length === 0}
            >
              إضافة منتج
            </Button>
            {defaultMerchantId && merchants.length > 0 ? (
              <Button
                variant="accent"
                onClick={() => setAutopilotOpen(true)}
              >
                الاستيراد التلقائي
              </Button>
            ) : null}
          </Protect>
          {defaultMerchantId && products.length > 0 ? (
            <>
              <Protect require={["add_catalog", "edit_catalog"]} mode="any">
                <Button
                  variant="accent"
                  onClick={() => setMirrorOpen(true)}
                  disabled={excel.busy}
                >
                  توطين الصور على السيرفر
                </Button>
              </Protect>
              <Button
                variant="quiet"
                disabled={excel.busy}
                onClick={() =>
                  void excel.exportCatalog({
                    products,
                    categories,
                    merchantName,
                  })
                }
              >
                {excel.busy ? "جاري التصدير…" : "تصدير Excel"}
              </Button>
            </>
          ) : null}
          {defaultMerchantId && canClearCatalog ? (
            <Button
              variant="danger"
              onClick={() => setClearOpen(true)}
              disabled={products.length === 0}
            >
              حذف الكتالوج بالكامل
            </Button>
          ) : null}
        </div>
      </section>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}

      {excel.error ? (
        <p className="form-error" role="alert">
          {excel.error}
        </p>
      ) : null}

      {excel.warning ? (
        <p className="inline-note" role="status">
          {excel.warning}
        </p>
      ) : null}

      {defaultMerchantId && activeMerchant ? (
        <AutopilotModal
          open={autopilotOpen}
          merchantId={defaultMerchantId}
          vendorTypeId={activeMerchant.vendorTypeId}
          onClose={() => setAutopilotOpen(false)}
          onSaved={handleSynced}
        />
      ) : null}

      {defaultMerchantId ? (
        <MirrorImagesModal
          open={mirrorOpen}
          merchantId={defaultMerchantId}
          products={products}
          onClose={() => setMirrorOpen(false)}
          onMirrored={handleMirrored}
          onEditProduct={setEditRequestId}
        />
      ) : null}

      {defaultMerchantId ? (
        <ClearCatalogModal
          open={clearOpen}
          merchantId={defaultMerchantId}
          merchantName={merchantName}
          productCount={products.length}
          onClose={() => setClearOpen(false)}
          onCleared={handleCleared}
        />
      ) : null}

      <ProductEntry
        open={open}
        merchants={merchants}
        vendorTypes={vendorTypes}
        categories={categories}
        variants={variants}
        defaultMerchantId={defaultMerchantId}
        onClose={() => setOpen(false)}
        onOpen={() => setOpen(true)}
        onSynced={handleSynced}
      />

      <CatalogGrid
        products={products}
        categories={categories}
        variants={variants}
        vendorTypes={vendorTypes}
        merchantVendorTypeId={activeMerchant?.vendorTypeId ?? null}
        onProductsChange={setProducts}
        editRequestId={editRequestId}
        onEditRequestHandled={() => setEditRequestId(null)}
      />
    </>
  );
}
