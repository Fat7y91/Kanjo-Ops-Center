"use client";

import { useEffect, useState } from "react";

import { CatalogImage } from "@/components/catalog/catalog-image";
import {
  AsyncCombobox,
  type AsyncComboboxOption,
} from "@/components/ui/async-combobox";
import { useDebouncedValue } from "@/components/ui/use-debounced-value";
import { formatPrice } from "@/lib/catalog/format";
import type { MasterCatalogItem } from "@/lib/catalog/master-catalog-search";

type MasterCatalogComboProps = {
  id?: string;
  value: string;
  onChange: (name: string) => void;
  onSelect: (item: MasterCatalogItem) => void;
  disabled?: boolean;
};

/**
 * Supermarket-only product name field backed by the V1 master catalog.
 *
 * Typing still behaves like a normal text input: the API only supplies
 * suggestions. Picking a suggestion hands the whole row to the form so name,
 * description, price, image and category can be filled together.
 */
export function MasterCatalogCombo({
  id,
  value,
  onChange,
  onSelect,
  disabled = false,
}: MasterCatalogComboProps) {
  const [items, setItems] = useState<MasterCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const query = useDebouncedValue(value.trim(), 300);

  useEffect(() => {
    if (disabled || query.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);

    fetch(
      `/api/catalog/master?q=${encodeURIComponent(query)}&limit=20`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) return { items: [] as MasterCatalogItem[] };
        return (await response.json()) as { items?: MasterCatalogItem[] };
      })
      .then((payload) => {
        if (active) setItems(payload.items ?? []);
      })
      .catch(() => {
        if (active) setItems([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [disabled, query]);

  const options: AsyncComboboxOption[] = items.map((item) => ({
    value: item.id,
    label: item.name,
    hint: [item.categoryLabel, formatPrice(item.price)]
      .filter(Boolean)
      .join(" · "),
    image: item.driveFileId || item.imageUrl,
  }));

  return (
    <AsyncCombobox
      id={id}
      label="اسم المنتج"
      required
      value={value}
      onValueChange={onChange}
      onSelect={(option) => {
        const item = items.find((candidate) => candidate.id === option.value);
        if (item) onSelect(item);
      }}
      options={options}
      loading={loading}
      placeholder="اكتب اسم المنتج أو اختر من الكتالوج المرجعي…"
      emptyLabel="اكتب حرفين على الأقل للبحث في الكتالوج المرجعي."
      noResultsLabel="لا يوجد منتج مطابق في الكتالوج المرجعي."
      hint="اختيار منتج من الكتالوج يعبّئ الاسم والسعر والصورة تلقائياً، وكل الحقول قابلة للتعديل."
      disabled={disabled}
      renderLeading={(option) =>
        option.image ? (
          <CatalogImage
            src={option.image}
            alt=""
            className="cat-combo-thumb"
            loading="lazy"
          />
        ) : (
          <span className="cat-combo-empty" aria-hidden="true" />
        )
      }
    />
  );
}
