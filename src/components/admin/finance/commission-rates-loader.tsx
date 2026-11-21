"use client";

import { CommissionRatesView } from "@/components/admin/finance/commission-rates-view";
import { useEndpointData } from "@/components/data/use-endpoint-data";
import { ErrorPanel } from "@/components/ui/error-panel";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeletons";
import { commissionRatesPayloadSchema } from "@/lib/commissions/payload";

import type { CommissionRatesPayload } from "@/lib/commissions/payload";

/** Module-level so the hook's dependency list stays stable. */
const parsePayload = (input: unknown): CommissionRatesPayload =>
  commissionRatesPayloadSchema.parse(input);

/**
 * Commission rates island.
 *
 * The page shell enforces the clearance and capability gates; the schedule and
 * the city picker are fetched here so the Edge isolate no longer reads
 * `app.commission_rates` during SSR. When the finance database is not
 * configured the endpoint answers 503 and the island shows the same
 * "unavailable" notice the SSR page used to render.
 */
export function CommissionRatesLoader() {
  const { status, data, error, reload } = useEndpointData(
    "/api/admin/commission-rates",
    parsePayload,
  );

  const overrides = data ? data.rows.filter((row) => row.cityId !== null) : [];

  return (
    <>
      <PageHeader
        eyebrow="المالية"
        title="أسعار العمولات"
        description="رسوم تفعيل التاجر ورسم الصور والرسم الأساسي للتعاقد، بجدول افتراضي لكل المدن وتجاوزات خاصة بكل مدينة."
        actions={
          data ? (
            <span className="badge badge-gold">
              {overrides.length} تجاوز مدينة
            </span>
          ) : null
        }
      />

      {status === "loading" ? (
        <div aria-busy="true">
          <TableSkeleton rows={5} columns={5} />
        </div>
      ) : null}

      {status === "failed" ? (
        /غير متصل|503/.test(error.message) ? (
          <p className="commission-rates-unavailable">
            قاعدة البيانات المالية غير متصلة؛ لا يمكن عرض أسعار العمولات حالياً.
          </p>
        ) : (
          <ErrorPanel
            error={error}
            reset={reload}
            title="تعذر تحميل أسعار العمولات"
            description="لم تكتمل قراءة جدول الأسعار. أعد المحاولة دون مغادرة الصفحة."
          />
        )
      ) : null}

      {status === "ready" ? (
        <CommissionRatesView
          cities={data.cities}
          initialSnapshot={{ active: data.active, rows: data.rows }}
        />
      ) : null}
    </>
  );
}
