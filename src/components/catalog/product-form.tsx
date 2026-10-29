"use client";

import { useMemo } from "react";

import { BarcodeScanner } from "@/components/catalog/barcode-scanner";
import { Button } from "@/components/ui/button";
import { CascadingTaxonomy } from "@/components/catalog/cascading-taxonomy";
import { MerchantPicker, type CatalogMerchantOption } from "@/components/catalog/merchant-picker";
import { ProductImageField } from "@/components/catalog/product-image-field";
import { VariantMatrix } from "@/components/catalog/variant-matrix";
import {
  TextAreaField,
  TextField,
  ToggleField,
} from "@/components/ui/form-inputs";
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
        <TextField
          id="cat-name"
          label="اسم المنتج"
          required
          value={values.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="مثال: زيت زيتون عضوي 1 لتر"
          maxLength={140}
          disabled={locked}
        />

        <TextAreaField
          id="cat-description"
          label="الوصف"
          value={values.description}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="وصف مختصر للمنتج (اختياري)"
          rows={3}
          maxLength={2000}
          disabled={locked}
        />

        <div className="cat-form-grid">
          <div className="cat-field">
            <ToggleField
              label="منتج متغير"
              hint={`${
                PRODUCT_TYPE_META[
                  values.productType as CatalogProductType
                ].description
              }`}
              checked={isVariable}
              disabled={locked}
              onChange={(next) =>
                onChange({ productType: next ? "variable" : "simple" })
              }
            />
          </div>

          {isVariable ? null : (
            <TextField
              id="cat-price"
              label="السعر (ج.م)"
              required
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={values.price}
              onChange={(event) => onChange({ price: event.target.value })}
              placeholder="0"
              disabled={locked}
            />
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
        <Button variant="quiet" onClick={onCancel} disabled={submitting}>
          إلغاء
        </Button>
        <div className="cat-actions-primary">
          <Button
            variant="quiet"
            onClick={() => onSave("another")}
            disabled={locked}
          >
            حفظ وإضافة منتج آخر
          </Button>
          <Button type="submit" variant="primary" disabled={locked}>
            حفظ وإغلاق
          </Button>
        </div>
      </div>
    </form>
  );
}
