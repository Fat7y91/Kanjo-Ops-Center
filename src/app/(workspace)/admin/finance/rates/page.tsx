import { CommissionRatesView } from "@/components/admin/finance/commission-rates-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireMinClearance } from "@/lib/auth/guard";
import {
  activeRateForCity,
  toCityCommissionRate,
} from "@/lib/commissions/rates";
import {
  isCommissionRatesDatabaseConfigured,
  listCommissionRateRows,
} from "@/lib/commissions/repository";
import { listCities } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** Rank-gated like the SQL policies: `app.has_min_clearance(4)`. */
const FINANCE_CLEARANCE = 4;

export default async function FinanceRatesPage() {
  await requireMinClearance(FINANCE_CLEARANCE);

  const cities = listCities().map((city) => ({
    id: city.id,
    name: city.name,
    governorate: city.governorate,
  }));

  // Degrade, never crash: while the ERP schema is being migrated the read can
  // fail transiently, so the page renders the "unavailable" state instead of
  // surfacing the repository error as a 500.
  let rows: ReturnType<typeof toCityCommissionRate>[] | null = null;
  try {
    rows = isCommissionRatesDatabaseConfigured()
      ? ((await listCommissionRateRows()) ?? []).map(toCityCommissionRate)
      : null;
  } catch {
    rows = null;
  }

  const overrides = rows ? rows.filter((row) => row.cityId !== null) : [];

  return (
    <>
      <PageHeader
        eyebrow="المالية"
        title="أسعار العمولات"
        description="رسوم تفعيل التاجر ورسم الصور والرسم الأساسي للتعاقد، بجدول افتراضي لكل المدن وتجاوزات خاصة بكل مدينة."
        actions={
          <span className="badge badge-gold">
            {overrides.length} تجاوز مدينة
          </span>
        }
      />

      {rows === null ? (
        <p className="commission-rates-unavailable">
          قاعدة البيانات المالية غير متصلة؛ لا يمكن عرض أسعار العمولات حالياً.
        </p>
      ) : (
        <CommissionRatesView
          cities={cities}
          initialSnapshot={{ active: activeRateForCity(rows, null), rows }}
        />
      )}
    </>
  );
}
