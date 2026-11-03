"use client";

import { useCallback, useState } from "react";

import { Protect } from "@/components/auth/protect";
import { CatalogGrid } from "@/components/catalog/catalog-grid";
import { ProductEntry } from "@/components/catalog/product-entry";
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

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/catalog/products", {
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
  }, []);

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
          </Protect>
        </div>
      </section>

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
        onProductsChange={setProducts}
      />
    </>
  );
}
