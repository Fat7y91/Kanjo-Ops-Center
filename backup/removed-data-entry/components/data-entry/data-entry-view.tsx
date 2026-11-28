"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { PRODUCT_STATE_META } from "@/lib/catalog/types";
import { formatPrice } from "@/lib/catalog/format";

export type DataEntryMerchant = {
  id: string;
  name: string;
  cityName: string;
  vendorType: string;
  productCount: number;
  publishedCount: number;
};

export type DataEntryProduct = {
  id: string;
  merchantId: string;
  name: string;
  sku: string;
  price: number;
  stateLabel: string;
  stateTone: string;
};

type DataEntryViewProps = {
  merchants: DataEntryMerchant[];
  products: DataEntryProduct[];
};

export function DataEntryView({ merchants, products }: DataEntryViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    merchants[0]?.id ?? null,
  );

  const byMerchant = useMemo(() => {
    const map = new Map<string, DataEntryProduct[]>();
    for (const product of products) {
      const bucket = map.get(product.merchantId) ?? [];
      bucket.push(product);
      map.set(product.merchantId, bucket);
    }
    return map;
  }, [products]);

  const selected = merchants.find((merchant) => merchant.id === selectedId);
  const selectedProducts = selectedId ? byMerchant.get(selectedId) ?? [] : [];

  return (
    <div className="data-entry">
      <section className="data-entry-merchants" aria-label="التجار">
        <header className="data-entry-head">
          <h2>التجار</h2>
          <span className="badge">{merchants.length}</span>
        </header>
        <ul className="data-entry-list">
          {merchants.map((merchant) => (
            <li key={merchant.id}>
              <button
                type="button"
                className={`data-entry-merchant${
                  merchant.id === selectedId ? " is-active" : ""
                }`}
                onClick={() => setSelectedId(merchant.id)}
              >
                <strong>{merchant.name}</strong>
                <span>
                  {merchant.cityName} · {merchant.vendorType}
                </span>
                <em>
                  {merchant.productCount} منتج · {merchant.publishedCount} منشور
                </em>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="data-entry-products" aria-label="المنتجات">
        <header className="data-entry-head">
          <h2>{selected ? selected.name : "اختر تاجراً"}</h2>
          <span className="badge">{selectedProducts.length} منتج</span>
        </header>

        {selectedProducts.length === 0 ? (
          <p className="data-entry-empty">لا توجد منتجات مسجّلة لهذا التاجر.</p>
        ) : (
          <ul className="data-entry-products-list">
            {selectedProducts.map((product) => (
              <li key={product.id}>
                <div>
                  <strong>{product.name}</strong>
                  <span dir="ltr">{product.sku || "—"}</span>
                </div>
                <span className={`badge ${product.stateTone}`}>
                  {product.stateLabel}
                </span>
                <strong className="data-entry-price" dir="ltr">
                  {formatPrice(product.price)}
                </strong>
              </li>
            ))}
          </ul>
        )}

        {selected ? (
          <Button
            size="sm"
            variant="quiet"
            onClick={() => setSelectedId(null)}
          >
            إغلاق التاجر
          </Button>
        ) : null}
      </section>
    </div>
  );
}

export function stateMeta(state: keyof typeof PRODUCT_STATE_META) {
  return PRODUCT_STATE_META[state];
}
