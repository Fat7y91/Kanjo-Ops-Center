"use client";

import { InputControl } from "@/components/ui/form-inputs";
import type { HydratedVariantCombination } from "@/lib/catalog/services/variant-service";

type VariantMatrixProps = {
  /** Attribute group labels the rep selected, e.g. ["الحجم", "الطعم"]. */
  selectedAttributes: string[];
  /** Fully hydrated rows: name + SKU already resolved by the business layer. */
  rows: HydratedVariantCombination[];
  /** Row cap supplied by the caller; only used for the cap hint. */
  limit: number;
  priceLabel: string;
  /** Raw price strings keyed by row key. */
  prices: Record<string, string>;
  disabled?: boolean;
  onPriceChange: (key: string, value: string) => void;
};

/**
 * Dumb presentation grid for generated variant combinations.
 *
 * Every row is derived state produced by the service layer, so the rep owns
 * exactly one input here: the price. This component performs no domain
 * calculation and dispatches price edits upward unchanged.
 */
export function VariantMatrix({
  selectedAttributes,
  rows,
  limit,
  priceLabel,
  prices,
  disabled = false,
  onPriceChange,
}: VariantMatrixProps) {
  if (rows.length === 0) {
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
        <span className="cat-hint">
          {selectedAttributes.length > 0
            ? `الخصائص: ${selectedAttributes.join(" · ")} — أدخل السعر فقط.`
            : "أدخل السعر فقط — الاسم و SKU يُولّدان تلقائياً."}
        </span>
      </div>

      {rows.length >= limit ? (
        <p className="cat-hint cat-matrix-cap">
          تم بلوغ الحد الأقصى ({limit} تركيبة). قلّل الخيارات المحددة لإظهار
          الباقي.
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
                      value={prices[row.key] ?? ""}
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
