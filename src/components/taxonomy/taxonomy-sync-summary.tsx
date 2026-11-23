"use client";

import type { TaxonomySyncSummary } from "@/lib/taxonomy/csv-sync/summary";

function List({ children }: { children: React.ReactNode }) {
  return <ul className="taxonomy-sync-list">{children}</ul>;
}

function ScrollList({ children }: { children: React.ReactNode }) {
  return (
    <div className="taxonomy-sync-scroll">
      <List>{children}</List>
    </div>
  );
}

/** Name-first receipt for a V1 taxonomy sync. Counts alone hide what changed. */
export function TaxonomySyncSummaryView({
  summary,
}: {
  summary: TaxonomySyncSummary;
}) {
  return (
    <div className="inline-note taxonomy-sync-report" role="status">
      <strong>اكتملت المزامنة</strong>

      {summary.createdVendorTypes.length > 0 ? (
        <section>
          <h4>
            أنواع التجار الجديدة ({summary.createdVendorTypes.length})
          </h4>
          <p>
            تم إنشاء {summary.createdVendorTypes.length} نوع تاجر:{" "}
            {summary.createdVendorTypes.map((row) => row.nameAr).join("، ")}
          </p>
          {summary.createdVendorTypes.length > 10 ? (
            <ScrollList>
              {summary.createdVendorTypes.map((row) => (
                <li key={row.id}>
                  {row.nameAr}
                  {row.nameEn ? ` (${row.nameEn})` : ""}
                </li>
              ))}
            </ScrollList>
          ) : null}
        </section>
      ) : null}

      {summary.vendorTypesUpdated > 0 ? (
        <section>
          <h4>أنواع التجار المحدّثة</h4>
          <p>تم تحديث {summary.vendorTypesUpdated} نوع تاجر موجود.</p>
        </section>
      ) : null}

      {summary.createdCategories.length > 0 ? (
        <section>
          <h4>التصنيفات الجديدة ({summary.createdCategories.length})</h4>
          <ScrollList>
            {summary.createdCategories.map((row, index) => (
              <li key={`${row.nameAr}-${index}`}>
                {row.nameAr}
                {row.vendorType ? ` (${row.vendorType})` : ""}
              </li>
            ))}
          </ScrollList>
        </section>
      ) : null}

      {summary.categoriesParsed > 0 || summary.updated > 0 ? (
        <section>
          <h4>ملخص التصنيفات</h4>
          <p>
            حُلّل {summary.categoriesParsed} تصنيفاً، وأُنشئ{" "}
            {summary.created}، وحُدّث {summary.updated}.
            {summary.duplicates > 0
              ? ` دُمج ${summary.duplicates} صف مكرر.`
              : ""}
            {summary.unresolvedParents > 0
              ? ` اعتُبر ${summary.unresolvedParents} تصنيفاً بلا أب في المستوى الأول.`
              : ""}
          </p>
        </section>
      ) : null}

      {summary.createdVariantGroups.length > 0 ||
      summary.createdVariantOptions.length > 0 ? (
        <section>
          <h4>المتغيرات والخيارات الجديدة</h4>
          {summary.createdVariantGroups.length > 0 ? (
            <>
              <p>المجموعات المنشأة:</p>
              <ScrollList>
                {summary.createdVariantGroups.map((row) => (
                  <li key={row.id}>
                    {row.nameAr}
                    {row.nameEn ? ` (${row.nameEn})` : ""}
                  </li>
                ))}
              </ScrollList>
            </>
          ) : null}
          {summary.createdVariantOptions.length > 0 ? (
            <>
              <p>الخيارات المنشأة:</p>
              <ScrollList>
                {summary.createdVariantOptions.map((row) => (
                  <li key={row.id}>
                    {row.nameAr}
                    {row.groupName ? ` — ${row.groupName}` : ""}
                  </li>
                ))}
              </ScrollList>
            </>
          ) : null}
        </section>
      ) : null}

      {summary.variantGroupsUpdated > 0 ||
      summary.variantOptionsUpdated > 0 ? (
        <section>
          <h4>المتغيرات المحدّثة</h4>
          <p>
            حُدّث {summary.variantGroupsUpdated} مجموعة
            {summary.variantDuplicates > 0
              ? `، ودُمج ${summary.variantDuplicates} صف مكرر`
              : ""}
            {summary.unresolvedVariantGroups > 0
              ? `، وتُخطّي ${summary.unresolvedVariantGroups} مجموعة بلا اسم`
              : ""}
            .
          </p>
        </section>
      ) : null}

      {summary.issues.length > 0 ? (
        <section>
          <h4>الصفوف المتخطاة ({summary.issues.length})</h4>
          <ScrollList>
            {summary.issues.map((issue, index) => (
              <li key={`${issue.file}-${issue.line}-${index}`}>
                <span dir="ltr">
                  {issue.file}:{issue.line}
                </span>{" "}
                — {issue.message}
              </li>
            ))}
          </ScrollList>
        </section>
      ) : null}
    </div>
  );
}
