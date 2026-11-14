"use client";

import { CatalogMerchantCard } from "@/components/catalog/catalog-merchant-card";
import { CatalogMerchantFilters } from "@/components/catalog/catalog-merchant-filters";
import { useCatalogDirectory } from "@/components/catalog/use-catalog-directory";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import type { CatalogMerchantCard as CatalogMerchantCardData } from "@/lib/catalog/merchants";

/**
 * Searchable merchant grid for the catalog home.
 *
 * Filtering is local because the page already ships every merchant in the
 * manager's city scope; there is no server round trip to debounce.
 */
export function CatalogDirectory({
  cards,
}: {
  cards: CatalogMerchantCardData[];
}) {
  const {
    query,
    setQuery,
    filter,
    setFilter,
    showEmpty,
    toggleEmpty,
    counts,
    visible,
  } = useCatalogDirectory(cards);

  return (
    <>
      <section className="toolbar-row cat-directory-toolbar">
        <CatalogMerchantFilters
          active={filter}
          counts={counts}
          onChange={setFilter}
        />
        <div className="cat-directory-actions">
          <Button
            size="sm"
            variant={showEmpty ? "quiet" : "accent"}
            aria-pressed={showEmpty}
            onClick={toggleEmpty}
          >
            {showEmpty
              ? "إخفاء التجار بدون منتجات"
              : "إظهار التجار بدون منتجات"}
          </Button>
          <TextField
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث بالتاجر أو المدينة أو التصنيف…"
            aria-label="بحث التجار"
            className="cat-directory-search"
          />
        </div>
      </section>

      <section className="card-grid cat-merchant-grid">
        {visible.map((card) => (
          <CatalogMerchantCard key={card.id} card={card} />
        ))}

        {visible.length === 0 ? (
          <p className="empty-state">
            {cards.length === 0
              ? "لا يوجد تجار في نطاق مدنك بعد."
              : "لا يوجد تاجر مطابق لهذا البحث أو الفلتر."}
          </p>
        ) : null}
      </section>
    </>
  );
}
