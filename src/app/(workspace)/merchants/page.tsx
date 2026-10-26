import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { listCities, listMerchants } from "@/lib/field-ops/store";
import { CONTRACT_STATE_META, teamLabel } from "@/lib/field-ops/types";
import { smartTextScore } from "@/lib/search/normalize";

export const dynamic = "force-dynamic";

type MerchantsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function MerchantsPage({
  searchParams,
}: MerchantsPageProps) {
  const session = await requirePermission("view_merchants");
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const cityMap = new Map(listCities().map((city) => [city.id, city]));
  const allowedCities = new Set(effectiveCityIds(session));
  const scoped = listMerchants().filter((merchant) =>
    allowedCities.has(merchant.cityId),
  );
  const merchants =
    query.length > 0
      ? scoped
          .map((merchant) => ({
            merchant,
            score: smartTextScore(query, merchant.name).score,
          }))
          .filter((entry) => entry.score > 0)
          .sort((left, right) => right.score - left.score)
          .map((entry) => entry.merchant)
      : scoped;

  return (
    <>
      <PageHeader
        eyebrow="عمليات التجار"
        title="دليل التجار"
        description="الملكية وحالة دورة الحياة والبيانات التجارية لكل تاجر على الشبكة. افتح الملف لإدارة المستندات والنتائج وعمليات النقل."
        actions={<span className="badge">{merchants.length} تاجر</span>}
      />

      <section className="panel">
        <form className="table-toolbar" action="/merchants" method="get">
          <div className="search-shell">
            <span>بحث</span>
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="اسم التاجر أو الإملاء العربي أو خطأ إملائي"
              aria-label="البحث عن التجار"
            />
          </div>
          <button type="submit" className="button button-quiet">
            بحث
          </button>
        </form>

        <div className="table-wrap w-full overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>التاجر</th>
                <th>المدينة</th>
                <th>الفريق المالك</th>
                <th>الحالة</th>
                <th>العمولة</th>
                <th className="align-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((merchant) => {
                const meta = CONTRACT_STATE_META[merchant.contractState];
                return (
                  <tr key={merchant.id}>
                    <td>
                      <Link href={`/merchants/${merchant.id}`}>
                        <strong>{merchant.name}</strong>
                      </Link>
                      <span className="muted merchant-category">
                        {merchant.category}
                      </span>
                    </td>
                    <td>{cityMap.get(merchant.cityId)?.name ?? "—"}</td>
                    <td>
                      <span className="chip chip-team">
                        {teamLabel(merchant.team)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${meta.tone}`}>{meta.label}</span>
                    </td>
                    <td>
                      {new Intl.NumberFormat("ar-EG", {
                        style: "currency",
                        currency: "EGP",
                        maximumFractionDigits: 0,
                      }).format(merchant.commissionAmount)}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link
                          href={`/merchants/${merchant.id}`}
                          className="button button-small button-quiet"
                        >
                          فتح الملف
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {merchants.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <p className="empty-state">
                      لا يوجد تاجر مطابق لـ «{query}». جرّب إملاءً أقصر.
                    </p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
