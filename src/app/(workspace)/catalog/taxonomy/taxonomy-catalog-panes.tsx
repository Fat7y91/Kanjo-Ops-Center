"use client";

import type {
  TaxonomyCategory,
  TaxonomyVariant,
  TaxonomyVendorType,
} from "@/lib/taxonomy/types";

/**
 * Read-only catalog panes: vendor types, categories and variants.
 *
 * Split out of the container so the center file only owns tab state, the
 * request queue and the sync modal. These panes render reference data that the
 * central dashboard sheet owns; they never offer a direct create action.
 */

type VendorTypesPaneProps = {
  vendorTypes: TaxonomyVendorType[];
  requestButton: React.ReactNode;
};

export function VendorTypesPane({
  vendorTypes,
  requestButton,
}: VendorTypesPaneProps) {
  return (
    <div className="taxonomy-pane">
      <div className="panel-head compact">
        <div>
          <p className="eyebrow">المصدر المركزي</p>
          <h2>أنواع التجار المعتمدة</h2>
        </div>
        {requestButton}
      </div>
      <div className="table-wrap w-full overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Dashboard ID</th>
              <th>الاسم العربي</th>
              <th>الاسم الإنجليزي</th>
              <th>المصدر</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {vendorTypes
              .slice()
              .sort((left, right) => left.id - right.id)
              .map((vendor) => (
                <tr key={vendor.id}>
                  <td>
                    <span className="taxonomy-id">{vendor.id}</span>
                  </td>
                  <td>
                    <strong>{vendor.name_ar}</strong>
                  </td>
                  <td className="muted">{vendor.name_en || "—"}</td>
                  <td>
                    <span className="badge">
                      {vendor.source === "dashboard"
                        ? "لوحة المستهلك"
                        : "طلب معتمد"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${vendor.active ? "badge-green" : "badge-red"}`}
                    >
                      {vendor.active ? "نشط" : "موقوف"}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type CategoriesPaneProps = {
  categories: TaxonomyCategory[];
  vendorTypes: TaxonomyVendorType[];
  vendorTypeMap: Map<number, TaxonomyVendorType>;
  vendorFilter: number | "all";
  query: string;
  onVendorFilter: (value: number | "all") => void;
  onQuery: (value: string) => void;
  requestButton: React.ReactNode;
};

export function CategoriesPane({
  categories,
  vendorTypes,
  vendorTypeMap,
  vendorFilter,
  query,
  onVendorFilter,
  onQuery,
  requestButton,
}: CategoriesPaneProps) {
  return (
    <div className="taxonomy-pane">
      <div className="panel-head compact">
        <div>
          <p className="eyebrow">شجرة التصنيفات</p>
          <h2>التصنيفات داخل نطاق نوع التاجر</h2>
        </div>
        {requestButton}
      </div>
      <div className="table-toolbar">
        <label className="field field-inline">
          <span>نوع التاجر</span>
          <select
            value={vendorFilter}
            onChange={(event) =>
              onVendorFilter(
                event.target.value === "all" ? "all" : Number(event.target.value),
              )
            }
          >
            <option value="all">كل الأنواع</option>
            {vendorTypes
              .slice()
              .sort((left, right) => left.id - right.id)
              .map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name_ar} (ID: {vendor.id})
                </option>
              ))}
          </select>
        </label>
        <div className="search-shell">
          <span>بحث</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="اسم التصنيف أو معرّفه"
            aria-label="البحث في التصنيفات"
          />
        </div>
      </div>
      <div className="table-wrap w-full overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Dashboard ID</th>
              <th>التصنيف</th>
              <th>نوع التاجر</th>
              <th>الأصل</th>
              <th>الترتيب</th>
              <th>المصدر</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.key}>
                <td>
                  <span className="taxonomy-id">{category.id}</span>
                </td>
                <td>
                  <strong>{category.name_ar}</strong>
                  {category.name_en ? (
                    <span className="muted merchant-category">
                      {category.name_en}
                    </span>
                  ) : null}
                </td>
                <td>
                  {vendorTypeMap.get(category.vendorTypeId)?.name_ar ??
                    `نوع ${category.vendorTypeId}`}
                </td>
                <td className="muted">
                  {category.parentId != null ? category.parentId : "جذر"}
                </td>
                <td>{category.sortOrder}</td>
                <td>
                  <span className="badge">
                    {category.source === "dashboard"
                      ? "لوحة المستهلك"
                      : "طلب معتمد"}
                  </span>
                </td>
              </tr>
            ))}
            {categories.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <p className="empty-state">لا توجد تصنيفات مطابقة.</p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type VariantsPaneProps = {
  variants: TaxonomyVariant[];
  requestButton: React.ReactNode;
};

export function VariantsPane({ variants, requestButton }: VariantsPaneProps) {
  return (
    <div className="taxonomy-pane">
      <div className="panel-head compact">
        <div>
          <p className="eyebrow">خصائص المنتجات</p>
          <h2>مجموعات المتغيرات وخياراتها</h2>
        </div>
        {requestButton}
      </div>
      <div className="taxonomy-variant-grid">
        {variants
          .slice()
          .sort((left, right) => left.variant_id - right.variant_id)
          .map((variant) => (
            <article key={variant.variant_id} className="taxonomy-variant-card">
              <div className="taxonomy-request-head">
                <div>
                  <span className="taxonomy-id">{variant.variant_id}</span>
                  <h3>{variant.name_ar}</h3>
                  {variant.name_en ? (
                    <p className="muted">{variant.name_en}</p>
                  ) : null}
                </div>
                <span className="badge">{variant.options.length} خيار</span>
              </div>
              <ul className="taxonomy-option-list">
                {variant.options.map((option) => (
                  <li key={`${variant.variant_id}-${option.option_id}`}>
                    <span className="taxonomy-id taxonomy-id-small">
                      {option.option_id}
                    </span>
                    <span>{option.option_name_ar}</span>
                    {option.aliases.length > 0 ? (
                      <span className="muted">({option.aliases.join("، ")})</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </article>
          ))}
      </div>
    </div>
  );
}
