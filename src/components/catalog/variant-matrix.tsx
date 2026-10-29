"use client";

import { useMemo } from "react";

import { InputControl } from "@/components/ui/form-inputs";
import {
  MAX_VARIANT_COMBINATIONS,
  combinationName,
  combinationSku,
  type VariantCombination,
} from "@/lib/catalog/variants";

type VariantMatrixProps = {
  baseName: string;
  priceLabel: string;
  combinations: VariantCombination[];
  prices: Record<string, string>;
  skuSeed: string;
  vendorTypeId: number | null;
  disabled?: boolean;
  onPriceChange: (key: string, value: string) => void;
};

/**
 * Read-only name + SKU, editable price.
 *
 * The matrix is derived state: every row exists because the rep selected
 * option chips above, so the only input the rep owns here is the price.
 */
export function VariantMatrix({
  baseName,
  priceLabel,
  combinations,
  prices,
  skuSeed,
  vendorTypeId,
  disabled = false,
  onPriceChange,
}: VariantMatrixProps) {
  const rows = useMemo(
    () =>
      combinations.map((combination, index) => ({
        key: combination.key,
        name: combinationName(baseName, combination.label),
        sku: combinationSku(vendorTypeId, skuSeed, index),
        price: prices[combination.key] ?? "",
      })),
    [baseName, combinations, prices, skuSeed, vendorTypeId],
  );

  if (combinations.length === 0) {
    return (
      <p className="cat-hint">
        اختر خياراً واحداً على الأقل من المتغيرات أعلاه لتوليد جدول التركيبات.
      </p>
    );
  }

  return (
    <div className="cat-matrix">
      <div className="cat-matrix-head">
        <span className="cat-matrix-title">
          تركيبات المتغيرات
          <span className="cat-matrix-count">{rows.length}</span>
        </span>
        <span className="cat-hint">أدخل السعر فقط — الاسم و SKU يُولّدان تلقائياً.</span>
      </div>

      {rows.length >= MAX_VARIANT_COMBINATIONS ? (
        <p className="cat-hint cat-matrix-cap">
          تم بلوغ الحد الأقصى ({MAX_VARIANT_COMBINATIONS} تركيبة). قلّل الخيارات
          المحددة لإظهار الباقي.
        </p>
      ) : null}

      <div className="cat-matrix-scroll">
        <table className="cat-matrix-table">
          <thead>
            <tr>
              <th scope="col">اسم التركيبة</th>
              <th scope="col">SKU</th>
              <th scope="col">{priceLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const inputId = `cat-matrix-price-${index}`;
              return (
                <tr key={row.key}>
                  <td className="cat-matrix-name">{row.name}</td>
                  <td>
                    <code className="cat-matrix-sku">{row.sku}</code>
                  </td>
                  <td>
                    <InputControl
                      id={inputId}
                      className="cat-matrix-price py-1.5 text-xs"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={row.price}
                      onChange={(event) =>
                        onPriceChange(row.key, event.target.value)
                      }
                      placeholder="0"
                      aria-label={`سعر ${row.name}`}
                      disabled={disabled}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
