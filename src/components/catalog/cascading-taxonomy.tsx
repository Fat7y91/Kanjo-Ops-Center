"use client";

import { useMemo } from "react";

import { TaxonomyRequestButton } from "@/components/taxonomy/taxonomy-request-button";
import type {
  TaxonomyCategory,
  TaxonomyVariant,
  TaxonomyVendorType,
} from "@/lib/taxonomy/types";

type CascadingTaxonomyProps = {
  vendorTypeId: number | null;
  vendorTypes: TaxonomyVendorType[];
  categories: TaxonomyCategory[];
  variants: TaxonomyVariant[];
  categoryKey: string;
  attributes: Record<number, number[]>;
  showVariants?: boolean;
  onCategoryChange: (key: string) => void;
  onAttributesChange: (attributes: Record<number, number[]>) => void;
  disabled?: boolean;
};

/**
 * MDM-backed category + variant selector.
 *
 * Categories are strictly scoped to the merchant's `vendorType`; a category
 * that does not belong to that vendor type can never be submitted because the
 * server re-validates the pair. Variant attributes are only shown for variable
 * products and only offer active MDM options.
 */
export function CascadingTaxonomy({
  vendorTypeId,
  vendorTypes,
  categories,
  variants,
  categoryKey,
  attributes,
  showVariants = true,
  onCategoryChange,
  onAttributesChange,
  disabled = false,
}: CascadingTaxonomyProps) {
  const scopedCategories = useMemo(
    () =>
      vendorTypeId === null
        ? []
        : categories.filter(
            (category) =>
              category.vendorTypeId === vendorTypeId && category.active,
          ),
    [categories, vendorTypeId],
  );

  const scopedVariants = useMemo(
    () => variants.filter((variant) => variant.active),
    [variants],
  );

  const vendorType = vendorTypes.find((entry) => entry.id === vendorTypeId);

  function toggleOption(variantId: number, optionId: number) {
    const current = attributes[variantId] ?? [];
    const next = current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId];
    onAttributesChange({ ...attributes, [variantId]: next });
  }

  if (vendorTypeId === null) {
    return (
      <p className="cat-hint">
        اختر تاجراً أولاً لعرض التصنيفات والمتغيرات المتاحة.
      </p>
    );
  }

  return (
    <div className="cat-taxonomy">
      <div className="cat-field">
        <div className="cat-label-row">
          <span className="cat-label">
            التصنيف <span className="cat-required">مطلوب</span>
          </span>
          <TaxonomyRequestButton
            kind="category"
            vendorTypes={vendorTypes}
            vendorTypeId={vendorTypeId}
            label="طلب تصنيف جديد"
          />
        </div>

        {scopedCategories.length === 0 ? (
          <p className="cat-hint">
            لا توجد تصنيفات لهذا النوع ({vendorType?.name_ar ?? vendorTypeId}).
            أرسل طلب إضافة للمراجعة المركزية.
          </p>
        ) : (
          <select
            className="cat-input"
            value={categoryKey}
            onChange={(event) => onCategoryChange(event.target.value)}
            disabled={disabled}
            required
          >
            <option value="">اختر التصنيف…</option>
            {scopedCategories.map((category) => (
              <option key={category.key} value={category.key}>
                {category.name_ar}
                {category.name_en ? ` — ${category.name_en}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {showVariants ? (
        <div className="cat-field">
          <div className="cat-label-row">
            <span className="cat-label">المتغيرات</span>
            <TaxonomyRequestButton
              kind="variant"
              vendorTypes={vendorTypes}
              vendorTypeId={vendorTypeId}
              label="طلب متغير جديد"
            />
          </div>

          {scopedVariants.length === 0 ? (
            <p className="cat-hint">لا توجد متغيرات معتمدة في التصنيف المركزي.</p>
          ) : (
            <div className="cat-variant-list">
              {scopedVariants.map((variant) => {
                const selected = attributes[variant.variant_id] ?? [];
                return (
                  <div key={variant.variant_id} className="cat-variant-group">
                    <span className="cat-variant-name">{variant.name_ar}</span>
                    <div className="cat-variant-options">
                      {variant.options.map((option) => {
                        const active = selected.includes(option.option_id);
                        return (
                          <button
                            key={option.option_id}
                            type="button"
                            className={`cat-chip${active ? " is-active" : ""}`}
                            aria-pressed={active}
                            onClick={() =>
                              toggleOption(variant.variant_id, option.option_id)
                            }
                            disabled={disabled}
                          >
                            {option.option_name_ar}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
