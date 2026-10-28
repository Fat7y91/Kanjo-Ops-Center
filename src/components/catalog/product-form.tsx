"use client";

import { useMemo } from "react";

import { BarcodeScanner } from "@/components/catalog/barcode-scanner";
import { CascadingTaxonomy } from "@/components/catalog/cascading-taxonomy";
import { MerchantPicker, type CatalogMerchantOption } from "@/components/catalog/merchant-picker";
import { ProductImageField } from "@/components/catalog/product-image-field";
import { VariantMatrix } from "@/components/catalog/variant-matrix";
import {
  PRODUCT_TYPE_META,
  type CatalogProductType,
} from "@/lib/catalog/types";
import { buildVariantCombinations } from "@/lib/catalog/variants";
import type {
  TaxonomyCategory,
  TaxonomyVariant,
  TaxonomyVendorType,
} from "@/lib/taxonomy/types";

export type ProductFormValues = {
  name: string;
  description: string;
  merchant: CatalogMerchantOption | null;
  productType: CatalogProductType;
  categoryKey: string;
  price: string;
  sku: string;
  imageDataUrl: string | null;
  attributes: Record<number, number[]>;
  /** Price per generated combination, keyed by `VariantCombination.key`. */
  variantPrices: Record<string, string>;
  /** Stable SKU family for every row of the matrix. */
  skuSeed: string;
};

type ProductFormProps = {
  values: ProductFormValues;
  merchants: CatalogMerchantOption[];
  vendorTypes: TaxonomyVendorType[];
  categories: TaxonomyCategory[];
  variants: TaxonomyVariant[];
  disabled?: boolean;
  onChange: (patch: Partial<ProductFormValues>) => void;
  onMerchantChange: (merchant: CatalogMerchantOption | null) => void;
  onSave: (mode: "close" | "another") => void;
  onCancel: () => void;
  error?: string;
  submitting?: boolean;
};

/**
 * Product entry body: merchant → taxonomy → details.
 *
 * Two submit buttons drive the continuous-entry loop. The parent keeps merchant
 * selection across "save and add another", so this component stays controlled
 * and stateless about persistence.
 */
export function ProductForm({
  values,
  merchants,
  vendorTypes,
  categories,
  variants,
  disabled = false,
  onChange,
  onMerchantChange,
  onSave,
  onCancel,
  error,
  submitting = false,
}: ProductFormProps) {
  const locked = disabled || submitting;
  const isVariable = values.productType === "variable";
  const combinations = useMemo(
    () =>
      isVariable
        ? buildVariantCombinations({
            attributes: values.attributes,
            variants,
          })
        : [],
    [isVariable, values.attributes, variants],
  );

  return (
    <form
      className="cat-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave("close");
      }}
    >
      <section className="cat-block">
        <div className="cat-field">
          <span className="cat-label">التاجر</span>
          <MerchantPicker
            merchants={merchants}
            value={values.merchant?.id ?? ""}
            onChange={onMerchantChange}
            disabled={locked}
          />
        </div>
      </section>

      <section className="cat-block">
        <div className="cat-field">
          <label className="cat-label" htmlFor="cat-name">
            اسم المنتج <span className="cat-required">مطلوب</span>
          </label>
          <input
            id="cat-name"
            className="cat-input"
            value={values.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="مثال: زيت زيتون عضوي 1 لتر"
            maxLength={140}
            required
            disabled={locked}
          />
        </div>

        <div className="cat-field">
          <label className="cat-label" htmlFor="cat-description">
            الوصف
          </label>
          <textarea
            id="cat-description"
            className="cat-input cat-textarea"
            value={values.description}
            onChange={(event) => onChange({ description: event.target.value })}
            placeholder="وصف مختصر للمنتج (اختياري)"
            rows={3}
            maxLength={2000}
            disabled={locked}
          />
        </div>

        <div className="cat-form-grid">
          <div className="cat-field">
            <span className="cat-label">نوع المنتج</span>
            <div className="cat-segmented" role="group" aria-label="نوع المنتج">
              {(["simple", "variable"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`cat-segment${
                    values.productType === type ? " is-active" : ""
                  }`}
                  aria-pressed={values.productType === type}
                  onClick={() => onChange({ productType: type })}
                  disabled={locked}
                >
                  {PRODUCT_TYPE_META[type].label}
                </button>
              ))}
            </div>
          </div>

          {isVariable ? null : (
            <div className="cat-field">
              <label className="cat-label" htmlFor="cat-price">
                السعر (ج.م) <span className="cat-required">مطلوب</span>
              </label>
              <input
                id="cat-price"
                className="cat-input"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={values.price}
                onChange={(event) => onChange({ price: event.target.value })}
                placeholder="0"
                required
                disabled={locked}
              />
            </div>
          )}
        </div>
      </section>

      <section className="cat-block">
        <CascadingTaxonomy
          vendorTypeId={values.merchant?.vendorTypeId ?? null}
          vendorTypes={vendorTypes}
          categories={categories}
          variants={isVariable ? variants : []}
          categoryKey={values.categoryKey}
          attributes={values.attributes}
          showVariants={isVariable}
          onCategoryChange={(categoryKey) => onChange({ categoryKey })}
          onAttributesChange={(attributes) => onChange({ attributes })}
          disabled={locked}
        />

        {isVariable ? (
          <VariantMatrix
            baseName={values.name}
            priceLabel="السعر (ج.م)"
            combinations={combinations}
            prices={values.variantPrices}
            skuSeed={values.skuSeed}
            vendorTypeId={values.merchant?.vendorTypeId ?? null}
            onPriceChange={(key, value) =>
              onChange({
                variantPrices: { ...values.variantPrices, [key]: value },
              })
            }
            disabled={locked}
          />
        ) : null}
      </section>

      <section className="cat-block">
        {isVariable ? (
          <p className="cat-hint">
            كل تركيبة تحصل على SKU تلقائي مستقل، فلا حاجة لمسح باركود هنا.
          </p>
        ) : (
          <BarcodeScanner
            value={values.sku}
            onChange={(sku) => onChange({ sku })}
            disabled={locked}
          />
        )}

        <ProductImageField
          value={values.imageDataUrl}
          onChange={(imageDataUrl) => onChange({ imageDataUrl })}
          disabled={locked}
        />
      </section>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="cat-actions">
        <button
          type="button"
          className="button button-quiet"
          onClick={onCancel}
          disabled={submitting}
        >
          إلغاء
        </button>
        <div className="cat-actions-primary">
          <button
            type="button"
            className="button button-quiet"
            onClick={() => onSave("another")}
            disabled={locked}
          >
            حفظ وإضافة منتج آخر
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={locked}
          >
            حفظ وإغلاق
          </button>
        </div>
      </div>
    </form>
  );
}
